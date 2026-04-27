"""
Expert Crosstalk — IC-AE Reborn (v2).

Active nanos attend to each other's outputs before combining.
Gate starts at 0 → model begins as standard weighted sum.
If crosstalk helps, gate learns to mix it in.

CRITICAL: gate parameter MUST initialize at 0.0. Starting at other
values causes training instability (proven empirically in test_24).

From the original framework: "When two entities interact, they create
something neither could produce alone."

Adapted from nano_sea_v2_reference.py.
"""
import torch
import torch.nn as nn


class ExpertCrosstalk(nn.Module):
    """
    Active nanos attend to each other's outputs before combining.

    Gate starts at 0 → model begins as standard weighted sum.
    If crosstalk helps, gate learns to mix it in.
    Proven beneficial in test_24.
    """

    def __init__(self, d_model: int, n_heads: int = 2):
        super().__init__()
        self.cross_attn = nn.MultiheadAttention(
            d_model, n_heads, batch_first=True
        )
        # MUST be 0.0 — proven constraint from experiments
        self.gate = nn.Parameter(torch.tensor(0.0))

    def forward(
        self,
        nano_outputs: torch.Tensor,
        weights: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            nano_outputs: (B, S, k, D) — outputs from k active nanos
            weights: (B, S, k) — routing weights for each nano

        Returns:
            (B, S, D) — combined output
        """
        B, S, K, D = nano_outputs.shape

        # Standard path: weighted sum
        standard = (nano_outputs * weights.unsqueeze(-1)).sum(dim=2)  # (B, S, D)

        # Crosstalk path: nanos attend to each other within each position
        flat = nano_outputs.view(B * S, K, D)
        infected, _ = self.cross_attn(flat, flat, flat)
        infected = infected.view(B, S, K, D)
        infected_sum = (infected * weights.unsqueeze(-1)).sum(dim=2)

        # Learned gate
        alpha = torch.sigmoid(self.gate)
        return (1 - alpha) * standard + alpha * infected_sum
