# Copilot Swarm Orchestrator

Parallel execution of GitHub Copilot CLI sessions with dependency-aware scheduling, verification, and per-agent git branches.

[![CI](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)](https://www.typescriptlang.org/)

---

## Why This Exists

Running multiple Copilot CLI sessions for a project (backend, frontend, tests, integration) creates coordination overhead. This tool organizes that work into dependency-aware steps, runs independent steps in parallel, and verifies results from transcript evidence.

---

## What It Does

- Takes a goal (for example: "Build a todo app with React frontend and Express backend")
- Generates an execution plan with steps assigned to specialized agents
- Executes steps in parallel waves based on a dependency graph
- Runs each step as a `copilot -p` session on an isolated git branch
- Verifies each step by parsing the transcript for evidence (tests passed, files created, commits made)
- Auto-merges verified branches back to main

When you run this tool inside a repo, it writes a small set of **execution artifacts** into that repo
(`runs/`, `plans/`, `proof/`, etc.) so you have an auditable record of what happened.

**What it does not do**

> - Does not embed or simulate Copilot
> - Does not invent Copilot CLI flags or features
> - Does not guarantee the model completes tasks correctly

All execution uses real `copilot -p` with documented flags.

---

## Quick Start

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-conductor.git
cd copilot-swarm-conductor
npm install
npm run build
npm test          # 305 passing
npm start demo todo-app
```

**Requirements**: Node.js 18+, GitHub Copilot CLI installed and authenticated.

---

## Commands

| Command | What it does |
|---|---|
| `npm start bootstrap <path(s)> "Goal"` | Analyze repo(s), optionally ingest open issues via `gh`, and generate a plan |
| `npm start demo todo-app` | Run 4-step demo with parallel execution |
| `npm start demo list` | List available demo scenarios |
| `npm start plan "goal"` | Generate execution plan for a goal |
| `npm start swarm plan.json` | Execute plan in parallel swarm mode |
| `npm start quick "task"` | Quick single-agent task (no plan needed) |
| `npm start -- --help` | Show all options |

---

## Demo Scenarios

| Scenario | Steps | Duration | Description |
|---|---:|---:|---|
| `todo-app` | 4 | 5-8 min | React + Express todo app |
| `api-server` | 6 | 10-15 min | REST API with auth and DB |
| `full-stack-app` | 7 | 15-20 min | Full-stack with deployment |
| `saas-mvp` | 8 | 20-30 min | SaaS with Stripe, analytics |

---

## How It Works

### Architecture (text diagram)

```
cli.ts
  -> plan-generator.ts
  -> swarm-orchestrator.ts
      -> session-executor.ts
      -> verifier-engine.ts
          -> share-parser.ts
```

### Execution Flow

1. **Plan generation**: `PlanGenerator.createPlan()` assigns agents to tasks with dependencies
2. **Wave scheduling**: `SwarmOrchestrator.identifyExecutionWaves()` groups independent steps
3. **Branch creation**: each step runs on `swarm/<execid>/step-<n>-<agent>` branch
4. **Session execution**: `SessionExecutor.executeSession()` invokes `copilot -p` with prompt
5. **Verification**: `VerifierEngine.verifyStep()` checks transcript for evidence
6. **Merge**: verified branches merge to main via git

---

## What You Should Expect In Your Repo

This tool is an orchestrator with verification. That means it produces two kinds of output:

1. **Your actual project changes** (the thing you wanted)
   - Normal repo files: `src/`, `server.js`, `package.json`, tests, etc.
   - These land on per-step branches during execution and are merged back to your current branch when verified.

2. **Swarm execution artifacts** (the audit trail)
   - These are not “your app”. They are evidence and coordination state.
   - By default they are created in the repo you ran `swarm` from.

### Artifact folders

- `plans/`
  - Saved execution plans (`plan-*.json`, `bootstrap-*`).
- `runs/<run-id>/`
  - One folder per run.
  - `steps/step-N/share.md` is the Copilot `/share` transcript captured via `copilot -p --share ...`.
  - `steps/step-N/verification.md` is the verifier output (what was checked and what evidence was found).
  - `.locks/` and `.context/` are coordination state for parallel execution.
- `proof/`
  - Primarily used by sequential mode (`swarm execute`) to store “save your /share transcript here” paths.
- `.quickfix/`
  - Quick-fix transcripts and logs.

### Practical workflow

- To see what an agent actually did:
  - Open `runs/<run-id>/steps/step-1/share.md` and look for commands, diffs, and test output.
- To see what was verified:
  - Open `runs/<run-id>/steps/step-1/verification.md`.
- To see the final code:
  - Check your current branch after merges, or review git history (`git log`, `git show --name-only`).

### Keeping git history clean (recommended)

Most users keep these artifacts locally but do not commit them.
Add this to your repo’s `.gitignore` before running swarm:

```gitignore
plans/
runs/
proof/
.quickfix/
.context/
.locks/
```

If you want a completely clean repo during experimentation, run swarm in a disposable repo or scratch workspace.

---

## Custom Agents

Seven agents are defined in `.github/agents/`:

| Agent | Purpose | File |
|---|---|---|
| `backend_master` | Server-side logic, APIs | `backend-master.agent.md` |
| `frontend_expert` | UI components, React | `frontend-expert.agent.md` |
| `tester_elite` | Test suites, coverage | `tester-elite.agent.md` |
| `security_auditor` | Security hardening | `security-auditor.agent.md` |
| `devops_pro` | CI/CD, deployment | `devops-pro.agent.md` |
| `integrator_finalizer` | Final integration | `integrator-finalizer.agent.md` |
| `meta_reviewer` | Post-execution analysis | `meta-reviewer.agent.md` |

---

## Verification

Use these commands and outputs to verify the claims in this README.

### Test Suite

```bash
npm test
# Output: 303 passing (7s)
```

### CLI Help

```bash
npm start -- --help
# Shows all commands and flags
```

### Demo Execution

```bash
npm start demo todo-app
# Runs 4 steps in 3 waves with live output
```

### Parallelism Proof (Console)

To validate that steps in a wave run concurrently, use the live console logs:

- `swarm-orchestrator.ts` prints the wave header (for example: `Wave 1: 2 step(s) in parallel`).
- `session-executor.ts` supports a per-step `logPrefix`, which is used to prefix live output lines from each Copilot subprocess.
- When a wave contains multiple independent steps, you can see interleaved output lines from different prefixes.

Proof anchors in code:

- `src/swarm-orchestrator.ts:identifyExecutionWaves()`
- `src/session-executor.ts` (`SessionOptions.logPrefix`)

### Source Structure

```bash
ls src/*.ts | wc -l    # 41 source files
ls test/*.test.ts | wc -l  # 27 test files
```

---

## Constraints And Guarantees

- Requires GitHub Copilot CLI to be installed and authenticated
- Executes `copilot -p` as a subprocess; does not embed or simulate Copilot
- Uses only documented Copilot CLI flags (`-p`, `--model`, `--share`, etc.)
- Does not guarantee Copilot will complete tasks correctly; it orchestrates and verifies
- Verification is evidence-based (transcript parsing), not semantic understanding

What “adaptive” means here (today):

- The swarm execution uses a concurrency-limited queue and retries tasks that fail with rate-limit-like errors (see `src/execution-queue.ts`).
- After each wave, the orchestrator writes a wave analysis JSON file and can update `knowledge-base.json` (see `src/meta-analyzer.ts`, `src/knowledge-base.ts`, and `src/swarm-orchestrator.ts`).
- If a wave is unhealthy, the orchestrator can log a suggested replan decision.

What it does not do (today):

- It does not automatically re-run steps based on replan decisions. The replan block logs suggested retries but does not execute them (`src/swarm-orchestrator.ts`).

---

## File Structure

Key modules and their current line counts:

| File | Purpose | Lines |
|---|---|---:|
| `src/cli.ts` | CLI entry point | 925 |
| `src/swarm-orchestrator.ts` | parallel execution engine | 878 |
| `src/plan-generator.ts` | plan creation and validation | 655 |
| `src/session-executor.ts` | Copilot CLI invocation | 411 |
| `src/verifier-engine.ts` | transcript verification | 464 |
| `src/share-parser.ts` | `/share` output parsing | 629 |
| `src/config-loader.ts` | agent YAML loading | 300 |

Compact view:

```
src/
  cli.ts
  swarm-orchestrator.ts
  plan-generator.ts
  session-executor.ts
  verifier-engine.ts
  share-parser.ts
  config-loader.ts
  ... (34 more modules)

test/
  27 test files, 303 tests

config/
  default-agents.yaml

.github/agents/
  7 custom agent markdown files
```

---

## Proof Map

| Claim | Evidence |
|---|---|
| 303 tests passing | `npm test` output |
| 41 source files | `ls src/*.ts \| wc -l` |
| 27 test files | `ls test/*.test.ts \| wc -l` |
| 7 custom agents | `ls .github/agents/*.agent.md` |
| 4 demo scenarios | `npm start demo list` |
| Parallel wave execution | `src/swarm-orchestrator.ts:identifyExecutionWaves()` |
| Per-agent branches | `src/swarm-orchestrator.ts:createAgentBranch()` |
| Transcript verification | `src/verifier-engine.ts:verifyStep()` |
| Copilot CLI invocation | `src/session-executor.ts:executeSession()` |
| Dependency graph | `src/swarm-orchestrator.ts:buildDependencyGraph()` |
| Bootstrap repo analysis | `src/bootstrap-orchestrator.ts:bootstrap()` |
| GitHub issue ingestion (if `gh` installed) | `src/github-issues-ingester.ts:fetchIssues()` |

---

## License

ISC
