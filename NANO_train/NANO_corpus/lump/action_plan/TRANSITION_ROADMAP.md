# NanoMoE → Production Agent: Transition Roadmap

## STATUS ASSESSMENT

### Research Phase: COMPLETE ✅

All 30 tests executed. Every component from ARCHITECTURE_COMPLETION.md has been validated:

| Test | Component | Result | Status |
|------|-----------|--------|--------|
| 01-05 | Core MoE fundamentals | Proven | ✅ |
| 06-10 | Scheduling, batching, GPU | Proven | ✅ |
| 11-14 | Mesh protocol, multi-machine | Proven (loopback) | ✅ |
| 15-17 | Edge cases, hardening, redesign | Proven | ✅ |
| 18-20 | Real data, gauntlet, handicap | Proven | ✅ |
| 21 | Fractal depth (multi-layer) | 3 layers optimal | ✅ |
| 22 | Chromatic router (Aitchison) | Works, interpretable | ✅ |
| 23 | Heterogeneous experts | RBY-guided sizing helps | ✅ |
| 24 | Expert crosstalk (IC-AE) | Gate learns >0, synergies real | ✅ |
| 25 | Touch tensor tracking | Clear specialization shown | ✅ |
| 26 | Cosmic cycles | Cycle 2 > Cycle 0, deposits work | ✅ |
| 27 | Continual learning | Deposit-shield beats naive | ✅ |
| 28 | Spectral embedding (PTAIE) | Faster early convergence | ✅ |
| 29 | Adaptive top-k | Geometric confidence routing | ✅ |
| 30 | Full integration (4 versions) | v3 soft-k = champion (-3.46%) | ✅ |

### Architecture: PROVEN AT TOY SCALE ⚠️

The v3 soft-k architecture is the champion:
- **PPL 4.977** (-3.46% vs Vanilla, -9.1% vs Dense)
- **avg_k ≈ 1.11** (strong specialization, soft margins)
- **Expert cycling adds -1.31%** improvement
- **Parallel GPU working** (1.65x speedup)
- **~330K params, Shakespeare character-level**

### What "Perfect" Would Mean vs What We Have

| Aspect | Status | Gap |
|--------|--------|-----|
| MoE routing math | PROVEN | None |
| Soft adaptive k | PROVEN | None |
| Cosmic cycling | PROVEN | None at small scale |
| Touch tensor | PROVEN | None |
| Deposit system | PROVEN | None |
| Multi-layer stacking | PROVEN | None |
| Expert crosstalk | PROVEN | None |
| Chromatic router | PROVEN | None |
| **Scale (330K → useful)** | **NOT TESTED** | **CRITICAL** |
| **Code training data** | **NOT TESTED** | **CRITICAL** |
| **Instruction following** | **NOT TESTED** | **CRITICAL** |
| **Tool use / action generation** | **NOT TESTED** | **CRITICAL** |
| **Tokenizer (char → BPE/code)** | **NOT TESTED** | **IMPORTANT** |
| **Production serving** | **NOT BUILT** | **REQUIRED** |
| **Real multi-machine mesh** | **LOOPBACK ONLY** | **LATER** |

---

## THE HARD TRUTH

The architecture is **proven correct** but at a scale that can't do anything useful yet. A 330K parameter model predicting Shakespeare characters is proof-of-concept. To replace an LLM in an IDE agent, you need:

1. **~50M-500M parameters** (minimum for coherent code generation)
2. **Code-specific training data** (not Shakespeare)
3. **Instruction-following capability** (not just next-char prediction)
4. **Action/tool-use training** (generate commands, not prose)
5. **The surrounding infrastructure** (the 15-file action plan)

Think of it this way:
- Tests 1-30 proved the **ENGINE** works (the combustion cycle is valid)
- You still need to build the **CAR** (chassis, transmission, wheels, steering)
- And then FUEL it (training data for code/actions)

---

## WHAT YOU DO NOW: Three Parallel Tracks

### Track A: Scale the Engine (Weeks 1-4)

**Goal:** Prove NanoMoE works at real scale on code data.

#### A1. Prepare Code Training Data
- Collect: Python source code (your own repos, open-source permissive code)
- Collect: IDE action traces (keystroke logs, command sequences, file operations)
- Format: One file per sample, 512-2048 token sequences
- Size needed: ~100MB minimum for meaningful training at 50M+ params
- **Why this matters:** Shakespeare patterns != code patterns. The architecture might need different expert counts, layer depth, or ff_dim at code scale.

#### A2. Build a Real Tokenizer
- Character-level worked for research but is wildly inefficient for code
- Options:
  - **BPE (byte-pair encoding):** Train on your code corpus, 4096-16384 vocab
  - **SentencePiece:** Google's tokenizer, handles code well
  - **Existing:** Use a pretrained code tokenizer (CodeLlama, StarCoder vocab)
- The PTAIE spectral embedding needs adaptation: map BPE tokens to RBY instead of raw bytes

#### A3. Scale-Test the v3 Architecture
```
test_31: NanoMoE at 10M params on Python code (single GPU, fits 6GB)
test_32: NanoMoE at 50M params on Python code (needs both GPUs or the 3090)
test_33: 3 cosmic cycles at 50M params (does cycling still help at scale?)
test_34: Compare NanoMoE-50M vs vanilla transformer-50M on code completion
```

**Success criteria:** NanoMoE at 50M params generates syntactically valid Python more often than a vanilla transformer at the same param count.

#### A4. Add Instruction Following
- The model needs to respond to prompts, not just continue text
- Training format shift: `<instruction>build an RPG</instruction><response>script code...</response>`
- This is where the 512-token context window from your action plan becomes real
- The agent doesn't need to write 10K tokens — it writes ONE automation script per turn

### Track B: Build the Production Shell (Weeks 1-3, parallel with A)

**Goal:** Build the 15-file infrastructure from `agent_meta_architecture_action_plan.json`, but wire it to an EXISTING LLM first, then swap in NanoMoE when Track A delivers a trained model.

#### Build Order (from your action plan):
```
Phase 1 — Memory Fabric (can start immediately)
  1. scaffold_memory_fabric.py — run once, creates dirs
  2. memory_index_manager.py — TokenAwareIndex with overflow queue
  3. memory_writer.py — saves turns to disk with summaries

Phase 2 — Atomic Reference System
  4. atomic_ref_schema.json — UUID + group + ports + layers
  5. atomic_reference_system.py — stamp injector + group puller
  6. context_assembler.py — packs relevant code into token budget

Phase 3 — Automation Script Engine
  7. schema_interrogator.py — JSON schema of clarifying questions
  8. script_executor.py — runs generated scripts + compresses results

Phase 4 — Agent Control Loop
  9. meta_agent_controller.py — the brain orchestrator
  10. expansion_runner.py — automated EXPANSION_PORT cycling

Phase 5 — IDE Integration
  11. llm_adapter.py — plug any model (Ollama, Anthropic, OpenAI, NanoMoE)
  12. agent_cli.py — terminal interface
  13. system_prompt.txt — script-generation mode instructions
  14. drive_router.py — hot/warm/cold memory tiers
  15. memory_maintenance.py — periodic cleanup
```

**The key insight:** Build this with `llm_adapter.py` using Ollama (Mistral/CodeLlama) as the brain FIRST. Get the entire pipeline working end-to-end with an existing model. Then, when NanoMoE is trained on code data (Track A), create a `NanoMoEAdapter` class and drop it in. Zero changes to the rest of the system.

#### NanoMoE Adapter (the bridge):
```python
class NanoMoEAdapter(LLMAdapter):
    """Drop-in replacement for Ollama/Anthropic when NanoMoE is trained."""
    def __init__(self, model_path: str, device: str = 'cuda'):
        self.model = load_nanomoe(model_path)
        self.model.to(device).eval()
        self.tokenizer = load_tokenizer(model_path)
    
    def call(self, prompt: str, max_tokens: int = 512) -> str:
        tokens = self.tokenizer.encode(prompt)
        # Use only last 512 tokens (context window constraint)
        tokens = tokens[-512:]
        with torch.no_grad():
            output = self.model.generate(tokens, max_new_tokens=max_tokens)
        return self.tokenizer.decode(output)
```

### Track C: IDE Integration for Autonomous Use (Weeks 3-6)

**Goal:** Make the agent actually control a computer.

#### C1. Screen Understanding
- The agent needs to "see" what's on screen
- Options: screenshot → OCR, or direct API access to IDE state
- For VS Code: use the Extension API to read editor state, terminal output, file tree
- **Machine shortcut:** No mouse movement. Direct API calls:
  - `vscode.workspace.openTextDocument(path)` instead of "click file in explorer"
  - `vscode.window.activeTextEditor.edit()` instead of "type characters"
  - `child_process.exec()` instead of "open terminal and type"

#### C2. Action Space Definition
What the agent can DO (replacing human actions with machine commands):
```
| Human Action              | Machine Shortcut                        |
|---------------------------|-----------------------------------------|
| Move mouse to file        | vscode.workspace.openTextDocument(uri)  |
| Click to open             | vscode.window.showTextDocument(doc)     |
| Type code                 | editor.edit(editBuilder => ...)          |
| Open terminal             | vscode.window.createTerminal()          |
| Run command               | terminal.sendText(command)              |
| Read output               | terminal.onDidWriteData                 |
| Navigate to line          | editor.revealRange(range)               |
| Search files              | vscode.workspace.findFiles(glob)        |
| Git operations            | child_process.exec('git ...')           |
| Install packages          | child_process.exec('pip install ...')   |
| Read error output         | vscode.languages.getDiagnostics()       |
| Select text               | editor.selection = new Selection(...)   |
| Screen position selection | Direct coordinate → element mapping     |
```

#### C3. Training Data for Actions
- Record yourself coding in VS Code for a few hours
- Log every action as (state, action, result) tuples
- State = context window snapshot (files open, cursor position, recent edits)
- Action = the API call made
- Result = what changed
- This becomes training data for the NanoMoE agent

---

## RECOMMENDED EXECUTION ORDER

```
Week 1:
  [Track B] Build Phases 1-2 (memory fabric + atomic refs)
  [Track A] Collect code training data, build tokenizer

Week 2:
  [Track B] Build Phases 3-4 (automation engine + control loop)
  [Track A] Run test_31 (10M NanoMoE on code)
  
Week 3:
  [Track B] Build Phase 5 (IDE integration, CLI, adapters)
  [Track B] Test full pipeline with Ollama as brain
  [Track A] Run test_32 (50M NanoMoE on code)

Week 4:
  [Track A] Run test_33 (cosmic cycles at scale)
  [Track A] Run test_34 (NanoMoE vs vanilla on code)
  [Track C] Start IDE extension skeleton

Week 5-6:
  [Track A] Instruction-following fine-tune
  [Track C] Action recording + training data collection
  [ALL] Swap NanoMoE into the production pipeline
```

---

## THE CRITICAL QUESTION YOU NEED TO ANSWER

Before building, decide: **Do you want to train NanoMoE from scratch on code, or use NanoMoE as a ROUTER/CONTROLLER over existing tools?**

### Option 1: NanoMoE AS the LLM (Hard Mode)
- Train a 50M+ param NanoMoE to actually generate code
- Needs massive training data, weeks of GPU time
- Result: fully self-contained, no external API dependency
- Risk: may not match even small existing models (Phi-3-mini, StableLM)

### Option 2: NanoMoE AS the Controller (Smart Mode) ← RECOMMENDED
- Use a small NanoMoE (~5-10M params) as the META-CONTROLLER
- It doesn't generate code — it generates which TOOL to call and what ARGUMENTS to pass
- Tools: file read/write, terminal exec, git ops, search, existing LLM for code gen
- The NanoMoE brain decides STRATEGY; external tools handle EXECUTION
- This matches your action plan perfectly (agent writes automation SCRIPTS, not final code)
- The 512-token context window is plenty for tool-calling decisions
- Training data is TINY (action traces, not code corpora)

### Option 3: Hybrid (Best of Both)
- NanoMoE controller for routing/decisions (small, fast, custom-trained)
- Existing LLM for heavy code generation (swap via adapter)
- NanoMoE learns WHEN to call the LLM and WHAT to ask for
- Over time, train larger NanoMoE to take over more code gen tasks
- Progressive replacement: start 90% LLM + 10% NanoMoE → shift ratio as NanoMoE improves

---

## WHAT'S NOT DONE (Remaining Tests if Needed)

These are only needed if you want to push the research further before production:

| Test | What | When |
|------|------|------|
| test_31 | 10M NanoMoE on Python code | Track A Week 2 |
| test_32 | 50M NanoMoE multi-GPU | Track A Week 3 |
| test_33 | Long-horizon cosmic cycles (10+) | Track A Week 4 |
| test_34 | NanoMoE vs published baselines | Track A Week 4 |
| test_35 | Self-evolving system over days | Future |
| Real mesh | Multi-machine (not loopback) | When you have 2+ machines |

---

## FILES TO CREATE FIRST

The action plan is already perfectly structured. Start with these in order:

1. `scaffold_memory_fabric.py` — run once (from task 1.1)
2. `memory_index_manager.py` — the token-aware index (task 1.2)
3. `memory_writer.py` — persistent memory (task 1.3)
4. `llm_adapter.py` — model interface (task 5.2, needed early for testing)
5. `context_assembler.py` — packs context window (task 2.3)

These 5 files give you a working memory fabric + model interface. From there, everything else builds on top.

---

## SUMMARY

| Question | Answer |
|----------|--------|
| Am I done with tests? | **YES for research.** Architecture proven at toy scale. |
| Is the architecture perfect? | **Proven correct, NOT proven at useful scale.** |
| Are we missing anything? | **Scale testing on code data. Production infrastructure. IDE integration.** |
| What do I do now? | **Build the 15-file production system (Track B), scale NanoMoE on code (Track A), wire IDE actions (Track C) — in parallel.** |

The architecture is sound. The math works. The components validated. Now it's engineering: build the car around the engine, fuel it with code data, and connect it to the steering wheel (IDE).
