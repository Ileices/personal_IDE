"""
Touch Tensor — Interaction logging for the Nano Sea (v2).

Records which nanos activate for which inputs. This data drives
lifecycle decisions:
- Underutilized nanos → candidates for death
- Overloaded nanos → candidates for splitting
- Co-activation patterns → synergy detection

Proven useful in test_25.

Adapted from nano_sea_v2_reference.py.
"""
import torch
from typing import List, Dict


class TouchTensor:
    """
    Records which nanos activate for which inputs.

    Drives lifecycle decisions:
    - Underutilized nanos → candidates for death
    - Overloaded nanos → candidates for splitting
    - Co-activation patterns → synergy detection
    """

    def __init__(self, num_nanos: int):
        self.num_nanos = num_nanos
        self.profiles = torch.zeros(num_nanos, dtype=torch.float32)
        self.cross_matrix = torch.zeros(
            num_nanos, num_nanos, dtype=torch.float32
        )
        self.touch_counts = torch.zeros(num_nanos, dtype=torch.long)
        self.total_activations: int = 0

    def update(self, touch_events: List[Dict[str, torch.Tensor]]):
        """
        Update from a list of touch events (one per layer).

        Each event has:
            'indices': (B, S, k) — which nanos were activated
            'weights': (B, S, k) — how strongly
        """
        for event in touch_events:
            indices = event["indices"]   # (B, S, k)
            weights = event["weights"]   # (B, S, k)

            flat_idx = indices.reshape(-1).cpu()
            # Clamp to valid range
            flat_idx = flat_idx.clamp(0, self.num_nanos - 1)
            self.touch_counts.scatter_add_(
                0, flat_idx, torch.ones_like(flat_idx, dtype=torch.long)
            )
            self.total_activations += flat_idx.shape[0]

            # Cross-matrix: which nanos co-activate (sampled for speed)
            B, S, K = indices.shape
            for b in range(min(B, 4)):       # sample batches
                for s in range(0, S, 8):     # sample every 8th position
                    if s >= S:
                        break
                    active = indices[b, s].cpu()
                    for i in range(K):
                        for j in range(i + 1, K):
                            ai, aj = active[i].item(), active[j].item()
                            if ai < self.num_nanos and aj < self.num_nanos:
                                self.cross_matrix[ai, aj] += 1
                                self.cross_matrix[aj, ai] += 1

    def utilization(self) -> torch.Tensor:
        """Per-nano fraction of total activations."""
        total = self.touch_counts.sum().float()
        return self.touch_counts.float() / (total + 1e-9)

    def underutilized(self, threshold: float = 0.001) -> torch.Tensor:
        """Nanos almost never activated — candidates for death or retraining."""
        return (self.utilization() < threshold).nonzero(as_tuple=True)[0]

    def overloaded(self, threshold: float = 0.1) -> torch.Tensor:
        """Nanos activated too often — candidates for splitting."""
        return (self.utilization() > threshold).nonzero(as_tuple=True)[0]

    def synergy_partners(self, nano_idx: int, top_n: int = 5) -> torch.Tensor:
        """Which nanos most often co-activate with this one?"""
        if nano_idx >= self.num_nanos:
            return torch.tensor([], dtype=torch.long)
        return self.cross_matrix[nano_idx].topk(
            min(top_n, self.num_nanos)
        ).indices

    def reset(self):
        """Reset all counters (e.g., between cosmic cycles)."""
        self.profiles.zero_()
        self.cross_matrix.zero_()
        self.touch_counts.zero_()
        self.total_activations = 0

    def resize(self, new_num_nanos: int):
        """Resize tensors when the nano pool changes size."""
        if new_num_nanos == self.num_nanos:
            return
        old_n = self.num_nanos
        self.num_nanos = new_num_nanos

        new_profiles = torch.zeros(new_num_nanos, dtype=torch.float32)
        new_cross = torch.zeros(new_num_nanos, new_num_nanos, dtype=torch.float32)
        new_counts = torch.zeros(new_num_nanos, dtype=torch.long)

        n = min(old_n, new_num_nanos)
        new_profiles[:n] = self.profiles[:n]
        new_cross[:n, :n] = self.cross_matrix[:n, :n]
        new_counts[:n] = self.touch_counts[:n]

        self.profiles = new_profiles
        self.cross_matrix = new_cross
        self.touch_counts = new_counts
