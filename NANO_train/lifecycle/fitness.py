"""v2 Fitness evaluator for nano lifecycle decisions."""
from __future__ import annotations

import math
from typing import Dict

from core.nano import Nano
from core.swarm_model import NanoSeaModel
from core.touch_tensor import TouchTensor


class FitnessEvaluator:
    """
    fitness = 0.5*contribution + 0.3*utilization + 0.2*efficiency
    """

    def __init__(self, ema_alpha: float = 0.1):
        self.ema_alpha = ema_alpha
        self.contribution_history: Dict[str, float] = {}

    def evaluate(
        self,
        nano: Nano,
        touch_tensor: TouchTensor,
        loss_without: float | None = None,
        loss_with: float | None = None,
    ) -> float:
        if loss_without is not None and loss_with is not None:
            delta = max(0.0, loss_without - loss_with)
            contribution = min(1.0, delta / (loss_with + 1e-9))
        else:
            contribution = 0.5

        prev = self.contribution_history.get(nano.nano_id, contribution)
        contribution = self.ema_alpha * contribution + (1 - self.ema_alpha) * prev
        self.contribution_history[nano.nano_id] = contribution

        if nano.pool_index >= 0:
            util = touch_tensor.utilization()
            utilization = min(1.0, util[nano.pool_index].item() * 20)
        else:
            utilization = 0.0

        params = nano.param_count
        efficiency = contribution / (math.log2(params + 1) / 20)
        efficiency = min(1.0, efficiency)

        fitness = 0.5 * contribution + 0.3 * utilization + 0.2 * efficiency
        nano.fitness = fitness
        return fitness

    def evaluate_all(self, model: NanoSeaModel, touch_tensor: TouchTensor) -> Dict[str, float]:
        results: Dict[str, float] = {}
        for layer in model.layers:
            for nano in layer.nano_pool:
                results[nano.nano_id] = self.evaluate(nano, touch_tensor)
        return results
