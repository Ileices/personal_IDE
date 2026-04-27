#!/usr/bin/env python3
"""
EXPERIMENT 03: WEA Dual-Network Experiment
==========================================
Actually builds WEANano wrappers around real PyTorch nanos, trains them,
and measures whether the ancestral/personal blend works as theorized.

What we test:
  1. Does the frozen ancestral network actually provide useful starting knowledge?
  2. Does the personal network learn to improve beyond ancestral performance?
  3. Does the blend ratio transition correctly at T_B?
  4. Does the system resist catastrophic forgetting?
  5. What is the ACTUAL training curve shape?

REQUIRES: torch (pip install torch)
"""

import math
import sys
import time

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("WARNING: PyTorch not available. Skipping neural network experiments.")
    print("Install with: pip install torch")

SEPARATOR = "=" * 70


# ---- WEA Implementation (from spec, with fixes) ----
class WEANano(nn.Module):
    """Faithful implementation of the spec's WEA wrapper."""
    
    def __init__(self, nano_cls, nano_kwargs, deposit_state_dict=None,
                 G=1, phi=0.5, alpha=0.01, w_p=0.1, r=0.05):
        super().__init__()
        
        self.ancestral_net = nano_cls(**nano_kwargs)
        if deposit_state_dict:
            self.ancestral_net.load_state_dict(deposit_state_dict)
        for p in self.ancestral_net.parameters():
            p.requires_grad = False
        
        self.personal_net = nano_cls(**nano_kwargs)
        
        self.W_A = G * phi * alpha
        self.w_p = w_p
        self.r = r
        self.t = 0
        
        if self.r > 0 and self.w_p > 0 and self.W_A > 0:
            self.T_B = math.log(
                (self.W_A * self.r) / (self.w_p * (1 + self.r)) + 1
            ) / math.log(1 + self.r)
        else:
            self.T_B = float('inf')
    
    @property
    def W_P(self):
        if self.t == 0 or self.r == 0:
            return 0.0
        return self.w_p * (1 + self.r) * ((1 + self.r)**self.t - 1) / self.r
    
    @property
    def ancestral_ratio(self):
        total = self.W_A + self.W_P
        return self.W_A / total if total > 0 else 1.0
    
    def forward(self, x):
        with torch.no_grad():
            ancestral_out = self.ancestral_net(x)
        personal_out = self.personal_net(x)
        
        a_ratio = self.ancestral_ratio
        p_ratio = 1.0 - a_ratio
        return a_ratio * ancestral_out + p_ratio * personal_out
    
    def step_experience(self):
        self.t += 1


# ---- WEA with Soft Cap Fix ----
class WEANanoCapped(nn.Module):
    """WEA with soft-capped personal weight to prevent explosion."""
    
    def __init__(self, nano_cls, nano_kwargs, deposit_state_dict=None,
                 G=1, phi=0.5, alpha=0.01, w_p=0.1, r=0.05, W_P_max=10.0):
        super().__init__()
        
        self.ancestral_net = nano_cls(**nano_kwargs)
        if deposit_state_dict:
            self.ancestral_net.load_state_dict(deposit_state_dict)
        for p in self.ancestral_net.parameters():
            p.requires_grad = False
        
        self.personal_net = nano_cls(**nano_kwargs)
        
        self.W_A = G * phi * alpha
        self.w_p = w_p
        self.r = r
        self.t = 0
        self.W_P_max = W_P_max
        
        # T_B for capped version: when W_P_max * (1 - exp(-k*t)) = W_A
        # k = r (use compounding rate as growth constant)
        if self.W_A > 0 and self.W_P_max > self.W_A:
            self.T_B = -math.log(1 - self.W_A / self.W_P_max) / self.r
        else:
            self.T_B = float('inf')
    
    @property
    def W_P(self):
        """Soft-capped personal weight: approaches W_P_max asymptotically."""
        return self.W_P_max * (1 - math.exp(-self.r * self.t))
    
    @property
    def ancestral_ratio(self):
        total = self.W_A + self.W_P
        return self.W_A / total if total > 0 else 1.0
    
    def forward(self, x):
        with torch.no_grad():
            ancestral_out = self.ancestral_net(x)
        personal_out = self.personal_net(x)
        
        a_ratio = self.ancestral_ratio
        p_ratio = 1.0 - a_ratio
        return a_ratio * ancestral_out + p_ratio * personal_out
    
    def step_experience(self):
        self.t += 1


# ---- Simple nano for testing ----
class SimpleNano(nn.Module):
    def __init__(self, input_dim=16, hidden_dim=32, output_dim=1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
        )
    
    def forward(self, x):
        return self.net(x)


def test_wea_basic_functionality():
    """Test that WEA wrapper works at all."""
    if not HAS_TORCH:
        return True
        
    print(SEPARATOR)
    print("TEST 1: WEA Basic Functionality")
    print(SEPARATOR)
    
    # Create an "expert" nano (simulating deposit knowledge)
    expert = SimpleNano()
    
    # Train expert on a simple function: y = sum(x)
    optimizer = optim.Adam(expert.parameters(), lr=0.01)
    for _ in range(200):
        x = torch.randn(32, 16)
        y_true = x.sum(dim=1, keepdim=True)
        y_pred = expert(x)
        loss = nn.MSELoss()(y_pred, y_true)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    
    expert_loss = nn.MSELoss()(expert(torch.randn(100, 16)).detach(), 
                                torch.randn(100, 16).sum(dim=1, keepdim=True)).item()
    print(f"  Expert nano trained. Test loss: {expert_loss:.4f}")
    
    # Create WEA nano with expert as ancestral
    deposit_state = expert.state_dict()
    wea = WEANano(SimpleNano, {"input_dim": 16, "hidden_dim": 32, "output_dim": 1},
                  deposit_state_dict=deposit_state,
                  G=5, phi=0.5, alpha=0.01, w_p=0.1, r=0.05)
    
    print(f"  WEA created: W_A={wea.W_A:.4f}, T_B={wea.T_B:.1f}")
    print(f"  Initial ancestral ratio: {wea.ancestral_ratio:.4f}")
    
    # Test: WEA should start performing like the expert
    x_test = torch.randn(100, 16)
    y_true_test = x_test.sum(dim=1, keepdim=True)
    
    wea_pred = wea(x_test)
    wea_initial_loss = nn.MSELoss()(wea_pred, y_true_test).item()
    print(f"  WEA initial loss (should be near expert): {wea_initial_loss:.4f}")
    
    # Random nano (no deposit) for comparison
    random_nano = SimpleNano()
    random_loss = nn.MSELoss()(random_nano(x_test), y_true_test).item()
    print(f"  Random nano loss (no deposit): {random_loss:.4f}")
    
    benefit = random_loss / max(wea_initial_loss, 1e-8)
    print(f"  Deposit benefit ratio: {benefit:.1f}x better than random start")
    
    if wea_initial_loss < random_loss * 0.8:  # WEA should be at least 20% better
        print("  PASS: WEA starts better than random (deposit knowledge works!)")
        return True
    else:
        print("  >>> FAIL: WEA doesn't benefit from deposit knowledge")
        return False


def test_wea_training_curve():
    """Track loss over training steps and verify T_B transition."""
    if not HAS_TORCH:
        return True
        
    print(f"\n{SEPARATOR}")
    print("TEST 2: WEA Training Curve and T_B Transition")
    print(SEPARATOR)
    
    # Expert trained on y = sum(x)
    expert = SimpleNano()
    opt = optim.Adam(expert.parameters(), lr=0.01)
    for _ in range(300):
        x = torch.randn(32, 16)
        y = x.sum(dim=1, keepdim=True)
        loss = nn.MSELoss()(expert(x), y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    
    # WEA nano
    wea = WEANano(SimpleNano, {"input_dim": 16, "hidden_dim": 32, "output_dim": 1},
                  deposit_state_dict=expert.state_dict(),
                  G=5, phi=0.5, alpha=0.01, w_p=0.1, r=0.05)
    
    # Now train the WEA nano on a DIFFERENT task: y = mean(x) * 3
    # This tests whether personal network can override ancestral for a new task
    wea_opt = optim.Adam(filter(lambda p: p.requires_grad, wea.parameters()), lr=0.01)
    
    print(f"\n  T_B = {wea.T_B:.1f} steps")
    print(f"\n  {'Step':>6} {'Loss':>10} {'Anc%':>8} {'Per%':>8} {'W_P':>12} {'Phase':>10}")
    print(f"  {'-'*6} {'-'*10} {'-'*8} {'-'*8} {'-'*12} {'-'*10}")
    
    for step in range(200):
        x = torch.randn(32, 16)
        y_true = x.mean(dim=1, keepdim=True) * 3
        
        y_pred = wea(x)
        loss = nn.MSELoss()(y_pred, y_true)
        
        wea_opt.zero_grad()
        loss.backward()
        wea_opt.step()
        wea.step_experience()
        
        if step % 20 == 0 or step == 199:
            a_pct = wea.ancestral_ratio * 100
            p_pct = 100 - a_pct
            phase = "ANCESTRAL" if a_pct > 50 else "PERSONAL"
            print(f"  {step:>6} {loss.item():>10.4f} {a_pct:>7.1f}% {p_pct:>7.1f}% {wea.W_P:>12.4f} {phase:>10}")
    
    # Check W_P at end
    print(f"\n  Final W_P: {wea.W_P:.4f}")
    if wea.W_P > 1e6:
        print("  >>> WARNING: W_P is already getting large at step 200")
        print(f"  >>> At step 500, W_P would be: {wea.w_p * (1 + wea.r) * ((1 + wea.r)**500 - 1) / wea.r:.2e}")
        return False
    return True


def test_catastrophic_forgetting():
    """Train WEA on task A, then switch to task B, check if A is retained."""
    if not HAS_TORCH:
        return True
        
    print(f"\n{SEPARATOR}")
    print("TEST 3: Catastrophic Forgetting Resistance")
    print(SEPARATOR)
    
    # Expert on task A: y = sum(x)
    expert = SimpleNano()
    opt = optim.Adam(expert.parameters(), lr=0.01)
    for _ in range(300):
        x = torch.randn(32, 16)
        loss = nn.MSELoss()(expert(x), x.sum(dim=1, keepdim=True))
        opt.zero_grad(); loss.backward(); opt.step()
    
    # WEA with expert as ancestral
    wea = WEANano(SimpleNano, {"input_dim": 16, "hidden_dim": 32, "output_dim": 1},
                  deposit_state_dict=expert.state_dict(),
                  G=5, phi=0.5, alpha=0.01, w_p=0.1, r=0.05)
    
    # Also a plain nano (no WEA) for comparison
    plain = SimpleNano()
    plain.load_state_dict(expert.state_dict())
    plain_opt = optim.Adam(plain.parameters(), lr=0.01)
    
    wea_opt = optim.Adam(filter(lambda p: p.requires_grad, wea.parameters()), lr=0.01)
    
    # Measure task A performance before B training
    x_test_a = torch.randn(200, 16)
    y_test_a = x_test_a.sum(dim=1, keepdim=True)
    
    wea_loss_a_before = nn.MSELoss()(wea(x_test_a), y_test_a).item()
    plain_loss_a_before = nn.MSELoss()(plain(x_test_a), y_test_a).item()
    
    print(f"  Before Task B training:")
    print(f"    WEA  loss on Task A: {wea_loss_a_before:.4f}")
    print(f"    Plain loss on Task A: {plain_loss_a_before:.4f}")
    
    # Train both on task B: y = -x.max()
    for step in range(100):
        x = torch.randn(32, 16)
        y_b = -x.max(dim=1, keepdim=True).values
        
        # WEA
        pred = wea(x)
        loss = nn.MSELoss()(pred, y_b)
        wea_opt.zero_grad(); loss.backward(); wea_opt.step()
        wea.step_experience()
        
        # Plain
        pred = plain(x)
        loss = nn.MSELoss()(pred, y_b)
        plain_opt.zero_grad(); loss.backward(); plain_opt.step()
    
    # Measure task A performance AFTER B training
    wea_loss_a_after = nn.MSELoss()(wea(x_test_a), y_test_a).item()
    plain_loss_a_after = nn.MSELoss()(plain(x_test_a), y_test_a).item()
    
    # Measure task B performance
    x_test_b = torch.randn(200, 16)
    y_test_b = -x_test_b.max(dim=1, keepdim=True).values
    wea_loss_b = nn.MSELoss()(wea(x_test_b), y_test_b).item()
    plain_loss_b = nn.MSELoss()(plain(x_test_b), y_test_b).item()
    
    print(f"\n  After 100 steps of Task B training:")
    print(f"    WEA  loss on Task A: {wea_loss_a_after:.4f} (was {wea_loss_a_before:.4f}, change: {wea_loss_a_after/max(wea_loss_a_before, 1e-8):.2f}x)")
    print(f"    Plain loss on Task A: {plain_loss_a_after:.4f} (was {plain_loss_a_before:.4f}, change: {plain_loss_a_after/max(plain_loss_a_before, 1e-8):.2f}x)")
    print(f"    WEA  loss on Task B: {wea_loss_b:.4f}")
    print(f"    Plain loss on Task B: {plain_loss_b:.4f}")
    
    wea_retention = wea_loss_a_after / max(wea_loss_a_before, 1e-8)
    plain_retention = plain_loss_a_after / max(plain_loss_a_before, 1e-8)
    
    print(f"\n  Task A retention (lower = better):")
    print(f"    WEA:  {wea_retention:.2f}x degradation")
    print(f"    Plain: {plain_retention:.2f}x degradation")
    
    if wea_retention < plain_retention:
        print("  PASS: WEA retains Task A better than plain network!")
        return True
    else:
        print("  >>> FAIL: WEA does NOT help with catastrophic forgetting")
        return False


def test_capped_vs_uncapped():
    """Compare original WEA (explosive) vs soft-capped version."""
    if not HAS_TORCH:
        return True
        
    print(f"\n{SEPARATOR}")
    print("TEST 4: Capped vs Uncapped WEA")
    print(SEPARATOR)
    
    print(f"\n  {'t':>6} {'W_P_uncapped':>15} {'W_P_capped':>15} {'Ratio':>10}")
    print(f"  {'-'*6} {'-'*15} {'-'*15} {'-'*10}")
    
    w_p, r, W_P_max = 0.1, 0.05, 10.0
    
    for t in [0, 1, 5, 10, 25, 50, 100, 200, 500, 1000]:
        # Uncapped
        if t == 0:
            wp_unc = 0.0
        else:
            try:
                wp_unc = w_p * (1 + r) * ((1 + r)**t - 1) / r
            except OverflowError:
                wp_unc = float('inf')
        
        # Capped (soft)
        wp_cap = W_P_max * (1 - math.exp(-r * t))
        
        ratio = wp_unc / wp_cap if wp_cap > 0 and not math.isinf(wp_unc) else float('inf')
        
        unc_str = f"{wp_unc:.4f}" if not math.isinf(wp_unc) and wp_unc < 1e12 else f"{wp_unc:.2e}"
        print(f"  {t:>6} {unc_str:>15} {wp_cap:>15.4f} {ratio:>10.1f}x")
    
    print(f"\n  Capped W_P_max = {W_P_max}")
    print(f"  At t=∞, capped W_P → {W_P_max} (bounded)")
    print(f"  At t=1000, uncapped W_P → {w_p * (1+r) * ((1+r)**1000 - 1) / r:.2e} (insane)")
    print(f"\n  The soft cap preserves the same growth CHARACTER (fast initial, slowing)")
    print(f"  while preventing the mathematical explosion.")
    return True


def main():
    print("\n" + "=" * 70)
    print("  EXPERIMENT 03: WEA DUAL-NETWORK EXPERIMENT")
    print("=" * 70)
    
    if not HAS_TORCH:
        print("\n  PyTorch not installed. Install with: pip install torch")
        print("  Skipping all neural network tests.")
        return 1
    
    results = {}
    results["basic"] = test_wea_basic_functionality()
    results["training_curve"] = test_wea_training_curve()
    results["forgetting"] = test_catastrophic_forgetting()
    test_capped_vs_uncapped()
    
    print(f"\n{'=' * 70}")
    print("  EXPERIMENT 03: SUMMARY")
    print(f"{'=' * 70}")
    
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name}")
    
    failures = [k for k, v in results.items() if not v]
    if failures:
        print(f"\n  FAILURES: {', '.join(failures)}")
    else:
        print(f"\n  All WEA tests passed!")
    
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
