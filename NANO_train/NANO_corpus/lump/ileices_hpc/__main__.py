"""
Entry point for `python -m ileices_hpc`
"""
import asyncio
from .agent.main import main

if __name__ == '__main__':
    asyncio.run(main())
