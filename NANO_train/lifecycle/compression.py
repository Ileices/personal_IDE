"""v2 Compression engine and deposit store."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from uuid import uuid4

import torch

from config import COMPRESSION_SURVIVAL_RATE
from core.nano import Nano
from core.rby import aitchison_distance
from core.swarm_model import NanoSeaModel
from core.touch_tensor import TouchTensor


@dataclass
class Deposit:
    deposit_id: str
    rby_position: List[float]
    hidden_dim: int
    weights: Dict
    centroid: torch.Tensor
    touch_count: int
    fitness_at_death: float
    birth_cycle: int
    death_cycle: int
    used: bool = False


class CompressionEngine:
    def __init__(self):
        self.current_cycle = 0

    def compress(
        self,
        model: NanoSeaModel,
        touch_tensor: TouchTensor,
        survival_rate: float = COMPRESSION_SURVIVAL_RATE,
    ) -> Tuple[Set[Tuple[int, int]], List[Deposit]]:
        scores: Dict[Tuple[int, int], float] = {}
        utilization = touch_tensor.utilization()

        for layer_idx, layer in enumerate(model.layers):
            for nano_idx, nano in enumerate(layer.nano_pool):
                u = utilization[nano.pool_index].item() if nano.pool_index < len(utilization) else 0.0
                score = nano.fitness * 0.7 + min(1.0, u * 20) * 0.3
                scores[(layer_idx, nano_idx)] = score

        sorted_scores = sorted(scores.values())
        threshold_idx = int(len(sorted_scores) * (1 - survival_rate))
        threshold = sorted_scores[threshold_idx] if threshold_idx < len(sorted_scores) else 0.0

        survivors: Set[Tuple[int, int]] = set()
        condemned: List[Tuple[int, int]] = []
        for key, score in scores.items():
            if score >= threshold:
                survivors.add(key)
            else:
                condemned.append(key)

        deposits: List[Deposit] = []
        for layer_idx, nano_idx in condemned:
            nano = model.layers[layer_idx].nano_pool[nano_idx]
            deposits.append(
                Deposit(
                    deposit_id=uuid4().hex[:12],
                    rby_position=nano.rby_position.detach().cpu().tolist(),
                    hidden_dim=nano.hidden_dim,
                    weights={k: v.detach().cpu() for k, v in nano.state_dict().items()},
                    centroid=self._compute_centroid(nano),
                    touch_count=nano.touch_count,
                    fitness_at_death=nano.fitness,
                    birth_cycle=nano.birth_cycle,
                    death_cycle=self.current_cycle,
                )
            )

        return survivors, deposits

    def _compute_centroid(self, nano: Nano) -> torch.Tensor:
        centroids = [p.data.detach().cpu().mean() for p in nano.parameters()]
        return torch.stack(centroids) if centroids else torch.tensor([0.0])


class DepositStore:
    def __init__(self, store_dir: str = "deposits"):
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self.deposits: List[Deposit] = []

    def add(self, deposit: Deposit):
        self.deposits.append(deposit)
        self._save_deposit(deposit)

    def get_best_unused(self) -> Optional[Deposit]:
        unused = [d for d in self.deposits if not d.used]
        if not unused:
            return None
        best = max(unused, key=lambda d: d.fitness_at_death)
        best.used = True
        return best

    def get_nearest_rby(self, rby: List[float], k: int = 1) -> List[Deposit]:
        if not self.deposits:
            return []
        positions = torch.tensor([d.rby_position for d in self.deposits], dtype=torch.float32)
        target = torch.tensor(rby, dtype=torch.float32)
        distances = aitchison_distance(positions, target.unsqueeze(0).expand_as(positions))
        _, indices = distances.topk(min(k, len(self.deposits)), largest=False)
        return [self.deposits[i] for i in indices]

    def _save_deposit(self, deposit: Deposit):
        path = self.store_dir / f"{deposit.deposit_id}.pt"
        torch.save(
            {
                "deposit_id": deposit.deposit_id,
                "rby_position": deposit.rby_position,
                "hidden_dim": deposit.hidden_dim,
                "weights": deposit.weights,
                "centroid": deposit.centroid,
                "touch_count": deposit.touch_count,
                "fitness_at_death": deposit.fitness_at_death,
                "birth_cycle": deposit.birth_cycle,
                "death_cycle": deposit.death_cycle,
            },
            path,
        )

    def load_all(self):
        self.deposits = []
        for path in self.store_dir.glob("*.pt"):
            data = torch.load(path, weights_only=False)
            self.deposits.append(Deposit(**data))
