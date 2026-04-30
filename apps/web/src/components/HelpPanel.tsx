// ============================================
// Help Panel — Civilopedia-style Help System
//
// Searchable, hyperlinked documentation for
// every feature in Personal IDE. Each section
// can link to other sections and trigger in-app
// navigation actions.
// ============================================
import React, { useState, useMemo, useRef } from 'react';
import { HelpCircle, Search, ChevronRight, ChevronDown, BookOpen,
  Sparkles, Bot, Cpu, Layers, Network, Shield, Zap, Globe,
  Code2, Database, BarChart2, Fingerprint, Settings, Rocket,
  ArrowLeft, ArrowRight, Home } from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortDesc: string;
  content: string;
  links?: { label: string; sectionId: string }[];
  tips?: string[];
}

const SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <Rocket className="w-4 h-4" />,
    shortDesc: 'First steps: set up your workspace, connect AI providers, and build your first project.',
    content: `# Getting Started with Personal IDE

Personal IDE is a self-improving, AI-native development environment. Unlike traditional editors, it is designed to build itself using the AI models and agents that power it.

## First Steps

1. **Select or create a project** — Use the sidebar to create a new project or open an existing folder.
2. **Configure AI providers** — Click the Settings icon and add at least one API key. Free providers (Groq, Cerebras, Gemini) require no credit card.
3. **Open THE GOD FACTORY** — Click the ✨ Sparkles icon in the left Activity Bar to open the self-improvement agent chat.
4. **Start building** — Type a request in THE GOD FACTORY. The agent will read your codebase, propose changes, and apply them.

## Quick Reference

- **Enter** in chat = send message
- **Shift+Enter** = newline in message
- **Ctrl+P** = quick file open (if wired)
- **BUILD AND RUN** button = smart-start your project (auto-detects npm, cargo, go, python)`,
    links: [
      { label: 'AI Providers & Models', sectionId: 'providers' },
      { label: 'THE GOD FACTORY', sectionId: 'studio' },
      { label: 'Agent Mode', sectionId: 'agent' },
    ],
    tips: [
      'Use free providers (Groq, Cerebras, Gemini Flash) for most tasks to avoid costs.',
      'Enable Auto-backup in THE GOD FACTORY before asking the agent to edit files.',
      'The BLAME panel tracks model quality over time — use it to find which model works best for you.',
    ],
  },
  {
    id: 'providers',
    title: 'AI Providers & Models',
    icon: <Cpu className="w-4 h-4" />,
    shortDesc: 'Connect to free and paid AI APIs. Configure fallbacks, rate limits, and model strategy.',
    content: `# AI Providers & Models

Personal IDE connects to any OpenAI-compatible API endpoint. Providers are configured in Settings.

## Supported Providers

| Provider | Free Tier | Notes |
|----------|-----------|-------|
| Groq | Yes (rate limited) | Fastest inference on earth |
| Cerebras | Yes (rate limited) | Extreme speed, good for agentic loops |
| Google Gemini | Yes (generous) | Best context window for free |
| OpenAI | No (paid) | GPT-4o, o3 |
| Anthropic | No (paid) | Claude 3.7, 3.5 Sonnet |
| DeepSeek | Yes (very cheap) | V3 is excellent for code |
| SiliconFlow | Yes (credits) | Many open source models |
| Fireworks | Yes (credits) | Llama, Mixtral, etc. |
| Perplexity | No | Built-in web search |
| xAI Grok | No | Grok-3 series |

## Model Strategy

The **Model Strategy** panel (⚡ in Activity Bar) lets you configure:
- **Primary model** — Used for most requests
- **Fallback chain** — If primary fails or rate limits, tries next model
- **Presets** — "Fastest (Free)", "Best Quality", "Coding Focus", "Long Context"

## Model ID Format

All models use the format \`provider/modelId\`, e.g.:
- \`groq/llama-3.3-70b-versatile\`
- \`gemini/gemini-2.0-flash\`
- \`anthropic/claude-3-5-sonnet-20241022\``,
    links: [
      { label: 'Model Strategy & Fallbacks', sectionId: 'strategy' },
      { label: 'Rate Limits & Usage', sectionId: 'rates' },
      { label: 'BLAME Quality Tracking', sectionId: 'blame' },
    ],
    tips: [
      'Groq llama-3.3-70b-versatile is the best free model for most tasks.',
      'Gemini 2.0 Flash has a 1M token context window — great for large codebases.',
      'DeepSeek V3 (0324) is extremely good at code and nearly free.',
    ],
  },
  {
    id: 'studio',
    title: 'THE GOD FACTORY',
    icon: <Sparkles className="w-4 h-4" />,
    shortDesc: 'Your in-app AI architect. Replaces external chat tools. Builds and repairs the IDE itself.',
    content: `# THE GOD FACTORY

THE GOD FACTORY is the centerpiece of Personal IDE. It is a full conversational agent that has access to your codebase, terminal, and the web. Use it to build features, fix bugs, and improve the IDE itself.

## What THE GOD FACTORY Can Do

- **Read & write any file** in the project
- **Run terminal commands** (PowerShell, bash, npm, cargo, etc.)
- **Search the web** for solutions and current documentation
- **Research AI models** and add them to the registry
- **Wire UI components** — connect built but unlinked features to the GUI
- **Fix TypeScript/build errors** automatically
- **Audit the agent pipeline** and resolve stalls/timeouts

## Prompt History

All prompts you send are automatically saved to the **Prompt History** sidebar. You can:
- **Re-send** a past prompt (iterate on a previous request)
- **Search** through past prompts
- **Generate a Mega-Prompt** — combines your 20 most recent prompts into one comprehensive plan

## Auto-Backup

When Studio detects a potentially destructive edit (write, delete, refactor, replace), it automatically creates a timestamped backup of the project before proceeding. Backups are stored in \`.backups/\` in the project root.

## File Context Injection

Click "File context" in the Studio header to select specific files to inject into every message. This helps the model focus on relevant code without reading the whole project.`,
    links: [
      { label: 'Getting Started', sectionId: 'getting-started' },
      { label: 'Agent Mode', sectionId: 'agent' },
      { label: 'AI Providers & Models', sectionId: 'providers' },
    ],
    tips: [
      '"Analyze the codebase" is a great first prompt — it gives you a prioritized action plan.',
      'Keep the conversation history: Studio uses the last 20 messages as context.',
      'Use "Generate Mega-Prompt from History" to build a comprehensive session starter.',
    ],
  },
  {
    id: 'agent',
    title: 'Agent Mode',
    icon: <Bot className="w-4 h-4" />,
    shortDesc: 'Autonomous multi-step task execution. Agents plan, use tools, and self-correct.',
    content: `# Agent Mode

Agent Mode runs a multi-step AI agent that can plan, execute tools, check results, and retry. Unlike simple chat, agents persist across multiple tool calls to accomplish complex tasks.

## Agent Modes

- **Ask** — Simple Q&A with the model. No tool use.
- **Edit** — Model suggests file edits. You approve each change.
- **Agent** — Fully autonomous. Plans + executes multiple steps.
- **Plan** — Model outputs a structured plan only, no execution.

## How the Agent Runs

1. User sends a task
2. Agent generates a plan (internal)
3. Agent calls tools: \`read_file\`, \`write_file\`, \`run_command\`, \`search_web\`
4. Agent evaluates the result
5. Agent retries or continues until the task is done

## Agent Fleet

The **Fleet** view shows multiple agents running in parallel, each assigned to a different model or task type. Fleet supports:
- Assign models to specific fleet agents
- Monitor agent status (idle, running, waiting, error)
- Restart individual agents

## Troubleshooting

- **Agent stalls on new projects** — Check if the project template was applied. Use THE GOD FACTORY to diagnose.
- **Agent pauses unexpectedly** — Check the agent timeout settings and whether context discovery is blocking startup.
- **Tool calls fail** — Verify the server is running on port 3001 and has access to the file system.`,
    links: [
      { label: 'Agent Fleet', sectionId: 'fleet' },
      { label: 'THE GOD FACTORY', sectionId: 'studio' },
      { label: 'NANO Models', sectionId: 'nano' },
    ],
    tips: [
      'Start with a small, specific task to test the agent before running complex workflows.',
      'The agent context window limits how much code it can see — use File Context Injection to focus.',
      'If an agent stalls, reload the page and check the server terminal for errors.',
    ],
  },
  {
    id: 'fleet',
    title: 'Agent Fleet',
    icon: <Network className="w-4 h-4" />,
    shortDesc: 'Run multiple specialized agents in parallel, each with its own model and task focus.',
    content: `# Agent Fleet

The Fleet panel lets you configure and run multiple AI agents simultaneously. Each agent in the fleet can be assigned a different model and task type.

## Fleet Roles

- **Architect** — High-level planning, design decisions
- **Coder** — Implementation, writing code
- **Reviewer** — Code review, identifying bugs
- **Tester** — Writing and running tests
- **Documenter** — Writing docs, comments, README
- **Searcher** — Web research, finding solutions

## Model Assignment

Each fleet agent can be assigned:
- A specific model (e.g. GPT-4o for Architect, Groq for Coder)
- A fallback chain if the primary model fails
- Rate limit budgets (max tokens/minute per agent)

## Coordination

Fleet agents communicate through a shared context store. The Architect agent can delegate subtasks to other agents. Results are merged into a unified output.`,
    links: [
      { label: 'Agent Mode', sectionId: 'agent' },
      { label: 'AI Providers & Models', sectionId: 'providers' },
      { label: 'Model Strategy & Fallbacks', sectionId: 'strategy' },
    ],
    tips: [
      'Use a cheap/fast model for Coder and a smarter model for Architect.',
      'The Fleet panel is under active development — some features may be incomplete.',
    ],
  },
  {
    id: 'nano',
    title: 'NANO Models (Local AI)',
    icon: <Layers className="w-4 h-4" />,
    shortDesc: 'Train and run tiny local AI models tuned for specific IDE tasks. No API key needed.',
    content: `# NANO Models

NANO models are small, purpose-trained AI models that run locally on your hardware. They are trained on data from your projects and optimized for specific tasks.

## NANO Architecture

Each NANO model is a small transformer (typically 1-50M parameters) trained for one specific task:
- **TokenizationNano** — Fast tokenization
- **EmbeddingNano** — Code embeddings for semantic search
- **QueryParserNano** — Parse natural language queries
- **QueryExpanderNano** — Expand queries with synonyms
- **QueryRouterNano** — Route queries to the right model
- **RankNano** — Rank search results by relevance
- **SearchNano** — Code search
- **ContextAssemblerNano** — Build context for prompts
- **ResponseFormatterNano** — Format AI responses
- **ResponseValidatorNano** — Validate AI outputs
- **CodeCompletionNano** — Local code completion
- **TokenGeneratorNano** — Token generation

## Training (NANO Train)

The NANO Train system (in \`NANO_train/\`) handles training, checkpointing, and deployment. Models are trained on your local data + synthetic training corpora.

## Hardware Requirements

NANO models are designed to run on consumer hardware:
- CPU: Any modern CPU (slow but functional)
- GPU: NVIDIA GTX 1060+ (recommended)
- RAM: 4GB minimum, 16GB recommended`,
    links: [
      { label: 'Getting Started', sectionId: 'getting-started' },
      { label: 'Agent Mode', sectionId: 'agent' },
    ],
    tips: [
      'NANO models are still in training. Use cloud models for best results.',
      'The NANO Sea visualizer shows your trained models and their quality metrics.',
    ],
  },
  {
    id: 'strategy',
    title: 'Model Strategy & Fallbacks',
    icon: <Zap className="w-4 h-4" />,
    shortDesc: 'Configure which models to use for which tasks, with automatic fallback chains.',
    content: `# Model Strategy & Fallbacks

The Model Strategy panel lets you configure how the IDE selects models for each type of request. This is critical for balancing speed, cost, and quality.

## Strategy Presets

- **Fastest (Free)** — Uses the fastest free models (Cerebras, Groq) with Gemini Flash as fallback
- **Best Quality (Free)** — Uses the best free models (Gemini Pro, Groq 70b)
- **Coding Focus** — Prioritizes code-focused models (DeepSeek, Groq)
- **Long Context** — Prioritizes models with large context windows (Gemini, Claude)
- **Reasoning** — Prioritizes reasoning/thinking models (o3, Gemini Pro)

## Custom Strategy

You can configure:
1. **Primary model** — First choice for all requests
2. **Fallback chain** — Ordered list of fallback models
3. **Task-specific overrides** — Different models for chat vs. agent vs. code completion
4. **Budget limits** — Max tokens per day/hour to control costs

## BLAME Integration

The BLAME panel tracks quality scores for each model over time. When Auto-update is enabled, the crawler agent automatically suggests strategy config updates based on real-world performance data.`,
    links: [
      { label: 'AI Providers & Models', sectionId: 'providers' },
      { label: 'BLAME Quality Tracking', sectionId: 'blame' },
      { label: 'Rate Limits & Usage', sectionId: 'rates' },
    ],
    tips: [
      'Start with "Fastest (Free)" preset to minimize latency and costs.',
      'Switch to "Coding Focus" when doing heavy code generation work.',
      'Enable BLAME auto-update to continuously optimize your model strategy.',
    ],
  },
  {
    id: 'blame',
    title: 'BLAME Tracking',
    icon: <Fingerprint className="w-4 h-4" />,
    shortDesc: 'Track which AI model generated each piece of code. Monitor quality scores and success rates.',
    content: `# BLAME Quality Tracking

BLAME is the IDE's model attribution and quality tracking system. Every AI-generated output is "blamed" on the specific model and mode that produced it.

## What BLAME Tracks

- **Model** — Which AI model generated the output
- **Mode** — ask / edit / agent / plan
- **Quality score** — 0-100 based on user feedback and automated metrics
- **Success rate** — Did the output achieve the goal?
- **Latency** — How long did generation take?
- **Token count** — How many tokens were used?
- **Task type** — code_gen / refactor / explain / plan / agent_step

## Quality Scores

Quality scores are assigned by:
1. User feedback (thumbs up/down)
2. Automated metrics (does the code compile? do tests pass?)
3. The crawler agent (compares output to benchmarks)

## BLAME Crawler

The BLAME Crawler Agent runs on demand. It:
1. Reads all BLAME records
2. Fetches current model benchmarks from leaderboards
3. Cross-references your usage data with published benchmarks
4. Suggests an updated model strategy configuration
5. Optionally auto-applies the config (if Auto-update is enabled)`,
    links: [
      { label: 'Model Strategy & Fallbacks', sectionId: 'strategy' },
      { label: 'AI Providers & Models', sectionId: 'providers' },
    ],
    tips: [
      'Check BLAME after a few days of use to see which models perform best for your workflow.',
      'The trend arrows (↑↓) show if a model is improving or degrading in your usage.',
    ],
  },
  {
    id: 'rates',
    title: 'Rate Limits & Usage',
    icon: <BarChart2 className="w-4 h-4" />,
    shortDesc: 'Monitor API usage, rate limits, and estimated costs across all providers.',
    content: `# Rate Limits & Usage

The Rate Limits panel shows your current API usage across all configured providers and warns when you are approaching limits.

## What is Monitored

- **Requests per minute (RPM)** — Current request rate vs. limit
- **Tokens per minute (TPM)** — Current token usage vs. limit
- **Daily token budget** — Total tokens used today
- **Estimated cost** — Approximate cost based on current prices

## Rate Limit Behavior

When a rate limit is hit:
1. The current request fails with a rate limit error
2. The fallback model in the strategy chain is tried
3. If all models are rate limited, an error is shown

## Free Tier Limits (approximate)

| Provider | RPM | TPM |
|----------|-----|-----|
| Groq | 30 | 6,000 |
| Cerebras | 30 | 60,000 |
| Gemini Flash | 15 | 1,000,000 |
| DeepSeek | 60 | 500,000 |

## Reducing Rate Limit Pressure

- Enable caching to avoid re-sending the same requests
- Use Model Strategy to spread load across providers
- Set token budgets to prevent runaway agent loops`,
    links: [
      { label: 'Model Strategy & Fallbacks', sectionId: 'strategy' },
      { label: 'AI Providers & Models', sectionId: 'providers' },
    ],
    tips: [
      'Gemini Flash has the most generous free tier — use it as your primary free fallback.',
      'Set a daily token budget in Model Strategy to prevent surprise costs.',
    ],
  },
  {
    id: 'security',
    title: 'Security & Auth',
    icon: <Shield className="w-4 h-4" />,
    shortDesc: 'API key management, authentication, and security best practices.',
    content: `# Security & Authentication

Personal IDE handles your API keys with care. All keys are stored locally and never sent to any server other than the provider's own API.

## API Key Storage

API keys are stored in the local SQLite database at \`apps/data/personal_ide.db\`. The database is NOT encrypted by default. Do not commit it to version control.

## Best Practices

- Add \`apps/data/\` to your \`.gitignore\`
- Rotate API keys regularly
- Use read-only or restricted-scope API keys where possible
- Never share your project folder with API keys in the database

## Authentication

Personal IDE does not require a login by default. The server runs on localhost:3001 and is only accessible from your local machine. If you expose the server to the network, add authentication.

## Secrets in Code

The IDE uses environment variables from \`.env\` files for server configuration. Do not hardcode API keys in source files.`,
    links: [
      { label: 'Getting Started', sectionId: 'getting-started' },
      { label: 'AI Providers & Models', sectionId: 'providers' },
    ],
    tips: [
      'Never commit your SQLite database to git. Add apps/data/ to .gitignore.',
      'Use free-tier API keys with low limits for development to reduce risk.',
    ],
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function HelpPanel() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const navigate = (id: string) => {
    setActiveSection(id);
    setHistory(prev => [...prev.slice(0, historyIdx + 1), id]);
    setHistoryIdx(prev => prev + 1);
  };

  const goBack = () => {
    if (historyIdx > 0) {
      setHistoryIdx(i => i - 1);
      setActiveSection(history[historyIdx - 1]);
    }
  };
  const goForward = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(i => i + 1);
      setActiveSection(history[historyIdx + 1]);
    }
  };

  const filteredSections = useMemo(() => {
    if (!search) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.shortDesc.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q)
    );
  }, [search]);

  const section = activeSection ? SECTIONS.find(s => s.id === activeSection) : null;

  if (section) {
    return <SectionView section={section} onBack={() => setActiveSection(null)} onNavigate={navigate} canGoBack={historyIdx > 0} canGoForward={historyIdx < history.length - 1} onGoBack={goBack} onGoForward={goForward} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border bg-ide-panel flex-shrink-0">
        <HelpCircle className="w-4 h-4 text-ide-accent" />
        <span className="text-xs font-semibold text-ide-text flex-1">Help & Documentation</span>
      </div>
      {/* Search */}
      <div className="px-3 py-2 border-b border-ide-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ide-text-dim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search help topics..."
            className="w-full bg-ide-bg border border-ide-border rounded pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:border-ide-accent"
          />
        </div>
      </div>
      {/* Section index */}
      <div className="flex-1 overflow-y-auto">
        {filteredSections.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(s.id)}
            className="w-full flex items-start gap-3 px-3 py-3 border-b border-ide-border/40 hover:bg-ide-bg/40 text-left transition-colors group"
          >
            <span className="mt-0.5 text-ide-accent">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ide-text group-hover:text-ide-accent">{s.title}</span>
                <ChevronRight className="w-3 h-3 text-ide-text-dim" />
              </div>
              <p className="text-[10px] text-ide-text-dim mt-0.5 leading-relaxed">{s.shortDesc}</p>
            </div>
          </button>
        ))}
        {filteredSections.length === 0 && (
          <div className="p-6 text-center text-xs text-ide-text-dim">
            No topics found for "{search}"
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section View ─────────────────────────────────────────────────────────────

function SectionView({ section, onBack, onNavigate, canGoBack, canGoForward, onGoBack, onGoForward }: {
  section: HelpSection;
  onBack: () => void;
  onNavigate: (id: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ide-border flex-shrink-0">
        <button onClick={onGoBack} disabled={!canGoBack} className="p-1 disabled:opacity-30 hover:text-ide-accent text-ide-text-dim">
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={onGoForward} disabled={!canGoForward} className="p-1 disabled:opacity-30 hover:text-ide-accent text-ide-text-dim">
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={onBack} className="p-1 hover:text-ide-accent text-ide-text-dim">
          <Home className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1.5 ml-1 flex-1">
          <span className="text-ide-accent">{section.icon}</span>
          <span className="text-xs font-semibold text-ide-text">{section.title}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Content — render markdown-ish */}
        <div className="text-xs text-ide-text leading-relaxed whitespace-pre-wrap">
          {renderMarkdown(section.content, onNavigate)}
        </div>

        {/* Tips */}
        {section.tips && section.tips.length > 0 && (
          <div className="bg-ide-accent/5 border border-ide-accent/20 rounded-lg p-3 space-y-2">
            <div className="text-[10px] font-semibold text-ide-accent uppercase tracking-wider">Tips</div>
            {section.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-ide-text-dim">
                <span className="text-ide-accent mt-0.5">•</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        {/* Related */}
        {section.links && section.links.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-ide-text-dim uppercase tracking-wider">See Also</div>
            {section.links.map(l => (
              <button
                key={l.sectionId}
                onClick={() => onNavigate(l.sectionId)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-ide-bg border border-ide-border rounded hover:border-ide-accent/40 hover:bg-ide-accent/5 text-left transition-all"
              >
                <BookOpen className="w-3 h-3 text-ide-accent" />
                <span className="text-xs text-ide-text">{l.label}</span>
                <ChevronRight className="w-3 h-3 text-ide-text-dim ml-auto" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Minimal Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text: string, onNavigate?: (id: string) => void): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-ide-text mb-2 mt-1">{line.slice(2)}</h2>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-ide-accent mb-1.5 mt-3">{line.slice(3)}</h3>);
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-xs font-semibold text-ide-text mb-1 mt-2">{line.slice(4)}</h4>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 mb-0.5">
          <span className="text-ide-accent mt-0.5">•</span>
          <span className="text-[11px] text-ide-text-dim flex-1">{inlineCode(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1] || '';
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 mb-0.5">
          <span className="text-ide-accent mt-0.5 text-[10px] font-mono">{num}.</span>
          <span className="text-[11px] text-ide-text-dim flex-1">{inlineCode(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
    } else if (line.startsWith('| ') && !line.startsWith('|---')) {
      // Parse table row into cells — render as clean grid row (no ASCII pipes)
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const isHeader = lines[i + 1]?.startsWith('|---');
      elements.push(
        <div key={i} className={`grid gap-x-3 py-1 border-b border-ide-border/20 ${isHeader ? 'font-semibold text-ide-text' : 'text-ide-text-dim'}`}
          style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
          {cells.map((cell, ci) => (
            <span key={ci} className="text-[11px] truncate">{inlineCode(cell)}</span>
          ))}
        </div>
      );
    } else if (line.startsWith('|---') || line.startsWith('| ---')) {
      // Table separator row — skip, handled by isHeader logic above
      i++;
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-[11px] text-ide-text-dim mb-1 leading-relaxed">{inlineCode(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

function inlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`')
          ? <code key={i} className="bg-ide-bg px-1 rounded text-ide-accent font-mono">{p.slice(1, -1)}</code>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}
