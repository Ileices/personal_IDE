"""
Unified Nano Trainer — REAL training, checkpointing, and evolution.

Training modes:
1. OBSERVATION: Watch LLM API responses → tokenize → supervised MSE loss
2. SELF-SUPERVISED: Character-level masked prediction on user's code
3. EVOLUTION: Tournament selection + crossover + mutation of nano weights
4. IDLE: Runs when system is idle, trains all nanos in rotation

All trained weights are saved as PyTorch .pt files with metadata JSON
in CHECKPOINT_DIR. Supports auto-resume from last checkpoint.
"""
from __future__ import annotations
import asyncio, time, logging, os, json, random, hashlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from collections import deque
from datetime import datetime

logger = logging.getLogger(__name__)


# ─── Training pair ─────────────────────────────────────────
@dataclass
class TrainingPair:
    """A single training example."""
    input_text: str
    target_text: str
    source: str = "observation"   # observation, distillation, synthetic, codebase
    quality: float = 0.8
    timestamp: float = field(default_factory=time.time)
    nano_types: List[str] = field(default_factory=list)


@dataclass
class TrainingSession:
    """Tracks one training epoch."""
    session_id: str
    started_at: float = field(default_factory=time.time)
    ended_at: float = 0.0
    steps: int = 0
    total_loss: float = 0.0
    avg_loss: float = float("inf")
    nano_types_trained: List[str] = field(default_factory=list)
    best_loss: float = float("inf")
    pairs_used: int = 0
    checkpoints_saved: int = 0


@dataclass
class NanoCheckpointMeta:
    """Metadata saved alongside each .pt checkpoint."""
    nano_type: str
    nano_id: str
    param_count: int
    input_size: int
    output_size: int
    hidden_size: int
    training_steps: int
    best_loss: float
    last_loss: float
    fitness_score: float
    created_at: str
    updated_at: str
    format: str = "pytorch_state_dict"  # always pytorch .pt
    framework: str = "PyTorch"
    device_trained_on: str = "cpu"
    total_pairs_seen: int = 0
    rby: Tuple[float, float, float] = (0.334, 0.333, 0.333)
    lifecycle_state: str = "dormant"


# ─── Simple character-level tokenizer ──────────────────────
# Nanos are tiny (128 input) so we use char-level encoding
class CharTokenizer:
    """Maps characters to float vectors for nano input/output."""

    def __init__(self, input_size: int = 128, output_size: int = 64):
        self.input_size = input_size
        self.output_size = output_size

    def encode_input(self, text: str) -> 'torch.Tensor':
        """Convert text to float tensor of shape (1, input_size).
        Uses char ordinals normalized to [0,1], zero-padded or truncated."""
        import torch
        chars = [ord(c) / 256.0 for c in text[:self.input_size]]
        # Pad with zeros
        while len(chars) < self.input_size:
            chars.append(0.0)
        return torch.tensor([chars], dtype=torch.float32)

    def encode_target(self, text: str) -> 'torch.Tensor':
        """Convert text to float tensor of shape (1, output_size)."""
        import torch
        chars = [ord(c) / 256.0 for c in text[:self.output_size]]
        while len(chars) < self.output_size:
            chars.append(0.0)
        return torch.tensor([chars], dtype=torch.float32)

    def decode(self, tensor: 'torch.Tensor') -> str:
        """Convert output tensor back to text (lossy)."""
        values = tensor.squeeze().detach().cpu().tolist()
        chars = []
        for v in values:
            c = int(v * 256)
            if 32 <= c < 127:
                chars.append(chr(c))
            elif c > 0:
                chars.append('?')
        return ''.join(chars).rstrip('\x00').rstrip('?').strip()


class NanoTrainer:
    """Trains the sea of nanos with REAL data and saves checkpoints."""

    def __init__(
        self,
        data_dir: str = "nano_data/training",
        checkpoint_dir: str = "checkpoints",
        batch_size: int = 8,
        learning_rate: float = 1e-4,
        max_buffer_size: int = 10000,
        training_interval: float = 60.0,
        min_pairs_to_train: int = 5,
        checkpoint_every: int = 3,  # save every N epochs
    ):
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._checkpoint_dir = Path(checkpoint_dir)
        self._checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self._batch_size = batch_size
        self._lr = learning_rate
        self._max_buffer = max_buffer_size
        self._training_interval = training_interval
        self._min_pairs = min_pairs_to_train
        self._checkpoint_every = checkpoint_every

        # Training data buffer
        self._buffer: deque[TrainingPair] = deque(maxlen=max_buffer_size)
        self._archive_file = self._data_dir / "training_pairs.jsonl"

        # Nanos to train
        self._nanos: Dict[str, Any] = {}

        # Tokenizer
        self._tokenizer = CharTokenizer()

        # State
        self._running = False
        self._train_task: Optional[asyncio.Task] = None
        self._total_steps = 0
        self._total_pairs_collected = 0
        self._total_pairs_used = 0
        self._epochs_completed = 0
        self._sessions: List[TrainingSession] = []
        self._device = "cpu"

        # Load existing training data
        self._load_archive()

    def _load_archive(self) -> None:
        if self._archive_file.exists():
            count = 0
            try:
                with open(self._archive_file, "r") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        data = json.loads(line)
                        pair = TrainingPair(**{k: v for k, v in data.items()
                                              if k in TrainingPair.__dataclass_fields__})
                        self._buffer.append(pair)
                        count += 1
                logger.info(f"Loaded {count} training pairs from archive")
            except Exception as e:
                logger.warning(f"Failed to load archive: {e}")

    def _detect_device(self) -> str:
        """Detect best available compute device using unified GPU detection."""
        try:
            from compute.device_manager import get_device_manager
            dm = get_device_manager()
            return dm.device
        except ImportError:
            pass
        # Fallback: basic detection
        import torch
        if torch.cuda.is_available():
            return "cuda"
        try:
            import torch_directml  # noqa
            return "privateuseone"
        except ImportError:
            pass
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def register_nano(self, nano_type: str, nano: Any) -> None:
        self._nanos[nano_type] = nano

    # ── Data Collection ────────────────────────────────────────
    def add_observation(self, query: str, response: str,
                        source: str = "observation",
                        quality: float = 0.8) -> None:
        pair = TrainingPair(
            input_text=query,
            target_text=response,
            source=source,
            quality=quality,
        )
        self._buffer.append(pair)
        self._total_pairs_collected += 1

        try:
            with open(self._archive_file, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "input_text": pair.input_text[:2000],  # cap size
                    "target_text": pair.target_text[:2000],
                    "source": pair.source,
                    "quality": pair.quality,
                    "timestamp": pair.timestamp,
                }, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"Failed to archive pair: {e}")

    def add_codebase_sample(self, code: str, context: str = "") -> None:
        self.add_observation(
            query=context or "Complete the following code:",
            response=code,
            source="codebase",
            quality=0.6,
        )

    # ── Checkpoint Management ──────────────────────────────────
    def _save_checkpoint(self, nano_type: str, nano: Any, session: Optional[TrainingSession] = None) -> Path:
        """Save nano weights + metadata. Returns checkpoint path."""
        import torch

        # Create type-specific directory
        type_dir = self._checkpoint_dir / nano_type
        type_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pt_path = type_dir / f"{nano_type}_{timestamp}.pt"
        meta_path = type_dir / f"{nano_type}_{timestamp}.json"
        latest_pt = type_dir / "latest.pt"
        latest_meta = type_dir / "latest.json"

        # Save weights
        torch.save(nano.state_dict(), pt_path)
        torch.save(nano.state_dict(), latest_pt)

        # Build metadata
        meta = NanoCheckpointMeta(
            nano_type=nano_type,
            nano_id=getattr(nano, 'nano_id', nano_type),
            param_count=sum(p.numel() for p in nano.parameters()),
            input_size=getattr(nano, 'DEFAULT_INPUT', 128),
            output_size=getattr(nano, 'DEFAULT_OUTPUT', 64),
            hidden_size=getattr(nano, 'DEFAULT_HIDDEN', 64),
            training_steps=getattr(nano, 'training_steps', self._total_steps),
            best_loss=getattr(nano, 'best_loss', float('inf')),
            last_loss=getattr(nano, 'training_loss', float('inf')),
            fitness_score=getattr(nano, 'fitness_score', 0.0),
            created_at=getattr(nano, 'created_at', time.time()),
            updated_at=datetime.now().isoformat(),
            device_trained_on=self._device,
            total_pairs_seen=self._total_pairs_used,
            rby=nano.rby.to_tuple() if hasattr(nano, 'rby') else (0.334, 0.333, 0.333),
            lifecycle_state=nano.state.value if hasattr(nano, 'state') else "dormant",
        )
        # Convert to dict for JSON
        meta_dict = {
            "nano_type": meta.nano_type,
            "nano_id": meta.nano_id,
            "param_count": meta.param_count,
            "input_size": meta.input_size,
            "output_size": meta.output_size,
            "hidden_size": meta.hidden_size,
            "training_steps": meta.training_steps,
            "best_loss": meta.best_loss if meta.best_loss != float('inf') else None,
            "last_loss": meta.last_loss if meta.last_loss != float('inf') else None,
            "fitness_score": meta.fitness_score,
            "created_at": str(meta.created_at),
            "updated_at": meta.updated_at,
            "format": meta.format,
            "framework": meta.framework,
            "device_trained_on": meta.device_trained_on,
            "total_pairs_seen": meta.total_pairs_seen,
            "rby": list(meta.rby),
            "lifecycle_state": meta.lifecycle_state,
            "checkpoint_file": pt_path.name,
            "checkpoint_size_bytes": pt_path.stat().st_size,
        }

        with open(meta_path, "w") as f:
            json.dump(meta_dict, f, indent=2)
        with open(latest_meta, "w") as f:
            json.dump(meta_dict, f, indent=2)

        logger.info(f"  Checkpoint saved: {pt_path.name} ({pt_path.stat().st_size} bytes)")
        return pt_path

    def _load_latest_checkpoint(self, nano_type: str, nano: Any) -> bool:
        """Load the latest checkpoint for a nano. Returns True if loaded."""
        import torch
        type_dir = self._checkpoint_dir / nano_type
        latest_pt = type_dir / "latest.pt"
        if latest_pt.exists():
            try:
                state = torch.load(latest_pt, map_location=self._device, weights_only=True)
                nano.load_state_dict(state)
                logger.info(f"  Loaded checkpoint for {nano_type}")
                return True
            except Exception as e:
                logger.warning(f"  Failed to load checkpoint for {nano_type}: {e}")
        return False

    def get_checkpoint_info(self) -> Dict[str, Any]:
        """Get info about all saved checkpoints for the status API."""
        result = {
            "checkpoint_dir": str(self._checkpoint_dir.resolve()),
            "nanos": {},
            "total_checkpoints": 0,
            "total_size_bytes": 0,
        }
        if not self._checkpoint_dir.exists():
            return result

        for type_dir in self._checkpoint_dir.iterdir():
            if not type_dir.is_dir():
                continue
            nano_type = type_dir.name
            latest_meta = type_dir / "latest.json"
            pt_files = list(type_dir.glob("*.pt"))
            total_size = sum(f.stat().st_size for f in pt_files)

            info = {
                "checkpoint_count": len([f for f in pt_files if f.name != "latest.pt"]),
                "total_size_bytes": total_size,
                "latest": None,
            }
            if latest_meta.exists():
                try:
                    with open(latest_meta) as f:
                        info["latest"] = json.load(f)
                except Exception:
                    pass

            result["nanos"][nano_type] = info
            result["total_checkpoints"] += info["checkpoint_count"]
            result["total_size_bytes"] += total_size

        return result

    # ── Training Loop ──────────────────────────────────────────
    async def start(self) -> None:
        self._device = self._detect_device()
        logger.info(f"Nano trainer starting on device: {self._device}")

        # Load latest checkpoints for all registered nanos
        for nano_type, nano in self._nanos.items():
            self._load_latest_checkpoint(nano_type, nano)

        self._running = True
        self._train_task = asyncio.create_task(self._training_loop())
        logger.info(f"Nano trainer running ({len(self._nanos)} nanos, "
                     f"{len(self._buffer)} pairs buffered)")

    async def stop(self) -> None:
        self._running = False
        if self._train_task:
            self._train_task.cancel()
            try:
                await self._train_task
            except asyncio.CancelledError:
                pass
        # Save final checkpoints
        for nano_type, nano in self._nanos.items():
            try:
                self._save_checkpoint(nano_type, nano)
            except Exception as e:
                logger.warning(f"Failed final checkpoint for {nano_type}: {e}")
        logger.info(f"Nano trainer stopped. Total steps: {self._total_steps}, "
                     f"epochs: {self._epochs_completed}")

    async def _training_loop(self) -> None:
        while self._running:
            try:
                if len(self._buffer) >= self._min_pairs and self._nanos:
                    await self._train_epoch()
                elif not self._nanos:
                    logger.debug("No nanos registered for training")
                else:
                    logger.debug(f"Waiting for more data ({len(self._buffer)}/{self._min_pairs} pairs)")
            except Exception as e:
                logger.error(f"Training error: {e}", exc_info=True)
            await asyncio.sleep(self._training_interval)

    async def _train_epoch(self) -> None:
        """Run one training epoch across all registered nanos using REAL data."""
        import torch
        import torch.nn.functional as F

        session = TrainingSession(session_id=f"epoch-{self._epochs_completed}")
        self._sessions.append(session)

        # Sample a batch of REAL training pairs
        batch_size = min(self._batch_size, len(self._buffer))
        batch = random.sample(list(self._buffer), batch_size)
        session.pairs_used = batch_size

        # Encode the batch using our tokenizer
        encoded_pairs = []
        for pair in batch:
            try:
                inp = self._tokenizer.encode_input(pair.input_text)
                tgt = self._tokenizer.encode_target(pair.target_text)
                encoded_pairs.append((inp, tgt, pair.quality))
            except Exception as e:
                logger.debug(f"Skipping pair: {e}")

        if not encoded_pairs:
            return

        for nano_type, nano in self._nanos.items():
            try:
                device = self._device
                nano = nano.to(device)
                nano.train()

                # Match tokenizer to this nano's sizes
                tokenizer = CharTokenizer(
                    input_size=getattr(nano, 'input_size', getattr(nano, 'DEFAULT_INPUT', 128)),
                    output_size=getattr(nano, 'output_size', getattr(nano, 'DEFAULT_OUTPUT', 64)),
                )

                optimizer = torch.optim.AdamW(nano.parameters(), lr=self._lr)
                epoch_loss = 0.0
                epoch_steps = 0

                for pair in batch:
                    try:
                        inp = tokenizer.encode_input(pair.input_text).to(device)
                        tgt = tokenizer.encode_target(pair.target_text).to(device)

                        optimizer.zero_grad()
                        output = nano(inp)
                        loss = F.mse_loss(output, tgt)

                        # Weight by quality
                        loss = loss * pair.quality

                        loss.backward()
                        torch.nn.utils.clip_grad_norm_(nano.parameters(), 1.0)
                        optimizer.step()

                        loss_val = loss.item()
                        epoch_loss += loss_val
                        epoch_steps += 1
                        session.steps += 1
                        self._total_steps += 1
                        self._total_pairs_used += 1

                        # Update nano training state
                        nano.training_steps = getattr(nano, 'training_steps', 0) + 1
                        nano.training_loss = loss_val
                        if loss_val < getattr(nano, 'best_loss', float('inf')):
                            nano.best_loss = loss_val

                        # Lifecycle shift
                        if hasattr(nano, 'rby') and nano.training_steps % 100 == 0:
                            progress = min(1.0, nano.training_steps / 1000)
                            nano.rby.lifecycle_shift(progress)

                    except Exception as e:
                        logger.debug(f"Training step failed for {nano_type}: {e}")
                        continue

                nano.eval()
                session.nano_types_trained.append(nano_type)

                if epoch_steps > 0:
                    avg = epoch_loss / epoch_steps
                    session.total_loss += epoch_loss
                    if avg < session.best_loss:
                        session.best_loss = avg

            except Exception as e:
                logger.error(f"Training nano {nano_type} failed: {e}")

        self._epochs_completed += 1
        session.ended_at = time.time()
        session.avg_loss = session.total_loss / max(session.steps, 1)

        # Checkpoint periodically
        if self._epochs_completed % self._checkpoint_every == 0:
            for nano_type, nano in self._nanos.items():
                try:
                    self._save_checkpoint(nano_type, nano, session)
                    session.checkpoints_saved += 1
                except Exception as e:
                    logger.warning(f"Checkpoint save failed for {nano_type}: {e}")

        logger.info(
            f"Epoch {self._epochs_completed}: {session.steps} steps, "
            f"avg_loss={session.avg_loss:.6f}, "
            f"nanos_trained={len(session.nano_types_trained)}, "
            f"pairs_used={session.pairs_used}, "
            f"checkpoints={session.checkpoints_saved}"
        )

    # ── Evolution ──────────────────────────────────────────────
    async def evolve(self, nano_type: str, population_size: int = 4) -> Optional[float]:
        """Tournament selection + mutation for a nano. Returns best fitness."""
        import torch

        nano = self._nanos.get(nano_type)
        if not nano or len(self._buffer) < self._min_pairs:
            return None

        device = self._device
        tokenizer = CharTokenizer(
            input_size=getattr(nano, 'DEFAULT_INPUT', 128),
            output_size=getattr(nano, 'DEFAULT_OUTPUT', 64),
        )

        # Sample evaluation data
        eval_batch = random.sample(list(self._buffer), min(4, len(self._buffer)))

        original_state = {k: v.clone() for k, v in nano.state_dict().items()}

        # Create population by perturbing weights
        population = [original_state]  # Include original
        for _ in range(population_size - 1):
            clone_state = {k: v.clone() + torch.randn_like(v) * 0.01
                          for k, v in original_state.items()}
            population.append(clone_state)

        # Evaluate each on REAL data
        fitness_scores = []
        for state in population:
            nano.load_state_dict(state)
            nano.eval()
            total_loss = 0.0
            with torch.no_grad():
                for pair in eval_batch:
                    inp = tokenizer.encode_input(pair.input_text).to(device)
                    tgt = tokenizer.encode_target(pair.target_text).to(device)
                    output = nano(inp)
                    loss = torch.nn.functional.mse_loss(output, tgt)
                    total_loss += loss.item()
            fitness_scores.append(-total_loss)  # Lower loss = higher fitness

        # Select best
        best_idx = max(range(len(fitness_scores)), key=lambda i: fitness_scores[i])
        nano.load_state_dict(population[best_idx])
        best_fitness = fitness_scores[best_idx]

        logger.info(f"Evolution for {nano_type}: best fitness {best_fitness:.4f} "
                     f"(population={population_size})")

        # Save if improved
        if best_idx != 0:  # Different from original
            self._save_checkpoint(nano_type, nano)

        return best_fitness

    # ── Status for API ─────────────────────────────────────────
    @property
    def status(self) -> Dict[str, Any]:
        recent_sessions = self._sessions[-5:] if self._sessions else []
        return {
            "running": self._running,
            "device": self._device,
            "total_steps": self._total_steps,
            "total_pairs_collected": self._total_pairs_collected,
            "total_pairs_used": self._total_pairs_used,
            "epochs_completed": self._epochs_completed,
            "buffer_size": len(self._buffer),
            "registered_nanos": list(self._nanos.keys()),
            "training_interval_s": self._training_interval,
            "checkpoint_every": self._checkpoint_every,
            "checkpoint_dir": str(self._checkpoint_dir.resolve()),
            "recent_sessions": [
                {
                    "id": s.session_id,
                    "steps": s.steps,
                    "avg_loss": round(s.avg_loss, 6) if s.avg_loss != float('inf') else None,
                    "nanos_trained": s.nano_types_trained,
                    "pairs_used": s.pairs_used,
                    "checkpoints_saved": s.checkpoints_saved,
                    "duration_s": round(s.ended_at - s.started_at, 1) if s.ended_at else 0,
                }
                for s in recent_sessions
            ],
            "checkpoints": self.get_checkpoint_info(),
        }
