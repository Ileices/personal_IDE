# Tool Design for Small-Context LLM Code Agents
## How to Make a 4,000-Token Model Capable of Building Entire Codebases

> A practical engineering design document for anyone who wants to build their own
> AI coding agent — from scratch, using any model, including tiny ones running
> locally. No cloud required. No giant context window required.

---

## The Core Problem: Why Context Size Feels Like It Matters

A model with a 4,000-token context window can see roughly 300 lines of code at
once. A real codebase has tens of thousands of lines. This seems like an
insurmountable gap — but it is not a model problem. It is an **information
retrieval problem**.

A human expert programmer working on a 500,000-line codebase is not holding all
500,000 lines in their head. They hold at most a few hundred lines in working
memory at any given time. What makes them effective is their ability to:

1. Know **where** to look for relevant information without reading everything
2. Hold a **compressed mental model** of the whole system
3. Make **targeted edits** to single functions without rewriting files
4. Use **tools** (IDE, compiler, debugger) to verify correctness without
   understanding every detail

The same capabilities can be built as software tools. When those tools are given
to a small model, the model's effective capability scales with the tools, not
with its parameter count.

**The thesis of this document:**
> A 4,000-token model with excellent tools will outperform a 200,000-token model
> with no tools on real software engineering tasks.

This is backed by empirical research (SWE-agent, 2024) and by the simple
information-theoretic argument that the right 4,000 tokens beats irrelevant
200,000 tokens every time.

---

## Part 1 — The Seven Classes of Tools You Need

Every tool in a code agent serves one of seven purposes. You need at least one
tool of each class. Build these before you build anything else.

### Class 1: Symbol-Level Read (not file-level read)

**The problem:** `read_file` gives you the whole file. A 200-line file costs ~400
tokens. A 2,000-line file costs ~4,000 tokens — your entire budget for one file.

**The solution:** Tools that read at the **symbol level**, not the file level.

```
get_function(file, function_name) → signature + body only
get_class_api(file, class_name)   → public methods + fields only (no impl)
get_struct(file, struct_name)     → field names + types only
get_signature(file, symbol_name)  → one-line declaration only
```

A class with 20 methods might be 400 lines. Its public API surface is 20 lines.
When you only need to know how to call it — not how it works — `get_class_api`
costs ~40 tokens instead of 800 tokens. That is a 20x compression.

**Implementation:** Parse the file with a language-aware parser (libclang for
C++, tree-sitter for any language) and extract only the requested symbol's AST
node. No regex — use a real parser so nested braces and templates are handled
correctly.

```python
import clang.cindex as cx

def get_function(filepath, name):
    idx = cx.Index.create()
    tu  = idx.parse(filepath, args=['-std=c++20'])
    for node in tu.cursor.walk_preorder():
        if node.spelling == name and node.kind in (
            cx.CursorKind.FUNCTION_DECL,
            cx.CursorKind.CXX_METHOD
        ):
            start = node.extent.start.offset
            end   = node.extent.end.offset
            return open(filepath).read()[start:end]
    return None
```

**Token budget saved:** 10x–50x per lookup compared to full file reads.

---

### Class 2: Symbol Graph Navigation

**The problem:** The model needs to understand dependencies without reading
every file. If it is editing `foo.cpp`, it needs to know what `foo.cpp` includes,
what it exposes, and what calls it.

**The solution:** A pre-built **symbol graph** that is queried, not read.

```
find_callers(symbol)      → list of (file, line) that call this symbol
find_callees(symbol)      → list of symbols this function calls
find_definitions(symbol)  → where is this symbol defined
find_usages(symbol)       → every use of this symbol in the project
get_includes(file)        → what does this file include
get_includers(file)       → what files include this file
get_symbol_type(symbol)   → return type and parameter types
```

These tools give the model a **navigable map** of the codebase. Instead of
reading files to understand relationships, it queries the graph. Each query
returns a compact list — typically 5–50 items — rather than file contents.

**Implementation:** Build this index at project load time using one of:
- **clangd** (C++): already computes this for IntelliSense, expose it via LSP
- **pyright** (Python): same
- **tree-sitter** + a custom walker: any language, offline, no server needed
- **ctags/gtags**: lightweight, works everywhere, text-based output

Store the graph in SQLite. Update incrementally when files change (watch with
`inotify` on Linux, `ReadDirectoryChangesW` on Windows).

```sql
CREATE TABLE symbols (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    file     TEXT NOT NULL,
    line     INTEGER,
    kind     TEXT,  -- function, class, struct, variable
    signature TEXT
);
CREATE TABLE calls (
    caller_id INTEGER REFERENCES symbols(id),
    callee_id INTEGER REFERENCES symbols(id)
);
CREATE TABLE includes (
    includer TEXT,
    included TEXT
);
CREATE INDEX idx_name ON symbols(name);
```

Each query against this table costs zero file reads and returns in microseconds.

---

### Class 3: Semantic Search (Concept → Location)

**The problem:** The model needs to find code by meaning, not by name. "Where is
the code that handles checkpoint loading?" — the function might be named
`deserialize_blob` or `restore_state` or `load_from_db`. Grep does not help.

**The solution:** **Embedding-based semantic search** over code.

```
semantic_find(query, top_k=5) → ranked list of (file, symbol, score, snippet)
```

**How it works:**
1. At index time, run every function/class through an embedding model, storing
   the resulting vector alongside the symbol in the database.
2. At query time, embed the query string with the same model, then find the
   K nearest vectors by cosine similarity.
3. Return the matching symbols with a short context snippet.

**Embedding models small enough to run locally:**
- `code-bert` (125M params, 768-dim vectors, 512 token input)
- `nomic-embed-code` (137M params, specifically tuned for code)
- `all-minilm-l6-v2` (22M params, fast, good for docstrings/comments)

You do not need a large embedding model. The quality difference between a 22M
embedding model and a 1B embedding model on code retrieval is small. The
22M model runs in milliseconds on CPU.

**Storage:** SQLite with the `sqlite-vss` extension (vector similarity search),
or a flat numpy file for small codebases. For a 10,000-function codebase with
768-dim f32 vectors: 10,000 × 768 × 4 bytes = ~30 MB. Fits in RAM.

```python
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('nomic-ai/nomic-embed-code')

def build_index(symbols):
    texts   = [f"{s.signature}\n{s.docstring}" for s in symbols]
    vectors = model.encode(texts, batch_size=64, show_progress_bar=True)
    return np.array(vectors, dtype=np.float32)

def semantic_find(query, index, symbols, top_k=5):
    qvec  = model.encode([query])[0]
    scores = index @ qvec / (np.linalg.norm(index, axis=1) * np.linalg.norm(qvec))
    top   = np.argsort(scores)[::-1][:top_k]
    return [(symbols[i], float(scores[i])) for i in top]
```

Token budget for each result: ~50–100 tokens (file path + signature + score).
A top-5 result set costs ~400 tokens. Finding the right function without this
tool would require reading multiple files — potentially thousands of tokens.

---

### Class 4: Surgical File Editing (Diff-Level Writes)

**The problem:** When the model fixes a bug, it should not rewrite the whole
file. Rewriting introduces new errors, wastes tokens on unchanged content, and
makes review harder.

**The solution:** Tools that edit at the **function level**, producing unified
diffs, not full rewrites.

```
replace_function(file, function_name, new_body) → applies edit, returns diff
insert_after_symbol(file, symbol, new_code)     → injects code after a symbol
delete_function(file, function_name)            → removes a function
add_method_to_class(file, class_name, method)   → inserts into class body
rename_symbol(file, old_name, new_name)         → renames & updates all refs
```

**Why this matters for a 4,000-token model:**

A full-file rewrite of a 150-line file costs ~300 tokens for the new file
content plus the model needs the original in context to know what to keep.
That is 600 tokens for one edit.

A function replacement where the function is 15 lines costs ~30 tokens input
(the new body) + ~10 tokens overhead. That is 40 tokens for the same edit.
**15x more efficient.**

**Implementation:** Use libclang's `SourceRange` or tree-sitter's `edit()` API
to locate the symbol's byte range in the file, replace exactly those bytes, and
write back.

```python
def replace_function(filepath, func_name, new_body):
    original = open(filepath).read()
    start, end = find_symbol_range(filepath, func_name)  # byte offsets
    new_content = original[:start] + new_body + original[end:]
    # Safety: parse the result to ensure it still compiles before writing
    if parse_ok(new_content, filepath):
        open(filepath, 'w').write(new_content)
        return unified_diff(original, new_content, filepath)
    else:
        raise SyntaxError("Replacement produced unparseable code")
```

The `parse_ok` step is critical — it prevents the model from writing syntactically
broken code without realizing it.

---

### Class 5: Compiler Feedback (Compressed)

**The problem:** Raw compiler output is verbose. MSVC can produce 200 lines of
error output for a single missing semicolon. Feeding this raw to a 4,000-token
model consumes the entire budget.

**The solution:** A **diagnostic compressor** that extracts only what the model
needs.

```
get_errors(file)              → [(line, col, error_code, short_message)]
get_errors_for_symbol(symbol) → errors that mention this symbol
get_first_error()             → the first and most fundamental error
build_and_get_errors(target)  → compile target, return compressed diagnostics
```

**Compression rules:**
1. Keep only unique error messages (deduplicate template instantiation noise)
2. Strip full file paths (replace with relative paths)
3. Remove "note:" continuations for errors the model can infer from the primary diagnostic
4. For template errors: keep only the innermost substitution failure
5. Format as: `file.cpp:42: error C2065: 'foo' undeclared identifier`

A typical MSVC error storm of 300 lines compresses to 5–15 meaningful
diagnostics. 300 lines ≈ 600 tokens → 10 diagnostics ≈ 100 tokens. **6x
compression** on the thing that matters most for fixing bugs.

```python
import subprocess, re

def build_and_get_errors(target, build_dir):
    result = subprocess.run(
        ['cmake', '--build', build_dir, '--target', target],
        capture_output=True, text=True
    )
    errors = []
    for line in result.stderr.splitlines():
        m = re.match(r'(.+?)\((\d+)\).*?(error|warning)\s+(\w+):\s+(.+)', line)
        if m:
            file, ln, severity, code, msg = m.groups()
            errors.append({
                'file': os.path.relpath(file),
                'line': int(ln),
                'severity': severity,
                'code': code,
                'message': msg[:120]  # truncate long messages
            })
    # Deduplicate: same (file, code) pair → keep first
    seen = set()
    unique = []
    for e in errors:
        key = (e['file'], e['code'])
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique[:20]  # cap at 20 errors max
```

---

### Class 6: Task Decomposition and State Tracking

**The problem:** A 4,000-token model cannot hold a 50-step plan in its context.
By step 10, steps 1–5 have scrolled out of the window and the model forgets what
it has already done.

**The solution:** An **external task queue** with persistent state, managed by
the tool infrastructure — not by the model's context.

```
task_create(title, description, deps=[]) → task_id
task_list()                              → current queue with statuses
task_start(task_id)                      → mark in-progress, return details
task_complete(task_id, notes="")         → mark done, record what was done
task_get_context(task_id)                → compressed context for this task
task_add_note(task_id, note)             → append to task's knowledge
```

The key insight: **the model does not plan; the scaffolding plans**. The human
(or a larger model) creates the task tree upfront. The small model is only ever
given one task at a time, with exactly the context it needs for that task — nothing
more.

**What `task_get_context` returns for each task:**
- The task description (~50 tokens)
- Definitions of symbols the task needs to call (~20 tokens per symbol)
- Definitions of symbols the task needs to implement (~10 tokens for signatures)
- Output from any dependency tasks (~30 tokens per dep)
- Any relevant error messages (~50 tokens)

Total per task: ~200–400 tokens. That leaves 3,600 tokens for the model's
generated code — more than enough for a single function.

**How the scaffolding decides what context to inject:**
1. Read the task description, extract symbol names mentioned in it
2. Look up those symbols in the symbol graph
3. Fetch their signatures (not bodies) from the index
4. Inject only that

This is **retrieval-augmented context assembly** applied specifically to code tasks.

---

### Class 7: Test-Driven Verification (Compressed)

**The problem:** After editing code, the model needs to know if it worked. Running
tests produces long output. Parsing test output costs tokens.

**The solution:** A test runner that returns **pass/fail per test with the minimal
failing context**.

```
run_test(test_name)            → {passed: bool, failure_line: str, assertion: str}
run_tests_for_file(file)       → [{test, passed, error}] — only tests related to file
run_all_tests()                → {passed: int, failed: int, failures: [{test, reason}]}
get_test_for_symbol(symbol)    → which tests exercise this symbol
```

**What a failure result looks like (compressed):**
```json
{
  "test": "test_rby_color::mix_no_green_in_ancestral",
  "passed": false,
  "file": "tests/core/test_rby_color.cpp",
  "line": 47,
  "assertion": "REQUIRE(result.g_affinity == Approx(0.0f))",
  "actual": "g_affinity = 0.12"
}
```

This is ~50 tokens. The raw Catch2 output for the same failure is ~200 tokens.

The model reads this, understands exactly what failed, looks up `mix()` via
`get_function`, makes a targeted fix via `replace_function`, runs the test again.
The entire debug-fix cycle consumes ~600 tokens.

---

## Part 2 — Context Assembly: The Orchestration Layer

The tools above are building blocks. The system that decides **which** tools to
call, in what order, and how to assemble the results into a context the model can
use — that is the **orchestrator**. It is the most important piece.

### 2.1 The Context Budget Allocation

For a 4,000 token model, allocate the budget explicitly:

```
┌─────────────────────────────────────────┐
│  SYSTEM PROMPT + TASK DESCRIPTION  ~400 │
│  RELEVANT SYMBOL SIGNATURES        ~600 │
│  RELEVANT TYPE DEFINITIONS         ~400 │
│  ERROR MESSAGES / TEST FAILURES    ~300 │
│  EXAMPLES (if needed)              ~300 │
│  ─────────────────────────────────────  │
│  TOTAL INPUT                      2000  │
│  RESERVED FOR OUTPUT              2000  │
└─────────────────────────────────────────┘
```

The orchestrator **never exceeds 2,000 input tokens**. If retrieval returns more,
it ranks and truncates. The model always has 2,000 tokens to write code into.

### 2.2 Hierarchical Summarization for Long-Running Projects

When a project spans many sessions, use a **three-tier memory hierarchy**:

```
TIER 1 — Hot context (in model's window, ~500 tokens)
         Current task, immediately needed symbols, current errors

TIER 2 — Warm store (retrieved per-task, ~1500 tokens budget)
         Relevant symbol signatures, recent task history

TIER 3 — Cold index (semantic search + symbol graph, never in context directly)
         Full codebase, all history, all documentation
```

The orchestrator manages promotion and demotion between tiers:

- **Promote:** When a symbol is used in 3+ consecutive tasks, cache its
  signature in Tier 1 permanently for this session
- **Demote:** When a task completes, summarize its output to 2 sentences and
  move to Tier 2; the full detail goes to Tier 3's database
- **Evict:** When Tier 1 approaches 500 tokens, evict the least-recently-used
  symbol signature

This mirrors how the operating system manages processor cache levels — and for the
same reason: the cost of a cache miss (a tool lookup) is much less than the cost
of thrashing (filling the context with everything and hoping the model finds what
it needs).

### 2.3 The Pre-Query Step

Before calling the model for any task, the orchestrator runs a **pre-query** —
a lightweight pass to determine what context to load.

```python
def assemble_context(task: Task, tools: ToolRegistry) -> str:
    budget = 2000  # tokens

    # Start with the task itself
    ctx = f"TASK: {task.title}\n{task.description}\n\n"
    budget -= count_tokens(ctx)

    # Extract mentioned symbols from task description
    symbols = extract_symbol_mentions(task.description)

    # Get signatures for all mentioned symbols
    for sym in symbols:
        sig = tools.get_signature(sym)
        if sig and count_tokens(sig) < budget * 0.3:
            ctx += f"// {sym} signature:\n{sig}\n"
            budget -= count_tokens(sig)

    # Get any current errors relevant to task
    errors = tools.get_errors_for_symbol(task.target_symbol)
    for err in errors[:3]:
        line = f"ERROR: {err['file']}:{err['line']}: {err['message']}\n"
        if count_tokens(line) < budget:
            ctx += line
            budget -= count_tokens(line)

    # Fill remaining budget with semantically relevant code
    if budget > 200:
        results = tools.semantic_find(task.description, top_k=3)
        for sym, score in results:
            snippet = tools.get_function(sym.file, sym.name)
            if snippet and count_tokens(snippet) < budget * 0.4:
                ctx += f"\n// Related code ({sym.name}, relevance={score:.2f}):\n"
                ctx += snippet
                budget -= count_tokens(snippet)

    return ctx
```

The model never sees this orchestration. It receives a clean, token-optimized
context and produces its response into exactly the space that was reserved for it.

---

## Part 3 — Tree-Sitter: The Universal Parser

Tree-sitter is a parsing library that supports 100+ languages, produces concrete
syntax trees in milliseconds, handles malformed code gracefully, and runs with no
external dependencies. It is the foundation of all modern IDE tooling and should
be the foundation of your code agent's tools.

### 3.1 Installation (any language)

```bash
pip install tree-sitter tree-sitter-languages
```

```python
from tree_sitter import Language, Parser
from tree_sitter_languages import get_language, get_parser

parser = get_parser('cpp')  # or 'python', 'rust', 'go', etc.
```

### 3.2 Extracting a Function Body

```python
def extract_function(source: str, func_name: str) -> str | None:
    tree  = parser.parse(source.encode())
    query = get_language('cpp').query("""
        (function_definition
          declarator: (function_declarator
            declarator: (identifier) @name))
        @func
    """)
    matches = query.matches(tree.root_node)
    for _, capture in matches:
        name_node = capture.get('name')
        func_node = capture.get('func')
        if name_node and func_node:
            if source[name_node.start_byte:name_node.end_byte] == func_name:
                return source[func_node.start_byte:func_node.end_byte]
    return None
```

### 3.3 Extracting All Public Methods From a C++ Class

```python
def get_public_api(source: str, class_name: str) -> list[str]:
    tree = parser.parse(source.encode())
    # Walk to find the class, then extract public method declarations
    results = []
    for node in tree.root_node.children:
        if node.type == 'class_specifier':
            name = node.child_by_field_name('name')
            if name and source[name.start_byte:name.end_byte] == class_name:
                # Parse access specifiers and collect public declarations
                in_public = False
                for child in node.children:
                    if child.type == 'access_specifier':
                        in_public = source[child.start_byte:child.end_byte].startswith('public')
                    elif in_public and child.type in ('function_definition', 'declaration'):
                        results.append(source[child.start_byte:child.end_byte].strip())
    return results
```

Each method declaration is typically 1–3 lines. A full class with 20 public methods
returns ~30 lines instead of the full implementation which might be 300 lines.

---

## Part 4 — Concrete Architecture: The Full System

Here is the complete architecture for a small-model code agent. This can be built
as a standalone Python application and connected to any LLM via its API.

```
┌───────────────────────────────────────────────────────────────┐
│                      USER / HIGH-LEVEL MODEL                  │
│                  (creates the task tree, reviews)             │
└─────────────────────────────┬─────────────────────────────────┘
                              │ task_create() calls
┌─────────────────────────────▼─────────────────────────────────┐
│                        ORCHESTRATOR                           │
│  - manages task queue (SQLite)                                │
│  - assembles context for each task                            │
│  - calls small model via API                                  │
│  - posts model output back through editing tools              │
│  - runs verification (build + test) after each task           │
│  - retries with error context on failure                      │
└──────┬────────────┬────────────┬────────────┬─────────────────┘
       │            │            │            │
┌──────▼──┐  ┌──────▼──┐  ┌──────▼──┐  ┌──────▼──────────────┐
│ SYMBOL  │  │SEMANTIC │  │ EDIT    │  │   BUILD / TEST       │
│  GRAPH  │  │  INDEX  │  │ ENGINE  │  │   RUNNER             │
│(SQLite) │  │(vectors)│  │(ts/ast) │  │ (cmake/pytest/cargo) │
└──────┬──┘  └──────┬──┘  └──────┬──┘  └──────┬──────────────┘
       │            │            │             │
       └────────────┴────────────┴─────────────┘
                              │
                     ACTUAL CODEBASE FILES
                     (your disk, unchanged format)
```

### 4.1 The Small Model Only Does One Thing Per Call

The orchestrator calls the small model with a prompt like:

```
TASK: Implement the function `get_weights_flat` in ancestral_network.hpp

CONTEXT:
// WeightMatrix type:
using WeightMatrix = std::array<std::array<float, 4>, 4>;

// NetWire::weights type (what you are writing into):
double weights[16];  // wire format, row-major

// Existing similar method for reference:
void set_weights(const WeightMatrix& W) noexcept { W_ = W; }

ERROR: state_serializer.cpp:87: error C3861: 'get_weights_flat': identifier not found

INSTRUCTION: Write only the body of get_weights_flat(double out[16]).
Do not rewrite the file. Output only the function body, nothing else.
```

The model responds:

```cpp
void get_weights_flat(double out[16]) const noexcept {
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
            out[r * 4 + c] = static_cast<double>(W_[r][c]);
}
```

The orchestrator takes this output and calls:
```python
tools.add_method_to_class('ancestral_network.hpp', 'AncestralNetwork',
                           model_output)
```

The model never writes to a file directly. The tool validates and writes.

### 4.2 Retry Loop With Narrowing Context

If verification fails after an edit:

```python
MAX_RETRIES = 3
for attempt in range(MAX_RETRIES):
    output    = call_model(context)
    tools.apply_edit(task.target_file, task.target_symbol, output)
    errors    = tools.build_and_get_errors(task.target_file)
    if not errors:
        task.complete()
        break
    # Narrow context to the specific error + the problematic symbol
    context   = assemble_retry_context(task, errors, output, attempt)
    # Each retry, the context gets more specific and less general
```

On retry, `assemble_retry_context` replaces general "relevant code" context
with the specific error and the model's previous (failed) attempt. The model
sees what it wrote and why it was wrong, in ~300 tokens.

---

## Part 5 — Context Compression Techniques

These are the specific algorithms for squeezing the most information into the
fewest tokens.

### 5.1 Dead Code Elimination for Context

Before inserting any code into context, strip:
- All comments (except the first docstring line)
- All blank lines
- All private helper methods (if only the API is needed)
- All `#include` directives (already known from the symbol graph)

A typical C++ function loses 20–40% of its token count from comment stripping
alone. Dead code elimination of private helpers can remove 50–70% of a class.

```python
def compress_for_context(code: str) -> str:
    # Remove block comments
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    # Remove line comments (keep first line for docstring effect)
    lines = code.split('\n')
    compressed = []
    for line in lines:
        stripped = re.sub(r'//.*$', '', line).rstrip()
        if stripped:
            compressed.append(stripped)
    return '\n'.join(compressed)
```

### 5.2 Type Aliasing Expansion for Small Models

Small models may not recognize custom type aliases. Replace them before injecting:

```
sim::SimConfig cfg   →   struct { float world_w; float world_h; ... } cfg
```

This costs no tokens if the alias is already known; it saves the model a lookup
and prevents errors where the model generates code for the wrong underlying type.

### 5.3 Breadcrumb Headers Instead of Full Signatures

Instead of injecting a full function signature with all parameters, inject a
breadcrumb — just enough to locate and understand the symbol:

```
// std::span<ColorEntity> Environment::entities()    [environment.hpp:24]
// void SimEngine::init()                             [sim_engine.hpp:56]
// bool HeadlessRunner::resume_from(uint64_t tick=0) [headless_runner.hpp:51]
```

This is 3 lines, ~30 tokens. The full headers would be 30+ lines.

### 5.4 Delta Encoding for Conversations

In a multi-turn conversation with a model, only send **what changed** since the
last turn, not the full context again.

```python
class DeltaContext:
    def __init__(self):
        self.previous_hashes = {}  # symbol_name → hash(content)

    def diff(self, new_context: dict) -> str:
        delta = []
        for sym, content in new_context.items():
            h = hash(content)
            if self.previous_hashes.get(sym) != h:
                delta.append(f"[UPDATED] {sym}:\n{content}")
                self.previous_hashes[sym] = h
            else:
                delta.append(f"[UNCHANGED] {sym}")  # 3 tokens instead of full content
        return '\n'.join(delta)
```

Symbols that haven't changed cost 3 tokens (`[UNCHANGED] name`) instead of their
full content. Over a long session this reduces total tokens consumed by 40–60%.

### 5.5 Lossless Integer Compression for Build Logs

Build logs contain line numbers, column numbers, error codes. Represent them
in minimal form:

```
# Raw MSVC output (12 tokens):
c:\Users\lokee\...\sim_engine.cpp(87,1): error C2065: 'anets' : undeclared identifier

# Compressed (6 tokens):
sim_engine.cpp:87 C2065 'anets' undeclared
```

For 20 errors this saves ~120 tokens — enough for a whole extra function signature.

---

## Part 6 — IDE Integration Points

Modern IDEs expose exactly the data a code agent needs through standard protocols.
You do not need to build parsers from scratch — hook into what already exists.

### 6.1 Language Server Protocol (LSP)

Every major language has an LSP server that is already running in VS Code:
- C++: clangd
- Python: pyright or pylance
- Rust: rust-analyzer
- Go: gopls

These servers compute symbol graphs, type information, and diagnostics
continuously. Query them via the LSP JSON-RPC protocol:

```python
import json, socket

class LSPClient:
    def get_hover(self, file, line, col):
        """Get type/signature info at a cursor position"""
        return self._request('textDocument/hover', {
            'textDocument': {'uri': f'file://{file}'},
            'position': {'line': line - 1, 'character': col}
        })

    def get_references(self, file, line, col):
        """Find all usages of the symbol at this position"""
        return self._request('textDocument/references', {
            'textDocument': {'uri': f'file://{file}'},
            'position': {'line': line - 1, 'character': col},
            'context': {'includeDeclaration': False}
        })

    def get_diagnostics(self, file):
        """Get current errors and warnings (compiler-equivalent)"""
        # Diagnostics are pushed from server to client via publishDiagnostics
        return self.diagnostic_cache.get(file, [])
```

The LSP server has already done all the heavy parsing. You are just reading its
output. This is zero-cost incremental analysis — the server updates as files
change, and your agent always has fresh diagnostics without re-running the compiler.

### 6.2 VS Code Extension API

If building an agent directly inside VS Code (like Copilot does), use:

```typescript
// Get all workspace symbols
const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider', 'MyClassName'
);

// Get diagnostics for a file
const diagnostics = vscode.languages.getDiagnostics(fileUri);

// Get completions at a point (to understand what methods exist)
const completions = await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider', fileUri, position
);
```

These APIs give your agent access to IntelliSense data — the same data that
powers auto-complete and error highlighting — without any of the parsing
infrastructure costs.

### 6.3 Git Integration for Context

The git history is a rich source of information that most agents ignore. Useful
tools from git:

```
git_blame(file, line_range)         → who wrote this, when, in what commit
git_log_for_symbol(symbol)          → history of changes to this function
git_diff_since(commit)              → what changed recently (for warm restart)
git_show(commit, file)              → previous version of a file
git_grep(pattern)                  → fast search across all historically committed files
```

When a model is fixing a bug, `git_log_for_symbol` tells it what was recently
changed — the bug is almost certainly in the most recent modification.

```python
def git_log_for_symbol(symbol_name, repo_path):
    result = subprocess.run(
        ['git', 'log', '-S', symbol_name, '--oneline', '-10'],
        capture_output=True, text=True, cwd=repo_path
    )
    return result.stdout  # 10 commit hashes + short messages, ~15 tokens
```

---

## Part 7 — Making Any Model as Capable as a Senior Engineer

With the tools above in place, the ability gap between a 4,000-token model and a
200,000-token model collapses almost entirely. Here is the remaining gap and how
to close it.

### 7.1 What a Senior Engineer Does That a Naive Agent Does Not

| Senior engineer action | Naive agent failure | Tool-equipped agent solution |
|------------------------|--------------------|-----------------------------|
| Reads only relevant code | Reads everything, runs out of tokens | `get_signature` + `semantic_find` |
| Knows dependency order | Writes files in wrong order, breaks includes | Symbol graph topological sort |
| Makes surgical edits | Rewrites whole files, introduces new bugs | `replace_function` |
| Compiler-guided debugging | Guesses at errors | `build_and_get_errors` in tight loop |
| Tests before committing | Never runs tests | `run_tests_for_file` after every edit |
| Remembers what was already done | Forgets, redoes work | External task queue |
| Reads docs when unsure | Halluccinates API details | `fetch_docs(library, symbol)` |
| Asks clarifying questions | Assumes, guesses wrong | Explicit ambiguity detection + pause |

### 7.2 Ambiguity Detection Before Writing

Add a pre-step that checks for underspecification before the model writes any code:

```python
def check_ambiguities(task: Task, symbol_graph: SymbolGraph) -> list[str]:
    questions = []
    # If task mentions a symbol we cannot find in the graph, flag it
    for sym in task.mentioned_symbols:
        if not symbol_graph.find(sym):
            questions.append(f"Symbol '{sym}' not found in codebase. Is this new?")
    # If task says "add a method" but does not name the class
    if 'add' in task.description and 'class' not in task.description:
        questions.append("Which class should the new method be added to?")
    return questions
```

If `check_ambiguities` returns anything, the orchestrator pauses and asks the
human before calling the model. This avoids entire directories of code generated
for the wrong class.

### 7.3 The `fetch_docs` Tool

For open-source libraries, documentation is indexed online. A `fetch_docs` tool
that retrieves the authoritative API docs for a specific library function, in
compressed form, eliminates hallucination of API details entirely:

```
fetch_docs("GLFW", "glfwCreateWindow")  →  signature + parameter descriptions + return
fetch_docs("Catch2", "REQUIRE")         →  macro usage + failure message format
fetch_docs("SQLiteCpp", "Statement")    →  constructor, exec, bind methods
```

Each fetch returns 100–200 tokens of authoritative truth. This is cheaper and
more reliable than the model's training-time memory of library APIs.

---

## Part 8 — A Minimal Working Implementation

If you want to build this from scratch, here is the minimum viable set:

### Step 1: Build the index (run once per project)

```bash
pip install tree-sitter tree-sitter-languages sentence-transformers sqlite-utils
python index_codebase.py --root ./your_project --output ./agent_index.db
```

`index_codebase.py` should:
1. Walk all source files
2. Extract all functions/classes/structs with tree-sitter
3. Store in SQLite: name, file, line, signature, body_hash
4. Embed each symbol with a small model
5. Store vectors in a parallel numpy file

Typical time: 30 seconds for a 50,000-line codebase.

### Step 2: The agent loop

```python
from ollama import Client  # or openai.Client, or anthropic.Client

client = Client()  # local model via Ollama, e.g. qwen2.5-coder:7b

def run_task(task, tools, index):
    context  = assemble_context(task, tools, index)
    response = client.chat(model='qwen2.5-coder:7b', messages=[
        {'role': 'system', 'content': 'You are a precise code generator. Output only code, no explanations.'},
        {'role': 'user',   'content': context}
    ])
    code = response.message.content
    tools.apply_edit(task)
    errors = tools.build_and_get_errors(task.target)
    return errors
```

### Step 3: Verify and iterate

```python
for task in task_queue:
    errors = run_task(task, tools, index)
    retries = 0
    while errors and retries < 3:
        error_context = format_errors(errors)
        errors = run_task(task_with_errors(task, error_context), tools, index)
        retries += 1
    if not errors:
        commit(task)
    else:
        escalate_to_human(task, errors)
```

### Recommended small local models (as of 2025)

| Model | Params | Context | Best for |
|-------|--------|---------|----------|
| Qwen2.5-Coder 7B | 7B | 32K | General code generation |
| Qwen2.5-Coder 1.5B | 1.5B | 32K | Function-level tasks |
| DeepSeek-Coder-V2-Lite | 2.4B active (16B MoE) | 128K | Multi-file reasoning |
| StarCoder2 3B | 3B | 16K | Fill-in-middle code completion |
| CodeGemma 2B | 2B | 8K | Smallest that reliably follows instructions |

All run on CPU with 8–16 GB RAM. With these models and the tool suite in this
document, the practical gap from GPT-4 class performance on real software tasks
is achievable on commodity hardware.

---

## Summary: The Hierarchy of Importance

If you can only build some of these tools, build them in this order:

1. **Symbol-level read** (`get_function`, `get_class_api`) — biggest single win
2. **Surgical edit** (`replace_function`) — prevents file-rewrite errors
3. **Compressed build feedback** (`build_and_get_errors`) — enables fix loops
4. **Semantic search** (`semantic_find`) — eliminates "where is X" token waste
5. **External task queue** — enables multi-session, multi-file projects
6. **Symbol graph** (`find_callers`, `find_definitions`) — enables whole-project reasoning
7. **LSP integration** — gives real-time diagnostics without compiling
8. **Ambiguity detection** — prevents hallucination before it starts
9. **Delta context encoding** — 40–60% token savings on long sessions
10. **Documentation fetcher** — eliminates library API hallucination

The gap between a carefully-tooled 4,000-token local model and a frontier 200,000-
token API model is not a model gap. It is a tooling gap. Build the tools.

---

*Based on research from:*
*SWE-agent (Yang et al., 2024), SWE-bench (Jimenez et al., 2024),*
*ReAct (Yao et al., 2022), LLM-Modulo Frameworks (Kambhampati et al., 2024)*
