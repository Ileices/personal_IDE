import type { ActivityView } from '../components/ActivityBar';
import type { EditorTab } from '../components/EditorArea';

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  details: string[];
  tags?: string[];
  status?: 'active' | 'coming_soon';
}

export interface HelpAnchor {
  id: string;
  label: string;
  quickTip: string;
  sectionId: string;
  view?: ActivityView;
  tab?: EditorTab;
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'overview',
    title: 'Workspace Overview',
    summary: 'How the shell works: activity rail, side panel, editor tabs, terminal, and status bar.',
    tags: ['shell', 'navigation', 'workspace', 'studio', 'project-factory'],
    status: 'active',
    details: [
      'The app uses a VS Code style shell: Activity Bar on the left, contextual Side Panel, and a tabbed Editor Area.',
      'Studio view is full-width and replaces the normal side + editor split while active.',
      'Terminal can be collapsed and resized; status bar reflects chat mode and agent runtime state.',
      'The shell has multiple agent classes: THE GOD FACTORY Self-Improvement Agent, Chat Agent, Agent Agent-Loop (Project Factory), Fleet Agents, and persistent crawler agents (Blame, Gap Analysis, Project State, Suggested Jobs).',
      'Open the Agent Architecture section for role-by-role behavior, memory-scope rules, and current wiring notes.'
    ]
  },
  {
    id: 'agent-architecture',
    title: 'Agent Architecture and Memory Scopes',
    summary: 'Deep dive into agent roles, interaction modes, sub-agents, crawlers, and memory boundaries.',
    tags: ['agents', 'memory', 'scopes', 'tiers', 'authority', 'unified-spec'],
    status: 'active',
    details: [
      'THE GOD FACTORY Self-Improvement Agent (Studio view): highest-authority IDE architect with conversational control plus background scan behavior (notifications, idle suggestions, codebase and model health).',
      'Chat Agent (Chat tab): conversational interaction path for Ask/Edit/Plan behavior in the main chat workflow.',
      'Agent Agent-Loop (Project Factory): autonomous execution loop for project implementation and orchestration.',
      'Fleet Agents: parallel workers under Project Factory loop control with per-agent pause/resume/stop operations.',
      'Persistent crawler systems: Blame Crawler, Gap Analysis Agent, Project State Crawler, Suggested Jobs Crawler, plus forensic and regression-related sub-agents.',
      'Documented memory scopes (Unified spec): TOTAL for God Factory, Chat Agent, Blame Crawler, and Help Agent; SELF/CUSTOM/PRESET constraints for Agent Agent-Loop and Fleet Agents.',
      'Mode mapping in current UI: Ask/Edit/Plan = Chat Agent interaction behavior; Agent = Agent Agent-Loop behavior; Studio = THE GOD FACTORY screen.',
      '⚠ NOTE (spec vs current UI): Unified spec defines six dedicated interaction memory print areas (Ask/Edit/Plan Chat + Ask/Edit/Plan Agent Loop). Current frontend exposes mode switching and telemetry, but those six memory surfaces are not all exposed as separate first-class tabs.',
      '⚠ NOTE (help agent): Unified spec defines a dedicated Help Agent. Current help UI is registry-driven documentation + jump navigation; no separate Help Agent conversation surface is exposed.',
      '⚠ NOTE (pre-edit protocol visibility): Unified spec requires Memory Crawler + Project Description Crawler + Project State Crawler before writes. Related subsystems are present, but that enforcement chain is not uniformly surfaced in all user-facing controls.'
    ]
  },
  {
    id: 'activity-bar',
    title: 'Activity Bar',
    summary: 'Left rail navigation for every major subsystem.',
    details: [
      'Each icon switches Side Panel content to a dedicated subsystem.',
      'Studio opens THE GOD FACTORY in full-width mode.',
      'Fleet and Nano icons can show live badge counters when agents are running.',
      'Bottom group holds Help, Providers, and Security icons that are always visible regardless of scroll position.'
    ]
  },
  {
    id: 'top-bar',
    title: 'Top Bar',
    summary: 'Project identity, mode switching, model picker, provider controls, and account menu.',
    details: [
      'Mode buttons switch ask/edit/plan/agent chat behavior. "Agent" mode is the full autonomous execution loop.',
      'Model dropdown controls the selected model used by chat and agent flows.',
      'Nano Sea, Midwife, and Provider buttons open focused control modals.',
      'User menu at the far right shows account details and the Sign Out action.'
    ]
  },
  {
    id: 'explorer',
    title: 'Explorer',
    summary: 'Project list and file tree navigation.',
    details: [
      'Use + New to create a project quickly from the shell header.',
      'Project panel controls active project context used by chat and agent routes.',
      'File browser shows the directory tree and opens files in the Code tab editor.',
      'Right-click any file to copy path, copy name, or reveal in system Explorer.',
      '⚠ NOTE: FileBrowser defines its own API_BASE constant instead of importing from config — if VITE_API_BASE env is not set or differs, file reveal actions may call the wrong server address.'
    ]
  },
  {
    id: 'chat',
    title: 'Chat',
    summary: 'Conversation UI with streaming responses and conversation controls.',
    details: [
      'Enter sends; Shift+Enter inserts newline.',
      'New Chat starts a clean conversation while preserving existing history in sidebar.',
      'Copy Chat exports full conversation text for external sharing or notes.',
      'Conversation Sidebar (left of chat) lets you rename, switch, or delete past conversations.',
      'Conversations are stored per-project in the database and loaded by project ID.'
    ]
  },
  {
    id: 'editor',
    title: 'Editor Area',
    summary: 'Tabbed main workspace for code, chat, agent, and preview workflows.',
    details: [
      'Tabs are mounted persistently and hidden when inactive so state is preserved.',
      'Code tab shows Monaco editor with file tabs and Save button; the active file is driven by the File Browser.',
      'Build & Run auto-detects startup path and opens Preview on success.',
      'Preview stop toggles from the same control while running.',
      'Preview tab hosts an iframe panel with URL bar and console output strip.',
      '⚠ NOTE (Preview sandbox): The preview iframe is sandboxed without allow-same-origin. Apps that depend on shared cookies/localStorage/session origin behavior may not work exactly like a normal browser tab.',
      '⚠ NOTE (Preview console capture): Console postMessage capture accepts only localhost origins. If your preview runs on a remote host or non-local domain, in-panel console logs will not appear.'
    ]
  },
  {
    id: 'terminal',
    title: 'Terminal',
    summary: 'Dual-mode integrated terminal — user shell and agent shell tabs.',
    details: [
      'The terminal sits at the bottom of the editor area and can be collapsed.',
      'Multiple sessions (tabs) are supported; each session maps to a server-side PTY process.',
      'User shell and LLM agent shell are separate sessions — the agent shell is controlled by the loop, not the user.',
      'Output streams: green = stdout, red = stderr, accent = stdin echo.',
      '⚠ NOTE: TerminalPanel uses the VITE_API_URL environment variable, which is different from the VITE_API_BASE used by the rest of the app. If only one env is set, terminal streaming may fail or point to the wrong server port.'
    ]
  },
  {
    id: 'agent',
    title: 'Agent / Project Factory',
    summary: 'Autonomous task execution loop with fleet mode, milestone tracking, and quality trend.',
    details: [
      'Agent view (Project Factory) is the single-run loop controller. Set a task prompt, choose a model and strategy, then Start.',
      'Fleet Mode toggle enables multi-agent parallel execution; fleet agents are spawned from the same panel.',
      'Mega Prompts panel provides curated preset task prompts for common workflows (games, SaaS, bots, etc).',
      'Project Factory Wizard (rocket button) guides you through template selection, project details, and prompt before launching.',
      'Milestone Panel shows structured work items extracted from each loop iteration.',
      'Quality Trend shows per-iteration build/test/lint badges so you can see health over time.',
      'Agent Settings sub-panel controls verbosity level, max iterations, quality gate strictness, and corpus manifesto.',
      'Corpus Ingest and Silicon Factory reindex buttons are in Agent Settings under Advanced.',
      '⚠ NOTE (Fleet interactive messages): sendFleetMessage and answerQuestion callbacks in FleetPanel are currently empty stubs. Fleet agents cannot receive mid-run interactive messages or answer questions from the UI — this feature is not yet wired.'
    ]
  },
  {
    id: 'fleet',
    title: 'Fleet Panel',
    summary: 'Live status and per-agent controls for multi-agent fleet runs.',
    details: [
      'Fleet panel appears in the side panel when the fleet view is active.',
      'Shows each agent with its current status, model, and role.',
      'Pause / Resume / Stop controls per-agent.',
      'To start a fleet run, use the "Fleet Mode" toggle inside the Agent (Project Factory) panel.',
      '⚠ NOTE: Interactive fleet messaging (sending messages to agents mid-run or answering their questions) is not yet functional — those callback props are empty stubs in FleetPanel.tsx.'
    ]
  },
  {
    id: 'the-god-factory',
    title: 'THE GOD FACTORY',
    summary: 'Full-codebase AI architect with file read/write, terminal execution, and auto-backup.',
    details: [
      'Accessed via the Sparkles icon (Studio) in the Activity Bar — opens in full-width mode.',
      'This agent can read any file, write any file, run terminal commands, build, test, and fix the IDE itself.',
      'Auto-backup: before any edit, a backup is taken and the backup path is shown in the message.',
      'Prompt History tracks all past prompts and allows reuse with search.',
      'File Selector allows attaching specific files as context for the next message.',
      'Right panel (Intel Panel) shows: Notifications, Suggested Jobs, Codebase Health snapshot, and Brainstorm Pad.',
      'The Subsystem toggles in the right panel control which background agents run (blame crawler, state crawler, etc).',
      'This is the canonical studio agent surface. The older CopilotStudio component exists in source code but is not wired into the current app shell.',
      '⚠ NOTE (Right Panel): Idle Suggestions and Brainstorm Pad in GodFactoryRightPanel depend on /api/god-factory/idle-suggestions and /api/god-factory/loop/status — these endpoints require the background self-improvement loop to be running. If the loop is off, those sections will be empty.',
      '⚠ NOTE (TheGodFactory history): Prompt history and conversation are stored in localStorage. Very large conversations may hit browser storage limits and older items will be silently dropped (the store trims to 200 history items and 100 messages).'
    ]
  },
  {
    id: 'nano-sea',
    title: 'Nano Sea',
    summary: 'Local nano model training pool: process control, node status, training, pool, peers, and logs.',
    details: [
      'Opened via the Waves icon in the Activity Bar or the Nano button in the Top Bar.',
      'Process Control tab: start/stop/restart the Python nano-sea server process.',
      'Node Status tab: current health, uptime, PID, and resource readings.',
      'Training tab: configure training runs, set loss targets, and view training progress.',
      'Pool tab: view all active nanos with their step counts, loss values, and status.',
      'Peers tab: mesh networking peer connections for distributed training.',
      'Logs tab: live streaming log output from the nano-sea Python process.',
      'Nano Sea must be running for the Nano badge count, NanoLiaison devtags, and model routing to local nano models to function.'
    ]
  },
  {
    id: 'midwife',
    title: 'Midwife Trainer',
    summary: 'Bird-feeding trainer that sends structured prompts to models to improve response quality.',
    details: [
      'Opened via the Bird icon or the Midwife button in the Top Bar.',
      'Tasks tab: view and manage scheduled training tasks with enable/disable toggles.',
      'Config tab: set the feeding model, interval, max tokens, and concurrency.',
      'History tab: browse past feeding runs and their outputs.',
      'Exclude Broken on Start: skips models flagged as failed before running a feed cycle.',
      'Feeding sessions run on the server side and are triggered manually or on schedule.'
    ]
  },
  {
    id: 'memory-panel',
    title: 'Memory Panel',
    summary: 'Per-project memory notes: create, search, edit, and tag knowledge for agent context.',
    tags: ['memory', 'notes', 'filters', 'context', 'project'],
    status: 'active',
    details: [
      'Memory notes are stored in the database scoped to the active project.',
      'Access Mode selector controls which sources are included in agent context injection (total, user notes only, agent logs only, custom).',
      'Preset selector offers quick filters: recent decisions, user notes, architecture notes, etc.',
      'Notes support title, content, tags, category, and an importance score (0–100).',
      'Memory refreshes every 15 seconds automatically when the panel is visible.',
      'Memory is injected into agent runs as context — high-importance notes have priority.'
    ]
  },
  {
    id: 'checkpoints',
    title: 'Checkpoints',
    summary: 'Project versioning snapshots: create named checkpoints and roll back to them.',
    details: [
      'Checkpoints are database-backed snapshots, not git commits.',
      'Each checkpoint stores a description, file list snapshot, and iteration number.',
      'Rollback rewrites files back to the state captured at that checkpoint.',
      '⚠ NOTE: The rollback confirmation uses browser native confirm() dialog — this may be blocked by popup blockers or browser security settings in some environments.',
      'Checkpoints are scoped to the active project ID and require the server to be running.'
    ]
  },
  {
    id: 'ai-systems',
    title: 'AI Systems',
    summary: 'Providers, model strategy, rate limits, BLAME, Nano Sea, and Midwife.',
    details: [
      'Provider Settings configures credentials and endpoints for all supported AI providers.',
      'Model Strategy controls the primary model, fallback chain order, and strategy preset (Balanced, Reasoning First, Local-Only, etc).',
      'Rate Limit Dashboard shows per-model request/minute, request/day, and concurrent usage gauges.',
      'BLAME tracks which model produced each output and scores quality per model/mode.',
      'Nano Sea and Midwife are local training systems accessible from this section or the Top Bar.',
      'Failed Models tab in Provider Settings shows models that have failed, their reason code, and how to fix them.'
    ]
  },
  {
    id: 'provider-settings',
    title: 'Provider Settings',
    summary: 'Configure API keys, test connectivity, and manage failed models.',
    details: [
      'Each provider row shows enabled state, connection status, and setup link.',
      'Click the key icon to enter or update an API key — keys are stored in the local database.',
      'Test button verifies live connectivity to each provider.',
      'Bulk Test All button runs a live connectivity sweep across all configured providers.',
      'Ollama Setup wizard is embedded — launch it from the Ollama provider row.',
      'GitHub PAT field allows entering a GitHub Personal Access Token for repo access features.',
      'Failed Models tab lists models that errored out with classification (not_configured, rate_limited, discontinued, etc) and action buttons.',
      'Nano status card shows live Nano Sea connection health from within Provider Settings.'
    ]
  },
  {
    id: 'model-strategy',
    title: 'Model Strategy',
    summary: 'Primary model, fallback chain, and strategy preset configuration.',
    details: [
      'Primary Model picker selects the first-choice model for all workflows.',
      'Fallback Pool is an ordered list of models tried in sequence if the primary fails.',
      'Strategy Presets: Full-Stack Balanced, Reasoning First, Specialized Boost, Local-Only 24/7, Cloud Burst + Local Sustain.',
      'Cooldown labels show when a model is rate-limited, backing off, or dead.',
      'Persists to /api/model-strategy on save; loaded automatically on panel open.'
    ]
  },
  {
    id: 'rate-limits',
    title: 'Rate Limit Dashboard',
    summary: 'Per-model API usage gauges with minute/day/concurrent counters.',
    details: [
      'Refreshes automatically every 30 seconds.',
      'Green bars mean capacity available; yellow means <50% remaining; red means <20%.',
      'Dead models count shown in the header badge when any model is in hard cooldown.',
      'Use this panel to identify which providers are getting throttled during heavy agent runs.'
    ]
  },
  {
    id: 'blame',
    title: 'BLAME — Model Quality Tracking',
    summary: '7-tab model attribution system: Models, Records, Quality, Criticisms, Successes, Jobs, Analysis.',
    tags: ['blame', 'quality', 'attribution', 'models', 'forensic'],
    status: 'active',
    details: [
      'Models tab: aggregate stats per model — avg quality, success rate, tag conformance, hallucination rate.',
      'Records tab: individual blame entries — which model produced what output in which run.',
      'Quality tab: quality score records per model/mode combination.',
      'Criticisms tab: tool criticism records — agent-flagged issues with model outputs.',
      'Successes tab: agent-flagged successes — used to reinforce good model behavior.',
      'Jobs tab: suggested remediation jobs generated by the blame crawler.',
      'Analysis tab: aggregate patterns, worst/best performing models, drift signals.',
      'Run Blame Crawler button triggers a fresh crawl that scores recent outputs.',
      'Auto-Update toggle keeps the panel polling every few seconds while open.'
    ]
  },
  {
    id: 'local-models',
    title: 'Local Model Catalog',
    summary: 'Browse, filter, and download Ollama models — general, coding, reasoning, vision, uncensored.',
    details: [
      'Full catalog of available Ollama models organized by category.',
      'Filter by category (general, coding, reasoning, vision, uncensored, diffusion, embedding, specialized).',
      'Search by name or description.',
      'Each model card shows size, parameter count, context window, and capability tags.',
      'Download button pulls the model via Ollama pull — requires Ollama to be running locally.',
      'Installed models list shows models already downloaded with size on disk.',
      'Ollama Setup wizard provides guided install/diagnose if Ollama is not yet running.'
    ]
  },
  {
    id: 'openclaw',
    title: 'OpenClaw Skill Browser',
    summary: 'Skill registry browser, executor, and workflow builder for the OpenClaw ecosystem.',
    details: [
      'Skills tab: browse all registered skills by category (quality, testing, documentation, security, refactoring, performance, dependencies).',
      'Workflows tab: view and run saved multi-step skill workflows.',
      'Log tab: execution history and output for recently run skills.',
      'Each skill card shows inputs, description, and a Run button.',
      '⚠ NOTE: OpenClawPanel depends on the openclawStore which calls /api/openclaw/* backend endpoints. If the OpenClaw route is not registered in the server, all tabs will show empty results. Verify that the server exposes this route before relying on this panel.'
    ]
  },
  {
    id: 'advanced-panels',
    title: 'Advanced Panels',
    summary: 'Tags, forensic records, gap analysis, project-state crawler, and suggested jobs.',
    details: [
      'These views expose system-level observability and autonomous planning telemetry.',
      'Most are read-heavy dashboards with action controls to trigger rescans and jobs.',
      'Use Help links to jump directly back to each panel entry point.',
      '⚠ NOTE: Tag Registry, Forensic Panel, and Gap Analysis Panel hardcode http://localhost:3001 as their API base instead of using the shared API_BASE config. If the server runs on a different port or hostname, these three panels will silently fail to load data.',
      '⚠ NOTE: Suggested Jobs and Project State Crawler use relative /api paths that depend on a Vite dev proxy. In production builds or when served from a different origin, these requests will fail unless the proxy or CORS config handles them.'
    ]
  },
  {
    id: 'tag-registry',
    title: 'Tag Registry',
    summary: 'Browse and manage devtags, plantags, and buildtags with stats and relationship rules.',
    details: [
      'Stats tab: aggregate counts — total/active/dead devtags, pending/done/blocked plantags, committed/failed buildtags.',
      'Devtags tab: searchable list of all development state tags with status filter.',
      'Plantags tab: planning objective tags — pending, in_progress, done, blocked.',
      'Buildtags tab: committed build state markers — committed, failed, reverted.',
      'Rules tab: tag relationship and dependency rules that govern valid tag transitions.',
      '⚠ NOTE: This panel hardcodes http://localhost:3001/api/tags. If the server runs on a non-3001 port, data will not load. Use the server console to confirm the active port.'
    ]
  },
  {
    id: 'forensic',
    title: 'Forensic Database',
    summary: '11-tab audit view: regressions, conflicts, dead tags, diff failures, integration, commits, nano, spawn, systemic, tag-mismatches.',
    details: [
      'Summary tab: aggregate counts across all forensic categories.',
      'Regressions tab: quality regressions detected by the blame crawler.',
      'Conflicts tab: concurrent agent write conflicts and resolution records.',
      'Dead Tags tab: devtags that were orphaned or never resolved.',
      'Diff Failures tab: patch application failures during agent runs.',
      'Integration tab: cross-agent integration failures and handshake errors.',
      'Commits tab: version commit history from agent build cycles.',
      'Nano tab: nano anomalies and absularity events from the Nano Liaison.',
      'Spawn tab: agent spawn violations and guard condition failures.',
      'Systemic tab: pattern-level regressions detected across multiple cycles.',
      'Tag Mismatches tab: devtag/buildtag mismatches between agent outputs and registry state.',
      '⚠ NOTE: This panel hardcodes http://localhost:3001/api/forensic. Data will not load if the server port differs.'
    ]
  },
  {
    id: 'gap-analysis',
    title: 'Gap Analysis',
    summary: '8-tab coverage and debt analysis: summary, coverage, patterns, debt, tag-system, performance, tools, reports.',
    details: [
      'Summary tab: top-level coverage and debt signals across the codebase.',
      'Coverage tab: per-file and per-function test coverage breakdown.',
      'Patterns tab: anti-pattern and code smell detection results.',
      'Debt tab: technical debt items with severity and estimated effort.',
      'Tag System tab: devtag coverage health — which tags have no associated code.',
      'Performance tab: hot-path and throughput analysis results.',
      'Tools tab: interactive tool runner for triggering specific gap analysis scans.',
      'Reports tab: historical gap analysis report exports.',
      '⚠ NOTE: This panel hardcodes http://localhost:3001/api/gap. Data will not load if the server port differs.'
    ]
  },
  {
    id: 'project-state-crawler',
    title: 'Project State Crawler',
    summary: '6-tab devtag extraction and drift detection: snapshots, drift, devtags, skipped, languages, memory.',
    tags: ['crawler', 'ground-truth', 'drift', 'devtags', 'waiting-state', 'forensic'],
    status: 'active',
    details: [
      'Snapshots tab: list of crawler runs with file counts, drift counts, and duration.',
      'Drift Events tab: detected tag drift — registry surplus, registry deficit, content drift, location drift.',
      'Devtags tab: all devtags extracted from the last snapshot with file and line mapping.',
      'Skipped Files tab: files excluded from the crawl and why (too large, binary, etc).',
      'Languages tab: language distribution across the crawled codebase.',
      'Memory tab: crawler memory notes and context from past runs.',
      'Run Crawler button triggers a new crawl against the active project root.',
      '⚠ NOTE: This panel uses relative /api/project-state-crawler paths which depend on a Vite dev proxy. In production or standalone deployments without proxying, these requests may fail with 404s.'
    ]
  },
  {
    id: 'suggested-jobs',
    title: 'Suggested Jobs',
    summary: '5-tab codebase review and implementation pipeline: jobs, detail, sandbox, crawler, stats.',
    tags: ['jobs', 'pipeline', 'sandbox', 'atomic-steps', 'implementation'],
    status: 'active',
    details: [
      'Jobs tab: list of all suggested jobs with priority, category, and status filters.',
      'Detail tab: full job detail including atomic steps, required buildtags, and affected devtags.',
      'Sandbox tab: sandbox execution runs for the selected job — cycles used, stage, and decision.',
      'Crawler tab: crawler state — mode, last blame run, cycle count, and protocol.',
      'Stats tab: aggregate job counts by priority and status.',
      'Actions: Archive, Mark In-Progress, Mark Implementing, Merge Jobs (batch select).',
      '⚠ NOTE: This panel uses relative /api/suggested-jobs paths. In production builds without a reverse proxy mapping these routes, all data fetches will fail.'
    ]
  },
  {
    id: 'security',
    title: 'Security and Authentication',
    summary: 'Account, provider secrets, and local runtime safety model.',
    tags: ['security', 'auth', 'providers', 'secrets'],
    status: 'active',
    details: [
      'Auth is user account scoped; provider keys are stored in local database config.',
      'Security panel explains auth + provider safety posture in-app.',
      'Use Sign Out from user menu to clear session state quickly.',
      'Provider API keys are never sent to the frontend — they stay in the server-side database.',
      'Use the Provider Settings panel to manage individual key storage and test connectivity.'
    ]
  },
  {
    id: 'spec-pipeline-core',
    title: 'Unified Spec Pipeline Core (COMING SOON)',
    summary: 'Build Layer and Meta Layer handshake, mandatory WAITING inputs, and gate rules from the unified specification.',
    tags: ['coming-soon', 'unified-spec', 'build-layer', 'meta-layer', 'waiting-state', 'pipeline'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Unified Build Layer + Meta Layer timeline view in Help with cross-links to active panels and forensic tables.',
      'Current concept: no file write is legal until Memory Crawler, Project Description Crawler, and Project State Crawler all deliver outputs into WAITING state.',
      'Current concept: Waiting Sub-Agent state flow remains CRAWLING → TAG_GENERATION → REFINING → VOTING → SENT_TO_COMMAND, with no skipped states.',
      'Current concept: Command Agent decides next step after refinement and voting; Builder executes one decided step at a time.',
      'Current concept: Meta Layer runs concurrently (Blame, Gap Analysis, Suggested Jobs, God Factory monitors) and shares forensic + tag registry services with Build Layer.',
      'Current concept: Agent Spawn Authority chart gates every sub-agent spawn and logs unauthorized attempts as forensic events.'
    ]
  },
  {
    id: 'spec-memory-interactions',
    title: 'Memory Surfaces and Interaction Types (COMING SOON)',
    summary: 'Unified memory print architecture and six interaction memory areas across chat and agent loop.',
    tags: ['coming-soon', 'memory', 'ask', 'edit', 'plan', 'chat', 'agent-loop', 'total-self-custom-preset'],
    status: 'coming_soon',
    details: [
      'COMING SOON: dedicated visual memory surfaces for Ask Chat, Edit Chat, Plan Chat, Ask Agent Loop, Edit Agent Loop, and Plan Agent Loop.',
      'Memory scope concepts: SELF, TOTAL, CUSTOM, PRESET are enforced at the memory layer and expressed as tag queries.',
      'Access model concept: Agent Agent-Loop and Fleet Agents remain excluded from TOTAL and cannot read Midwife, Agent Router, or Help Agent memory.',
      'Current panel behavior: Memory panel already supports source filtering and presets, but does not yet expose all six interaction memory areas as first-class surfaces.',
      'Future intent: unified memory screen with source-based filtering for all agents and all LLM interaction types.'
    ]
  },
  {
    id: 'spec-tag-taxonomy',
    title: 'Tag Taxonomy and Validation Rules (COMING SOON)',
    summary: 'Extended devtag/plantag/buildtag vocabulary including relationships, nano tags, attribution, and versioning constraints.',
    tags: ['coming-soon', 'devtags', 'plantags', 'buildtags', 'relationships', 'nano', 'validation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: in-help schema browser for extended tag vocabulary from unified spec + addendum.',
      'Relationship tag concepts include calls/inherits/implements/composes/depends_on/subscribes_to/publishes/reads_from/writes_to/wraps/delegates_to.',
      'Nano tag concepts include nano:module/layer/node/fitness/deposit/generation/replay_buffer/training_target and RBY-related nano tags.',
      'Attribution tag concepts include agent_generated/human_generated/hybrid_generated/created_by/last_modified_by/reviewed_by.',
      'Validation rule concept: buildtags are invalid unless they reference at least one existing devtag and one unfulfilled plantag.',
      'Schema governance concept: tag_vocabulary_diff is required before schema retirement or incompatible tag changes.'
    ]
  },
  {
    id: 'spec-god-factory-ops',
    title: 'THE GOD FACTORY Operations Model (COMING SOON)',
    summary: 'Interactive state plus background scan state with notification queue, idle suggestions, and authority boundaries.',
    tags: ['coming-soon', 'god-factory', 'notifications', 'idle-suggestions', 'authority', 'brainstorm'],
    status: 'coming_soon',
    details: [
      'COMING SOON: full God Factory operations map documenting all background monitors and forensic-linked notification flows.',
      'Interactive state concept: user requests can trigger on-the-fly sub-agents (file inspector, devtag resolver, forensic reader, blame reader, live checks).',
      'Background scan concept: continuous monitor + idle scanner + debt monitor + model performance monitor + gap report monitor + pattern watch.',
      'Idle suggestion categories include trivial_enhancement, feature_bridge, performance_opportunity, debt_warning, regression_trend, and model_behavior_alert.',
      'Authority concept: God Factory can veto, adjust model tier assignment, extend sandbox limits, modify schema/model registry, and invoke version-control rollbacks with logged justification tags.',
      'Safety concept: God Factory still cannot bypass validator + diff + regression checks before file writes.'
    ]
  },
  {
    id: 'spec-blame-deep-dive',
    title: 'Blame Crawler Deep Dive (COMING SOON)',
    summary: 'Blame records, quality dimensions, model registry updates, tool criticism, and success attribution promotion.',
    tags: ['coming-soon', 'blame', 'quality', 'model-registry', 'tool-criticism', 'success-attribution'],
    status: 'coming_soon',
    details: [
      'COMING SOON: quality-dimension explorer for tag conformance, context utilization, instruction adherence, hallucination rate, structural integrity, regression risk, and output efficiency.',
      'Blame record concept: every model output is attributed with model metadata, token budgets, interaction type, validator result, and forensic linkage.',
      'Model registry concept: strengths/weaknesses tracked as tag families so routers can assign work by model capability profile.',
      'Tool criticism concept: activates after repeated quality failures in the same interaction type and emits structured tool modifications forwarded to Suggested Jobs.',
      'Success attribution concept: repeated high-quality runs generate promotion records that influence routing and model configuration decisions.',
      'Output capture concept: deterministic interception writes blame records asynchronously while preserving response path latency.'
    ]
  },
  {
    id: 'spec-gap-analysis-deep-dive',
    title: 'Gap Analysis System Deep Dive (COMING SOON)',
    summary: 'Coverage, pattern, debt, tag-system, and agent-performance analysis feeding actionable gap reports.',
    tags: ['coming-soon', 'gap-analysis', 'coverage', 'patterns', 'debt', 'tag-system', 'agent-performance'],
    status: 'coming_soon',
    details: [
      'COMING SOON: gap report explorer with category severity, affected tags, affected agents, and recommended action tags.',
      'Coverage analysis concept: plan coverage, test coverage, and nano coverage matrices with missing-tag breakdowns.',
      'Pattern recognition concept: recurring structural signatures plus anti-pattern detectors (AI slop, drift pattern, spaghetti growth, hallucination loop, context loss).',
      'Debt tracking concept: deterministic per-file debt score formula with debt ceiling enforcement and build-step exclusion for over-threshold files.',
      'Tag-system analysis concept: vocabulary gaps, unused tags, collisions, and resolution latency hotspots.',
      'Agent-performance concept: conformance rate, retry rate, escalation rate, cycle contribution, regression contribution, spawn efficiency, and context efficiency.'
    ]
  },
  {
    id: 'spec-project-state-crawler-deep-dive',
    title: 'Project State Crawler Ground Truth Model (COMING SOON)',
    summary: 'Deterministic parsing, drift event taxonomy, and WAITING-state reconciliation rules anchored to file-system truth.',
    tags: ['coming-soon', 'project-state-crawler', 'ground-truth', 'drift-events', 'tree-sitter', 'reconciliation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: parser registry and drift event explorer showing surplus/deficit/content/location drift with severity reasoning.',
      'Ground truth concept: snapshot is generated from real files on disk and treated as authoritative baseline for completion-state synthesis.',
      'Crawler fleet concept: one sub-crawler per directory queue item with deterministic parsers and skipped-file logging.',
      'Skip policy concept: large files, binary files, dependency directories, and ignored paths are skipped but still represented structurally.',
      'Reconciliation concept: waiting-state logic resolves conflicts between memory output, plan output, and ground truth snapshot before voting.',
      'Invariant concept: unresolved registry surplus or target-file deficit can halt decided-step execution.'
    ]
  },
  {
    id: 'spec-suggested-jobs-deep-dive',
    title: 'Suggested Jobs and Sandbox Pipeline (COMING SOON)',
    summary: 'Blame-driven jobs, independent protocol crawls, atomic step decomposition, sandbox loops, and staged implementation.',
    tags: ['coming-soon', 'suggested-jobs', 'sandbox', 'atomic-steps', 'blame-driven', 'implementation-stages'],
    status: 'coming_soon',
    details: [
      'COMING SOON: full job lifecycle panel from suggested → sandbox_ready → implementing → implemented/rejected/archived.',
      'Crawler priority concept: blame-driven mode always runs before independent protocol scans.',
      'Protocol concept: missing tests, dead code, debt ceiling violations, regression clusters, integration failures, anti-patterns, vocabulary gaps, performance sensitivity gaps, security gaps, and nano coverage gaps.',
      'Atomic-step concept: each step includes devtag dependencies, required buildtags, token budget, minimum model tier, and parallelization flag.',
      'Sandbox loop concept: builder/test/review/debug coordinated cycles with cycle limits and optional human review gate.',
      'Implementation pipeline concept: pre-scan, backup, staged rollout, live testing, stability window, and completion tagging with rollback protections.'
    ]
  },
  {
    id: 'spec-nano-sea-v2-roadmap',
    title: 'Nano Sea v2 Architecture Roadmap (COMING SOON)',
    summary: 'Swarm-layer nano architecture, lifecycle cycles, and integration path replacing large-model reliance over time.',
    tags: ['coming-soon', 'nano-sea-v2', 'swarm', 'router', 'lifecycle', 'mesh', 'integration'],
    status: 'coming_soon',
    details: [
      'COMING SOON: in-app architecture map for NANO SEA v2 delivery package and implementation phases.',
      'Core concept: shared embedding + multi-layer swarm routing + shared output head with soft routing and expert crosstalk.',
      'Lifecycle concept: train, compress, deposit, rebuild cycles with deposit-guided initialization and touch-tensor informed fitness decisions.',
      'Scale concept: GPU/CPU/disk memory paging and mesh federation for distributed nano capacity.',
      'Integration concept: meta-agent shell wraps nano sea and progressively replaces external LLM dependency where feasible.',
      'Reference context: see the lump delivery package for build-order constraints and hardware-targeted rollout assumptions.'
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // COMPREHENSIVE SPEC EXPANSION — ALL UNIFIED ARCHITECTURE CONCEPTS
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

  {
    id: 'build-layer-overview',
    title: 'Build Layer: Pre-Edit Pipeline (COMING SOON)',
    summary: 'Mandatory ground-truth crawls, WAITING state, Skeptic refinement, Command voting, and Builder execution gates.',
    tags: ['coming-soon', 'build-layer', 'pipeline', 'waiting-state', 'validation', 'unified-spec'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Full Build Layer flowchart accessible from this section.',
      'Phase 0 - Pre-Edit Protocol: Every file write requires outputs from three crawlers: Memory Crawler (agent context state), Project Description Crawler (plan scope clarity), and Project State Crawler (ground-truth file snapshot).',
      'Phase 1 - WAITING State: Agent outputs are held in WAITING until all three crawler signals arrive. Waiting subsystems monitor crawler progress.',
      'Phase 2 - Skeptic Sub-Agent: Evaluates the proposed edit against ground truth, context, and forensic records. Can request refinement or escalation.',
      'Phase 3 - Command Sub-Agent: Votes on next action using tally system. Can propose alternative approaches or request additional context.',
      'Phase 4 - Builder Sub-Agent: Executes a single decided command (file write, test run, etc). One atomic step per loop iteration.',
      'Phase 5 - Post-Commit Validation: Drift detection, regression check, tag validator runs, forensic record creation.',
      'Invariants: No write is allowed until WAITING signals clear. No step is taken without Command voting. No step is final until post-commit validation passes.',
      'See Project State Crawler, Memory Panel, and Forensic Database sections for related observability.'
    ]
  },
  {
    id: 'memory-crawler-detail',
    title: 'Memory Crawler (COMING SOON)',
    summary: 'Pre-edit crawler that snapshots agent context state and memory scope satisfaction.',
    tags: ['coming-soon', 'build-layer', 'crawlers', 'memory', 'pre-edit-protocol', 'waiting-state'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Memory Crawler integration panel showing real-time crawler status during loops.',
      'Responsibility: Capture the current memory state (user notes, agent logs, decision history) and validate that all required memory scopes are populated.',
      'Triggers: On every Agent Agent-Loop iteration before the Builder step.',
      'Output: Memory snapshot with scope satisfaction score; written to WAITING signal queue.',
      'Enforcement: Loop cannot proceed to Skeptic evaluation until Memory Crawler output is ready.',
      'Related: Memory Panel, Build Layer, Unified Spec Memory Interactions.'
    ]
  },
  {
    id: 'project-description-crawler-detail',
    title: 'Project Description Crawler (COMING SOON)',
    summary: 'Pre-edit crawler that clarifies plan scope from agent outputs and memory.',
    tags: ['coming-soon', 'build-layer', 'crawlers', 'project-plan', 'pre-edit-protocol', 'waiting-state'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Project Description Crawler integration panel for plan scope visibility.',
      'Responsibility: Extract and validate the declared scope of the proposed action (which files, which changes, what dependencies).',
      'Triggers: Before Builder execution in each Agent Agent-Loop iteration.',
      'Output: Structured plan scope with identified files, risks, and coverage assessment; written to WAITING signal queue.',
      'Enforcement: Builder cannot run until Project Description output is in WAITING queue.',
      'Related: Agent Agent-Loop, Build Layer, Unified Spec Project State Crawler.'
    ]
  },
  {
    id: 'waiting-state-detail',
    title: 'WAITING State Machine (COMING SOON)',
    summary: 'Holds proposed edits until all three crawler signals (Memory, Project Description, Project State) are ready.',
    tags: ['coming-soon', 'build-layer', 'waiting-state', 'crawlers', 'signal-queue', 'enforcement'],
    status: 'coming_soon',
    details: [
      'COMING SOON: WAITING state machine timeline view showing signal arrival order and gate clearance.',
      'States: CRAWLING (awaiting signals) → TAG_GENERATION (crawlers done, tags synthesized) → REFINING (Skeptic runs) → VOTING (Command tallies) → SENT_TO_COMMAND (ready for execution).',
      'Gate Conditions: Cannot proceed until all three crawler outputs are enqueued.',
      'Timeout: If any crawler exceeds time budget, escalation to God Factory for intervention.',
      'Monitoring: Forensic database logs every WAITING transition and crawler latency.',
      'Related: Memory Crawler, Project Description Crawler, Project State Crawler, Skeptic Agent, Command Agent.'
    ]
  },
  {
    id: 'skeptic-agent-detail',
    title: 'Skeptic Sub-Agent (COMING SOON)',
    summary: 'Evaluates proposed edits against ground truth, memory state, and forensic records before Builder executes.',
    tags: ['coming-soon', 'build-layer', 'agents', 'validation', 'error-detection', 'skepticism'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Skeptic evaluation logs and reasoning transparency in the forensic database.',
      'Responsibility: Challenge the proposed edit and recommend alternatives or rejections.',
      'Input: Command proposal, WAITING signal outputs, ground truth snapshot, recent blame records, tag registry state.',
      'Output: Approval, conditional approval with refinement requests, or rejection with reasoning.',
      'Anti-Patterns Detected: Regression risk (model quality history), tag conflicts (devtag/buildtag mismatch), coverage holes (tests missing), structural debt (compounding complexity).',
      'Escalation: If confident rejection, escalates to God Factory for policy override.',
      'Related: Command Agent, Tag Validator, Forensic Database, Blame Crawler.'
    ]
  },
  {
    id: 'command-agent-detail',
    title: 'Command Sub-Agent (COMING SOON)',
    summary: 'Voting agent that decides next action after Skeptic review — proposes alternatives or confirms Builder step.',
    tags: ['coming-soon', 'build-layer', 'agents', 'voting', 'decision', 'orchestration'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Command voting ledger and decision rationale logs accessible from forensic database.',
      'Responsibility: Decide the next single atomic step (file write, test run, refactor, etc.).',
      'Input: Skeptic output, user task statement, milestone breakdown, current code state.',
      'Voting Process: Tally votes from Skeptic, Gap Analysis, and Blame sub-agents on proposed action. Can propose alternatives.',
      'Output: Decided action with prioritization rationale.',
      'Constraints: Single action per loop iteration; each action must reference required devtags and buildtags.',
      'Related: Skeptic Agent, Builder Agent, Tag System, Unified Spec voting model.'
    ]
  },
  {
    id: 'builder-agent-detail',
    title: 'Builder Sub-Agent (COMING SOON)',
    summary: 'Executes a single decided command (file write, terminal command, test, etc) with atomic guarantees.',
    tags: ['coming-soon', 'build-layer', 'agents', 'execution', 'atomic-steps', 'transactions'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Builder execution ledger showing file writes, command runs, and rollback history.',
      'Responsibility: Perform the exact action decided by Command agent.',
      'Actions: File creation/modification/deletion, terminal command execution, test suite runs, format/lint passes.',
      'Atomicity: One step per loop iteration. If step fails, full rollback available.',
      'Backup: Pre-execution backup taken automatically via Checkpoints system.',
      'Monitoring: Output streams logged to event feed. Exit code and state changes written to forensic database.',
      'Related: Command Agent, Post-Commit Validation, Checkpoints, Forensic Database.'
    ]
  },
  {
    id: 'post-commit-validation-detail',
    title: 'Post-Commit Validation Chain (COMING SOON)',
    summary: 'Drift detection, regression check, tag validation, and forensic recording after every Builder execution.',
    tags: ['coming-soon', 'build-layer', 'validation', 'forensic', 'tag-system', 'post-step'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Post-commit validation results dashboard integrated into Agent event feed.',
      'Step 1 - Drift Detection: Compare post-commit file state against ground truth snapshot. Flag registry surplus/deficit/content/location drift.',
      'Step 2 - Regression Check: Run test suite. Check for newly-broken tests or coverage loss.',
      'Step 3 - Tag Validation: Verify all created/modified code is tagged with appropriate devtags. Check plantag dependencies.',
      'Step 4 - Forensic Recording: Create dated record linking this step to buildtags, devtags, model used, builder rationale.',
      'Halt Condition: If validation fails, loop pauses and Suggested Jobs generator is triggered.',
      'Related: Project State Crawler, Tag Validator, Blame Crawler, Forensic Database, Suggested Jobs.'
    ]
  },
  {
    id: 'meta-layer-overview',
    title: 'Meta Layer: Continuous Observation and Planning (COMING SOON)',
    summary: 'Blame, Gap Analysis, Suggested Jobs, and God Factory monitors all run concurrently with Build Layer.',
    tags: ['coming-soon', 'meta-layer', 'pipeline', 'concurrent', 'crawlers', 'unified-spec'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Meta Layer process map showing Blame Crawler, Gap Analysis agents, Suggested Jobs crawlers, and God Factory background scan running in parallel.',
      'Purpose: Continuous observation of code quality, coverage gaps, technical debt, and autonomous suggestion generation.',
      'Relationships: Meta Layer feeds forensic signals to Build Layer (via Skeptic/Command evaluation). Build Layer feeds outputs to Meta Layer (via Blame Crawler).',
      'Crawlers: Blame Crawler (model quality), Gap Analysis (coverage/debt/patterns), Project State Crawler (ground truth), Suggested Jobs (next actions).',
      'God Factory: Converged persistent agent with highest authority to inspect, question, and override Build Layer decisions.',
      'Isolated Processes: Meta Layer processes run independently and can be enabled/disabled per Unified Spec policy.',
      'See: THE GOD FACTORY, BLAME, Gap Analysis, Suggested Jobs, Project State Crawler sections.'
    ]
  },
  {
    id: 'blame-quality-dimensions',
    title: 'Quality Dimensions Framework (COMING SOON)',
    summary: 'Seven measured dimensions guide model evaluation: tag conformance, hallucination, instruction adherence, structural integrity, efficiency, context use, regression risk.',
    tags: ['coming-soon', 'blame', 'quality', 'metrics', 'model-registry', 'evaluation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Quality dashboard with dimension breakdown per model.',
      'Dimension 1 - Tag Conformance (weight 0.30): Output tagging matches devtag/buildtag schema. High conformance = good.',
      'Dimension 2 - Hallucination Rate (weight 0.20): False/fabricated content likelihood. Low rate = good (inverted).',
      'Dimension 3 - Instruction Adherence (weight 0.15): Output follows agent directives and task constraints.',
      'Dimension 4 - Structural Integrity (weight 0.15): Code quality, syntax, no breaking changes introduced.',
      'Dimension 5 - Output Efficiency (weight 0.10): Token usage, latency, resource efficiency.',
      'Dimension 6 - Context Utilization (weight 0.05): Relevant use of provided memory, ground truth, and project state.',
      'Dimension 7 - Regression Risk (weight 0.05): Likelihood of introducing bugs or breaking existing functionality (inverted).',
      'Composite Score: Weighted sum of all dimensions. Score < 0.65 for 3+ consecutive outputs triggers Tool Criticism.',
      'See: BLAME panel, Blame Crawler Deep Dive, Forensic Database.'
    ]
  },
  {
    id: 'tool-criticism-mechanism',
    title: 'Tool Criticism and Model Adjustment (COMING SOON)',
    summary: 'Automatic corrective feedback triggered when a model quality composite score drops below 0.65 for 3+ consecutive outputs.',
    tags: ['coming-soon', 'blame', 'quality-gate', 'tool-criticism', 'feedback-loop', 'self-improvement'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Tool Criticism event log in the forensic database showing activations and recommended fixes.',
      'Trigger Condition: Model composite quality < 0.65 for 3 or more consecutive outputs.',
      'Output: Structured critique message forwarded to Suggested Jobs as a priority remediation job.',
      'Feedback Content: Specific quality dimensions failing, examples of poor outputs, recommended strategies for improvement.',
      'Model Response: Model receives critique in next interaction context to adapt behavior.',
      'Prevention: Can trigger automatic fallback to higher-tier model or escalation to God Factory.',
      'Related: Quality Dimensions Framework, BLAME panel, Blame Crawler, Suggested Jobs, Model Strategy.'
    ]
  },
  {
    id: 'gap-analysis-detail',
    title: 'Gap Analysis Five-Agent System (COMING SOON)',
    summary: 'Five concurrent agents analyze coverage, patterns, debt, tag-system health, and agent performance.',
    tags: ['coming-soon', 'gap-analysis', 'meta-layer', 'crawlers', 'agents', 'holistic'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Gap Analysis five-agent orchestration map and result aggregation.',
      'Agent 1 - Coverage Analysis Agent: Compares implemented plan vs actual code. Identifies missing tests, missing types, missing documentation.',
      'Agent 2 - Pattern Recognition Agent: Detects recurring structural problems (AI slop, hallucination loops, context loss patterns).',
      'Agent 3 - Debt Tracking Agent: Per-file technical debt calculation. Identifies files exceeding debt ceiling.',
      'Agent 4 - Tag System Analysis Agent: Vocabulary gap detection. Finds unused tags, colliding tags, and missing tag assignments.',
      'Agent 5 - Agent Performance Analysis Agent: Measures Build Layer agent conformance (retry rate, escalation rate, contribution quality).',
      'Output: Five independent gap reports merged into holistic Gap Report.',
      'Related: Gap Analysis Panel, Forensic Database, Suggested Jobs (which consume gap signals).'
    ]
  },
  {
    id: 'suggested-jobs-protocol-suite',
    title: 'Suggested Jobs: 10 Codebase Review Protocols (COMING SOON)',
    summary: 'Independent crawlers scanning for missing tests, dead code, debt violations, regression clusters, integration gaps, anti-patterns, vocabulary gaps, performance, security, and nano coverage.',
    tags: ['coming-soon', 'suggested-jobs', 'protocols', 'scanners', 'meta-layer', 'implementation-pipeline'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Protocol runner dashboard with per-protocol enable/disable toggles and result inspection.',
      'Protocol 1 - Missing Tests: Coverage analyzer finds functions/files with <80% test coverage.',
      'Protocol 2 - Dead Code: Unused functions, dead branches, orphaned modules.',
      'Protocol 3 - Debt Ceiling Violations: Files exceeding per-file technical debt limit.',
      'Protocol 4 - Regression Clusters: Historical pattern of regressions in specific areas (strong signal for remediation).',
      'Protocol 5 - Integration Failures: Failed handshakes between agents or subsystems.',
      'Protocol 6 - Anti-Pattern Detection: Known AI slop patterns, context collapse signatures, hallucination indicators.',
      'Protocol 7 - Vocabulary Gaps: Devtags used but not defined in schema, or schema tags never used.',
      'Protocol 8 - Performance Sensitivity: Identified hot paths with degradation risk if not carefully maintained.',
      'Protocol 9 - Security Gaps: Input validation gaps, permission checks, dependency vulnerabilities.',
      'Protocol 10 - Nano Coverage Gaps: Functions not yet covered by Nano Sea training or specialty nanos.',
      'Execution: Blame-Driven mode always runs first. Independent protocols run after in priority order.',
      'Related: Suggested Jobs Panel, Blamed-Driven Jobs, Sandbox Pipeline.'
    ]
  },
  {
    id: 'sandbox-atomic-steps',
    title: 'Suggested Jobs: Atomic Steps and Sandbox Execution (COMING SOON)',
    summary: 'Jobs decomposed into atomic steps with buildtag dependencies, sandbox execution loops, and staged implementation.',
    tags: ['coming-soon', 'suggested-jobs', 'sandbox', 'implementation', 'stages', 'execution-plan'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Job sandbox runner with stage visualization and sandbox cycle counter.',
      'Atomic Step Schema: Each step includes devtag dependencies, required buildtags, token budget, minimum model tier, parallelization allowance.',
      'Sandbox Execution: Each step runs in an isolated sandbox with cycle limits and optional human review gate.',
      'Sandbox Cycle Concept: Pre-scan (identify impact), Build (execute change), Test (verify), Review (human or auto), Decide (rollback or commit), Stabilize (wait for dependent tests).',
      'Staged Implementation: Multi-stage jobs can be paused/resumed between stages. Supports gradual rollout of complex changes.',
      'Backoff: If a stage fails, sandbox suggests rollback or alternative approaches via Suggested Jobs refinement.',
      'Related: Suggested Jobs Panel, Sandbox Cycle Visibility, Builder Agent, Checkpoint Rollback.'
    ]
  },
  {
    id: 'ask-chat-memory',
    title: 'Ask-Chat Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for conversational question-answer interactions via Chat Agent.',
    tags: ['coming-soon', 'memory', 'ask', 'chat', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Ask-Chat memory surface integrated into Memory Panel with "Ask-Chat" preset filter.',
      'Purpose: Capture user queries, Chat Agent responses, and question-answer chains during conversational workflows.',
      'Scope: TOTAL access (visible to all agents) per Unified Spec.',
      'Content: Q/A pairs with timestamps, model used, context injected, user satisfaction feedback.',
      'Persistence: Scoped to active project; queryable by tag, date, keyword.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Chat Tab.'
    ]
  },
  {
    id: 'edit-chat-memory',
    title: 'Edit-Chat Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for file-editing focused interactions via Chat Agent with patch history.',
    tags: ['coming-soon', 'memory', 'edit', 'chat', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Edit-Chat memory surface integrated into Memory Panel with "Edit-Chat" preset filter.',
      'Purpose: Record every chat-driven edit with before/after state, model rationale, user acceptance/rejection.',
      'Scope: TOTAL access per Unified Spec.',
      'Content: File diffs, edit reasoning, model quality score for that edit, build/test results post-edit.',
      'Persistence: Scoped to active project; editable by user to mark good/bad edits for future reference.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Edit Mode, Blame Crawler.'
    ]
  },
  {
    id: 'plan-chat-memory',
    title: 'Plan-Chat Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for planning and sequencing interactions via Chat Agent.',
    tags: ['coming-soon', 'memory', 'plan', 'chat', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Plan-Chat memory surface integrated into Memory Panel with "Plan-Chat" preset filter.',
      'Purpose: Store structured plans, sequencing decisions, milestone breakdowns discussed in chat.',
      'Scope: TOTAL access per Unified Spec.',
      'Content: Chat-generated plans, user refinements, plantag decisions, milestone tracking.',
      'Persistence: Scoped to active project; user-editable for manual refinements.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Plan Mode, Milestone Panel.'
    ]
  },
  {
    id: 'ask-agent-loop-memory',
    title: 'Ask-Agent Loop Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for autonomous question-driven loops in Agent Agent-Loop with SELF/CUSTOM/PRESET scoping.',
    tags: ['coming-soon', 'memory', 'ask', 'agent-loop', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Ask-Agent Loop memory surface integrated into Memory Panel with source-filtering.',
      'Purpose: Capture autonomous question cycles where Agent Agent-Loop explores project state and learns.',
      'Scope: SELF (agent-only) memory per Unified Spec. Not visible to Chat Agent or other Loop siblings.',
      'Content: Questions asked, ground truth answers, context injected, learning records.',
      'Persistence: Scoped to active project and to this agent instance.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Agent Agent-Loop, Agent Architecture.'
    ]
  },
  {
    id: 'edit-agent-loop-memory',
    title: 'Edit-Agent Loop Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for autonomous edit sequences in Agent Agent-Loop with SELF/CUSTOM/PRESET scoping.',
    tags: ['coming-soon', 'memory', 'edit', 'agent-loop', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Edit-Agent Loop memory surface integrated into Memory Panel with source-filtering.',
      'Purpose: Record autonomous edit sequences executed by Agent Agent-Loop.',
      'Scope: SELF memory per Unified Spec. Not visible to Chat Agent or parent agents.',
      'Content: Edits decided and executed, buildtags created, post-commit validation results.',
      'Persistence: Scoped to active project and to this agent instance.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Agent Agent-Loop, Build Layer.'
    ]
  },
  {
    id: 'plan-agent-loop-memory',
    title: 'Plan-Agent Loop Interaction Memory Surface (COMING SOON)',
    summary: 'Dedicated memory area for autonomous planning sequences in Agent Agent-Loop with SELF/CUSTOM/PRESET scoping.',
    tags: ['coming-soon', 'memory', 'plan', 'agent-loop', 'lvm-interaction', 'memory-surface'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Plan-Agent Loop memory surface integrated into Memory Panel with source-filtering.',
      'Purpose: Record autonomous planning decisions and milestone breakdowns by Agent Agent-Loop.',
      'Scope: SELF memory per Unified Spec. Not visible to Chat Agent or parent agents.',
      'Content: Autonomous plans generated, plantag decisions, milestone checkpoint decisions.',
      'Persistence: Scoped to active project and to this agent instance.',
      'Related: Memory Panel, Unified Spec Memory Interactions, Agent Agent-Loop, Milestone Panel.'
    ]
  },
  {
    id: 'memory-scope-enforcement',
    title: 'Memory Scope Enforcement (COMING SOON)',
    summary: 'TOTAL vs SELF vs CUSTOM vs PRESET access control preventing information leakage and ensuring agent isolation.',
    tags: ['coming-soon', 'memory', 'scopes', 'access-control', 'isolation', 'policy'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Memory scope audit log showing which agents accessed which memory areas in each loop.',
      'TOTAL Scope: God Factory, Chat Agent, Blame Crawler, Help Agent read all memory areas.',
      'SELF Scope: Agent Agent-Loop and Fleet Agents can only read their own self-instance memory. No cross-agent visibility.',
      'CUSTOM Scope: Agents can request specific named memory areas via tagged queries.',
      'PRESET Scope: Predefined memory filters (recent decisions, user notes, architecture, system health) for quick access.',
      'Enforcement Point: Memory retrieval interceptor checks agent ID, interaction type, and enforces scope at read time.',
      'Violation Logging: Unauthorized access attempts are logged as forensic security events.',
      'Related: Memory Panel, Agent Architecture, Unified Spec Memory Interactions, Forensic Database.'
    ]
  },
  {
    id: 'ground-truth-snapshot',
    title: 'Ground Truth File Snapshot (COMING SOON)',
    summary: 'Real-time tree-sitter parsed snapshot of all project files used as authoritative baseline for WAITING state and drift detection.',
    tags: ['coming-soon', 'project-state-crawler', 'ground-truth', 'parser', 'snapshot', 'baseline'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Ground truth snapshot viewer showing parsed file structure, extracted devtags, and file statistics.',
      'Source: Tree-sitter parsers per language (TypeScript, Python, Go, Rust, C, Java, etc).',
      'Frequency: Snapshot taken at the start of each Agent Agent-Loop iteration and on-demand via Project State Crawler button.',
      'Content: File tree, file-level devtags, function/class/method boundaries, line-count statistics, language distribution.',
      'Skipped Files: Large files (>10K lines), binary files, dependency directories logged with skip reason.',
      'Usage: WAITING state requires Project State Crawler output. Pre-commit validation compares post-build state against snapshot to detect drift.',
      'Related: Project State Crawler, WAITING State, Drift Events, Post-Commit Validation.'
    ]
  },
  {
    id: 'drift-event-taxonomy',
    title: 'Drift Event Taxonomy: Four Drift Types (COMING SOON)',
    summary: 'Registry Surplus, Registry Deficit, Content Drift, and Location Drift detected by comparing snapshot to ground truth.',
    tags: ['coming-soon', 'project-state-crawler', 'drift', 'forensic', 'validation', 'reconciliation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Drift event categorizer and severity assessment tool.',
      'Drift Type 1 - Registry Surplus: Devtag registered in tag registry but file/function not found in ground truth snapshot. Indicates stale tagging.',
      'Drift Type 2 - Registry Deficit: Code file/function exists in snapshot but no corresponding devtag registered. Indicates under-tagging.',
      'Drift Type 3 - Content Drift: File content changed (line hashes differ) but devtag position/count unchanged. Indicates tag misalignment.',
      'Drift Type 4 - Location Drift: Function/method exists but moved to different file or different line range than tagged. Indicates refactoring without tag update.',
      'Severity Scoring: Based on affected file count, tag chain dependencies, and regression history.',
      'Reconciliation: WAITING state reconciler must resolve conflicts before Builder execution.',
      'Related: Project State Crawler, Ground Truth Snapshot, Forensic Database, Post-Commit Validation.'
    ]
  },
  {
    id: 'nano-swarm-layers',
    title: 'Nano Sea v2: Swarm Layer Architecture (COMING SOON)',
    summary: '2000-5000 tiny nanos per layer, soft-k routing, expert crosstalk, chromatic indexing, and output aggregation.',
    tags: ['coming-soon', 'nano-sea-v2', 'architecture', 'routing', 'swarm', 'scaling'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Interactive swarm layer visualization showing nano positions, routing decisions, and crosstalk activity.',
      'Layer Structure: 3 identical swarm layers (input → layer1 → layer2 → layer3 → output).',
      'Nanos per Layer: 2000-5000 experts, each 1K-50K parameters. Total ~500K params for full system.',
      'Routing: ChromaticIndex router scores nanos using RBY-simplex positions, selects top ~8 per token (soft, learnable k).',
      'Activation: Soft-k routing enables gradient flow to all nanos, preventing dead nanos. ~8 nanos activate per token on average.',
      'Expert Crosstalk: Cross-attention between selected nanos in same layer (learned gate determines if beneficial).',
      'Aggregation: Weighted sum of nano outputs per layer.',
      'Inference Speed: 10-100x faster than 7B-70B cloud models. Can run on CPU/GPU/mobile.',
      'Related: NERDS_ASSEMBLE.txt, Nano Sea v2 Roadmap, Cosmic Cycles, Deposits.'
    ]
  },
  {
    id: 'chromatic-routing',
    title: 'Chromatic Index Routing (RBY-Simplex) (COMING SOON)',
    summary: 'Geometric routing where Red=abstraction/complexity, Blue=domain, Yellow=style assigns nanos to positions.',
    tags: ['coming-soon', 'nano-sea-v2', 'routing', 'chromatic', 'geometry', 'specialization'],
    status: 'coming_soon',
    details: [
      'COMING SOON: RBY-simplex navigator showing nano positions and query routing decisions in 3D space.',
      'Simplex Basis: Red, Blue, Yellow orthogonal axes.',
      'Red Dimension: Abstraction level and computational complexity. High red = abstract reasoning, low red = concrete detail.',
      'Blue Dimension: Domain specialization. Different domains occupy different positions.',
      'Yellow Dimension: Style and presentation. Code style, documentation style, error message tone.',
      'Distance Metric: Aitchison distance for simplex points.',
      'Router Behavior: Query is embedded, distance computed to all nanos, top-k selected based on learnable thresholds.',
      'Specialization: Over time, nanos cluster in regions of simplex based on training signals.',
      'Reference: NANO_SEA_V2_BUILD_SPEC.md, nano_sea_v2_reference.py.',
      'Related: Nano Sea v2 Roadmap, Swarm Layer Architecture, Soft-k Routing.'
    ]
  },
  {
    id: 'soft-k-routing',
    title: 'Soft-k Routing vs Hard Top-k (COMING SOON)',
    summary: '30 validated experiments prove soft-k differentiable routing beats hard top-k selection by 8-10% at same parameters.',
    tags: ['coming-soon', 'nano-sea-v2', 'routing', 'soft-selection', 'expert-mixture', 'validated'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Soft-k vs hard-k comparison dashboard with training curves from all 30 validation experiments.',
      'Hard Top-k: Select exactly top-k nanos (discrete, no gradient through unchosen nanos). Kills weak nanos.',
      'Soft-k: Learned differentiable selection with smooth gradients. All nanos receive gradient signals.',
      'Advantage: Weak nanos get training signal instead of zero gradient. Nanos that could specialize survive.',
      'Performance: Soft-k achieves 8-10% improvement in perplexity/BLEU/F1 vs hard-k at same parameter budget.',
      'Implementation: Gumbel-max trick or temperature-scaled softmax for differentiable selection.',
      'Learnability: k value per query type is learned, not fixed. Some query types activate 4 nanos, others 12.',
      'Touch Tensor Logging: Records which nanos actually received gradient per batch.',
      'See: DELIVERY_README.md, 30 validated experiments, nano_sea_v2_reference.py.',
      'Related: Nano Sea v2 Roadmap, Swarm Layer Architecture, Cosmic Cycles.'
    ]
  },
  {
    id: 'cosmic-cycles-lifecycle',
    title: 'Cosmic Cycles: Train → Compress → Deposit → Rebuild (COMING SOON)',
    summary: 'Iterative nano improvement cycles where dead nanos are pruned, high-performers saved, new nanos spawned with warm-start.',
    tags: ['coming-soon', 'nano-sea-v2', 'lifecycle', 'cycles', 'evolution', 'warm-start'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Cosmic cycle timeline showing multi-cycle nano population evolution.',
      'Cycle Phase 1 - Train: Run nano sea on real workloads. Nanos learn. Touch tensor logs nano activations.',
      'Cycle Phase 2 - Compress: Analyze touch tensors and fitness signals. Dead nanos pruned. Weak nanos marked.',
      'Cycle Phase 3 - Deposit: High-fitness nanos serialized to disk (deposits are searchable by signature/fitness/domain).',
      'Cycle Phase 4 - Rebuild: New nanos spawn to fill pruned positions. Warm-start from deposits beats random by ~25%.',
      'Iteration: After K cycles, sea has evolved K times. Dead weight removed, specializations deepened, warm-start improves convergence.',
      'Compound Growth: Each cycle builds on previous specializations. Performance improves monotonically if feedback signals are good.',
      'Touch Tensor: Fitness signal vector (activation frequency, loss contribution, gradient magnitude per nano).',
      'Deposit Signature: (domain_tags, quality_metrics, nano_weights, architecture_snapshot).',
      'Related: NERDS_ASSEMBLE.txt, Fleet Agents-Nano, Nano Sea v2 Roadmap.'
    ]
  },
  {
    id: 'deposits-warm-start',
    title: 'Nano Deposits and Warm-Start Initialization (COMING SOON)',
    summary: 'Serialized high-fitness nanos from prior cycles enable 25% faster convergence over random initialization.',
    tags: ['coming-soon', 'nano-sea-v2', 'deposits', 'warm-start', 'initialization', 'reuse'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Deposit browser and warm-start strategy inspector.',
      'Deposit Storage: High-performing nanos from cycle N stored with metadata (fitness score, domain tags, training epoch, loss record).',
      'Searchability: Deposits indexed by domain tag, fitness tier, and nano signature for quick lookup.',
      'Warm-Start Strategy: New nanos in cycle N+1 initialized from deposits matching their intended domain.',
      'Convergence Advantage: Warm-start nanos converge ~25% faster (fewer epochs to target loss) vs random initialization.',
      'Adoption: Every cycle, high-fitness deposits are reused. Low-deposit cycles still benefit from prior domain specializations.',
      'Evolutionary Path: Nanos evolve incrementally from good deposits instead of always starting from scratch.',
      'Scaling: Deposit library grows over time. Oldest/lowest-fitness deposits are retired.',
      'See: DELIVERY_README.md, cosmic_cycles section in NERDS_ASSEMBLE.txt.',
      'Related: Cosmic Cycles, Touch Tensor Logging, Fleet Agents-Nano.'
    ]
  },
  {
    id: 'touch-tensor-fitness',
    title: 'Touch Tensor Logging and Nano Fitness (COMING SOON)',
    summary: 'Per-nano activation frequency, loss contribution, and gradient magnitude tracked for compression and deposit decisions.',
    tags: ['coming-soon', 'nano-sea-v2', 'fitness', 'logging', 'selection', 'evolution'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Touch tensor dashboard showing nano fitness scores and selection pressure over cycles.',
      'Touch Tensor: Vector per nano tracking (activation_count, loss_contribution, gradient_magnitude, last_improved_epoch).',
      'Logging: Recorded during forward/backward pass, updated per batch, dumped per epoch.',
      'Activation Frequency: How often nano was selected by router. High = in-demand, Low = redundant.',
      'Loss Contribution: How much this nano\'s output affects final loss. High = critical, Low = decorative.',
      'Gradient Magnitude: Average gradient norm flowing through this nano. Zero = dead zone, High = learning active.',
      'Compression Signal: Nanos with low activation + low loss contrib + zero gradient are pruned.',
      'Deposit Signal: Nanos with high activation + positive loss contribution + stable gradients become deposits.',
      'Specialization: Over cycles, activation distribution tightens. Fewer nanos activate for each query type.',
      'See: nano_sea_v2_reference.py fitness module, DELIVERY_README.md.',
      'Related: Cosmic Cycles, Nano Deposits, Swarm Layer Architecture.'
    ]
  },
  {
    id: 'fleet-agents-nano',
    title: 'Fleet Agents-Nano: Parallel Nano Sea Improvement Workers (COMING SOON)',
    summary: 'Sub-agent pool that runs cosmic cycles, manages deposits, analyzes touch tensors, and reports nano health.',
    tags: ['coming-soon', 'nano-sea-v2', 'fleet', 'lifecycle', 'workers', 'parallel'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Fleet Agents-Nano orchestration panel showing active workers and task assignments.',
      'Purpose: Autonomous nano sea lifecycle management running in parallel with Build Layer.',
      'Tasks: Cosmic cycle orchestration, deposit serialization, touch tensor analysis, RBY position adjustment, nano health monitoring, Midwife dataset generation.',
      'Parallelism: Multiple Fleet Agents-Nano run simultaneously, each managing a subset of the nano pool.',
      'Communication: Agents report fitness signals, deposit candidates, and health alerts to God Factory and Meta Layer.',
      'Feedback Loop: Blame Crawler quality scores + Touch tensor fitness → Fleet Agents-Nano decisions on compression/deposit/rebuild.',
      'Output: Improved nano sea health, new deposits, specialized nano populations.',
      'Related: Cosmic Cycles, Nano Sea v2 Roadmap, THE GOD FACTORY, Meta Layer.'
    ]
  },
  {
    id: 'agent-spawn-authority',
    title: 'Agent Spawn Authority and Guard Conditions (COMING SOON)',
    summary: 'Policy-driven gating for sub-agent spawning ensures only authorized agents activate and logs unauthorized attempts.',
    tags: ['coming-soon', 'agents', 'authority', 'policy', 'security', 'forensic'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Agent spawn authority matrix showing roles, spawn conditions, and veto criteria.',
      'Authority Chart: Hierarchical agent permissions (God Factory can spawn all; Agent Agent-Loop can only spawn Fleet; Chat Agent cannot spawn).',
      'Guard Conditions: Spawn gate checks — memory state, project state, current load, security policy, tag schema version.',
      'Spawn Request: Agent issues request with (requester_id, agent_type, initial_context, required_resources).',
      'Validation: Authority checker verifies requester authorization, guard conditions pass, forensic linkage valid.',
      'Grant or Deny: Approve = agent spawns with ID and audit link. Deny = logged as unauthorized_spawn_attempt.',
      'Enforcement: Denied spawn attempts block agent creation and trigger forensic alerts.',
      'God Factory Override: God Factory can override deny decisions with explicit justification tag.',
      'Related: Unified Spec Agent Registry, Forensic Database, THE GOD FACTORY.'
    ]
  },
  {
    id: 'blame-feedback-loop-nano',
    title: 'Blame Crawler + Nano Sea Feedback Loop (COMING SOON)',
    summary: 'Model quality scores from Blame feed specialization signals to Nano Sea, creating virtuous improvement cycle.',
    tags: ['coming-soon', 'nano-sea-v2', 'blame', 'feedback', 'specialization', 'integration'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Feedback loop visualization showing Blame → Fleet Agents-Nano → Nano Improvement → Better Responses.',
      'Signal Flow: (1) Agent query → (2) Nano Sea response, (3) Blame Crawler scores output quality, (4) Quality dimensions computed, (5) Model-specific fitness profile updated.',
      'Nano Feedback: Quality scores binned by query type/domain. Nano Sea sees: "codings queries=0.85, reasoning_queries=0.62".',
      'Specialization: Fleet Agents-Nano use quality signals to adjust RBY positions. Nanos specializing in high-quality domains get protected.',
      'Retraining: Domains with low quality scores trigger retraining rounds focused on that domain.',
      'Suggested Jobs: Blame → Gap Analysis → Suggested Jobs can recommend "retrain nanos for coding domain".',
      'Virtuous Loop: Better nanos → better responses → higher Blame scores → more specialized nanos.',
      'See: NERDS_ASSEMBLE.txt blame_feedback_loop section, Fleet Agents-Nano, BLAME panel.',
      'Related: Quality Dimensions, Cosmic Cycles, Specialization.'
    ]
  },
  {
    id: 'pre-edit-protocol-complete',
    title: 'Pre-Edit Protocol: Three-Crawler Enforcement (COMING SOON)',
    summary: 'Memory Crawler + Project Description Crawler + Project State Crawler all must complete before any file write is authorized.',
    tags: ['coming-soon', 'build-layer', 'pre-edit-protocol', 'crawlers', 'waiting-state', 'validation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Pre-Edit Protocol monitor showing real-time crawler progress and gate clearance status.',
      'Requirement 1 - Memory Crawler Signal: Agent context memory complete and scopes satisfied.',
      'Requirement 2 - Project Description Crawler Signal: Plan scope clearly declared and files identified.',
      'Requirement 3 - Project State Crawler Signal: Ground truth snapshot current and devtag registry synchronized.',
      'Enforcement: Loop holds in WAITING state until all three signals enqueued.',
      'Timeout: If any crawler exceeds time budget (configurable per crawler), escalate to God Factory.',
      'Visibility: All three crawler statuses shown in Agent event feed and Waiting State Machine view.',
      'Forensic Record: Every pre-edit cycle logs crawler latencies and gate clearance times.',
      'Related: WAITING State Detail, Memory Crawler, Project Description Crawler, Project State Crawler, Build Layer.'
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ADDENDUM — SUB-AGENTS, ESCALATION CHARTS, TAG VOCABULARY EXTENSIONS, DIAGNOSTICS
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

  {
    id: 'diff-sub-agent',
    title: 'Diff Sub-Agent: Pre-Write Validation (COMING SOON)',
    summary: 'Predicts post-edit devtag state BEFORE the file system write executes, blocking writes whose results would not satisfy the required plantag.',
    tags: ['coming-soon', 'build-layer', 'sub-agents', 'validation', 'pre-write', 'buildtags'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Diff Sub-Agent prediction log viewable in Agent event feed and forensic database.',
      'Purpose: Close the gap between "tag is structurally valid" (tag validator) and "executing this tag will produce the expected post-edit state" (diff sub-agent).',
      'Spawn Point: After tag validation passes and before the file system write executes.',
      'Inputs: Current buildtag set, current devtag registry state for all affected files, current plantag requirements.',
      'Process: Apply buildtag operations to current registry state in memory, compute predicted post-edit devtag state.',
      'Pass Condition: Predicted state satisfies the current plantag requirement → write authorized.',
      'Fail Condition: Predicted state mismatches → write blocked, mismatch logged to forensic diff_failures table, Builder Agent retries.',
      'Pending Partition: On authorized write, predicted post-edit state written to pending registry partition. Promoted to active on write success; discarded on failure/revert.',
      'Related: Builder Agent Detail, Tag Validator, Forensic Database, Build Layer, System Invariants.'
    ]
  },
  {
    id: 'conflict-sub-agent',
    title: 'Conflict Sub-Agent: Fleet Lock Registry (COMING SOON)',
    summary: 'Prevents two fleet agents from claiming the same devtag simultaneously, detects deadlocks, and queues held steps.',
    tags: ['coming-soon', 'build-layer', 'sub-agents', 'fleet', 'concurrency', 'deadlock'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Conflict Sub-Agent lock registry viewer in Fleet Panel.',
      'Purpose: Prevent parallel Fleet Agents from writing the same devtag simultaneously.',
      'Lock Registry: Maintains a map of all active devtag claims keyed by agent ID.',
      'Check Trigger: Before any fleet step assignment, buildtag set is checked against active claims.',
      'Conflict Path: Conflicting step placed in a hold queue; released when conflicting agent completes or fails.',
      'Timeout: Held step waiting >10 cycles escalates to Parallel Coordinator Agent for forced resolution.',
      'Deadlock Detection: Agent A holds claim B needs AND Agent B holds claim A needs → both suspended, Command Agent notified.',
      'Forensic Logging: All conflicts, resolutions, and timeouts written to conflict_log table.',
      'Related: Parallel Coordinator Agent, Fleet Agents, Command Agent, Forensic Database.'
    ]
  },
  {
    id: 'regression-sub-agent',
    title: 'Regression Sub-Agent: Per-Step Regression Check (COMING SOON)',
    summary: 'After every committed build step, verifies that previously-done plantags still have their expected devtags intact.',
    tags: ['coming-soon', 'build-layer', 'sub-agents', 'regression', 'plantags', 'validation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Regression Sub-Agent result log in forensic database and Agent event feed.',
      'Purpose: Detect regression immediately after each file write rather than waiting for test suite.',
      'Process: Crawls all plantag:status:done entries; verifies corresponding devtags still exist in registry in expected state.',
      'Regression Conditions: Devtag no longer exists, devtag type changed, relationship tags broken.',
      'On Detection: Plantag reverted to plantag:status:blocked; regression entry written to regression_history table with causing buildtag.',
      'No Repair: Regression Sub-Agent only detects and records. Repair is Blame Crawler responsibility.',
      'Mandatory Timing: No subsequent step may begin in the same decision cycle until Regression Sub-Agent completes.',
      'Related: Regression Agent (systemic), Blame Crawler, Forensic Database, System Invariants.'
    ]
  },
  {
    id: 'dead-tag-sub-agent',
    title: 'Dead Tag Sub-Agent: File-System Tag Verification (COMING SOON)',
    summary: 'Crawls tag registry against actual file system to find tags whose code no longer exists at the registered location.',
    tags: ['coming-soon', 'sub-agents', 'tag-registry', 'dead-tags', 'forensic', 'scheduler'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Dead Tag Sub-Agent scheduled scan results visible in Tag Registry panel.',
      'Purpose: Detect devtags in the registry that point to code that no longer exists on disk.',
      'Triggers: Scheduled crawl (configurable interval) and on-demand when invoked by Blame Crawler or Regression Agent.',
      'Process: For each devtag in registry, checks file and line location recorded; verifies code structure still exists there.',
      'Detection: Tags whose code no longer exists at location flagged as devtag:dead_code.',
      'Retention: Dead tags not immediately deleted — marked dead and written to dead_tags forensic table; Blame Crawler notified.',
      'Auto-Retirement: If dead tag not resolved within 10 cycles, Tag Retirement Chart process triggered automatically.',
      'Related: Tag Registry, Tag Retirement, Blame Crawler, Forensic Database.'
    ]
  },
  {
    id: 'context-window-manager',
    title: 'Context Window Manager Sub-Agent (COMING SOON)',
    summary: 'Chunks and prioritizes crawl outputs to fit within model tier token ceilings, tracks excluded tags, and enables on-demand tag retrieval.',
    tags: ['coming-soon', 'sub-agents', 'chunking', 'context', 'model-tiers', 'token-budget'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Context Window Manager exclusion log showing which tags were dropped from each chunk and why.',
      'Purpose: All crawl outputs that exceed the target model tier token ceiling must be chunked by this agent before delivery.',
      'Priority Function: Tags directly referenced in current buildtag/plantag set rank highest; relationship tags to those rank second; all others ranked by recency in forensic database.',
      'Chunk Delivery: Tags included in rank order until tier ceiling is reached.',
      'Exclusion Log: Every excluded tag logged with reason; accessible via resolve_excluded_tags(cycle_id) for on-demand retrieval.',
      'No Silent Exclusion: System Invariant — every excluded tag must be logged. No silent drops allowed.',
      'Model Tier Ceilings: Tier 1 (nano) = 2000 tokens; Tier 2 (7B-13B) = 6000; Tier 3 (30B-70B) = 16000; Tier 4 (standard cloud) = 80000; Tier 5 (extended cloud) = 160000.',
      'Related: Model Size Constraint Chart, Agent Spawn Authority, all crawler sub-agents.'
    ]
  },
  {
    id: 'integration-verification-sub-agent',
    title: 'Integration Verification Sub-Agent (COMING SOON)',
    summary: 'After Builder writes a file, crawls all relationship tags to verify connected devtags still exist and are accessible.',
    tags: ['coming-soon', 'build-layer', 'sub-agents', 'integration', 'relationships', 'post-write'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Integration Verification Sub-Agent results visible in forensic integration_failures table.',
      'Purpose: Verify that newly-written code\'s declared relationships (calls, inherits, implements, etc.) are still valid.',
      'Trigger: After Builder writes a file and Diff Sub-Agent promotes the pending registry partition.',
      'Process: Crawls all relationship tags connected to newly-written/modified devtags; verifies connected targets exist and are accessible.',
      'Failure Conditions: Connected devtag missing, inaccessible from new file location, or changed to incompatible type.',
      'Response: Integration failure written to integration_failures table; Blame Crawler notified.',
      'No Auto-Revert: Step marked integration-incomplete but NOT reverted unless severity is critical/fatal per Severity Escalation Chart.',
      'Related: Diff Sub-Agent, Blame Crawler, Severity Escalation, Forensic Database, Relationship Tags.'
    ]
  },
  {
    id: 'version-control-agent',
    title: 'Version Control Agent (COMING SOON)',
    summary: 'Persistent agent recording every committed build step as a versioned commit with full devtag before/after state and rollback index.',
    tags: ['coming-soon', 'agents', 'version-control', 'rollback', 'audit', 'commits'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Version commit history browser integrated into Checkpoints panel.',
      'Purpose: Give every build step a unique commit ID and full recovery path via rollback index.',
      'Commit Record Schema: commit_id, buildtag_set, devtag_state_before, devtag_state_after, plantags_satisfied, agent_id, timestamp, reverted, revert_timestamp.',
      'Devtag Annotation: Every modified devtag receives devtag:version:[commit_id] annotation at commit time.',
      'Rollback: revert_to_commit(commit_id) → reconstruct pre-commit devtag state → issue buildtag:revert tags → instruct Builder to undo file changes → update registry.',
      'Authority: God Factory Self-Improvement Agent can invoke revert_to_commit at any time with absolute authority.',
      'Forensic Storage: All commits and reversions logged to version_commits table.',
      'Relationship to Checkpoints: Version Control Agent is the specification-level concept; current Checkpoints UI is the implemented surface. Both serve recovery goals at different granularities.',
      'Related: Builder Agent, Checkpoints, God Factory, Forensic Database, System Invariants.'
    ]
  },
  {
    id: 'parallel-coordinator-agent',
    title: 'Parallel Coordinator Agent (COMING SOON)',
    summary: 'Preventively partitions action plans into parallel-safe and parallel-unsafe sets before assigning steps to fleet agents.',
    tags: ['coming-soon', 'agents', 'fleet', 'parallel', 'coordination', 'deadlock-prevention'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Parallel Coordinator assignment map showing which steps run concurrently and which are sequenced.',
      'Purpose: Prevent deadlocks before they occur by analyzing the full action plan before fleet assignments.',
      'Parallel-Safe Determination: Steps that share no devtag relationships in their buildtag sets can run simultaneously.',
      'Sequential Determination: Steps sharing any devtag in buildtag sets are sequenced.',
      'Assignment Safety: Checks Conflict Sub-Agent lock registry before every fleet step assignment.',
      'Stall Detection: If a Fleet Agent makes no commits/failures for 5 cycles, status request is sent.',
      'Stall Escalation: No response within 2 additional cycles → agent flagged dead, devtag claims released, Command Agent notified.',
      'Forced Resolution: If held steps exceed 10-cycle timeout from Conflict Sub-Agent, Parallel Coordinator forces queue resolution.',
      'Related: Conflict Sub-Agent, Fleet Agents, Command Agent, Build Layer.'
    ]
  },
  {
    id: 'regression-agent',
    title: 'Regression Agent: Systemic Regression Tracking (COMING SOON)',
    summary: 'Persistent agent detecting regression PATTERNS across all cycles — not individual regressions, but systemic trends and heat maps.',
    tags: ['coming-soon', 'agents', 'regression', 'patterns', 'heat-map', 'systemic'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Regression heat map and systemic regression report accessible from Forensic panel.',
      'Purpose: Where Regression Sub-Agent detects per-step regressions, Regression Agent detects patterns across cycles.',
      'Threshold: 3 regressions in 5 cycles for any dimension (devtag, file, agent ID, build phase) triggers systemic regression flag.',
      'Report to God Factory: Structured report with affected devtag chain, buildtag history, agent IDs involved, and suggested plantag:regression_guard recommendations.',
      'Heat Map: Regression density per file expressed as tag-density score; files above threshold marked devtag:needs_review.',
      'Deprioritization: High-regression-density files excluded from new build step assignments until density drops.',
      'Forensic Logging: All systemic regressions written to systemic_regressions table.',
      'Related: Regression Sub-Agent, God Factory, Blame Crawler, Tag Registry, Forensic Database.'
    ]
  },
  {
    id: 'nano-liaison-agent',
    title: 'Nano Liaison Agent: Nano Sea ↔ Tag Registry Bridge (COMING SOON)',
    summary: 'Bidirectional translator between nano sea internal state and devtag:nano vocabulary, monitoring nano anomalies in real-time.',
    tags: ['coming-soon', 'agents', 'nano-sea-v2', 'bridge', 'translation', 'anomalies'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Nano Liaison translation log and anomaly feed in Nano Sea panel.',
      'Purpose: Make nano sea code visible to the tag validator and forensic database by translating internal state to devtag:nano tags.',
      'Inbound: When nano sea completes a cycle, Nano Liaison reads updated internal state, translates to devtag:nano tags, registers in tag registry.',
      'Outbound: When Fleet Agents-Nano step is assigned a buildtag set, Nano Liaison translates devtag:nano references into nano sea internal state representations.',
      'Anomaly Detection: Monitors nano cycle outputs for weight matrices with NaN/Inf values, generation cycles with identical outputs, RBY loops stalling in single phase.',
      'Anomaly Response: Written to nano_anomalies forensic table; Fleet Agents-Nano and Midwife Bird-Feeding flagged.',
      'Weight Protection: Nano Liaison can READ devtag:nano:weight:frozen and devtag:nano:weight:personal but cannot modify them directly. All nano weight modifications must pass standard buildtag validation.',
      'System Invariant: Every devtag:nano tag written by Fleet Agents-Nano must have a valid Nano Liaison translation before the step is marked complete.',
      'Related: Fleet Agents-Nano, Nano Sea v2 Roadmap, Tag Registry, Forensic Database.'
    ]
  },
  {
    id: 'model-size-constraint-chart',
    title: 'Model Size Constraint Chart: Tier 1–5 Token Ceilings (COMING SOON)',
    summary: 'Five model tiers with safe token ceilings at 80% of published context limits, governing agent role assignments.',
    tags: ['coming-soon', 'agents', 'model-tiers', 'context-window', 'chunking', 'policy'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Tier assignment visualizer showing each agent\'s assigned tier and safe ceiling.',
      'Tier 1 — Nano/Small Local: Safe ceiling 2000 tokens (Memory Crawler sub-agents spawned by Fleet Agents-Nano).',
      'Tier 2 — Mid-Range Local (7B–13B): Safe ceiling 6000 tokens (Memory Crawler sub-agents spawned by Fleet Agents).',
      'Tier 3 — Large Local (30B–70B): Safe ceiling 16000 tokens (Fleet Agents, Waiting Sub-Agent, Nano Liaison Agent).',
      'Tier 4 — Standard Cloud (large hosted): Safe ceiling 80000 tokens (Agent Agent-Loop, Skeptic Agent, Command Agent, Blame Crawler).',
      'Tier 5 — Extended Cloud: Safe ceiling 160000 tokens (God Factory Self-Improvement Agent).',
      'Safe Ceiling = 80% of published context limit (reserves space for system prompt, tool defs, output buffer).',
      'Override: God Factory can override any tier assignment per-operation with all overrides logged.',
      'Related: Context Window Manager Sub-Agent, Agent Spawn Authority, Agent Architecture.'
    ]
  },
  {
    id: 'failure-escalation-chart',
    title: 'Failure Escalation Chart: Level 1–5 Escalation Path (COMING SOON)',
    summary: 'Five-level escalation from Builder retry to God Factory intervention, defining the exact path when build steps fail repeatedly.',
    tags: ['coming-soon', 'agents', 'escalation', 'failures', 'policy', 'god-factory'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Failure escalation status indicator in Agent event feed showing current escalation level.',
      'Level 1: Builder Agent fails 1–2 times → retries the same decided step.',
      'Level 2: Builder Agent fails 3 times → step returned to Command Agent as failed; logged to forensic database; Skeptic Agent cycle restarts with failure as additional input.',
      'Level 3: Command Agent receives same step failed twice → decomposes step into smaller sub-steps; restarts voting on first sub-step.',
      'Level 4: Decomposed sub-steps fail 3+ times → entire action plan suspended; flagged to God Factory Self-Improvement Agent with full forensic context.',
      'Level 5: God Factory unable to resolve within one of its own cycles → affected plantag marked plantag:status:blocked; user notified through memory tab with blocking devtag chain.',
      'Forensic Severity Levels: info (logged only) → warning (Blame Crawler at next crawl) → error (Blame Crawler immediately, Skeptic flagged) → critical (cycle halted, Command Agent notified, Skeptic spawned) → fatal (cycle halted, God Factory invoked, user notified).',
      'Related: Builder Agent, Command Agent, Skeptic Agent, God Factory, Forensic Database, Severity Escalation Chart.'
    ]
  },
  {
    id: 'severity-escalation-chart',
    title: 'Severity Escalation: Automatic Condition Triggers (COMING SOON)',
    summary: 'Conditions that automatically promote forensic entries from warning → error → critical → fatal regardless of agent decision.',
    tags: ['coming-soon', 'forensic', 'escalation', 'severity', 'policy', 'safety'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Severity escalation event log in Forensic database showing every auto-escalation and its trigger.',
      'Rule 1: Same-file warning in 3+ consecutive build cycles → auto-escalates to error.',
      'Rule 2: Error previously logged as warning → escalates to critical on second occurrence.',
      'Rule 3: Any tag mismatch involving devtag:perf_critical or devtag:security_requirement → automatically critical.',
      'Rule 4: Circular dependency between two devtag:perf_critical components → automatically fatal.',
      'Rule 5: Any forensic entry involving devtag:nano component that is also devtag:breaking_change → escalates to critical.',
      'Rule 6: Builder Agent retry that produces a different tag mismatch on each attempt (non-deterministic output) → automatically critical.',
      'Related: Failure Escalation Chart, Forensic Database, Tag Taxonomy, Performance Tags, Security Tags.'
    ]
  },
  {
    id: 'tag-retirement-chart',
    title: 'Tag Retirement: Seven-Step Retirement Process (COMING SOON)',
    summary: 'Mandatory seven-step process when a devtag is retired due to file deletion, rename, or restructure — prevents orphaned buildtags and plantags.',
    tags: ['coming-soon', 'tag-registry', 'retirement', 'lifecycle', 'orphans', 'policy'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Tag retirement wizard accessible from Tag Registry panel for controlled devtag lifecycle management.',
      'Step 1: Retiring agent calls retire_devtag(tag_id) on tag registry service.',
      'Step 2: Registry queries all buildtags referencing this devtag → marks all matching buildtags as buildtag:orphaned.',
      'Step 3: Registry queries all plantags referencing this devtag via plantag:requires or plantag:produces → marks matching plantags as plantag:status:blocked with blocking reason set to the retired tag ID.',
      'Step 4: Registry queries all relationship tags (calls, depends_on, etc.) referencing this devtag → marks all as devtag:orphaned.',
      'Step 5: All orphaned entries written to forensic database as tag_mismatches with severity error.',
      'Step 6: Blame Crawler notified immediately.',
      'Step 7: Dead tag retained in registry with status:retired for 30 cycles before permanent deletion (allows rollback via buildtag:revert).',
      'Related: Dead Tag Sub-Agent, Tag Registry, Blame Crawler, Forensic Database, Version Control Agent.'
    ]
  },
  {
    id: 'relationship-tag-vocabulary',
    title: 'Relationship Tag Vocabulary (COMING SOON)',
    summary: 'Structural relationship devtags expressing how components call, inherit, implement, compose, subscribe, publish, read, write, proxy, and delegate.',
    tags: ['coming-soon', 'tag-taxonomy', 'relationship-tags', 'devtags', 'vocabulary', 'structural'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Relationship tag browser in Tag Registry panel with visual dependency graph.',
      'Purpose: Express component relationships structurally so Skeptic Agent, Conflict Sub-Agent, and Regression Sub-Agent can reason about dependencies without reading raw code.',
      'devtag:calls:[caller]:[callee] — function/method invocation relationship.',
      'devtag:inherits:[child]:[parent] — class inheritance.',
      'devtag:implements:[class]:[interface] — interface implementation.',
      'devtag:composes:[host]:[guest] — composition relationship.',
      'devtag:depends_on:[a]:[b] — dependency declaration.',
      'devtag:injected_into:[dependency]:[target] — dependency injection.',
      'devtag:overrides:[child]:[parent_method] — method override.',
      'devtag:extends:[child]:[parent] — extension relationship.',
      'devtag:mixes_in:[target]:[mixin] — mixin application.',
      'devtag:subscribes_to:[subscriber]:[event] — event subscription.',
      'devtag:publishes:[publisher]:[event] — event publication.',
      'devtag:reads_from:[consumer]:[store_or_state] — state read.',
      'devtag:writes_to:[producer]:[store_or_state] — state write.',
      'devtag:proxies:[proxy]:[target] — proxy wrapping.',
      'devtag:wraps:[wrapper]:[wrapped] — wrapper pattern.',
      'devtag:delegates_to:[delegator]:[delegate] — delegation pattern.',
      'Tag Relationship Schema: Legal peer relationships include calls (both sides must be function/method), depends_on (both must exist in registry), subscribes_to/publishes (event must exist as devtag:event).',
      'Related: Tag Registry, Tag Relationship Schema, Conflict Sub-Agent, Regression Sub-Agent.'
    ]
  },
  {
    id: 'nano-sea-tag-vocabulary',
    title: 'Nano Sea Tag Vocabulary (COMING SOON)',
    summary: 'Complete devtag:nano vocabulary making nano sea components visible to the tag validator, forensic database, and Nano Liaison Agent.',
    tags: ['coming-soon', 'tag-taxonomy', 'nano-tags', 'devtags', 'vocabulary', 'nano-sea-v2'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Nano tag browser in Tag Registry panel showing all registered nano sea tags.',
      'Purpose: Without nano tags, any code generated or modified by the nano sea is invisible to the tag validator and forensic database.',
      'Module/Layer/Node: devtag:nano:module:[name], devtag:nano:layer:[name], devtag:nano:node:[name] — hierarchy for nano architecture.',
      'Weight Tags: devtag:nano:weight:frozen:[matrix_name], devtag:nano:weight:personal:[matrix_name] — differentiate frozen vs trainable weights.',
      'Lifecycle Tags: devtag:nano:cycle:[n], devtag:nano:generation:[n], devtag:nano:deposit:[name] — track cosmic cycle state.',
      'Anomaly Tags: devtag:nano:absularity:[name], devtag:nano:absoleice:[name] — flag absularity and absoleice events in nano sea.',
      'RBY Tags: devtag:nano:rby:r:[component], devtag:nano:rby:b:[component], devtag:nano:rby:y:[component] — mark RBY-simplex positions (Red=abstraction, Blue=domain, Yellow=style).',
      'Advanced Tags: devtag:nano:icae:[fractal_name], devtag:nano:trifecta:[name], devtag:nano:infection:[name] — fractal and trifecta constructs.',
      'Training Tags: devtag:nano:training_target:[name], devtag:nano:replay_buffer:[name], devtag:nano:fitness:[metric] — training state markers.',
      'Parent-Child Rules: nano:node requires parent nano:layer; nano:layer requires parent nano:module; nano:weight:frozen and nano:weight:personal require parent nano:module; nano:rby:* require parent nano:trifecta.',
      'Related: Nano Liaison Agent, Fleet Agents-Nano, Tag Registry, Nano Sea v2 Roadmap, RBY-Simplex Routing.'
    ]
  },
  {
    id: 'attribution-tag-vocabulary',
    title: 'Attribution Tag Vocabulary (COMING SOON)',
    summary: 'Structural authorship markers written at code-creation time so blame is structural, not inferred post-hoc.',
    tags: ['coming-soon', 'tag-taxonomy', 'attribution-tags', 'devtags', 'blame', 'authorship'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Attribution tag stats in BLAME panel showing % agent-generated vs human-generated vs hybrid per codebase area.',
      'Purpose: Blame Crawler identifies model quality by crawling blame records; attribution tags make authorship visible at the code level without inference.',
      'devtag:agent_generated:[agent_id] — code created entirely by named agent.',
      'devtag:human_generated — code written entirely by human developer.',
      'devtag:hybrid_generated:[agent_id] — code created collaboratively; named agent made significant edits.',
      'devtag:last_modified_by:[agent_id] — last modification attribution.',
      'devtag:created_by:[agent_id] — original creation attribution.',
      'devtag:reviewed_by:[agent_id] — reviewed and approved by named agent or human.',
      'Write-Time Requirement: Attribution tags must be written at the same time as the code they describe.',
      'Related: Blame Crawler, BLAME Panel, Quality Dimensions Framework, Forensic Database.'
    ]
  },
  {
    id: 'performance-versioning-tag-vocabulary',
    title: 'Performance, Versioning, and File System Tags (COMING SOON)',
    summary: 'Performance sensitivity, version state, and file system structure tags enabling scrutiny thresholds and breaking-change detection.',
    tags: ['coming-soon', 'tag-taxonomy', 'performance-tags', 'versioning-tags', 'filesystem-tags', 'devtags'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Tag browser for performance, versioning, and file system tag families in Tag Registry.',
      'Performance Sensitivity Tags: devtag:perf_critical, devtag:memory_bound, devtag:io_bound, devtag:latency_sensitive, devtag:cpu_bound, devtag:throughput_critical, devtag:realtime, devtag:batch_tolerant, devtag:hot_path, devtag:cold_path. These allow Skeptic Agent to apply different scrutiny thresholds per component.',
      'Versioning Tags: devtag:version:[semver], devtag:deprecated:[name], devtag:breaking_change:[name], devtag:experimental:[name], devtag:stable:[name], devtag:internal:[name], devtag:public_api:[name], devtag:legacy:[name], devtag:migration_required:[name]. Without these, no agent can determine if an edit introduces a breaking change.',
      'File System Structure Tags: devtag:directory:[path], devtag:file:[path], devtag:symlink:[path]:[target], devtag:generated_file:[path], devtag:config_file:[path], devtag:test_file:[path], devtag:data_file:[path], devtag:asset_file:[path]. Required by Context Window Manager and Dead Tag Sub-Agent.',
      'Auto-Escalation: Any tag mismatch involving devtag:perf_critical or devtag:security_requirement is automatically severity=critical. Circular dependency between two perf_critical components is automatically fatal.',
      'Related: Tag Registry, Skeptic Agent, Severity Escalation Chart, Nano Sea Tags, Attribution Tags.'
    ]
  },
  {
    id: 'extended-plantag-buildtag-vocabulary',
    title: 'Extended Plantag and Buildtag Vocabulary (COMING SOON)',
    summary: 'Additional plantag and buildtag types from the memory system addendum including test requirements, performance targets, regression guards, and new build operations.',
    tags: ['coming-soon', 'tag-taxonomy', 'plantags', 'buildtags', 'vocabulary', 'addendum'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Plantag and buildtag vocabulary browser in Tag Registry panel showing all extended types.',
      'Additional Plantags: plantag:test_required:[devtag] (test required before this devtag can be marked done), plantag:performance_target:[metric]:[value], plantag:regression_guard:[devtag], plantag:version_target:[semver], plantag:security_requirement:[name], plantag:nano_required:[component], plantag:compatibility:[platform], plantag:coverage_required:[percent], plantag:review_required:[agent_id].',
      'Coordination Plantags: plantag:parallel_safe (step can run concurrently with others), plantag:parallel_unsafe (step must run alone), plantag:rollback_point (create version snapshot here), plantag:debt_ceiling:[score] (max debt allowed for this step).',
      'Additional Buildtags: buildtag:test:[devtag], buildtag:document:[devtag], buildtag:deprecate:[devtag], buildtag:revert:[buildtag_id], buildtag:optimize:[devtag], buildtag:secure:[devtag], buildtag:annotate:[devtag]:[tag].',
      'Lifecycle Buildtags: buildtag:migrate:[devtag_old]:[devtag_new], buildtag:retire:[devtag], buildtag:register:[devtag], buildtag:lock:[devtag], buildtag:unlock:[devtag].',
      'Claim Buildtags: buildtag:checkpoint:[plantag], buildtag:claim:[devtag]:[agent_id], buildtag:release:[devtag]:[agent_id].',
      'Related: Tag Registry, Tag Relationship Schema, Conflict Sub-Agent, Version Control Agent, Parallel Coordinator Agent.'
    ]
  },
  {
    id: 'tag-relationship-schema',
    title: 'Tag Relationship Schema: Parent-Child and Peer Rules (COMING SOON)',
    summary: 'Deterministic constraint table enforced by the tag validator defining which devtags can legally reference which other devtags.',
    tags: ['coming-soon', 'tag-taxonomy', 'validation', 'schema', 'parent-child', 'peer-rules'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Tag relationship schema validator accessible from Tag Registry Rules tab.',
      'Purpose: Tag validator checks devtag existence; Tag Relationship Schema checks whether the reference itself is structurally legal.',
      'Legal Parent-Child: devtag:method requires parent devtag:class; devtag:field requires parent devtag:schema or devtag:model; devtag:prop requires parent devtag:component; devtag:stage requires parent devtag:pipeline.',
      'Nano Parent-Child: devtag:nano:node requires parent devtag:nano:layer; devtag:nano:layer requires parent devtag:nano:module; nano:weight:frozen and nano:weight:personal require parent nano:module; nano:rby:* require parent nano:trifecta.',
      'Relationship Parent-Child: devtag:symlink requires target devtag:file or devtag:directory; devtag:overrides requires parent devtag:inherits or devtag:extends; devtag:injected_into requires target devtag:function, devtag:method, or devtag:class.',
      'Legal Peer Rules: devtag:calls requires both sides to exist as devtag:function or devtag:method; devtag:depends_on requires both sides in registry; devtag:circular_dependency valid only when both devtags exist AND depends_on chain between them is verified; devtag:subscribes_to and devtag:publishes require the event to exist as devtag:event.',
      'Violation: Any devtag written in violation of parent-child or peer rules is rejected before registry insertion.',
      'Related: Tag Registry, Relationship Tag Vocabulary, Tag Validator, Forensic Database.'
    ]
  },
  {
    id: 'forensic-database-all-tables',
    title: 'Forensic Database: Complete Table Registry (COMING SOON)',
    summary: 'All 45+ forensic tables across Core, Addendum, Blame, Gap Analysis, Project State Crawler, Suggested Jobs, and God Factory groups.',
    tags: ['coming-soon', 'forensic', 'database', 'tables', 'audit', 'comprehensive'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Unified forensic browser showing all table groups with row counts, severity distributions, and cross-table correlation.',
      'Core Tables (from base spec): failed_votes, tag_mismatches, spaghetti_index, under_engineered_regions, over_engineered_regions, missing_tests.',
      'Addendum Tables: regression_history, conflict_log, dead_tags, diff_failures, integration_failures, version_commits, nano_anomalies, spawn_violations, systemic_regressions.',
      'Blame Crawler Tables: blame_records, quality_records, tool_criticism, success_attribution, model_registry.',
      'Gap Analysis Tables: coverage_matrix, pattern_records, debt_history, tag_vocabulary_gaps, agent_performance_records.',
      'Project State Crawler Tables: ground_truth_snapshots, drift_events, language_registry, skipped_files, crawler_runs.',
      'Suggested Jobs Tables: job_records, sandbox_runs, implementation_log, crash_recovery_log, job_steps, job_merge_log.',
      'God Factory Tables: notification_queue, idle_suggestions, god_factory_actions, brainstorm_submissions, background_scan_log.',
      'Invariant: No forensic entry may ever be deleted. Entries may be marked resolved/archived but never purged.',
      'Related: Forensic Panel (current UI), Blame Panel, Gap Analysis, Project State Crawler, Suggested Jobs.'
    ]
  },
  {
    id: 'system-invariants',
    title: 'System Invariants: Absolute Rules the System Must Never Break (COMING SOON)',
    summary: 'Nine non-negotiable invariants from the unified spec addendum that govern agent behavior, file writes, fleet safety, and tag lifecycle.',
    tags: ['coming-soon', 'policy', 'invariants', 'safety', 'enforcement', 'unified-spec'],
    status: 'coming_soon',
    details: [
      'COMING SOON: System invariant health monitor showing pass/fail status for each invariant in every build cycle.',
      'Invariant 1 — Spawn Gate: No sub-agent may be spawned by an agent not listed in the Agent Spawn Authority Chart. Violations logged to spawn_violations and the spawn is blocked.',
      'Invariant 2 — Diff Before Write: No file write may occur until Diff Sub-Agent has verified that the predicted post-edit devtag state satisfies the required plantag state.',
      'Invariant 3 — Fleet Claim Release: No Fleet Agent may begin a step while it holds any devtag claim from a prior step that has not been released.',
      'Invariant 4 — Tag Retirement Order: No devtag may be retired without completing all seven steps of the Tag Retirement Chart in order.',
      'Invariant 5 — Conflict Gate: Conflict Sub-Agent must be consulted before any fleet step assignment. No step may be assigned if its buildtag set conflicts with any active devtag claim.',
      'Invariant 6 — Commit Recording: Version Control Agent must receive and record every committed build step before the build cycle is marked complete.',
      'Invariant 7 — Nano Translation: Nano Liaison Agent must verify that every devtag:nano tag written by Fleet Agents-Nano has a valid translation in nano sea internal state before the step is marked complete.',
      'Invariant 8 — Regression Mandatory: Regression detection is mandatory after every committed build step. No subsequent step may begin in the same decision cycle until Regression Sub-Agent completes.',
      'Invariant 9 — No Silent Exclusion: Context Window Manager must log every excluded tag for every chunking operation.',
      'Related: Agent Spawn Authority, Diff Sub-Agent, Conflict Sub-Agent, Tag Retirement, Version Control Agent, Nano Liaison Agent, Regression Sub-Agent, Context Window Manager.'
    ]
  },
  {
    id: 'agent-loop-event-types',
    title: 'Agent Loop Event Types and State Machine',
    summary: 'All event types emitted by the agent loop: state changes, step lifecycle, schema errors, loop detection, self-reflection, halt conditions, and cooldowns.',
    tags: ['agent-loop', 'diagnostics', 'events', 'state-machine', 'monitoring', 'observable'],
    status: 'active',
    details: [
      'The agent loop emits structured events with timestamps and event type labels, visible in the Agent event feed.',
      'State Change Events: [state_change] executing → agent step running; [state_change] evaluating → agent processing output; [state_change] complete → loop finished; [state_change] error → halt condition reached.',
      'Step Lifecycle: [step_start] step description and target path; [step_complete] step accepted; [step_content] content generated; [dataset_update] training dataset updated; [timing_update] timing recorded.',
      'Loop Detection: [loop_detected] fires when the same task is repeated 3+ times. Breakout attempt counter increments. Web search context injected to break the loop.',
      'Loop Breakout: [info] 🔄 LOOP BREAKOUT (attempt #N) — automatically rewrites the stuck task with fresh web context. Maximum 3 breakout attempts before escalation.',
      'Schema Miss: [info] Schema miss #N — model did not return structured JSON output block (no file changes). After 3 consecutive schema misses the loop falls back to a simplified prompt format.',
      'Self-Reflection: [info] 🔍 Self-reflection at iteration N — triggered at iteration 10, 20, 30, etc. Agent reviews its own output quality and adjusts strategy.',
      'Halt Condition: [error] Agent halted: N consecutive iterations with zero file changes. Default threshold: 15. Halted loop requires manual restart or task reformulation.',
      'Cooldown: [cooldown] — mandatory pause between state transitions, preventing runaway API calls. Duration scales with model tier.',
      'Nano Training Events: [info] Nano training observe failed — nano sea training endpoint unreachable during observe phase. Non-fatal; loop continues without nano feedback signal.',
      'See: BLAME panel for quality attribution of each completed step; Forensic Database for logged halt events.'
    ]
  },
  {
    id: 'mega-prompt-system',
    title: 'Mega Prompt System: Generation, Chunking, and Management',
    summary: 'Curated and auto-generated large prompts for complex agent tasks — with context-aware chunking, model selection, and archive management.',
    tags: ['agent-loop', 'mega-prompts', 'chunking', 'context-management', 'prompts'],
    status: 'active',
    details: [
      'Mega Prompts are large-scale task prompts used to launch complex agent runs from the Mega Prompts panel inside Agent Settings.',
      'Custom Mega Prompts: Enter any prompt and save it. Saved prompts are stored in localStorage and appear in the Mega Prompts list.',
      'Preset Mega Prompts: Curated templates for games, SaaS platforms, bots, CLI tools, REST APIs, and more.',
      'Archive / Remove: Saved custom mega prompts can be archived or removed from the list. ⚠ NOTE (known issue): Archive/Remove action is currently only partially implemented — see mega_prompt_problems.txt feedback. If remove does not work from the UI, clear the mega-prompts localStorage key to reset.',
      'COMING SOON — Intelligent Generation: Current behavior concatenates prompt history. Planned behavior: agent reads all selected history entries, chunks them to stay within 35% of the current model token limit, and uses the full chunked context to synthesize a coherent mega prompt.',
      'COMING SOON — Model Selection for Generation: When generating a mega prompt from history, the system will ask whether to use a cloud model (higher quality synthesis) or a local model (privacy/cost) and execute accordingly.',
      'COMING SOON — Token-Aware Chunking: If a single prompt history entry exceeds 35% of the token limit, it will be chunked with the Context Window Manager Sub-Agent before synthesis.',
      'See: Agent Settings Panel, Mega Prompts Panel anchor, Context Window Manager Sub-Agent, Model Size Constraint Chart.'
    ]
  },
  {
    id: 'skeptic-agent-forensic-loop',
    title: 'Skeptic Agent: Forensic Sub-Crawler Loop (COMING SOON)',
    summary: 'Skeptic Agent populates forensic database via sub-crawlers and decision agents, running up to 5 refinement iterations before passing state to Command Agent.',
    tags: ['coming-soon', 'build-layer', 'skeptic-agent', 'forensic', 'sub-crawlers', 'refinement'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Skeptic Agent refinement cycle counter and forensic population log in Agent event feed.',
      'Purpose: Challenge the Waiting Sub-Agent output for structural errors, incomplete work, AI slop, spaghetti logic, and over/under-engineering.',
      'Sub-Crawlers: Skeptic Agent spawns multiple focused sub-agent crawlers that read data at granularity as fine as individual lines of code.',
      'Decision Agents: Sub-crawlers populate the forensic database; Decision Agents crawl the forensic database and feed results back to Skeptic Agent.',
      'Forensic Tables Populated: failed_votes, tag_mismatches, spaghetti_index, under_engineered_regions, over_engineered_regions, missing_tests (and more from addendum).',
      'Refinement Cycle: Skeptic Agent uses Decision Agent results to feed corrections back to Waiting Sub-Agent → Waiting Sub-Agent refines → re-enters cycle.',
      'Cycle Limit: Maximum 5 refinement iterations by default (configurable per-session).',
      'Manual Stop Behavior: If stopped manually during refinement, loop goes to previous or next checkpoint then terminates (prevents state corruption).',
      '24/7 Mode: Can be set to run continuously without iteration limit; still stops gracefully to checkpoint if interrupted.',
      'After Max Iterations: Current refined state sent to Command Agent regardless of remaining issues. Unresolved issues logged to forensic database and flagged to God Factory.',
      'Related: Waiting State Detail, Command Agent, Forensic Database, God Factory, Failure Escalation Chart.'
    ]
  },
  {
    id: 'help-agent',
    title: 'Help Agent: In-System Documentation Assistant (COMING SOON)',
    summary: 'Dedicated conversational agent that crawls the help menu to provide HOW TO, WHAT IS, and WHERE assistance to users.',
    tags: ['coming-soon', 'agents', 'help-system', 'assistant', 'documentation', 'navigation'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Help Agent chat interface embedded in the Help panel for conversational feature discovery.',
      'Purpose: Give users a conversational entry point to the help system — ask "how do I run a blame crawl?" and get a direct answer with navigation links.',
      'Memory Scope: TOTAL — can access all memory sources and full system state to give context-aware answers.',
      'Spawn Authority: Help Agent may spawn Memory Crawler and Context Window Manager Sub-Agent.',
      'Cannot be accessed by: Agent Agent-Loop and Fleet Agents (excluded from Help Agent memory per Unified Spec).',
      'Interaction Types: HOW TO questions (step-by-step), WHAT IS questions (feature explanation), WHERE questions (navigation links to panels and controls).',
      'Context Crawling: On receiving a question, Help Agent crawls help registry, current panel state, and relevant memory to produce a grounded answer.',
      'Current State: Current Help panel is registry-driven documentation with search. Help Agent chat layer is not yet implemented.',
      'Related: Help System, Memory Scope Enforcement, Agent Spawn Authority, Help Panel.'
    ]
  },
  {
    id: 'agent-routers',
    title: 'Agent Routers: Task Distribution Layer (COMING SOON)',
    summary: 'Routes tasks between agents based on context, authority, and workload — sits between orchestrator and worker agents.',
    tags: ['coming-soon', 'agents', 'routing', 'orchestration', 'dispatch', 'memory-total'],
    status: 'coming_soon',
    details: [
      'COMING SOON: Agent Router monitoring dashboard showing active routing decisions and queue state.',
      'Purpose: Prevent God Factory and user from needing to know which specific agent handles each task class.',
      'Memory Scope: TOTAL — Agent Routers have unrestricted access to all memory sources.',
      'Spawn Authority: Agent Routers may spawn any agent or sub-agent they are authorized to route to. They do not spawn processing agents directly.',
      'Routing Signals: Task type, complexity estimate, current model tier availability, agent workload, security level, memory scope requirements.',
      'Relationship to Fleet: Agent Routers decide WHICH fleet agents to activate and for WHICH tasks. Different from Parallel Coordinator which manages STEP ASSIGNMENT within an active fleet run.',
      'Cannot be accessed by: Agent Agent-Loop and Fleet Agents (excluded from Agent Routers memory per Unified Spec).',
      'Related: Agent Spawn Authority, Fleet Agents, Parallel Coordinator Agent, Model Size Constraint Chart, Memory Scope Enforcement.'
    ]
  },
  {
    id: 'midwife-bird-feeding',
    title: 'Midwife Bird-Feeding: Dataset Production for Nano Training',
    summary: 'Generates structured training datasets for the nano sea by feeding models structured prompts and capturing high-quality outputs.',
    tags: ['midwife', 'nano-sea-v2', 'training', 'datasets', 'fleet-agents-nano', 'memory-total'],
    status: 'active',
    details: [
      'Midwife Bird-Feeding is the data production system for nano sea training — it "feeds" models structured prompts and captures their outputs as training examples.',
      'Memory Scope: TOTAL — Midwife has unrestricted access to all memory sources, so it can target training data at any area of the system.',
      'Spawn Authority: Midwife may spawn Memory Crawler and Context Window Manager Sub-Agent.',
      'Task Tab: Configure training tasks with model assignment, prompt structure, enable/disable per task.',
      'Config Tab: Set feeding model, interval, max tokens per session, and concurrency level.',
      'History Tab: Review past feeding sessions, inspect generated outputs, and flag low-quality examples.',
      'Exclude Broken on Start: Skips models flagged as failed before starting a session — prevents wasted training cycles.',
      'Integration: Midwife outputs feed directly into Fleet Agents-Nano training pipelines.',
      'Coming Soon — Blame Integration: High-quality blame records will automatically seed Midwife task queues with examples of strong model behavior for reinforcement.',
      'Coming Soon — Nano Targeting: Midwife will support targeted nano training — feed only nanos that score low on specific quality dimensions.',
      'Related: Nano Sea, Fleet Agents-Nano, BLAME panel, Cosmic Cycles, Quality Dimensions.'
    ]
  }
];

export const HELP_ANCHORS: Record<string, HelpAnchor> = {
  'activity.studio': { id: 'activity.studio', label: 'Studio Icon', quickTip: 'Opens THE GOD FACTORY full-width workspace.', sectionId: 'activity-bar', view: 'studio' },
  'activity.explorer': { id: 'activity.explorer', label: 'Explorer Icon', quickTip: 'Shows project and file navigation.', sectionId: 'activity-bar', view: 'explorer' },
  'activity.chat': { id: 'activity.chat', label: 'Chat Icon', quickTip: 'Opens conversation sidebar and chat context.', sectionId: 'activity-bar', view: 'chat' },
  'activity.agent': { id: 'activity.agent', label: 'Agent Icon', quickTip: 'Opens Project Factory agent controls.', sectionId: 'activity-bar', view: 'agent' },
  'activity.preview': { id: 'activity.preview', label: 'Preview Icon', quickTip: 'Switches to preview-related side content.', sectionId: 'activity-bar', view: 'preview' },
  'activity.fleet': { id: 'activity.fleet', label: 'Fleet Icon', quickTip: 'Opens multi-agent fleet management panel.', sectionId: 'activity-bar', view: 'fleet' },
  'activity.nano': { id: 'activity.nano', label: 'Nano Icon', quickTip: 'Opens Nano Sea controls entry point.', sectionId: 'activity-bar', view: 'nano' },
  'activity.midwife': { id: 'activity.midwife', label: 'Midwife Icon', quickTip: 'Opens Midwife training panel entry point.', sectionId: 'activity-bar', view: 'midwife' },
  'activity.memory': { id: 'activity.memory', label: 'Memory Icon', quickTip: 'Opens project memory notes and search.', sectionId: 'activity-bar', view: 'memory' },
  'activity.checkpoints': { id: 'activity.checkpoints', label: 'Checkpoints Icon', quickTip: 'Opens snapshot and restore history.', sectionId: 'activity-bar', view: 'checkpoints' },
  'activity.strategy': { id: 'activity.strategy', label: 'Strategy Icon', quickTip: 'Opens model strategy and fallback controls.', sectionId: 'activity-bar', view: 'strategy' },
  'activity.rates': { id: 'activity.rates', label: 'Rate Limits Icon', quickTip: 'Opens provider limits and usage dashboard.', sectionId: 'activity-bar', view: 'rates' },
  'activity.blame': { id: 'activity.blame', label: 'BLAME Icon', quickTip: 'Opens model quality attribution panel.', sectionId: 'activity-bar', view: 'blame' },
  'activity.local-models': { id: 'activity.local-models', label: 'Local Models Icon', quickTip: 'Opens local model catalog panel.', sectionId: 'activity-bar', view: 'local-models' },
  'activity.tags': { id: 'activity.tags', label: 'Tags Icon', quickTip: 'Opens Devtag/Plantag/Buildtag registry.', sectionId: 'advanced-panels', view: 'tags' },
  'activity.forensic': { id: 'activity.forensic', label: 'Forensic Icon', quickTip: 'Opens forensic audit database views.', sectionId: 'advanced-panels', view: 'forensic' },
  'activity.gap': { id: 'activity.gap', label: 'Gap Analysis Icon', quickTip: 'Opens coverage, debt, and pattern analysis.', sectionId: 'advanced-panels', view: 'gap' },
  'activity.project-state-crawler': { id: 'activity.project-state-crawler', label: 'Project State Crawler Icon', quickTip: 'Opens crawler and drift detection controls.', sectionId: 'advanced-panels', view: 'project-state-crawler' },
  'activity.suggested-jobs': { id: 'activity.suggested-jobs', label: 'Suggested Jobs Icon', quickTip: 'Opens suggested jobs pipeline panel.', sectionId: 'advanced-panels', view: 'suggested-jobs' },
  'activity.help': { id: 'activity.help', label: 'Help Icon', quickTip: 'Opens this help system panel.', sectionId: 'overview', view: 'help' },
  'activity.providers': { id: 'activity.providers', label: 'Providers Icon', quickTip: 'Opens provider and setup entry panel.', sectionId: 'ai-systems', view: 'providers' },
  'activity.security': { id: 'activity.security', label: 'Security Icon', quickTip: 'Opens authentication and safety notes.', sectionId: 'security', view: 'security' },

  'top.new-project': { id: 'top.new-project', label: 'New Project Button', quickTip: 'Launches New Project wizard from top bar.', sectionId: 'explorer', view: 'explorer' },
  'top.mode.ask': { id: 'top.mode.ask', label: 'Ask Mode', quickTip: 'Chat Agent ask interaction for conversational Q&A over current project context.', sectionId: 'agent-architecture' },
  'top.mode.edit': { id: 'top.mode.edit', label: 'Edit Mode', quickTip: 'Chat Agent edit interaction focused on concrete file changes and patches.', sectionId: 'agent-architecture' },
  'top.mode.plan': { id: 'top.mode.plan', label: 'Plan Mode', quickTip: 'Chat Agent plan interaction for structured sequencing and implementation planning.', sectionId: 'agent-architecture' },
  'top.mode.agent': { id: 'top.mode.agent', label: 'Agent Mode', quickTip: 'Agent Agent-Loop behavior for autonomous multi-step execution in Project Factory.', sectionId: 'agent-architecture', view: 'agent' },
  'top.model-picker': { id: 'top.model-picker', label: 'Model Picker', quickTip: 'Selects active model used by current workflow.', sectionId: 'top-bar' },
  'top.nano-controls': { id: 'top.nano-controls', label: 'Nano Sea Controls Button', quickTip: 'Opens Nano Sea modal controls.', sectionId: 'ai-systems', view: 'nano' },
  'top.midwife-controls': { id: 'top.midwife-controls', label: 'Midwife Controls Button', quickTip: 'Opens Midwife bird-feeding controls.', sectionId: 'ai-systems', view: 'midwife' },
  'top.provider-settings': { id: 'top.provider-settings', label: 'Provider Settings Button', quickTip: 'Opens all provider settings and credentials.', sectionId: 'ai-systems', view: 'providers' },
  'top.user-menu': { id: 'top.user-menu', label: 'User Menu', quickTip: 'Shows account details and Sign Out action.', sectionId: 'security' },

  'editor.tab.code': { id: 'editor.tab.code', label: 'Code Tab', quickTip: 'Shows code viewer and error panel.', sectionId: 'editor', tab: 'code' },
  'editor.tab.chat': { id: 'editor.tab.chat', label: 'Chat Tab', quickTip: 'Shows chat panel in main editor area.', sectionId: 'editor', tab: 'chat', view: 'chat' },
  'editor.tab.agent': { id: 'editor.tab.agent', label: 'Agent Tab', quickTip: 'Shows agent controls inside editor area.', sectionId: 'editor', tab: 'agent', view: 'agent' },
  'editor.tab.preview': { id: 'editor.tab.preview', label: 'Preview Tab', quickTip: 'Shows running preview iframe panel.', sectionId: 'editor', tab: 'preview', view: 'preview' },
  'editor.build-run': { id: 'editor.build-run', label: 'Build & Run Button', quickTip: 'Starts or stops smart preview runtime.', sectionId: 'editor', tab: 'preview', view: 'preview' },

  'chat.input': { id: 'chat.input', label: 'Chat Input', quickTip: 'Enter sends, Shift+Enter creates newline.', sectionId: 'chat', tab: 'chat', view: 'chat' },
  'chat.send': { id: 'chat.send', label: 'Send Button', quickTip: 'Submits current message to active chat model.', sectionId: 'chat', tab: 'chat', view: 'chat' },
  'chat.stop': { id: 'chat.stop', label: 'Stop Button', quickTip: 'Stops current streaming generation.', sectionId: 'chat', tab: 'chat', view: 'chat' },
  'chat.copy-conversation': { id: 'chat.copy-conversation', label: 'Copy Chat Button', quickTip: 'Copies full conversation transcript.', sectionId: 'chat', tab: 'chat', view: 'chat' },
  'chat.new-conversation': { id: 'chat.new-conversation', label: 'New Chat Button', quickTip: 'Creates a fresh conversation thread.', sectionId: 'chat', tab: 'chat', view: 'chat' },

  'panel.explorer': { id: 'panel.explorer', label: 'Explorer Panel Header', quickTip: 'Project selector + file tree navigation.', sectionId: 'explorer', view: 'explorer' },
  'panel.chat': { id: 'panel.chat', label: 'Conversations Panel Header', quickTip: 'Conversation list and quick switching.', sectionId: 'chat', view: 'chat' },
  'panel.agent': { id: 'panel.agent', label: 'Agent Panel Header', quickTip: 'Agent controls and status stream.', sectionId: 'agent', view: 'agent' },
  'panel.fleet': { id: 'panel.fleet', label: 'Fleet Panel Header', quickTip: 'Multi-agent fleet runtime controls.', sectionId: 'agent', view: 'fleet' },
  'panel.memory': { id: 'panel.memory', label: 'Memory Panel Header', quickTip: 'Project memory and searchable notes.', sectionId: 'advanced-panels', view: 'memory' },
  'panel.checkpoints': { id: 'panel.checkpoints', label: 'Checkpoints Panel Header', quickTip: 'Checkpoint list and restore actions.', sectionId: 'advanced-panels', view: 'checkpoints' },
  'panel.preview': { id: 'panel.preview', label: 'Preview Panel Header', quickTip: 'Preview instructions and runtime hints.', sectionId: 'editor', view: 'preview', tab: 'preview' },
  'panel.providers': { id: 'panel.providers', label: 'Providers Panel Header', quickTip: 'Provider setup and full settings access.', sectionId: 'ai-systems', view: 'providers' },
  'panel.strategy': { id: 'panel.strategy', label: 'Strategy Panel Header', quickTip: 'Model routing and fallback strategy controls.', sectionId: 'ai-systems', view: 'strategy' },
  'panel.rates': { id: 'panel.rates', label: 'Rates Panel Header', quickTip: 'Runtime rate limits and quota visibility.', sectionId: 'ai-systems', view: 'rates' },
  'panel.security': { id: 'panel.security', label: 'Security Panel Header', quickTip: 'Authentication and key handling guidance.', sectionId: 'security', view: 'security' },
  'panel.help': { id: 'panel.help', label: 'Help Panel Header', quickTip: 'Search and browse full in-app documentation.', sectionId: 'overview', view: 'help' },

  // ── THE GOD FACTORY ──────────────────────────────────
  'studio.chat-input': { id: 'studio.chat-input', label: 'GOD FACTORY Chat Input', quickTip: 'Enter your prompt — the agent can read/write files, run terminal commands, build and test.', sectionId: 'the-god-factory', view: 'studio' },
  'studio.send': { id: 'studio.send', label: 'GOD FACTORY Send', quickTip: 'Sends prompt to the autonomous full-codebase agent.', sectionId: 'the-god-factory', view: 'studio' },
  'studio.history': { id: 'studio.history', label: 'Prompt History', quickTip: 'Browse and reuse past prompts. Stores up to 200 entries in localStorage.', sectionId: 'the-god-factory', view: 'studio' },
  'studio.file-selector': { id: 'studio.file-selector', label: 'File Selector', quickTip: 'Attach specific files as context for the next message.', sectionId: 'the-god-factory', view: 'studio' },
  'studio.right-panel': { id: 'studio.right-panel', label: 'Intel Panel (Right)', quickTip: 'Shows notifications, suggested jobs, codebase health, and brainstorm pad. Requires background loop running.', sectionId: 'the-god-factory', view: 'studio' },
  'studio.subsystem-toggles': { id: 'studio.subsystem-toggles', label: 'Subsystem Toggles', quickTip: 'Enable/disable background agents (blame crawler, state crawler, etc).', sectionId: 'the-god-factory', view: 'studio' },
  'studio.model-select': { id: 'studio.model-select', label: 'Model Select (GOD FACTORY)', quickTip: 'Selects which model the GOD FACTORY agent uses for this session.', sectionId: 'the-god-factory', view: 'studio' },

  // ── Agent / Project Factory ───────────────────────────
  'agent.start': { id: 'agent.start', label: 'Start Agent Button', quickTip: 'Launches the Project Factory loop with the configured task and strategy.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.stop': { id: 'agent.stop', label: 'Stop Agent Button', quickTip: 'Stops the currently running loop at the end of the current iteration.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.pause': { id: 'agent.pause', label: 'Pause Agent Button', quickTip: 'Pauses the loop after the current step completes.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.strategy-picker': { id: 'agent.strategy-picker', label: 'Strategy Picker', quickTip: 'Select the loop strategy template: 5 presets plus custom.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.fleet-mode': { id: 'agent.fleet-mode', label: 'Fleet Mode Toggle', quickTip: 'Enables multi-agent parallel execution. ⚠ Fleet messaging stubs not yet wired.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.wizard': { id: 'agent.wizard', label: 'Project Factory Wizard', quickTip: '5-step guided setup: mode → template → details → prompt → review.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.mega-prompts': { id: 'agent.mega-prompts', label: 'Mega Prompts Panel', quickTip: 'Curated preset prompts + your custom prompts (stored in localStorage).', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.milestones': { id: 'agent.milestones', label: 'Milestone Panel', quickTip: 'Structured work items extracted from the running loop iteration.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.quality-trend': { id: 'agent.quality-trend', label: 'Quality Trend Panel', quickTip: 'Per-iteration build/test/lint badges showing health over time.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.event-feed': { id: 'agent.event-feed', label: 'Agent Event Feed', quickTip: 'Streaming event log for the current agent run.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.settings': { id: 'agent.settings', label: 'Agent Settings Panel', quickTip: 'Verbosity, max iterations, quality gate, corpus manifesto, and advanced reindex.', sectionId: 'agent', tab: 'agent', view: 'agent' },
  'agent.verbosity': { id: 'agent.verbosity', label: 'Verbosity Mode', quickTip: 'Controls how detailed the agent output stream is (minimal/normal/verbose).', sectionId: 'agent', tab: 'agent', view: 'agent' },

  // ── Fleet Panel ───────────────────────────────────────
  'fleet.agent-card': { id: 'fleet.agent-card', label: 'Fleet Agent Card', quickTip: 'Shows status, model, role. Use pause/resume/stop per agent.', sectionId: 'fleet', view: 'fleet' },
  'fleet.pause': { id: 'fleet.pause', label: 'Pause Agent (Fleet)', quickTip: 'Pauses an individual fleet agent after its current step.', sectionId: 'fleet', view: 'fleet' },
  'fleet.resume': { id: 'fleet.resume', label: 'Resume Agent (Fleet)', quickTip: 'Resumes a paused fleet agent.', sectionId: 'fleet', view: 'fleet' },
  'fleet.stop': { id: 'fleet.stop', label: 'Stop Agent (Fleet)', quickTip: 'Stops an individual fleet agent permanently for this run.', sectionId: 'fleet', view: 'fleet' },

  // ── Nano Sea ──────────────────────────────────────────
  'nano.process-control': { id: 'nano.process-control', label: 'Nano Process Control', quickTip: 'Start/stop/restart the Python nano-sea server.', sectionId: 'nano-sea', view: 'nano' },
  'nano.node-status': { id: 'nano.node-status', label: 'Nano Node Status', quickTip: 'Health, uptime, PID, and resource readings for the running nano node.', sectionId: 'nano-sea', view: 'nano' },
  'nano.training': { id: 'nano.training', label: 'Nano Training Controls', quickTip: 'Configure and launch training runs against the nano pool.', sectionId: 'nano-sea', view: 'nano' },
  'nano.pool': { id: 'nano.pool', label: 'Nano Pool', quickTip: 'All active nanos with step counts, loss values, and status.', sectionId: 'nano-sea', view: 'nano' },
  'nano.peers': { id: 'nano.peers', label: 'Nano Peers', quickTip: 'Mesh networking connections for distributed training.', sectionId: 'nano-sea', view: 'nano' },
  'nano.logs': { id: 'nano.logs', label: 'Nano Logs', quickTip: 'Live streaming log output from the nano-sea process.', sectionId: 'nano-sea', view: 'nano' },

  // ── Midwife ───────────────────────────────────────────
  'midwife.tasks': { id: 'midwife.tasks', label: 'Midwife Tasks Tab', quickTip: 'Scheduled bird-feeding tasks with enable/disable per task.', sectionId: 'midwife', view: 'midwife' },
  'midwife.config': { id: 'midwife.config', label: 'Midwife Config Tab', quickTip: 'Model, interval, max tokens, and concurrency settings for feeding.', sectionId: 'midwife', view: 'midwife' },
  'midwife.history': { id: 'midwife.history', label: 'Midwife History Tab', quickTip: 'Past feeding run results and output snippets.', sectionId: 'midwife', view: 'midwife' },
  'midwife.exclude-broken': { id: 'midwife.exclude-broken', label: 'Exclude Broken Toggle', quickTip: 'Skip models flagged as failed before each feed cycle.', sectionId: 'midwife', view: 'midwife' },

  // ── Memory ────────────────────────────────────────────
  'memory.access-mode': { id: 'memory.access-mode', label: 'Memory Access Mode', quickTip: 'Controls which sources feed into agent context (total/user/agent/custom).', sectionId: 'memory-panel', view: 'memory' },
  'memory.preset': { id: 'memory.preset', label: 'Memory Preset', quickTip: 'Quick filters: recent decisions, user notes, architecture notes, etc.', sectionId: 'memory-panel', view: 'memory' },
  'memory.create': { id: 'memory.create', label: 'Create Memory Note', quickTip: 'New memory note with title, content, tags, category, and importance score.', sectionId: 'memory-panel', view: 'memory' },
  'memory.search': { id: 'memory.search', label: 'Memory Search', quickTip: 'Full-text search across all memory notes for the active project.', sectionId: 'memory-panel', view: 'memory' },

  // ── Checkpoints ───────────────────────────────────────
  'checkpoints.create': { id: 'checkpoints.create', label: 'Create Checkpoint', quickTip: 'Saves a named snapshot of the current project state.', sectionId: 'checkpoints', view: 'checkpoints' },
  'checkpoints.rollback': { id: 'checkpoints.rollback', label: 'Rollback Checkpoint', quickTip: 'Restores project files to this checkpoint. ⚠ Uses browser confirm() dialog — may be blocked by popup restrictions.', sectionId: 'checkpoints', view: 'checkpoints' },

  // ── Provider Settings ─────────────────────────────────
  'providers.api-key': { id: 'providers.api-key', label: 'Provider API Key Field', quickTip: 'Enter or update API key for this provider. Stored server-side in the local database.', sectionId: 'provider-settings', view: 'providers' },
  'providers.test': { id: 'providers.test', label: 'Test Connection Button', quickTip: 'Sends a live ping to verify provider connectivity.', sectionId: 'provider-settings', view: 'providers' },
  'providers.bulk-test': { id: 'providers.bulk-test', label: 'Bulk Test All Button', quickTip: 'Runs a connectivity sweep across all configured providers at once.', sectionId: 'provider-settings', view: 'providers' },
  'providers.failed-tab': { id: 'providers.failed-tab', label: 'Failed Models Tab', quickTip: 'Lists models that failed, with reason codes and fix actions.', sectionId: 'provider-settings', view: 'providers' },
  'providers.github-pat': { id: 'providers.github-pat', label: 'GitHub PAT Field', quickTip: 'Personal Access Token for GitHub repo access. Stored in local database.', sectionId: 'provider-settings', view: 'providers' },
  'providers.ollama-setup': { id: 'providers.ollama-setup', label: 'Ollama Setup Wizard', quickTip: 'Guided wizard for diagnosing, installing, and connecting Ollama.', sectionId: 'provider-settings', view: 'providers' },

  // ── Model Strategy ────────────────────────────────────
  'strategy.primary-model': { id: 'strategy.primary-model', label: 'Primary Model Picker', quickTip: 'First-choice model for all workflows.', sectionId: 'model-strategy', view: 'strategy' },
  'strategy.fallback-pool': { id: 'strategy.fallback-pool', label: 'Fallback Pool Editor', quickTip: 'Ordered list of fallback models tried if primary fails.', sectionId: 'model-strategy', view: 'strategy' },
  'strategy.preset': { id: 'strategy.preset', label: 'Strategy Preset Picker', quickTip: 'Quick preset routing strategies (Balanced, Reasoning First, Local-Only, etc).', sectionId: 'model-strategy', view: 'strategy' },

  // ── BLAME ─────────────────────────────────────────────
  'blame.models-tab': { id: 'blame.models-tab', label: 'BLAME Models Tab', quickTip: 'Aggregate quality stats per model.', sectionId: 'blame', view: 'blame' },
  'blame.records-tab': { id: 'blame.records-tab', label: 'BLAME Records Tab', quickTip: 'Individual blame attribution entries per output.', sectionId: 'blame', view: 'blame' },
  'blame.quality-tab': { id: 'blame.quality-tab', label: 'BLAME Quality Tab', quickTip: 'Quality scores per model/mode combination.', sectionId: 'blame', view: 'blame' },
  'blame.criticisms-tab': { id: 'blame.criticisms-tab', label: 'BLAME Criticisms Tab', quickTip: 'Agent-flagged issues with model outputs.', sectionId: 'blame', view: 'blame' },
  'blame.successes-tab': { id: 'blame.successes-tab', label: 'BLAME Successes Tab', quickTip: 'Agent-flagged positive reinforcement records.', sectionId: 'blame', view: 'blame' },
  'blame.jobs-tab': { id: 'blame.jobs-tab', label: 'BLAME Jobs Tab', quickTip: 'Remediation jobs generated by blame analysis.', sectionId: 'blame', view: 'blame' },
  'blame.analysis-tab': { id: 'blame.analysis-tab', label: 'BLAME Analysis Tab', quickTip: 'Aggregate patterns across all blame records.', sectionId: 'blame', view: 'blame' },
  'blame.run-crawler': { id: 'blame.run-crawler', label: 'Run Blame Crawler', quickTip: 'Triggers a fresh quality-scoring crawl of recent outputs.', sectionId: 'blame', view: 'blame' },

  // ── Local Models ──────────────────────────────────────
  'local-models.catalog': { id: 'local-models.catalog', label: 'Model Catalog Grid', quickTip: 'Browse and filter Ollama models by category, size, and capabilities.', sectionId: 'local-models', view: 'local-models' },
  'local-models.download': { id: 'local-models.download', label: 'Download Model Button', quickTip: 'Pulls model via Ollama pull. Ollama must be running locally.', sectionId: 'local-models', view: 'local-models' },
  'local-models.installed': { id: 'local-models.installed', label: 'Installed Models List', quickTip: 'Models already on disk with size and delete controls.', sectionId: 'local-models', view: 'local-models' },
  'local-models.category-filter': { id: 'local-models.category-filter', label: 'Category Filter', quickTip: 'Filter catalog by: general, coding, reasoning, vision, uncensored, diffusion, embedding.', sectionId: 'local-models', view: 'local-models' },

  // ── OpenClaw ──────────────────────────────────────────
  'openclaw.skills-tab': { id: 'openclaw.skills-tab', label: 'OpenClaw Skills Tab', quickTip: 'Browse all registered skills by category. ⚠ Requires /api/openclaw to be active.', sectionId: 'openclaw', view: 'studio' },
  'openclaw.workflows-tab': { id: 'openclaw.workflows-tab', label: 'OpenClaw Workflows Tab', quickTip: 'Multi-step skill workflows. ⚠ Requires /api/openclaw to be active.', sectionId: 'openclaw', view: 'studio' },
  'openclaw.log-tab': { id: 'openclaw.log-tab', label: 'OpenClaw Log Tab', quickTip: 'Execution history and output for recent skill runs.', sectionId: 'openclaw', view: 'studio' },

  // ── Tag Registry ──────────────────────────────────────
  'tags.stats-tab': { id: 'tags.stats-tab', label: 'Tag Registry Stats', quickTip: 'Aggregate tag counts: devtags, plantags, buildtags. ⚠ Hardcoded localhost:3001.', sectionId: 'tag-registry', view: 'tags' },
  'tags.devtags-tab': { id: 'tags.devtags-tab', label: 'Devtags Tab', quickTip: 'All devtags with status filter. ⚠ Hardcoded localhost:3001.', sectionId: 'tag-registry', view: 'tags' },
  'tags.plantags-tab': { id: 'tags.plantags-tab', label: 'Plantags Tab', quickTip: 'Planning tags: pending, in_progress, done, blocked. ⚠ Hardcoded localhost:3001.', sectionId: 'tag-registry', view: 'tags' },
  'tags.buildtags-tab': { id: 'tags.buildtags-tab', label: 'Buildtags Tab', quickTip: 'Build state tags: committed, failed, reverted. ⚠ Hardcoded localhost:3001.', sectionId: 'tag-registry', view: 'tags' },
  'tags.rules-tab': { id: 'tags.rules-tab', label: 'Tag Rules Tab', quickTip: 'Tag dependency and transition rules. ⚠ Hardcoded localhost:3001.', sectionId: 'tag-registry', view: 'tags' },

  // ── Forensic Database ─────────────────────────────────
  'forensic.summary-tab': { id: 'forensic.summary-tab', label: 'Forensic Summary', quickTip: 'Aggregate counts across all forensic categories. ⚠ Hardcoded localhost:3001.', sectionId: 'forensic', view: 'forensic' },
  'forensic.regressions-tab': { id: 'forensic.regressions-tab', label: 'Forensic Regressions', quickTip: 'Quality regressions detected by blame crawler. ⚠ Hardcoded localhost:3001.', sectionId: 'forensic', view: 'forensic' },
  'forensic.conflicts-tab': { id: 'forensic.conflicts-tab', label: 'Forensic Conflicts', quickTip: 'Concurrent agent write conflicts. ⚠ Hardcoded localhost:3001.', sectionId: 'forensic', view: 'forensic' },
  'forensic.dead-tags-tab': { id: 'forensic.dead-tags-tab', label: 'Forensic Dead Tags', quickTip: 'Orphaned devtags never resolved. ⚠ Hardcoded localhost:3001.', sectionId: 'forensic', view: 'forensic' },
  'forensic.diff-failures-tab': { id: 'forensic.diff-failures-tab', label: 'Forensic Diff Failures', quickTip: 'Patch application failures. ⚠ Hardcoded localhost:3001.', sectionId: 'forensic', view: 'forensic' },

  // ── Gap Analysis ──────────────────────────────────────
  'gap.summary-tab': { id: 'gap.summary-tab', label: 'Gap Analysis Summary', quickTip: 'Top-level coverage and debt signals. ⚠ Hardcoded localhost:3001.', sectionId: 'gap-analysis', view: 'gap' },
  'gap.coverage-tab': { id: 'gap.coverage-tab', label: 'Gap Coverage Tab', quickTip: 'Per-file and per-function test coverage. ⚠ Hardcoded localhost:3001.', sectionId: 'gap-analysis', view: 'gap' },
  'gap.debt-tab': { id: 'gap.debt-tab', label: 'Gap Debt Tab', quickTip: 'Technical debt items with severity and effort. ⚠ Hardcoded localhost:3001.', sectionId: 'gap-analysis', view: 'gap' },
  'gap.tools-tab': { id: 'gap.tools-tab', label: 'Gap Tools Tab', quickTip: 'Interactive tool runner for on-demand scans. ⚠ Hardcoded localhost:3001.', sectionId: 'gap-analysis', view: 'gap' },

  // ── Project State Crawler ─────────────────────────────
  'psc.run-crawler': { id: 'psc.run-crawler', label: 'Run Crawler Button', quickTip: 'Triggers a fresh crawl. ⚠ Uses relative /api/ path — needs dev proxy in production.', sectionId: 'project-state-crawler', view: 'project-state-crawler' },
  'psc.snapshots-tab': { id: 'psc.snapshots-tab', label: 'Snapshots Tab', quickTip: 'List of crawler runs with file/drift counts.', sectionId: 'project-state-crawler', view: 'project-state-crawler' },
  'psc.drift-tab': { id: 'psc.drift-tab', label: 'Drift Events Tab', quickTip: 'Registry surplus/deficit, content drift, location drift events.', sectionId: 'project-state-crawler', view: 'project-state-crawler' },

  // ── Suggested Jobs ────────────────────────────────────
  'jobs.list-tab': { id: 'jobs.list-tab', label: 'Jobs List Tab', quickTip: 'All suggested jobs with priority and status filters. ⚠ Relative /api/ path.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },
  'jobs.detail-tab': { id: 'jobs.detail-tab', label: 'Job Detail Tab', quickTip: 'Full job details: atomic steps, affected devtags, required buildtags.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },
  'jobs.sandbox-tab': { id: 'jobs.sandbox-tab', label: 'Job Sandbox Tab', quickTip: 'Sandbox execution runs for a selected job.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },
  'jobs.stats-tab': { id: 'jobs.stats-tab', label: 'Jobs Stats Tab', quickTip: 'Aggregate job counts by priority and status.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },
  'jobs.archive': { id: 'jobs.archive', label: 'Archive Job', quickTip: 'Moves job out of active queue — can be recovered from archived view.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },
  'jobs.merge': { id: 'jobs.merge', label: 'Merge Jobs', quickTip: 'Combines multiple selected jobs into one consolidated job record.', sectionId: 'suggested-jobs', view: 'suggested-jobs' },

  // ── File Browser ──────────────────────────────────────
  'filebrowser.context-menu': { id: 'filebrowser.context-menu', label: 'File Context Menu', quickTip: 'Right-click any file: Reveal in Explorer, Copy File Name, Copy Relative/Absolute Path.', sectionId: 'explorer', view: 'explorer' },
  'filebrowser.search': { id: 'filebrowser.search', label: 'File Browser Search', quickTip: 'Filter the file tree by filename pattern.', sectionId: 'explorer', view: 'explorer' },
  'filebrowser.refresh': { id: 'filebrowser.refresh', label: 'File Browser Refresh', quickTip: 'Reloads the file tree from disk.', sectionId: 'explorer', view: 'explorer' },

  // ── Conversation Sidebar ──────────────────────────────
  'conversations.new': { id: 'conversations.new', label: 'New Conversation Button', quickTip: 'Starts a fresh conversation thread.', sectionId: 'chat', view: 'chat' },
  'conversations.rename': { id: 'conversations.rename', label: 'Rename Conversation', quickTip: 'Double-click or use edit icon to rename any past conversation.', sectionId: 'chat', view: 'chat' },
  'conversations.delete': { id: 'conversations.delete', label: 'Delete Conversation', quickTip: 'Permanently removes conversation and message history.', sectionId: 'chat', view: 'chat' },

  // ── Terminal ──────────────────────────────────────────
  'terminal.new-session': { id: 'terminal.new-session', label: 'New Terminal Session', quickTip: 'Opens a new PTY tab in the integrated terminal.', sectionId: 'terminal', tab: 'code' },
  'terminal.input': { id: 'terminal.input', label: 'Terminal Input', quickTip: 'Command input with up/down arrow history navigation.', sectionId: 'terminal', tab: 'code' },
  'terminal.agent-shell': { id: 'terminal.agent-shell', label: 'Agent Shell Tab', quickTip: 'Separate shell used exclusively by the agent loop — do not close during agent runs.', sectionId: 'terminal', tab: 'code' },
  'terminal.clear': { id: 'terminal.clear', label: 'Clear Terminal Output', quickTip: 'Clears the visible output buffer for the active session.', sectionId: 'terminal', tab: 'code' },

  // ── Preview Panel ─────────────────────────────────────
  'preview.url-bar': { id: 'preview.url-bar', label: 'Preview URL Bar', quickTip: 'Enter any URL to load it in the preview iframe.', sectionId: 'editor', tab: 'preview', view: 'preview' },
  'preview.console': { id: 'preview.console', label: 'Preview Console Strip', quickTip: 'Captures console messages posted from localhost previews. Remote-host previews will not stream logs into this strip.', sectionId: 'editor', tab: 'preview', view: 'preview' },
  'preview.refresh': { id: 'preview.refresh', label: 'Preview Refresh Button', quickTip: 'Reloads the preview iframe.', sectionId: 'editor', tab: 'preview', view: 'preview' }
};

export const HELP_ANCHOR_LIST = Object.values(HELP_ANCHORS);

export const HELP_ANCHORS_BY_SECTION = HELP_SECTIONS.reduce<Record<string, HelpAnchor[]>>((acc, section) => {
  acc[section.id] = HELP_ANCHOR_LIST.filter(anchor => anchor.sectionId === section.id);
  return acc;
}, {});
