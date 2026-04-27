#!/usr/bin/env python3
"""
test_08_gpu_nano_reality.py  —  THE HARD EXPERIMENT

Can nanos ACTUALLY use GPUs for real deep learning?
This tests every assumption about GPU utilization:

1. Real training throughput per nano type (nanos trained/sec on GPU vs CPU)
2. GPU utilization % during nano training (are we wasting the GPU?)
3. VRAM memory mapping: how many nanos can train simultaneously?
4. Multi-GPU: can we split nano training across 2 GPUs?
5. Batched multi-nano inference: the assembly line
6. The Nano Compute Unit (NCU): a universal measure of nano work
7. Mixed-precision (fp16/bf16): does it help for tiny nanos?

This is the experiment that decides whether the nano architecture
can compete with monolithic LLMs for GPU utilization efficiency.
"""

import os
import sys
import time
import math
import json
import gc
import traceback
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# ─────────────────────────────────────────────────────────
# DEVICE SETUP
# ─────────────────────────────────────────────────────────
DEVICE_GPU0 = torch.device("cuda:0") if torch.cuda.is_available() else torch.device("cpu")
DEVICE_GPU1 = torch.device("cuda:1") if torch.cuda.device_count() > 1 else None
DEVICE_CPU = torch.device("cpu")
HAS_GPU = torch.cuda.is_available()
GPU_COUNT = torch.cuda.device_count() if HAS_GPU else 0

print("=" * 70)
print("EXPERIMENT 08: GPU NANO REALITY CHECK")
print("=" * 70)
if HAS_GPU:
    for i in range(GPU_COUNT):
        props = torch.cuda.get_device_properties(i)
        print(f"  GPU {i}: {props.name}")
        print(f"    VRAM: {props.total_memory / 1024**3:.2f} GB")
        print(f"    SMs: {props.multi_processor_count}")
        print(f"    Compute: {props.major}.{props.minor}")
else:
    print("  NO GPU — running CPU-only mode")
print()

# ─────────────────────────────────────────────────────────
# NANO ARCHITECTURES (from spec 02_NANO_ANATOMY)
# ─────────────────────────────────────────────────────────

class FeatureNano(nn.Module):
    """Perception — Red. Tiny MLP."""
    def __init__(self, input_dim=256, hidden=64, output_dim=32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden), nn.GELU(),
            nn.Linear(hidden, output_dim), nn.LayerNorm(output_dim))
    def forward(self, x): return self.net(x)

class PatternNano(nn.Module):
    """Cognition — Blue. Tiny transformer encoder."""
    def __init__(self, dim=32, heads=2, layers=1):
        super().__init__()
        enc = nn.TransformerEncoderLayer(d_model=dim, nhead=heads,
                                         dim_feedforward=dim*2, batch_first=True)
        self.encoder = nn.TransformerEncoder(enc, num_layers=layers)
    def forward(self, x): return self.encoder(x)

class ActionNano(nn.Module):
    """Execution — Yellow. Small decoder."""
    def __init__(self, input_dim=32, vocab_size=256):
        super().__init__()
        self.decoder = nn.Sequential(
            nn.Linear(input_dim, input_dim*4), nn.GELU(),
            nn.Linear(input_dim*4, vocab_size))
    def forward(self, x): return self.decoder(x)

class BridgeNano(nn.Module):
    """Cross-domain connector. Dual encoder."""
    def __init__(self, dim_a=32, dim_b=32, shared=64):
        super().__init__()
        self.enc_a = nn.Linear(dim_a, shared)
        self.enc_b = nn.Linear(dim_b, shared)
        self.norm = nn.LayerNorm(shared)
    def forward(self, a, b):
        return self.norm(self.enc_a(a) + self.enc_b(b))

class RouterNano(nn.Module):
    """Query → nano cluster selector."""
    def __init__(self, dim=32, routes=64):
        super().__init__()
        self.scorer = nn.Sequential(
            nn.Linear(dim, dim*2), nn.GELU(), nn.Linear(dim*2, routes))
    def forward(self, x): return torch.softmax(self.scorer(x), dim=-1)

# Bigger variants to test GPU scaling
class BigPatternNano(nn.Module):
    """Larger pattern nano — 4 layers, 4 heads, dim=128."""
    def __init__(self, dim=128, heads=4, layers=4):
        super().__init__()
        enc = nn.TransformerEncoderLayer(d_model=dim, nhead=heads,
                                         dim_feedforward=dim*4, batch_first=True)
        self.encoder = nn.TransformerEncoder(enc, num_layers=layers)
    def forward(self, x): return self.encoder(x)

class HugeActionNano(nn.Module):
    """Largest nano spec allows — ~5M params."""
    def __init__(self, input_dim=256, hidden=2048, vocab_size=4096):
        super().__init__()
        self.decoder = nn.Sequential(
            nn.Linear(input_dim, hidden), nn.GELU(),
            nn.Linear(hidden, hidden), nn.GELU(),
            nn.Linear(hidden, vocab_size))
    def forward(self, x): return self.decoder(x)


NANO_CONFIGS = {
    "FeatureNano":    (FeatureNano,    {"input_dim": 256, "hidden": 64, "output_dim": 32}),
    "PatternNano":    (PatternNano,    {"dim": 32, "heads": 2, "layers": 1}),
    "ActionNano":     (ActionNano,     {"input_dim": 32, "vocab_size": 256}),
    "BridgeNano":     (BridgeNano,     {"dim_a": 32, "dim_b": 32, "shared": 64}),
    "RouterNano":     (RouterNano,     {"dim": 32, "routes": 64}),
    "BigPattern":     (BigPatternNano, {"dim": 128, "heads": 4, "layers": 4}),
    "HugeAction":     (HugeActionNano, {"input_dim": 256, "hidden": 2048, "vocab_size": 4096}),
}


def count_params(model):
    return sum(p.numel() for p in model.parameters())

def model_size_bytes(model):
    return sum(p.numel() * p.element_size() for p in model.parameters())


# ─────────────────────────────────────────────────────────
# TEST 1: NANO PROFILING — size, params, memory
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 1: NANO ARCHITECTURE PROFILING                       ║")
print("╚══════════════════════════════════════════════════════════════╝")

profiles = {}
print(f"{'Name':<16} {'Params':>10} {'Size(KB)':>10} {'Size(MB)':>10}")
print("-" * 50)
for name, (cls, kwargs) in NANO_CONFIGS.items():
    model = cls(**kwargs)
    params = count_params(model)
    size_b = model_size_bytes(model)
    profiles[name] = {"params": params, "size_bytes": size_b}
    print(f"{name:<16} {params:>10,} {size_b/1024:>10.1f} {size_b/1024**2:>10.3f}")
    del model

print()

# ─────────────────────────────────────────────────────────
# TEST 2: GPU vs CPU TRAINING THROUGHPUT
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 2: GPU vs CPU TRAINING THROUGHPUT                    ║")
print("╚══════════════════════════════════════════════════════════════╝")

def make_data(name, batch_size, device):
    """Generate appropriate synthetic training data for each nano type."""
    if name in ("FeatureNano",):
        x = torch.randn(batch_size, 256, device=device)
        y = torch.randn(batch_size, 32, device=device)
        return (x,), y, nn.MSELoss()
    elif name in ("PatternNano",):
        x = torch.randn(batch_size, 8, 32, device=device)
        y = torch.randn(batch_size, 8, 32, device=device)
        return (x,), y, nn.MSELoss()
    elif name in ("BigPattern",):
        x = torch.randn(batch_size, 16, 128, device=device)
        y = torch.randn(batch_size, 16, 128, device=device)
        return (x,), y, nn.MSELoss()
    elif name in ("ActionNano",):
        x = torch.randn(batch_size, 32, device=device)
        y = torch.randint(0, 256, (batch_size,), device=device)
        return (x,), y, nn.CrossEntropyLoss()
    elif name in ("HugeAction",):
        x = torch.randn(batch_size, 256, device=device)
        y = torch.randint(0, 4096, (batch_size,), device=device)
        return (x,), y, nn.CrossEntropyLoss()
    elif name in ("BridgeNano",):
        a = torch.randn(batch_size, 32, device=device)
        b = torch.randn(batch_size, 32, device=device)
        y = torch.randn(batch_size, 64, device=device)
        return (a, b), y, nn.MSELoss()
    elif name in ("RouterNano",):
        x = torch.randn(batch_size, 32, device=device)
        y = torch.zeros(batch_size, 64, device=device)
        y[:, 0] = 1.0  # target: route to cluster 0
        return (x,), y, nn.MSELoss()


def bench_training(name, cls, kwargs, device, n_steps=200, batch_size=64):
    """Train a nano for n_steps, measure wall time and throughput."""
    model = cls(**kwargs).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    inputs, target, loss_fn = make_data(name, batch_size, device)
    
    # Warmup
    for _ in range(5):
        optimizer.zero_grad()
        out = model(*inputs)
        loss = loss_fn(out, target)
        loss.backward()
        optimizer.step()
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    
    start = time.perf_counter()
    total_samples = 0
    for _ in range(n_steps):
        optimizer.zero_grad()
        out = model(*inputs)
        loss = loss_fn(out, target)
        loss.backward()
        optimizer.step()
        total_samples += batch_size
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    
    elapsed = time.perf_counter() - start
    steps_per_sec = n_steps / elapsed
    samples_per_sec = total_samples / elapsed
    final_loss = loss.item()
    
    del model, optimizer, inputs, target
    if device.type == "cuda":
        torch.cuda.empty_cache()
    gc.collect()
    
    return {
        "steps_per_sec": steps_per_sec,
        "samples_per_sec": samples_per_sec,
        "elapsed": elapsed,
        "final_loss": final_loss,
    }


devices_to_test = [("CPU", DEVICE_CPU)]
if HAS_GPU:
    devices_to_test.append(("GPU:0", DEVICE_GPU0))

results_t2 = {}
print(f"{'Nano':<16} {'Device':<8} {'Steps/s':>10} {'Samples/s':>12} {'Time(s)':>8} {'Loss':>8} {'Speedup':>8}")
print("-" * 76)

for name, (cls, kwargs) in NANO_CONFIGS.items():
    cpu_sps = None
    for dev_name, device in devices_to_test:
        try:
            r = bench_training(name, cls, kwargs, device, n_steps=200, batch_size=64)
            if dev_name == "CPU":
                cpu_sps = r["steps_per_sec"]
            speedup = r["steps_per_sec"] / cpu_sps if cpu_sps and dev_name != "CPU" else 1.0
            print(f"{name:<16} {dev_name:<8} {r['steps_per_sec']:>10.1f} {r['samples_per_sec']:>12.0f} "
                  f"{r['elapsed']:>8.2f} {r['final_loss']:>8.4f} {speedup:>7.1f}x")
            results_t2[(name, dev_name)] = r
        except Exception as e:
            print(f"{name:<16} {dev_name:<8}  ERROR: {e}")

print()


# ─────────────────────────────────────────────────────────
# TEST 3: VRAM CAPACITY — How many nanos fit in GPU memory?
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 3: VRAM CAPACITY — Max simultaneous nanos per GPU    ║")
print("╚══════════════════════════════════════════════════════════════╝")

if HAS_GPU:
    def measure_vram_per_nano(name, cls, kwargs, device, batch_size=64):
        """Measure actual VRAM consumed by one nano + optimizer + activations."""
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats(device)
        
        mem_before = torch.cuda.memory_allocated(device)
        
        model = cls(**kwargs).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        inputs, target, loss_fn = make_data(name, batch_size, device)
        
        # Do one full training step to allocate all buffers
        optimizer.zero_grad()
        out = model(*inputs)
        loss = loss_fn(out, target)
        loss.backward()
        optimizer.step()
        
        torch.cuda.synchronize(device)
        peak_mem = torch.cuda.max_memory_allocated(device)
        current_mem = torch.cuda.memory_allocated(device)
        
        del model, optimizer, inputs, target, out, loss
        torch.cuda.empty_cache()
        gc.collect()
        
        return {
            "static_bytes": current_mem - mem_before,
            "peak_bytes": peak_mem - mem_before,
        }
    
    total_vram = torch.cuda.get_device_properties(0).total_memory
    usable_vram = int(total_vram * 0.85)  # Leave 15% for CUDA overhead
    
    print(f"Total VRAM: {total_vram/1024**3:.2f} GB")
    print(f"Usable VRAM (85%): {usable_vram/1024**3:.2f} GB")
    print()
    print(f"{'Nano':<16} {'Peak VRAM':>12} {'static':>12} {'Max Simult.':>12} {'Max w/infer':>12}")
    print("-" * 68)
    
    vram_results = {}
    for name, (cls, kwargs) in NANO_CONFIGS.items():
        try:
            r = measure_vram_per_nano(name, cls, kwargs, DEVICE_GPU0, batch_size=64)
            max_training = usable_vram // max(r["peak_bytes"], 1)
            # Inference only needs ~40% of training memory (no grads, no optimizer)
            max_inference = usable_vram // max(int(r["peak_bytes"] * 0.4), 1)
            
            print(f"{name:<16} {r['peak_bytes']/1024:>10.1f}KB {r['static_bytes']/1024:>10.1f}KB "
                  f"{max_training:>12,} {max_inference:>12,}")
            vram_results[name] = {**r, "max_training": max_training, "max_inference": max_inference}
        except Exception as e:
            print(f"{name:<16}  ERROR: {e}")
    
    print()
else:
    print("  SKIPPED — no GPU\n")
    vram_results = {}


# ─────────────────────────────────────────────────────────
# TEST 4: BATCHED MULTI-NANO INFERENCE (the assembly line)
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 4: BATCHED MULTI-NANO INFERENCE                     ║")
print("╚══════════════════════════════════════════════════════════════╝")

def bench_sequential_inference(n_nanos, device, n_queries=100):
    """Sequential: each nano runs separately on each query."""
    nanos = [FeatureNano(256, 64, 32).to(device) for _ in range(n_nanos)]
    for m in nanos:
        m.eval()
    
    query = torch.randn(1, 256, device=device)
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    start = time.perf_counter()
    
    with torch.no_grad():
        for _ in range(n_queries):
            outputs = [m(query) for m in nanos]
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    elapsed = time.perf_counter() - start
    
    for m in nanos:
        del m
    if device.type == "cuda":
        torch.cuda.empty_cache()
    gc.collect()
    
    return n_queries / elapsed  # queries per second


def bench_batched_inference(n_nanos, device, n_queries=100):
    """Batched: stack all nano weights into a single batched operation.
    
    This is the KEY INSIGHT for GPU efficiency: instead of running N separate
    forward passes, we stack the weight matrices and do ONE batched matmul.
    This is how nanos can match LLM GPU utilization.
    """
    # Build a "mega-nano" that stacks all Feature nano weights
    input_dim, hidden, output_dim = 256, 64, 32
    
    # Stack weights: [n_nanos, hidden, input_dim] and [n_nanos, output_dim, hidden]
    W1 = torch.randn(n_nanos, hidden, input_dim, device=device) * 0.1
    b1 = torch.zeros(n_nanos, hidden, device=device)
    W2 = torch.randn(n_nanos, output_dim, hidden, device=device) * 0.1
    b2 = torch.zeros(n_nanos, output_dim, device=device)
    
    query = torch.randn(1, 256, device=device)
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    start = time.perf_counter()
    
    with torch.no_grad():
        for _ in range(n_queries):
            # Batched forward: [n_nanos, hidden] = [n_nanos, hidden, input] @ [input, 1]
            x = torch.bmm(W1, query.unsqueeze(-1)).squeeze(-1) + b1  # [n, hidden]
            x = F.gelu(x)
            x = torch.bmm(W2, x.unsqueeze(-1)).squeeze(-1) + b2  # [n, output]
    
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    elapsed = time.perf_counter() - start
    
    return n_queries / elapsed


print("How many queries/sec with N nanos activated simultaneously?")
print(f"{'N nanos':>8} {'Sequential(GPU)':>16} {'Batched(GPU)':>16} {'Speedup':>10} {'Sequential(CPU)':>16}")
print("-" * 72)

for n_nanos in [10, 50, 100, 500]:
    try:
        seq_gpu = bench_sequential_inference(n_nanos, DEVICE_GPU0, n_queries=50) if HAS_GPU else 0
        bat_gpu = bench_batched_inference(n_nanos, DEVICE_GPU0, n_queries=50) if HAS_GPU else 0
        seq_cpu = bench_sequential_inference(n_nanos, DEVICE_CPU, n_queries=50) if n_nanos <= 100 else 0
        speedup = bat_gpu / seq_gpu if seq_gpu > 0 else 0
        print(f"{n_nanos:>8} {seq_gpu:>14.0f}q/s {bat_gpu:>14.0f}q/s {speedup:>9.1f}x {seq_cpu:>14.0f}q/s")
    except Exception as e:
        print(f"{n_nanos:>8}  ERROR: {e}")

print()

# ─────────────────────────────────────────────────────────
# TEST 5: MULTI-GPU SPLIT — training across 2 GPUs
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 5: MULTI-GPU NANO DISTRIBUTION                      ║")
print("╚══════════════════════════════════════════════════════════════╝")

if DEVICE_GPU1 is not None:
    def bench_multi_gpu_training(n_nanos_per_gpu, steps=100, batch_size=64):
        """Train nanos split across 2 GPUs simultaneously using CUDA streams."""
        # Create nanos on each GPU
        nanos_0 = [(FeatureNano(256, 64, 32).to(DEVICE_GPU0),
                     torch.optim.Adam(FeatureNano(256, 64, 32).to(DEVICE_GPU0).parameters(), lr=1e-3))
                    for _ in range(n_nanos_per_gpu)]
        # Rebuild properly
        del nanos_0
        torch.cuda.empty_cache()
        
        models_0, models_1 = [], []
        for _ in range(n_nanos_per_gpu):
            m0 = FeatureNano(256, 64, 32).to(DEVICE_GPU0)
            models_0.append((m0, torch.optim.Adam(m0.parameters(), lr=1e-3)))
            m1 = FeatureNano(256, 64, 32).to(DEVICE_GPU1)
            models_1.append((m1, torch.optim.Adam(m1.parameters(), lr=1e-3)))
        
        x0 = torch.randn(batch_size, 256, device=DEVICE_GPU0)
        t0 = torch.randn(batch_size, 32, device=DEVICE_GPU0)
        x1 = torch.randn(batch_size, 256, device=DEVICE_GPU1)
        t1 = torch.randn(batch_size, 32, device=DEVICE_GPU1)
        loss_fn = nn.MSELoss()
        
        # Warmup
        for m, opt in models_0[:1]:
            opt.zero_grad(); loss_fn(m(x0), t0).backward(); opt.step()
        for m, opt in models_1[:1]:
            opt.zero_grad(); loss_fn(m(x1), t1).backward(); opt.step()
        torch.cuda.synchronize()
        
        start = time.perf_counter()
        for step in range(steps):
            # Train GPU 0 nanos
            for m, opt in models_0:
                opt.zero_grad()
                loss_fn(m(x0), t0).backward()
                opt.step()
            # Train GPU 1 nanos (sequentially after GPU 0 — baseline)
            for m, opt in models_1:
                opt.zero_grad()
                loss_fn(m(x1), t1).backward()
                opt.step()
        torch.cuda.synchronize()
        seq_time = time.perf_counter() - start
        
        # Now test with CUDA streams (parallel across GPUs)
        stream0 = torch.cuda.Stream(DEVICE_GPU0)
        stream1 = torch.cuda.Stream(DEVICE_GPU1)
        
        torch.cuda.synchronize()
        start = time.perf_counter()
        for step in range(steps):
            with torch.cuda.stream(stream0):
                for m, opt in models_0:
                    opt.zero_grad()
                    loss_fn(m(x0), t0).backward()
                    opt.step()
            with torch.cuda.stream(stream1):
                for m, opt in models_1:
                    opt.zero_grad()
                    loss_fn(m(x1), t1).backward()
                    opt.step()
        torch.cuda.synchronize()
        parallel_time = time.perf_counter() - start
        
        # Cleanup
        for m, opt in models_0 + models_1:
            del m, opt
        torch.cuda.empty_cache()
        gc.collect()
        
        return {
            "sequential_time": seq_time,
            "parallel_time": parallel_time,
            "speedup": seq_time / parallel_time if parallel_time > 0 else 0,
            "total_nanos": n_nanos_per_gpu * 2,
            "nanos_per_sec_seq": (n_nanos_per_gpu * 2 * steps) / seq_time,
            "nanos_per_sec_par": (n_nanos_per_gpu * 2 * steps) / parallel_time,
        }
    
    print(f"{'Nanos/GPU':>10} {'Seq time':>10} {'Par time':>10} {'Speedup':>8} {'Nanos/s(seq)':>14} {'Nanos/s(par)':>14}")
    print("-" * 72)
    for n in [5, 20, 50]:
        try:
            r = bench_multi_gpu_training(n, steps=50)
            print(f"{n:>10} {r['sequential_time']:>9.2f}s {r['parallel_time']:>9.2f}s "
                  f"{r['speedup']:>7.2f}x {r['nanos_per_sec_seq']:>14.0f} {r['nanos_per_sec_par']:>14.0f}")
        except Exception as e:
            print(f"{n:>10}  ERROR: {e}")
    print()
else:
    print("  Only 1 GPU — skipping multi-GPU test\n")


# ─────────────────────────────────────────────────────────
# TEST 6: MIXED PRECISION (fp16) — worth it for tiny nanos?
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 6: MIXED PRECISION (fp16 vs fp32)                   ║")
print("╚══════════════════════════════════════════════════════════════╝")

if HAS_GPU:
    from torch.amp import autocast, GradScaler
    
    def bench_mixed_precision(name, cls, kwargs, device, n_steps=200, batch_size=64):
        model = cls(**kwargs).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        scaler = GradScaler('cuda')
        inputs, target, loss_fn = make_data(name, batch_size, device)
        
        # Warmup
        for _ in range(5):
            optimizer.zero_grad()
            with autocast('cuda'):
                out = model(*inputs)
                loss = loss_fn(out, target)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        
        torch.cuda.synchronize(device)
        start = time.perf_counter()
        for _ in range(n_steps):
            optimizer.zero_grad()
            with autocast('cuda'):
                out = model(*inputs)
                loss = loss_fn(out, target)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        torch.cuda.synchronize(device)
        elapsed = time.perf_counter() - start
        
        del model, optimizer, inputs, target
        torch.cuda.empty_cache()
        gc.collect()
        
        return {"steps_per_sec": n_steps / elapsed, "elapsed": elapsed}
    
    print(f"{'Nano':<16} {'fp32 steps/s':>14} {'fp16 steps/s':>14} {'Speedup':>10}")
    print("-" * 58)
    for name, (cls, kwargs) in NANO_CONFIGS.items():
        try:
            fp32 = results_t2.get((name, "GPU:0"), {}).get("steps_per_sec", 0)
            if fp32 == 0:
                fp32_r = bench_training(name, cls, kwargs, DEVICE_GPU0)
                fp32 = fp32_r["steps_per_sec"]
            
            fp16_r = bench_mixed_precision(name, cls, kwargs, DEVICE_GPU0)
            speedup = fp16_r["steps_per_sec"] / fp32 if fp32 > 0 else 0
            print(f"{name:<16} {fp32:>14.1f} {fp16_r['steps_per_sec']:>14.1f} {speedup:>9.2f}x")
        except Exception as e:
            print(f"{name:<16}  ERROR: {e}")
    print()
else:
    print("  SKIPPED — no GPU\n")


# ─────────────────────────────────────────────────────────
# TEST 7: THE NANO COMPUTE UNIT (NCU)
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 7: NANO COMPUTE UNIT (NCU) — Universal work measure ║")
print("╚══════════════════════════════════════════════════════════════╝")

print("""
THE PROBLEM: How do you compare work done by a 1050 (2GB) vs a 4090 (24GB)?
The answer: define a NANO COMPUTE UNIT (NCU) = 1 training step of a 
standard FeatureNano(256→64→32) on batch=64.

Every hardware device gets an NCU/sec rating. Work is distributed
proportional to NCU/sec capacity. The NCU normalizes across:
  - Different GPU architectures (CUDA cores, memory bandwidth)
  - CPU fallback (slower but still valid)  
  - Different nano types (a BigPattern step costs ~X NCU)
""")

# Measure NCU/sec for each device
ncu_results = {}
standard_cls, standard_kwargs = NANO_CONFIGS["FeatureNano"]

print("NCU/sec by device (1 NCU = 1 FeatureNano training step, batch=64):")
print("-" * 50)

for dev_name, device in devices_to_test:
    r = bench_training("FeatureNano", standard_cls, standard_kwargs, device, n_steps=300, batch_size=64)
    ncu_rate = r["steps_per_sec"]
    ncu_results[dev_name] = ncu_rate
    print(f"  {dev_name}: {ncu_rate:.0f} NCU/sec")

# Now compute NCU cost for each nano type
print("\nNCU cost per nano type (relative to FeatureNano):")
print(f"{'Nano':<16} {'Steps/s (GPU)':>14} {'NCU cost':>10} {'Meaning':>30}")
print("-" * 74)

if HAS_GPU:
    base_rate = results_t2.get(("FeatureNano", "GPU:0"), {}).get("steps_per_sec", 1)
    for name in NANO_CONFIGS:
        gpu_rate = results_t2.get((name, "GPU:0"), {}).get("steps_per_sec", 0)
        if gpu_rate > 0:
            ncu_cost = base_rate / gpu_rate
            meaning = f"1 step = {ncu_cost:.1f} FeatureNano steps"
            print(f"{name:<16} {gpu_rate:>14.1f} {ncu_cost:>10.2f} {meaning:>30}")

print()

# ─────────────────────────────────────────────────────────
# TEST 8: GPU UTILIZATION MEASUREMENT
# ─────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST 8: GPU UTILIZATION — Are we actually using the GPU?  ║")
print("╚══════════════════════════════════════════════════════════════╝")

if HAS_GPU:
    def measure_gpu_utilization(name, cls, kwargs, device, duration=3.0, batch_size=64):
        """Run training for `duration` seconds and measure VRAM throughput."""
        model = cls(**kwargs).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        inputs, target, loss_fn = make_data(name, batch_size, device)
        
        torch.cuda.reset_peak_memory_stats(device)
        torch.cuda.synchronize(device)
        start = time.perf_counter()
        steps = 0
        total_bytes = 0
        
        while time.perf_counter() - start < duration:
            optimizer.zero_grad()
            out = model(*inputs)
            loss = loss_fn(out, target)
            loss.backward()
            optimizer.step()
            steps += 1
            # Rough estimate of bytes processed
            total_bytes += sum(p.numel() * p.element_size() * 3 for p in model.parameters())  # read + grad + update
        
        torch.cuda.synchronize(device)
        elapsed = time.perf_counter() - start
        peak_mem = torch.cuda.max_memory_allocated(device)
        
        # Memory bandwidth utilization
        props = torch.cuda.get_device_properties(device)
        # GTX 1660 Super: ~336 GB/s memory bandwidth
        theoretical_bw = 336e9  # bytes/sec (approximate for 1660 Super)
        actual_bw = total_bytes / elapsed
        bw_utilization = actual_bw / theoretical_bw * 100
        
        del model, optimizer, inputs, target
        torch.cuda.empty_cache()
        gc.collect()
        
        return {
            "steps": steps,
            "steps_per_sec": steps / elapsed,
            "bytes_per_sec": actual_bw,
            "bw_util_pct": min(100, bw_utilization),
            "peak_vram_mb": peak_mem / 1024**2,
        }
    
    print(f"{'Nano':<16} {'Steps/s':>10} {'BW(GB/s)':>10} {'BW Util%':>10} {'Peak VRAM':>10}")
    print("-" * 60)
    
    for name, (cls, kwargs) in NANO_CONFIGS.items():
        try:
            r = measure_gpu_utilization(name, cls, kwargs, DEVICE_GPU0, duration=3.0)
            bw_gbs = r["bytes_per_sec"] / 1e9
            print(f"{name:<16} {r['steps_per_sec']:>10.0f} {bw_gbs:>10.1f} {r['bw_util_pct']:>9.1f}% {r['peak_vram_mb']:>8.0f}MB")
        except Exception as e:
            print(f"{name:<16}  ERROR: {e}")
    
    print("""
ANALYSIS: Small nanos underutilize GPU memory bandwidth.
The solution: BATCH MULTIPLE NANOS INTO ONE KERNEL LAUNCH.
See Test 4 results — batched inference gives massive speedup.
For training: use gradient accumulation across nano populations.
""")
else:
    print("  SKIPPED — no GPU\n")


# ─────────────────────────────────────────────────────────
# FINAL SUMMARY
# ─────────────────────────────────────────────────────────
print("=" * 70)
print("EXPERIMENT 08 COMPLETE — GPU NANO REALITY SUMMARY")
print("=" * 70)

if HAS_GPU:
    print(f"""
HARDWARE: {GPU_COUNT}x {torch.cuda.get_device_name(0)}
          {torch.cuda.get_device_properties(0).total_memory/1024**3:.1f}GB VRAM each

KEY FINDINGS:
""")
    
    # GPU vs CPU speedup summary
    if results_t2:
        for name in NANO_CONFIGS:
            cpu = results_t2.get((name, "CPU"), {}).get("steps_per_sec", 0)
            gpu = results_t2.get((name, "GPU:0"), {}).get("steps_per_sec", 0)
            if cpu > 0 and gpu > 0:
                speedup = gpu / cpu
                verdict = "GPU wins" if speedup > 1.5 else "GPU marginal" if speedup > 1.0 else "CPU faster!"
                print(f"  {name:<16}: GPU {speedup:.1f}x faster than CPU — {verdict}")
    
    if vram_results:
        print(f"\nVRAM CAPACITY (training, 6GB GPU):")
        for name, r in vram_results.items():
            print(f"  {name:<16}: {r['max_training']:>6,} simultaneous")
    
    if ncu_results:
        print(f"\nNCU RATINGS:")
        for dev, rate in ncu_results.items():
            print(f"  {dev}: {rate:.0f} NCU/sec")
        
        # Project to other GPUs
        gpu_rate = ncu_results.get("GPU:0", 0)
        if gpu_rate > 0:
            print(f"\n  Projected NCU/sec for other GPUs (rough estimates):")
            # Based on CUDA core count ratios
            gpu_ratios = {
                "GTX 1050 (2GB)":   640/1408,     # 640 vs 1408 CUDA cores
                "GTX 1660S (6GB)":  1.0,           # our reference
                "RTX 3060 (12GB)":  3584/1408,
                "RTX 3090 (24GB)":  10496/1408,
                "RTX 4090 (24GB)":  16384/1408,
                "Apple M2 (GPU)":   0.3,            # rough estimate
                "CPU (8-core)":     ncu_results.get("CPU", 0) / gpu_rate if gpu_rate > 0 else 0.1,
            }
            for gpu_name, ratio in gpu_ratios.items():
                projected = gpu_rate * ratio
                print(f"    {gpu_name:<20}: ~{projected:,.0f} NCU/sec")

print("\nDone.")
