<h1 align="center">
<img src="docs/media/wasp.svg" alt="" width="36" height="36" style="vertical-align: middle; margin-right: 8px;">
Copilot Swarm Orchestrator
<img src="docs/media/wasp.svg" alt="" width="36" height="36" style="vertical-align: middle; margin-left: 8px;">
</h1>

<p align="center">
Parallel execution of GitHub Copilot CLI sessions with dependency-aware wave scheduling,<br>
transcript-based verification, and per-agent git branch isolation.
</p>

<p align="center">
<a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC"></a>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-339933.svg" alt="Node.js"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg" alt="TypeScript"></a>
<a href="#verification"><img src="https://img.shields.io/badge/Tests-396%20passing-brightgreen.svg" alt="Tests"></a>
</p>

---

<p align="center">
<a href="#overview">Overview</a> ·
<a href="#what-this-is">What This Is</a> ·
<a href="#usage">Usage</a> ·
<a href="#architecture">Architecture</a> ·
<a href="#agents">Agents</a> ·
<a href="#verification">Verification</a> ·
<a href="#limitations">Limitations</a>
</p>

---

## Overview

This tool orchestrates multiple GitHub Copilot CLI sessions to execute a multi-step plan. Independent steps run in parallel on isolated git branches. Each step is verified by parsing its transcript for evidence of completion. Verified branches merge back to main.

<details>
<summary><strong>Demo Video</strong></summary>

<a href="https://youtu.be/5m-6yxnDjk4" target="_blank">Watch on YouTube</a>

</details>

<details>
<summary><strong>Screenshots</strong></summary>

| Execution in progress | Wave completion |
|:---------------------:|:---------------:|
| ![Execution](docs/media/existing-project-01.png) | ![Completion](docs/media/existing-project-02.png) |

</details>

---

## What This Is

- A CLI tool that runs `copilot -p` as a subprocess
- A scheduler that groups independent steps into parallel waves
- A verifier that parses Copilot transcripts for evidence (commits, test output, file creation)
- A branch manager that isolates each agent's work and merges on verification
- A self-repair loop that retries failed steps with failure context and root-cause analysis
- A plan reviewer that validates dependency graphs and agent assignments before execution
- A quality gate runner with six built-in checks (scaffold defaults, duplicate blocks, hardcoded config, README claims, test isolation, runtime checks)
- A web dashboard for browsing past execution runs
- A template gallery with starter plans for common project types

## What This Is Not

- Not an embedded or simulated Copilot
- Not a guarantee that Copilot will complete tasks correctly
- Not a replacement for human review

---

## Requirements

- Node.js 18 or later
- GitHub Copilot CLI installed and authenticated (`gh copilot`)
- Git

---

## Installation

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-orchestrator.git
cd copilot-swarm-orchestrator
npm install
npm run build
```

One-liner install (requires Node.js 18+ and git):

```bash
curl -fsSL https://raw.githubusercontent.com/moonrunnerkc/copilot-swarm-orchestrator/main/install.sh | bash
```

Optional global install:

```bash
npm link
```

---

## Usage

### Quick Demo

```bash
npm start demo-fast
```

Runs a two-step demo with parallel execution. Completes in approximately three minutes.

### Commands

| Command | Description |
|---------|-------------|
| `npm start demo-fast` | Two-step parallel demo |
| `npm start demo dashboard-showcase` | Four-step analytics dashboard |
| `npm start demo todo-app` | Four-step React + Express app |
| `npm start demo list` | List all available demos |
| `npm start plan "goal"` | Generate execution plan |
| `npm start swarm plan.json` | Execute a saved plan |
| `npm start swarm plan.json --pm` | Execute with PM agent plan review |
| `npm start quick "task"` | Single-agent quick task |
| `npm start bootstrap ./repo "goal"` | Analyze repo and generate plan |
| `npm start gates [path]` | Run quality gates on a repo |
| `npm start web-dashboard [port]` | Start web dashboard (default: 3002) |
| `npm start templates` | List plan templates |

With global install, replace `npm start` with `swarm`.

### Demo Scenarios

| Scenario | Steps | Approximate Duration |
|----------|------:|---------------------:|
| `demo-fast` | 2 | 3 min |
| `dashboard-showcase` | 4 | 5 min |
| `todo-app` | 4 | 15 min |
| `api-server` | 6 | 25 min |
| `full-stack-app` | 7 | 30 min |
| `saas-mvp` | 8 | 40 min |

Duration depends on model latency and task complexity.

---

## Architecture

```
Goal → Plan Generator → Wave Scheduler → Agent Branches → Verifier → Merge
```

1. **Plan generation** — Assigns tasks to agents with declared dependencies
2. **Wave scheduling** — Groups independent steps for parallel execution
3. **Branch isolation** — Each step runs on `swarm/<id>/step-N-agent`
4. **Execution** — Invokes `copilot -p` with agent prompt, captures transcript
5. **Verification** — Parses transcript for commits, test output, file changes
6. **Merge** — Verified branches merge to main

### Key Modules

| File | Lines | Purpose |
|------|------:|---------|
| `src/cli.ts` | 1217 | CLI entry point |
| `src/swarm-orchestrator.ts` | 1685 | Parallel execution engine |
| `src/plan-generator.ts` | 732 | Plan creation and validation |
| `src/session-executor.ts` | 430 | Copilot CLI invocation |
| `src/verifier-engine.ts` | 476 | Transcript verification |
| `src/demo-mode.ts` | 596 | Demo scenario definitions |
| `src/repair-agent.ts` | 327 | Self-repair loop for failed steps |
| `src/pm-agent.ts` | 303 | Plan review before execution |
| `src/web-dashboard.ts` | 158 | Browser-based run viewer |

---

## Agents

Six step-executing agents defined in `config/default-agents.yaml`:

| Agent | Scope |
|-------|-------|
| `backend_master` | Server-side logic, APIs |
| `frontend_expert` | UI components, React |
| `tester_elite` | Test suites, coverage |
| `security_auditor` | Security hardening |
| `devops_pro` | CI/CD, deployment |
| `integrator_finalizer` | Final integration |

Two specialized agents with their own configs in `config/`:

| Agent | Config | Scope |
|-------|--------|-------|
| `RepairAgent` | `config/repair-agent.yaml` | Retries failed steps with failure context, transcript diffs, and root-cause analysis |
| `PMAgent` | `config/pm-agent.yaml` | Reviews plans before execution for circular deps, missing deps, and agent validity |

A meta-reviewer component runs internally after each wave to analyze results and trigger retries. It does not execute plan steps.

---

## Output Artifacts

Execution produces two categories of output:

**Project files** — Your actual code, merged to main after verification.

**Execution artifacts** — Audit trail for debugging and review:

| Path | Contents |
|------|----------|
| `plans/` | Saved execution plans |
| `runs/<id>/steps/step-N/share.md` | Copilot transcript |
| `runs/<id>/steps/step-N/verification.md` | Verification results |

Demo runs create temp directories automatically. For runs in your own repo, add to `.gitignore`:

```
plans/
runs/
proof/
.quickfix/
```

---

## Verification

Claims in this document can be verified against the repository:

```bash
# Test suite
npm test
# Output: 396 passing, 1 pending

# Source file count
find src -name "*.ts" -o -name "*.tsx" | wc -l
# Output: 65

# Test file count
ls test/*.test.ts | wc -l
# Output: 35

# Agent definitions
grep "name:" config/default-agents.yaml | wc -l
# Output: 6

# Demo scenarios
npm start demo list
# Output: 6 scenarios listed

# Templates
ls templates/*.json | wc -l
# Output: 5
```

---

## Limitations

- Requires GitHub Copilot CLI to be installed and authenticated
- Executes only documented Copilot CLI flags (`-p`, `--model`, `--share`)
- Does not guarantee task completion by Copilot
- Retries failed steps up to three times via the RepairAgent self-repair loop
- Deployment execution (`--confirm-deploy`) is opt-in only
- No rollback mechanism for failed deployments

---

## License

ISC
