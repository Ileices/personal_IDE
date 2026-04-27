# ILEICES HPC — Multi-Machine Setup Guide

## Overview

This guide walks you through setting up a mesh of machines running the Ileices HPC agent. One machine acts as **commander** (orchestrator), the rest act as **workers** (compute nodes). All communication happens over your LAN via TCP.

**Architecture:**
```
                    ┌──────────────┐
         ┌────────►│   COMMANDER   │◄────────┐
         │         │ 192.168.0.241 │         │
         │         │   :7777       │         │
         │         └───────┬──────┘         │
         │                 │                 │
    ┌────┴─────┐    ┌─────┴────┐     ┌─────┴────┐
    │ WORKER 1 │    │ WORKER 2 │     │ WORKER N │
    │ .0.100   │    │ .0.101   │     │ .0.xxx   │
    └──────────┘    └──────────┘     └──────────┘
```

Workers connect TO the commander. The commander tracks all peers, distributes jobs, and aggregates results. Workers also discover each other via gossip for direct peer-to-peer communication.

---

## Prerequisites

- **Python 3.10+** on every machine
- **Network:** All machines on the same LAN (or reachable via IP)
- **Firewall:** TCP port 7777 (or your chosen port) open
- **OS:** Windows 10/11, Linux (Ubuntu 20.04+, etc.), or macOS

---

## Step 1: Get the Files onto Each Machine

### What to Copy

Every machine needs the **same** set of files. Copy the entire project folder:

```
ileices_hpc/              ← The Python package (ALL subdirectories)
    __init__.py
    __main__.py
    mesh/
        __init__.py
        protocol.py
        server.py
        client.py
        peer_discovery.py
        gossip.py
    crypto/
        __init__.py
        identity.py
        encryption.py
    agent/
        __init__.py
        config.py
        hardware_benchmark.py
        command_handler.py
        main.py
    simulation/           ← Optional (only needed for testing)
        sim_mesh.py
        sim_node.py
        scenarios.py
        run_sim.py
    tests/                ← Optional (only needed for testing)
        __init__.py
        test_31_connection.py
requirements.txt          ← Package list
bootstrap.py              ← Setup script
```

### How to Copy

**Option A — USB drive / network share:**
Copy the entire project folder to each machine.

**Option B — ZIP and transfer:**
```powershell
# On the source machine (Windows):
Compress-Archive -Path ileices_hpc, requirements.txt, bootstrap.py -DestinationPath ileices_hpc_deploy.zip

# On Linux/macOS source:
zip -r ileices_hpc_deploy.zip ileices_hpc/ requirements.txt bootstrap.py
```

**Option C — SCP (if SSH is set up):**
```bash
scp -r ileices_hpc/ requirements.txt bootstrap.py user@192.168.0.100:~/ileices/
```

---

## Step 2: Set Up Python Environment (Each Machine)

Run these commands on **every** machine. Adjust paths for your OS.

### Windows

```powershell
# Navigate to the project directory
cd C:\path\to\ileices

# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\Activate.ps1
# If scripts are disabled: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Install core dependencies
pip install -r requirements.txt

# Install PyTorch (pick the right one for your GPU)
# CUDA 12.8 (most modern NVIDIA GPUs):
pip install torch --index-url https://download.pytorch.org/whl/cu128

# CUDA 12.4 (older driver):
# pip install torch --index-url https://download.pytorch.org/whl/cu124

# CPU only (no NVIDIA GPU):
# pip install torch --index-url https://download.pytorch.org/whl/cpu

# AMD GPU (ROCm 6.2):
# pip install torch --index-url https://download.pytorch.org/whl/rocm6.2
```

### Linux / macOS

```bash
cd /path/to/ileices

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

# PyTorch — same options as above:
pip install torch --index-url https://download.pytorch.org/whl/cu128
```

### Verify with Bootstrap

```bash
python bootstrap.py --check
```

You should see all checks PASS. The output will show:
- Python version
- Installed packages
- Detected GPUs
- LAN IP address
- Available port
- Hardware specs

**Save the LAN IP shown** — you'll need it to configure workers.

---

## Step 3: Configure the Commander Machine

The commander is the machine you'll control everything from. Pick one machine — ideally the one you're sitting at.

### Find Your Commander's LAN IP

```powershell
# Windows:
ipconfig | findstr "IPv4"

# Linux:
hostname -I

# macOS:
ipconfig getifaddr en0
```

Example output: `192.168.0.241`

### Start the Commander

```powershell
# Windows:
.venv\Scripts\python.exe -m ileices_hpc --role commander --port 7777

# Linux/macOS:
python -m ileices_hpc --role commander --port 7777
```

You'll see:
```
==================================================
  ILEICES HPC AGENT v0.1.0
  Node ID: a1b2c3d4...
  Role:    commander
  Port:    7777
  Crypto:  ON
==================================================

[1/4] Running hardware benchmark...
  Tier: CORE
  GPU: NVIDIA GeForce GTX 1660 SUPER (6144 MB) × 2
  CPU: 12 cores, 79.9 GB RAM
  ...

[2/4] Starting mesh server...
[3/4] Connecting to mesh...
[4/4] Starting discovery and gossip...

Ready. Type 'help' for commands.
ileices>
```

**Leave this running.** The commander is now listening on port 7777.

### Commander CLI Commands

| Command | Description |
|---------|-------------|
| `status` | Show this node's status |
| `peers` | List all connected peers |
| `benchmark` | Re-run hardware benchmark |
| `send <peer_id> <msg>` | Send a message to a peer |
| `broadcast <msg>` | Send to all peers |
| `disconnect <peer_id>` | Disconnect a peer |
| `logs` | Show recent log entries |
| `quit` | Graceful shutdown |

---

## Step 4: Start Workers (Each Other Machine)

On each worker machine, use the commander's LAN IP:

```powershell
# Replace 192.168.0.241 with YOUR commander's actual IP
.venv\Scripts\python.exe -m ileices_hpc --role worker --commander 192.168.0.241:7777
```

You'll see:
```
==================================================
  ILEICES HPC AGENT v0.1.0
  Node ID: e5f6g7h8...
  Role:    worker
  Port:    7777
  Crypto:  ON
==================================================

[1/4] Running hardware benchmark...
  Tier: EDGE
  GPU: NVIDIA GeForce RTX 3060 (12288 MB) × 1
  ...

[3/4] Connecting to mesh...
  Connecting to commander at 192.168.0.241:7777...
  Connected to commander: a1b2c3d4e5

[4/4] Starting discovery and gossip...
Ready.
```

### If Workers Use the Same Port

If you're running multiple agents on the same machine (testing), use different ports:
```bash
python -m ileices_hpc --role worker --port 7778 --commander 192.168.0.241:7777
python -m ileices_hpc --role worker --port 7779 --commander 192.168.0.241:7777
```

---

## Step 5: Verify the Mesh

### On the Commander

Type `peers` in the commander CLI:
```
ileices> peers
Connected peers: 3
  1. e5f6g7h8 @ 192.168.0.100:7777 [CORE]
  2. i9j0k1l2 @ 192.168.0.101:7777 [EDGE]
  3. m3n4o5p6 @ 192.168.0.102:7777 [NANO]
```

Type `status` for a full overview:
```
ileices> status
Node: a1b2c3d4 (commander)
Uptime: 5m 32s
Peers: 3/128
Tier: CORE
GPU: 2× GTX 1660 SUPER
```

### Broadcast Test

```
ileices> broadcast hello from commander
Sent to 3 peers
```

Workers will log the received message.

---

## Step 6: Firewall Configuration

### Windows Firewall

```powershell
# Run as Administrator:
New-NetFirewallRule -DisplayName "Ileices HPC" -Direction Inbound -Protocol TCP -LocalPort 7777 -Action Allow
```

Or via GUI: Windows Security → Firewall → Advanced Settings → Inbound Rules → New Rule → Port → TCP 7777 → Allow.

### Linux (UFW)

```bash
sudo ufw allow 7777/tcp
```

### Linux (iptables)

```bash
sudo iptables -A INPUT -p tcp --dport 7777 -j ACCEPT
```

### macOS

System Preferences → Security → Firewall → Allow incoming connections for Python.

---

## Step 7: Running as a Background Service (Optional)

### Windows — Task Scheduler

1. Open Task Scheduler
2. Create Basic Task → "Ileices Worker"
3. Trigger: At startup
4. Action: Start a program
   - Program: `C:\path\to\.venv\Scripts\python.exe`
   - Arguments: `-m ileices_hpc --role worker --commander 192.168.0.241:7777`
   - Start in: `C:\path\to\ileices`

### Linux — systemd

Create `/etc/systemd/system/ileices-worker.service`:
```ini
[Unit]
Description=Ileices HPC Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ileices
ExecStart=/path/to/ileices/.venv/bin/python -m ileices_hpc --role worker --commander 192.168.0.241:7777
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ileices-worker
sudo systemctl start ileices-worker
sudo systemctl status ileices-worker
```

---

## Troubleshooting

### "Connection refused" when worker tries to connect

1. **Commander not running?** Start it first.
2. **Wrong IP?** Run `ipconfig` (Windows) or `hostname -I` (Linux) on the commander.
3. **Firewall blocking?** See Step 6.
4. **Wrong port?** Make sure both sides use the same port.

### "Port already in use"

Another process (or a previous Ileices instance) is using the port:
```powershell
# Windows — find what's using port 7777:
netstat -ano | findstr :7777

# Kill it:
Stop-Process -Id <PID> -Force
```
```bash
# Linux:
lsof -i :7777
kill <PID>
```

Or just pick a different port: `--port 7778`

### "PyNaCl not installed" warning

Encryption won't work without PyNaCl:
```bash
pip install PyNaCl
```

To run WITHOUT encryption (not recommended for production):
```bash
python -m ileices_hpc --role worker --commander 192.168.0.241:7777 --no-crypto
```

### Worker keeps disconnecting and reconnecting

Check the log file at `ileices_data/ileices_agent.log` for details. Common causes:
- Network instability (try wired instead of WiFi)
- Heartbeat timeout too short (increase in config)
- Commander overloaded

### "Benchmark failed" on startup

The agent will still work — it just won't know its hardware tier. Usually caused by:
- No GPU drivers installed
- PyTorch not matching GPU (CUDA version mismatch)
- Run `python -c "import torch; print(torch.cuda.is_available())"` to check

### Tests fail on a machine

Run the test suite to verify the installation:
```bash
python -m ileices_hpc.tests.test_31_connection
```

All 16 tests should pass. If not, check:
- All files were copied completely (no truncation)
- Python version is 3.10+
- All packages installed (`pip install -r requirements.txt`)

---

## Configuration File (Advanced)

Instead of CLI flags, you can use a JSON config file. Generate a template:
```bash
python bootstrap.py  # Creates ileices_data/config_template.json
```

Edit `ileices_data/config_template.json`:
```json
{
  "node_name": "worker-gpu-3090",
  "role": "worker",
  "commander_address": "192.168.0.241:7777",
  "log_level": "INFO",
  "mesh": {
    "listen_port": 7777,
    "max_peers": 128,
    "heartbeat_interval_s": 5.0,
    "heartbeat_timeout_s": 15.0
  },
  "crypto": {
    "enabled": true
  }
}
```

Then start with:
```bash
python -m ileices_hpc --config ileices_data/config_template.json
```

CLI flags override config file values.

---

## Quick Reference

| Machine | Command |
|---------|---------|
| **Commander** | `python -m ileices_hpc --role commander --port 7777` |
| **Worker** | `python -m ileices_hpc --role worker --commander <COMMANDER_IP>:7777` |
| **Worker (custom port)** | `python -m ileices_hpc --role worker --port 7778 --commander <COMMANDER_IP>:7777` |
| **Worker (no encryption)** | `python -m ileices_hpc --role worker --commander <COMMANDER_IP>:7777 --no-crypto` |
| **Worker (with config)** | `python -m ileices_hpc --config my_config.json` |
| **Run tests** | `python -m ileices_hpc.tests.test_31_connection` |
| **Bootstrap check** | `python bootstrap.py --check` |
| **Run simulation** | `python -m ileices_hpc.simulation.run_sim --scenario mesh_stress` |

---

## File Inventory

| File | Purpose | Required? |
|------|---------|-----------|
| `ileices_hpc/__init__.py` | Package init | Yes |
| `ileices_hpc/__main__.py` | Entry point (`python -m ileices_hpc`) | Yes |
| `ileices_hpc/mesh/protocol.py` | Message framing, types, validation | Yes |
| `ileices_hpc/mesh/server.py` | TCP server, peer management | Yes |
| `ileices_hpc/mesh/client.py` | TCP client, auto-reconnect | Yes |
| `ileices_hpc/mesh/peer_discovery.py` | mDNS + manual peer discovery | Yes |
| `ileices_hpc/mesh/gossip.py` | Gossip protocol for state sync | Yes |
| `ileices_hpc/crypto/identity.py` | Ed25519 key pair, node ID | Yes |
| `ileices_hpc/crypto/encryption.py` | NaCl encrypted channels | Yes |
| `ileices_hpc/agent/config.py` | Configuration management | Yes |
| `ileices_hpc/agent/hardware_benchmark.py` | GPU/CPU/RAM/Disk profiling | Yes |
| `ileices_hpc/agent/command_handler.py` | CLI command processing | Yes |
| `ileices_hpc/agent/main.py` | Agent lifecycle, event loop | Yes |
| `ileices_hpc/simulation/` | Simulation engine | No (testing only) |
| `ileices_hpc/tests/` | Test suite | No (testing only) |
| `requirements.txt` | pip dependencies | Yes |
| `bootstrap.py` | Environment validator | Recommended |

---

## What Happens Next

Once the mesh is running with multiple machines connected:

1. **Hardware profiles** are exchanged via gossip — each machine knows every other machine's capabilities
2. **Tier assignment** happens automatically (NANO/EDGE/CORE/ULTRA based on GPU)
3. **Training jobs** can be submitted (nano training, federated learning)
4. **Nanos** will be distributed across machines based on available resources
5. **The mesh self-heals** — if a machine drops, its nanos redistribute to remaining machines

The current build has the full mesh infrastructure (connect, discover, gossip, benchmark, commands). The training pipeline (nano pool, job scheduler, gradient aggregation) is the next phase.
