#!/bin/bash
# ============================================
# Personal IDE — Setup Script (Unix)
#
# Usage:  chmod +x setup.sh && ./setup.sh
# ============================================
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Personal IDE — Setup              ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "✗  Node.js not found. Please install Node.js 20+ from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗  Node.js $(node --version) is too old. Please install Node.js 20+."
  exit 1
fi
echo "✓  Node.js $(node --version)"

# Check/install pnpm
if ! command -v pnpm &> /dev/null; then
  echo "⚠  pnpm not found. Installing..."
  npm install -g pnpm
fi
echo "✓  pnpm $(pnpm --version)"

# Run the full setup
node scripts/setup.js
