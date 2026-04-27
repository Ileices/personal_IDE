"""v2 Nano spawner for lifecycle expansion/splitting/deposit reuse."""
from __future__ import annotations

import copy
from uuid import uuid4
from typing import List, Optional, Tuple

import torch
import torch.nn.functional as F

from config import D_MODEL, DEFAULT_HIDDEN_DIM, MIN_HIDDEN_DIM, MAX_HIDDEN_DIM
from core.nano import Nano
from core.touch_tensor import TouchTensor


class NanoSpawner:
    def spawn(
        self,
        d_model: int = D_MODEL,
        reason: str = "new",
        parent: Optional[Nano] = None,
        deposit=None,
        rby_seed: Optional[List[float]] = None,
    ) -> Nano:
        if reason == "split" and parent is not None:
            child = copy.deepcopy(parent)
            child.nano_id = uuid4().hex[:12]
            for param in child.parameters():
                if param.requires_grad:
                    param.data += 0.01 * torch.randn_like(param)
            child.rby_position.data += 0.05 * torch.randn(3)
            child.rby_position.data = F.softmax(child.rby_position.data, dim=0)
            child.fitness = parent.fitness * 0.8
            child.touch_count = 0
            child.birth_cycle = parent.birth_cycle
            return child

        if reason == "deposit" and deposit is not None:
            nano = Nano(d_model, deposit.hidden_dim, rby_seed=deposit.rby_position)
            try:
                nano.load_state_dict(deposit.weights, strict=False)
            except Exception:
                pass
            nano.parent_deposit_id = deposit.deposit_id
            return nano

        rby = rby_seed or [0.33, 0.33, 0.34]
        hidden_dim = self._size_from_rby(rby)
        return Nano(d_model, hidden_dim, rby_seed=rby)

    def _size_from_rby(self, rby: List[float]) -> int:
        _, b, _ = rby
        scale = 0.5 + b
        hidden = int(DEFAULT_HIDDEN_DIM * scale)
        return max(MIN_HIDDEN_DIM, min(MAX_HIDDEN_DIM, hidden))

    def should_spawn(
        self,
        touch_tensor: TouchTensor,
        router_entropy: float,
        cycle_phase: str = "training",
    ) -> List[Tuple[str, dict]]:
        reasons: List[Tuple[str, dict]] = []

        if router_entropy > 2.0:
            reasons.append(("new", {"trigger": "high_entropy"}))

        overloaded = touch_tensor.overloaded(threshold=0.1)
        for idx in overloaded:
            reasons.append(("split", {"nano_pool_index": idx.item()}))

        if cycle_phase == "expansion":
            reasons.append(("new", {"trigger": "expansion"}))

        return reasons
