// ============================================
// Mega-Prompt Presets for Agent & Fleet Modes
// Refined for 24/7 Autonomous Operation
// ============================================

export interface MegaPrompt {
  id: string;
  name: string;
  description: string;
  projectPath: string;
  prompt: string;
  tags: string[];
  fleetRecommended: boolean;
  recommendedAgentCount: number;
}

export const MEGA_PROMPTS: MegaPrompt[] = [
  {
    id: 'stat-of-shape-full',
    name: 'Stat-Of-Shape — Full Build',
    description: 'Complete autonomous development of the Stat-Of-Shape game. 29,500 files, 15 spec documents, full-stack TypeScript.',
    projectPath: '',  // Set this to your local project path before using
    tags: ['game', 'typescript', 'react', 'full-stack', '24/7'],
    fleetRecommended: true,
    recommendedAgentCount: 4,
    prompt: `# MISSION: Stat-Of-Shape — Autonomous Full-Stack Game Development

## PROJECT
Path: Z:\\ollama_builds\\Stat_of_Shape\\Stat-Of-Shape\\Stat-Of-Shape
Stack: TypeScript, React, Node/Express, Drizzle ORM, Vite, TailwindCSS, shadcn/ui
Scale: ~29,500 files across client/, server/, shared/

---

## STEP 1 — READ BEFORE YOU TOUCH ANYTHING

Start by reading these files in order. Do not skip this step.

1. \`spec/00-MASTER-INDEX.md\` — Index of every game system and which spec covers it
2. \`spec/01-OVERVIEW.md\` — What this game is, who it's for, what the core loop is
3. \`spec/02-ARCHITECTURE.md\` — How the code is structured and why
4. \`spec/11-DATA-SCHEMAS.md\` — All database tables, shared types, and API shapes
5. \`design_guidelines.md\` — Visual and UX rules to follow
6. \`MODULAR_CHEATSHEET.md\` — How modules connect, import rules
7. \`PROCEDURAL_ENGINES_DOCUMENTATION.md\` — How the procedural systems work
8. \`UNIFIED_PROCEDURAL_ENGINE_REFACTOR_PLAN.md\` — Planned refactor, follow this plan

Then before implementing any specific system, read its spec:
- Combat → \`spec/05-COMBAT-SYSTEMS.md\`
- Troops → \`spec/03-TROOP-GENERATOR.md\`
- Player → \`spec/04-PLAYER-SYSTEMS.md\`
- Economy → \`spec/06-ECONOMY-SYSTEMS.md\`
- Missions/Bosses → \`spec/07-MISSION-BOSS-SYSTEMS.md\`
- UI → \`spec/08-UI-SYSTEMS.md\`
- Audio/Visuals → \`spec/10-PROCEDURAL-AUDIO-VISUAL.md\`
- Achievements/Events → \`spec/13-EXTENDED-SYSTEMS.md\`
- Social/Guilds → \`spec/14-SOCIAL-SYSTEMS.md\`
- Monetization → \`spec/09-MONETIZATION.md\`
- API contracts → \`spec/15-SHAPEYAPI-SOS.md\`
- Deployment → \`spec/12-DEPLOYMENT.md\`
Also check \`spec/user_doc/\` and \`spec/user_doc/json/\` for supplementary docs and schemas.

The specs are the source of truth. If a spec says X, implement X. If the spec is silent on a detail, use your best professional judgment and document what you chose.

---

## STEP 2 — ASSESS THE CURRENT STATE

After reading, do a full audit before writing any new code:

\`\`\`
1. Run: npx tsc --noEmit
   → List all TypeScript errors. Fix them before adding new features.

2. Run: npx vitest run
   → List all failing tests. Note which systems are broken.

3. Scan the codebase:
   → For each spec system, check if it exists in code.
   → Mark each system as: MISSING | PARTIAL | BROKEN | COMPLETE

4. Check for TODO/FIXME/HACK comments:
   → Search across all files, list them by severity

5. Check for console.log left in production code:
   → Replace with proper structured logging
\`\`\`

Build a mental task list ordered by severity:
1. Broken (causes crashes or data corruption)
2. Missing but required by spec
3. Incomplete implementations (stub functions, placeholder returns)
4. Edge cases not handled
5. Code quality issues (files over 500 lines, missing error handling, no logging)

---

## STEP 3 — WORK RULES (follow every single time)

### Before touching any file:
- Read it first. Never edit code you haven't read.
- Use the code indexer to find the exact function/class you need to change.
- Use the relationship graph to check what else imports this file — your change may cascade.
- Create a checkpoint: this gives you a rollback point if something breaks.

### While writing code:
- No file over 500 lines. If a file is getting long, split it into focused modules.
- No \`any\` types in TypeScript — use proper types, generics, or discriminated unions.
- All shared types go in \`shared/\` — never duplicate a type in both client and server.
- All server routes must validate their inputs with Zod before trusting them.
- Every function that can fail must handle that failure — no silent errors, no empty catch blocks.
- Add structured logging for every significant event (game actions, API calls, errors, state changes).
- Cover edge cases: what happens if the user is offline? If the data is empty? If a number is zero or negative?

### After changing a file:
- Run \`npx tsc --noEmit\` — fix any new type errors before moving on.
- Run the relevant test if one exists: \`npx vitest run path/to/test.ts\`
- If you added a new API endpoint, test it with a command: \`/api/preview/run-command\`
- Log what you changed and why in your editLog output.

### If you get stuck on the same error 3 times:
- Stop repeating the same fix. Use web search to find the real solution.
- Try a completely different approach.
- Check if the problem is actually in a different file than where the error shows up.

---

## STEP 4 — QUALITY STANDARDS

Every piece of code you write must meet these standards:

**Correctness** — It does exactly what the spec says. No shortcuts, no "close enough."

**Robustness** — It handles bad inputs, network failures, empty states, and concurrent users gracefully. Users should never see a raw crash or an unhandled error.

**Performance** — This game runs on mobile browsers. Keep bundle sizes small. Lazy-load anything that isn't needed on first load. Database queries need indexes. No N+1 query patterns.

**Maintainability** — Future developers (including you, later) should be able to read and understand this code. Functions should do one thing. Files should have a clear single purpose. Use the names from the spec for consistency.

**Testability** — Write tests alongside features. A feature with no test is a feature waiting to break silently.

**Security** — Never trust client input. Sanitize and validate everything on the server. Never expose internal error details to the client.

---

## STEP 5 — PRIORITY ORDER (what to build first)

Work through systems in this order. Don't start the next system until the current one compiles, passes its tests, and has no critical bugs.

1. **Fix all existing errors first** — broken foundation = everything built on top breaks
2. **Shared types & database schemas** (spec 11) — everything depends on these
3. **Core architecture cleanup** (spec 02) — module structure, import rules
4. **Troop generation** (spec 03) — the core mechanic everything else builds on
5. **Player systems** (spec 04) — progression, inventory, stats
6. **Combat system** (spec 05) — turn-based engine, formation logic, damage calc
7. **Economy** (spec 06) — currency flows, crafting, trading
8. **Missions & bosses** (spec 07) — content generation, encounter logic
9. **UI** (spec 08) — HUD, menus, accessibility, responsive layout
10. **Extended systems** (spec 13, 14) — achievements, social, leaderboards
11. **Audio & visuals** (spec 10) — procedural sound, particle effects
12. **Monetization** (spec 09) — IAP, battle pass, cosmetics
13. **Deployment** (spec 12) — CI/CD, monitoring, production hardening

After finishing each system: create a checkpoint, run the full test suite, then move to the next.

---

## STEP 6 — CONTINUOUS MODE BEHAVIOR

You are running 24/7. When you finish one task, immediately pick the next one.

- Keep a running list of what's done, what's in progress, and what's next.
- If a task is blocked (waiting on another system to exist first), note the dependency and move to the next unblocked task.
- If you finish everything on the list, go back to the beginning and look for things to improve: test coverage, performance, edge cases, documentation.
- Never idle. There is always something to improve in a codebase this size.

---

## TOOLS YOU HAVE — USE ALL OF THEM

- **Code indexer** — find any symbol, function, or class instantly without reading every file
- **Relationship graph** — see what imports what before making changes that could cascade
- **Checkpoints** — save your progress before risky changes, roll back if needed
- **Terminal** — run builds, tests, lint, migrations, or any shell command
- **Web search** — if you're stuck on a problem, look it up
- **Preview runner** — test API endpoints and scripts without leaving the agent
- **Chunking pipeline** — handles files too large to fit in context automatically
- **Memory** — notes you write persist across sessions, use them to track your task list

---

## START NOW

Do not ask for clarification. Do not wait for approval. Begin with Step 1, proceed through Steps 2–6, and keep working until everything in the spec is implemented, tested, and passing.`,
  },
  {
    id: 'stat-of-shape-bugfix',
    name: 'Stat-Of-Shape — Bug Sweep',
    description: 'Find and fix all compilation errors, runtime bugs, and test failures.',
    projectPath: '',  // Set this to your local project path before using
    tags: ['bugfix', 'typescript', 'debugging'],
    fleetRecommended: false,
    recommendedAgentCount: 2,
    prompt: `# MISSION: Bug Sweep — Find & Fix All Issues

## PROJECT
Z:\\ollama_builds\\Stat_of_Shape\\Stat-Of-Shape\\Stat-Of-Shape

## OBJECTIVE
Systematically find and fix ALL compilation errors, type errors, runtime bugs, and test failures in the codebase.

## PROTOCOL
1. Run \`npx tsc --noEmit 2>&1 | head -100\` to get current TypeScript errors
2. For each error, read the file, understand the context, fix it surgically
3. After fixing, re-run tsc to confirm the error is resolved
4. Move to the next error
5. After all type errors are fixed, run tests: \`npx vitest run\`
6. Fix any test failures
7. Check for runtime errors by starting the dev server and hitting key endpoints
8. Create checkpoints after every 10 fixes

## RULES
- Fix the ROOT CAUSE, not symptoms
- Don't introduce new bugs — read surrounding code before editing
- Use the relationship graph to check for cascading impacts
- If a fix requires a design change, document it
- Keep edits surgical — never rewrite files

GO. Fix everything.`,
  },
  {
    id: 'stat-of-shape-fleet-impl',
    name: 'Stat-Of-Shape — Fleet Implementation Sprint',
    description: 'Multi-agent team sprint: lead decomposes, implementers build, testers verify.',
    projectPath: '',  // Set this to your local project path before using
    tags: ['fleet', 'implementation', 'sprint'],
    fleetRecommended: true,
    recommendedAgentCount: 4,
    prompt: `# FLEET MISSION: Implementation Sprint

## PROJECT
Z:\\ollama_builds\\Stat_of_Shape\\Stat-Of-Shape\\Stat-Of-Shape

## SPEC LOCATION
All specs in \`spec/\` folder (00 through 15). Read \`00-MASTER-INDEX.md\` first.

## FLEET COORDINATION RULES
- **LEAD**: Read all specs, identify unimplemented systems, create task breakdown, assign work to implementers, review completed work
- **IMPLEMENTERS**: Build assigned systems following the spec exactly. Use surgical edits. Keep files under 500 lines. Run tsc after changes.
- **TESTER**: Write and run tests for each completed system. Report failures back to implementers via fleet messaging.
- **REVIEWER**: After each system is implemented+tested, review for code quality, type safety, performance, and spec compliance.

## PRIORITY ORDER
1. Shared types and schemas (spec 11) — MUST be done first, all agents depend on this
2. Server API routes for core systems
3. Client components for core systems  
4. Integration between client ↔ server ↔ database

## CRITICAL RULES
- NO file conflicts — each agent owns their assigned files exclusively
- Communicate via fleet messaging when you need a dependency from another agent
- Create checkpoints before AND after major changes
- Every function must have JSDoc comments
- All API routes must have Zod validation
- Run \`npx tsc --noEmit\` frequently — catch errors early

LAUNCH. Coordinate as a team. Build fast, build right.`,
  },
];

export function getMegaPromptById(id: string): MegaPrompt | undefined {
  return MEGA_PROMPTS.find(p => p.id === id);
}

export function getMegaPromptsForProject(projectPath: string): MegaPrompt[] {
  return MEGA_PROMPTS.filter(p =>
    p.projectPath.toLowerCase() === projectPath.toLowerCase()
  );
}
