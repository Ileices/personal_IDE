# Autonomous 24/7 Software-Building Agent — Complete Tool Checklist
> For: Personal IDE — AI coding agent that builds software, games, and apps for non-programmers  
> Context: Multi-provider LLM (free + paid tiers, local + cloud), multi-agent fleet, Nano Sea  
> Notation: `[ ]` = not started · `[x]` = complete · `[-]` = in progress  
>
> ⚠️ **auto_rebuilder.py NOTICE**: The `auto_rebuilder.py` script is a PROTOTYPE and must NOT be  
> imported, called, or referenced in any production code. All features extracted from it below  
> must be re-implemented from scratch as independent, properly integrated service modules.  
> Use `auto_rebuilder.py` as a REFERENCE ONLY for concepts and algorithms.

---

## SECTION A — FILE SYSTEM TOOLS
*The agent must be able to read, write, navigate, and manage any project's files completely autonomously.*

### A.1 Core File Operations
- [ ] `read_file(path, start_line?, end_line?) → str` — Read file or line range; cap at configurable max lines
- [ ] `write_file(path, content) → void` — Overwrite entire file; trigger re-index + file watcher event
- [ ] `create_file(path, content) → void` — Create new file + all missing parent directories
- [ ] `delete_file(path) → void` — Delete file with trash/recovery option; log deletion for rollback
- [ ] `rename_file(old_path, new_path) → void` — Rename/move + update all internal cross-references
- [ ] `copy_file(src, dst) → void` — Deep copy preserving metadata
- [ ] `append_to_file(path, content) → void` — Append without full rewrite
- [ ] `patch_file(path, unified_diff_str) → void` — Apply a GNU unified diff patch cleanly

### A.2 Directory Operations
- [ ] `list_dir(path, recursive?, extensions_filter?) → list[FileEntry]` — List files with metadata (size, modified, type)
- [ ] `create_dir(path) → void` — Create directory tree
- [ ] `delete_dir(path, recursive?) → void` — Delete directory; refuse if contains untracked changes
- [ ] `get_file_tree(root_path, max_depth?) → TreeNode` — Full project tree for agent context injection
- [ ] `find_files(pattern, root?) → list[str]` — Glob-based file search across entire project
- [ ] `get_file_stats(path) → dict` — Size, line count, language, last modified, encoding
- [ ] `watch_directory(path, callback) → WatcherHandle` — Real-time file change events for Monaco live reload

### A.3 Surgical Code Editing (Do NOT rewrite whole files)
- [ ] `replace_lines(path, start_line, end_line, new_content) → diff_str` — Replace a line range precisely
- [ ] `replace_string(path, old_str, new_str, occurrence?) → diff_str` — Replace exact match; error if 0 or >1 matches when `occurrence` not set
- [ ] `insert_after_line(path, line_number, content) → diff_str` — Insert content without disturbing rest of file
- [ ] `delete_lines(path, start_line, end_line) → diff_str` — Remove line range
- [ ] `find_and_replace_regex(path, pattern, replacement, flags?) → diff_str` — Regex replacement with capture groups
- [ ] `apply_diff(path, diff_str) → bool` — Apply unified diff; return success flag; validate before applying
- [ ] `multi_file_replace(replacements: list[{path, old, new}]) → list[diff_str]` — Atomic batch replacement across multiple files

### A.4 File Safety
- [ ] All write operations must create an auto-backup snapshot entry before modifying
- [ ] `validate_encoding(path) → str` — Detect and report file encoding (UTF-8, latin-1, etc.)
- [ ] `check_file_locked(path) → bool` — Detect OS-level file locks before attempting write
- [ ] `get_file_hash(path) → str` — SHA256 for change detection and integrity verification

---

## SECTION B — CODE INTELLIGENCE TOOLS
*The agent must understand the structure of any codebase without reading every line.*

### B.1 Parsing & Symbol Extraction
- [ ] `parse_file_symbols(path) → SymbolList` — Extract all functions, classes, variables, imports using tree-sitter
- [ ] `get_function(path, name) → str` — Return only the named function body (not the entire file)
- [ ] `get_class_api(path, class_name) → list[str]` — Return public method signatures only — no bodies
- [ ] `get_imports(path) → list[ImportEntry]` — All imports with alias and source
- [ ] `get_exports(path) → list[str]` — All exported symbols (module-level in Python, exports in TS)
- [ ] `get_signature(symbol_name, project_wide?) → str | list[str]` — One-line signature for any symbol
- [ ] `get_type_definition(type_name) → str` — Find type alias, interface, or struct definition
- [ ] `extract_docstring(path, symbol_name) → str` — Return docstring/JSDoc for any symbol
- [ ] `get_function_complexity(path, func_name) → int` — McCabe cyclomatic complexity score
- [ ] `get_function_line_count(path, func_name) → int` — LOC for a specific function
- [ ] `get_parameter_list(path, func_name) → list[ParamInfo]` — Names, types, defaults

### B.2 Symbol Graph Navigation
- [ ] `find_definition(symbol_name) → {file, line}` — Where is this symbol defined?
- [ ] `find_all_usages(symbol_name) → list[{file, line, snippet}]` — Every use across the project
- [ ] `find_callers(func_name) → list[{file, line}]` — What calls this function?
- [ ] `find_callees(func_name) → list[{file, line}]` — What does this function call?
- [ ] `get_inheritance_chain(class_name) → list[str]` — Full class hierarchy
- [ ] `find_overrides(method_name, base_class) → list[{class, file}]` — All overriding implementations
- [ ] `get_include_graph(file) → list[str]` — What this file imports/includes
- [ ] `get_reverse_include_graph(file) → list[str]` — What imports this file
- [ ] `topological_sort_files(file_list) → list[str]` — Dependency-safe file ordering (Kahn's algorithm)
- [ ] `find_circular_dependencies() → list[list[str]]` — All circular import/include cycles (Tarjan SCC)
- [ ] `find_dead_code() → list[{file, symbol}]` — Symbols defined but never called
- [ ] `find_missing_implementations() → list[{interface, missing_method}]` — Abstract methods without implementations

### B.3 Semantic Search
- [ ] `semantic_search(query, top_k?) → list[{symbol, score, file, snippet}]` — Embedding-based code search
- [ ] `grep_search(pattern, glob?, is_regex?) → list[{file, line, match}]` — Fast literal/regex search, hard cap 500 results
- [ ] `find_symbol_by_pattern(name_regex) → list[SymbolEntry]` — Symbol name regex search against the index
- [ ] `find_similar_code(code_snippet) → list[{file, symbol, score}]` — Find functionally similar existing code
- [ ] `search_by_type(type_name) → list[{file, line, symbol}]` — Find all places a type is used
- [ ] `search_comments(query) → list[{file, line, comment}]` — Search in comments/docstrings only

### B.4 Code Index Management
- [ ] `build_index(project_root) → void` — Full project index on first load (tree-sitter + embeddings)
- [ ] `update_index_for_file(path) → void` — Incremental re-index after any file write
- [ ] `get_index_stats() → dict` — Total files, symbols, last updated, stale files
- [ ] `invalidate_index(path?) → void` — Force re-index of a file or whole project
- [ ] Support languages: Python, TypeScript, JavaScript, C++, C, C#, Rust, Go, Java, HTML, CSS, GLSL, Lua, GDScript

---

## SECTION C — BUILD & COMPILE TOOLS
*The agent must be able to build any project type and interpret the results.*

### C.1 Build Execution
- [ ] `run_build(target?, config?) → BuildResult` — Execute project build (cmake, cargo, npm build, go build, etc.)
- [ ] `run_build_incremental(changed_files) → BuildResult` — Only rebuild affected targets
- [ ] `configure_build(flags: dict) → bool` — Run build configuration step (cmake -B build -D...)
- [ ] `list_build_targets() → list[str]` — All available targets in the build system
- [ ] `add_build_target(name, sources, deps) → void` — Add a new target to the build system
- [ ] `detect_build_system(root) → str` — Auto-detect: CMake, Cargo, npm, Poetry, Make, Gradle, etc.
- [ ] `install_dependencies() → void` — Run `pip install -r requirements.txt` / `npm install` / `cargo fetch` etc.
- [ ] `check_dependency_outdated() → list[{name, current, latest}]` — Find stale packages

### C.2 Error Parsing & Compression
- [ ] `get_build_errors(raw_output) → list[ErrorEntry]` — Parse compiler output for all build systems
  - [ ] MSVC format: `file(line,col): error CXXXX: message`
  - [ ] GCC/Clang: `file:line:col: error: message`
  - [ ] Rust: `error[EXXXX]: message` with span info
  - [ ] TypeScript: `error TS2345: message`
  - [ ] Python syntax errors
  - [ ] Linker errors: `undefined reference`, `LNK2019`
  - [ ] Template instantiation chains: keep only innermost failure
- [ ] `compress_errors(errors) → list[ErrorEntry]` — Deduplicate same `(file, error_code)` pairs; strip absolute paths; truncate at 120 chars; cap at 20 unique errors
- [ ] `get_first_error() → ErrorEntry | None` — Root cause error only (first in output)
- [ ] `get_errors_for_symbol(symbol) → list[ErrorEntry]` — Errors that mention a specific symbol
- [ ] `check_syntax_only(path) → list[ErrorEntry]` — Single-file syntax check without linking

### C.3 LSP Integration
- [ ] `lsp_get_diagnostics(file) → list[DiagEntry]` — Live error feed from language server (no compile required)
- [ ] `lsp_hover(file, line, col) → HoverInfo` — Type info + documentation at cursor
- [ ] `lsp_find_references(file, line, col) → list[Location]` — All usages from LSP
- [ ] `lsp_find_definition(file, line, col) → Location` — Go-to-definition via LSP
- [ ] `lsp_get_completions(file, line, col) → list[CompletionItem]` — Completions to understand API surface
- [ ] `lsp_get_code_actions(file, line, col) → list[CodeAction]` — Compiler-suggested quick fixes
- [ ] `lsp_rename(file, line, col, new_name) → WorkspaceEdit` — LSP-coordinated rename

---

## SECTION D — TERMINAL & RUNTIME TOOLS
*The agent must be able to run any command and interpret the results.*

### D.1 Terminal Execution
- [ ] `run_command(cmd, cwd?, timeout?, env?) → {stdout, stderr, exit_code}` — Execute shell command
- [ ] `run_command_stream(cmd, cwd?, callback) → void` — Stream output line-by-line as it arrives (for long builds, test runs)
- [ ] `run_in_background(cmd, cwd?) → ProcessHandle` — Start long-running process (server, watcher)
- [ ] `kill_process(handle) → void` — Stop a background process by handle
- [ ] `get_running_processes() → list[ProcessInfo]` — All processes started by the agent
- [ ] `kill_process_on_port(port) → void` — Free a port by killing whatever holds it
- [ ] `wait_for_port(port, timeout?) → bool` — Wait until a server is accepting connections
- [ ] `check_command_exists(cmd) → bool` — Verify a CLI tool is installed before using it

### D.2 Environment & Platform Detection
- [ ] `detect_os() → str` — Windows / macOS / Linux / WSL
- [ ] `detect_shell() → str` — PowerShell / Bash / Zsh / Fish / CMD
- [ ] `detect_package_manager() → str` — npm / pnpm / yarn / pip / poetry / cargo / go / brew / apt
- [ ] `detect_runtime_versions() → dict` — Node.js, Python, Rust, Go, Java versions installed
- [ ] `detect_gpu() → list[GPUInfo]` — CUDA, ROCm, Metal, DirectML, Vulkan — model, VRAM, driver
- [ ] `detect_available_tools() → list[str]` — git, docker, make, cmake, ffmpeg, etc.
- [ ] `get_cpu_info() → dict` — Cores, architecture (x86_64 / ARM64 / RISC-V)
- [ ] `get_ram_info() → dict` — Total, available, swap
- [ ] `get_disk_space(path) → dict` — Free, total, filesystem type

### D.3 Script Execution Safety
- [ ] `execute_in_sandbox(code, language, timeout?) → {output, error}` — Run untrusted code in isolated subprocess with timeout
- [ ] `detect_risky_patterns(code) → list[{pattern, severity}]` — Scan for `eval()`, `exec()`, `os.system()`, `subprocess.run()`, file writes, hard-coded ports, network binding — all severity-scored
  > Extracted from `auto_rebuilder.py` `RISKY_CODE_PATTERNS` — implement as standalone `RiskyCodeScanner` service; do NOT import from auto_rebuilder.py
- [ ] `validate_code_safety(code, language) → SafetyReport` — Full safety report before executing unknown code
- [ ] All terminal commands time-boxed with configurable `EXECUTION_TIMEOUT` default 30s

---

## SECTION E — VERSION CONTROL & CHECKPOINT TOOLS
*The agent must manage history, rollback, and safe experimentation.*

### E.1 Git Operations
- [ ] `git_init(path) → void` — Initialize git repo if one doesn't exist; check before creating checkpoints
- [ ] `git_status(path) → GitStatus` — Modified, untracked, staged files
- [ ] `git_diff(path, file?, commit?) → str` — Diff working tree or between commits
- [ ] `git_add(path, files?) → void` — Stage files or all changes
- [ ] `git_commit(path, message, auto_test_first?) → str` — Commit + return hash; optionally run tests first
- [ ] `git_log(path, n?, file?) → list[CommitInfo]` — Recent commit history
- [ ] `git_blame(path, file, start_line, end_line) → list[BlameEntry]` — Who wrote each line, when
- [ ] `git_show(path, commit, file) → str` — File content at a specific commit
- [ ] `git_revert(path, commit) → void` — Safe revert with new commit
- [ ] `git_stash(path, message?) → str` — Stash changes with label; return stash ID
- [ ] `git_stash_pop(path, stash_id?) → void` — Restore stash
- [ ] `git_branch(path, name) → void` — Create branch for experimental work
- [ ] `git_checkout(path, branch_or_commit) → void` — Switch branch or restore commit

### E.2 Checkpoint System (Git-backed)
- [ ] `create_checkpoint(project_id, label) → CheckpointId` — Git commit + store metadata in SQLite
- [ ] `list_checkpoints(project_id) → list[CheckpointInfo]` — All checkpoints with timestamps, file change counts
- [ ] `restore_checkpoint(checkpoint_id) → void` — Revert project to snapshot; creates new commit so it's undoable
- [ ] `diff_checkpoint(checkpoint_id, other_id?) → str` — Diff between two checkpoints
- [ ] `auto_checkpoint(project_id, trigger) → void` — Create checkpoint before: any multi-file edit, major refactor, risky terminal command
- [ ] `checkpoint_before_agent_run(project_id) → CheckpointId` — Always checkpoint before starting any agent task

### E.3 Git-Powered Bug Detection
- [ ] `git_log_for_symbol(symbol_name, project_path) → list[CommitInfo]` — Commits that touched this symbol; most recent = likely bug site
  > Concept from `auto_rebuilder.py` change tracking; implement as independent `GitIntelligence` service
- [ ] `find_recently_changed_files(project_path, hours?) → list[str]` — Files changed in last N hours
- [ ] `git_grep(pattern, project_path) → list[{file, line, match}]` — Search across all committed history

---

## SECTION F — TESTING TOOLS
*The agent must run, interpret, and write tests autonomously.*

### F.1 Test Execution
- [ ] `run_test(test_name, project_path) → TestResult` — Run single test; return pass/fail + assertion detail
- [ ] `run_tests_for_file(source_file) → list[TestResult]` — Run all tests covering a source file
- [ ] `run_all_tests(project_path) → TestSummary` — Full test suite; compressed failure output
- [ ] `run_tests_with_coverage(project_path) → CoverageReport` — Coverage per file and function
- [ ] `build_test_target(test_file) → bool` — Compile test without running
- [ ] `get_tests_for_symbol(symbol_name) → list[str]` — Which tests exercise this symbol
- [ ] `detect_test_framework(project_path) → str` — Auto-detect: pytest, jest, vitest, Catch2, cargo test, go test
- [ ] `compress_test_output(raw) → list[FailureEntry]` — Extract assertion + actual + expected from verbose test output

### F.2 Test Generation
- [ ] `generate_unit_tests(path, func_name) → str` — Generate unit tests for a function; insert into test file
- [ ] `generate_integration_test(description) → str` — Generate integration test from plain-English description
- [ ] `find_untested_symbols(project_path) → list[str]` — Symbols with 0 test coverage
- [ ] `suggest_test_cases(func_name) → list[str]` — Propose edge cases and boundary conditions for a function

---

## SECTION G — LLM PROVIDER & MODEL MANAGEMENT TOOLS
*The agent must handle all 11 providers, rate limits, fallbacks, and context windows autonomously.*

### G.1 Provider Client Management
- [ ] `get_client(provider, db) → LLMClient` — Factory; decrypts stored key; creates OpenAI-compatible client
- [ ] `test_provider_connection(provider) → ConnectionResult` — Probe request to verify provider is alive
- [ ] `list_available_providers() → list[ProviderInfo]` — All configured + reachable providers
- [ ] `list_models_for_provider(provider) → list[ModelInfo]` — Models available on a provider right now
- [ ] `get_model_context_window(model_id) → int` — Real context window for this model
- [ ] `get_model_max_output(model_id) → int` — Max output tokens
- [ ] `discover_models_dynamically(provider) → list[str]` — Query provider's `/models` endpoint in real time

### G.2 Rate Limit Management
- [ ] `can_make_request(model_id) → bool` — Check before every LLM call
- [ ] `record_usage(model_id, input_tokens, output_tokens) → void` — Update sliding window counters after every call
- [ ] `get_remaining_budget(model_id) → RateBudget` — Tokens/requests remaining in current window
- [ ] `parse_rate_limit_headers(response_headers) → RateLimitInfo` — Extract `x-ratelimit-remaining-*` and `retry-after`
- [ ] `detect_rate_limit_cap_vs_model_limit(error_tokens, model_context) → CapType`
  - If `error_tokens < model_context * 0.25` → it's a GitHub free-tier cap, NOT the model's real limit
  - Store as `per_request_limit`; never shrink `contextWindow`
  - Enforce 16,000 token floor on per-request limit
- [ ] `select_fallback_model(failed_model) → str` — Pick model with most remaining budget; prefer different provider
- [ ] `exponential_backoff(attempt) → float` — Backoff: 2s, 4s, 8s... cap at 60s; reset after 3 successes
- [ ] `wait_for_rate_reset(model_id) → void` — Sleep until rate limit window resets
- [ ] `get_rate_limit_dashboard() → list[ModelBudgetInfo]` — All models' current budgets for UI display

### G.3 Request Lifecycle
- [ ] `complete_chat(model, messages, max_tokens?) → ChatResponse` — Non-streaming; includes retry + fallback
- [ ] `stream_chat(model, messages, callback) → void` — SSE streaming; heartbeat every 30s; abort signal support
- [ ] `stop_stream(request_id) → void` — Abort an in-flight request
- [ ] `handle_404(model_id) → str` — Model unavailable: mark dead for session; return fallback model name
- [ ] `handle_timeout(model_id, attempt) → void` — 120s timeout: retry once, then switch model
- [ ] `handle_invalid_json(response) → void` — Retry with "respond in valid JSON only" injection

### G.4 Context Window Management
- [ ] `count_tokens(text, model_id) → int` — Model-specific tokenizer (tiktoken or equivalent)
- [ ] `estimate_tokens(text) → int` — Fast heuristic: `len(text) / 3.5` for when exact count not needed
- [ ] `truncate_to_budget(text, budget, strategy?) → str` — Truncate preserving most important content; strategy: `tail`, `head`, `middle-out`
- [ ] `fit_messages_to_window(messages, model_id) → list[Message]` — Drop oldest messages to fit context; preserve system prompt
- [ ] Budget constants enforced at runtime:
  - [ ] `BUDGET_SYSTEM = 400`
  - [ ] `BUDGET_SIGNATURES = 600`
  - [ ] `BUDGET_TYPE_DEFS = 400`
  - [ ] `BUDGET_ERRORS = 300`
  - [ ] `BUDGET_EXAMPLES = 300`
  - [ ] `BUDGET_OUTPUT_RESERVED = 2000`

### G.5 Smart Chunking Pipeline
- [ ] `chunk_content(content, token_limit) → list[Chunk]` — Split at semantic boundaries: file → function → paragraph → line
- [ ] `process_chunked(content, task, model) → str` — Process oversized content in chunks; combine results
- [ ] `generate_bridge_summary(previous_chunk_result) → str` — 2–3 sentence summary injected as context for next chunk
- [ ] Recursion guard: `max_depth=3`; at max depth return error instead of recursing
- [ ] Per-chunk target: 80% of token budget; leave 20% for output

---

## SECTION H — MEMORY & CONTEXT TOOLS
*The agent must remember things across sessions, tasks, and restarts.*

### H.1 Project Memory (SQLite-backed)
- [ ] `memory_create(project_id, title, body) → NoteId` — Create persistent memory note
- [ ] `memory_read(note_id) → Note` — Read by ID
- [ ] `memory_search(project_id, query) → list[Note]` — Semantic + keyword search over notes
- [ ] `memory_update(note_id, body) → void` — Update note content
- [ ] `memory_delete(note_id) → void` — Remove note
- [ ] `memory_list(project_id) → list[NoteHeader]` — All notes with titles
- [ ] `memory_auto_create(event) → void` — Auto-create notes for: bugs fixed, architecture decisions, failed approaches, working solutions
- [ ] Cap: `MAX_MEMORY_NOTES_PER_PROJECT = 10000` (configurable)

### H.2 Session State (Ephemeral per-run)
- [ ] `session_write(key, value) → void` — In-memory KV store; resets on agent restart
- [ ] `session_read(key) → Any | None` — Read session value
- [ ] `session_list() → list[str]` — All session keys
- [ ] Use for: discovered rate limits, dead model list, current task state, in-progress diffs

### H.3 Conversation Indexing
- [ ] `index_conversation(conv_id, messages) → void` — Store conversation for future search
- [ ] `search_past_conversations(query) → list[ConversationSnippet]` — Find relevant past context
- [ ] `get_conversation_summary(conv_id) → str` — Compressed summary of a past conversation

### H.4 Three-Tier Context Assembly
- [ ] **Tier 1 (Hot, ≤500 tokens)**: Current task + immediately needed signatures — always in context
- [ ] **Tier 2 (Warm, ≤1500 tokens)**: Recent task summaries + relevant signatures — retrieved per task
- [ ] **Tier 3 (Cold, indexed)**: Full codebase + all history — never raw in context; queried via tools
- [ ] Promote: symbol used in 3+ consecutive tasks → pin to Tier 1 for session
- [ ] Demote: completed task → compress to 2 sentences → Tier 2; full detail → Tier 3
- [ ] LRU evict from Tier 1 when approaching 500 token cap

### H.5 Delta Context Encoding (Multi-Turn)
- [ ] `delta_diff(prev_context_hashes, new_context) → str` — `[UNCHANGED] symbol` (3 tokens) vs `[UPDATED] symbol:\n{content}` (full)
- [ ] Cache hash of every symbol in context after each call
- [ ] 40–60% token savings on long sessions
- [ ] `conversation_summarizer(messages, n_turn_trigger) → str` — Auto-summarize after every N turns; inject as `<conversation-summary>` block

---

## SECTION I — WEB & RESEARCH TOOLS
*The agent must be able to look up documentation, error messages, and external information.*

### I.1 Web Search
- [ ] `web_search(query, n_results?) → list[SearchResult]` — DuckDuckGo or configured provider; top N results with titles, URLs, snippets
- [ ] `web_fetch(url) → str` — HTTP GET; extract readable text from HTML; strip scripts/styles/ads
- [ ] `search_and_fetch(query) → str` — Search + auto-fetch first result; return combined summary
- [ ] `search_for_error(error_message) → list[SearchResult]` — Strip personal paths from error before searching

### I.2 Documentation Fetcher
- [ ] `fetch_docs(library, symbol) → str` — Retrieve authoritative API docs for a specific symbol
  - [ ] Maintain URL map per library: `npm`, `PyPI`, `crates.io`, `pkg.go.dev`, `docs.rs`, `MDN`, etc.
  - [ ] Extract only the section for `symbol`; strip navigation/ads; cap at 200 tokens
- [ ] `fetch_library_readme(library_name) → str` — Fetch README for any package
- [ ] `fetch_changelog(library_name, version?) → str` — Fetch changelog/release notes
- [ ] `check_package_exists(package_name, language) → bool` — Verify package exists before adding as dependency

### I.3 Stack Overflow / Forum Search
- [ ] `search_stackoverflow(query) → list[QAResult]` — Search for known solutions; extract accepted answers
- [ ] `search_github_issues(repo, query) → list[IssueResult]` — Search GitHub issues for known bugs

---

## SECTION J — CODE GENERATION & TRANSFORMATION TOOLS
*The agent must produce correct, complete, production-grade code — not stubs.*

### J.1 Code Generation
- [ ] `assemble_context(task) → str` — Build token-budgeted context: task + signatures + types + errors + semantic results
- [ ] `call_model_for_code(context, output_type) → str` — Structured prompt; strip markdown fences from output; validate result
- [ ] `generate_function(signature, docstring, context) → str` — Generate single function body
- [ ] `generate_class(class_spec) → str` — Generate full class from spec
- [ ] `generate_test_for_function(func_name, path) → str` — Generate unit tests
- [ ] `generate_config_file(type, project_info) → str` — Generate `.env`, `tsconfig.json`, `CMakeLists.txt`, `Cargo.toml`, etc.
- [ ] `generate_documentation(path, symbol?) → str` — Generate README, docstrings, or JSDoc
- [ ] `generate_build_script(platform, project_type) → str` — Cross-platform build scripts

### J.2 Code Transformation
- [ ] `refactor_function(path, func_name, instruction) → diff_str` — Targeted refactor with instruction
- [ ] `rename_symbol_project_wide(old, new) → list[diff_str]` — Safe rename across all files
- [ ] `extract_function(path, start_line, end_line, new_name) → diff_str` — Extract code block into new function
- [ ] `inline_function(path, func_name) → diff_str` — Inline a function at all call sites
- [ ] `convert_language(path, target_language) → str` — Translate file to another language (Python → TypeScript, etc.)
- [ ] `modernize_code(path, language_version) → diff_str` — Upgrade to newer language features
- [ ] `add_type_annotations(path) → diff_str` — Add missing type hints (Python) or type annotations (TS)
- [ ] `remove_dead_code(path) → diff_str` — Remove unused functions/variables

### J.3 Auto-Rebuilder Concepts (Re-implemented, NOT using auto_rebuilder.py)
> ⚠️ All features below are INSPIRED by concepts in `auto_rebuilder.py` but must be implemented  
> as independent service modules with no reference to or import from `auto_rebuilder.py`.

- [ ] **Module categorizer service**: Auto-classify any file into: `core`, `ui`, `io`, `net`, `train`, `tools` based on filename + content keywords
  > Source concept: `PACKAGE_STRUCTURE` dict in `auto_rebuilder.py`; re-implement as `ModuleCategorizer` class in its own file
- [ ] **Namespace collision detector**: Scan two or more files and identify all symbol name collisions before merging
  > Source concept: `symbol_collision_risk` in `COMPATIBILITY_WEIGHTS`; re-implement as `NamespaceAnalyzer` service
- [ ] **Module compatibility scorer**: Score two modules on: import overlap, interface adaptability, side-effect safety, resource conflict risk, error containment — return weighted 0.0–1.0 score
  > Source concept: `COMPATIBILITY_WEIGHTS` dict; re-implement as `ModuleCompatibilityService`
- [ ] **Risky code pattern scanner**: Detect `eval()`, `exec()`, `os.system()`, `subprocess.run()`, file writes, hard-coded ports, network binding — each with severity 1–3
  > Source concept: `RISKY_CODE_PATTERNS` list; re-implement as `SecurityScanner` service
- [ ] **Module cluster engine**: Group files into functional clusters using TF-IDF similarity + DBSCAN; respect `CLUSTER_MAX_SIZE`
  > Source concept: `calculate_module_clusters()` in `auto_rebuilder.py`; re-implement as `CodebaseClusterEngine` — do NOT call or import auto_rebuilder.py
- [ ] **Hierarchical module organizer**: Given a flat list of files, produce a hierarchical directory structure sorted by category with proper `__init__.py` files
  > Source concept: `create_hierarchical_module_structure()` in `auto_rebuilder.py`
- [ ] **Launcher generator**: Generate a `launch.py` / `package.json` scripts section that can start any module by name, category, or unified entrypoint
  > Source concept: `create_launcher()` in `auto_rebuilder.py`
- [ ] **Codebase integrator**: Merge N independent Python scripts into a single namespace-safe integrated module; handle `if __name__ == '__main__'` blocks; resolve import conflicts
  > Source concept: `create_integrated_codebase()` in `auto_rebuilder.py`
- [ ] **Code style analyzer**: Detect naming conventions (camelCase, snake_case, PascalCase), brace style, quote style — for consistent generation
  > Source concept: `code_style_similarity` weight in `auto_rebuilder.py`
- [ ] **Python version compatibility checker**: Given a code file, determine minimum Python version required
  > Source concept: `python_version_compatibility` weight in `auto_rebuilder.py`
- [ ] **Side-effect detector**: Analyze whether a function/module modifies global state, builtins, or has other side effects
  > Source concept: `global_state` analysis in `auto_rebuilder.py`; re-implement as `SideEffectAnalyzer`
- [ ] **Sandbox executor**: Run a Python file in isolated subprocess with timeout, capture stdout/stderr, kill if timeout exceeded
  > Source concept: `SANDBOX_EXECUTION` + `EXECUTION_TIMEOUT` in `auto_rebuilder.py`; re-implement using `multiprocessing` or Docker

---

## SECTION K — PROJECT SCAFFOLDING TOOLS
*The agent must be able to start projects from zero with no human knowing how to use any CLI.*

### K.1 Project Templates
- [ ] `scaffold_project(type, name, options) → void` — Generate full project structure for:
  - [ ] Python CLI tool
  - [ ] Python FastAPI web server
  - [ ] TypeScript/Node.js backend (Fastify)
  - [ ] React + TypeScript frontend (Vite)
  - [ ] Full-stack web app (Fastify + React + SQLite)
  - [ ] C++ CMake project
  - [ ] Rust Cargo project
  - [ ] Go module
  - [ ] Godot 4 game (GDScript)
  - [ ] Unity game (C#)
  - [ ] Pygame 2D game (Python)
  - [ ] Electron desktop app
  - [ ] Chrome extension
  - [ ] Discord bot (Python/Node.js)
  - [ ] REST API + Swagger docs
  - [ ] Machine learning training project (PyTorch)
  - [ ] Docker containerized service
  - [ ] GitHub Actions CI/CD pipeline
- [ ] Each scaffold includes: directory structure, all config files, gitignore, README, basic entry point

### K.2 Dependency Management
- [ ] `add_dependency(package, version?, dev?) → void` — Add to requirements.txt / package.json / Cargo.toml / go.mod
- [ ] `remove_dependency(package) → void` — Remove from manifest + uninstall
- [ ] `install_all_dependencies(project_path) → void` — Install everything in manifest
- [ ] `audit_dependencies() → SecurityReport` — Check for known vulnerabilities (pip audit, npm audit)
- [ ] `generate_requirements_file(project_path) → str` — Auto-detect all imports and produce requirements.txt
- [ ] `lock_dependencies(project_path) → void` — Generate lockfile (requirements.lock, package-lock.json)

### K.3 Configuration File Generation
- [ ] `generate_tsconfig() → str` — TypeScript config for project type
- [ ] `generate_eslintrc() → str` — ESLint config
- [ ] `generate_prettierrc() → str` — Prettier config
- [ ] `generate_dockerfile(project_type) → str` — Multi-stage Dockerfile
- [ ] `generate_docker_compose(services) → str` — docker-compose.yml for multi-service projects
- [ ] `generate_github_actions(project_type) → str` — CI/CD pipeline YAML
- [ ] `generate_gitignore(project_type) → str` — Language-appropriate .gitignore
- [ ] `generate_readme(project_path) → str` — README from project structure + package.json/setup.py

---

## SECTION L — QUALITY & ANALYSIS TOOLS
*The agent must produce code a human would be proud to ship.*

### L.1 Code Quality
- [ ] `lint_file(path) → list[LintIssue]` — Run language-appropriate linter: ruff (Python), eslint (TS/JS), clippy (Rust), staticcheck (Go)
- [ ] `format_file(path) → diff_str` — Auto-format: black/ruff (Python), prettier (TS/JS/HTML/CSS), rustfmt (Rust), gofmt (Go), clang-format (C/C++)
- [ ] `format_all(project_path) → list[diff_str]` — Format entire project
- [ ] `auto_format_after_write(path) → void` — Triggered automatically after every file write
- [ ] `type_check(project_path) → list[TypeError]` — mypy (Python), tsc --noEmit (TypeScript)
- [ ] `get_code_metrics(project_path) → CodeMetrics` — LOC, complexity, duplication ratio, test coverage

### L.2 Security Analysis
- [ ] `scan_secrets(project_path) → list[SecretLeak]` — Detect hardcoded API keys, tokens, passwords using pattern matching
- [ ] `scan_risky_patterns(path) → SecurityReport` — Severity-scored dangerous patterns (see Section J.3)
- [ ] `check_dependency_vulnerabilities(project_path) → list[CVE]` — Known CVEs in current dependencies
- [ ] `check_hardcoded_urls(project_path) → list[str]` — Find all hardcoded localhost URLs (critical for IDE: see TODO_ROADMAP.md §3.1 item 4)
- [ ] `check_encryption_strength(project_path) → list[WeakCryptoWarning]` — Flag XOR ciphers, MD5, SHA1, weak random — prompt upgrade to AES-256-GCM

### L.3 Performance Analysis
- [ ] `profile_function(path, func_name, sample_input) → ProfileReport` — Runtime profiling
- [ ] `estimate_memory_usage(path, func_name) → str` — Static analysis estimate
- [ ] `detect_n_plus_one(path) → list[Issue]` — Detect N+1 query patterns in ORM code
- [ ] `detect_blocking_calls(path) → list[Issue]` — Detect blocking I/O in async functions

---

## SECTION M — GAME DEVELOPMENT TOOLS
*For building games for users who cannot program at all.*

### M.1 Game Engine Detection & Integration
- [ ] `detect_game_engine(project_path) → str` — Godot / Unity / Unreal / Pygame / Phaser / MonoGame
- [ ] `run_godot_export(project_path, platform) → void` — Export Godot project for Windows/macOS/Linux/Web
- [ ] `run_unity_build(project_path, target) → void` — Trigger Unity build from CLI
- [ ] `validate_godot_scene(scene_path) → list[Issue]` — Check scene for broken references, missing scripts
- [ ] `hot_reload_godot() → void` — Trigger Godot editor reload after script change

### M.2 Asset Generation (Non-Code)
- [ ] `generate_placeholder_sprite(name, width, height, color) → path` — Create basic placeholder PNG
- [ ] `generate_tilemap_config(tile_size, grid_w, grid_h) → str` — Tilemap configuration file
- [ ] `describe_asset_needed(description) → AssetSpec` — Translate plain English into asset spec for a human or image-gen tool
- [ ] `generate_game_config(genre, mechanics) → str` — Game configuration JSON from description
- [ ] `generate_level_data(width, height, theme) → str` — Procedural level data structure

### M.3 Game Logic Assistance
- [ ] `generate_state_machine(states, transitions) → str` — Finite state machine code for any language
- [ ] `generate_event_system(events) → str` — Observer/event bus for game events
- [ ] `generate_save_system(data_schema) → str` — Serialization/deserialization save system
- [ ] `generate_collision_handler(entity_types) → str` — Collision response code for entity pairs

---

## SECTION N — MULTI-AGENT FLEET TOOLS
*For parallel autonomous development across 6 specialized agents.*

### N.1 Fleet Orchestration
- [ ] `decompose_task(task, project_path) → FleetPlan` — Break task into role-appropriate subtasks
- [ ] `assign_files_to_roles(fleet_plan) → RoleAssignments` — Assign project files per agent role
- [ ] `stagger_launch(agents, delay_ms) → void` — 3s gap between agent starts to prevent rate-limit storms
- [ ] `broadcast_fleet_event(event) → void` — SSE event to all connected frontends
- [ ] `monitor_all_agents(fleet_id) → FleetStatus` — Aggregate status of all running agents

### N.2 Agent Roles
- [ ] **Lead** role tools: `plan_implementation()`, `delegate_subtask()`, `review_fleet_progress()` — architecture, planning, delegation
- [ ] **Implementer** role tools: `write_feature()`, `implement_function()` — code writing scoped to assigned files
- [ ] **Debugger** role tools: `find_bug()`, `trace_error()`, `apply_fix()` — error-focused, reads compiler output
- [ ] **Tester** role tools: `write_tests()`, `run_tests()`, `report_coverage()` — test files and source
- [ ] **Reviewer** role tools: `review_diff()`, `flag_issues()`, `suggest_improvements()` — read-only quality pass
- [ ] **Documenter** role tools: `write_docs()`, `update_readme()`, `generate_comments()` — docs and comments

### N.3 Inter-Agent Communication (Shared Infrastructure)
- [ ] Shared memory notes accessible to all agents in fleet
- [ ] Shared file system: changes by one agent visible to all
- [ ] Lead plan injected into all other agents' context
- [ ] Fleet event bus for: task started, task completed, error found, file changed
- [ ] `get_shared_context(fleet_id) → str` — Cross-agent knowledge base for current fleet run

---

## SECTION O — LOOP DETECTION & SELF-CORRECTION TOOLS
*The agent must detect when it is stuck and change approach.*

### O.1 Loop Detector
- [ ] `record_action(agent_id, action_hash) → void` — Hash of (file, content) per action
- [ ] `detect_exact_loop(agent_id) → bool` — Same file edited with same content N times
- [ ] `detect_oscillation(agent_id) → bool` — File edited, reverted, re-edited cycle
- [ ] `detect_stall(agent_id) → bool` — No file changes for 5+ iterations
- [ ] `inject_loop_warning(agent_id, context) → str` — Inject "you are in a loop, try a different approach" into next prompt
- [ ] `reset_loop_state(agent_id) → void` — After approach change, reset detection history

### O.2 Progress Evaluation
- [ ] `evaluate_task_complete(task, project_state) → bool` — Did the task succeed? Check: build passes + tests pass + files match spec
- [ ] `build_next_task(current_result, original_goal) → Task` — Generate next task from agent's `nextSteps` field
- [ ] `assess_project_health(project_path) → HealthReport` — Compile errors, test failures, TODO count, dead code
- [ ] `get_remaining_work(project_path, original_task) → list[str]` — What's left to do?

### O.3 Retry Logic
- [ ] Retry loop: max 3 attempts per failed task
- [ ] `assemble_retry_context(task, errors, prev_output, attempt) → str` — Error-focused context for retry (no semantic padding)
- [ ] Each retry: context narrows to specific error + failed attempt; less general code
- [ ] After MAX_RETRIES: `escalate_to_human(task, errors)` — surface to user with plain-English description of the problem
- [ ] On escalation: do NOT continue to dependent tasks; pause fleet

---

## SECTION P — CONTINUOUS / 24-7 MODE TOOLS
*For the agent running autonomously without any human present.*

### P.1 Auto-Task Generation
- [ ] `generate_next_task(project_path) → Task` — When current task completes, generate next from:
  - [ ] If compile errors > 0 → "Fix remaining compile errors"
  - [ ] If test failures > 0 → "Fix failing tests"
  - [ ] If TODO comments found → "Implement [TODO content]"
  - [ ] If dead code found → "Remove dead code in [file]"
  - [ ] If lint errors > threshold → "Fix lint issues in [file]"
  - [ ] If test coverage < threshold → "Add tests for untested functions in [file]"
  - [ ] If documentation missing → "Write documentation for [module]"

### P.2 Safeguards for Unattended Operation
- [ ] `check_iteration_limit(session_id) → bool` — Hard cap at 100 total iterations per session
- [ ] `check_per_task_limit(task_id) → bool` — Hard cap at 50 iterations per task (configurable via `AGENT_MAX_ITERATIONS`)
- [ ] `auto_checkpoint_every_n(n) → void` — Checkpoint every 10 iterations automatically
- [ ] `pause_on_destructive_action(action) → bool` — Flag and require confirmation for: `delete_file`, `delete_dir`, dropping database tables, removing git history
- [ ] `log_all_actions(agent_id, action) → void` — Structured JSONL log of every file operation, command, and LLM call

### P.3 Provider Health Monitoring (24/7)
- [ ] `monitor_provider_health() → void` — Background thread; ping all providers every 5 minutes
- [ ] `mark_provider_dead(provider, reason) → void` — Remove from available pool until next health check
- [ ] `auto_reconnect_provider(provider) → void` — After 5-minute cooldown, retry dead providers
- [ ] `fallthrough_to_next_provider(failed_provider) → str` — On connection error (not rate limit): immediately try next provider, do NOT burn retries on same dead host
  > Critical fix from TODO_ROADMAP.md §3.3 item 8

---

## SECTION Q — PLATFORM & HARDWARE ABSTRACTION TOOLS
*The system must run on everything from a Raspberry Pi to a datacenter.*

### Q.1 Cross-Platform Command Generation
- [ ] `platform_command(action) → str` — Generate OS-appropriate command for:
  - [ ] `install_package`: `pip install` / `npm install` / `cargo add` / `apt install`
  - [ ] `run_script`: `python` / `node` / `cargo run`
  - [ ] `set_env_var`: PowerShell `$env:X=Y` / Bash `export X=Y`
  - [ ] `clear_terminal`: `cls` / `clear`
  - [ ] `kill_process_on_port`: Windows `netstat` / Unix `lsof`
  - [ ] `create_venv`: `python -m venv .venv` + activation for current shell
- [ ] All generated scripts must be tested on Windows, macOS, Linux before shipping

### Q.2 Hardware-Aware Code Generation
- [ ] `generate_cuda_fallback_code(func) → str` — Emit `#ifdef CUDA / else CPU` pattern for compute kernels
- [ ] `detect_compute_grade() → ComputeTier` — Auto-assign: POTATO → DATACENTER based on CPU/GPU/RAM
- [ ] `generate_adaptive_batch_size(available_ram_gb, dtype) → int` — Compute safe batch size for training
- [ ] `generate_multiarch_dockerfile(base_image) → str` — `linux/amd64,linux/arm64,linux/arm/v7` multi-arch build

---

## SECTION R — SECURITY & ENCRYPTION TOOLS
*Correct security implementation for credential storage and API keys.*

### R.1 Credential Management
- [ ] `encrypt_credential(plaintext, key) → str` — AES-256-GCM encryption (NOT XOR — see TODO_ROADMAP.md §3.1 item 1)
- [ ] `decrypt_credential(ciphertext, key) → str` — AES-256-GCM decryption
- [ ] `generate_encryption_key() → str` — Cryptographically random 32-byte key (NOT `Date.now()`-based)
- [ ] `rotate_encryption_key(old_key, new_key, db) → void` — Re-encrypt all stored credentials
- [ ] `validate_encrypt_key_env() → void` — On startup: assert `ENCRYPT_KEY` is in env and is ≥32 bytes; crash with clear error if not

### R.2 Input Validation
- [ ] `validate_request_body(schema, body) → ValidationResult` — Zod/Fastify schema validation on all API endpoints
- [ ] `sanitize_file_path(path, project_root) → str | null` — Prevent path traversal (reject `../` sequences, symlink escapes)
- [ ] `validate_project_path(path) → bool` — Ensure path is within registered project, not system files
- [ ] `csrf_token_generate() → str` — For all state-changing endpoints
- [ ] `csrf_token_validate(token, session) → bool`

### R.3 Secret Scanning
- [ ] `scan_for_hardcoded_secrets(project_path) → list[SecretMatch]` — Patterns:
  - [ ] GitHub PAT: `ghp_[a-zA-Z0-9]{36}`
  - [ ] OpenAI key: `sk-[a-zA-Z0-9]{48}`
  - [ ] AWS key: `AKIA[A-Z0-9]{16}`
  - [ ] Generic API key: `(api[_-]?key|token|secret)\s*=\s*['"]\S{16,}['"]`
  - [ ] Connection strings with passwords
- [ ] `pre_commit_secret_scan(staged_files) → bool` — Block commit if secrets found
- [ ] `generate_env_example(project_path) → str` — Create `.env.example` with placeholder values from detected env vars

---

## SECTION S — NANO SEA INTEGRATION TOOLS
*The agent feeds the Nano Sea and receives inference from it.*

### S.1 Observation Submission
- [ ] `submit_training_observation(input_text, output_text, category) → void` — POST to `/v1/training/observe`
- [ ] Auto-submit observations for every LLM interaction if Nano Sea is healthy
- [ ] `check_nano_sea_health() → bool` — GET `/health` with timeout; cache result for 60s
- [ ] `get_nano_sea_offline_response() → str` — Return cached "offline" message; do NOT propagate connection errors to frontend
  > Critical fix: TODO_ROADMAP.md §3.3 item 9

### S.2 Nano Inference
- [ ] `query_nano(prompt, category?) → str` — Send to Nano Sea `/v1/chat/completions` (OpenAI-compatible)
- [ ] `route_to_best_nano(query) → str` — Use QueryRouterNano to select appropriate nano category
- [ ] `nano_complete_code(prefix) → str` — Code completion via CodeCompletionNano

### S.3 Midwife (Training Data Generator)
- [ ] `start_midwife(config) → void` — Begin synthetic training data generation
- [ ] `stop_midwife() → void` — Halt generation
- [ ] `get_midwife_status() → MidwifeStatus` — Progress, last generated, queue length
- [ ] Auto-start 30s after server boot if Nano Sea is healthy
- [ ] Task types to generate: code completion, search query, query parsing, token generation, embedding, query expansion, routing, result ranking, context assembly, response validation, response formatting, tokenization

---

## SECTION T — LOGGING, MONITORING & OBSERVABILITY TOOLS
*The agent must leave auditable trails of everything it does.*

### T.1 Structured Logging
- [ ] `log_agent_action(agent_id, action_type, detail) → void` — JSONL to `logs/ide_output.jsonl`
- [ ] `log_debug(agent_id, detail) → void` — JSONL to `logs/ide_debug.jsonl`
- [ ] `log_terminal_command(agent_id, cmd, result) → void` — JSONL to `logs/ide_terminal.jsonl`
- [ ] `log_llm_call(model, input_tokens, output_tokens, latency_ms) → void` — Every LLM call logged
- [ ] `log_error(agent_id, error, context) → void` — All errors with full context
- [ ] Thread-safe logging: use mutex/lock around file writes

### T.2 Log Management
- [ ] `rotate_logs(max_size_mb) → void` — Rotate when log files exceed max size
- [ ] `compact_logs(older_than_days) → void` — Compress/summarize old log entries
- [ ] `get_recent_logs(n, type?) → list[LogEntry]` — Last N log entries for any type
- [ ] `search_logs(query, start_time?, end_time?) → list[LogEntry]` — Query past logs

### T.3 Agent Run History
- [ ] `record_agent_run_start(agent_id, task, model) → RunId` — Store in `agent_runs` SQLite table
- [ ] `record_agent_run_end(run_id, outcome, iterations) → void` — Completion record
- [ ] `get_agent_run_history(project_id) → list[AgentRunSummary]` — All past runs for a project
- [ ] `get_run_detail(run_id) → AgentRunDetail` — Full log for a specific run

---

## SECTION U — AMBIGUITY DETECTION & HUMAN ESCALATION TOOLS
*The agent must know when to ask for help before wasting model calls.*

### U.1 Pre-Task Ambiguity Check
- [ ] `check_ambiguities(task, symbol_graph) → list[str]` — Before calling model, check:
  - [ ] Symbol mentioned in task not found in codebase → "Is this a new symbol or a typo?"
  - [ ] Task says "add method" but no class specified → "Which class?"
  - [ ] File path mentioned doesn't exist → "Should I create it?"
  - [ ] Task description < 20 tokens → "Too brief — ambiguity risk"
  - [ ] Multiple interpretations of task possible → list alternatives
- [ ] If ambiguities found: surface to human; do NOT call model

### U.2 Human Escalation
- [ ] `escalate_to_human(task, errors, attempts, suggestions) → void`
  - [ ] Write plain-English summary of what was tried and why it failed
  - [ ] Suggest 2–3 alternative approaches
  - [ ] Pause dependent tasks
  - [ ] Notify frontend via SSE event
- [ ] `resume_after_manual_fix(task_id) → void` — Mark manually fixed; re-check deps; resume
- [ ] `ask_clarification(question) → void` — Mid-task question if critical ambiguity discovered

---

## SECTION V — PROJECT ANALYSIS & HEALTH TOOLS
*The agent must understand any project it is handed, even if it's never seen it before.*

### V.1 Project Discovery
- [ ] `detect_project_type(root) → ProjectType` — Auto-detect: web app, CLI, library, game, ML project, desktop app
- [ ] `detect_languages(root) → list[LanguageStats]` — Languages used, % of codebase each
- [ ] `detect_framework(root) → list[str]` — React, FastAPI, Express, Unity, Godot, etc.
- [ ] `detect_entry_points(root) → list[str]` — `main.py`, `index.ts`, `main.cpp`, etc.
- [ ] `build_project_overview(root) → ProjectOverview` — File count, LOC, dependencies, last modified

### V.2 Codebase Health Dashboard
- [ ] `get_health_report(project_path) → HealthReport`
  - [ ] Build status (pass/fail)
  - [ ] Test pass rate
  - [ ] Compile error count
  - [ ] Lint error count
  - [ ] TODO/FIXME comment count
  - [ ] Dead code symbols
  - [ ] Average function complexity
  - [ ] Test coverage %
  - [ ] Security issues found
  - [ ] Dependency vulnerability count
  - [ ] Most-called symbols (highest change risk)
  - [ ] Files with tree-sitter parse errors (likely malformed)

### V.3 Pre-Task Project Scan
- [ ] Auto-run on project open: `build_index` + `get_health_report` + `detect_project_type`
- [ ] Inject project overview into every agent context prompt
- [ ] Re-run health report after every completed task to update project state

---

## SECTION W — SNAPSHOT, RESTORE & WORKSPACE MANAGEMENT
*Safe experimentation with guaranteed rollback.*

### W.1 Workspace Snapshots
- [ ] `snapshot_workspace(label) → SnapshotId` — Git stash or commit; record task queue state
- [ ] `restore_snapshot(snapshot_id) → void` — Restore files + re-index
- [ ] `list_snapshots(project_id) → list[SnapshotInfo]` — All snapshots
- [ ] `auto_snapshot_before_risky_edit(action) → void` — Trigger before any multi-file refactor
- [ ] `delete_old_snapshots(keep_n) → void` — Clean up old snapshots beyond threshold

### W.2 Preview & Run
- [ ] `start_dev_server(project_path) → ServerHandle` — Start the project's dev server
- [ ] `get_dev_server_url(project_path) → str` — Return URL where the running app can be seen
- [ ] `stop_dev_server(handle) → void` — Stop the server
- [ ] `hot_reload_signal(project_path) → void` — Signal HMR/hot-reload after file changes

---

## SECTION X — USER COMMUNICATION TOOLS (Non-Programmer Experience)
*The user has no idea how to program. Every output must be human-friendly.*

### X.1 Plain-English Output
- [ ] `summarize_changes_for_human(diff_list) → str` — Convert diffs to plain English: "I added a Save button that stores your progress" not "Added onClick handler to SaveButton.tsx"
- [ ] `explain_error_for_human(error) → str` — "The app crashed because a file it expected wasn't there. I've fixed it." not raw stack traces
- [ ] `describe_what_was_built(task, files_changed) → str` — End-of-task summary in plain English
- [ ] `translate_technical_request(natural_language) → Task` — Convert "make it save automatically" into a structured engineering task
- [ ] `suggest_next_steps(project_path) → list[str]` — Plain-English suggestions for what to build next

### X.2 Progress Communication
- [ ] SSE event types (consumed by frontend for display):
  - [ ] `{type: "thinking", detail: "Planning how to add the save feature..."}` — Agent reasoning
  - [ ] `{type: "executing", detail: "Writing SaveManager.ts..."}` — File operations
  - [ ] `{type: "testing", detail: "Running your tests to make sure nothing broke..."}` — Test runs
  - [ ] `{type: "done", summary: "Done! Your game now auto-saves every 30 seconds."}` — Completion
  - [ ] `{type: "question", text: "Should I also save the player's score?"}` — Clarification
  - [ ] `{type: "error_human", text: "I ran into a problem I can't fix automatically. Here's what I tried..."}` — Escalation

---

## SECTION Y — INTEGRATION & ORCHESTRATION TOOLS
*Gluing all the above into a coherent 24/7 agent loop.*

### Y.1 Main Agent Loop
- [ ] `run_agent(project_id, task, model, options) → void`
  - [ ] Pre-flight: `check_ambiguities()` → pause if any
  - [ ] Snapshot: `auto_checkpoint_before_agent_run()`
  - [ ] Phase 0: `detect_os()` + `detect_runtime_versions()` + `detect_build_system()`
  - [ ] Phase 1: `build_index()` + `get_health_report()` + `build_project_overview()`
  - [ ] Main loop (≤ `MAX_ITERATIONS`):
    - [ ] `assemble_context(task)` → token-budgeted input
    - [ ] `can_make_request(model)` → fallback if not
    - [ ] `call_model_for_code(context)` → structured JSON output
    - [ ] Execute actions (create/edit/delete/run)
    - [ ] `auto_format_after_write(path)` for every write
    - [ ] `update_index_for_file(path)` for every write
    - [ ] `get_build_errors()` → auto-fix if enabled (max 3 fix attempts)
    - [ ] `run_tests_for_file()` → if auto-test enabled
    - [ ] `record_action()` → loop detection
    - [ ] `detect_exact_loop()` → inject warning if stuck
    - [ ] `create_checkpoint()` every 10 iterations
    - [ ] `submit_training_observation()` to Nano Sea
    - [ ] `evaluate_task_complete()` → exit if done
    - [ ] `build_next_task()` → continue or stop
  - [ ] On completion: `describe_what_was_built()` → show to human
  - [ ] On failure: `escalate_to_human()` → surface with plain-English description

### Y.2 Fleet Orchestration Loop
- [ ] `run_fleet(project_id, task, agent_count, model) → void`
  - [ ] `decompose_task()` → FleetPlan
  - [ ] `assign_files_to_roles()` → RoleAssignments
  - [ ] Staggered launch: 3s gap per agent (prevents rate-limit storms on shared providers)
  - [ ] Each agent: `run_agent()` with role-specific system prompt + file scope
  - [ ] `monitor_all_agents()` → SSE events to frontend
  - [ ] `broadcast_fleet_event()` for each agent status change
  - [ ] On all complete: `generate_fleet_summary()` → plain-English what each role accomplished

### Y.3 Continuous Mode Loop
- [ ] After task completion: `assess_project_health()` → if issues found → `generate_next_task()`
- [ ] Safeguards: iteration cap, auto-checkpoint, loop detection, escalation protocol
- [ ] User can: pause / resume / stop / inject manual task mid-run

---

## APPENDIX — Tool Priority Build Order
*Build in this order. Each phase is unblocked by the prior one.*

| Phase | Tools | Why First |
|-------|-------|-----------|
| **1** | Section A (File System) | Nothing else works without file I/O |
| **2** | Section D (Terminal) | Build tools require command execution |
| **3** | Section C (Build/Compile) | Agent needs error feedback loop |
| **4** | Section G (LLM Providers) | Agent needs to call models |
| **5** | Section H (Memory/Context) | Agent needs persistent state |
| **6** | Section B (Code Intelligence) | Smart reads instead of full file reads |
| **7** | Section E (Version Control) | Safety net before risky edits |
| **8** | Section O (Loop Detection) | Required for unattended operation |
| **9** | Section F (Testing) | Verification after every change |
| **10** | Section J (Code Generation) | Core agent capability |
| **11** | Section P (Continuous Mode) | 24/7 unattended operation |
| **12** | Section N (Fleet) | Multi-agent parallelism |
| **13** | Sections K, L, M, Q, R | Project templates, quality, games, platform, security |
| **14** | Sections S, T, U, V, W, X, Y | Nano integration, logging, UX, final orchestration |

---

## APPENDIX — auto_rebuilder.py Feature Map
*Every concept extracted and where it lives in this checklist.*

| auto_rebuilder.py concept | Status | Checklist location | New service name |
|--------------------------|--------|--------------------|-----------------|
| `PACKAGE_STRUCTURE` keyword categorization | Extract | Section J.3 | `ModuleCategorizer` |
| `RISKY_CODE_PATTERNS` severity scoring | Extract | Sections D.3, L.2 | `SecurityScanner` |
| `COMPATIBILITY_WEIGHTS` module scoring | Extract | Section J.3 | `ModuleCompatibilityService` |
| `calculate_module_clusters()` DBSCAN clustering | Extract | Section J.3 | `CodebaseClusterEngine` |
| `create_hierarchical_module_structure()` | Extract | Section J.3 | `ProjectOrganizer` |
| `create_launcher()` | Extract | Section K.1 | Part of `scaffold_project()` |
| `create_integrated_codebase()` | Extract | Section J.3 | `CodebaseIntegrator` |
| `NAMESPACE_ISOLATION` conflict detection | Extract | Section J.3 | `NamespaceAnalyzer` |
| `SANDBOX_EXECUTION` + `EXECUTION_TIMEOUT` | Extract | Section D.3 | `SandboxExecutor` |
| `global_state` side-effect detection | Extract | Section J.3 | `SideEffectAnalyzer` |
| `python_version_compatibility` checker | Extract | Section J.3 | Part of `ModuleCompatibilityService` |
| `MODULE_CLUSTERS` / `IMPORT_GRAPH` | Extract | Section B.2 | Merged into symbol graph DB |
| `FUNCTION_SIGNATURES` storage | Extract | Section B.1 | Part of code index SQLite schema |
| `create_README()` auto-generation | Extract | Section K.3 | `generate_readme()` |
| `MAX_PARALLEL_PROCESSES` thread pool | Extract | Section D.1 | Global executor config |
| `CONFLICT_RESOLUTION` rename strategy | Extract | Section J.2 | `rename_symbol_project_wide()` |
| Log file with backup rotation | Extract | Section T.2 | `rotate_logs()` |
| `CHUNK_SIZE` file processing | Extract | Section G.5 | `chunk_content()` |
| `COMMENT_ONLY_PATTERN` non-code detection | Extract | Section B.1 | `parse_file_symbols()` |
| `TfidfVectorizer` text similarity | Extract | Section B.3 | `semantic_search()` embedding layer |
| **`run_rebuilder()` main entry** | ❌ DO NOT USE | N/A — PROTOTYPE ONLY | Replaced entirely by agent loop |

---

*Generated March 2026. Based on: Personal IDE codebase (AGENT_FLEET.md, IDE_ARCHITECTURE.md, LLM_INTEGRATION.md, NANO_TRAINING.md, CONTRIBUTING_*.md, TODO_ROADMAP.md), auto_rebuilder.py prototype analysis, and LLM agent tool design research (SWE-agent, SWE-bench, ReAct).*