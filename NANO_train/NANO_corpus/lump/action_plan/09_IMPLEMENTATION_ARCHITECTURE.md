# 09 — Implementation Architecture

## Module Layout, Dependencies, Data Models, and Build Targets

---

## Project Structure

```
nano_sea/
├── pyproject.toml                  # Package metadata, dependencies
├── config.yaml                     # Runtime configuration
├── README.md
│
├── nano_sea/                       # Main package
│   ├── __init__.py
│   ├── constants.py                # AE=C=1, PRIMORDIAL_SEED, thresholds
│   ├── config.py                   # YAML loader + env overrides
│   │
│   ├── core/                       # Core data structures
│   │   ├── __init__.py
│   │   ├── seed.py                 # CycleSeed, SeedManager
│   │   ├── nano.py                 # Nano base class + NanoCard
│   │   ├── absoleice.py            # MicroAbsoleice, MacroAbsoleice
│   │   ├── registry.py             # NanoRegistry (FAISS-backed)
│   │   └── types.py                # ShatteredQuery, NanoOutput, ActivationSet, etc.
│   │
│   ├── nanos/                      # Nano model implementations
│   │   ├── __init__.py
│   │   ├── feature.py              # FeatureNano (perception/red)
│   │   ├── pattern.py              # PatternNano (cognition/blue)
│   │   ├── action.py               # ActionNano (execution/yellow)
│   │   ├── bridge.py               # BridgeNano (cross-domain)
│   │   ├── router.py               # RouterNano (query→nano selection)
│   │   ├── orchestrator.py         # OrchestratorNano (response combiner)
│   │   └── spawner.py              # NanoSpawner + child spawning logic
│   │
│   ├── engine/                     # Runtime engines
│   │   ├── __init__.py
│   │   ├── expansion.py            # ExpansionController
│   │   ├── icae.py                 # ICAEEngine (fractal infection)
│   │   ├── compression.py          # CompressionTriage, NanoCompressor
│   │   ├── absularity.py           # AbsularityMonitor
│   │   ├── evolution.py            # SwarmEvolution (generational dynamics)
│   │   └── cycle.py                # CycleManager (expand→compress→deposit→repeat)
│   │
│   ├── encoding/                   # Data → RBY encoding
│   │   ├── __init__.py
│   │   ├── ptaie.py                # PTAIE mapping
│   │   ├── chunkers/               # Modality-specific chunkers
│   │   │   ├── __init__.py
│   │   │   ├── text.py             # Text/markdown chunker
│   │   │   ├── code.py             # Code (AST-based) chunker
│   │   │   ├── image.py            # Image patch chunker
│   │   │   ├── audio.py            # Audio frame chunker
│   │   │   ├── video.py            # Video shot chunker
│   │   │   ├── structured.py       # JSON/CSV/XML chunker
│   │   │   └── binary.py           # Unknown binary chunker
│   │   └── glyphs.py               # Glyph image generation (fractal binning)
│   │
│   ├── training/                   # Nano training infrastructure
│   │   ├── __init__.py
│   │   ├── trainer.py              # NanoTrainer (per-nano training loop)
│   │   ├── continuous.py           # ContinuousTrainer (background training)
│   │   ├── data_lake.py            # DataLake (storage + retrieval of training data)
│   │   └── scheduler.py            # TrainingScheduler (job queue)
│   │
│   ├── inference/                  # Query → response pipeline
│   │   ├── __init__.py
│   │   ├── shatter.py              # QueryShatterer
│   │   ├── ripple.py               # Ripple (nano activation selection)
│   │   ├── activate.py             # NanoActivator (parallel inference)
│   │   ├── orchestrate.py          # ResponseOrchestrator
│   │   └── consultant.py           # LLMConsultant (external LLM bridge)
│   │
│   ├── deposits/                   # Deposit management
│   │   ├── __init__.py
│   │   ├── manager.py              # DepositManager (lifecycle, archival)
│   │   ├── store.py                # Deposit I/O (read/write to AE)
│   │   └── guidance.py             # Deposit → seed bias, spawning bias
│   │
│   ├── dynamics/                   # UF/IO and RBY mathematics
│   │   ├── __init__.py
│   │   ├── uf_io.py                # compute_uf_io()
│   │   ├── rby_update.py           # update_rby()
│   │   └── metrics.py              # Success/error/complexity measurement
│   │
│   ├── workers/                    # Background threads
│   │   ├── __init__.py
│   │   ├── scanner.py              # AE file scanner (inotify/polling)
│   │   ├── dreamer.py              # Offline recombination
│   │   ├── guard.py                # Resource watchdog (RAM/CPU/disk)
│   │   └── logger.py               # Interaction logger
│   │
│   └── api/                        # User-facing interfaces
│       ├── __init__.py
│       ├── cli.py                  # Command-line interface
│       ├── server.py               # FastAPI WebSocket server
│       ├── visualizer.py           # Live substrate visualization
│       └── dashboard.py            # Web dashboard components
│
├── tests/                          # Test suite
│   ├── test_nano_types.py
│   ├── test_expansion.py
│   ├── test_compression.py
│   ├── test_icae.py
│   ├── test_inference.py
│   ├── test_ptaie.py
│   └── test_cycle.py
│
└── scripts/                        # Utility scripts
    ├── bootstrap.py                # First-run initialization
    ├── benchmark.py                # Performance benchmarks
    └── migrate.py                  # Version migration
```

---

## Dependencies

### Core (Required)

| Package          | Version  | Purpose                                    |
|------------------|----------|--------------------------------------------|
| numpy            | ≥1.24    | Vector math, RBY operations                |
| torch            | ≥2.2     | Neural network training and inference      |
| faiss-cpu        | ≥1.7     | Vector similarity search for nano registry |
| scipy            | ≥1.10    | Sigmoid, special functions for UF/IO       |
| pillow           | ≥10.0    | Glyph image generation/reading             |
| psutil           | ≥5.9     | System resource monitoring                 |
| pyyaml           | ≥6.0     | Configuration files                        |

### Optional (Enhanced Functionality)

| Package          | Version  | Purpose                                    |
|------------------|----------|--------------------------------------------|
| faiss-gpu        | ≥1.7     | GPU-accelerated vector search              |
| fastapi          | ≥0.100   | WebSocket API server                       |
| uvicorn          | ≥0.23    | ASGI server for FastAPI                    |
| hilbertcurve     | ≥2.0     | Space-filling curves for glyph layout      |
| requests         | ≥2.31    | LLM consultant HTTP calls                 |
| watchdog         | ≥3.0     | Filesystem event monitoring                |

### GPU (For Accelerated Training)

| Package          | Version  | Purpose                                    |
|------------------|----------|--------------------------------------------|
| torch+cuda       | ≥2.2     | GPU population training (batched nanos)    |
| cupy             | ≥13.0    | GPU-accelerated numpy operations           |

> **NOTE (Experiment 08–09):** Individual nanos are slower on GPU than CPU
> due to kernel launch overhead. The GPU is only efficient when training
> **populations** of 20+ nanos batched into a single `torch.bmm` kernel.
> The scheduler MUST batch nanos into populations before GPU dispatch.

---

## Configuration Schema

```yaml
# config.yaml

# AE: Read-only data sources
ae:
  paths:
    - "C:/Users/username/Documents"    # User documents
    - "C:/Users/username/Projects"     # Code projects
  exclude:
    - "*.tmp"
    - "node_modules/**"
    - ".git/**"

# C-AE: Active sandbox
cae:
  storage_path: "./nano_sea_data"      # Where nanos and data live
  max_size_gb: 50                      # Maximum C-AE size

# Deposits: AE-side persistent storage
deposits:
  path: "./deposits"                    # AE-side deposit storage
  hot_cycles: 10                        # Full deposits in memory
  warm_cycles: 50                       # Reduced deposits on disk
  cold_cycles: 200                      # Minimal deposits

# Absularity thresholds
absularity:
  soft: 0.85                            # Begin compression planning
  hard: 0.90                            # Force compression
  critical: 0.95                        # Emergency halt

# Compression
compression:
  survive_ratio: 0.10                   # Top 10% survive
  compress_ratio: 0.70                  # Next 70% become absoleices
  destroy_ratio: 0.20                   # Bottom 20% deleted

# IC-AE Fractal Engine
icae:
  max_depth: 5                          # Maximum infection depth
  max_bridges_per_layer: 500            # Cap on bridges per depth
  budget_fraction: 0.30                 # Fraction of free space for IC-AE

# Training
training:
  batch_size: 32                        # Training batch size
  learning_rate: 0.001                  # Default LR
  max_epochs_per_nano: 10               # Training epoch cap
  continuous_workers: 2                 # Background training threads

# Inference
inference:
  default_compute_budget: 1.0           # Default query budget
  max_nanos_per_query: 200              # Hard cap on activated nanos
  timeout_ms: 5000                      # Default response timeout

# RBY Seed
seed:
  primordial: [0.3535, 0.2500, 0.3965]  # AE=C=1 derived seed
  mutation_lr: 0.05                     # Seed mutation learning rate

# UF/IO Parameters
dynamics:
  theta: [6.0, 4.0, 0.5, 6.0, 6.0, 0.8]  # [α, β, γ, δ, ε, ζ]

# External LLM (consultant, not brain)
consultant:
  enabled: true
  endpoint: "http://localhost:11434"
  model: "llama3"
  confidence_threshold: 0.3            # Consult LLM below this confidence

# API
api:
  host: "0.0.0.0"
  port: 8787
  enable_dashboard: true

# Resource limits
resources:
  ram_soft: 0.75                        # Throttle scanner at 75% RAM
  ram_hard: 0.90                        # Pause expansion at 90% RAM
  max_cpu_percent: 80                   # CPU usage cap
```

---

## Database Schema

SQLite for persistent state tracking:

```sql
-- Nano registry persistent backing
CREATE TABLE nanos (
    gid TEXT PRIMARY KEY,
    nano_type TEXT NOT NULL,
    specialization TEXT,
    r REAL NOT NULL,
    b REAL NOT NULL,
    y REAL NOT NULL,
    parent_gid TEXT,
    cycle_born INTEGER NOT NULL,
    generation_depth INTEGER DEFAULT 0,
    model_path TEXT NOT NULL,
    size_bytes INTEGER,
    param_count INTEGER,
    creation_time REAL NOT NULL,
    last_used REAL,
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    architecture_hash TEXT,
    FOREIGN KEY (parent_gid) REFERENCES nanos(gid)
);

-- Micro-absoleice log
CREATE TABLE micro_absoleices (
    gid TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    nano_gid TEXT,
    success INTEGER,
    benign INTEGER,
    r REAL, b REAL, y REAL,
    parent_icae TEXT,
    infection_depth INTEGER DEFAULT 0,
    timestamp REAL NOT NULL,
    input_hash TEXT,
    output_hash TEXT,
    metrics_json TEXT,
    FOREIGN KEY (nano_gid) REFERENCES nanos(gid)
);

-- Cycle tracking
CREATE TABLE cycles (
    cycle_number INTEGER PRIMARY KEY,
    seed_r REAL, seed_b REAL, seed_y REAL,
    start_time REAL,
    end_time REAL,
    population_peak INTEGER,
    population_surviving INTEGER,
    absularity_trigger TEXT,
    quality_score REAL,
    deposit_path TEXT
);

-- File ingestion tracking
CREATE TABLE file_index (
    path TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    r REAL, b REAL, y REAL,
    last_ingested_epoch INTEGER,
    chunk_count INTEGER,
    file_type TEXT
);

-- Collision log
CREATE TABLE collisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nano_a_gid TEXT,
    nano_b_gid TEXT,
    bridge_gid TEXT,
    depth INTEGER,
    compatibility REAL,
    timestamp REAL,
    FOREIGN KEY (nano_a_gid) REFERENCES nanos(gid),
    FOREIGN KEY (nano_b_gid) REFERENCES nanos(gid),
    FOREIGN KEY (bridge_gid) REFERENCES nanos(gid)
);

-- Interaction log (for inference training)
CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_text TEXT,
    query_r REAL, query_b REAL, query_y REAL,
    intent TEXT,
    response_text TEXT,
    activated_nano_count INTEGER,
    avg_confidence REAL,
    user_feedback REAL,
    timestamp REAL
);

-- Indexes for performance
CREATE INDEX idx_nanos_type ON nanos(nano_type);
CREATE INDEX idx_nanos_rby ON nanos(r, b, y);
CREATE INDEX idx_nanos_fitness ON nanos(success_count, usage_count);
CREATE INDEX idx_micro_timestamp ON micro_absoleices(timestamp);
CREATE INDEX idx_file_index_hash ON file_index(sha256);
CREATE INDEX idx_collisions_depth ON collisions(depth);
```

---

## Thread Architecture

```
Main Thread
├── CycleManager (orchestrates expand/compress/deposit loop)
│
├── Background Threads:
│   ├── Scanner Thread (watches AE filesystem for changes)
│   ├── ContinuousTrainer Thread #1 (trains nanos from data buffer)
│   ├── ContinuousTrainer Thread #2 (trains nanos from data buffer)
│   ├── Dreamer Thread (idle-time recombination)
│   ├── ResourceGuard Thread (monitors RAM/CPU/disk every 5s)
│   └── API Server Thread (FastAPI + WebSocket)
│
├── Thread Pool (for parallel nano inference):
│   └── 8 worker threads (configurable)
│
└── GPU Queue (if GPU available):
    ├── PopulationBatcher Thread (groups nanos by type, batches 20-500)
    ├── GPU Worker Thread #0 (trains batched populations on cuda:0)
    └── GPU Worker Thread #1 (trains batched populations on cuda:1, if present)
    
    NOTE: Individual nanos NEVER go to GPU. Only populations via NanoPopulation.
    GPU crossover point: N ≥ 20 nanos of same type → route to GPU.
    Below N=20: route to ContinuousTrainer on CPU (it's faster).
```

### GPU Scheduling Rules (from Experiments 08-12)

1. **Batch before dispatch.** The WorkQueue collects nano training requests
   and groups them by `(nano_type, operation)` before sending to GPU.
2. **GPU crossover at N ≥ 20.** Below this, CPU is faster (kernel overhead).
3. **Saturation at N ≈ 500.** Diminishing returns above this population size.
4. **Multi-GPU via CUDA streams.** Split populations across GPUs with
   `torch.cuda.Stream` for 2.5x throughput on dual-GPU systems.
5. **CUDA Graphs** for inference: capture the kernel graph once, replay it
   for 3.7x additional speedup on small populations.
6. **NCU rating** for every device: 1 NCU = 1 FeatureNano training step.
   Schedule work proportional to NCU/s capacity.

---

## Build & Run

```bash
# Install
pip install -e ".[dev]"

# First run (bootstrap from AE=C=1)
python -m nano_sea.scripts.bootstrap --ae-paths "C:/Users/you/Documents" --storage "./nano_sea_data"

# Run the sea
python -m nano_sea --config config.yaml

# CLI interaction
nano-sea chat                    # Interactive chat
nano-sea status                  # Show sea state
nano-sea scan /path/to/data      # Scan new AE data
nano-sea evolve --cycles 100     # Run evolution cycles
nano-sea compress                # Force compression

# API
nano-sea serve                   # Start WebSocket API on :8787
```

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: Real Data Training Results (test_13)

**Source:** test_13_real_data_nano_vs_llm.py — first-ever training on REAL text data.

**Critical context:** Prior to Session 3, ALL nano training used `torch.randn()`
random noise as input (ADVERSARIAL_AUDIT finding H-01). Test_13 is the first
validation that nanos can learn from actual text.

#### Benchmark Results (character-level next-token prediction, Shakespeare corpus)

| Model | Architecture | Params | Val Accuracy | Throughput | Train Time | Size/Nano |
|-------|-------------|--------|-------------|------------|------------|----------|
| **NanoPopulation** | 50 BWS nanos (256→64→32) | 489K total | **26.56%** | 3,733 samples/s | 17.1s | 38.2 KB |
| MiniTransformer | 2-layer, 4-head, d=64 | 119K | 38.28% | 10,963 samples/s | 5.8s | 476 KB |
| BigMLP | 3-layer MLP, hidden=512 | 624K | 35.94% | 23,665 samples/s | 2.7s | 2.4 MB |
| Random baseline | — | — | 0.85% | — | — | — |

#### Key Findings

1. **Nanos work on real data.** 26.56% accuracy = **31× random baseline** (0.85%).
   This resolves ADVERSARIAL_AUDIT finding M-01 ("no useful output ever produced").

2. **Accuracy gap is expected.** Nanos trail the MiniTransformer by 11.72 percentage
   points. This is the cost of distribution — 50 independent nanos with no
   cross-attention cannot match a monolithic transformer's global pattern capture.

3. **Nanos trade peak accuracy for operational advantages:**
   - **Graceful degradation:** Kill 50% of nanos → only 2.9% accuracy loss
     (transformer has no equivalent — it's all-or-nothing)
   - **Incremental growth:** Adding 10 nanos takes 0.46ms (no retraining needed)
   - **Tiny footprint:** 38.2 KB per nano vs 476 KB for the full transformer
   - **Distribution-ready:** Each nano is independently trainable and migratable

4. **Text generation quality:** All three models produce noise-like text at 500
   training steps. This is expected for character-level prediction on a small
   corpus. Coherent generation requires 10K+ steps and/or word-level tokenization.

#### GPU Population Training — Updated Benchmarks

The NanoPopulation (BWS) architecture from §GPU Population Training above is
confirmed to work on real data with the same performance characteristics:
- Population of 50 nanos trains as a single `torch.bmm` operation
- 3,733 samples/s throughput on GPU (consistent with test_09 measurements)
- Memory: 489K params across 50 nanos = 9.8K params/nano average

#### Integration Note

The `ChunkEmbedder` class (see [10_BOOTSTRAP_CODE.md](10_BOOTSTRAP_CODE.md) §Data Pipeline)
is required to feed real AE data into NanoPopulation training. Test_13 used a
simplified character-level encoding (`ord(c)/128 - 1.0`) which should be replaced
with the full PTAIE encoding pipeline for production.
