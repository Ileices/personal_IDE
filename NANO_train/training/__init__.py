"""Training package (v2 + legacy compatibility)."""

from .swarm_trainer import SwarmTrainer
from .midwife import ValidatedMidwife
from .independence import IndependenceTracker

# SwarmRuntime imports lifecycle which imports this package — lazy-load to
# break the circular import.  Callers should import directly:
#   from training.swarm_runtime import SwarmRuntime
def _lazy_runtime():
    from .swarm_runtime import SwarmRuntime
    return SwarmRuntime

try:
	from .trainer import NanoTrainer
except ImportError:
	NanoTrainer = None

__all__ = [
	"SwarmTrainer",
	"ValidatedMidwife",
	"IndependenceTracker",
	"NanoTrainer",
]
