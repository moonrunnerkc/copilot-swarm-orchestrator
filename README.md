# Copilot Swarm Orchestrator

Parallel execution of GitHub Copilot CLI sessions with dependency-aware scheduling, verification, and per-agent git branches.

---

## What This Does

This CLI tool:

1. Takes a goal (e.g., "Build a todo app with React frontend and Express backend")
2. Generates an execution plan with steps assigned to specialized agents
3. Executes steps in parallel waves based on dependency graph
4. Runs each step as a `copilot -p` session on an isolated git branch
5. Verifies each step by parsing the transcript for evidence (tests passed, files created, commits made)
6. Auto-merges verified branches back to main

**It does not** invent Copilot CLI features. All execution uses real `copilot -p` with documented flags.

---

## Quick Start

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-conductor.git
cd copilot-swarm-conductor
npm install
npm run build
npm test          # 303 tests passing
npm start demo todo-app
```

**Requirements**: Node.js 18+, GitHub Copilot CLI installed and authenticated.

---

## Commands

```
npm start demo todo-app           Run 4-step demo with parallel execution
npm start demo list               List available demo scenarios
npm start plan "goal"             Generate execution plan for a goal
npm start swarm plan.json         Execute plan in parallel swarm mode
npm start quick "task"            Quick single-agent task (no plan needed)
npm start --help                  Show all options
```

### Demo Scenarios

| Scenario | Steps | Duration | Description |
|----------|-------|----------|-------------|
| `todo-app` | 4 | 5-8 min | React + Express todo app |
| `api-server` | 6 | 10-15 min | REST API with auth and DB |
| `full-stack-app` | 7 | 15-20 min | Full-stack with deployment |
| `saas-mvp` | 8 | 20-30 min | SaaS with Stripe, analytics |

---

## How It Works

### Architecture

```
cli.ts                  Entry point, command parsing
  |
  v
plan-generator.ts       Creates execution plan with steps and dependencies
  |
  v
swarm-orchestrator.ts   Schedules steps into waves, manages parallel execution
  |
  v
session-executor.ts     Runs `copilot -p <prompt>` per step on agent branch
  |
  v
verifier-engine.ts      Parses transcript, validates tests/commits/claims
  |
  v
share-parser.ts         Extracts structured data from Copilot /share output
```

### Execution Flow

1. **Plan Generation**: `PlanGenerator.createPlan()` assigns agents to tasks with dependencies
2. **Wave Calculation**: `SwarmOrchestrator.identifyExecutionWaves()` groups independent steps
3. **Branch Creation**: Each step runs on `swarm/<execid>/step-<n>-<agent>` branch
4. **Session Execution**: `SessionExecutor.executeSession()` invokes `copilot -p` with prompt
5. **Verification**: `VerifierEngine.verifyStep()` checks transcript for evidence
6. **Merge**: Verified branches merge to main via git

### Custom Agents

Seven agents defined in `.github/agents/`:

| Agent | Purpose | File |
|-------|---------|------|
| `backend_master` | Server-side logic, APIs | `backend-master.agent.md` |
| `frontend_expert` | UI components, React | `frontend-expert.agent.md` |
| `tester_elite` | Test suites, coverage | `tester-elite.agent.md` |
| `security_auditor` | Security hardening | `security-auditor.agent.md` |
| `devops_pro` | CI/CD, deployment | `devops-pro.agent.md` |
| `integrator_finalizer` | Final integration | `integrator-finalizer.agent.md` |
| `meta_reviewer` | Post-execution analysis | `meta-reviewer.agent.md` |

---

## Verification

To verify claims in this README:

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

### Source Structure

```bash
ls src/*.ts | wc -l    # 41 source files
ls test/*.test.ts | wc -l  # 27 test files
```

---

## Constraints

This tool:

- Requires GitHub Copilot CLI to be installed and authenticated
- Executes `copilot -p` as a subprocess; does not embed or simulate Copilot
- Uses only documented Copilot CLI flags (`-p`, `--model`, `--share`, etc.)
- Does not guarantee Copilot will complete tasks correctly; it orchestrates and verifies
- Verification is evidence-based (transcript parsing), not semantic understanding

---

## File Structure

```
src/
  cli.ts                 CLI entry point (925 lines)
  swarm-orchestrator.ts  Parallel execution engine (878 lines)
  plan-generator.ts      Plan creation and validation (655 lines)
  session-executor.ts    Copilot CLI invocation (411 lines)
  verifier-engine.ts     Transcript verification (464 lines)
  share-parser.ts        /share output parsing (629 lines)
  config-loader.ts       Agent YAML loading (300 lines)
  ... (34 more modules)

test/
  27 test files, 303 tests

config/
  default-agents.yaml    Agent definitions

.github/agents/
  7 custom agent markdown files
```

---

## License

ISC

---

## Proof Map

| Claim | Evidence |
|-------|----------|
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
