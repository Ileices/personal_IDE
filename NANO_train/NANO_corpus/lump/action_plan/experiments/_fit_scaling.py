import numpy as np
from scipy.optimize import curve_fit

# Data from test_17 scaling sweep
ns = np.array([2, 4, 8, 16, 32], dtype=float)
accs = np.array([0.6172, 0.8672, 0.9180, 0.9961, 1.0000])
trans_acc = 0.5859

def power_law(n, a_max, c, gamma):
    return a_max - c / np.power(n, gamma)

popt, _ = curve_fit(power_law, ns, accs, p0=[1.0, 0.5, 0.5],
                    bounds=([0.5, 0.001, 0.01], [1.01, 10.0, 5.0]), maxfev=10000)
a_max, c, gamma = popt

predicted = power_law(ns, *popt)
ss_res = np.sum((accs - predicted)**2)
ss_tot = np.sum((accs - np.mean(accs))**2)
r2 = 1 - ss_res / ss_tot

print(f"Fitted: accuracy = {a_max:.4f} - {c:.4f} / N^{gamma:.4f}")
print(f"R^2 = {r2:.4f}")
print()
header = f"{'N':>8s} {'Predicted':>10s} {'vs Transformer':>15s}"
print(header)
print("-" * 35)
for n in [2, 4, 8, 16, 32, 64, 128, 256]:
    pred = min(power_law(n, *popt), 1.0)
    diff = pred - trans_acc
    print(f"{n:>8d} {pred*100:>9.2f}% {diff*100:>+14.2f}%")

if a_max >= trans_acc:
    n_crit = (c / (a_max - trans_acc))**(1/gamma)
    print(f"\nNanoMoE matches transformer at N = {n_crit:.1f} experts")
    print(f"NanoMoE asymptote: {a_max*100:.2f}%")
print(f"\nOld nano ceiling (from test_16): 22.70%")
print(f"NanoMoE ceiling: {min(a_max, 1.0)*100:.2f}%")
print(f"Improvement: {(min(a_max, 1.0) - 0.227)*100:.1f} percentage points")
