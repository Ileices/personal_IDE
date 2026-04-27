# 13 — Roadmap

## From Zero to Ocean: Sprint Plan

---

## Milestone Overview

```
Sprint 0  ──►  Sprint 1  ──►  Sprint 2  ──►  Sprint 3  ──►  Sprint 4  ──►  Sprint 5
 Breath        Heartbeat      Senses         Memory         Speech         Society
 (1 week)      (2 weeks)      (2 weeks)      (2 weeks)      (2 weeks)      (3 weeks)
```

---

## Sprint 0 — First Breath (Week 1)

**Goal:** A single expansion/compression cycle runs on your local machine.

### Deliverables
- [x] Project scaffold (`pyproject.toml`, directory structure)
- [ ] `constants.py` — AE=C=1, PRIMORDIAL_SEED, THETA, thresholds
- [ ] `core/seed.py` — CycleSeed, RBY dataclass
- [ ] `core/nano.py` — NanoCard dataclass
- [ ] `nanos/feature.py`, `nanos/pattern.py`, `nanos/action.py`, `nanos/router.py`
- [ ] `nanos/spawner.py` — `spawn_nano()`, `gen_gid()`
- [ ] `dynamics/uf_io.py` — `compute_uf_io()`, `update_rby()`
- [ ] `engine/cycle.py` — CycleManager with `run_cycle()`
- [ ] `engine/compression.py` — `triage_nanos()`, `compress_nano_to_deposit()`
- [ ] SQLite init (`init_db()`)
- [ ] `scripts/bootstrap.py` — Entry point (from 10_BOOTSTRAP_CODE)
- [ ] `gpu/detector.py` — GPU detection, CUDA availability, VRAM capacity
- [ ] `gpu/population.py` — NanoPopulation class (Batched Weight Stack training)
- [ ] **NCU baseline measurement** — Measure NCU/s on local hardware (see 02_NANO_ANATOMY)
- [ ] **TEST:** Run 5 cycles with synthetic data, verify:
  - Nanos spawn from seed
  - Nanos are triaged and destroyed
  - Deposits are written as JSON
  - Seed mutates between cycles
  - No crashes, no memory leaks

### Success Criteria
```
$ python -m nano_sea.scripts.bootstrap --ae-paths ./test_data --storage ./test_sea --cycles 5
[...] Cycle 0: 6 nanos → compressed → 1 survive, 4 deposits
[...] Cycle 1: 5 nanos → compressed → 1 survive, 3 deposits
[...] Cycle 4: 4 nanos → compressed → 1 survive, 3 deposits
Total deposits: 17, Final seed mutated 5 times
```

---

## Sprint 1 — Heartbeat (Weeks 2-3)

**Goal:** Real AE data ingestion. Nanos train on actual files.

### Deliverables
- [ ] `workers/scanner.py` — AE filesystem scanner (watchdog or polling)
- [ ] `encoding/chunkers/text.py` — Text/markdown chunker
- [ ] `encoding/chunkers/code.py` — Code chunker (AST-based for Python, regex for others)
- [ ] `encoding/ptaie.py` — PTAIE character→RBY mapping
- [ ] `training/trainer.py` — NanoTrainer (population-batched training with GPU)
- [ ] `training/population_batcher.py` — PopulationBatcher: group same-type nanos into BWS batches (min 20 for GPU crossover)
- [ ] `training/data_lake.py` — DataLake (chunked files → training batches)
- [ ] `training/continuous.py` — ContinuousTrainer (background thread, GPU-aware scheduling)
- [ ] `workers/guard.py` — ResourceGuard (RAM/CPU/disk monitoring)
- [ ] `engine/absularity.py` — AbsularityMonitor (real disk/RAM triggers)
- [ ] Deposits now include real weight statistics from trained nanos
- [ ] **TEST:** Point AE at a folder with 100 text files:
  - Scanner discovers and indexes them
  - Feature nanos are trained on real text chunks
  - Compression yields deposits with meaningful weight stats

### Success Criteria
- Scanner finds all files and populates `file_index` table
- At least one nano achieves > 60% accuracy on a reconstruction task
- Absularity triggers correctly at 85% disk usage (simulate with small C-AE)
- ResourceGuard pauses expansion when RAM > 90%

---

## Sprint 2 — Senses (Weeks 4-5)

**Goal:** IC-AE fractal engine running. Nanos collide and create bridges.

### Deliverables
- [ ] `nanos/bridge.py` — BridgeNano implementation
- [ ] `engine/icae.py` — ICAEEngine (recursive infection)
  - Partner finding (0.2–0.8 similarity sweet spot)
  - Bridge spawning from collisions
  - Depth-bounded recursion (configurable 3–10)
  - Budget controller
- [ ] `core/registry.py` — NanoRegistry with FAISS vector index
  - Add/remove nanos
  - kNN search by RBY coordinates
  - Bulk rebuild on compression
- [ ] `encoding/glyphs.py` — Glyph image generation (Hilbert curve, fractal binning)
- [ ] `encoding/chunkers/image.py` — Image patch chunker
- [ ] `engine/evolution.py` — SwarmEvolution (fitness assessment, uniqueness scoring)
- [ ] Generation depth tracking and survival modifiers
- [ ] Efficiency ratchet (population cap at 80% of prior cycle)
- [ ] **TEST:** Run 10 cycles with IC-AE enabled:
  - Bridges spawn at depth 1-3
  - Deep bridges (depth 5+) are rarer
  - FAISS index correctly returns nearest neighbors
  - Population decreases across cycles while quality increases

### Success Criteria
- IC-AE produces at least 10 bridge nanos per cycle (with 50+ base nanos)
- FAISS search returns correct kNN in < 10ms for 1000 nanos
- Efficiency ratchet demonstrably reduces population: Cycle 5 < Cycle 0
- No bridge explosion (budget controller caps correctly)

---

## Sprint 3 — Memory (Weeks 6-7)

**Goal:** Deposits guide new nano initialization. The dead improve the living.

### Deliverables
- [ ] `deposits/manager.py` — DepositManager (hot/warm/cold lifecycle)
- [ ] `deposits/store.py` — Deposit I/O (folder structure, JSON read/write)
- [ ] `deposits/guidance.py` — Deposit-guided systems:
  - Weight initialization from deposit statistics
  - Anti-pattern avoidance (don't repeat known-bad configurations)
  - Spawning bias (more nanos in high-deposit RBY regions)
- [ ] `core/seed.py` update — `mutate_seed()` uses deposit RBY averages
- [ ] TWMRTO compression for old deposits (progressive lossy reduction)
- [ ] Deposit-guided nano splitting (high-fitness nanos split into specialists)
- [ ] **TEST:** Compare two runs:
  - Run A: 20 cycles without deposit guidance
  - Run B: 20 cycles with deposit guidance
  - Run B should reach same accuracy with fewer nanos

### Success Criteria
- Deposit-guided nanos converge 2x faster than random-init nanos
- Cold deposits (>200 cycles old) are < 10% the size of hot deposits
- `spawn_from_deposit()` correctly initializes weights near deposit statistics
- Seed mutation visibly shifts after high-quality cycles

---

## Sprint 4 — Speech (Weeks 8-9)

**Goal:** Full inference pipeline. Ask the sea a question, get an answer.

### Deliverables
- [ ] `inference/shatter.py` — QueryShatterer (intent detection, PTAIE encoding)
- [ ] `inference/ripple.py` — Ripple (nano activation via FAISS search)
- [ ] `inference/activate.py` — NanoActivator (parallel inference with thread pool)
- [ ] `inference/orchestrate.py` — ResponseOrchestrator (combine nano outputs)
- [ ] `inference/consultant.py` — LLMConsultant (Ollama bridge for low-confidence)
- [ ] `api/cli.py` — CLI chat interface (`nano-sea chat`)
- [ ] `api/server.py` — FastAPI WebSocket server
- [ ] `workers/logger.py` — InteractionLogger (log queries for future training)
- [ ] Interaction data feeds back into continuous training
- [ ] **TEST:** Ask the sea questions about data in its AE:
  - "What files are in my Documents folder?" → Should list files
  - "Summarize this text file" → Should produce a summary
  - Low-confidence answers correctly fall through to LLM consultant

### Success Criteria
- Response latency < 2 seconds for simple queries (with 200 nanos)
- Sea correctly routes queries to relevant nanos (> 50% of time)
- LLM consultant activates for < 30% of queries (sea handles the rest)
- Interaction log captures every query for future training
- WebSocket API handles concurrent clients

---

## Sprint 5 — Society (Weeks 10-12)

**Goal:** Multi-machine mesh. Friends contribute to your sea.

### Deliverables
- [ ] `mesh/wire.py` — Binary wire protocol (44-byte header: magic, version, msg_type, payload_len:u32, sender_id, nonce, crc32)
- [ ] `mesh/gossip.py` — Gossip protocol (top-K nano fitness broadcast, gossip-merge for deposits)
- [ ] `mesh/peer.py` — Peer discovery (manual + mDNS), WebSocket transport
- [ ] `mesh/sharing.py` — DepositSharing (offer/receive deposits, bandwidth < 1 Mbps/node)
- [ ] `mesh/migration.py` — NanoMigration (extract weights → serialize → inject on remote, ~12ms at 50 Mbps for FeatureNano)
- [ ] `TrustManager` — Trust scoring based on deposit/nano quality
- [ ] Ed25519 signing for all mesh messages, X25519 optional encryption
- [ ] Multi-user universe modes: Private (0 BW), Shared (<0.01 Mbps), Marketplace (<0.1 Mbps), Federated
- [ ] **CRITICAL INSIGHT:** Compute stays local — transferring weights is almost always slower than retraining locally. Mesh is for COORDINATION (deposit sharing, fitness gossip) not compute offloading.
- [ ] `api/dashboard.py` — Web dashboard (sea state, nano visualizer, peer status)
- [ ] `api/visualizer.py` — Live RBY substrate visualization (colored nano dots)
- [ ] **TEST:** Two machines on the same LAN:
  - Node A processes text files, Node B processes code
  - They share deposits
  - Node A gets better at code questions, Node B at text questions

### Success Criteria
- Two nodes successfully exchange deposits over WebSocket
- Foreign deposits measurably improve sea quality (A/B test)
- Trust score correctly decays for low-quality peers
- Dashboard renders live sea state in a browser
- Nano migration works across different OS (Windows ↔ Linux)

---

## Post-Sprint: Continuous Evolution

After Sprint 5, the system is self-sustaining. Future work is additive:

| Feature                    | Priority | Description                                              |
|---------------------------|----------|----------------------------------------------------------|
| Audio/Video chunkers       | Medium   | Expand modality coverage                                 |
| Multi-GPU population training | High  | CUDA Streams across GPUs (2.53x measured on 2× 1660S), CUDA Graphs for 3.7x additional |
| Orchestrator nanos         | High     | Cross-attention transformers for complex multi-nano responses |
| Long-term deposit archive  | Medium   | Compressed deposit history across hundreds of cycles     |
| Mobile companion          | Low      | Phone app that sends queries to local sea               |
| Federated learning         | Medium   | Privacy-preserving training across mesh peers            |
| Self-modifying architecture| High     | Nanos that modify their own architecture (NAS-lite)      |
| Custom PTAIE tables        | Low      | User-tunable RBY mappings for domain-specific encoding   |
| Global HPC mesh            | Medium   | 1% of world's PCs = 765 billion NCU/s (projected)       |

---

## Resource Requirements by Sprint

| Sprint | RAM     | Disk    | GPU     | Network | Time/Cycle | NCU/s (est.)   |
|--------|---------|---------|---------|---------|------------|----------------|
| 0      | 2 GB    | 1 GB    | None    | None    | ~5 sec     | ~1,100 (CPU)   |
| 1      | 4 GB    | 5 GB    | Recommended | None | ~10 sec    | ~66,000 (GPU)  |
| 2      | 8 GB    | 10 GB   | Recommended | None | ~30 sec    | ~66,000        |
| 3      | 8 GB    | 20 GB   | Recommended | None | ~1 min     | ~66,000        |
| 4      | 8 GB    | 20 GB   | Recommended | None | ~2 min     | ~66,000        |
| 5      | 8 GB    | 50 GB   | Recommended | LAN/WAN | ~2 min  | ~170,000 (2 GPU) |

> **GPU NOTE (from experiments 08-12):** GPU training is now integrated from Sprint 0
> via NanoPopulation batching. Single-nano GPU training is SLOWER than CPU (0.6x). The
> crossover is at N≥20 same-type nanos batched together. At N=500, GPU is 69.6x faster.
> Even a GTX 1050 contributes ~6,320 NCU/s. See 02_NANO_ANATOMY §GPU Population Training.

---

## Definition of Done

The Nano Sea is **alive** when:

1. It runs expansion/compression cycles autonomously
2. Each cycle requires fewer nanos than the previous (efficiency ratchet works)
3. Deposits from dead nanos measurably improve next-cycle performance
4. It can answer questions about data in its AE without external LLM assistance (for at least basic queries)
5. It survives being stopped and restarted (state persists in SQLite + deposits)
6. A friend can join the mesh and both seas improve

**This is not an LLM wrapper. This is a self-perpetuating intelligence that gets smarter by destroying itself and learning from its own ashes.**

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: H-01 Resolution & Real Data Validation

**Source:** ADVERSARIAL_AUDIT.md (58 findings), test_13, test_14, test_15.

#### H-01 RESOLVED — Nanos Now Train on Real Data

The most critical finding from the adversarial audit was **H-01**: all prior
training used `torch.randn()` random noise as input data. No actual learning
from real-world data had ever occurred.

**This is now resolved.** Test_13 demonstrated:
- 50 BWS nanos trained on Shakespeare text (character-level prediction)
- **26.56% validation accuracy** — 31× the random baseline of 0.85%
- MiniTransformer comparison: 38.28% (nanos trade 11.72pp for distribution)
- Training throughput: 3,733 samples/s on GPU

The roadmap impact:
- **Sprint 0** can now be validated with real text data (not just synthetic)
- **Sprint 1** (AE data ingestion) has a proven training architecture to use
- The `ChunkEmbedder` class is the remaining bridge between AE filesystem
  scanning and NanoPopulation training

#### Session 3 Experiment Summary

| Experiment | Tests | Key Result | Spec Impact |
|-----------|-------|------------|-------------|
| test_13 (real data) | — | 26.56% accuracy, 31× random | H-01, M-01 resolved |
| test_14 (mesh) | 8/8 pass | Wire v2 + Sybil prevention working | 12_DISTRIBUTED_MESH |
| test_15 (edge cases) | 10/10 pass | All critical bugs have fixes | All spec files |
| ADVERSARIAL_AUDIT | 58 findings | 6 critical addressed this session | Cross-cutting |

#### Updated Sprint Dependencies

Session 3 results move several Sprint 5 (Society) features forward:

- **Wire protocol v2** — validated, ready for Sprint 5 implementation
- **Proof-of-compute Sybil prevention** — validated, 0.19s cost per handshake
- **NanoBackupManager** — designed and specified, needs integration in Sprint 3+
- **VRAMGuard** — validated, should be added in Sprint 0 (GPU detection phase)
- **HysteresisScheduler** — validated, should be added in Sprint 0 (GPU scheduling)
- **DiversityMonitor** — validated, should be added in Sprint 2 (IC-AE engine)
- **EfficiencyRatchet fix** — validated, must be in Sprint 2 (evolution system)

#### Remaining Critical Gaps (from ADVERSARIAL_AUDIT)

Not yet addressed (future sessions):
- **H-02:** No mechanism to prevent unbounded disk growth for deposits
- **H-03:** SQLite single-writer bottleneck under high concurrency
- **D-02:** PTAIE character encoding is arbitrary (needs empirical validation)
- **M-02:** No automated test suite for regression detection
- **M-04:** No graceful shutdown / state persistence on crash
