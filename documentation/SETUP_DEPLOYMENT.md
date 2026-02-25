# Setup & Deployment — Complete Installation Guide

## 1. Prerequisites

### 1.1 Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | 20+ | Backend server, frontend build |
| **pnpm** | 9+ | Monorepo package manager |
| **Python** | 3.9+ | Nano Sea training system |
| **Git** | 2.30+ | Checkpoint system, version control |

### 1.2 Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Ollama** | Latest | Local model inference |
| **LM Studio** | Latest | Local model inference (GUI) |
| **CUDA Toolkit** | 12.4+ | GPU-accelerated nano training |

### 1.3 Hardware Recommendations

| Tier | RAM | GPU | Notes |
|------|-----|-----|-------|
| **Minimum** | 8 GB | None | CPU-only nano training, slow |
| **Recommended** | 32 GB | Any CUDA GPU (4GB+ VRAM) | Fast nano training |
| **Optimal** | 64+ GB | 2× NVIDIA GPU (6GB+ VRAM each) | Full distributed training |

The system auto-detects all hardware at startup — CPU cores, RAM, GPUs (CUDA, ROCm, DirectML, Vulkan, OpenCL, MPS). No manual configuration required. It runs on anything from a Raspberry Pi to a multi-GPU workstation.

---

## 2. Installation

### 2.1 Clone and Install

```powershell
# Clone the repository
git clone https://github.com/YOUR_USERNAME/personal_IDE.git
cd personal_IDE

# Install Node.js dependencies
pnpm install

# Install Python dependencies (for Nano Sea)
cd NANO_train
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
cd ..
```

### 2.2 Automated Setup

**Windows (PowerShell)**:
```powershell
.\setup.ps1
```

**Linux/macOS (Bash)**:
```bash
chmod +x setup.sh
./setup.sh
```

The setup script:
1. Checks Node.js and pnpm versions
2. Installs all dependencies
3. Creates `.env` from `.env.example`
4. Initializes the SQLite database
5. Builds shared packages

### 2.3 Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Server
SERVER_PORT=3001
SERVER_HOST=0.0.0.0

# GitHub (optional for guest mode)
GITHUB_PAT=ghp_your_token_here

# Frontend
FRONTEND_URL=http://localhost:5173

# Database
DB_PATH=./data/personal-ide.db

# Security
ENCRYPT_KEY=change-me-to-a-random-string

# Agent defaults
AGENT_MAX_ITERATIONS=50
AGENT_STEP_DELAY_MS=2000
```

**Critical**: Change `ENCRYPT_KEY` before storing any API keys. The default value is insecure.

---

## 3. Development Workflow

### 3.1 Start Everything

Open three terminals:

**Terminal 1 — Backend**:
```powershell
cd apps/server
pnpm dev
# Starts Fastify server at http://localhost:3001
```

**Terminal 2 — Frontend**:
```powershell
cd apps/web
pnpm dev
# Starts Vite dev server at http://localhost:5173
```

**Terminal 3 — Nano Sea** (optional):
```powershell
cd NANO_train
.\.venv\Scripts\Activate.ps1
python main.py
# Starts Nano Sea at http://localhost:5100
```

### 3.2 Monorepo Structure

The project uses pnpm workspaces:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

| Package | Path | Description |
|---------|------|-------------|
| `@personal-ide/web` | `apps/web/` | React frontend |
| `@personal-ide/server` | `apps/server/` | Fastify backend |
| `@personal-ide/shared` | `packages/shared/` | Shared types and constants |

### 3.3 Build Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages for production |
| `pnpm -F @personal-ide/server dev` | Start only the backend |
| `pnpm -F @personal-ide/web dev` | Start only the frontend |
| `pnpm -F @personal-ide/shared build` | Build shared package |

### 3.4 TypeScript Configuration

Root `tsconfig.json` is the base config. Each app extends it:

```json
// apps/server/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist"
  }
}
```

---

## 4. Database Setup

### 4.1 Automatic Initialization

The SQLite database is created automatically on first server start at the path specified by `DB_PATH` (default: `./data/personal-ide.db`).

Tables are created via migrations embedded in the server code.

### 4.2 Manual Reset

To reset the database (deletes all stored data):

```powershell
Remove-Item ./data/personal-ide.db
Remove-Item ./data/personal-ide.db-shm -ErrorAction SilentlyContinue
Remove-Item ./data/personal-ide.db-wal -ErrorAction SilentlyContinue
# Restart server to recreate
```

### 4.3 Backup

```powershell
Copy-Item ./data/personal-ide.db ./data/personal-ide-backup-$(Get-Date -Format "yyyyMMdd").db
```

---

## 5. Production Build

### 5.1 Build All

```powershell
pnpm build
```

This compiles:
- Frontend: Vite builds to `apps/web/dist/`
- Backend: TypeScript compiles to `apps/server/dist/`
- Shared: TypeScript compiles to `packages/shared/dist/`

### 5.2 Run Production

```powershell
cd apps/server
node dist/index.js
```

The production server serves both the API and the frontend static files.

### 5.3 Environment Variables for Production

```env
NODE_ENV=production
SERVER_PORT=3001
SERVER_HOST=0.0.0.0
FRONTEND_URL=http://your-domain.com
DB_PATH=/var/data/personal-ide.db
ENCRYPT_KEY=your-secure-random-string-here
```

---

## 6. Multi-Machine Deployment

### 6.1 Nano Sea on Separate Machine

The Nano Sea can run on a different machine (e.g., a GPU server):

**GPU Machine**:
```bash
cd NANO_train
python main.py --host 0.0.0.0 --port 5100
```

**IDE Machine** — update provider config to point to the GPU machine's IP:
- Provider: Nano Sea
- Base URL: `http://gpu-machine-ip:5100/v1`

### 6.2 Mesh Networking

For distributed training across multiple machines:

1. Install Nano Sea on each machine
2. Start with mesh enabled: `python main.py --mesh`
3. Machines discover each other via mDNS
4. Nanos are automatically distributed based on GPU capacity

### 6.3 Reverse Proxy (Nginx)

For exposing the IDE over the network:

```nginx
server {
    listen 80;
    server_name ide.your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE endpoints need long timeouts
    location /api/agent/stream {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    location /api/fleet/stream {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 7. Troubleshooting Setup

### 7.1 pnpm install fails

```powershell
# Clear cache and retry
pnpm store prune
Remove-Item -Recurse -Force node_modules
pnpm install
```

### 7.2 Python venv issues (Windows)

```powershell
# If Activate.ps1 is blocked
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# Then retry
.\.venv\Scripts\Activate.ps1
```

### 7.3 CUDA not detected

```powershell
# Check CUDA availability
python -c "import torch; print(torch.cuda.is_available())"
# If False, install CUDA-enabled PyTorch:
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

### 7.4 Port conflicts

```powershell
# Check what's using a port
Get-NetTCPConnection -LocalPort 3001 | Select-Object -Property OwningProcess
Get-Process -Id <PID>
```

### 7.5 Database locked

If you see "database is locked" errors:
1. Stop all server instances
2. Delete WAL files: `Remove-Item ./data/personal-ide.db-wal`
3. Restart the server
