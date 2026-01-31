# Copilot Swarm Orchestrator

Parallel execution of GitHub Copilot CLI sessions with dependency-aware scheduling, verification, and per-agent git branches.

---

## Quick Start

```bash
git clone https://github.com/moonrunnerkc/copilot-swarm-orchestrator.git
cd copilot-swarm-orchestrator
npm install
npm run build
npm start demo-fast
```

That's it. You'll see two agents work in parallel, verify their output, and merge to main.

**Requirements:** Node.js 18+, GitHub Copilot CLI installed and authenticated (`gh copilot`).

---

## What It Does

1. Takes a goal ("Build a todo app with React and Express")
2. Generates an execution plan with steps assigned to specialized agents
3. Runs independent steps in parallel on isolated git branches
4. Verifies each step by parsing the transcript for evidence
5. Merges verified branches back to main
6. Installs dependencies so demos are runnable immediately

**What it doesn't do:**
- Doesn't embed or simulate Copilot
- Doesn't guarantee Copilot completes tasks correctly
- Doesn't auto-fix broken code (only retries failed steps)

---

## Commands

```bash
# Demos (easiest way to see it work)
npm start demo demo-fast          # 2 steps, ~3 min
npm start demo dashboard-showcase # 4 steps, ~5 min, visual dashboard
npm start demo todo-app           # 4 steps, ~15 min, full app
npm start demo list               # Show all demos

# Real usage
npm start plan "Build a REST API"           # Generate plan
npm start swarm plan-xxx.json               # Execute plan
npm start quick "Add login route"           # Quick single task
npm start bootstrap ./myrepo "Add auth"     # Analyze repo, generate plan
```

If you link globally (`npm link`), replace `npm start` with `swarm`:
```bash
swarm demo-fast
swarm plan "Build an API"
```

---

## Demo Scenarios

| Scenario | Steps | Duration | What it builds |
|----------|------:|:--------:|----------------|
| `demo-fast` | 2 | ~3 min | Two utility modules (proves parallel execution) |
| `dashboard-showcase` | 4 | ~5 min | Analytics dashboard with Chart.js, dark theme |
| `todo-app` | 4 | ~15 min | React + Express todo app with tests |
| `api-server` | 6 | ~25 min | REST API with auth and database |
| `full-stack-app` | 7 | ~30 min | Full-stack with deployment |
| `saas-mvp` | 8 | ~40 min | SaaS with Stripe, analytics, deployment |

After a demo completes, dependencies are auto-installed and you get run instructions:

```
📦 Installing dependencies for demo output...

  📂 ./
     ✅ Dependencies installed
  📂 frontend/
     ✅ Dependencies installed

🚀 To run the demo:

   cd /tmp/swarm-demo-todo-app-xyz123
   npm start
   cd frontend && npm run dev
```

---

## How It Works

```
Goal → Plan Generator → Execution Waves → Agent Branches → Verify → Merge
```

1. **Plan generation:** Assigns agents to tasks with dependencies
2. **Wave scheduling:** Groups independent steps to run in parallel
3. **Branch creation:** Each step runs on `swarm/<id>/step-N-agent` branch
4. **Execution:** Runs `copilot -p` with agent prompt, captures transcript
5. **Verification:** Parses transcript for evidence (tests passed, files created)
6. **Merge:** Verified branches merge to main

### Agents

Six step-executing agents in `config/default-agents.yaml`:

| Agent | Purpose |
|-------|---------|
| `backend_master` | Server-side logic, APIs |
| `frontend_expert` | UI components, React |
| `tester_elite` | Test suites, coverage |
| `security_auditor` | Security hardening |
| `devops_pro` | CI/CD, deployment |
| `integrator_finalizer` | Final integration |

There's also a **meta-reviewer** (in `.github/agents/`) that runs internally after each wave to analyze results and trigger retries. It doesn't execute steps—it's the orchestrator's quality analyzer.

---

## Output Artifacts

When you run swarm, it creates:

- **Your project files** (src/, server.js, tests) — merged to your branch
- **Execution artifacts** (plans/, runs/) — audit trail

### Artifact folders

- `plans/` — Saved execution plans
- `runs/<run-id>/steps/step-N/share.md` — Copilot transcript
- `runs/<run-id>/steps/step-N/verification.md` — What was verified

### Keep git clean

Add to `.gitignore`:
```
plans/
runs/
proof/
.quickfix/
```

Or run demos in `/tmp` (they create temp folders automatically).

---

## Verification

Everything claimed here can be verified:

```bash
# Test suite
npm test
# → 317 passing, 1 pending (7s)

# Source files
find src -name "*.ts" | wc -l
# → 55

# Test files
ls test/*.test.ts | wc -l
# → 29

# Agents
grep "name:" config/default-agents.yaml | wc -l
# → 6 agents defined

# Demo list
npm start demo list
# → 6 scenarios
```

### Key source files

| File | Lines | Purpose |
|------|------:|---------|
| `src/cli.ts` | 1137 | CLI entry point |
| `src/swarm-orchestrator.ts` | 1620 | Parallel execution engine |
| `src/plan-generator.ts` | 732 | Plan creation |
| `src/session-executor.ts` | 430 | Copilot CLI invocation |
| `src/verifier-engine.ts` | 476 | Transcript verification |
| `src/demo-mode.ts` | 596 | Demo scenarios |

---

## Constraints

- **Requires** GitHub Copilot CLI (`gh copilot`) installed and authenticated
- **Executes** `copilot -p` as subprocess with documented flags only
- **No guarantees** that Copilot completes tasks correctly
- **Retries** failed steps (up to 3x) but doesn't auto-fix code
- **Deployment** (`--confirm-deploy`) is opt-in only

---

## Recent Changes

**Jan 31, 2026:**
- Added `dashboard-showcase` demo (visual analytics dashboard)
- Fixed: Demos now auto-install dependencies after completion
- Fixed: Run instructions printed at end of each demo
- Cleaned up stale test artifacts

---

## License

ISC
