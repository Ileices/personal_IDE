"""v2 Compression engine and deposit store."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from uuid import uuid4

import torch
import torch.nn as nn
import torch.nn.functional as F

from config import COMPRESSION_SURVIVAL_RATE
from core.nano import Nano
from core.rby import aitchison_distance
from core.swarm_model import NanoSeaModel
from core.touch_tensor import TouchTensor


# ── AE Glyph Autoencoder ─────────────────────────────────────────────────────

class GlyphEncoder(nn.Module):
    """Compress a flat weight vector of arbitrary size to 16-dim glyph."""
    def __init__(self, in_features: int, bottleneck: int = 16):
        super().__init__()
        mid = max(bottleneck * 4, 64)
        self.net = nn.Sequential(
            nn.Linear(in_features, mid),
            nn.GELU(),
            nn.Linear(mid, bottleneck),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class GlyphDecoder(nn.Module):
    """Reconstruct approximate weights from a 16-dim glyph."""
    def __init__(self, out_features: int, bottleneck: int = 16):
        super().__init__()
        mid = max(bottleneck * 4, 64)
        self.net = nn.Sequential(
            nn.Linear(bottleneck, mid),
            nn.GELU(),
            nn.Linear(mid, out_features),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return self.net(z)


class NanoGlyphAutoencoder:
    """Per-nano-size autoencoder for weight compression.

    Usage:
        ae = NanoGlyphAutoencoder()
        # On absularity (nano dies):
        glyph = ae.encode(nano_flat_weights)
        # On new generational cycle:
        seed_weights = ae.decode(glyph, flat_weight_size)
    """

    _BOTTLENECK = 16

    def __init__(self, device: str = "cpu"):
        self._device = device
        # Lazily created per flat-weight size
        self._encoders: Dict[int, GlyphEncoder] = {}
        self._decoders: Dict[int, GlyphDecoder] = {}

    def _get_or_create(self, n: int) -> Tuple[GlyphEncoder, GlyphDecoder]:
        if n not in self._encoders:
            enc = GlyphEncoder(n, self._BOTTLENECK).to(self._device)
            dec = GlyphDecoder(n, self._BOTTLENECK).to(self._device)
            # Random init — the AE learns implicitly through decode→MSE→backward
            self._encoders[n] = enc
            self._decoders[n] = dec
        return self._encoders[n], self._decoders[n]

    @staticmethod
    def _flatten_weights(weights: Dict[str, torch.Tensor]) -> torch.Tensor:
        parts = [v.detach().cpu().float().reshape(-1) for v in weights.values()]
        return torch.cat(parts) if parts else torch.zeros(1)

    def encode(self, weights: Dict[str, torch.Tensor]) -> torch.Tensor:
        """Return a 16-dim glyph tensor from a nano state_dict."""
        flat = self._flatten_weights(weights).to(self._device)
        enc, _ = self._get_or_create(flat.shape[0])
        with torch.no_grad():
            return enc(flat.unsqueeze(0)).squeeze(0).cpu()

    def decode(self, glyph: torch.Tensor, flat_size: int) -> torch.Tensor:
        """Reconstruct approximate flat weight vector from glyph.
        Caller reshapes into nano's parameter tensors."""
        _, dec = self._get_or_create(flat_size)
        with torch.no_grad():
            return dec(glyph.unsqueeze(0).to(self._device)).squeeze(0).cpu()

    def train_step(self, weights: Dict[str, torch.Tensor], lr: float = 1e-3) -> float:
        """Single unsupervised reconstruction step; returns loss value.
        Call this during idle time to improve decode fidelity over generations."""
        flat = self._flatten_weights(weights).to(self._device)
        n = flat.shape[0]
        enc, dec = self._get_or_create(n)
        enc.train(); dec.train()
        params = list(enc.parameters()) + list(dec.parameters())
        opt = torch.optim.Adam(params, lr=lr)
        opt.zero_grad()
        z = enc(flat.unsqueeze(0))
        recon = dec(z)
        loss = F.mse_loss(recon, flat.unsqueeze(0))
        loss.backward()
        opt.step()
        enc.eval(); dec.eval()
        return loss.item()


# Singleton instance shared across lifecycle modules
_global_glyph_ae: Optional[NanoGlyphAutoencoder] = None


def get_glyph_ae(device: str = "cpu") -> NanoGlyphAutoencoder:
    global _global_glyph_ae
    if _global_glyph_ae is None:
        _global_glyph_ae = NanoGlyphAutoencoder(device)
    return _global_glyph_ae



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
    # 16-dim compressed glyph — populated by CompressionEngine when AE is available
    glyph: Optional[torch.Tensor] = field(default=None)
    flat_weight_size: int = 0


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
            raw_weights = {k: v.detach().cpu() for k, v in nano.state_dict().items()}
            # Encode to a 16-dim AE glyph for compressed generational memory
            glyph: Optional[torch.Tensor] = None
            flat_size = 0
            try:
                ae = get_glyph_ae()
                glyph = ae.encode(raw_weights)
                flat_vals = [v.reshape(-1) for v in raw_weights.values()]
                flat_size = sum(t.shape[0] for t in flat_vals)
                # Opportunistic train step to improve future decode fidelity
                ae.train_step(raw_weights)
            except Exception:
                pass
            deposits.append(
                Deposit(
                    deposit_id=uuid4().hex[:12],
                    rby_position=nano.rby_position.detach().cpu().tolist(),
                    hidden_dim=nano.hidden_dim,
                    weights=raw_weights,
                    centroid=self._compute_centroid(nano),
                    touch_count=nano.touch_count,
                    fitness_at_death=nano.fitness,
                    birth_cycle=nano.birth_cycle,
                    death_cycle=self.current_cycle,
                    glyph=glyph,
                    flat_weight_size=flat_size,
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

    def decode_glyph_for_init(self, deposit: Deposit) -> Optional[torch.Tensor]:
        """Decode a deposit's glyph into an approximate flat weight vector for
        seeding a new generational nano.  Returns None if glyph unavailable."""
        if deposit.glyph is None or deposit.flat_weight_size == 0:
            return None
        try:
            ae = get_glyph_ae()
            return ae.decode(deposit.glyph, deposit.flat_weight_size)
        except Exception:
            return None

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
                "glyph": deposit.glyph,
                "flat_weight_size": deposit.flat_weight_size,
            },
            path,
        )

    def load_all(self):
        self.deposits = []
        for path in self.store_dir.glob("*.pt"):
            data = torch.load(path, weights_only=False)
            # Provide defaults for fields added after initial save
            data.setdefault("glyph", None)
            data.setdefault("flat_weight_size", 0)
            data.setdefault("used", False)
            self.deposits.append(Deposit(**data))
