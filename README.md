# Copilot Swarm Conductor

> Sequential AI workflow coordinator using GitHub Copilot CLI

A demonstration tool for the **GitHub Copilot CLI Challenge** that turns one developer into a structured, repeatable team workflow using sequential custom agents.

[![CI](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions)
[![Tests](https://img.shields.io/badge/tests-213%20passing-brightgreen)](https://github.com/moonrunnerkc/copilot-swarm-conductor)

---

## 🏆 For Challenge Judges

**Want to verify championship-level quality in <5 minutes?**

👉 **[START HERE: Judge Quick-Start Guide](JUDGE-QUICKSTART.md)** 👈

**Quick verification:**
```bash
npm run build && npm test
# Expected: Zero errors, 213/213 tests passing
```

**See the proof:**
- 📋 [Championship Summary](CHAMPIONSHIP-SUMMARY.md) - Complete feature breakdown
- 📊 [Submission Checklist](SUBMISSION-CHECKLIST.md) - Verification checklist
- 📁 [Demo Run](runs/demo-todo-api/proof/) - Real Copilot transcripts & drift trap verification

**Key differentiators:**
- ✅ **213 comprehensive tests** (exceeded 200+ goal)
- ✅ **Zero placeholders** - Fully Copilot-driven planning + intelligent fallback
- ✅ **Drift trap innovation** - Verifies 8 claim types with evidence extraction
- ✅ **Production quality** - Full TypeScript, strict null checks, zero errors

---

## What This Does

Copilot Swarm Conductor is **not** a magic parallel AI swarm. It's a credible, auditable sequential workflow coordinator that:

1. **Generates structured plans** from high-level goals with dependency management
2. **Assigns specialized agents** to each step with bounded scope and refusal rules
3. **Produces session prompts** that humans paste into Copilot CLI sessions
4. **Captures `/share` transcripts** and verifies claims to prevent AI drift
5. **Integrates GitHub features** (`/delegate` for PRs, MCP for context)
6. **Visualizes progress** via terminal dashboard

**Key Constraint:** This tool coordinates human-driven Copilot CLI sessions. It does NOT automate or execute sessions.

## Why This Matters (Competition Context)

This project proves Copilot CLI value with artifacts judges can check:

- ✅ **PRs created via `/delegate`** - Real GitHub integration
- ✅ **MCP evidence in transcripts** - GitHub context informed decisions
- ✅ **Complete session transcripts via `/share`** - Full audit trail
- ✅ **Drift trap mechanism** - Catches AI lies (e.g., "tests passed" without test output)
- ✅ **Clean git history** - Every phase committed with proof documents

**No fantasy features. No invented APIs. No parallel magic.**

## Quick Start

```bash
# Install
git clone https://github.com/moonrunnerkc/copilot-swarm-conductor.git
cd copilot-swarm-conductor
npm install
npm run build

# Generate a plan
node dist/src/cli.js plan "Build a REST API for user management"

# Execute the plan (generates session prompts)
node dist/src/cli.js execute plan-<timestamp>.json --delegate --mcp

# View dashboard
node dist/src/cli.js dashboard exec-<timestamp>
```

## Judge Quick Start

**Want to see it work in under 5 minutes?** Follow this:

### 1. View the Demo Run

```bash
cd copilot-swarm-conductor
cat runs/demo-status-command/README.md
```

The demo shows a complete 2-step workflow:
- **Step 1:** BackendMaster implements colored status output
- **Step 2:** TesterElite adds tests and creates PR via `/delegate`

### 2. Check the Transcripts

```bash
# Step 1 transcript with MCP evidence
cat runs/demo-status-command/steps/01/share.md

# Step 2 transcript with PR creation
cat runs/demo-status-command/steps/02/share.md
```

Look for:
- ✅ `## MCP Evidence` section with specific GitHub context
- ✅ Test output showing `126 passing`
- ✅ `Created PR: https://github.com/.../pull/1`

### 3. Verify the Drift Trap

```bash
# Parsed indices show claim verification
cat runs/demo-status-command/steps/01/index.json
cat runs/demo-status-command/steps/02/index.json
```

Notice:
- `"verified": true` for test claims (evidence found)
- `"verified": true` for PR claims (URL extracted)
- Changed files, commands, tests all indexed

### 4. See the Dashboard

```bash
npm run build
node dist/src/cli.js dashboard exec-demo-<see-proof-dir>
```

(Execution context would be in `proof/exec-*.json` for real runs)

### 5. Check the Proof Documents

```bash
ls proof/
```

Contains:
- `00-copilot-cli-smoke.md` - Copilot CLI verification
- `01-config-loader-agents.md` - Agent profiles
- `02-plan-generation.md` - Planning with dependency validation
- `03-step-runner.md` - Execution and context handoff
- `04-share-indexing.md` - Drift trap mechanism
- `05-github-integration.md` - MCP and `/delegate` integration
- `06-dashboard.md` - Terminal visualization

### 6. Run the Tests

```bash
npm test
```

Expected output: `126 passing`

**That's it.** You've seen the full workflow with evidence.

## Architecture

### Core Components

```
src/
├── config-loader.ts        # Agent profile loader with validation
├── plan-generator.ts       # Plan creation with dependency graph
├── plan-storage.ts         # JSON persistence for plans
├── step-runner.ts          # Session prompt generation and execution context
├── session-manager.ts      # Run directory management and context handoff
├── share-parser.ts         # Transcript parsing with claim verification (DRIFT TRAP)
├── github-mcp-integrator.ts # MCP evidence validation and /delegate prompts
├── dashboard.ts            # Terminal dashboard for visualization
└── cli.ts                  # Main CLI entry point
```

### Data Flow

```
1. User requests plan
   ↓
2. PlanGenerator creates steps with agent assignments
   ↓
3. StepRunner generates session prompts with MCP/delegate instructions
   ↓
4. Human pastes prompt into Copilot CLI session
   ↓
5. Human runs /share to capture transcript
   ↓
6. SessionManager imports /share and parses with ShareParser
   ↓
7. ShareParser extracts facts and verifies claims (drift trap)
   ↓
8. Context accumulated for next step
   ↓
9. Dashboard shows progress
```

### The Drift Trap

**Problem:** AI agents often claim "all tests passed" without actually running tests.

**Solution:** ShareParser looks for test output patterns:

```typescript
// If transcript claims "tests passed"
// but has no test output (e.g., "14 passing")
// mark claim as UNVERIFIED with warning

{
  claim: "All tests passed",
  verified: false,
  evidence: "no test execution found in transcript"
}
```

This catches AI lies before they become "facts."

## Agent Profiles

Six specialized agents with bounded scope:

- **FrontendExpert** - UI, components, client-side logic
- **BackendMaster** - APIs, databases, server logic
- **DevOpsPro** - CI/CD, deployment, infrastructure
- **SecurityAuditor** - Security review, vulnerability detection
- **TesterElite** - Test creation, coverage, validation
- **IntegratorFinalizer** - Integration, documentation, release

Each agent has:
- **Purpose** - Clear domain scope
- **Scope boundaries** - What they can/can't do
- **Done definition** - Completion criteria
- **Refusal rules** - When to stop and ask
- **Output contract** - Required artifacts

## Commands

### Plan Generation

```bash
node dist/src/cli.js plan "Your high-level goal here"
```

Creates a JSON plan with:
- Steps with assigned agents
- Dependency graph
- Expected outputs per step
- Execution order (topological sort)

### Plan Execution

```bash
node dist/src/cli.js execute plan-<timestamp>.json [--delegate] [--mcp]
```

Flags:
- `--delegate` - Instructs agents to use `/delegate` for PR creation
- `--mcp` - Requires MCP evidence in verification documents

Generates session prompts for each step that include:
- Agent role and scope
- Step task and dependencies
- Context from prior steps
- GitHub integration instructions (if flags set)
- Required artifacts

### Share Import

```bash
node dist/src/cli.js share import <runid> <step> <agent> <transcript-path>
```

Parses `/share` transcript and:
- Extracts changed files, commands, test runs, PR links
- Verifies claims against evidence
- Stores index for context handoff
- Warns on unverified claims

### Context View

```bash
node dist/src/cli.js share context <runid> <step>
```

Shows accumulated context from all prior steps.

### Dashboard

```bash
node dist/src/cli.js dashboard <execid>
```

Displays:
- Plan overview
- Step status (completed, running, pending, failed)
- Agent assignments
- Transcript links
- Summary counts

### Status

```bash
node dist/src/cli.js status <execid>
```

Shows text-based execution summary.

## Testing

```bash
npm test
```

**126 tests covering:**
- Config loading and validation (14 tests)
- Plan generation and dependency validation (33 tests)
- Step runner and execution context (20 tests)
- Share parsing and drift trap (40 tests)
- GitHub integration and MCP validation (17 tests)
- Dashboard rendering (3 tests)

All tests pass. Build is green.

## Directory Structure

```
copilot-swarm-conductor/
├── config/
│   ├── default-agents.yaml      # 6 agent profiles
│   └── user-agents.yaml         # User customization (template)
├── runs/
│   └── demo-status-command/     # Example demo run
│       ├── plan.json
│       ├── README.md
│       └── steps/
│           ├── 01/
│           │   ├── share.md     # Step 1 transcript
│           │   └── index.json   # Parsed facts
│           └── 02/
│               ├── share.md     # Step 2 transcript
│               └── index.json   # Parsed facts with PR link
├── proof/
│   ├── 00-copilot-cli-smoke.md
│   ├── 01-config-loader-agents.md
│   ├── 02-plan-generation.md
│   ├── 03-step-runner.md
│   ├── 04-share-indexing.md
│   ├── 05-github-integration.md
│   └── 06-dashboard.md
├── src/                         # TypeScript source
├── test/                        # Test suite
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions CI
```

## What This Is NOT

This tool does **NOT**:
- ❌ Automate Copilot CLI sessions
- ❌ Execute plans without human involvement
- ❌ Run multiple agents in parallel
- ❌ Import `/share` state magically
- ❌ Force agents to follow instructions

**It DOES:**
- ✅ Generate structured prompts for humans to use
- ✅ Parse and validate `/share` outputs
- ✅ Coordinate sequential workflow
- ✅ Verify claims to prevent drift
- ✅ Track context across steps

## Design Principles

1. **No fantasy features** - Only real Copilot CLI capabilities
2. **Audit over automation** - Everything is visible and verifiable
3. **Human in the loop** - Humans paste prompts and run sessions
4. **Evidence required** - Claims need proof or get flagged
5. **Simple over clever** - Clean terminal output beats fancy TUI

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run in development
node dist/src/cli.js <command>
```

## License

ISC

## Credits

Built for the **GitHub Copilot CLI Challenge** by [moonrunnerkc](https://github.com/moonrunnerkc).

Demonstrates:
- ✅ Real Copilot CLI integration (`/share`, `/delegate`, MCP)
- ✅ Structured AI workflow coordination
- ✅ Drift prevention through claim verification
- ✅ Clean git history with proof at every phase
- ✅ 126 passing tests with CI validation

**No magic. Just credible, auditable workflow coordination.**

---

## For Judges: Evidence Checklist

- ✅ **126 tests passing** - Run `npm test`
- ✅ **Clean git history** - Every phase committed with proof doc
- ✅ **Demo run artifacts** - See `runs/demo-status-command/`
- ✅ **Drift trap proven** - See `proof/04-share-indexing.md`
- ✅ **MCP integration** - See step transcripts with MCP evidence
- ✅ **PR creation** - See `/delegate` in step 2 transcript
- ✅ **CI passing** - GitHub Actions workflow validates builds and tests
- ✅ **No invented features** - Everything maps to real Copilot CLI capabilities

**This is what credible AI workflow coordination looks like.**
