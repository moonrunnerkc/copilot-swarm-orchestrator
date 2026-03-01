<p align="center">
  <img src="docs/media/wasp.svg" alt="Copilot Swarm Orchestrator" width="72" height="72">
</p>

<h1 align="center">Copilot Swarm Orchestrator</h1>

<p align="center">
<strong>Parallel AI workflow engine for GitHub Copilot CLI.</strong><br>
Turn a goal into a dependency-aware execution plan, run multiple Copilot agents simultaneously on isolated git branches, verify every step from transcript evidence, and merge the results.
</p>

<p align="center">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-ISC-blue.svg" alt="License: ISC"></a>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-18%2B-339933.svg" alt="Node.js 18+"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-5.x-3178C6.svg" alt="TypeScript 5.x"></a>
<a href="#test-suite"><img src="https://img.shields.io/badge/tests-397%20passing-brightgreen.svg" alt="397 tests passing"></a>
<a href="#project-stats"><img src="https://img.shields.io/badge/source-15%2C634%20lines-informational.svg" alt="15,634 lines"></a>
</p>

<p align="center">
<a href="#quickstart">Quickstart</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#demos">Demos</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#how-it-works">How It Works</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#features">Features</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#commands">Commands</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#configuration">Configuration</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#architecture">Architecture</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#contributing">Contributing</a>
</p>

---

<br>

## Quickstart

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-orchestrator.git
cd copilot-swarm-orchestrator
npm install && npm run build
```

Run a two-step parallel demo in under 30 seconds:

```bash
npm start demo-fast
```

Or build an analytics dashboard with four agents across three waves:

```bash
npm start demo dashboard-showcase
```

**Prerequisites:** Node.js 18+, Git, and [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) installed and authenticated (`gh copilot`).

<br>

---

## Usage & Cost

> **Every agent step consumes its own premium request. A plan with 6 agents uses a minimum of 6 premium requests — one per agent.**

The orchestrator invokes `copilot -p` as a standalone subprocess for every step in your plan. There is no session reuse or batching — each agent is an independent Copilot CLI process. When agents run in parallel within a wave, each one simultaneously consumes a premium request. This means:

| Scenario | Steps | Min requests (happy path) | Max requests (all retries + repairs) |
|:---------|------:|:-------------------------:|:------------------------------------:|
| `demo-fast` | 2 | 2 | ~14 |
| `dashboard-showcase` | 4 | 4 | ~28 |
| `api-server` | 6 | 6 | ~42 |
| `saas-mvp` | 8 | 8 | ~56 |

**Where the multiplier comes from:**

- **Retries on failure:** up to 3 automatic retries per step (exponential backoff).
- **Repair Agent:** if verification fails, the Repair Agent spawns up to 3 additional Copilot sessions with accumulated context.
- **Fallback re-execution:** if all repair attempts fail, the step is re-executed from scratch.

In practice, most steps succeed on the first attempt, so actual usage clusters near the minimum. The adaptive concurrency system also backs off when it detects rate-limit (429) responses.

**To minimize usage:**

- Start with `demo-fast` (2 requests) to verify your setup.
- Use `--skip-verify` to avoid repair loops during experimentation (not recommended for production runs).
- Review your plan before execution with `--pm` — the PM Agent catches broken dependency graphs that would cause wasted retries.
- Monitor your [Copilot usage dashboard](https://github.com/settings/copilot) to track consumption.

<br>

---

## Demos

Six built-in scenarios let you see the orchestrator in action without writing a plan. Each creates a temp directory, runs real Copilot CLI sessions, and produces a working project with a clean git history.

| Scenario | Agents | Waves | What gets built | Time |
|:---------|:------:|:-----:|:----------------|-----:|
| `demo-fast` | 2 | 1 | Two independent utility modules (parallel proof) | ~30 sec |
| `dashboard-showcase` | 4 | 3 | React + Chart.js analytics dashboard, Express API, dark theme, 14 tests | ~6 min |
| `todo-app` | 4 | 3 | React todo app with Express backend and test suite | ~15 min |
| `api-server` | 6 | 4 | REST API with JWT auth, PostgreSQL/Prisma, Docker, CI/CD | ~25 min |
| `full-stack-app` | 7 | 5 | Full-stack todo with auth, Playwright E2E, Docker, CI/CD | ~30 min |
| `saas-mvp` | 8 | 5 | SaaS MVP with Stripe payments, analytics, security audit, deployment | ~40 min |

```bash
npm start demo list          # see all scenarios
npm start demo <name>        # run one
```

<details>
<summary><strong>Watch a live run (YouTube)</strong></summary>
<br>

<a href="https://youtu.be/5m-6yxnDjk4">youtu.be/5m-6yxnDjk4</a>

</details>

<details>
<summary><strong>Screenshots</strong></summary>
<br>

| Agents executing in parallel | Wave completion summary |
|:----------------------------:|:----------------------:|
| <img src="docs/media/existing-project-01.png" alt="Parallel execution in progress" width="520"> | <img src="docs/media/existing-project-02.png" alt="Wave completion with verification results" width="380"> |

</details>

<details>
<summary><strong>Pre-baked example run</strong></summary>
<br>

If you want to inspect real output without running Copilot, the `examples/completed-run/` directory contains a full `demo-fast` execution including plans, metrics, and raw `/share` transcripts.

</details>

<br>

### Output Quality

The `dashboard-showcase` demo produces ten source files (React 18, Vite 5, Express 4, Chart.js 4) that pass these checks out of the box:

- **Build**: `vite build` completes with zero warnings
- **Tests**: 14 passing (unit + API integration) using the Node.js built-in test runner
- **Accessibility**: semantic HTML (`<nav>`, `<main>`, `<header>`, `<section>`, `<article>`), 13 ARIA attributes, `:focus-visible` focus styles, `aria-live` for dynamic content
- **Responsive**: two CSS breakpoints (1024px sidebar collapse, 640px single column)
- **Error handling**: React ErrorBoundary, fetch error banner with retry, loading states
- **Documentation**: generated README with install, run, test instructions and architecture overview

Every agent commit is verified against its transcript before merging. No unverified code reaches main.

<br>

---

## How It Works

```
Goal ──▸ Plan ──▸ Waves ──▸ Branches ──▸ Agents ──▸ Verify ──▸ Merge
```

1. **Plan generation.** A goal becomes a set of numbered steps, each assigned to a specialized agent with declared dependencies. Plans can be generated interactively, imported from a Copilot transcript, loaded from a template, or bootstrapped from repo analysis.

2. **Wave scheduling.** The dependency graph is topologically sorted into waves. Steps within a wave have no mutual dependencies and run simultaneously. Adaptive concurrency adjusts limits based on success rates and rate-limit signals.

3. **Branch isolation.** Each step gets its own git branch (`swarm/<run-id>/step-N-agent`). Agents cannot interfere with each other's work.

4. **Copilot execution.** The orchestrator invokes `copilot -p` as a subprocess for each step, injecting the agent prompt plus dependency context from previously completed steps. Transcripts are captured via the `/share` export.

5. **Evidence-based verification.** The verifier engine parses each transcript looking for concrete evidence: git commit SHAs, test runner output (Jest, Mocha, pytest, Node.js test runner, Go, Cargo), build success markers, and file-change records. Claims made by the agent are cross-referenced against this evidence. Unverified claims generate warnings; missing required evidence fails the step.

6. **Self-repair.** Failed steps are retried up to three times by the Repair Agent. Each retry receives the original task, the verification failure details, a root-cause analysis, the prior transcript, and the git diff. Context accumulates across attempts.

7. **Merge.** Verified branches merge back to main in wave order to preserve a clean, linear-ish commit history.

<br>

---

## Features

### Parallel Execution Engine
The core scheduler runs independent steps concurrently with dependency-aware wave grouping. An adaptive concurrency manager starts at a configurable limit (default 3), raises it after five consecutive successes, and halves it on rate-limit responses. The wave resizer splits oversized waves and merges undersized ones dynamically.

### Eight Agent Profiles
Six step-executing agents (FrontendExpert, BackendMaster, TesterElite, SecurityAuditor, DevOpsPro, IntegratorFinalizer) plus a Repair Agent for self-healing and a PM Agent for pre-execution plan review. Each agent has a defined purpose, scope boundaries, done-definitions, and refusal rules. Custom agents are supported through `config/user-agents.yaml`.

### Transcript Verification
The share parser extracts structured data from Copilot `/share` transcripts: files changed, commands executed, test results, git commits, package operations, build and lint output, and MCP evidence sections. The verifier engine uses this to confirm each step actually did what it claimed.

### Quality Gates
Six automated checks run against generated projects: scaffold-default removal, duplicate code detection, hardcoded config detection, README claim verification, test isolation validation, and runtime checks (test execution, linting, security audit). Configurable via `config/quality-gates.yaml`. When a gate fails, the orchestrator can auto-inject follow-up steps to fix the issue.

### Plan Review (PM Agent)
Before execution begins, the PM Agent validates the plan for duplicate step numbers, circular dependencies, unknown agents, non-existent dependency references, and missing integration steps. Available via the `--pm` flag.

### Bootstrap from Existing Repos
The `bootstrap` command performs deep analysis of one or more repositories (languages, build scripts, dependencies, tech debt markers), fetches related GitHub issues, identifies cross-repo relationships, and generates an annotated execution plan with provenance links.

### Human-in-the-Loop Steering
During execution, operators can issue real-time commands: `pause`, `resume`, `approve`, `reject`. All steering actions are logged to an audit trail. A conflict approval queue handles cases where parallel agents produce overlapping changes. Read-only mode is supported for observation without intervention.

### Knowledge Base
A persistent JSON store captures execution patterns across runs. High-confidence patterns (dependency ordering, anti-patterns, best practices, failure modes) inform future planning. The knowledge base prunes stale entries and tracks occurrence frequency for confidence scoring.

### Web Dashboard
A browser-based viewer (default port 3002) lists past execution runs and shows step-by-step detail including agent assignments, verification results, and raw transcripts. Dark theme. No additional dependencies required.

### Plan Templates
Five starter plans for common project types (REST API, React app, CLI tool, full-stack app, library) with pre-configured agent assignments and dependency graphs. Run `npm start templates` to browse them.

<br>

---

## Commands

After building (`npm run build`), use `npm start` or the global `swarm` command:

| Command | Description |
|:--------|:------------|
| `npm start demo-fast` | Two-step parallel demo (~30 sec) |
| `npm start demo <scenario>` | Run a named demo scenario |
| `npm start demo list` | List all 6 demo scenarios |
| `npm start plan "goal"` | Generate an execution plan from a goal |
| `npm start swarm plan.json` | Execute a plan with parallel agents |
| `npm start swarm plan.json --pm` | Execute with PM Agent plan review first |
| `npm start quick "task"` | Single-agent quick task |
| `npm start bootstrap ./repo "goal"` | Analyze repo(s) and generate a plan |
| `npm start gates [path]` | Run quality gates on a project |
| `npm start web-dashboard [port]` | Start the web dashboard (default: 3002) |
| `npm start templates` | List available plan templates |
| `npm start status <id>` | Check execution status |

**Flags:**

| Flag | Effect |
|:-----|:-------|
| `--pm` | Enable PM Agent plan review before execution |
| `--model <name>` | Override the Copilot model |
| `--skip-verify` | Skip transcript verification (not recommended) |
| `--no-quality-gates` | Disable quality gate checks |
| `--confirm-deploy` | Allow deployment steps to execute (opt-in) |
| `--mcp` | Enable MCP integration |
| `--quality-gates-config <path>` | Custom quality gates config file |

<br>

---

## Installation

### From Source

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-orchestrator.git
cd copilot-swarm-orchestrator
npm install
npm run build
```

### One-Liner

```bash
curl -fsSL https://raw.githubusercontent.com/moonrunnerkc/copilot-swarm-orchestrator/main/install.sh | bash
```

### Global Install

```bash
npm link
swarm demo-fast    # now available as 'swarm' globally
```

### Requirements

- **Node.js 18+**
- **GitHub Copilot CLI** installed and authenticated (`gh copilot`)
- **Git** 2.20+ (for worktree support)

<br>

---

## Configuration

### Agent Profiles

Agent behavior is defined in YAML config files under `config/`:

| File | Purpose |
|:-----|:--------|
| `default-agents.yaml` | Six built-in step-executing agents |
| `repair-agent.yaml` | Repair Agent for failed-step retries |
| `pm-agent.yaml` | PM Agent for plan validation |
| `user-agents.yaml` | Your custom agents (template included) |

Each agent profile specifies purpose, scope, boundaries, done-definitions, output contracts, and refusal rules. Add custom agents by editing `user-agents.yaml`:

```yaml
agents:
  - name: MyAgent
    purpose: "What this agent does"
    scope:
      - "Area of responsibility"
    boundaries:
      - "What it should not touch"
    done_definition:
      - "Completion criteria"
```

### Quality Gates

Quality gate behavior is configured in `config/quality-gates.yaml`. You can enable/disable individual gates, set thresholds (minimum duplicate lines, max occurrences), and toggle auto-remediation:

```yaml
enabled: true
failOnIssues: true
autoAddRefactorStepOnDuplicateBlocks: true
autoAddReadmeTruthStepOnReadmeClaims: true

gates:
  duplicateBlocks:
    enabled: true
    minLines: 12
    maxOccurrences: 3
```

<br>

---

## Architecture

### Execution Flow

```
                     ┌─────────────────────┐
                     │     Goal / Plan      │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │   PM Agent Review    │  (optional --pm flag)
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │   Wave Scheduler     │  topological sort ──▸ parallel groups
                     └──────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
     │  Agent on      │  │  Agent on     │  │  Agent on     │
     │  branch step-1 │  │  branch step-2│  │  branch step-3│
     └────────┬──────┘  └──────┬───────┘  └──────┬───────┘
              │                 │                  │
     ┌────────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
     │   Verifier    │  │   Verifier    │  │   Verifier    │
     └────────┬──────┘  └──────┬───────┘  └──────┬───────┘
              │                 │                  │
              │     ┌───────────▼──────────┐      │
              └────▸│   Merge to main      │◂─────┘
                    └───────────┬──────────┘
                                │
                     ┌──────────▼───────────┐
                     │   Quality Gates      │  (6 automated checks)
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │   Meta Analyzer      │  health + pattern detection
                     └──────────────────────┘
```

### Key Modules

| Module | Lines | Responsibility |
|:-------|------:|:---------------|
| `swarm-orchestrator.ts` | 1,784 | Parallel execution engine, wave management, merge orchestration |
| `cli.ts` | 1,228 | Command parsing, demo runner, plan import, all user-facing entry points |
| `plan-generator.ts` | 732 | Plan creation, dependency validation, Copilot-assisted generation |
| `share-parser.ts` | 673 | Transcript parsing: files, commands, tests, commits, claims, MCP evidence |
| `demo-mode.ts` | 660 | Six demo scenarios with full agent prompts and expected outputs |
| `verifier-engine.ts` | 476 | Evidence checking against transcripts, verification report generation |
| `session-executor.ts` | 461 | Copilot CLI subprocess management, transcript capture |
| `step-runner.ts` | 432 | Single-step execution with branch setup, context injection, cleanup |
| `repo-analyzer.ts` | 354 | Codebase scanning for languages, deps, build scripts, tech debt |
| `config-loader.ts` | 350 | YAML agent profile loading with validation and merge |
| `quick-fix-mode.ts` | 319 | Single-agent quick task runner |
| `repair-agent.ts` | 327 | Self-repair loop with context accumulation (up to 3 retries) |
| `pm-agent.ts` | 303 | Plan validation: cycles, unknown agents, stale metadata |
| `meta-analyzer.ts` | 305 | Wave health scoring, pattern detection, replan decisions |
| `context-broker.ts` | 300 | Shared state, git locking, dependency context injection |
| `steering-router.ts` | 290 | Human-in-the-loop commands during execution |
| `knowledge-base.ts` | 253 | Persistent cross-run pattern storage and retrieval |
| `wave-resizer.ts` | 164 | Adaptive wave splitting, merging, and concurrency adjustment |

**Total: 65 source files, 15,634 lines of TypeScript.**

### Output Artifacts

Each execution produces an audit trail alongside your project code:

```
runs/<execution-id>/
  metrics.json                      # timing, commit count, verification stats
  knowledge-base.json               # patterns learned from this run
  wave-N-analysis.json              # per-wave health assessment
  steps/
    step-1/share.md                 # raw Copilot transcript
    step-2/share.md
  verification/
    step-1-verification.md          # evidence-based pass/fail report
    step-2-verification.md
```

For non-demo runs (inside your own repo), add to `.gitignore`:

```
plans/
runs/
proof/
.quickfix/
```

<br>

---

## Test Suite

397 tests across 34 test files covering the full system:

```bash
npm test
# 397 passing (7s)
# 1 pending
```

Tests validate plan generation, wave scheduling, transcript parsing, verification logic, conflict resolution, quality gates, agent configuration loading, metrics collection, knowledge-base persistence, steering commands, and every demo scenario definition.

<br>

---

## Project History

This project started as a submission for the **GitHub Copilot CLI Challenge** in early 2026. What began as a basic parallel runner has grown into a comprehensive orchestration system with self-repair, adaptive scheduling, quality gates, and persistent learning across runs. Development is ongoing with regular updates and new capabilities being added.

<br>

---

## Roadmap

Active development areas:

- Visual dashboard improvements for real-time execution monitoring
- Additional plan templates for more project types
- Enhanced MCP integration for tighter GitHub workflow coupling
- Performance profiling and execution time optimization
- Plugin system for custom verification checks and quality gates

<br>

---

## Contributing

Contributions are welcome. The codebase is TypeScript with strict mode enabled, targeting ES2020.

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm test             # run all 397 tests
```

Before submitting a PR:
1. Run `npm test` and confirm all tests pass
2. Run `npm start gates .` to check quality gates against your changes
3. Keep commit messages descriptive and incremental

<br>

---

## License

[ISC](LICENSE)

Built by [Bradley R. Kinnard](https://github.com/moonrunnerkc).

<p align="center">
  <img src="docs/media/wasp.svg" alt="" width="32" height="32">
</p>
