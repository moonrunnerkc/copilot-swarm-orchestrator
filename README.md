<div align="center">

# 🐝 Copilot Swarm Orchestrator

**Parallel AI workflow orchestration using GitHub Copilot CLI custom agents**

[![Build Status](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/copilot-swarm-conductor/actions)
[![Tests](https://img.shields.io/badge/tests-280%20passing-brightgreen)](https://github.com/moonrunnerkc/copilot-swarm-conductor)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

*Built for the GitHub Copilot CLI Challenge*

[Quick Start](#quick-start) • [Commands](#commands) • [Custom Agents](#custom-agents) • [How It Works](#how-it-works)

</div>

---

## Overview

Copilot Swarm Orchestrator coordinates multiple concurrent Copilot CLI sessions with dependency-aware execution, adaptive intelligence, and human-like git commit history. A paradigm-shifting approach to AI-powered development workflows.

### What Makes This Paradigm-Shifting?

**Beyond Simple Parallelism**: Traditional tools run tasks concurrently. This orchestrator adds:
- 🧠 **Adaptive Intelligence**: Learns from execution patterns, auto-detects failures, suggests replans
- 📊 **Meta-Analysis**: Post-wave quality review by dedicated meta-reviewer agent
- 🔄 **Self-Healing**: Automatic retry with exponential backoff, dynamic concurrency adjustment
- 📚 **Knowledge Base**: Persistent learning across executions (≥2 occurrences influence future plans)
- 🎯 **Human-Like History**: Real-time commit quality scoring, anti-pattern detection
- 🚀 **Full Lifecycle**: From bootstrap analysis to deployed preview URLs
- ⚡ **Broad Appeal**: Quick-fix mode for simple tasks, graceful degradation for resilience

### Key Features

| Feature | Description |
|---------|-------------|
| **Parallel Execution** | Independent steps run concurrently via `copilot -p` sessions |
| **Wave-Based Scheduling** | Steps execute in waves based on dependency graph |
| **Scalable Queue System** | Async execution queue with rate-limit detection and retry logic |
| **Dynamic Wave Resizing** | Automatically splits large waves when rate limits detected |
| **Adaptive Concurrency** | Adjusts parallelism based on observed API behavior |
| **Meta-Analysis & Learning** | Post-wave quality review with pattern detection and replanning |
| **Knowledge Base** | Learns from execution patterns to improve future runs |
| **Intelligent Replanning** | Auto-detects failures and suggests plan adjustments |
| **Bootstrap Mode** | Analyzes existing repos and GitHub Issues to generate context-aware plans |
| **GitHub Issues Integration** | Links relevant issues to tasks and closes them on completion |
| **Preview Deployments** | DevOpsPro agent deploys previews with accessible URLs (Vercel, Netlify) |
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
swarm bootstrap <path(s)> "goal"    Analyze repos/issues and generate context-aware plan
swarm plan <goal>                   Generate execution plan
swarm swarm <planfile>              Execute plan in parallel  
swarm quick "task"                  Quick-fix mode for simple single-agent tasks
swarm execute <planfile>            Execute plan sequentially
swarm demo <scenario>               Run pre-configured demo
swarm demo list                     List available demos
swarm status <execid>               Show execution status
swarm --help                        Show all options
```

### Quick-Fix Mode 

Bypass full swarm orchestration for simple, single-agent tasks:

```bash
# Simple typo fix
swarm quick "fix typo in README"

# Documentation update  
swarm quick "update installation instructions in docs"

# With specific agent
swarm quick "rename variable in utils.ts" --agent backend_master

# Skip verification for maximum speed
swarm quick "update version in package.json" --skip-verify
```

**Auto-Detection**: Quick-fix mode intelligently determines if a task is eligible:
- ✅ **Eligible**: Single file changes, documentation updates, typo fixes, simple refactoring
- ❌ **Not Eligible**: Multiple components, architecture changes, new features, comprehensive testing

**Example Output**:
```bash
$ swarm quick "fix typo in auth error message"

⚡ Quick-fix mode: Typo fix
   Agent: backend_master
   Task: fix typo in auth error message

Step execution...

✅ Quick-fix completed in 12.3s
   Agent: backend_master
   Verification: ✓ Passed
```

### Bootstrap Mode

Analyze existing repositories and GitHub Issues to generate intelligent, context-aware execution plans:

```bash
# Analyze single repo
swarm bootstrap . "Add user authentication"

# Analyze multiple repos (monorepo/multi-service)
swarm bootstrap ./frontend ./backend "Build payment integration"

# Bootstrap analyzes:
# - Code structure, languages, dependencies
# - Build/test scripts
# - Open GitHub Issues (via gh CLI if available)
# - Tech debt markers and baseline concerns
# - Cross-repo relationships

# Generates annotated plan with:
# - Evidence-based context for each step
# - Linked GitHub Issues
# - Repository-specific constraints
```

### Demo Scenarios

Pre-configured scenarios showcasing different features:

| Scenario | Description | Steps | Duration | Features |
|----------|-------------|-------|----------|----------|
| `todo-app` | Simple todo app (React + Express) | 4 | 5-10 min | Parallel execution, verification |
| `api-server` | REST API with auth and tests | 6 | 10-15 min | Wave scheduling, auto-merge |
| `full-stack-app` | Complete app with all agents | 7 | 15-20 min | All agents, security audit |
| **`saas-mvp`** | **Flagship SaaS with replanning** | **9** | **20-30 min** | **ALL paradigm-shifting features** |

### Flagship Demo: SaaS MVP

The **saas-mvp** demo showcases EVERY paradigm-shifting capability:

```bash
swarm demo saas-mvp
```

**What It Demonstrates**:
- ✅ Parallel wave execution (steps 1+3 concurrent)
- ✅ Adaptive concurrency (dynamic wave resizing on rate limits)
- ✅ Post-wave meta-analysis (step 9: quality review by meta-reviewer)
- ✅ Knowledge base learning (patterns stored, ≥2 occurrences influence future)
- ✅ Intelligent replanning (step 2 may trigger replan on Stripe SDK issues)
- ✅ Human-like commit history (real-time scoring, anti-pattern flagging)
- ✅ Deployment preview URLs (step 7: extract https://saas-mvp-abc123.vercel.app)
- ✅ Graceful degradation (verification failures don't hard-stop)

**Output Example**:
```
Wave 1 (2 concurrent):
  Step 1 (backend_master): Express + PostgreSQL backend...
  Step 3 (frontend_expert): React frontend with auth...
  ✨ Excellent commit quality: 95/100 (Step 1), 92/100 (Step 3)

Wave 2:
  Step 2 (backend_master): Stripe integration...
  ⚠️  Commit quality warnings: 65/100 - generic messages detected
  
🔍 Analyzing wave 1...
  ✅ Wave health: HEALTHY
  📚 Updated knowledge base with 2 insights

Step 7 (devops_pro):
  📦 Deployed preview: https://saas-mvp-abc123.vercel.app
  ✅ Preview verified (200 OK)

Step 9 (meta_reviewer):
  🔍 Analyzing 8 transcripts...
  💡 Pattern: "Stripe webhook verification before payment" (high confidence)
  💡 Anti-pattern: Generic commit "update files" (2 occurrences)
```

See [demos/SAAS-MVP-DEMO.md](./demos/SAAS-MVP-DEMO.md) for detailed walkthrough.

### Quick Start Demo

```bash
# List all demos
swarm demo list

# Run simple demo (recommended first-time)
swarm demo todo-app

# Run flagship demo (all features)
swarm demo saas-mvp
```

## Demo Scenarios (Legacy)

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

# Execute in parallel with dashboard (default concurrency: 3)
npm start swarm plans/plan-*.json

# Adjust concurrency for large swarms
npm start swarm plan.json --max-concurrency 5

# Specify model
npm start swarm plan.json --model claude-opus-4.5
```

### Configuration Options

```bash
--max-concurrency N    # Max parallel sessions (default: 3)
--model MODEL          # Copilot model to use
--dry-run              # Preview without executing
--auto-pr              # Create pull request on completion
```

## Custom Agents

Seven specialized agents in `.github/agents/`:

| Agent | File | Scope |
|-------|------|-------|
| Backend Master | `backend-master.agent.md` | APIs, databases, server logic |
| Frontend Expert | `frontend-expert.agent.md` | UI, components, styling |
| DevOps Pro | `devops-pro.agent.md` | CI/CD, deployment, infra |
| Security Auditor | `security-auditor.agent.md` | Auth, vulnerabilities |
| Tester Elite | `tester-elite.agent.md` | Unit, integration, e2e tests |
| Integrator Finalizer | `integrator-finalizer.agent.md` | Merge, verify, document |
| **Meta Reviewer** | `meta-reviewer.agent.md` | Post-wave analysis, pattern detection, replanning |

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
3. **Queue Management** - Enqueue steps with priority, respecting concurrency limits
4. **Branch Creation** - Each step gets its own branch: `swarm/{execId}/step-{N}-{agent}`
5. **Parallel Execution** - Run `copilot -p` sessions concurrently per wave
6. **Rate Limit Handling** - Auto-retry with exponential backoff on quota errors
7. **Dynamic Resizing** - Split large waves if failures/rate limits detected
8. **Verification** - Parse transcripts for evidence of completed work
9. **Auto-Merge** - Merge verified branches back to main

### Scalability Features

The orchestrator handles large swarms gracefully:

- **Execution Queue**: Tasks enqueued with priority, max concurrency enforced
- **Retry Logic**: Automatic retry with exponential backoff on rate limits (patterns: `rate limit`, `quota exceeded`, `429`, `throttle`)
- **Dynamic Wave Resizing**: Splits waves when >3 concurrent failures detected
- **Adaptive Concurrency**: Increases limit after 5 consecutive successes, halves on rate limits
- **Dashboard Warnings**: Queue depth and rate limit alerts in real-time

Example wave execution with queue:
```
Wave 1 (up to 3 concurrent):  Step 1, 2, 3 start
  - Step 1 hits rate limit → retry after 5s
  - Concurrency reduced to 2
Wave 1 (continued):           Steps 4, 5 queued, execute as slots free
Wave 1 complete:              Meta-analysis runs
  - Pattern detected: generic commit messages (2 occurrences)
  - Knowledge base updated with insights
  - Health: HEALTHY, continue to next wave
Wave 2:                       Steps 6, 7 (depends on wave 1)
```

### Adaptive Intelligence

The orchestrator learns and adapts as it executes:

- **Post-Wave Analysis**: After each wave completes, the `meta-reviewer` agent analyzes all transcripts for quality, patterns, and issues
- **Pattern Detection**: Identifies anti-patterns (generic commits, skipped tests), context gaps (missing dependencies), and best practices
- **Knowledge Base**: Stores learned patterns with confidence scores and evidence. Patterns with ≥2 occurrences influence future planning
- **Intelligent Replanning**: When >50% of a wave fails verification, triggers replanning with suggested corrections
- **Continuous Learning**: Each execution adds to the knowledge base, improving recommendations over time

**Example Analysis Output**:
```
🔍 Analyzing wave 2 quality...
  ✅ Wave health: HEALTHY
  🔍 Detected 1 pattern(s):
    ⚠️ context-gap: unverified_claims (high severity, 1 occurrence(s))
  📚 Updated knowledge base with 1 insight(s)
```

**Replan Triggers**:
- Critical failure rate (>50% steps failed)
- Repeated verification failures
- High-severity patterns detected
- Suggested changes include re-executing steps or adding missing steps

### Scope Expansion

The orchestrator goes beyond code generation to handle real-world workflows:

**Bootstrap Mode**: Analyzes existing codebases and issues before planning
```bash
swarm bootstrap ./my-app "Fix authentication bugs"
# → Scans repo structure
# → Finds 3 open issues tagged "auth"
# → Generates plan with issue references
# → Plan includes: analyze current auth, fix bugs, close issues
```

**GitHub Issues Integration**: Links and closes issues automatically
```bash
# During execution:
Step 3: Security Auditor
  → Reviews auth implementation
  → Fixes vulnerability
  → Closes issue #42 with comment: "✅ Resolved by swarm - Step 3 (security_auditor)"
```

**Preview Deployments**: DevOpsPro creates accessible preview URLs
```bash
Step 5: DevOps Pro
  → Detects Vercel configuration
  → Runs: vercel deploy --yes
  → Preview URL: https://app-abc123.vercel.app
  → Adds URL to PR description
  → Tests preview is accessible
```

**Example Output**:
```
Step 5 (devops_pro) complete
  📦 Deployed preview: https://app-branch-abc123.vercel.app
  ✅ Preview verified (200 OK)
  🔗 Closed issue #15: "Deploy preview environments"
```

### Human-Like Commit History Enforcement

The orchestrator actively enforces natural, human-like git commit patterns through automated quality checks:

**Commit Quality Heuristics**:
- **Generic Message Detection**: Flags vague messages ("update code", "fix bug", "WIP", "changes")
- **Repetitive Pattern Detection**: Identifies same message used 3+ times
- **Single-Commit Dump Detection**: Warns when one commit has 10+ files
- **Non-Incremental Work Detection**: Flags when >8 files per commit on average

**Real-Time Feedback**:
```bash
Step 3 (backend_master) executing...
  ⚠️  Commit quality warnings for Step 3 (backend_master):
      Quality score: 65/100
      - Found 2 generic/vague commit message(s)
      - High files-per-commit average (7.3), suggests non-incremental work
      Suggestions:
        • Use specific, descriptive commit messages (e.g., "add user authentication API" not "update code")
        • Make smaller, more focused commits (aim for 2-5 files per commit)
        • Review git commit guidelines in your agent instructions for examples

Step 5 (frontend_expert) executing...
  ✨ Excellent commit quality: 95/100 (4 commits)
```

**Enhanced Agent Instructions**:
All 7 custom agents include:
- ✅ 12+ specific good commit examples
- ❌ 10+ anti-pattern examples to avoid
- 📝 Multi-step commit workflows showing incremental progress
- 🎯 Domain-specific commit message styles

**Example from Backend-Master agent**:
```markdown
✅ GOOD examples (specific, varied, incremental):
  add user registration endpoint with email validation
  create migration for users and profiles tables
  implement JWT token generation and refresh logic
  add password hashing with bcrypt
  ...

❌ BAD examples (generic, vague, non-incremental):
  update code
  fix bug
  changes
  WIP
  ...
```

This ensures swarm executions maintain **natural, reviewable git history** that looks human-written.

### Graceful Degradation & Resilience

The orchestrator includes multiple layers of graceful degradation to ensure robustness:

**Copilot CLI Wrapper**: Abstraction layer with automatic fallback
```typescript
// Detects Copilot CLI capabilities
✓ CLI available, supports -p mode, --share, --agent, --mcp
✗ CLI unavailable → graceful degradation mode

// Graceful degradation provides helpful guidance instead of hard failure
⚠️  Graceful Degradation Mode
The Copilot CLI is not available or failed to execute.
To use this feature:
1. Install Copilot CLI: npm install -g @github/copilot-cli
2. Authenticate: copilot auth
3. Re-run this command
```

**Verification Graceful Failure**: Continue execution even if verification fails
```bash
# Enable graceful degradation in verification
--graceful-degradation flag

# Example: Step passes verification checks but has minor issues
⚠️  Verification: Gracefully passed (degraded mode)
    Reason: Test output detection failed but commits verified
    Continuing execution...
```

**Retry Logic**: Automatic retry with exponential backoff
- Detects rate limits via pattern matching
- Retries with 5s → 10s → 20s delays
- Adjusts concurrency dynamically

**Benefits**:
- ✅ **No hard failures** on transient issues
- ✅ **Helpful error messages** guide users to solutions  
- ✅ **Automatic recovery** from rate limits and timeouts
- ✅ **Continues execution** when safe to do so


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

437 tests covering orchestration, verification, plan generation, agent configuration, execution queue, wave resizing, knowledge base, and meta-analysis.

## Project Structure

```
src/
├── cli.ts                   # Command-line interface
├── swarm-orchestrator.ts    # Parallel execution coordinator
├── execution-queue.ts       # Async queue with retry logic
├── wave-resizer.ts          # Dynamic wave resizing and adaptive concurrency
├── meta-analyzer.ts         # Post-wave quality analysis and replanning
├── knowledge-base.ts        # Pattern learning and storage
├── session-executor.ts      # Copilot CLI session runner
├── verifier-engine.ts       # Evidence-based verification
├── plan-generator.ts        # Step planning and dependencies
├── context-broker.ts        # Shared state for parallel agents
├── config-loader.ts         # Agent configuration loading
├── demo-mode.ts             # Pre-configured scenarios
└── share-parser.ts          # Transcript parsing

.github/agents/              # Custom agent definitions (7 agents)
config/                      # Agent YAML configurations
knowledge-base.json          # Learned patterns (auto-generated)
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
