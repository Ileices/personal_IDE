# User Manual — Complete End-to-End Guide

## 1. Getting Started

### 1.1 First Launch

1. Open `http://localhost:5173` in your browser
2. You'll see the **Login Page** with two options:
   - **Continue as Guest (Local Mode)**: No GitHub account needed. Uses Ollama, LM Studio, and Nano Sea only.
   - **Sign in with GitHub**: Enter a Personal Access Token. Enables all 11 providers.

### 1.2 Guest Mode

Guest mode creates a local-only session:
- No GitHub API access (no GitHub Models provider)
- Works with Ollama, LM Studio, and Nano Sea
- Full project management and agent features
- Memory notes and checkpoints work normally
- Can upgrade to GitHub login later without losing data

### 1.3 GitHub Login

1. Generate a PAT at https://github.com/settings/tokens
2. Required scopes: `read:user` (minimum)
3. For GitHub Models: PAT automatically grants access to free tier
4. Paste token in the login field
5. Token is encrypted and stored locally in SQLite

---

## 2. Main Interface

### 2.1 Three-Panel Layout

```
┌──────────┬────────────────────┬──────────────┐
│          │                    │              │
│  File    │   Code Viewer      │   Chat /     │
│  Browser │   (Monaco Editor)  │   Agent      │
│          │                    │   Panel      │
│          │                    │              │
├──────────┤                    ├──────────────┤
│ Project  │                    │  Controls    │
│ Panel    │                    │  & Settings  │
└──────────┴────────────────────┴──────────────┘
```

- **Left panel**: File browser + project management
- **Center**: Code viewer (Monaco editor, read-only unless agent is editing)
- **Right panel**: Chat, agent controls, settings

### 2.2 Top Bar

- **Mode Selector**: Switch between Ask, Edit, Plan, and Agent modes
- **Settings Gear**: Opens provider settings, Ollama setup, etc.
- **User Avatar**: Account menu (switch account, logout)

---

## 3. Chat Modes

### 3.1 Ask Mode

Standard Q&A. The LLM answers questions about your code, explains concepts, or helps debug.

- File context is automatically included
- Memory notes are injected as relevant context
- No file modifications are made

### 3.2 Edit Mode

The LLM suggests code changes. You can apply or reject them.

- Sends the current file content as context
- LLM returns structured diffs
- Click "Apply" to write changes to disk
- Click "Reject" to discard

### 3.3 Plan Mode

The LLM creates a structured plan for implementing a feature or fixing a bug.

- Returns a numbered step-by-step plan
- Includes file paths, code snippets, and explanations
- You can convert the plan to an Agent task

### 3.4 Agent Mode

Fully autonomous execution. The agent reads, writes, and debugs code independently.

- Requires explicit start via the Agent Controls panel
- Shows real-time progress via SSE streaming
- Can run for up to 50 iterations per task (configurable)
- Creates checkpoints for rollback safety

---

## 4. Agent Controls

### 4.1 Single Agent

| Control | Description |
|---------|-------------|
| **Start** | Begin autonomous task execution |
| **Pause** | Temporarily halt (resume later with full state) |
| **Resume** | Continue from paused state |
| **Stop** | Terminate the agent loop |
| **Task Input** | Describe what you want the agent to do |
| **Model Selector** | Choose which LLM to use |
| **Max Iterations** | Limit for auto-stop (default: 50) |
| **Auto-Fix Errors** | Automatically fix compile errors after edits |
| **Auto-Run Tests** | Run tests after each code change |
| **Continuous Mode** | Keep running after task completion |

### 4.2 Fleet Mode

| Control | Description |
|---------|-------------|
| **Fleet Toggle** | Enable multi-agent fleet mode |
| **Agent Count** | Number of agents (2-6, default: 4) |
| **Start Fleet** | Launch all agents with staggered start |
| **Stop Fleet** | Stop all agents |
| **Mega-Prompt Preset** | Pre-configured system prompts for common tasks |

Fleet agents have specialized roles:
- **Lead**: Plans the approach, delegates tasks
- **Implementer**: Writes code (1-3 agents)
- **Debugger**: Finds and fixes bugs
- **Tester**: Writes and runs tests
- **Reviewer**: Reviews code quality

### 4.3 Event Stream

As the agent works, you'll see real-time events:
- 🟡 **Thinking**: Agent is analyzing the codebase
- 🔵 **Executing**: Writing or editing files
- 🟢 **Completed**: Task finished successfully
- 🔴 **Error**: Something went wrong (model unavailable, rate limit, etc.)
- ⏸️ **Paused**: Waiting for user to resume

---

## 5. Project Management

### 5.1 Creating a Project

1. Open the **Project Panel** (left sidebar)
2. Click **New Project**
3. Enter:
   - **Name**: Display name
   - **Path**: Absolute path to the project folder on disk
4. Click **Create**
5. The IDE scans the project and builds a file tree

### 5.2 Switching Projects

Click any project in the project list to switch. The file browser, code viewer, and memory all update.

### 5.3 Memory Notes

Each project has a memory system — persistent notes that survive between sessions.

**Auto-created notes**:
- Agent creates notes about codebase structure, decisions made, problems solved
- These inject into future agent prompts as context

**Manual notes**:
- Click **Add Note** in the Memory Panel
- Enter a title and body
- Notes are searchable

**Auto-refresh**: The Memory Panel refreshes every 15 seconds when visible.

---

## 6. Provider Settings

### 6.1 Accessing Settings

Click the **gear icon** in the top bar → **Provider Settings**.

### 6.2 Configuring a Provider

1. **Toggle**: Enable/disable the provider
2. **API Key**: Enter your key (stored encrypted locally)
3. **Base URL**: Override for self-hosted instances
4. **Test**: Click to verify connection
5. **Models**: View available models from this provider

### 6.3 Provider-Specific Setup

#### Ollama (Local)
1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull codellama:7b`
3. In IDE: Navigate to **Ollama Setup** panel
4. IDE auto-detects Ollama at `localhost:11434`
5. Select a model and start chatting

#### LM Studio (Local)
1. Install LM Studio: https://lmstudio.ai
2. Load a model and start the server
3. IDE connects at `localhost:1234`

#### Nano Sea (Local)
1. Start the Nano Sea: `cd NANO_train && python main.py`
2. Wait for training to initialize
3. IDE connects at `localhost:5100`
4. Initially returns fallback messages until nanos are trained

---

## 7. Checkpoints

### 7.1 What Are Checkpoints?

Git-based snapshots of your project at a point in time. Created automatically by the agent.

### 7.2 Viewing Checkpoints

Open the **Checkpoint Viewer** panel to see:
- Timestamp of each checkpoint
- Which files were changed
- Diff view of changes

### 7.3 Restoring

Click **Restore** on any checkpoint to revert the project to that state. This creates a new commit, so you can always undo.

---

## 8. Rate Limit Dashboard

### 8.1 What It Shows

For each GitHub Models model:
- Requests remaining (per minute + per day)
- Tokens remaining (per minute + per day)
- Time until limit resets
- Current tier (low/high)

### 8.2 Rate Limit Strategy

When rate-limited:
1. The agent automatically switches to a fallback model
2. The dashboard shows which models are available
3. Local providers (Ollama, LM Studio, Nano Sea) have no rate limits
4. The system never operates below 16,000 tokens context

---

## 9. Midwife Panel

### 9.1 Purpose

The Midwife generates synthetic training data for the Nano Sea. It "feeds" the nanos with code examples and any type of dataset an LLM can generate.

### 9.2 Controls

| Control | Description |
|---------|-------------|
| **Start Feeding** | Begin generating training data |
| **Stop Feeding** | Halt data generation |
| **Tasks Per Round** | How many examples per cycle (default: 5) |
| **Round Interval** | Time between cycles (default: 60s) |
| **Task Types** | Enable/disable specific training types |

### 9.3 Task Types

- Code Completion
- Search Query
- Query Parsing
- Token Generation
- Embedding
- Query Expansion
- Query Routing
- Result Ranking
- Context Assembly
- Response Validation
- Response Formatting
- Tokenization

### 9.4 Auto-Start

The Midwife auto-starts 30 seconds after server boot if the Nano Sea is healthy. No manual intervention needed.

---

## 10. Keyboard Shortcuts

| Shortcut | Action | Where |
|----------|--------|-------|
| `Enter` | Send chat message | Chat input |
| `Shift+Enter` | New line (don't send) | Chat input |
| `Enter` | Submit / confirm | Search fields, checkpoint name, fleet message |

> **Planned shortcuts** (not yet implemented): `Ctrl+Shift+A` (start/stop agent), `Ctrl+Shift+P` (plan mode), `Ctrl+S` (save file). See [TODO_ROADMAP.md](./TODO_ROADMAP.md).

---

## 11. Troubleshooting

### 11.1 "8000 token limit" Messages

This was a known bug (now fixed). If you still see it:
- The 8000 comes from GitHub's free tier rate limit, not your model's actual limit
- The system now stores this as a per-request limit, not a model limit
- Check the rate limit dashboard for current status

### 11.2 Agent Stuck in Loop

The loop detector should catch this. If it doesn't:
1. Pause the agent
2. Add a memory note describing the problem
3. Resume — the note will be injected into the next prompt

### 11.3 404 Model Errors

The system auto-recovers from 404 errors by switching to a fallback model. If all models 404:
- Check GitHub status: https://githubstatus.com
- Try a local provider (Ollama, LM Studio)
- Verify your PAT hasn't expired

### 11.4 Nano Sea Not Responding

1. Check if the Nano Sea server is running: `http://localhost:5100/health`
2. Check NANO_train logs: `NANO_train/logs/nano_system.jsonl`
3. Restart: `cd NANO_train && python main.py`
