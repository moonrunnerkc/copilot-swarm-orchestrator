# GitHub Action

Run the Swarm Orchestrator as a GitHub Action for automated parallel AI coding in CI/CD.

## Quick Start

```yaml
name: AI Swarm
on:
  workflow_dispatch:
    inputs:
      goal:
        description: 'What should the swarm build?'
        required: true

jobs:
  swarm:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Install Copilot CLI
        run: gh extension install github/gh-copilot
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: moonrunnerkc/swarm-orchestrator@main
        with:
          goal: ${{ inputs.goal }}
          pr: review
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `goal` | One of goal/plan/recipe | | Natural language goal |
| `plan` | One of goal/plan/recipe | | Path to plan JSON file |
| `recipe` | One of goal/plan/recipe | | Built-in recipe name |
| `tool` | No | `copilot` | CLI agent: copilot, claude-code, codex |
| `model` | No | | Model override (e.g., claude-sonnet-4, o3) |
| `max-retries` | No | `3` | Max retry attempts per failed step |
| `pr` | No | `review` | PR mode: auto, review, or none |

Exactly one of `goal`, `plan`, or `recipe` must be provided.

## Outputs

| Output | Description |
|--------|-------------|
| `result` | JSON summary: steps, pass/fail, timing |
| `plan-path` | Path to the plan file used |
| `pr-url` | URL of the created pull request (if PR mode active) |

### Result JSON Shape

```json
{
  "allPassed": true,
  "totalSteps": 4,
  "completed": 4,
  "failed": 0,
  "totalDurationMs": 240000,
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "status": "completed",
      "passed": true,
      "retryCount": 0
    }
  ]
}
```

## Agent CLI Setup

The GitHub Action does not install agent CLIs. You must install them in a prior step.

### Copilot CLI

```yaml
- name: Install Copilot CLI
  run: gh extension install github/gh-copilot
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Requires the `GITHUB_TOKEN` secret (available by default in Actions).

### Claude Code

```yaml
- name: Install Claude Code
  run: npm install -g @anthropic-ai/claude-code
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Requires an `ANTHROPIC_API_KEY` repository secret.

### Codex

```yaml
- name: Install Codex
  run: npm install -g @openai/codex
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Requires an `OPENAI_API_KEY` repository secret.

## Exit Codes

The action exits 0 when all steps pass verification, and exits 1 when any step fails. This integrates with GitHub Actions status checks: a failed swarm blocks the workflow.

## Examples

### Goal-Based Execution

```yaml
- uses: moonrunnerkc/swarm-orchestrator@main
  with:
    goal: "Add comprehensive unit tests for all modules"
    tool: copilot
    pr: auto
```

### Plan-Based Execution

```yaml
- uses: moonrunnerkc/swarm-orchestrator@main
  with:
    plan: plans/api-migration.json
    tool: claude-code
    model: claude-sonnet-4
```

### Recipe-Based Execution

```yaml
- uses: moonrunnerkc/swarm-orchestrator@main
  with:
    recipe: add-tests
    tool: copilot
    pr: review
```

### Using the Result Output

```yaml
- uses: moonrunnerkc/swarm-orchestrator@main
  id: swarm
  with:
    goal: "Fix all linting errors"

- name: Check result
  run: |
    RESULT='${{ steps.swarm.outputs.result }}'
    PASSED=$(echo "$RESULT" | jq -r '.allPassed')
    if [ "$PASSED" != "true" ]; then
      echo "Swarm had failures"
      exit 1
    fi
```

### Multi-Agent Workflow

```yaml
- uses: moonrunnerkc/swarm-orchestrator@main
  with:
    goal: "Migrate codebase from JavaScript to TypeScript"
    tool: claude-code
    model: claude-sonnet-4
    max-retries: 5
    pr: review
```

## Permissions

The action needs write access to create branches and PRs:

```yaml
permissions:
  contents: write
  pull-requests: write
```

## Limitations

- The Docker container uses Node.js 20 with git installed
- Agent CLIs must be installed separately (see Agent CLI Setup above)
- The action runs in the repository checkout directory
- Long-running swarms may exceed GitHub Actions job time limits (6 hours for public repos)
