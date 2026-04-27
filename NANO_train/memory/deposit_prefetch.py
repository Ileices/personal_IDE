"""
memory/deposit_prefetch.py — Deposit-Aware RBY Prefetcher
==========================================================
Before each forward pass, this predicts which nanos the router will activate
(using ChromaticIndex KD-tree lookup in RBY space) and ensures they are hot
on GPU before the kernel fires.

Also queries DepositStore for recently-dead nanos whose weights may be
reincarnated by the spawner — these are soft-prefetched so deposit replay
has no disk-load latency.

Architecture:
    token_ids
        ↓  (embedding lookup)
    token_embeddings  ─(nn.Linear(D_MODEL,3)+softmax)→  per-token RBY vectors
        ↓                                                       ↓
    (model.forward)                        chromatic_index.query(rby, k=PREFETCH_BATCH)
                                                ↓
                                       memory_manager.prefetch(nano_ids)
"""
from __future__ import annotations

from typing import Dict, List, TYPE_CHECKING

import torch
import torch.nn as nn

from config import CHROMATIC_CANDIDATES, D_MODEL, PREFETCH_BATCH

if TYPE_CHECKING:
    from core.chromatic_index import ChromaticIndex
    from lifecycle.compression import DepositStore
    from memory.paging import NanoMemoryManager


class RBYProjector(nn.Module):
    """
    Lightweight linear layer that projects D_MODEL token embeddings to 3D RBY space.

    Kept separate from the main model so it can be trained independently and
    replaced without touching the NanoSeaModel checkpoints.
    """

    def __init__(self, d_model: int = D_MODEL):
        super().__init__()
        self.proj = nn.Linear(d_model, 3, bias=False)

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        """
        Args:
            embeddings: (B, S, D_MODEL)

        Returns:
            rby: (B, S, 3)  — softmax-normalised so each vector sums to 1
        """
        logits = self.proj(embeddings)          # (B, S, 3)
        return torch.softmax(logits, dim=-1)     # simplex constraint


class DepositAwarePrefetcher:
    """
    Predicts which nanos will be activated in the next forward pass and
    preloads them into GPU cache via NanoMemoryManager.

    Two sources are combined:
    1. ChromaticIndex query  — living nanos closest to input token RBY positions
    2. DepositStore query    — recently-dead nanos whose RBY is similar
                               (so spawner can do zero-latency deposit replay)
    """

    def __init__(
        self,
        chromatic_index: "ChromaticIndex",
        deposit_store: "DepositStore",
        index_to_id: Dict[int, str],
        d_model: int = D_MODEL,
        prefetch_batch: int = PREFETCH_BATCH,
        chromatic_k: int = CHROMATIC_CANDIDATES,
    ):
        """
        Args:
            chromatic_index:  KD-tree over living nano RBY positions.
            deposit_store:    Store of compressed (dead) nano deposits.
            index_to_id:      Maps nano pool-index (int) → nano_id string.
                              Format: "{layer_idx}_{pool_idx}".
            d_model:          Embedding dimensionality.
            prefetch_batch:   Total nanos to preload before each forward pass.
            chromatic_k:      How many candidates to fetch from ChromaticIndex.
        """
        self.chromatic_index = chromatic_index
        self.deposit_store = deposit_store
        self.index_to_id = index_to_id
        self.prefetch_batch = prefetch_batch
        self.chromatic_k = chromatic_k

        self.rby_projector = RBYProjector(d_model)

    def update_index_map(self, index_to_id: Dict[int, str]):
        """Call after lifecycle events (spawn/compress) to keep mapping current."""
        self.index_to_id = index_to_id

    def predict_needed(self, token_rby_batch: torch.Tensor) -> List[str]:
        """
        Given per-token RBY vectors, return the nano_ids most likely to be
        activated during the upcoming forward pass.

        Args:
            token_rby_batch: (B, S, 3) — softmax-normalised RBY per token

        Returns:
            List of nano_id strings (de-duplicated, capped at prefetch_batch).
        """
        if not self.chromatic_index.is_built:
            return []

        # Flatten to (B*S, 3) for bulk KD-tree query
        flat_rby = token_rby_batch.detach().reshape(-1, 3)  # (N_tokens, 3)
        # Query: returns (N_tokens, chromatic_k) indices into nano pool
        candidate_indices = self.chromatic_index.query(flat_rby, k=self.chromatic_k)

        # Convert pool indices → nano_id strings, de-duplicate
        seen: set = set()
        nano_ids: List[str] = []
        flat = candidate_indices.view(-1).tolist()
        for idx in flat:
            nid = self.index_to_id.get(int(idx))
            if nid is not None and nid not in seen:
                seen.add(nid)
                nano_ids.append(nid)
                if len(nano_ids) >= self.prefetch_batch:
                    break

        # Fill remaining slots with nearest-RBY deposit candidates
        # (enables zero-latency deposit replay by the spawner)
        remaining = self.prefetch_batch - len(nano_ids)
        if remaining > 0 and self.deposit_store.deposits:
            # Use the mean RBY of the batch as the query
            mean_rby = flat_rby.mean(dim=0).tolist()  # [r, b, y]
            dep_candidates = self.deposit_store.get_nearest_rby(mean_rby, k=remaining)
            for dep in dep_candidates:
                dep_id = f"deposit_{dep.deposit_id}"
                if dep_id not in seen:
                    seen.add(dep_id)
                    nano_ids.append(dep_id)

        return nano_ids

    def prefetch_for_batch(
        self,
        input_ids: torch.Tensor,
        embedding_layer: nn.Embedding,
        memory_manager: "NanoMemoryManager",
    ):
        """
        Full pipeline: token ids → RBY projection → ChromaticIndex query → GPU prefetch.

        Args:
            input_ids:       (B, S) token id tensor
            embedding_layer: the model's shared embedding (nn.Embedding)
            memory_manager:  the NanoMemoryManager to prefetch into
        """
        with torch.no_grad():
            embeds = embedding_layer(input_ids.to(next(embedding_layer.parameters()).device))
            # Move projector to same device as embeddings
            device = embeds.device
            self.rby_projector = self.rby_projector.to(device)
            rby = self.rby_projector(embeds)   # (B, S, 3)

        nano_ids = self.predict_needed(rby)
        if nano_ids:
            memory_manager.prefetch(nano_ids)

    def build_rby_from_input(
        self,
        input_ids: torch.Tensor,
        embedding_layer: nn.Embedding,
    ) -> torch.Tensor:
        """
        Utility: project input_ids to RBY space without triggering prefetch.
        Useful for analysis, tests, and ChromaticIndex rebuilds.

        Returns:
            (B, S, 3) RBY tensor
        """
        with torch.no_grad():
            embeds = embedding_layer(input_ids.to(next(embedding_layer.parameters()).device))
            device = embeds.device
            self.rby_projector = self.rby_projector.to(device)
            return self.rby_projector(embeds)
