"""
Simple launcher script for the Ileices HPC Agent.

Usage:
  Commander (your main machine with CLI):
    python run_agent.py --role commander --port 7777

  Worker (other machines — connect to commander):
    python run_agent.py --role worker --commander 192.168.1.X:7777

  Worker (no encryption — fast LAN testing):
    python run_agent.py --role worker --commander 192.168.1.X:7777 --no-crypto

  Custom name:
    python run_agent.py --role commander --port 7777 --name "1660-Dually"
"""
import asyncio
import sys
import os

# Add parent dir to path so imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ileices_hpc.agent.main import main

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAgent stopped by user.")
