"""Phase 3/4 runtime wiring: v2 swarm training + lifecycle loop + memory paging exposed as server-friendly trainer API."""
from __future__ import annotations

import asyncio
import random
import time
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple

import torch

from config import (
    BATCH_SIZE,
    CHECKPOINT_DIR,
    COSMIC_CYCLE_STEPS,
    CPU_NANO_BUDGET_MB,
    D_MODEL,
    DEFAULT_HIDDEN_DIM,
    DEFAULT_NANOS_PER_LAYER,
    DEFAULT_TOP_K,
    GPU_NANO_BUDGET_MB,
    N_HEADS,
    N_LAYERS,
    SEQ_LEN,
    VOCAB_SIZE,
)
from core.chromatic_index import ChromaticIndex
from core.swarm_model import NanoSeaModel
from core.touch_tensor import TouchTensor
from lifecycle import (
    AbsularityDetector,
    CompressionEngine,
    CosmicCycleManager,
    DepositStore,
    FitnessEvaluator,
    NanoSpawner,
)
from memory.paging import NanoMemoryManager
from memory.deposit_prefetch import DepositAwarePrefetcher
from training.swarm_trainer import SwarmTrainer


class SwarmRuntime:
    """
    Server-facing runtime wrapper for v2 stack.

    Exposes a trainer-like API expected by server routes:
    - `start()/stop()`
    - `add_observation()`
    - `status` property
    - `get_checkpoint_info()`
    - `generate_text()`
    """

    def __init__(
        self,
        batch_size: int = BATCH_SIZE,
        seq_len: int = SEQ_LEN,
        training_interval: float = 5.0,
        cycle_steps: int = COSMIC_CYCLE_STEPS,
        checkpoint_every: int = 200,
    ):
        self.batch_size = batch_size
        self.seq_len = seq_len
        self.training_interval = training_interval
        self.cycle_steps = cycle_steps
        self.checkpoint_every = checkpoint_every

        self.model = NanoSeaModel(
            vocab_size=VOCAB_SIZE,
            d_model=D_MODEL,
            n_heads=N_HEADS,
            n_layers=N_LAYERS,
            nanos_per_layer=DEFAULT_NANOS_PER_LAYER,
            nano_hidden_dim=DEFAULT_HIDDEN_DIM,
            top_k=DEFAULT_TOP_K,
        )
        self.trainer = SwarmTrainer(self.model)

        self.touch_tensor = TouchTensor(num_nanos=self.model.total_nanos)
        self.fitness = FitnessEvaluator()
        self.spawner = NanoSpawner()
        self.compressor = CompressionEngine()
        self.detector = AbsularityDetector()
        self.deposit_store = DepositStore(store_dir=str(Path(CHECKPOINT_DIR) / "deposits_v2"))
        self.cycle = CosmicCycleManager(
            model=self.model,
            spawner=self.spawner,
            compressor=self.compressor,
            detector=self.detector,
            deposit_store=self.deposit_store,
            fitness_eval=self.fitness,
        )

        # ── Phase 4: memory paging subsystem ──────────────────────────
        nano_ckpt_dir = str(Path(CHECKPOINT_DIR) / "nano_pages")
        self.memory_manager = NanoMemoryManager(
            gpu_budget_mb=GPU_NANO_BUDGET_MB,
            cpu_budget_mb=CPU_NANO_BUDGET_MB,
            checkpoint_dir=nano_ckpt_dir,
        )
        # Build spatial index and deposit-aware prefetcher
        self.chromatic_index = ChromaticIndex()
        self._rebuild_chromatic_index()
        index_to_id = self._build_nano_id_map()
        self.prefetcher = DepositAwarePrefetcher(
            chromatic_index=self.chromatic_index,
            deposit_store=self.deposit_store,
            index_to_id=index_to_id,
            d_model=D_MODEL,
        )

        self._buffer: Deque[Tuple[str, str, str, float]] = deque(maxlen=50_000)
        self._running = False
        self._task: Optional[asyncio.Task] = None

        self._total_steps = 0
        self._trained_batches = 0
        self._last_loss: Optional[float] = None
        self._last_ce: Optional[float] = None
        self._last_entropy: Optional[float] = None
        self._last_phase: str = self.cycle.phase
        self._last_checkpoint: Optional[Path] = None

        self._checkpoint_dir = Path(CHECKPOINT_DIR) / "swarm_v2"
        self._checkpoint_dir.mkdir(parents=True, exist_ok=True)

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._total_steps > 0:
            self._save_checkpoint("shutdown")
        # Phase 4: flush all paged nanos to disk on graceful stop
        self.memory_manager.evict_all_to_disk()

    def add_observation(self, query: str, response: str, source: str = "api", quality: float = 0.8):
        self._buffer.append((query or "", response or "", source, float(quality)))

    async def train_once(self) -> bool:
        if len(self._buffer) < max(2, self.batch_size):
            return False

        batch = random.sample(list(self._buffer), k=min(self.batch_size, len(self._buffer)))
        input_ids, target_ids = self._make_batch(batch)

        # Phase 4: prefetch nanos predicted to activate for this batch
        try:
            self.prefetcher.prefetch_for_batch(
                input_ids, self.model.embedding, self.memory_manager
            )
        except Exception:
            pass  # prefetch failure must never abort training

        out = self.trainer.train_step(input_ids, target_ids)
        self._trained_batches += 1
        self._total_steps += 1

        self._last_loss = out["loss"]
        self._last_ce = out["ce_loss"]
        self._last_entropy = out["router_entropy"]

        self.touch_tensor.resize(self.model.total_nanos)
        self.touch_tensor.update(out["touch_events"])
        self.fitness.evaluate_all(self.model, self.touch_tensor)

        if self._total_steps % max(1, self.cycle_steps) == 0:
            phase = self.cycle.step(
                self.trainer,
                self.touch_tensor,
                val_loss=max(1e-6, out["ce_loss"]),
                router_entropy=out["router_entropy"],
            )
            self._last_phase = phase
            # Phase 4: rebuild spatial index and nano-id map after lifecycle changes
            self._rebuild_chromatic_index()
            self.prefetcher.update_index_map(self._build_nano_id_map())

        if self._total_steps % max(1, self.checkpoint_every) == 0:
            self._save_checkpoint("periodic")

        return True

    async def _loop(self):
        while self._running:
            try:
                await self.train_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(self.training_interval)

    def _make_batch(self, batch: List[Tuple[str, str, str, float]]) -> Tuple[torch.Tensor, torch.Tensor]:
        inputs: List[torch.Tensor] = []
        targets: List[torch.Tensor] = []

        for query, response, _, _ in batch:
            text = (query + "\n" + response).strip() or "empty"
            ids = self._text_to_ids(text, self.seq_len + 1)
            inputs.append(ids[:-1])
            targets.append(ids[1:])

        return torch.stack(inputs, dim=0), torch.stack(targets, dim=0)

    def _text_to_ids(self, text: str, length: int) -> torch.Tensor:
        values = list(text.encode("utf-8", errors="ignore"))
        if not values:
            values = [0]
        token_ids = [int(v) % VOCAB_SIZE for v in values[:length]]
        if len(token_ids) < length:
            token_ids.extend([0] * (length - len(token_ids)))
        return torch.tensor(token_ids, dtype=torch.long)

    def _ids_to_text(self, ids: torch.Tensor) -> str:
        arr = ids.detach().cpu().tolist()
        chars = []
        for token in arr:
            token = int(token) % 256
            if 32 <= token < 127:
                chars.append(chr(token))
            elif token in (10, 13):
                chars.append("\n")
            else:
                chars.append(" ")
        return "".join(chars).strip() or "(no output)"

    @torch.no_grad()
    def generate_text(self, prompt: str, max_new_tokens: int = 64) -> str:
        seed = self._text_to_ids(prompt or "hello", min(self.seq_len, 64)).unsqueeze(0)
        generated = self.model.generate(seed, max_new_tokens=max_new_tokens)
        return self._ids_to_text(generated[0][-max_new_tokens:])

    @property
    def status(self) -> Dict:
        mem_stats = self.memory_manager.cache_stats()
        return {
            "running": self._running,
            "status": "running" if self._running else "stopped",
            "trainer": "swarm_v2",
            "buffer_size": len(self._buffer),
            "total_steps": self._total_steps,
            "trained_batches": self._trained_batches,
            "last_loss": self._last_loss,
            "last_ce_loss": self._last_ce,
            "last_router_entropy": self._last_entropy,
            "cycle_phase": self._last_phase,
            "cycle_count": self.cycle.cycle_count,
            "total_nanos": self.model.total_nanos,
            "total_params": self.model.total_params,
            "last_checkpoint": str(self._last_checkpoint) if self._last_checkpoint else None,
            # Phase 4 memory telemetry
            "gpu_hit_rate": mem_stats["gpu_hit_rate"],
            "cpu_hit_rate": mem_stats["cpu_hit_rate"],
            "disk_hit_rate": mem_stats["disk_hit_rate"],
            "gpu_used_mb": mem_stats["gpu_used_mb"],
            "cpu_used_mb": mem_stats["cpu_used_mb"],
        }

    def get_checkpoint_info(self) -> Dict:
        checkpoints = sorted(self._checkpoint_dir.glob("*.pt"))
        return {
            "checkpoint_dir": str(self._checkpoint_dir),
            "total_checkpoints": len(checkpoints),
            "latest": str(checkpoints[-1]) if checkpoints else None,
        }

    def _build_nano_id_map(self) -> Dict[int, str]:
        """
        Build a mapping from nano pool_index (int) → nano_id string.
        Format: "{layer_idx}_{pool_idx}".
        Rebuilt after every lifecycle event (spawn / compress).
        """
        mapping: Dict[int, str] = {}
        for layer_idx, layer in enumerate(self.model.layers):
            for pool_idx, nano in enumerate(layer.nano_pool):
                nano_id = f"{layer_idx}_{pool_idx}"
                mapping[nano.pool_index] = nano_id
        return mapping

    def _rebuild_chromatic_index(self):
        """
        Rebuild the ChromaticIndex KD-tree from current nano RBY positions.
        Must be called after lifecycle events change the nano population.
        """
        all_nanos = self.model.all_nanos()
        if all_nanos:
            positions = torch.stack([n.rby_position.detach().cpu() for n in all_nanos])
            self.chromatic_index.rebuild(positions)

    def _save_checkpoint(self, reason: str):
        stamp = int(time.time())
        path = self._checkpoint_dir / f"swarm_{reason}_{stamp}.pt"
        torch.save(
            {
                "model": self.model.state_dict(),
                "optimizer": self.trainer.optimizer.state_dict(),
                "step": self._total_steps,
                "cycle_count": self.cycle.cycle_count,
                "phase": self.cycle.phase,
            },
            path,
        )
        self._last_checkpoint = path
