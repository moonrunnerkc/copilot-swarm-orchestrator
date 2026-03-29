#!/bin/bash
# Swarm Orchestrator - Quick Install
# curl -fsSL https://raw.githubusercontent.com/moonrunnerkc/swarm-orchestrator/main/install.sh | bash
set -e

echo "Installing Swarm Orchestrator..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js 18+ required. Install from https://nodejs.org"; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "Error: git required."; exit 1; }

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found v$(node -v))"
  exit 1
fi

# Install globally via npm
npm install -g swarm-orchestrator

echo ""
echo "✅ Installed! Run: swarm --help"
echo ""
echo "Quick start:"
echo "  swarm demo-fast          # 2-step parallel demo"
echo "  swarm plan \"Build API\"    # Generate a plan"
echo "  swarm quick \"fix typo\"    # Single-agent quick fix"
