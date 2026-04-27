"""v2 Swarm Trainer for NanoSeaModel."""
from __future__ import annotations

import math
from typing import Dict, List

import torch
import torch.nn.functional as F

from config import LEARNING_RATE, EFF_LAMBDA, VOCAB_SIZE, GRAD_CLIP
from core.nano import Nano
from core.swarm_model import NanoSeaModel


class SwarmTrainer:
    """
    End-to-end training for the Nano Sea.

    Only active nanos receive gradients via routing selection.
    """

    def __init__(self, model: NanoSeaModel, lr: float = LEARNING_RATE):
        self.model = model
        self.optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    def train_step(self, input_ids: torch.Tensor, target_ids: torch.Tensor) -> Dict:
        self.model.train()
        logits, touch_events = self.model(input_ids)

        ce_loss = F.cross_entropy(logits.view(-1, VOCAB_SIZE), target_ids.view(-1))
        eff_loss = self._efficiency_loss(touch_events)
        loss = ce_loss + EFF_LAMBDA * eff_loss

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), GRAD_CLIP)
        self.optimizer.step()

        return {
            "loss": loss.item(),
            "ce_loss": ce_loss.item(),
            "eff_loss": eff_loss.item(),
            "touch_events": touch_events,
            "router_entropy": self._router_entropy(touch_events),
        }

    def _efficiency_loss(self, touch_events: List[Dict]) -> torch.Tensor:
        total = 0.0
        for event in touch_events:
            weights = event["weights"]
            ent = -(weights * (weights + 1e-9).log()).sum(-1).mean()
            total += ent
        return total / max(1, len(touch_events))

    def _router_entropy(self, touch_events: List[Dict]) -> float:
        entropies = []
        for event in touch_events:
            w = event["weights"]
            ent = -(w * (w + 1e-9).log()).sum(-1).mean()
            entropies.append(ent.item())
        return sum(entropies) / len(entropies) if entropies else 0.0

    @torch.no_grad()
    def evaluate(self, input_ids: torch.Tensor, target_ids: torch.Tensor) -> float:
        self.model.eval()
        logits, _ = self.model(input_ids)
        loss = F.cross_entropy(logits.view(-1, VOCAB_SIZE), target_ids.view(-1))
        return math.exp(loss.item())

    def remove_nano(self, nano: Nano):
        for param in nano.parameters():
            self.optimizer.state.pop(param, None)
