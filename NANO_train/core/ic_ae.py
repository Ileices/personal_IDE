"""
IC-AE Recursive Infection Engine.
When nanos process data, they "infect" it — each data chunk spawns a child
IC-AE sandbox where a specialized nano is created for that specific data.
Recursion continues until compute/storage limits are reached.
"""
from __future__ import annotations
import time
import uuid
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from enum import Enum

from .rby import RBYVector

log = logging.getLogger("ic_ae")


class InfectionType(Enum):
    FILESYSTEM = "filesystem"    # Directory → subdirectories → files
    CODEBASE = "codebase"        # Repo → modules → files → functions
    DATABASE = "database"        # DB → tables → rows
    TEXT = "text"                 # Document → paragraphs → sentences → words
    VISUAL = "visual"            # Screen → regions → elements → pixels
    NETWORK = "network"          # Session → packets → payloads
    MEDIA = "media"              # File → frames/segments → features
    STREAM = "stream"            # Continuous — never reaches Λ until stream ends
    GENERIC = "generic"


@dataclass
class ICAESandbox:
    """
    An isolated execution environment for a child nano spawned by IC-AE infection.
    Each sandbox represents one level of recursive data specialization.
    """
    sandbox_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    parent_id: Optional[str] = None
    depth: int = 0
    infection_type: InfectionType = InfectionType.GENERIC
    data_path: str = ""
    rby: RBYVector = field(default_factory=RBYVector)
    nano_id: Optional[str] = None
    children: List[str] = field(default_factory=list)  # Child sandbox IDs
    created_at: float = field(default_factory=time.time)
    data_size_bytes: int = 0
    is_active: bool = True

    @property
    def has_children(self) -> bool:
        return len(self.children) > 0


class ICAEEngine:
    """
    IC-AE Recursive Infection Engine.
    Manages the fractal hierarchy of sandboxes that form when nanos process data.
    Each level of recursion produces more specialized, narrower nanos.
    """

    def __init__(self, max_depth: int = 10, max_children: int = 1000,
                 max_total_sandboxes: int = 100_000):
        self.max_depth = max_depth
        self.max_children = max_children
        self.max_total = max_total_sandboxes
        self._sandboxes: Dict[str, ICAESandbox] = {}
        self._roots: List[str] = []
        self._nano_factory: Optional[Callable] = None

    @property
    def total_sandboxes(self) -> int:
        return len(self._sandboxes)

    @property
    def active_sandboxes(self) -> int:
        return sum(1 for s in self._sandboxes.values() if s.is_active)

    def set_nano_factory(self, factory: Callable):
        """Set the factory function that creates nanos for sandboxes."""
        self._nano_factory = factory

    def create_root(self, data_path: str, infection_type: InfectionType,
                    rby: Optional[RBYVector] = None) -> ICAESandbox:
        """Create a root-level IC-AE sandbox for a data source."""
        sandbox = ICAESandbox(
            parent_id=None,
            depth=0,
            infection_type=infection_type,
            data_path=data_path,
            rby=rby or RBYVector(),
        )
        self._sandboxes[sandbox.sandbox_id] = sandbox
        self._roots.append(sandbox.sandbox_id)
        log.debug(f"IC-AE root created: {sandbox.sandbox_id} [{infection_type.value}] {data_path}")
        return sandbox

    def infect(self, parent_id: str, data_path: str,
               infection_type: Optional[InfectionType] = None,
               rby: Optional[RBYVector] = None,
               data_size: int = 0) -> Optional[ICAESandbox]:
        """
        Spawn a child IC-AE sandbox from a parent.
        Returns None if limits reached (depth, count, etc.)
        """
        parent = self._sandboxes.get(parent_id)
        if not parent:
            log.warning(f"IC-AE infection failed: parent {parent_id} not found")
            return None

        if parent.depth >= self.max_depth:
            log.debug(f"IC-AE depth limit ({self.max_depth}) at {parent_id}")
            return None

        if len(parent.children) >= self.max_children:
            log.debug(f"IC-AE children limit ({self.max_children}) at {parent_id}")
            return None

        if self.total_sandboxes >= self.max_total:
            log.debug(f"IC-AE total limit ({self.max_total}) reached")
            return None

        child = ICAESandbox(
            parent_id=parent_id,
            depth=parent.depth + 1,
            infection_type=infection_type or parent.infection_type,
            data_path=data_path,
            rby=rby or parent.rby,
            data_size_bytes=data_size,
        )
        self._sandboxes[child.sandbox_id] = child
        parent.children.append(child.sandbox_id)

        log.debug(f"IC-AE infection: {parent_id} → {child.sandbox_id} "
                  f"[depth={child.depth}] {data_path}")
        return child

    def get_sandbox(self, sandbox_id: str) -> Optional[ICAESandbox]:
        return self._sandboxes.get(sandbox_id)

    def get_children(self, sandbox_id: str) -> List[ICAESandbox]:
        sandbox = self._sandboxes.get(sandbox_id)
        if not sandbox:
            return []
        return [self._sandboxes[cid] for cid in sandbox.children
                if cid in self._sandboxes]

    def get_ancestors(self, sandbox_id: str) -> List[ICAESandbox]:
        """Get all ancestors from sandbox up to root."""
        result = []
        current = self._sandboxes.get(sandbox_id)
        while current and current.parent_id:
            parent = self._sandboxes.get(current.parent_id)
            if parent:
                result.append(parent)
            current = parent
        return result

    def get_hierarchy_depth(self, sandbox_id: str) -> int:
        children = self.get_children(sandbox_id)
        if not children:
            return 0
        return 1 + max(self.get_hierarchy_depth(c.sandbox_id) for c in children)

    def deactivate_subtree(self, sandbox_id: str):
        """Deactivate a sandbox and all its descendants (for compression)."""
        sandbox = self._sandboxes.get(sandbox_id)
        if not sandbox:
            return
        sandbox.is_active = False
        for child_id in sandbox.children:
            self.deactivate_subtree(child_id)

    def collect_leaf_nanos(self, root_id: Optional[str] = None) -> List[str]:
        """Get all leaf (no children) nano IDs for deep learning during compression."""
        result = []
        roots = [root_id] if root_id else self._roots
        for rid in roots:
            self._collect_leaves(rid, result)
        return result

    def _collect_leaves(self, sandbox_id: str, result: List[str]):
        sandbox = self._sandboxes.get(sandbox_id)
        if not sandbox:
            return
        if not sandbox.children and sandbox.nano_id:
            result.append(sandbox.nano_id)
        for child_id in sandbox.children:
            self._collect_leaves(child_id, result)

    def cross_analyze(self) -> Dict[str, Any]:
        """
        Cross-analyze all IC-AE hierarchies for compression.
        Returns statistics and patterns found across the fractal tree.
        """
        stats = {
            "total_sandboxes": self.total_sandboxes,
            "active": self.active_sandboxes,
            "roots": len(self._roots),
            "max_depth_found": 0,
            "avg_branching": 0.0,
            "rby_distribution": {"r": 0.0, "b": 0.0, "y": 0.0},
            "type_counts": {},
        }

        total_children = 0
        parents_with_children = 0

        for sandbox in self._sandboxes.values():
            depth = sandbox.depth
            if depth > stats["max_depth_found"]:
                stats["max_depth_found"] = depth
            if sandbox.children:
                total_children += len(sandbox.children)
                parents_with_children += 1
            stats["rby_distribution"]["r"] += sandbox.rby.r
            stats["rby_distribution"]["b"] += sandbox.rby.b
            stats["rby_distribution"]["y"] += sandbox.rby.y
            itype = sandbox.infection_type.value
            stats["type_counts"][itype] = stats["type_counts"].get(itype, 0) + 1

        n = max(1, self.total_sandboxes)
        stats["rby_distribution"] = {k: v / n for k, v in stats["rby_distribution"].items()}
        if parents_with_children > 0:
            stats["avg_branching"] = total_children / parents_with_children

        return stats
