# Personal IDE — Documentation Hub

Comprehensive documentation for the Personal IDE: an AI-powered coding assistant with autonomous agents, project memory, a fleet orchestrator, and a Sea of Nanos neural training system.

## Documentation Index

| Document | Description |
|----------|-------------|
| [IDE Architecture](./IDE_ARCHITECTURE.md) | Full system architecture — frontend, backend, database, services |
| [LLM Integration Guide](./LLM_INTEGRATION.md) | All 11 providers, model definitions, rate limits, fallback chains |
| [Nano Training System](./NANO_TRAINING.md) | Sea of Nanos architecture (19 categories, 296 nanos), training pipeline, midwife, inference |
| [Agent & Fleet System](./AGENT_FLEET.md) | Autonomous agent loop, fleet orchestrator, 24/7 mode |
| [User Manual](./USER_MANUAL.md) | End-to-end guide for all IDE features |
| [TODO & Roadmap](./TODO_ROADMAP.md) | Outstanding work items sorted by language/subsystem |
| [Setup & Deployment](./SETUP_DEPLOYMENT.md) | Installation, configuration, environment variables |
| [Security & Auth](./SECURITY_AUTH.md) | Authentication modes, encryption, credential storage |
| [Completed Fixes Log](./COMPLETED_LOG.md) | All completed bug fixes and changes by session |

### Contributor Guides (by Language)

| Guide | Language | Covers |
|-------|----------|--------|
| [TypeScript Guide](./CONTRIBUTING_TYPESCRIPT.md) | TypeScript/Node.js | Fastify backend, React frontend, Zustand stores, SSE streaming, Vite build |
| [Python Guide](./CONTRIBUTING_PYTHON.md) | Python/PyTorch | Nano Sea, training pipeline, nano creation, mesh networking, FastAPI server |

## Quick Start

```bash
# Clone and install
git clone https://github.com/<your-org>/personal-ide.git
cd personal-ide
pnpm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Run everything
pnpm dev
# → Frontend: http://localhost:5173
# → Backend:  http://localhost:3001
# → Nano Sea: http://localhost:5100
```

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                    React 19 Frontend                        │
│  Zustand State │ Monaco Editor │ Tailwind CSS │ Vite 6     │
│  :5173                                                      │
├────────────────────────────────────────────────────────────┤
│                    Fastify 5 Backend                        │
│  17 Route Modules │ 9 Service Directories │ SQLite         │
│  :3001                                                      │
├────────────────────────────────────────────────────────────┤
│                 Nano Sea (Python)                           │
│  296 Micro-Neural-Networks │ PyTorch │ Training Pipeline   │
│  :5100                                                      │
├────────────────────────────────────────────────────────────┤
│                   LLM Providers                             │
│  GitHub Models │ Ollama │ Groq │ Gemini │ OpenRouter │ ... │
└────────────────────────────────────────────────────────────┘
```
