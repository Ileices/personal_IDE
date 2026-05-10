# Assistant Boundaries, Change Brokerage, and Memory Provenance

This discussion spins out from a thoughtful comment by @musaabhasan on Discussion #2:
https://github.com/Ileices/personal_IDE/discussions/2#discussioncomment-16856079

Credit to @musaabhasan for calling out a core architectural requirement clearly: the system needs an explicit boundary between what the assistant may inspect and what it may change, plus durable provenance for memory and instructions.

## Why this deserves its own discussion

That comment is not a minor UX note. It points at a structural trust boundary for the entire product:

- read context should be broad and low-risk
- plans should be explicit before mutation
- writes and shell execution should go through a brokered approval layer
- action traces should be durable and reviewable
- memory should distinguish facts from instructions and store source, time, and confidence

That is close to the difference between a helpful coding tool and a system that becomes hard to audit once it starts acting autonomously.

## Current codebase relevance

This repo already has several pieces that relate to this idea:

- security hardening and tool policy discussions already exist
- the help registry documents approval, agent, and GitHub workflow concepts
- the forensic database / project state / suggested jobs architecture is already aiming at traceability
- the community system itself is turning GitHub discussions into implementation inputs

What is missing is a tighter, explicit contract tying these pieces together.

## Engineering direction from this thread

### 1. Separate inspect vs mutate permissions
Read-only actions should be cheap and broadly available. Mutating actions should require a clearer path:

- target files
- intended command list
- expected validation
- rollback or containment notes

### 2. Introduce brokered change execution
Edits and shell commands should route through a broker layer with policy classes such as:

- read-only auto-allow
- write-with-validation
- destructive-blocked-by-default
- explicit user override for risky operations

### 3. Record a durable action trace
Each execution unit should retain:

- prompt
- interpreted plan
- files touched
- diff summary
- commands run
- exit codes
- validation artifacts
- approval state

### 4. Add provenance to memory
Memory entries should not be treated as one undifferentiated blob. We need typed memory records:

- fact
- instruction
- preference
- temporary note
- observation

Each should include source, timestamp, and confidence.

### 5. Sync code, help, and discussions
If this design gets implemented, the help registry should link directly to:

- this discussion
- the originating comment
- the implementation discussion(s)
- the concrete code path

That keeps roadmap, code, and public development narrative aligned.

## Why this matters for Personal IDE specifically

Personal IDE is not just a chat wrapper. It is trying to become a self-improving agentic environment. That raises the bar on traceability. The more autonomous the system becomes, the more explicit its mutation boundaries and memory provenance have to be.

Fun Fact: the same repo now contains both a GitHub community engine and a forensic/internal architecture vocabulary for devtags, plantags, buildtags, and crawl-based trace systems. That means the repo is already halfway toward the audit model this discussion is asking for — it just needs the connection points tightened.

## Follow-up intent

This thread will track:

- boundary model design
- brokered execution requirements
- memory provenance model
- help-registry sync points
- implementation PRs / commits as they land
