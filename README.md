<div align="center">

<br>

<p>
  <img src="docs/media/wasp.svg" alt="" width="36" height="36">
  <img src="docs/media/wasp.svg" alt="" width="52" height="52">
  <img src="docs/media/wasp.svg" alt="Swarm Orchestrator" width="72" height="72">
  <img src="docs/media/wasp.svg" alt="" width="52" height="52">
  <img src="docs/media/wasp.svg" alt="" width="36" height="36">
</p>

# Swarm Orchestrator

**Verification and governance layer for AI coding agents. Parallel execution with evidence-based quality gates, not autonomous code generation.**

_This is not an autonomous system builder. It orchestrates external AI agents (Copilot, Claude Code, Codex) across isolated branches, verifies every step with outcome-based checks (git diff, build, test), and only merges work that proves itself. The value is trust in the output, not speed of generation._

<br>

[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
&nbsp;&nbsp;
[![CI](https://github.com/moonrunnerkc/swarm-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/swarm-orchestrator/actions/workflows/ci.yml)
&nbsp;&nbsp;
![Tests: 1159 passing](https://img.shields.io/badge/tests-1159%20passing-brightgreen.svg)
&nbsp;&nbsp;
![Node.js 20+](https://img.shields.io/badge/node-20%2B-green.svg)
&nbsp;&nbsp;
![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-blue.svg)

<br>

[Quick Start](#quick-start) · [What Is This](#what-is-this) · [Quality Benchmarks](#quality-benchmarks) · [Usage](#usage) · [GitHub Action](#github-action) · [Recipes](#recipes) · [Architecture](#architecture) · [Contributing](#contributing)

<br>

<img src="docs/media/swarm.png" alt="Swarm Orchestrator TUI dashboard showing parallel agent execution across waves" width="700">

<br>

</div>

---

<br>

## Quick Start

```bash
# Install globally
npm install -g swarm-orchestrator
# Or clone and build from source
git clone https://github.com/moonrunnerkc/swarm-orchestrator.git
cd swarm-orchestrator
npm install && npm run build && npm link
```

```bash
# Run against your project with any supported agent
swarm bootstrap ./your-repo "Add JWT auth and role-based access control"

# Use Claude Code instead of Copilot
swarm bootstrap ./your-repo "Add JWT auth" --tool claude-code

# Use Codex
swarm bootstrap ./your-repo "Add JWT auth" --tool codex
```

See it work before pointing it at your code:

```bash
swarm demo demo-fast    # two parallel agents, ~1 min
```

Requires Node.js 20+, Git, and at least one supported agent CLI installed.

| Agent | Install | Auth |
|-------|---------|------|
| GitHub Copilot CLI | `npm install -g @github/copilot` | Launch `copilot` and run `/login` (requires Node.js 22+) |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `ANTHROPIC_API_KEY` |
| Codex | `npm install -g @openai/codex` | `OPENAI_API_KEY` |

<br>

---

<br>

## What Is This

AI coding agents generate code fast, but without verification, you're merging untested assumptions into your codebase. This orchestrator provides the evidence layer: it runs agents in parallel, checks whether the generated code actually works, and blocks anything that can't prove itself.

**What it does:** You define a goal. The orchestrator builds a dependency graph, launches steps as dependencies resolve, and manages the full lifecycle: branch creation, agent execution, outcome verification, failure repair, and merge. Every agent runs on its own isolated git branch. Every step is verified by what actually happened: did files change, does the build pass, do tests pass. Steps that can't prove their work don't merge.

**What it does not do:** This tool does not generate code. It delegates code generation to external agent CLIs (Copilot, Claude Code, Codex) and focuses entirely on orchestration, verification, and quality governance. It is not a replacement for autonomous coding tools; it is a trust layer that wraps them.

Works with Copilot CLI, Claude Code, Codex, or any CLI agent via the adapter interface. Select your tool with `--tool` globally or per-step in your plan. The orchestrator doesn't care which agent writes the code; it cares whether the code works.

**Verification is outcome-based.** The engine runs `git diff` against the branch baseline, executes the project's build and test commands in the worktree, and checks for expected output files. Transcript analysis (parsing what the agent claimed) runs as a supplementary signal, not the primary gate. When a step fails, the RepairAgent receives structured failure context (which checks failed and why, ordered by actionability) instead of blindly retrying the same prompt.

Also available as a [GitHub Action](#github-action) for CI/CD integration and with [built-in recipes](#recipes) for common tasks.

<br>

---

<br>

## Quality Benchmarks

The orchestrator's prompt injection and quality gates front-load requirements that developers normally discover through iterative reprompting. The same goal run through the orchestrator produces output that would take 25-40 follow-up prompts to reach with a standalone agent.

Six head-to-head comparisons across three agent CLIs, three frontend projects, and three backend APIs. Full attribute tables, gap analysis, and reprompt estimates in [docs/benchmarks.md](docs/benchmarks.md).

| # | Agent | Project Type | Criteria | Agent Score | Orchestrator Score | Reprompts Saved |
|---|-------|-------------|----------|:-----------:|:------------------:|:---------------:|
| 1 | Copilot CLI | Frontend (Markdown Notes) | 30 | 3 | 30 | 30-40 |
| 2 | Claude Code | Frontend (Tic-Tac-Toe) | 17 | 0 | 17 | 17-25 |
| 3 | Codex | Frontend (Calculator) | 34 | 6 | 32 | 30-40 |
| 4 | Claude Code | Backend (REST API) | 36 | 12 | 34 | 20-25 |
| 5 | Copilot CLI | Backend (REST API) | 44 | 13 | 41 | 25-30 |
| 6 | Codex | Backend (REST API) | 48 | 14 | 46 | 25-30 |

The orchestrator consistently wins on security hardening (headers, body limits, ID validation), test depth (dedicated unit suites per module, not just integration), configuration externalization (env vars with validation), and production scaffolding (Docker, CI scripts, README, coverage reporting). Standalone agents consistently miss these categories regardless of which CLI is used.

Benchmark 6 (Codex backend) was the closest comparison architecturally: Codex produced a factory pattern, async file I/O, custom error classes, and 16 integration tests unprompted. The orchestrator still added 34 attributes on top, primarily in security, test coverage (10 test files vs 1), and config externalization (6 env vars vs 0).

<br>

---

<br>

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `swarm bootstrap ./repo "goal"` | Analyze repo and generate a plan |
| `swarm run --goal "goal"` | Generate plan and execute in one step |
| `swarm swarm plan.json` | Execute a plan with parallel agents |
| `swarm quick "task"` | Single-agent quick task |
| `swarm use <recipe>` | Run a built-in recipe against current project |
| `swarm recipes` | List available recipes |
| `swarm recipe-info <n>` | Show recipe details and parameters |
| `swarm gates [path]` | Run quality gates on a project |


### Key Flags

| Flag | Effect |
|------|--------|
| `--tool <n>` | Agent to use: `copilot` (default), `claude-code`, `codex` |
| `--governance` | Enable Critic review wave with scoring and auto-pause |
| `--lean` | Enable Delta Context Engine (KB-backed prompt references) |
| `--cost-estimate-only` | Print cost estimate and exit without running |
| `--max-premium-requests <n>` | Abort if estimated premium requests exceed budget |
| `--wrap-fleet` | Use Copilot CLI's native `/fleet` for parallel subagent dispatch |
| `--strict-isolation` | Restrict cross-step context to verified entries only |
| `--pm` | Enable PM Agent plan review before execution |
| `--param key=value` | Set recipe parameters (with `use` command) |
| `--pr auto\|review\|none` | PR behavior after execution |

### Examples

```bash
# Full-featured run with Claude Code
swarm swarm plan.json --tool claude-code --governance --lean

# Recipe: add tests with vitest targeting 90% coverage
swarm use add-tests --tool codex --param framework=vitest --param coverage-target=90

# Preview cost before committing
swarm swarm plan.json --cost-estimate-only

# Per-step agent selection in plan.json
# { "steps": [
#   { "id": 1, "task": "...", "agentName": "BackendMaster", "cliAgent": "claude-code" },
#   { "id": 2, "task": "...", "agentName": "TesterElite", "cliAgent": "codex" }
# ]}
```

<br>

---

<br>

## GitHub Action

Run the orchestrator in CI without installing anything. Outcome-based verification provides the trust layer for unattended execution.

> **Security note:** Always pass credentials via the `env:` block, never via `with:` inputs. GitHub Actions may expose input values in workflow logs. Always set minimal `permissions:` to limit `GITHUB_TOKEN` scope. See [SECURITY.md](SECURITY.md) for full credential handling guidance.

```yaml
name: AI Swarm - Add Tests
on:
  workflow_dispatch:
    inputs:
      goal:
        description: 'What should the swarm do?'
        default: 'Add comprehensive unit tests for all untested modules'

permissions:
  contents: write
  pull-requests: write

jobs:
  swarm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: moonrunnerkc/swarm-orchestrator@main
        id: swarm
        with:
          goal: ${{ github.event.inputs.goal }}
          tool: claude-code
          pr: review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          # Add other adapter keys as needed:
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - name: Check Results
        if: always()
        run: echo "${{ steps.swarm.outputs.result }}"
```

| Input | Default | Description |
|-------|---------|-------------|
| `goal` | (required) | What the swarm should accomplish |
| `tool` | `copilot` | Agent CLI: `copilot`, `claude-code`, `codex` |
| `recipe` | | Run a built-in recipe instead of a goal |
| `plan` | | Path to a pre-built plan JSON |
| `pr` | `review` | PR behavior: `auto`, `review` (draft), `none` |
| `max-retries` | `3` | Max retry attempts per step |
| `model` | | Model to pass to the agent CLI |

The Action outputs `result` (JSON with per-step verification status), `plan-path`, and `pr-url`. Session artifacts are automatically redacted for known secret values (API keys, tokens) at the end of every run. The agent CLI must be available in the runner; the Action does not install it. See [docs/github-action.md](docs/github-action.md) for setup instructions.

<br>

---

<br>

## Recipes

Reusable, parameterized plans for common tasks. Recipes modify existing projects (unlike templates, which create new ones).

```bash
swarm recipes                           # list all
swarm recipe-info add-tests             # show details
swarm use add-tests                     # run with defaults
swarm use add-auth --param strategy=session --tool claude-code
```

| Recipe | Steps | Description | Key Parameters |
|--------|-------|-------------|----------------|
| `add-tests` | 3 | Add unit tests for untested modules | `framework` (jest/vitest/mocha), `coverage-target` |
| `add-auth` | 4 | Add authentication | `strategy` (jwt/session) |
| `add-ci` | 3 | Add GitHub Actions CI pipeline | |
| `migrate-to-ts` | 4 | Migrate JavaScript to TypeScript | `strict` (true/false) |
| `add-api-docs` | 3 | Generate OpenAPI spec and docs | `format` (openapi/markdown) |
| `security-audit` | 3 | Run security audit and fix findings | |
| `refactor-modularize` | 4 | Break monolithic code into modules | |

Create custom recipes by adding JSON files to `templates/recipes/`. See [docs/recipes.md](docs/recipes.md) for the schema and examples.

<br>

---

<br>

## Architecture

```
Goal ──> Plan ──> Waves ──> Branches ──> Agents ──> Verify ──> Repair? ──> Merge
```

1. **Plan generation.** A goal becomes numbered steps with declared dependencies, each assigned to a specialized agent. Plans can be generated from a goal, loaded from a template, run from a recipe, or bootstrapped from repo analysis.

2. **Greedy scheduling.** Steps launch the moment their dependencies are satisfied. Adaptive concurrency adjusts based on success rates.

3. **Branch isolation.** Each step runs on its own git worktree and branch. With `--strict-isolation`, cross-step context is restricted to verified entries only.

4. **Agent execution.** The orchestrator spawns the selected agent CLI (`--tool`) as a subprocess, injecting the prompt plus dependency context. Transcripts are captured for supplementary analysis.

5. **Outcome verification.** The engine checks what actually happened: git diff against the recorded base SHA, build execution, test execution, and expected file existence. Transcript parsing runs as a secondary signal. Steps must prove their work with outcomes, not claims.

6. **Failure repair.** Failed steps are classified (build failure, test failure, missing files, no changes) and retried up to three times. Each retry receives structured failure context: which checks failed, the relevant build/test output, and what to fix. The RepairAgent uses outcome-based root causes, not guesswork.

7. **Merge.** Verified branches merge to main. Quality gates check the result for scaffold leftovers, duplicate blocks, hardcoded config, README accuracy, test isolation, runtime correctness, accessibility, and test coverage.

<details>
<summary><strong>Verification checks</strong></summary>

<br>

| Check | Type | Required | What It Verifies |
|-------|------|----------|------------------|
| Git diff | `git_diff` | Yes | Agent produced file changes vs base SHA |
| File existence | `file_existence` | If specified | Expected output files exist in worktree |
| Build execution | `build_exec` | If script exists | `npm run build` (or detected equivalent) passes |
| Test execution | `test_exec` | If script exists | `npm test` (or detected equivalent) passes |
| Transcript evidence | `transcript` | No | Agent claimed completion (supplementary) |

When outcome checks are present, transcript-based checks are demoted to non-required. A step passes when all required checks pass.

</details>

<details>
<summary><strong>Key modules</strong></summary>

<br>

| Module | Responsibility |
|--------|----------------|
| `swarm-orchestrator.ts` | Greedy scheduler, dependency resolution, merge delegation, cost tracking |
| `worktree-manager.ts` | Git worktree lifecycle: creation, removal, branch operations |
| `branch-merger.ts` | Branch merge strategies: rebase-and-merge, conflict resolution, wave merges |
| `verifier-engine.ts` | Outcome-based verification (git diff, build, test, file existence) + transcript analysis |
| `session-executor.ts` | Agent adapter integration, AgentResult-to-SessionResult mapping |
| `adapters/` | Pluggable agent adapters (copilot, claude-code, codex) |
| `recipe-loader.ts` | Recipe loading, parameterization, listing |
| `repair-agent.ts` | Failure classification, targeted retry with outcome context |
| `plan-generator.ts` | Plan creation, dependency validation, recipe-to-plan conversion |
| `cost-estimator.ts` | Pre-execution cost prediction with model multipliers |
| `knowledge-base.ts` | Cross-run pattern storage, recipe run tracking, cost history |

</details>

<details>
<summary><strong>Output artifacts</strong></summary>

<br>

```
runs/<execution-id>/
  session-state.json          # full execution state (resumable)
  metrics.json                # timing, commit count, verification stats
  cost-attribution.json       # per-step estimated vs actual premium requests
  steps/
    step-N/share.md           # raw agent transcript
  verification/
    step-N-verification.md    # outcome-based pass/fail report
```

</details>

<br>

---

<br>

## Demos

Six built-in scenarios for verifying your setup or seeing the pipeline end-to-end.

> **Cost note:** Demos run real agent sessions against real APIs. Each step consumes at least one premium request (or API call for Claude Code / Codex). Larger demos with expensive models can use significant budget. For example, `saas-mvp` with `o3` (20x multiplier) could consume 160+ premium requests. Use `--cost-estimate-only` to preview costs before committing.

```bash
swarm demo list
swarm demo-fast          # ~1 min, two parallel agents
swarm demo <n>        # any scenario

# Preview cost before running
swarm demo api-server --cost-estimate-only
```

| Scenario | Agents | What Gets Built | Time | Est. Requests (1x model) |
|----------|--------|-----------------|------|--------------------------|
| `demo-fast` | 2 | Two independent utility modules | ~1 min | 2 |
| `dashboard-showcase` | 4 | React + Chart.js dashboard, Express API | ~8 min | 4-5 |
| `todo-app` | 4 | React todo with Express backend | ~15 min | 4-5 |
| `api-server` | 6 | REST API with JWT, PostgreSQL, Docker | ~25 min | 6-8 |
| `full-stack-app` | 7 | Full-stack with auth, E2E tests, CI/CD | ~30 min | 7-10 |
| `saas-mvp` | 8 | SaaS MVP with Stripe, analytics, security | ~40 min | 8-12 |

<br>

---

<br>

## Contributing

```bash
npm install && npm run build && npm test
```

Before submitting a PR: run `npm test`, run `swarm gates .`, and keep commits descriptive. TypeScript strict mode, ES2020 target.

<br>

---

<br>

## License

[ISC](LICENSE)

Built by [Bradley R. Kinnard](https://github.com/moonrunnerkc).