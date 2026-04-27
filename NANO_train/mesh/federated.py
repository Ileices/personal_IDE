"""
mesh/federated.py — Federated Nano Aggregation
================================================
Combines nano populations from multiple machines into fitness-weighted
"super-nanos" using RBY spatial clustering.

Algorithm:
1. Collect all nanos across machines.
2. Stack their RBY positions → KMeans cluster (cluster ≈ semantic specialisation).
3. Within each cluster, group nanos by exact hidden_dim (only compatible
   architectures can be averaged).
4. Fitness-weighted average of all parameters.
5. Return list of super-nanos ready for injection into any SwarmLayer.

Why fitness-weighted and not plain mean?
  - Bad nanos (fitness≈0) would drag down well-trained ones.
  - Weighting by fitness preserves the learning signal of the strongest nanos.

Why cluster by RBY first?
  - Nanos in different RBY regions have learnt different semantic roles.
  - Averaging a perception-nano (high R) with an execution-nano (high Y)
    would destroy both specialists. Clustering prevents cross-role corruption.
"""
from __future__ import annotations

from typing import Dict, List, TYPE_CHECKING

import torch

if TYPE_CHECKING:
    from core.nano import Nano


class FederatedAggregator:
    """
    Combines nano populations from multiple machines/workers into
    fitness-weighted super-nanos.

    Designed to plug into future mesh/distributed SwarmRuntime.
    """

    def __init__(self, min_cluster_size: int = 2, n_init: int = 10):
        """
        Args:
            min_cluster_size: clusters smaller than this are returned as-is
                              (no averaging — avoids identity collapse on lone nanos).
            n_init:           KMeans random restarts for stable clustering.
        """
        self.min_cluster_size = min_cluster_size
        self.n_init = n_init

    def aggregate(self, nanos_by_machine: Dict[str, List["Nano"]]) -> List["Nano"]:
        """
        Aggregate nanos from multiple machines.

        Args:
            nanos_by_machine: {machine_id: [Nano, ...]}

        Returns:
            List of averaged super-nanos (or originals for unclustered lone nanos).
        """
        all_nanos: List["Nano"] = []
        for nanos in nanos_by_machine.values():
            all_nanos.extend(nanos)

        if len(all_nanos) < self.min_cluster_size:
            return all_nanos

        # ── Cluster by RBY position ────────────────────────────────────
        positions = torch.stack(
            [n.rby_position.detach().cpu() for n in all_nanos]
        ).numpy()  # (N, 3)

        try:
            from sklearn.cluster import KMeans
        except ImportError as e:
            raise ImportError(
                "FederatedAggregator requires scikit-learn: pip install scikit-learn"
            ) from e

        n_clusters = max(1, len(all_nanos) // 5)
        labels = KMeans(n_clusters=n_clusters, n_init=self.n_init).fit_predict(positions)

        super_nanos: List["Nano"] = []
        for cluster_id in range(n_clusters):
            members = [n for n, lbl in zip(all_nanos, labels) if lbl == cluster_id]
            if not members:
                continue
            super_nanos.extend(self._aggregate_cluster(members))

        return super_nanos

    def _aggregate_cluster(self, members: List["Nano"]) -> List["Nano"]:
        """
        Within a cluster, group by hidden_dim and average compatible nanos.

        Args:
            members: nanos that share a RBY cluster.

        Returns:
            List of (possibly averaged) nanos.
        """
        # Group by hidden_dim — only architecturally identical nanos can merge
        from collections import defaultdict
        by_dim: Dict[int, List["Nano"]] = defaultdict(list)
        for n in members:
            by_dim[n.hidden_dim].append(n)

        result = []
        for hidden_dim, group in by_dim.items():
            if len(group) < self.min_cluster_size:
                # Too small to aggregate — pass through unchanged
                result.extend(group)
                continue
            averaged = self._weighted_average(group)
            if averaged is not None:
                result.append(averaged)
            else:
                result.extend(group)
        return result

    def _weighted_average(self, group: List["Nano"]) -> "Nano | None":
        """
        Fitness-weighted average of nano parameters.

        Mathematical invariant:
            averaged_param = Σ (fitness_i / Σ fitness_j) * param_i

        If all fitness values are zero, averaging is meaningless → return None
        (caller will fall back to original nanos).
        """
        from core.nano import Nano

        total_fitness = sum(n.fitness for n in group)
        if total_fitness < 1e-9:
            return None

        template = group[0]
        super_nano = Nano(
            d_model=template.up.in_features,
            hidden_dim=template.hidden_dim,
            rby_seed=template.rby_position.detach().tolist(),
        )

        with torch.no_grad():
            for name, param in super_nano.named_parameters():
                param.zero_()
                for member in group:
                    weight = member.fitness / total_fitness
                    member_param = dict(member.named_parameters())[name]
                    if member_param.shape == param.shape:
                        param.add_(weight * member_param.detach().cpu())

        super_nano.fitness = total_fitness / len(group)
        return super_nano

    @staticmethod
    def _compatible(n1: "Nano", n2: "Nano") -> bool:
        """
        Two nanos are compatible for aggregation iff they have the same
        hidden_dim AND input dimensionality (d_model).
        """
        return (
            n1.hidden_dim == n2.hidden_dim
            and n1.up.in_features == n2.up.in_features
        )
