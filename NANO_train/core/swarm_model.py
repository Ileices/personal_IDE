"""
Nano Sea Model — The complete model (v2).

Architecture:
    SharedEmbedding → [SwarmLayer × N] → SharedOutputHead

The shared layers (embedding + output head) ensure all nanos speak
the same vector language. The swarm layers contain the nano pools
where specialization happens.

This class is the entry point for:
- Training (forward pass + CE loss)
- Inference (autoregressive generation)
- Lifecycle (access to all nano pools across layers)

Adapted from nano_sea_v2_reference.py.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Dict, Optional, Tuple

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    VOCAB_SIZE, D_MODEL, N_HEADS, N_LAYERS,
    DEFAULT_HIDDEN_DIM, DEFAULT_TOP_K, MAX_SEQ_LEN,
)
from core.nano import Nano
from core.swarm_layer import SwarmLayer


class NanoSeaModel(nn.Module):
    """
    The complete Nano Sea model.

    SharedEmbedding → [SwarmLayer × N] → SharedOutputHead
    """

    def __init__(
        self,
        vocab_size: int = VOCAB_SIZE,
        d_model: int = D_MODEL,
        n_heads: int = N_HEADS,
        n_layers: int = N_LAYERS,
        nanos_per_layer: int = 8,
        nano_hidden_dim: int = DEFAULT_HIDDEN_DIM,
        top_k: int = DEFAULT_TOP_K,
    ):
        super().__init__()
        self.d_model = d_model
        self.max_seq_len = MAX_SEQ_LEN

        # Shared embedding
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoding = nn.Embedding(MAX_SEQ_LEN, d_model)

        # Swarm layers — each with its own nano pool
        self.layers = nn.ModuleList()
        for _ in range(n_layers):
            pool = [
                Nano(d_model, nano_hidden_dim)
                for _ in range(nanos_per_layer)
            ]
            layer = SwarmLayer(d_model, n_heads, pool, top_k)
            self.layers.append(layer)

        # Shared output head
        self.ln_final = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size)

        self._init_weights()

    def _init_weights(self):
        nn.init.normal_(self.embedding.weight, std=0.02)
        nn.init.normal_(self.pos_encoding.weight, std=0.02)
        nn.init.zeros_(self.head.bias)

    def forward(
        self, input_ids: torch.Tensor,
    ) -> Tuple[torch.Tensor, List[Dict[str, torch.Tensor]]]:
        """
        Args:
            input_ids: (B, S) token IDs

        Returns:
            logits: (B, S, vocab_size)
            all_touch_events: list of touch events from each layer
        """
        B, S = input_ids.shape

        # Embed
        tok_emb = self.embedding(input_ids)
        pos_ids = torch.arange(S, device=input_ids.device).unsqueeze(0)
        pos_emb = self.pos_encoding(pos_ids)
        h = tok_emb + pos_emb

        # Causal mask for autoregressive generation
        mask = torch.triu(
            torch.ones(S, S, device=h.device), diagonal=1
        ).bool()

        # Swarm layers
        all_touch_events: List[Dict[str, torch.Tensor]] = []
        for layer in self.layers:
            h, touch = layer(h, mask)
            all_touch_events.append(touch)

        # Output head
        h = self.ln_final(h)
        logits = self.head(h)

        return logits, all_touch_events

    @torch.no_grad()
    def generate(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int = 100,
        temperature: float = 0.8,
    ) -> torch.Tensor:
        """Autoregressive generation."""
        for _ in range(max_new_tokens):
            x = input_ids[:, -self.max_seq_len:]
            logits, _ = self(x)
            logits = logits[:, -1, :] / temperature
            probs = F.softmax(logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)
            input_ids = torch.cat([input_ids, next_token], dim=1)
        return input_ids

    # ----- Lifecycle helpers -----

    @property
    def total_nanos(self) -> int:
        return sum(len(layer.nano_pool) for layer in self.layers)

    @property
    def total_params(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def all_nanos(self) -> List[Nano]:
        """Flat list of all nanos across all layers."""
        nanos = []
        for layer in self.layers:
            nanos.extend(layer.nano_pool)
        return nanos

    def layer_nanos(self, layer_idx: int) -> List[Nano]:
        """Nanos in a specific layer."""
        return list(self.layers[layer_idx].nano_pool)

    def nano_summary(self) -> Dict:
        """Summary stats for monitoring."""
        nanos = self.all_nanos()
        fitnesses = [n.fitness for n in nanos]
        touches = [n.touch_count for n in nanos]
        params = [n.param_count for n in nanos]
        return {
            "total_nanos": len(nanos),
            "total_params": self.total_params,
            "avg_fitness": sum(fitnesses) / len(fitnesses) if fitnesses else 0,
            "avg_touch_count": sum(touches) / len(touches) if touches else 0,
            "min_fitness": min(fitnesses) if fitnesses else 0,
            "max_fitness": max(fitnesses) if fitnesses else 0,
            "total_nano_params": sum(params),
        }

    def __repr__(self) -> str:
        return (
            f"NanoSeaModel(layers={len(self.layers)}, "
            f"nanos={self.total_nanos}, params={self.total_params:,})"
        )
