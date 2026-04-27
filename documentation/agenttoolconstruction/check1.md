# LLM Code Agent — Full Implementation Checklist
> Derived from: *How an LLM Agent Built This Project* + *Tool Design for Small-Context LLM Code Agents*  
> Audience: Computer scientist implementing from scratch  
> Notation: `[ ]` = not started · `[x]` = complete · `[-]` = in progress

---

## PHASE 0 — Pre-Implementation Decisions

### 0.1 Model Selection
- [ ] Decide target model tier (local small / mid / frontier API)
- [ ] If local: benchmark candidate models on representative code task
  - [ ] Qwen2.5-Coder 7B — general code gen, 32K ctx
  - [ ] Qwen2.5-Coder 1.5B — function-level tasks, 32K ctx
  - [ ] DeepSeek-Coder-V2-Lite — multi-file reasoning, 128K ctx (MoE, 2.4B active / 16B total)
  - [ ] StarCoder2 3B — fill-in-middle completion, 16K ctx
  - [ ] CodeGemma 2B — smallest reliable instruction-follower, 8K ctx
- [ ] If API: confirm max context window for chosen model
- [ ] Confirm that chosen model supports tool-use / structured JSON output (or plan to handle structured text parsing)
- [ ] Measure real token throughput (tok/s) on target hardware
- [ ] Set hard budget: `INPUT_TOKEN_LIMIT` and `OUTPUT_TOKEN_LIMIT` as constants

### 0.2 Language Targeting
- [ ] List all source languages the agent must support (C++, Python, Rust, Go, etc.)
- [ ] Confirm tree-sitter grammar is available for each (`pip show tree-sitter-languages`)
- [ ] Confirm LSP server is available for each (clangd, pyright, rust-analyzer, gopls)
- [ ] Confirm compiler / build system invokable from Python subprocess (cmake, cargo, go build, etc.)

### 0.3 Architecture Decision Points
- [ ] Decide: single-file SQLite vs. external DB for symbol graph
- [ ] Decide: in-process numpy vectors vs. `sqlite-vss` vs. external vector store (Chroma, Qdrant) for embeddings
- [ ] Decide: monolithic Python orchestrator vs. separate microservices
- [ ] Decide: sync vs. async tool execution (async needed if LSP + build run in parallel)
- [ ] Decide: IDE extension (VS Code TypeScript API) vs. standalone CLI agent
- [ ] Decide: file watcher strategy for incremental index updates (inotify / watchdog on Linux, ReadDirectoryChangesW on Windows)

---

## PHASE 1 — Indexing Infrastructure

### 1.1 Install Dependencies
- [ ] `pip install tree-sitter tree-sitter-languages`
- [ ] `pip install sentence-transformers`
- [ ] `pip install sqlite-utils`
- [ ] `pip install watchdog` (cross-platform file watcher)
- [ ] `pip install numpy`
- [ ] Optional: `pip install sqlite-vss` if using in-DB vector search
- [ ] Optional: `pip install clang` (libclang Python bindings for C++ AST access)
- [ ] Optional: `pip install pygit2` or confirm `git` CLI available for git tools

### 1.2 SQLite Schema — Symbol Graph

- [ ] Create table `symbols (id INTEGER PK, name TEXT, file TEXT, line INTEGER, end_line INTEGER, kind TEXT, signature TEXT, body_hash TEXT)`
- [ ] Create table `calls (caller_id INTEGER FK → symbols.id, callee_id INTEGER FK → symbols.id)`
- [ ] Create table `includes (includer TEXT, included TEXT)`
- [ ] Create table `tasks (id INTEGER PK, title TEXT, description TEXT, target_symbol TEXT, target_file TEXT, status TEXT, notes TEXT, created_at REAL, completed_at REAL)`
- [ ] Create table `task_deps (task_id INTEGER FK, depends_on INTEGER FK)`
- [ ] Create table `embeddings (symbol_id INTEGER FK → symbols.id, vector BLOB)` — OR use flat numpy file
- [ ] Create index `idx_symbols_name ON symbols(name)`
- [ ] Create index `idx_symbols_file ON symbols(file)`
- [ ] Create index `idx_calls_caller ON calls(caller_id)`
- [ ] Create index `idx_calls_callee ON calls(callee_id)`
- [ ] Create index `idx_tasks_status ON tasks(status)`
- [ ] Enable WAL mode on the database (`PRAGMA journal_mode=WAL`)
- [ ] Enable foreign key enforcement (`PRAGMA foreign_keys=ON`)

### 1.3 Tree-Sitter Parser Initialization

- [ ] Instantiate `Parser` for each target language
- [ ] Write helper `parse_file(filepath) → Tree` that reads bytes and parses
- [ ] Implement graceful fallback when file has syntax errors (tree-sitter continues parsing even with errors; mark affected symbols with `parse_error=True`)
- [ ] Write `language_for_file(filepath) → Language | None` using extension mapping
  - [ ] `.cpp`, `.cc`, `.cxx`, `.hpp`, `.h` → `cpp`
  - [ ] `.py` → `python`
  - [ ] `.rs` → `rust`
  - [ ] `.go` → `go`
  - [ ] `.ts`, `.tsx` → `typescript`
  - [ ] `.js`, `.jsx` → `javascript`
  - [ ] Return `None` for unrecognized extensions (skip without error)

### 1.4 Symbol Extraction — C++ (adapt per language)

- [ ] Write tree-sitter query for `function_definition` nodes — capture name + full extent
- [ ] Write tree-sitter query for `class_specifier` nodes — capture name
- [ ] Write tree-sitter query for `struct_specifier` nodes — capture name
- [ ] Within class nodes: extract `access_specifier` children to distinguish `public` / `protected` / `private` sections
- [ ] Extract all `public` method declarations within each class
- [ ] Extract `using` type aliases and store under kind = `alias`
- [ ] Extract `#include` directives and populate `includes` table
- [ ] For each function: extract parameter types and return type from the declarator node
- [ ] Reconstruct normalized signature string: `RetType ClassName::FuncName(ParamType param, ...)` 
- [ ] Compute `body_hash = sha256(body_bytes)` for change detection
- [ ] Store all symbols in `symbols` table

### 1.5 Symbol Extraction — Python
- [ ] Query for `function_definition` (name + body)
- [ ] Query for `class_definition` (name + methods)
- [ ] Extract `import` and `from X import Y` into `includes` table
- [ ] Extract type annotations from function parameters and return (`-> Type`)
- [ ] Extract decorators as metadata on each function

### 1.6 Call Graph Construction

- [ ] After all symbols extracted: second tree-sitter pass over every function body
- [ ] For each `call_expression` node in body: extract callee name
- [ ] Look up callee name in `symbols` table to resolve to `callee_id`
- [ ] Insert `(caller_id, callee_id)` into `calls` table
- [ ] Handle unresolvable callees gracefully (external lib calls — skip, do not error)
- [ ] Handle method calls (`obj.method()`) — extract method name only, attempt resolution

### 1.7 Embedding Index Construction

- [ ] Select embedding model and load it (recommended: `nomic-ai/nomic-embed-code`, 137M params)
- [ ] For each symbol: construct embedding input as `signature + "\n" + first_docstring_line`
- [ ] Batch all inputs and call `model.encode(batch, batch_size=64)`
- [ ] Store resulting float32 vectors, shape `(N, D)`, in numpy `.npy` file or in `embeddings` table as BLOB
- [ ] Store index mapping `vector_row_index → symbol_id`
- [ ] Verify: `index.shape[0] == len(symbols_in_db)`
- [ ] Implement incremental update: on file change, re-embed only symbols in changed file

### 1.8 Incremental Index Update (File Watcher)

- [ ] Set up `watchdog` observer on project root
- [ ] On file creation: parse file, extract symbols, embed, insert all
- [ ] On file modification: load all `symbol_ids` for this file, delete from `symbols`, `calls`, `embeddings`; re-run extraction; re-insert
- [ ] On file deletion: delete all symbols for that file, update `includes` table
- [ ] Debounce watcher events: wait 500ms after last event before triggering re-index (avoids thrashing on rapid saves)
- [ ] Log every index update event with timestamp and symbol count delta

---

## PHASE 2 — Tool Implementation (Class 1: Symbol-Level Read)

### 2.1 `get_function(file, function_name) → str | None`
- [ ] Query `symbols` table for `(file, name, kind='function')` → get `line`, `end_line`
- [ ] Read exactly those lines from the file (do not read entire file)
- [ ] Return raw source of function body only
- [ ] Return `None` if symbol not found; do not raise

### 2.2 `get_class_api(file, class_name) → list[str]`
- [ ] Query `symbols` table for all entries where `file = file AND kind IN ('method','field') AND name LIKE 'ClassName::%'`
- [ ] Filter to public-only entries (store `visibility` column during extraction)
- [ ] Return list of signature strings — NOT method bodies
- [ ] Each string: one line per method, format `RetType method_name(params)`

### 2.3 `get_struct(file, struct_name) → list[str]`
- [ ] Query `symbols` for struct fields under this struct name
- [ ] Return `FieldType field_name;` per field — no implementations

### 2.4 `get_signature(file_or_None, symbol_name) → str | None`
- [ ] If `file` is provided: look up `(file, name)` in `symbols`
- [ ] If `file` is `None`: search by name alone; if multiple matches, return all with file paths
- [ ] Return the pre-stored `signature` string — single line

### 2.5 `get_type_alias(alias_name) → str | None`
- [ ] Query `symbols` where `kind = 'alias' AND name = alias_name`
- [ ] Return the right-hand side of the alias (e.g., `std::array<std::array<float,4>,4>`)

### 2.6 `read_lines(file, start_line, end_line) → str`
- [ ] Open file, read only `[start_line, end_line]` inclusive (1-indexed)
- [ ] Return as plain string with line numbers prepended: `"42| void foo() {"`
- [ ] Hard cap: if `end_line - start_line > 100`, raise `LineLimitExceeded`

---

## PHASE 3 — Tool Implementation (Class 2: Symbol Graph Navigation)

### 3.1 `find_definitions(symbol_name) → list[dict]`
- [ ] Query `symbols` where `name = symbol_name`
- [ ] Return list of `{file, line, kind, signature}` — one per definition (may be multiple in templates)

### 3.2 `find_callers(symbol_name) → list[dict]`
- [ ] Resolve `symbol_name` to `symbol_id` in `symbols`
- [ ] JOIN `calls` on `callee_id = symbol_id`
- [ ] JOIN back to `symbols` on `caller_id`
- [ ] Return list of `{caller_name, caller_file, caller_line}`

### 3.3 `find_callees(symbol_name) → list[dict]`
- [ ] Resolve `symbol_name` to `symbol_id`
- [ ] JOIN `calls` on `caller_id = symbol_id`
- [ ] JOIN back to `symbols` on `callee_id`
- [ ] Return list of `{callee_name, callee_file, callee_line}`

### 3.4 `find_usages(symbol_name) → list[dict]`
- [ ] Run both `find_callers` and `find_definitions` (for usages in struct field initializers, template args, etc.)
- [ ] Also run grep-equivalent over index for literal string match as fallback
- [ ] Deduplicate and return unified list of `{file, line, context_snippet}`

### 3.5 `get_includes(file) → list[str]`
- [ ] Query `includes` table where `includer = file`
- [ ] Return list of included file paths

### 3.6 `get_includers(file) → list[str]`
- [ ] Query `includes` table where `included = file`
- [ ] Return list of files that include the given file

### 3.7 `topological_sort(file_list) → list[str]`
- [ ] Build dependency graph from `includes` table restricted to `file_list`
- [ ] Run Kahn's algorithm (BFS topo sort)
- [ ] Detect cycles — raise `CircularDependencyError` with cycle path
- [ ] Return sorted file list (dependencies before dependents)

### 3.8 `get_dependency_depth(symbol_name) → int`
- [ ] BFS from `symbol_name` through `calls` graph
- [ ] Return maximum depth of the call tree rooted at this symbol

---

## PHASE 4 — Tool Implementation (Class 3: Semantic Search)

### 4.1 `semantic_find(query, top_k=5) → list[tuple[Symbol, float]]`
- [ ] Embed `query` using same model used during indexing
- [ ] Load embedding matrix (numpy) into memory (cache; do not reload per query)
- [ ] Compute cosine similarity: `scores = index @ qvec / (norms * |qvec|)`
- [ ] `np.argsort(scores)[::-1][:top_k]` — get top K indices
- [ ] Map indices → `symbol_ids` → query `symbols` table for full symbol objects
- [ ] Return list of `(Symbol, float_score)` sorted descending by score
- [ ] Cap query embedding latency: if > 200ms, log warning (model is too large for interactive use)

### 4.2 `semantic_find_file(query, top_k=3) → list[str]`
- [ ] Same as `semantic_find` but aggregate scores per file (max score of any symbol in that file)
- [ ] Return top-K file paths — useful for "what file is most relevant to X?"

### 4.3 `grep_search(pattern, file_glob="**/*", is_regex=True) → list[dict]`
- [ ] Walk workspace files matching `file_glob`
- [ ] Apply regex pattern per line
- [ ] Return list of `{file, line, col, match_text, context_line}`
- [ ] Hard cap at 500 results — raise `TooManyMatches` if exceeded, prompting query refinement
- [ ] Time box at 5 seconds — cancel and return partial results with warning

### 4.4 `find_symbol_by_pattern(name_regex) → list[dict]`
- [ ] Query `symbols` table with `name REGEXP name_regex` (enable regexp extension for SQLite)
- [ ] Return list of `{name, file, line, kind, signature}`
- [ ] Useful when model knows partial name or naming convention but not exact name

---

## PHASE 5 — Tool Implementation (Class 4: Surgical Editing)

### 5.1 `replace_function(file, function_name, new_body) → str`
- [ ] Look up `(file, function_name)` in `symbols` table → get `line`, `end_line`
- [ ] Read file bytes
- [ ] Compute byte offset for `line` and `end_line` (read line-by-line to accumulate offsets)
- [ ] Splice: `new_content = original[:start_byte] + new_body + original[end_byte:]`
- [ ] Parse `new_content` with tree-sitter; verify no `ERROR` node at replaced location
- [ ] If parse fails: do NOT write — raise `SyntaxError` with tree-sitter error node detail
- [ ] If parse ok: write `new_content` to file
- [ ] Trigger incremental re-index for this file
- [ ] Return unified diff string (use `difflib.unified_diff`)

### 5.2 `insert_after_symbol(file, symbol_name, new_code) → str`
- [ ] Look up `symbol_name` in `symbols` → get `end_line`
- [ ] Read file lines
- [ ] Insert `new_code` after line `end_line`
- [ ] Parse result; verify no ERROR nodes introduced
- [ ] Write and trigger re-index
- [ ] Return diff

### 5.3 `delete_function(file, function_name) → str`
- [ ] Look up symbol → `line`, `end_line`
- [ ] Check `find_callers(function_name)` — if callers exist, raise `DeletionBlockedError` listing callers
- [ ] If no callers: splice out the byte range
- [ ] Parse result; verify ok
- [ ] Write, re-index, return diff

### 5.4 `add_method_to_class(file, class_name, method_code, visibility='public') → str`
- [ ] Find class node via tree-sitter: locate `class_specifier` with matching name
- [ ] Locate the closing `}` of the class body
- [ ] Find last method declaration in the target visibility section (or insert access specifier if section absent)
- [ ] Splice `method_code` in at the correct indentation level
- [ ] Parse; verify; write; re-index; return diff

### 5.5 `rename_symbol(file, old_name, new_name, scope='project') → list[str]`
- [ ] If `scope='file'`: find all occurrences in file only
- [ ] If `scope='project'`: run `find_usages(old_name)` to get all files
- [ ] For each file: use `replace_string_in_file` on each occurrence (whole-word match only — regex `\bold_name\b`)
- [ ] Re-index all modified files
- [ ] Return list of all modified `{file, line, old, new}`

### 5.6 `replace_string_in_file(file, old_str, new_str) → str`
- [ ] Read file content
- [ ] Verify `old_str` appears **exactly once** — raise `AmbiguousMatch` if 0 or 2+ occurrences
- [ ] Replace and write
- [ ] Return diff
- [ ] This is the lowest-level edit primitive; all higher tools compose from this

### 5.7 `create_file(path, content) → None`
- [ ] Verify `path` does not already exist — raise `FileExistsError` if it does
- [ ] Create all intermediate directories
- [ ] Write content
- [ ] Parse with tree-sitter; log any parse errors (do not block creation)
- [ ] Trigger full index of new file

### 5.8 `move_symbol(symbol_name, from_file, to_file) → list[str]`
- [ ] `get_function(from_file, symbol_name)` → capture body
- [ ] `delete_function(from_file, symbol_name)` (skipping caller check since we're moving, not deleting)
- [ ] `insert_after_symbol(to_file, last_symbol_in_file, body)` or append at end
- [ ] Update `#include` in all callers: replace `from_file`'s header with `to_file`'s header
- [ ] Re-index both files
- [ ] Return combined diff

---

## PHASE 6 — Tool Implementation (Class 5: Compiler Feedback)

### 6.1 `build_and_get_errors(target, build_dir) → list[dict]`
- [ ] Run `subprocess.run(['cmake', '--build', build_dir, '--target', target], capture_output=True, text=True, timeout=120)`
- [ ] Parse stderr line by line
- [ ] Implement parsers for each compiler format:
  - [ ] MSVC: `filepath(line,col): error|warning CXXXX: message`
  - [ ] GCC/Clang: `filepath:line:col: error|warning: message`
  - [ ] Linker errors: detect `undefined reference to` / `LNK2019` patterns specifically
- [ ] Strip absolute path prefixes → relative paths
- [ ] Deduplicate: same `(relative_file, error_code)` pair → keep first occurrence only
- [ ] For template instantiation errors: keep only the innermost failure line (detect `in instantiation of` chains)
- [ ] Truncate each message at 120 characters
- [ ] Cap output at 20 unique errors
- [ ] Return list of `{file, line, col, severity, code, message}`

### 6.2 `get_errors(file) → list[dict]`
- [ ] Query LSP diagnostic cache for `file` (see Phase 8 — LSP Integration)
- [ ] Return same structure as above
- [ ] Fallback: if LSP not available, run targeted single-file compile: `clang++ -fsyntax-only file.cpp -I... 2>&1`

### 6.3 `get_errors_for_symbol(symbol_name) → list[dict]`
- [ ] Run `get_errors` on the file containing `symbol_name`
- [ ] Filter results to those where `message` contains `symbol_name` OR `line` is within the symbol's `[line, end_line]` range

### 6.4 `get_first_error() → dict | None`
- [ ] Run full project build (no target filter)
- [ ] Return the single first error encountered — the one most likely to be the root cause
- [ ] Log heuristic: in chained errors, the first file/line to appear is the root

### 6.5 `check_syntax(file) → list[dict]`
- [ ] Run `clang++ -fsyntax-only` (C++) or `python -m py_compile` (Python) on single file in isolation
- [ ] No linking; headers only
- [ ] Return errors in same `{file, line, col, severity, code, message}` format

---

## PHASE 7 — Tool Implementation (Class 6: Task Queue)

### 7.1 `task_create(title, description, deps=[]) → int`
- [ ] Insert into `tasks` table with `status = 'pending'`
- [ ] Insert all `deps` into `task_deps` table
- [ ] Return `task_id`
- [ ] Validate: all dep IDs exist in `tasks` table before inserting

### 7.2 `task_list(status_filter=None) → list[dict]`
- [ ] Query `tasks` table, optionally filtered by `status`
- [ ] JOIN with `task_deps` to include dep counts and how many are complete
- [ ] Return `{id, title, status, deps_complete, deps_total, created_at}`
- [ ] Sort: pending first, then by dep readiness (all deps done = ready)

### 7.3 `task_start(task_id) → dict`
- [ ] Verify all deps have `status = 'complete'` — raise `DepsNotMet` if not
- [ ] Update `status = 'in_progress'`
- [ ] Return full task record including `description`, `target_symbol`, `target_file`

### 7.4 `task_complete(task_id, notes="") → None`
- [ ] Update `status = 'complete'`, set `completed_at = now()`, append `notes`
- [ ] Log total time taken

### 7.5 `task_fail(task_id, reason) → None`
- [ ] Update `status = 'failed'`, append `reason` to notes
- [ ] Do NOT auto-retry here — orchestrator decides retry policy

### 7.6 `task_add_note(task_id, note) → None`
- [ ] Append timestamped note to `tasks.notes` field
- [ ] Notes are retrieved as part of `task_get_context`

### 7.7 `task_get_context(task_id) → str`
- [ ] Read task `description`, `target_symbol`, `target_file`, `notes`
- [ ] Run `assemble_context(task, tools, index)` — the full context assembly pipeline (Phase 9)
- [ ] Return token-budgeted context string ready to prepend to model prompt

### 7.8 `task_get_ready() → list[int]`
- [ ] Return all `task_ids` where `status = 'pending'` AND all deps are `status = 'complete'`
- [ ] Used by orchestrator to select next task to execute

---

## PHASE 8 — LSP Integration

### 8.1 LSP Client Base
- [ ] Implement JSON-RPC 2.0 transport over stdin/stdout subprocess pipe (for clangd, rust-analyzer, etc.)
- [ ] Implement `initialize` handshake with proper `capabilities` declaration
- [ ] Implement `textDocument/didOpen` notification (must send before first query on a file)
- [ ] Implement `textDocument/didChange` notification (send on every file write)
- [ ] Implement `textDocument/didClose` notification
- [ ] Handle `window/logMessage` and `window/showMessage` server notifications (log, do not block)
- [ ] Handle `textDocument/publishDiagnostics` push notification → cache in `diagnostic_cache[file_uri]`
- [ ] Run LSP server as persistent subprocess (do not restart per query)

### 8.2 `lsp_hover(file, line, col) → dict | None`
- [ ] Send `textDocument/hover` request
- [ ] Parse `MarkupContent` response
- [ ] Extract type information and signature from hover content
- [ ] Return `{type_string, documentation, range}`

### 8.3 `lsp_references(file, line, col) → list[dict]`
- [ ] Send `textDocument/references` with `includeDeclaration: false`
- [ ] Parse `Location[]` response
- [ ] Return list of `{file, line, col}`

### 8.4 `lsp_definition(file, line, col) → dict | None`
- [ ] Send `textDocument/definition`
- [ ] Return `{file, line, col}` of definition site

### 8.5 `lsp_get_diagnostics(file) → list[dict]`
- [ ] Read from `diagnostic_cache` (populated by `publishDiagnostics` push)
- [ ] Convert LSP `DiagnosticSeverity` (1=Error, 2=Warning, 3=Info, 4=Hint) to string
- [ ] Return `{line, col, severity, message, code}` list

### 8.6 `lsp_rename(file, line, col, new_name) → dict`
- [ ] Send `textDocument/rename` request
- [ ] Parse `WorkspaceEdit` response
- [ ] Apply all file edits in the `WorkspaceEdit` atomically
- [ ] Return summary of changes

### 8.7 `lsp_code_action(file, line, col) → list[dict]`
- [ ] Send `textDocument/codeAction`
- [ ] Return available quick fixes at position
- [ ] Useful for the agent to discover compiler-suggested fixes

---

## PHASE 9 — Context Assembly (Orchestrator Core)

### 9.1 Token Counter
- [ ] Integrate `tiktoken` (OpenAI) or model-specific tokenizer
- [ ] Implement `count_tokens(text) → int`
- [ ] Cache tokenizer instance — do not reload per call

### 9.2 Budget Constants
- [ ] Define `BUDGET_SYSTEM = 400` tokens
- [ ] Define `BUDGET_SIGNATURES = 600` tokens
- [ ] Define `BUDGET_TYPE_DEFS = 400` tokens
- [ ] Define `BUDGET_ERRORS = 300` tokens
- [ ] Define `BUDGET_EXAMPLES = 300` tokens
- [ ] Define `BUDGET_OUTPUT = 2000` tokens (model's generation space)
- [ ] Assert at startup: `sum of all BUDGET_* <= model max context`

### 9.3 `assemble_context(task, tools, index) → str`
- [ ] Start with `task.description` — deduct from `BUDGET_SIGNATURES`
- [ ] Run `extract_symbol_mentions(task.description)` → list of symbol names in description text
  - [ ] Regex: `\b[A-Z][a-zA-Z0-9_]+\b` for types, `\b[a-z_][a-z0-9_]*\(\)` for functions
- [ ] For each mentioned symbol: call `get_signature` — add to context if fits in budget
- [ ] Run `get_errors_for_symbol(task.target_symbol)` — add top 3 errors to error budget
- [ ] Run `semantic_find(task.description, top_k=3)` — fill remaining budget with relevant code snippets
  - [ ] For each result: call `get_function` and run through `compress_for_context`
  - [ ] Only add if `count_tokens(snippet) < remaining_budget * 0.4`
- [ ] Verify total `count_tokens(assembled) <= BUDGET_SYSTEM + BUDGET_SIGNATURES + BUDGET_TYPE_DEFS + BUDGET_ERRORS + BUDGET_EXAMPLES`
- [ ] Return assembled context string

### 9.4 `assemble_retry_context(task, errors, prev_attempt, attempt_num) → str`
- [ ] Include task description (unchanged)
- [ ] Include the model's previous (failed) output: `prev_attempt`
- [ ] Include all error messages from `errors`
- [ ] Include the specific symbols mentioned in error messages (via `get_signature`)
- [ ] Do NOT include semantic search results (context is now error-focused, not concept-focused)
- [ ] Each retry: reduce `top_k` semantic results further to give more room to error context
- [ ] Log that this is retry attempt N

### 9.5 `compress_for_context(code) → str`
- [ ] Strip all block comments: `re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)`
- [ ] Strip all line comments: `re.sub(r'//.*$', '', line)` per line
- [ ] Remove blank lines
- [ ] Remove `#include` directives (already known from symbol graph)
- [ ] Remove `private:` sections (keep only public and protected for API understanding)
- [ ] Measure compression ratio — assert output is ≤ 60% of input token count for heavily-commented code

### 9.6 Delta Context Encoding (multi-turn)
- [ ] Maintain `DeltaContext` object per conversation session
- [ ] `DeltaContext.previous_hashes: dict[symbol_name, hash]`
- [ ] `DeltaContext.diff(new_context_dict) → str`:
  - [ ] For each symbol in new context: if `hash(content) == previous_hash` → output `[UNCHANGED] symbol_name` (3 tokens)
  - [ ] If changed: output `[UPDATED] symbol_name:\n{content}` and update hash
  - [ ] If new: output `[NEW] symbol_name:\n{content}` and record hash
- [ ] Verify that `[UNCHANGED]` entries cost ≤ 5 tokens each

---

## PHASE 10 — Tool Implementation (Class 7: Test Verification)

### 10.1 `run_test(test_name) → dict`
- [ ] Invoke test runner with filter for specific test: `ctest -R test_name` or `./test_binary "[test_name]"`
- [ ] Parse output for pass/fail
- [ ] On failure: extract `REQUIRE` / `EXPECT` assertion text, actual vs expected values
- [ ] Return `{test_name, passed: bool, failure_file, failure_line, assertion, actual, expected}`

### 10.2 `run_tests_for_file(file) → list[dict]`
- [ ] Determine which test file covers `file` (naming convention: `tests/test_foo.cpp` covers `src/foo.cpp`)
- [ ] Build and run that test file only
- [ ] Return list of `{test_name, passed, failure_detail}`

### 10.3 `run_all_tests() → dict`
- [ ] Run full test suite
- [ ] Count pass/fail
- [ ] For failures: compress failure output (keep assertion + actual/expected only)
- [ ] Return `{passed: int, failed: int, failures: [{test, reason}]}`

### 10.4 `get_tests_for_symbol(symbol_name) → list[str]`
- [ ] `grep_search(symbol_name, "tests/**")` → find test files that reference this symbol
- [ ] Extract test case names from those files (tree-sitter query for `TEST_CASE` / `TEST` / `def test_` nodes)
- [ ] Return list of test names

### 10.5 `build_test_target(test_file) → bool`
- [ ] Run `cmake --build --target <test_target>` for the specific test file
- [ ] Return `True` if build succeeds, `False` with errors logged

---

## PHASE 11 — Additional Tools (Not in Original Docs)

### 11.1 Documentation Fetcher
- [ ] `fetch_docs(library, symbol) → str`
  - [ ] Maintain a map of `library_name → base_docs_url`
    - [ ] `GLFW` → `https://www.glfw.org/docs/latest/`
    - [ ] `Catch2` → `https://github.com/catchorg/Catch2/blob/devel/docs/`
    - [ ] `SQLiteCpp` → `https://srombauts.github.io/SQLiteCpp/`
    - [ ] `pybind11`, `numpy`, `torch`, `spdlog`, etc.
  - [ ] HTTP GET the relevant page
  - [ ] Extract only the section for `symbol` (parse HTML, find first `<h2>` or `<h3>` containing symbol name, extract until next heading)
  - [ ] Compress: strip HTML tags, normalize whitespace, cap at 200 tokens
  - [ ] Return compressed doc string

### 11.2 Git Integration Tools
- [ ] `git_blame(file, start_line, end_line) → list[dict]`
  - [ ] Run `git blame -L start,end --porcelain file`
  - [ ] Parse: `{line, commit_hash, author, timestamp, commit_message_first_line}`
- [ ] `git_log_for_symbol(symbol_name) → list[dict]`
  - [ ] Run `git log -S symbol_name --oneline -10`
  - [ ] Return `{commit_hash, message, date}` per result
  - [ ] Annotate: "most recent modification is most likely location of introduced bug"
- [ ] `git_diff_since(commit_or_hours_ago) → str`
  - [ ] If int: `git diff HEAD~N` or compute timestamp for N hours ago
  - [ ] Return compressed diff: file names + symbols changed, not full diff text
- [ ] `git_show(commit, file) → str`
  - [ ] `git show commit:file`
  - [ ] Return file content at that commit
- [ ] `git_stash_and_restore(func)` — context manager: stash, run func, restore if func raises
- [ ] `git_commit(message) → str`
  - [ ] `git add -A && git commit -m message`
  - [ ] Return commit hash
  - [ ] Validate: only commit if all tests pass (call `run_all_tests()` first)

### 11.3 Ambiguity Detection (Pre-Model Pass)
- [ ] `check_ambiguities(task) → list[str]`
  - [ ] Extract all symbol names from task description
  - [ ] For each: `find_definitions(sym)` — if result is empty: flag "symbol not found — is this new?"
  - [ ] If task says "add method" but `task.target_symbol` has no class qualifier: flag "which class?"
  - [ ] If task mentions a file that doesn't exist: flag "file not found — create it?"
  - [ ] If task description is < 20 tokens: flag "description too brief — ambiguity risk"
  - [ ] Return list of question strings; empty list = proceed

### 11.4 Memory / Session State (Persistent Notes)
- [ ] `memory_write(key, value) → None` — store in a `session_notes` SQLite table
- [ ] `memory_read(key) → str | None` — retrieve by key
- [ ] `memory_list() → list[str]` — list all keys
- [ ] `memory_delete(key) → None`
- [ ] Auto-persist between runs (unlike in-context "memory" which resets)
- [ ] Use for: known bugs not yet fixed, architectural decisions, things the model "learned" this session

### 11.5 Conversation Summarizer
- [ ] After every N model turns (configurable, default 10), run a summarization pass
- [ ] Pass the last N turns to a summarization model/prompt
- [ ] Prompt: "Summarize the following conversation as a technical changelog. List: files modified, symbols added/changed, bugs fixed, bugs remaining, and architectural decisions made."
- [ ] Store summary in `memory_write('session_summary', summary)`
- [ ] Prepend summary to next session's context as `<conversation-summary>` block

### 11.6 Workspace Snapshot / Checkpoint
- [ ] `snapshot_workspace(tag) → str`
  - [ ] Run `git stash` with a descriptive message (or `git commit` if clean)
  - [ ] Record current `task_queue` state
  - [ ] Return snapshot ID (git stash hash or commit hash)
- [ ] `restore_snapshot(snapshot_id) → None`
  - [ ] `git stash pop` or `git checkout snapshot_id`
  - [ ] Restore `task_queue` state from snapshot record
  - [ ] Trigger full re-index
- [ ] Automatically snapshot before every `replace_function` that modifies > 3 files

### 11.7 Codebase Statistics / Health Dashboard
- [ ] `get_codebase_stats() → dict`
  - [ ] Total files, total LOC, total symbols
  - [ ] LOC per module (group by top-level directory)
  - [ ] Functions with no callers (dead code candidates)
  - [ ] Functions with highest call-in degree (most depended-upon — highest risk to modify)
  - [ ] Files with most `ERROR` nodes in tree-sitter parse (most likely malformed)
  - [ ] Test coverage estimate: symbols with ≥1 test vs. total symbols
- [ ] Output as JSON

### 11.8 Dependency Conflict Detector
- [ ] `find_circular_includes() → list[list[str]]`
  - [ ] Build directed graph from `includes` table
  - [ ] Run Tarjan's SCC algorithm
  - [ ] Return all SCCs of size > 1 (each is a circular include group)
- [ ] `find_missing_includes(file) → list[str]`
  - [ ] Parse `file` with tree-sitter — collect all type names used
  - [ ] Cross-reference with `get_includes(file)` → symbols that are used but not included
  - [ ] Return list of missing headers

### 11.9 Code Quality Metrics
- [ ] `get_cyclomatic_complexity(function_name) → int`
  - [ ] Count decision points in function body: `if`, `else if`, `for`, `while`, `case`, `&&`, `||`, `?:`
  - [ ] Return count + 1 (McCabe complexity)
  - [ ] Flag functions with complexity > 10
- [ ] `get_function_length(function_name) → int`
  - [ ] `end_line - start_line` from `symbols` table
  - [ ] Flag functions > 50 lines
- [ ] `get_parameter_count(function_name) → int`
  - [ ] Count parameters in signature
  - [ ] Flag functions with > 5 parameters

### 11.10 Codebase-Wide Rename Safety Check
- [ ] `rename_impact_analysis(old_name, new_name) → dict`
  - [ ] Count all usages of `old_name` across project
  - [ ] List all files that would be modified
  - [ ] Check if `new_name` already exists (collision detection)
  - [ ] Estimate token cost of reviewing all diffs
  - [ ] Return `{usage_count, affected_files, collision_risk, estimated_review_tokens}` before committing rename

### 11.11 Format / Lint Integration
- [ ] `format_file(file) → str`
  - [ ] Run `clang-format -i file` (C++) or `black file` (Python) or `rustfmt file` (Rust)
  - [ ] Return diff showing formatting changes
- [ ] `lint_file(file) → list[dict]`
  - [ ] Run `clang-tidy file` or `ruff file` or `cargo clippy`
  - [ ] Parse output into `{file, line, severity, rule, message}` list
- [ ] Auto-format every file after `create_file` or `replace_function` writes

### 11.12 Build System Management
- [ ] `cmake_configure(build_dir, flags={}) → bool`
  - [ ] Run `cmake -B build_dir -DFLAG=VAL ...`
  - [ ] Return `True` if configure step succeeded
- [ ] `cmake_list_targets(build_dir) → list[str]`
  - [ ] Run `cmake --build build_dir --target help`
  - [ ] Parse output for all target names
- [ ] `cmake_add_target(name, sources, deps) → None`
  - [ ] Read root `CMakeLists.txt`
  - [ ] Insert `add_executable(name sources)` and `target_link_libraries(name deps)`
  - [ ] Verify no duplicate target name before inserting

---

## PHASE 12 — Orchestrator Implementation

### 12.1 Main Agent Loop
- [ ] `def run_agent(task_queue_db, tools, model_client):`
  - [ ] Loop: `while task_queue_has_ready_tasks():`
    - [ ] `task = task_get_ready()[0]` — pick next ready task
    - [ ] `questions = check_ambiguities(task)` — pre-flight check
    - [ ] If `questions`: pause and surface to human; do not call model
    - [ ] `context = task_get_context(task.id)` — assemble input
    - [ ] `output = call_model(context, model_client)`
    - [ ] `apply_edit(task, output, tools)` — write the code
    - [ ] `errors = build_and_get_errors(task.target_file)`
    - [ ] `retries = 0`
    - [ ] While `errors and retries < MAX_RETRIES`:
      - [ ] `context = assemble_retry_context(task, errors, output, retries)`
      - [ ] `output = call_model(context, model_client)`
      - [ ] `apply_edit(task, output, tools)`
      - [ ] `errors = build_and_get_errors(task.target_file)`
      - [ ] `retries += 1`
    - [ ] If `not errors`: `task_complete(task.id)`; run test suite; commit if tests pass
    - [ ] If `errors`: `task_fail(task.id, format(errors))`; escalate to human

### 12.2 `call_model(context, client) → str`
- [ ] Prepend system prompt (code-generation persona, output-only-code instruction)
- [ ] Send to model API
- [ ] Strip markdown code fences from response if present: `re.sub(r'^```\w*\n|```$', '', output, flags=re.MULTILINE)`
- [ ] Measure and log token usage per call
- [ ] Implement retry with exponential backoff on rate limit / timeout errors

### 12.3 Three-Tier Memory Management
- [ ] **Tier 1 (Hot, in-context):** current task + immediately needed signatures, ≤ 500 tokens
- [ ] **Tier 2 (Warm, retrieved per-task):** recent task summaries + relevant signatures, ≤ 1500 tokens total budget
- [ ] **Tier 3 (Cold, indexed):** full codebase via symbol graph + semantic index, never in context directly
- [ ] Promotion: symbol used in 3+ consecutive tasks → add to Tier 1 persistent cache for session
- [ ] Demotion: completed task → summarize to 2 sentences → move to Tier 2; full detail → Tier 3 DB
- [ ] Eviction from Tier 1: LRU eviction when Tier 1 approaches 500 token cap

### 12.4 `apply_edit(task, model_output, tools) → None`
- [ ] Inspect task type to determine which edit tool to call:
  - [ ] `task.kind == 'create_function'` → `add_method_to_class` or `insert_after_symbol`
  - [ ] `task.kind == 'modify_function'` → `replace_function`
  - [ ] `task.kind == 'create_file'` → `create_file`
  - [ ] `task.kind == 'fix_error'` → `replace_function` (target = symbol from error message)
- [ ] If model output does not match expected structure: log and raise `MalformedOutputError`

### 12.5 Escalation Protocol
- [ ] If task fails after `MAX_RETRIES` attempts: `task_fail(task_id, reason)`
- [ ] Write human-readable escalation report: task title, all error messages, all model attempts, suggested manual fix approach
- [ ] Pause orchestrator — do not continue to dependent tasks
- [ ] Resume command: `resume_after_manual_fix(task_id)` — marks task complete, re-checks deps

---

## PHASE 13 — Verification Pass (Post-Build Audit)

### 13.1 Consistency Checks
- [ ] After all tasks complete: `grep_search` for every public function name that appears in more than one file — verify definition exists
- [ ] For every `#include` statement: verify the included file exists on disk
- [ ] For every `calls` entry in the DB where `callee_id IS NULL` (unresolved external): list and confirm expected (not a missing internal symbol)
- [ ] Run `find_circular_includes()` — verify empty result (no circular dependencies)
- [ ] Run `get_codebase_stats()` — review dead code list

### 13.2 Full Build Test
- [ ] `cmake_configure(build_dir, {'WITH_TESTS': 'ON', 'WITH_CUDA': 'OFF'})`
- [ ] `cmake --build build_dir 2>&1 | tee build_log.txt`
- [ ] If build fails: feed `build_log.txt` (compressed via `build_and_get_errors`) back into orchestrator as a new batch of fix tasks
- [ ] If build succeeds: `run_all_tests()`
- [ ] If tests fail: create fix tasks for each failing test

### 13.3 Cross-File API Audit
- [ ] For each method name that is called (appears in `calls.callee_id`): verify the symbol exists in `symbols` table as a definition
- [ ] For each virtual method: verify at least one override exists in a derived class
- [ ] For each pure virtual method: verify every concrete class has an implementation

---

## PHASE 14 — System Prompt Engineering

### 14.1 System Prompt Requirements
- [ ] Specify persona: "precise code generator; outputs only compilable code"
- [ ] Specify output format: "Output only the function body. No explanations. No markdown fences."
- [ ] Specify language version: "C++20 / Python 3.12 / Rust 1.77 (as applicable)"
- [ ] Specify project-specific naming conventions (namespaces, file naming, etc.)
- [ ] Specify any style rules (brace placement, `#pragma once` vs include guards, max LOC per function)
- [ ] Specify what NOT to do: "Do not rewrite the entire file. Do not add `#include` directives unless explicitly asked."
- [ ] Keep system prompt ≤ 400 tokens

### 14.2 Instruction File (`.github/copilot-instructions.md` or equivalent)
- [ ] Exact file size limits per module
- [ ] Exact namespace hierarchy rules
- [ ] Mathematical equations / business logic ground truth (the "theory doc")
- [ ] Build system requirements and cmake target names
- [ ] Third-party library versions pinned
- [ ] Forbidden patterns (e.g., no raw `new`, no global state, no RTTI)
- [ ] This file loaded into every model call as part of system prompt

---

## PHASE 15 — Final Integration Checklist

- [ ] All 7 tool classes implemented and unit-tested
- [ ] All "additional tools" (Phase 11) implemented
- [ ] SQLite schema created and all indexes present
- [ ] Tree-sitter parsers initialized for all target languages
- [ ] Embedding index built for project
- [ ] LSP server connected and `publishDiagnostics` cache populated
- [ ] Token counter integrated and budget assertions verified
- [ ] Task queue initialized with full dependency tree for project
- [ ] Orchestrator main loop tested on a single trivial task end-to-end
- [ ] Retry loop tested: introduce deliberate error, verify it self-corrects within 3 retries
- [ ] Delta context encoding tested: second call to same context is ≤ 40% of first call token count
- [ ] Git integration tested: commit, blame, log all return valid data
- [ ] Format/lint integration tested: auto-format runs after every write
- [ ] Escalation protocol tested: 4th retry (beyond MAX) triggers human escalation correctly
- [ ] Snapshot/restore tested: snapshot before major edit, restore after intentional breakage
- [ ] Full project build succeeds (`cmake --build` exits 0)
- [ ] All tests pass (`ctest` or equivalent exits 0)
- [ ] Codebase stats reviewed: no circular includes, no unresolved internal symbols

---

## APPENDIX A — Research Papers (All Free on arXiv)

| Paper | Authors | Year | arXiv ID | Key finding |
|-------|---------|------|----------|-------------|
| ReAct: Synergizing Reasoning and Acting | Yao et al. | 2022 | 2210.03629 | Interleaved reasoning + tool use dramatically improves task success |
| Chain-of-Thought Prompting | Wei et al. | 2022 | 2201.11903 | CoT dramatically improves multi-step task performance |
| SWE-bench | Jimenez et al. | 2024 | 2310.06770 | Standard benchmark; frontier models now > 60% pass rate |
| SWE-agent (ACI) | Yang et al. | 2024 | 2405.15793 | Tool interface design matters more than model size |
| LLM-Modulo Frameworks | Kambhampati et al. | 2024 | 2402.01817 | External verifiers are the source of correctness — not the model alone |
| The Rise of LLM-Based Agents | Xi et al. | 2023 | 2309.07864 | Survey: brain / perception / action agent architecture |
| Emerging AI Agent Architectures | Masterman et al. | 2024 | 2404.11584 | Planning, execution, reflection phases in agent design |

---

## APPENDIX B — Recommended Local Models (as of 2025)

| Model | Params | Context | RAM Required | Best use |
|-------|--------|---------|-------------|----------|
| Qwen2.5-Coder 7B | 7B | 32K | 8 GB | General code generation |
| Qwen2.5-Coder 1.5B | 1.5B | 32K | 2 GB | Function-level tasks, fastest |
| DeepSeek-Coder-V2-Lite | 16B MoE (2.4B active) | 128K | 12 GB | Multi-file reasoning |
| StarCoder2 3B | 3B | 16K | 4 GB | Fill-in-middle completion |
| CodeGemma 2B | 2B | 8K | 3 GB | Smallest reliable instruction-follower |
| nomic-embed-code | 137M | 512 | 0.5 GB | Embedding index only |
| all-minilm-l6-v2 | 22M | 256 | 0.1 GB | Lightweight embeddings (lower quality) |

---

*Generated March 2026. Based on: SWE-agent (Yang et al. 2024), SWE-bench (Jimenez et al. 2024), ReAct (Yao et al. 2022), LLM-Modulo (Kambhampati et al. 2024).*