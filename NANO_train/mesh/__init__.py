"""Mesh package — Global compute mesh for distributed nano training."""
from .node import MeshNode, NodeInfo
from .discovery import DiscoveryService
from .transport import MeshTransport
from .latency import LatencyCompensator
from .respect import RespectSystem
from .task_queue import MeshTaskQueue
from .help_request import HelpRequestSystem
from .global_pool import GlobalComputePool, PoolMember, PoolJob
from .peer_discovery import PeerDiscovery, PeerInfo, PeerGroup

__all__ = [
    "MeshNode", "NodeInfo", "DiscoveryService", "MeshTransport",
    "LatencyCompensator", "RespectSystem", "MeshTaskQueue",
    "HelpRequestSystem", "GlobalComputePool", "PoolMember", "PoolJob",
    "PeerDiscovery", "PeerInfo", "PeerGroup",
]
