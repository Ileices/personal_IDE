"""v2 Cosmic Cycle manager orchestrating expand/train/compress/deposit/mutate."""
from __future__ import annotations

import torch
import torch.nn.functional as F

from config import D_MODEL
from core.router import SwarmRouter
from core.rby import compute_uf_io
from core.touch_tensor import TouchTensor
from core.swarm_model import NanoSeaModel
from lifecycle.absularity import AbsularityDetector
from lifecycle.compression import CompressionEngine, DepositStore
from lifecycle.fitness import FitnessEvaluator
from lifecycle.spawner import NanoSpawner
from training.swarm_trainer import SwarmTrainer


class CosmicCycleManager:
    def __init__(
        self,
        model: NanoSeaModel,
        spawner: NanoSpawner,
        compressor: CompressionEngine,
        detector: AbsularityDetector,
        deposit_store: DepositStore,
        fitness_eval: FitnessEvaluator,
    ):
        self.model = model
        self.spawner = spawner
        self.compressor = compressor
        self.detector = detector
        self.deposit_store = deposit_store
        self.fitness_eval = fitness_eval
        self.cycle_count = 0
        self.phase = "expand"

    def step(
        self,
        trainer: SwarmTrainer,
        touch_tensor: TouchTensor,
        val_loss: float,
        router_entropy: float,
    ) -> str:
        if self.phase == "expand":
            self._do_expand(touch_tensor, router_entropy)
            self.phase = "train"

        elif self.phase == "train":
            uf, io = compute_uf_io(
                success=1.0 / (val_loss + 1),
                error=val_loss / 10,
                complexity=self.cycle_count * 0.1,
            )
            if self.detector.check(val_loss, router_entropy, uf, io):
                self.phase = "compress"

        elif self.phase == "compress":
            self._do_compress(trainer, touch_tensor)
            self.phase = "deposit"

        elif self.phase == "deposit":
            self._do_rebuild()
            self.phase = "mutate"

        elif self.phase == "mutate":
            self._do_mutate()
            self.cycle_count += 1
            self.detector.reset()
            self.phase = "expand"

        return self.phase

    def _do_expand(self, touch_tensor: TouchTensor, router_entropy: float):
        for layer in self.model.layers:
            reasons = self.spawner.should_spawn(touch_tensor, router_entropy, cycle_phase="expansion")
            for reason, ctx in reasons[:3]:
                if reason == "split" and "nano_pool_index" in ctx:
                    idx = ctx["nano_pool_index"]
                    if idx < len(layer.nano_pool):
                        parent = layer.nano_pool[idx]
                        new = self.spawner.spawn(parent.up.in_features, "split", parent=parent)
                        new.birth_cycle = self.cycle_count
                        layer.add_nano(new)
                elif reason == "new":
                    deposit = self.deposit_store.get_best_unused()
                    if deposit:
                        new = self.spawner.spawn(D_MODEL, "deposit", deposit=deposit)
                    else:
                        new = self.spawner.spawn(D_MODEL, "new")
                    new.birth_cycle = self.cycle_count
                    layer.add_nano(new)
            layer.router = SwarmRouter(D_MODEL, len(layer.nano_pool), layer.top_k).to(next(layer.parameters()).device)

    def _do_compress(self, trainer: SwarmTrainer, touch_tensor: TouchTensor):
        self.compressor.current_cycle = self.cycle_count
        survivors, deposits = self.compressor.compress(self.model, touch_tensor)

        for dep in deposits:
            self.deposit_store.add(dep)

        for layer_idx, layer in enumerate(self.model.layers):
            original_nanos = list(layer.nano_pool)
            surviving_nanos = []
            for nano_idx, nano in enumerate(layer.nano_pool):
                if (layer_idx, nano_idx) in survivors:
                    surviving_nanos.append(nano)
                else:
                    trainer.remove_nano(nano)
            if not surviving_nanos and original_nanos:
                best = max(original_nanos, key=lambda n: n.fitness)
                surviving_nanos.append(best)
            layer.nano_pool = torch.nn.ModuleList(surviving_nanos)
            for i, n in enumerate(layer.nano_pool):
                n.pool_index = i
            layer.router = SwarmRouter(D_MODEL, len(surviving_nanos), layer.top_k).to(next(layer.parameters()).device)

    def _do_rebuild(self):
        for layer in self.model.layers:
            min_pool = 4
            while len(layer.nano_pool) < min_pool:
                deposit = self.deposit_store.get_best_unused()
                if deposit:
                    new = self.spawner.spawn(D_MODEL, "deposit", deposit=deposit)
                else:
                    new = self.spawner.spawn(D_MODEL, "new")
                new.birth_cycle = self.cycle_count
                layer.add_nano(new)
            layer.router = SwarmRouter(D_MODEL, len(layer.nano_pool), layer.top_k).to(next(layer.parameters()).device)

    def _do_mutate(self):
        for layer in self.model.layers:
            for nano in layer.nano_pool:
                nano.rby_position.data += 0.02 * torch.randn(3, device=nano.rby_position.device)
                nano.rby_position.data = F.softmax(nano.rby_position.data, dim=0)
