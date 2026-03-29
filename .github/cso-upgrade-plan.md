# Swarm Orchestrator Upgrade Plan v3

Five scoped changes to transform CSO from a Copilot-specific CLI tool into an agent-agnostic parallel execution engine with CI integration and reusable task recipes. Phases 1-3 make the core agent-agnostic and outcome-verified. Phase 4 publishes it as a GitHub Action. Phase 5 adds a recipe system for common tasks.

## Codebase Context for Copilot Chat

This repo orchestrates parallel AI coding sessions with dependency-aware wave scheduling, per-agent git branch isolation, and transcript-based verification. Currently hardcoded to GitHub Copilot CLI (`copilot -p`). These changes make it agent-agnostic, verify outcomes instead of transcripts, enhance the existing RepairAgent with richer failure context, publish as a GitHub Action for CI/CD, and add a recipe system for reusable task templates.

### Key Source Files

| File | Lines | Role |
|------|-------|------|
| `src/session-executor.ts` | 430 | Copilot CLI invocation, defines `SessionResult` (line 31) |
| `src/verifier-engine.ts` | 476 | Verification checks, `VerificationCheck.type` union (line 7), `verifyStep()` signature (line 52) |
| `src/swarm-orchestrator.ts` | 1620 | Parallel execution, retry via RepairAgent, wave scheduling, `SwarmExecutionContext` return type (line 73) |
| `src/plan-generator.ts` | 732 | Plan creation and validation |
| `src/cli.ts` | 1137 | CLI entry point |
| `src/cli-handlers.ts` | -- | CLI handlers; `--agent` flag (line 60, 1424) for Copilot agent selection; `swarm run --goal` (line 1483); `executeSwarm(planFilename: string, options?)` (line 433); currently returns 0 unconditionally (line 647) |
| `src/share-parser.ts` | -- | Parses Copilot /share transcripts |
| `src/cost-estimator.ts` | -- | Token/cost estimation (v3, partially implemented) |
| `src/web-dashboard.ts` | -- | Existing dashboard (renders verification results) |
| `src/meta-analyzer.ts` | -- | Consumes verification results between waves |
| `src/cicd-config-generator.ts` | -- | Already understands GitHub Actions workflow structure |
| `src/mcp-server.ts` | -- | Headless MCP server (proves tool can operate without TTY) |
| `src/pr-manager.ts` | -- | PR automation (`--pr auto\|review` flag) |
| `src/knowledge-base.ts` | -- | Persists patterns and success rates; no `recordRecipeRun` method yet (line 91 has general record method) |
| `src/plan-storage.ts` | -- | Plan save/load from filesystem |
| `config/default-agents.yaml` | -- | Agent role definitions (6 roles) |
| `templates/` | -- | Existing plan templates: rest-api.json, fullstack.json, react-app.json, library.json, cli-tool.json |

### Architecture Flow

```
Goal > Plan Generator > Wave Scheduler > Agent Branches > Verifier > Merge
```

### Existing Interfaces to Preserve

**PlanStep** (src/plan-generator.ts) has `agentName` field (line 4) referring to the agent role (BackendMaster, TesterElite, etc.), not the CLI tool.

**SessionResult** (src/session-executor.ts, line 31) has fields: `output` (stdout+stderr), `exitCode`, `duration`, `success` (exitCode === 0), `error` (stderr on failure), `transcriptPath`.

**VerificationCheck.type** (src/verifier-engine.ts, line 7) already includes: `'test'`, `'build'`, and other types. The existing `verifyBuild()` (line 193) already generates `type: 'build'` checks from transcript analysis.

**VerificationResult** uses an array-based `checks` format with fields: `checks` (array), `unverifiedClaims`, `timestamp`, `transcriptPath`, `stepNumber`, `agentName`.

**verifyStep() actual signature** (src/verifier-engine.ts, line 52): parameters are `stepNumber` and `agentName` first, then `transcriptPath`. NOT the other way around. New parameters must be appended after the existing ones or added to an options object.

**RepairAgent** (src/swarm-orchestrator.ts, lines 880-920) already handles retry with context:
- Extracts failed checks via `repairAgentHelper.extractFailedChecks()` (line 893)
- Derives root cause from check types (lines 897-899)
- Builds `RepairContext` with `failedChecks`, `rootCause`, `retryCount` (lines 904-916)
- Spawns a targeted repair session with classified failure context

**SwarmExecutionContext** (src/swarm-orchestrator.ts, line 73) is the return type of `executeSwarm()`. It has:
- `results` (NOT `steps`) of type `ParallelStepResult[]`
- No `allStepsPassed` property (must be derived)
- No `totalDuration` property (calculate from min/max of startTime/endTime)

**ParallelStepResult** has:
- `stepNumber` (NOT `id`)
- `verificationResult` (NOT `verification`)
- `retryCount`
- No `task` field

**executeSwarm() in cli-handlers.ts** (line 433) takes a `planFilename: string` (a file path), not a plan object. It loads the plan from PlanStorage internally. To execute a plan object, save it to a file first.

**VerifierEngine** is instantiated once at orchestrator construction (line 127) with `this.workingDir` pointing to the orchestrator's root directory. Currently only reads transcript files; does not execute commands in worktrees.

**Existing `--agent` CLI flag** (cli-handlers.ts, lines 60 and 1424) passes a value to Copilot's `--agent` flag for selecting a Copilot agent like `@workspace`. This is a different concept from CLI tool selection.

**`swarm run --goal`** (cli-handlers.ts, line 1483) implements the full goal-to-completion flow. This is the entry point for the GitHub Action.

**Plan templates** (templates/) contain 5 static JSON plans: rest-api.json, fullstack.json, react-app.json, library.json, cli-tool.json. Each has predefined steps, agent assignments, dependency ordering, and expected outputs.

### Relationship to v3 Upgrade

The v3 upgrade (CostEstimator, FleetWrapper) is partially implemented. CostEstimator is already imported in cli-handlers.ts. FleetWrapper modifies how Copilot CLI sessions are spawned. The adapter layer in Phase 1 sits ABOVE FleetWrapper. The copilot adapter calls FleetWrapper internally; other adapters skip it entirely.

---

## Phase 1: Agent Adapter Layer

**Target files:** `src/session-executor.ts`, new `src/adapters/` directory, `src/swarm-orchestrator.ts`, `src/cli.ts`, `src/cli-handlers.ts`

**Goal:** Replace the direct `copilot -p` subprocess call with a pluggable adapter interface so any CLI-based coding agent can be used.

### 1.1 Adapter Interface

Create `src/adapters/agent-adapter.ts`:

```typescript
export interface AgentResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  shareTranscriptPath?: string;
}

export interface AgentAdapter {
  name: string;
  spawn(opts: {
    prompt: string;
    workdir: string;
    model?: string;
    timeout?: number;
    copilotAgent?: string;
  }): Promise<AgentResult>;
}
```

Note: `stdout` and `stderr` are captured separately to map cleanly to SessionResult. See Section 1.5 for the field mapping.

The `copilotAgent` option passes through the existing `--agent` CLI flag value to Copilot's `--agent` flag. Non-Copilot adapters ignore this field.

### 1.2 Adapter Implementations

**`src/adapters/copilot-adapter.ts`**

- Extract the existing `copilot -p` spawn logic from `src/session-executor.ts` into this adapter
- Preserve `--model`, `--share`, and `--agent` (Copilot agent) flag support
- The `copilotAgent` option maps to Copilot's `--agent` flag (e.g., `@workspace`)
- If FleetWrapper exists and is active, call it internally (adapter wraps FleetWrapper)
- Set `shareTranscriptPath` from the `--share` output
- Capture `stdout` and `stderr` separately
- This is a refactor. Existing behavior must be preserved exactly.

**`src/adapters/claude-code-adapter.ts`**

- Spawns `claude --dangerously-skip-permissions -p "prompt"` in the target workdir
- Captures stdout and stderr separately
- Supports `--model` passthrough
- `shareTranscriptPath` is always undefined
- Ignores `copilotAgent` option

**`src/adapters/codex-adapter.ts`**

- Spawns `codex --quiet -p "prompt"` in the target workdir
- Captures stdout and stderr separately
- `shareTranscriptPath` is always undefined
- Ignores `copilotAgent` option

**`src/adapters/index.ts`**

- Export `resolveAdapter(name: string): AgentAdapter`
- Throws on unknown adapter name with message listing available adapters
- Default: `"copilot"`

### 1.3 Plumbing: CLI to Executor

The adapter selection flows from CLI flag through orchestrator to executor. The flag name avoids collision with the existing `--agent` flag.

**Step 1: Add `cliAgent` to SwarmExecutionOptions**

In the types file where SwarmExecutionOptions is defined:

```typescript
cliAgent?: string;
```

**Step 2: Add `--tool` CLI flag**

In `src/cli.ts`, add `--tool` flag to `swarm` and `quick` commands:

```
npm start swarm plan.json --tool claude-code
npm start swarm plan.json --tool codex
npm start swarm plan.json --tool copilot    # default
```

The flag is `--tool`, NOT `--agent`. The existing `--agent` flag in quick mode (cli-handlers.ts:60, 1424) already passes a value to Copilot's `--agent` flag for selecting a Copilot agent like `@workspace`. Using `--agent` for tool selection would silently break existing quick-fix mode.

In `src/cli-handlers.ts`, map the parsed `--tool` value to `options.cliAgent`.

**Step 3: Resolve adapter in SwarmOrchestrator**

In `src/swarm-orchestrator.ts`, at the start of `executeSwarm()`:

```typescript
const defaultAdapter = resolveAdapter(options.cliAgent || 'copilot');
```

When constructing or invoking SessionExecutor for each step, pass the resolved adapter. If a step has a per-step `cliAgent` override, resolve that instead.

**Step 4: Modify SessionExecutor**

In `src/session-executor.ts`:

- Add `adapter: AgentAdapter` as a constructor parameter or method parameter
- Replace the hardcoded `copilot -p` spawn logic with `adapter.spawn()`
- Map `AgentResult` to the existing `SessionResult` (see Section 1.5)
- Pass `AgentResult.shareTranscriptPath` to share-parser conditionally: only call share-parser if the path is defined

### 1.4 Per-Step Tool Override (Optional)

Add `cliAgent` field to PlanStep interface (NOT `agent`, to avoid collision with existing `agentName` which is the role):

```typescript
cliAgent?: string;
```

Plan JSON example:

```json
{
  "steps": [
    { "id": 1, "task": "...", "agentName": "BackendMaster", "cliAgent": "claude-code" },
    { "id": 2, "task": "...", "agentName": "TesterElite", "cliAgent": "codex" },
    { "id": 3, "task": "...", "agentName": "FrontendExpert" }
  ]
}
```

Step 3 has no `cliAgent`, so it uses the default from the `--tool` flag (or "copilot" if no flag).

### 1.5 AgentResult to SessionResult Field Mapping

SessionExecutor must map AgentResult to the existing SessionResult interface so all downstream consumers see no change:

| AgentResult field | SessionResult field | Mapping |
|---|---|---|
| `stdout` + `stderr` | `output` | `agentResult.stdout + agentResult.stderr` |
| `exitCode` | `exitCode` | direct pass-through |
| `durationMs` | `duration` | direct pass-through |
| (derived) | `success` | `agentResult.exitCode === 0` |
| `stderr` (when failed) | `error` | `agentResult.exitCode !== 0 ? agentResult.stderr : undefined` |
| `shareTranscriptPath` | `transcriptPath` | direct pass-through (undefined for non-Copilot) |

This mapping lives inside SessionExecutor. No other module sees AgentResult directly.

### 1.6 Share Parser Conditional Invocation

```typescript
const shareResult = sessionResult.transcriptPath
  ? parseShareTranscript(sessionResult.transcriptPath)
  : null;
```

No changes to share-parser.ts itself.

### 1.7 Tests

- Unit test each adapter with a mock subprocess
- Test adapter resolution: known names resolve, unknown name throws
- Test AgentResult-to-SessionResult mapping (all fields, including stderr handling)
- Test share-parser conditional: copilot adapter triggers it, others skip it
- Test that existing `--agent` flag still works for Copilot agent selection
- Test `--tool` flag flows through SwarmExecutionOptions to adapter resolution

---

## Phase 2: Outcome-Based Verification

**Target files:** `src/verifier-engine.ts`, `src/swarm-orchestrator.ts` (base SHA recording and worktree path passing)

**Goal:** Primary verification checks what actually happened on the branch. Transcript parsing becomes a secondary signal. Interface extends the existing format without breaking consumers.

### 2.1 Extend Existing Check Types

The existing `VerificationCheck.type` union (verifier-engine.ts, line 7) already includes `'build'` and `'test'`. New outcome-based checks use distinct type names:

```typescript
type: 'git_diff' | 'file_existence' | 'build_exec' | 'test_exec'
```

`'build_exec'` and `'test_exec'` are distinct from the existing transcript-parsed `'build'` and `'test'` types. Each check entry retains the existing shape:

```typescript
{
  type: 'git_diff' | 'file_existence' | 'build_exec' | 'test_exec' | ...existing types...,
  description: string,
  required: boolean,
  passed: boolean,
  reason: string
}
```

### 2.2 Extend VerificationResult Interface

Add optional fields (do not remove any existing fields):

```typescript
failureContext?: string;
summary?: string;
baseSha?: string;
```

### 2.3 Add Outcome Check Parameters to verifyStep

**CRITICAL: The existing verifyStep() signature at verifier-engine.ts:52 has `stepNumber` and `agentName` BEFORE `transcriptPath`.** Check the actual parameter order before modifying. Do NOT assume the order shown in earlier plan revisions.

The safest approach: add an optional `outcomeOpts` object parameter at the end of the existing signature to avoid a 7+ parameter signature:

```typescript
interface OutcomeVerificationOpts {
  workdir: string;
  baseSha: string;
  expectedFiles?: string[];
}

// Append to existing signature (preserves all existing params in their current order)
verifyStep(
  ...existingParams,
  outcomeOpts?: OutcomeVerificationOpts
): VerificationResult
```

When `outcomeOpts` is provided, outcome-based checks run. When omitted, only transcript-based checks run (backward compat). Read the actual signature at line 52 before implementing.

### 2.4 Record Base SHA Before Agent Execution

In `src/swarm-orchestrator.ts`, between worktree creation (line 1064) and session execution (line 1140):

```typescript
const baseSha = execSync('git rev-parse HEAD', { cwd: worktreePath }).toString().trim();
```

### 2.5 Verification Checks

**git_diff** (required): `git diff --stat {baseSha}..HEAD` in worktree. Fails if no changes.

**file_existence** (required, only if expected files specified): Check paths exist in worktree. No entry if none specified.

**build_exec** (required, only if build script detected): Run build command in worktree. Truncate output to last 20 lines on failure. No entry if no build script.

**test_exec** (required, only if test script detected): Same as build_exec for test commands.

**Existing transcript checks** stay as-is but get demoted when outcome checks are present:

```typescript
const hasOutcomeChecks = checks.some(c => c.type === 'build_exec' || c.type === 'test_exec');
if (hasOutcomeChecks) {
  checks.forEach(c => {
    if (c.type === 'build' || c.type === 'test') {
      c.required = false;
    }
  });
}
```

### 2.6 Pass/Fail Logic

```typescript
const requiredChecks = checks.filter(c => c.required);
const passed = requiredChecks.length > 0 && requiredChecks.every(c => c.passed);
```

### 2.7 Generate failureContext String

`buildFailureContext(checks)`: filter to failed, order by actionability (file_existence > test_exec > build_exec > git_diff > transcript types), format as `- {type}: {reason}` lines, truncate to 500 tokens using CostEstimator's chars/4 heuristic.

### 2.8 Output Truncation Helper

```typescript
function last20Lines(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= 20) return output;
  return '...\n' + lines.slice(-20).join('\n');
}
```

### 2.9 Tests

- git_diff with/without commits (real git ops in temp dirs)
- file_existence present/missing/none specified
- build_exec/test_exec with/without scripts, first-wave skip
- Type naming distinct from existing build/test
- Transcript demotion when outcome checks present
- Pass/fail logic edge cases
- failureContext truncation and ordering
- verifyStep with/without outcomeOpts
- Existing fields preserved

---

## Phase 3: Enhance RepairAgent with Outcome-Based Failure Context

**Target files:** `src/swarm-orchestrator.ts` (RepairAgent integration, lines 880-920)

**Goal:** Feed Phase 2's richer outcome-based failure context into the existing RepairAgent. No parallel retry mechanism; enhance what exists.

### 3.1 Update extractFailedChecks for New Types

```
'git_diff' -> rootCause = 'no_changes'
'file_existence' -> rootCause = 'missing_files'
'build_exec' -> rootCause = 'build_failure'
'test_exec' -> rootCause = 'test_failure'
```

Outcome types take root cause priority over transcript types when both fail.

### 3.2 Add failureContext to RepairContext

```typescript
failureContext?: string;
```

Populate from `verificationResult.failureContext || ''` in the retry path.

### 3.3 Enhance buildRepairPrompt

Append to existing prompt construction (do not replace):

```typescript
if (repairContext.failureContext) {
  prompt += '\n\nOutcome verification details:\n';
  prompt += repairContext.failureContext;
}

if (repairContext.retryCount === maxRetries) {
  prompt += '\n\nThis is the final attempt. Prioritize getting a working result over completeness.';
}
```

### 3.4 Tests

- extractFailedChecks handles new check types
- Root cause priority: outcome wins over transcript
- buildRepairPrompt includes/excludes failureContext
- Final-retry urgency message only on last attempt
- Backward compat when failureContext undefined

---

## Phase 4: GitHub Action

**Target files:** new `action.yml`, new `Dockerfile`, new `entrypoint.sh`, `src/cli-handlers.ts` (minor), `package.json`

**Goal:** Publish the tool as a GitHub Action so any repo can run swarm orchestration in CI without local installation. The outcome-based verification from Phase 2 provides the trust layer that makes unattended CI execution viable.

**Dependencies:** Phases 1 and 2 must be complete.

### 4.1 Action Definition

Create `action.yml` at repo root:

```yaml
name: 'Swarm Orchestrator'
description: 'Agent-agnostic parallel AI coding with dependency-aware scheduling and outcome-verified results'
branding:
  icon: 'cpu'
  color: 'blue'

inputs:
  goal:
    description: 'What you want the swarm to accomplish'
    required: true
  tool:
    description: 'CLI agent to use: copilot, claude-code, codex'
    required: false
    default: 'copilot'
  model:
    description: 'Model to pass to the agent CLI'
    required: false
  plan:
    description: 'Path to a pre-built plan JSON file (skips plan generation)'
    required: false
  recipe:
    description: 'Name of a built-in recipe to run (e.g., add-tests, add-auth)'
    required: false
  max-retries:
    description: 'Maximum retry attempts per step'
    required: false
    default: '3'
  pr:
    description: 'PR behavior: auto (create PR), review (create draft PR), none'
    required: false
    default: 'review'

outputs:
  result:
    description: 'JSON result object with verification status per step'
  plan-path:
    description: 'Path to the generated or used plan file'
  pr-url:
    description: 'URL of the created PR (if pr input is auto or review)'

runs:
  using: 'docker'
  image: 'Dockerfile'
```

### 4.2 Dockerfile

Create `Dockerfile` at repo root:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
RUN npm run build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### 4.3 Entrypoint Script

Create `entrypoint.sh` at repo root:

```bash
#!/bin/bash
set -euo pipefail

GOAL="${INPUT_GOAL:-}"
TOOL="${INPUT_TOOL:-copilot}"
MODEL="${INPUT_MODEL:-}"
PLAN="${INPUT_PLAN:-}"
RECIPE="${INPUT_RECIPE:-}"
MAX_RETRIES="${INPUT_MAX_RETRIES:-3}"
PR="${INPUT_PR:-review}"

CMD="node /app/dist/cli.js"

if [ -n "$RECIPE" ]; then
  CMD="$CMD use $RECIPE --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
elif [ -n "$PLAN" ]; then
  CMD="$CMD swarm $PLAN --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
elif [ -n "$GOAL" ]; then
  CMD="$CMD run --goal \"$GOAL\" --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
else
  echo "Error: one of goal, plan, or recipe must be provided"
  exit 1
fi

if [ -n "$MODEL" ]; then
  CMD="$CMD --model $MODEL"
fi

echo "Running: $CMD"
eval $CMD

if [ -f "/tmp/swarm-result.json" ]; then
  echo "result=$(cat /tmp/swarm-result.json)" >> "$GITHUB_OUTPUT"
fi

if [ -f "/tmp/swarm-plan.json" ]; then
  echo "plan-path=/tmp/swarm-plan.json" >> "$GITHUB_OUTPUT"
fi

if [ -f "/tmp/swarm-pr-url.txt" ]; then
  echo "pr-url=$(cat /tmp/swarm-pr-url.txt)" >> "$GITHUB_OUTPUT"
fi
```

### 4.4 Result Output for CI

**CRITICAL: Use the actual SwarmExecutionContext shape.** The return type from `executeSwarm()` is `SwarmExecutionContext` (swarm-orchestrator.ts, line 73). It has `results` (not `steps`) of type `ParallelStepResult[]`. Each `ParallelStepResult` has `stepNumber` (not `id`), `verificationResult` (not `verification`), and `retryCount`. There is no `allStepsPassed` or `totalDuration` property; derive them.

In `src/cli-handlers.ts`, after the execution completes, when `GITHUB_ACTIONS` env var is set:

```typescript
if (process.env.GITHUB_ACTIONS) {
  const allPassed = executionContext.results.every(r => r.verificationResult.passed);

  const times = executionContext.results.map(r => r.startTime ?? 0);
  const endTimes = executionContext.results.map(r => r.endTime ?? 0);
  const totalDuration = Math.max(...endTimes) - Math.min(...times);

  const resultJson = JSON.stringify({
    passed: allPassed,
    steps: executionContext.results.map(r => ({
      stepNumber: r.stepNumber,
      passed: r.verificationResult.passed,
      checks: r.verificationResult.checks,
      retries: r.retryCount
    })),
    totalDuration,
    tool: options.cliAgent || 'copilot'
  });
  fs.writeFileSync('/tmp/swarm-result.json', resultJson);

  // Write plan path and PR URL if available
  // Check the actual executionContext for these fields
}
```

Read the actual `SwarmExecutionContext` and `ParallelStepResult` types before implementing. The pseudocode above reflects what the evaluation found, but verify property names at runtime.

### 4.5 Exit Code for CI

**CRITICAL: Do NOT call `process.exit(1)`.** The existing pattern at cli-handlers.ts:647 returns a number from the handler function, and the CLI dispatch layer uses the return value. Preserve this pattern:

```typescript
// In the handler function, replace the unconditional `return 0` with:
const allPassed = executionContext.results.every(r => r.verificationResult.passed);
return allPassed ? 0 : 1;
```

This preserves testability and the existing return-code pattern. The CLI dispatch layer already translates return values to exit codes.

### 4.6 Example Workflow

Create `.github/workflows/swarm-example.yml` as documentation (not for the tool's own CI):

```yaml
# Example: Using Swarm Orchestrator as a GitHub Action
# Copy this workflow to your own repo's .github/workflows/ directory
name: AI Swarm - Add Tests
on:
  workflow_dispatch:
    inputs:
      goal:
        description: 'What should the swarm do?'
        default: 'Add comprehensive unit tests for all untested modules'

jobs:
  swarm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Copilot CLI
        run: gh extension install github/gh-copilot

      - name: Run Swarm
        uses: moonrunnerkc/swarm-orchestrator@main
        id: swarm
        with:
          goal: ${{ github.event.inputs.goal }}
          tool: copilot
          pr: review

      - name: Check Results
        if: always()
        run: echo "${{ steps.swarm.outputs.result }}"
```

### 4.7 Agent CLI Availability

The GitHub Action does NOT install agent CLIs. Document this clearly:

- **Copilot CLI**: `gh extension install github/gh-copilot` + authenticated `gh` CLI
- **Claude Code**: `npm install -g @anthropic-ai/claude-code` + `ANTHROPIC_API_KEY` secret
- **Codex**: `npm install -g @openai/codex` + `OPENAI_API_KEY` secret

### 4.8 Tests

Create `test/github-action.test.ts`:
- Test entrypoint.sh argument construction: goal-only, plan-only, recipe-only, with model, with tool override
- Test that missing goal/plan/recipe produces error exit
- Test CI result JSON structure: uses `stepNumber` (not `id`), `verificationResult` (not `verification`)
- Test exit code: return 1 when steps fail, return 0 when all pass (not process.exit)
- Test GITHUB_ACTIONS env detection: result files only written in CI mode

### 4.9 Documentation

Create `docs/github-action.md` with quick start, input/output reference, agent setup instructions, examples.

---

## Phase 5: Plan Templates as Recipes

**Target files:** `src/cli.ts`, `src/cli-handlers.ts`, `templates/` directory, new `src/recipe-loader.ts`, `src/knowledge-base.ts`

**Goal:** Expand the existing templates directory into a recipe system with a `swarm use <recipe>` command. Recipes are reusable, parameterized plan templates for common tasks.

**Dependencies:** None from Phases 1-3. Recipes work with the existing plan execution flow. If Phases 1-2 are complete, recipes automatically benefit from agent selection and outcome verification.

### 5.1 Recipe Structure

Each recipe is a JSON file in `templates/recipes/`:

```json
{
  "name": "add-tests",
  "description": "Add comprehensive unit tests for all untested modules",
  "category": "testing",
  "parameters": {
    "framework": {
      "description": "Test framework to use",
      "default": "jest",
      "options": ["jest", "vitest", "mocha"]
    },
    "coverage-target": {
      "description": "Target coverage percentage",
      "default": "80"
    }
  },
  "steps": [
    {
      "id": 1,
      "task": "Scan the project and identify all modules without test files. List them with their export signatures.",
      "agentName": "TesterElite",
      "dependsOn": []
    },
    {
      "id": 2,
      "task": "Generate unit tests for all identified untested modules using {{framework}}. Target {{coverage-target}}% coverage.",
      "agentName": "TesterElite",
      "dependsOn": [1]
    },
    {
      "id": 3,
      "task": "Run the full test suite and fix any failing tests.",
      "agentName": "TesterElite",
      "dependsOn": [2]
    }
  ]
}
```

### 5.2 Built-In Recipes

Create 7 recipe files in `templates/recipes/`:

| Recipe | File | Steps | Description |
|---|---|---|---|
| `add-tests` | `add-tests.json` | 3 | Add unit tests for untested modules |
| `add-auth` | `add-auth.json` | 4 | Add authentication (JWT or session-based) |
| `add-ci` | `add-ci.json` | 3 | Add GitHub Actions CI pipeline |
| `migrate-to-ts` | `migrate-to-ts.json` | 4 | Migrate JavaScript project to TypeScript |
| `add-api-docs` | `add-api-docs.json` | 3 | Generate OpenAPI spec and API documentation |
| `security-audit` | `security-audit.json` | 3 | Run security audit and fix findings |
| `refactor-modularize` | `refactor-modularize.json` | 4 | Break monolithic code into modules |

### 5.3 Recipe Loader

Create `src/recipe-loader.ts`:

```typescript
export interface RecipeParameter {
  description: string;
  default?: string;
  options?: string[];
}

export interface Recipe {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, RecipeParameter>;
  steps: PlanStep[];
}

export function loadRecipe(name: string): Recipe
export function listRecipes(): { name: string; description: string; category: string }[]
export function parameterizeRecipe(recipe: Recipe, params: Record<string, string>): Recipe
```

### 5.4 CLI Commands

Add to `src/cli.ts`:

- `swarm use <recipe> [--param key=value ...] [--tool <agent>] [--pr auto|review|none]`
- `swarm recipes` (list all, grouped by category)
- `swarm recipe-info <recipe>` (show full details)

### 5.5 CLI Handler

**CRITICAL: `executeSwarm()` in cli-handlers.ts takes a `planFilename: string` (file path), not a plan object.** The recipe flow must save the parameterized plan to a file first, then call `executeSwarm()` with the file path.

Add `handleUseCommand` to `src/cli-handlers.ts`:

```typescript
async function handleUseCommand(recipeName: string, options: {
  params?: Record<string, string>;
  cliAgent?: string;
  pr?: string;
  maxRetries?: number;
}): Promise<number> {
  const recipe = loadRecipe(recipeName);
  const parameterized = parameterizeRecipe(recipe, options.params || {});

  // Convert recipe to plan object
  const plan = {
    goal: recipe.description,
    steps: parameterized.steps,
    metadata: {
      recipe: recipe.name,
      parameters: options.params || {}
    }
  };

  // Save to file first (executeSwarm takes a filename, not a plan object)
  const planPath = path.join('plans', `recipe-${recipe.name}-${Date.now()}.json`);
  await PlanStorage.save(planPath, plan);

  // Execute using existing swarm orchestration
  return await executeSwarm(planPath, {
    cliAgent: options.cliAgent,
    pr: options.pr,
    maxRetries: options.maxRetries
  });
}
```

Check the actual `PlanStorage` API for the correct save method. The key constraint: the plan must be on disk before `executeSwarm()` is called.

### 5.6 Knowledge Base Integration

**CRITICAL: `KnowledgeBaseManager` does not have a `recordRecipeRun` method.** Add one.

In `src/knowledge-base.ts`, add a new method to `KnowledgeBaseManager`:

```typescript
async recordRecipeRun(data: {
  recipe: string;
  parameters: Record<string, string>;
  tool: string;
  passed: boolean;
  duration: number;
  stepsCompleted: number;
  totalSteps: number;
}): Promise<void> {
  // Store using the existing storage mechanism (check how other records are stored at line 91+)
  // Use category 'recipe_run' or similar to distinguish from other record types
}
```

Then call it in `handleUseCommand` after execution completes:

```typescript
const allPassed = executionContext.results.every(r => r.verificationResult.passed);
const stepsCompleted = executionContext.results.filter(r => r.verificationResult.passed).length;

await knowledgeBase.recordRecipeRun({
  recipe: recipe.name,
  parameters: options.params || {},
  tool: options.cliAgent || 'copilot',
  passed: allPassed,
  duration: /* calculate from executionContext timestamps */,
  stepsCompleted,
  totalSteps: executionContext.results.length
});
```

### 5.7 Tests

Create `test/recipes.test.ts`:
- Test loadRecipe: valid recipe loads, invalid name throws with available list
- Test listRecipes: returns all 7 built-in recipes with correct fields
- Test parameterizeRecipe: placeholders replaced, defaults used, required params enforced
- Test handleUseCommand: recipe saves plan to file, calls executeSwarm with file path
- Test all 7 recipe JSON files: parse correctly, have required fields
- Test knowledge base recordRecipeRun: method exists, stores data correctly
- Test CLI commands: `swarm recipes` lists all, `swarm recipe-info add-tests` shows details

### 5.8 Documentation

Create `docs/recipes.md` with available recipes table, usage examples, custom recipe guide, JSON schema reference.

---

## Execution Order

```
Phase 1 (Adapter Layer)  -----> independent
Phase 2 (Outcome Verify) -----> independent
Phase 3 (RepairAgent)    -----> depends on Phase 2
Phase 4 (GitHub Action)  -----> depends on Phases 1 and 2
Phase 5 (Recipes)        -----> independent (benefits from 1+2 but doesn't require them)
```

**Recommended:** Run Phases 1, 2, and 5 in parallel. Phase 3 after Phase 2. Phase 4 after Phases 1 and 2.

If sequential: Phase 2, Phase 1, Phase 3, Phase 5, Phase 4.

### Relationship to v3 Upgrade

1. **session-executor.ts**: Phase 1's adapter layer sits above v3's FleetWrapper. No conflict.
2. **swarm-orchestrator.ts**: Phase 2 adds base SHA recording. Phase 3 enhances RepairAgent. v3 adds cost flags. Different parts of the orchestrator.
3. **cli-handlers.ts**: Phase 4 adds CI output. Phase 5 adds handleUseCommand. v3 adds cost handlers. All additive.

---

## Scope Boundaries

This plan does NOT include:

- No new web dashboard features
- No new agent adapters beyond copilot/claude-code/codex
- No changes to wave scheduling or dependency resolution
- No changes to branch isolation strategy
- No changes to existing demo scenarios
- No parallel retry mechanism (Phase 3 enhances existing RepairAgent)
- No recipe marketplace or external registry
- No automatic agent CLI installation in the GitHub Action

---

## Rename

After all five phases ship:

**Repository:** `moonrunnerkc/copilot-swarm-orchestrator` > `moonrunnerkc/swarm-orchestrator` (GitHub rename, auto-redirect)

**Package:** Update `name` in `package.json` to `swarm-orchestrator`.

**CLI command:** `swarm` via `npm link`.

**README:** Update title, description, supported tools, verification docs, recipe docs, GitHub Action docs, topics.

**Do not delete the old repository.**

---

## Checklist: All Evaluation Issues Resolved

| # | Issue | Resolution |
|---|---|---|
| v1-1 | SessionExecutor constructor plumbing gap | Section 1.3: explicit 4-step plumbing path |
| v1-2 | `agent` vs `agentName` naming collision | `cliAgent` field throughout |
| v1-3 | `--share` flag is Copilot-specific | `shareTranscriptPath` optional; share-parser conditional |
| v1-4 | VerificationResult breaking change | Extends existing array format; optional fields |
| v1-5 | Build/test in worktrees vs source repo | Checks run in worktree; skip if no scripts |
| v1-6 | Git diff base reference ambiguous | baseSha recorded between worktree creation and execution |
| v1-7 | failureContext depends on proposed interface | Uses extended interface; backward compat |
| v1-8 | Prompt size estimation naive | References existing CostEstimator chars/4 |
| v1-9 | v3 upgrade plan conflict | Adapter above FleetWrapper; either-order merge |
| v1-10 | "No dashboard" contradicts existing code | Scope says "no new features"; acknowledges consequences |
| v2-1 | `--agent` flag name collision | Uses `--tool` flag |
| v2-2 | `'build'` type already exists | Uses `'build_exec'` and `'test_exec'` |
| v2-3 | Phase 3 overlaps RepairAgent | Enhances existing RepairAgent |
| v2-4 | Worktree git diff timing | baseSha captured between creation and execution |
| v2-5 | Verifier needs worktree path | `outcomeOpts` parameter on `verifyStep()` |
| v2-6 | estimateSubagentCount not used | No action needed |
| v2-7 | AgentResult-to-SessionResult mapping | Section 1.5: explicit field mapping table |
| v3-1 | verifyStep() parameter order wrong | Section 2.3: use outcomeOpts object; read actual signature at line 52 |
| v3-2 | executionResult.allStepsPassed doesn't exist | Section 4.4: derive from SwarmExecutionContext.results |
| v3-3 | process.exit(1) conflicts with return pattern | Section 4.5: return 1, not process.exit(1) |
| v3-4 | executeSwarm takes filename not plan object | Section 5.5: save plan to file via PlanStorage first |
| v3-5 | recordRecipeRun doesn't exist | Section 5.6: add method to KnowledgeBaseManager |