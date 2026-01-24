<div align="center">

# 🐝 Copilot Swarm Orchestrator

**Parallel AI workflow orchestration using GitHub Copilot CLI custom agents**

[![Build Status](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions)
[![Tests](https://img.shields.io/badge/tests-428%20passing-brightgreen)](https://github.com/moonrunnerkc/copilot-swarm-conductor)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

*Built for the GitHub Copilot CLI Challenge*

[Quick Start](#quick-start) • [Commands](#commands) • [Custom Agents](#custom-agents) • [How It Works](#how-it-works)

</div>

---

## Overview

Copilot Swarm Orchestrator coordinates multiple concurrent Copilot CLI sessions with dependency-aware execution and human-like git commit history.

### Key Features

| Feature | Description |
|---------|-------------|
| **Parallel Execution** | Independent steps run concurrently via `copilot -p` sessions |
| **Wave-Based Scheduling** | Steps execute in waves based on dependency graph |
| **Per-Agent Branches** | Each agent works on isolated branch, auto-merged on completion |
| **Evidence Verification** | Transcript parsing validates claims before merging |
| **Natural Git History** | Incremental commits with varied, human-like messages |

---

## Quick Start

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-conductor.git
cd copilot-swarm-conductor
npm install
npm run build
npm test

# Run a demo
npm start demo todo-app
```

## Commands

```
swarm-orchestrator demo <scenario>              Run pre-configured demo
swarm-orchestrator demo list                    List available demos
swarm-orchestrator plan <goal>                  Generate execution plan
swarm-orchestrator swarm <planfile>             Execute plan in parallel
swarm-orchestrator execute <planfile>           Execute plan sequentially
swarm-orchestrator status <execid>              Show execution status
swarm-orchestrator --help                       Show all options
```

### Demo Scenarios

```bash
npm start demo list
```

| Scenario | Description | Steps | Duration |
|----------|-------------|-------|----------|
| `todo-app` | React frontend + Express backend | 4 | 5-8 min |
| `api-server` | REST API with auth and database | 6 | 10-15 min |
| `full-stack-app` | Full-stack with all agents | 7 | 15-20 min |
| `saas-mvp` | SaaS MVP with payments | 8 | 20-30 min |

### Parallel Execution

```bash
# Generate a plan
npm start plan "Build a REST API for user management"

# Execute in parallel with dashboard
npm start swarm plans/plan-*.json

# Specify model
npm start swarm plan.json --model claude-opus-4.5
```

## Custom Agents

Six specialized agents in `.github/agents/`:

| Agent | File | Scope |
|-------|------|-------|
| Backend Master | `backend-master.agent.md` | APIs, databases, server logic |
| Frontend Expert | `frontend-expert.agent.md` | UI, components, styling |
| DevOps Pro | `devops-pro.agent.md` | CI/CD, deployment, infra |
| Security Auditor | `security-auditor.agent.md` | Auth, vulnerabilities |
| Tester Elite | `tester-elite.agent.md` | Unit, integration, e2e tests |
| Integrator Finalizer | `integrator-finalizer.agent.md` | Merge, verify, document |

Each agent follows the Copilot custom agent format:

```yaml
---
name: backend_master
description: "Backend specialist"
target: github-copilot
tools: [read, edit, run, search]
---

# Backend Master Agent
You are a backend specialist...
```

## How It Works

1. **Plan Generation** - Analyze goal and create steps with agent assignments
2. **Wave Calculation** - Group steps by dependencies (independent steps run together)
3. **Branch Creation** - Each step gets its own branch: `swarm/{execId}/step-{N}-{agent}`
4. **Parallel Execution** - Run `copilot -p` sessions concurrently per wave
5. **Verification** - Parse transcripts for evidence of completed work
6. **Auto-Merge** - Merge verified branches back to main

Example wave execution:
```
Wave 1 (parallel):  Step 1 (backend) + Step 2 (frontend)
Wave 2:             Step 3 (tests) - depends on 1,2
Wave 3:             Step 4 (integration) - depends on 1,2,3
```

## Output Structure

Execution artifacts are saved to `runs/<execution-id>/`:

```
runs/swarm-2026-01-24T.../
├── steps/
│   ├── step-1/
│   │   └── share.md         # Copilot session transcript
│   └── step-2/
│       └── share.md
├── verification/
│   └── step-1-verification.md
└── .context/
    └── shared-context.json  # Inter-agent context
```

## Testing

```bash
npm test
```

428 tests covering orchestration, verification, plan generation, and agent configuration.

## Project Structure

```
src/
├── cli.ts                   # Command-line interface
├── swarm-orchestrator.ts    # Parallel execution coordinator
├── session-executor.ts      # Copilot CLI session runner
├── verifier-engine.ts       # Evidence-based verification
├── plan-generator.ts        # Step planning and dependencies
├── context-broker.ts        # Shared state for parallel agents
├── config-loader.ts         # Agent configuration loading
├── demo-mode.ts             # Pre-configured scenarios
└── share-parser.ts          # Transcript parsing

.github/agents/              # Custom agent definitions (6 agents)
config/                      # Agent YAML configurations
```

## Requirements

- Node.js 18+
- GitHub Copilot CLI installed and authenticated

---

<div align="center">

**Built with ❤️ for the GitHub Copilot CLI Challenge**

</div>

## License

ISC
