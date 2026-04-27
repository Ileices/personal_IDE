"""v2 Absularity detector."""
from __future__ import annotations

from typing import List

import torch


class AbsularityDetector:
    """
    Triggers compression when:
    1) loss plateaus
    2) router entropy is stable
    3) UF≈IO equilibrium is reached
    """

    def __init__(self, window_size: int = 100, threshold: float = 0.05):
        self.window_size = window_size
        self.threshold = threshold
        self.loss_history: List[float] = []
        self.entropy_history: List[float] = []

    def check(self, val_loss: float, router_entropy: float, uf: float, io: float) -> bool:
        self.loss_history.append(val_loss)
        self.entropy_history.append(router_entropy)

        if len(self.loss_history) < self.window_size:
            return False

        window = self.loss_history[-self.window_size:]
        loss_plateau = (max(window) - min(window)) < self.threshold
        entropy_stable = torch.std(torch.tensor(self.entropy_history[-self.window_size:])).item() < self.threshold
        rby_equilibrium = abs(uf - io) < self.threshold
        return loss_plateau and entropy_stable and rby_equilibrium

    def reset(self):
        self.loss_history.clear()
        self.entropy_history.clear()
