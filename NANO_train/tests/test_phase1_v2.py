"""
Phase 1 Validation — Smoke test for the v2 Nano Sea core.

Tests:
1. Nano instantiation + forward pass
2. SwarmRouter produces correct shapes
3. SwarmLayer processes through attention + routing
4. NanoSeaModel end-to-end: input_ids → logits
5. Generate produces extended sequence
6. RBY v2 functions (aitchison_distance, compute_uf_io, update_rby)
"""
import sys
from pathlib import Path
# Add NANO_train to path so 'core' and 'config' resolve
_nano_train = str(Path(__file__).resolve().parent.parent)
if _nano_train not in sys.path:
    sys.path.insert(0, _nano_train)

import torch
print("=" * 60)
print("NANO SEA v2 — Phase 1 Validation")
print("=" * 60)

# ---- Test 1: Nano ----
print("\n[1] Nano instantiation + forward...")
from core.nano import Nano
nano = Nano(d_model=256, hidden_dim=128)
x = torch.randn(2, 16, 256)
y = nano(x)
assert y.shape == (2, 16, 256), f"Expected (2, 16, 256), got {y.shape}"
print(f"    PASS — {nano}")
print(f"    Params: {nano.param_count:,}")
print(f"    RBY position: {nano.rby_position.data.tolist()}")

# ---- Test 2: SwarmRouter ----
print("\n[2] SwarmRouter (direct scoring, 8 nanos)...")
from core.router import SwarmRouter, soft_k_selection
router = SwarmRouter(d_model=256, num_nanos=8, top_k_max=4)
x = torch.randn(2, 16, 256)
weights, indices = router(x)
assert weights.shape == (2, 16, 4), f"Weights shape wrong: {weights.shape}"
assert indices.shape == (2, 16, 4), f"Indices shape wrong: {indices.shape}"
# Weights should sum to ~1
weight_sums = weights.sum(dim=-1)
assert (weight_sums - 1.0).abs().max() < 0.01, f"Weights don't sum to 1: {weight_sums}"
print(f"    PASS — weights: {weights.shape}, indices: {indices.shape}")
print(f"    Weight sums (should be ~1.0): min={weight_sums.min():.4f}, max={weight_sums.max():.4f}")

# ---- Test 3: soft_k_selection ----
print("\n[3] soft_k_selection differentiability...")
scores = torch.randn(2, 16, 8, requires_grad=True)
k_logits = torch.randn(2, 16, 4, requires_grad=True)
ew, ti = soft_k_selection(scores, k_logits, 4)
loss = ew.sum()
loss.backward()
assert scores.grad is not None, "Gradient didn't flow through scores"
assert k_logits.grad is not None, "Gradient didn't flow through k_logits"
print(f"    PASS — Gradients flow through soft k-selection")

# ---- Test 4: SwarmLayer ----
print("\n[4] SwarmLayer forward pass...")
from core.swarm_layer import SwarmLayer
layer = SwarmLayer(d_model=256, n_heads=4, top_k=4)
x = torch.randn(2, 16, 256)
out, touch = layer(x)
assert out.shape == (2, 16, 256), f"Layer output shape wrong: {out.shape}"
assert "indices" in touch and "weights" in touch
print(f"    PASS — output: {out.shape}")
print(f"    Touch event keys: {list(touch.keys())}")
print(f"    Nanos in layer: {layer.num_nanos}")

# ---- Test 5: NanoSeaModel end-to-end ----
print("\n[5] NanoSeaModel end-to-end...")
from core.swarm_model import NanoSeaModel
model = NanoSeaModel(
    vocab_size=8192,
    d_model=256,
    n_heads=4,
    n_layers=3,
    nanos_per_layer=8,
    nano_hidden_dim=128,
    top_k=4,
)
input_ids = torch.randint(0, 8192, (2, 32))
logits, touch_events = model(input_ids)
assert logits.shape == (2, 32, 8192), f"Logits shape wrong: {logits.shape}"
assert len(touch_events) == 3, f"Expected 3 touch events, got {len(touch_events)}"
print(f"    PASS — logits: {logits.shape}")
print(f"    {model}")
summary = model.nano_summary()
print(f"    Total nanos: {summary['total_nanos']}")
print(f"    Total params: {summary['total_params']:,}")

# ---- Test 6: Gradient flow ----
print("\n[6] Gradient flow through full model...")
target = torch.randint(0, 8192, (2, 32))
loss = torch.nn.functional.cross_entropy(
    logits.view(-1, 8192), target.view(-1)
)
loss.backward()
# Check that nano parameters got gradients
any_grad = False
for nano in model.all_nanos():
    if nano.up.weight.grad is not None and nano.up.weight.grad.abs().sum() > 0:
        any_grad = True
        break
assert any_grad, "No gradients reached nanos!"
print(f"    PASS — CE loss: {loss.item():.4f}, gradients reach nanos")

# ---- Test 7: Generate ----
print("\n[7] Autoregressive generation...")
seed = torch.randint(0, 8192, (1, 8))
generated = model.generate(seed, max_new_tokens=16, temperature=0.8)
assert generated.shape == (1, 24), f"Generated shape wrong: {generated.shape}"
print(f"    PASS — generated: {generated.shape} (8 seed + 16 new)")

# ---- Test 8: RBY v2 functions ----
print("\n[8] RBY v2 functions...")
from core.rby import aitchison_distance, compute_uf_io, update_rby

a = torch.tensor([0.5, 0.3, 0.2])
b = torch.tensor([0.2, 0.5, 0.3])
dist = aitchison_distance(a, b)
assert dist.item() > 0, "Aitchison distance should be positive"
print(f"    Aitchison distance: {dist.item():.4f}")

uf, io = compute_uf_io(success=0.8, error=0.2, complexity=0.5)
assert uf > 0 and io > 0, "UF and IO should be positive"
print(f"    UF={uf:.4f}, IO={io:.4f}")

rby = (0.4, 0.3, 0.3)
new_rby = update_rby(rby, uf, io, success=0.8, error=0.2)
assert abs(sum(new_rby) - 1.0) < 0.02, f"RBY should sum to ~1: {sum(new_rby)}"
print(f"    RBY update: {rby} → ({new_rby[0]:.3f}, {new_rby[1]:.3f}, {new_rby[2]:.3f})")

# ---- Test 9: TouchTensor ----
print("\n[9] TouchTensor tracking...")
from core.touch_tensor import TouchTensor
tt = TouchTensor(num_nanos=24)
tt.update(touch_events)
print(f"    Total activations: {tt.total_activations}")
print(f"    Utilization range: [{tt.utilization().min():.4f}, {tt.utilization().max():.4f}]")
under = tt.underutilized()
print(f"    Underutilized nanos: {len(under)}")

# ---- Test 10: ChromaticIndex ----
print("\n[10] ChromaticIndex...")
try:
    from core.chromatic_index import ChromaticIndex
    positions = torch.rand(24, 3)
    positions = positions / positions.sum(dim=-1, keepdim=True)  # Normalize to simplex
    ci = ChromaticIndex(positions)
    query = torch.tensor([[0.5, 0.3, 0.2]])
    result = ci.query(query, k=5)
    assert result.shape == (1, 5), f"ChromaticIndex query shape wrong: {result.shape}"
    print(f"    PASS — query result: {result.shape}")
    print(f"    Nearest 5 nanos: {result[0].tolist()}")
except ImportError as e:
    print(f"    SKIP (scipy not installed): {e}")

print("\n" + "=" * 60)
print("ALL PHASE 1 TESTS PASSED")
print("=" * 60)
