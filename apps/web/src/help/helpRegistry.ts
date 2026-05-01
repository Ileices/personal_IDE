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
