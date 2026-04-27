"""
Chromatic Index — O(log N) nano lookup in RBY space (v2).

Spatial index of nano positions using KD-tree. Enables fast
nearest-neighbor queries so the SwarmRouter can find the best
candidate nanos for any input token without scoring all N nanos.

Must be rebuilt when nanos are born/die (pool changes).
Uses scipy.spatial.KDTree on the 3D RBY coordinates.

Adapted from nano_sea_v2_reference.py.
"""
import torch
import numpy as np
from typing import Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import CHROMATIC_CANDIDATES


class ChromaticIndex:
    """
    Spatial index of nano positions in RBY space using KD-tree.
    Enables O(log N) lookup of nearest nanos for any input RBY projection.

    Must be rebuilt when nanos are born/die (pool changes).
    """

    def __init__(self, nano_positions: Optional[torch.Tensor] = None):
        """
        Args:
            nano_positions: (N, 3) tensor of RBY positions
        """
        self.tree = None
        self._num_nanos = 0
        if nano_positions is not None:
            self.rebuild(nano_positions)

    def rebuild(self, nano_positions: torch.Tensor):
        """Rebuild the KD-tree from current nano positions."""
        from scipy.spatial import KDTree

        positions_np = nano_positions.detach().cpu().numpy()
        self._num_nanos = positions_np.shape[0]
        self.tree = KDTree(positions_np)

    def query(
        self,
        rby_batch: torch.Tensor,
        k: int = CHROMATIC_CANDIDATES,
    ) -> torch.Tensor:
        """
        Find k nearest nanos for each input RBY position.

        Args:
            rby_batch: (..., 3) — any shape with last dim = 3
            k: number of nearest neighbors

        Returns:
            indices: (..., k) — indices into nano pool
        """
        if self.tree is None:
            # Fallback: random indices (before index is built)
            return torch.randint(
                0, max(1, self._num_nanos),
                (*rby_batch.shape[:-1], k),
                device=rby_batch.device,
            )

        original_shape = rby_batch.shape[:-1]
        device = rby_batch.device
        positions = rby_batch.detach().cpu().numpy().reshape(-1, 3)

        # Clamp k to pool size
        actual_k = min(k, self._num_nanos)
        if actual_k < 1:
            return torch.zeros(
                *original_shape, k, dtype=torch.long, device=device
            )

        _, indices = self.tree.query(positions, k=actual_k)

        # scipy returns int array; if actual_k == 1, shape is (N,) not (N, 1)
        indices = np.atleast_2d(indices)
        if indices.shape[-1] < k:
            # Pad with random indices if pool is smaller than k
            pad = np.random.randint(
                0, self._num_nanos,
                (indices.shape[0], k - indices.shape[-1]),
            )
            indices = np.concatenate([indices, pad], axis=-1)

        indices_tensor = torch.tensor(
            indices, dtype=torch.long, device=device
        )
        return indices_tensor.reshape(*original_shape, k)

    @property
    def num_nanos(self) -> int:
        return self._num_nanos

    @property
    def is_built(self) -> bool:
        return self.tree is not None
