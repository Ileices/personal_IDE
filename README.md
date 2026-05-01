# Personal IDE

[OUT_OF_DATE]
[UPDATE_SCHEDULED] = 5-1-26 0300 PST

AI-powered coding assistant with GitHub Copilot models, project memory, autonomous agent loop, and the **Sea of Nanos** distributed compute mesh.

## Quick Start

### Prerequisites
| Tool | Version | Get it |
|------|---------|--------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Python** | 3.10+ *(optional — for Nano Sea)* | [python.org](https://www.python.org/downloads/) |
| **GitHub PAT** | — | [github.com/settings/tokens](https://github.com/settings/tokens) (scope: `models:read`) |

### Setup

**Windows (PowerShell):**
```powershell
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
.\setup.ps1
```

**Linux / macOS:**
```bash
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
chmod +x setup.sh && ./setup.sh
```

**Or manually:**
```bash
git clone https://github.com/Ileices/personal_IDE.git
cd personal_IDE
pnpm install              # install all dependencies
pnpm --filter @personal-ide/shared build   # build the shared types package
cp .env.example .env      # then edit .env and add your GITHUB_PAT
```

### Run

```bash
npm run dev
```

This starts:
- **Server** at `http://localhost:3001` (Fastify + API routes)
- **Frontend** at `http://localhost:5173` (React + Vite)

Open `http://localhost:5173` in your browser.

---

## Architecture

```
personal_IDE/
├── apps/
│   ├── server/          # Fastify backend — chat, models, memory, agent, nano control
│   └── web/             # React frontend — Vite, Tailwind, Monaco editor
├── packages/
│   └── shared/          # Shared TypeScript types & constants (compiled to dist/)
├── NANO_train/          # Sea of Nanos — Python ML backend
│   ├── main.py          # Boot sequence (10 steps)
│   ├── core/            # Foundation nanos
│   ├── nanos/           # 296 specialized nanos (19 categories)
│   ├── mesh/            # P2P networking, global pool, peer discovery
│   ├── server/          # FastAPI backend (port 5100)
│   ├── training/        # Training pipeline
│   └── scanner/         # AE filesystem scanner
├── scripts/
│   └── setup.js         # Cross-platform setup script
├── setup.sh             # Unix setup wrapper
├── setup.ps1            # Windows setup wrapper
└── .env.example         # Environment template
```

### Key packages

| Package | Purpose |
|---------|---------|
| `@personal-ide/server` | Fastify 5 API server — all routes, SQLite DB, model providers |
| `@personal-ide/web` | React 19 + Vite 6 frontend — Monaco editor, chat, agent panel |
| `@personal-ide/shared` | Shared types, model configs, constants (must be built before server) |
| `NANO_train` | Python Sea of Nanos — 296 nanos, mesh networking, distributed training |

### Nano Sea Controls

The Waves (🌊) button in the IDE toolbar opens the Nano Sea control panel:
- **Start / Stop / Restart** the Python backend
- **Mesh networking** — P2P distributed compute
- **Global pool** — donate idle compute, idle training
- **Peer discovery** — find other IDE instances on your network
- **Live logs** — real-time process output

The IDE server spawns and manages the Python process — no separate terminal needed.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PAT` | **Yes** | GitHub token with `models:read` scope |
| `GITHUB_CLIENT_ID` | For OAuth | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | For OAuth | GitHub OAuth app secret |
| `SERVER_PORT` | No | Server port (default: 3001) |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: http://localhost:5173) |
| `DEFAULT_PROJECTS_DIR` | No | Default projects directory |

---

## Troubleshooting

### `buildModelParams` export error
The shared package needs to be compiled. Run:
```bash
pnpm --filter @personal-ide/shared build
```

### Python not found by Nano Sea
The server auto-detects Python. It tries `python`, `python3`, and `py -3` (Windows).
Make sure Python 3.10+ is on your PATH.

### Port already in use
Kill the process on port 3001 or 5173, or change `SERVER_PORT` in `.env`.

---

## License

Private — All rights reserved.
