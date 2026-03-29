# Recipes

Pre-built plan templates for common engineering tasks. Recipes encode multi-step workflows into reusable JSON files with parameterized task descriptions.

## Quick Start

```bash
# List available recipes
swarm recipes

# Show details and parameters for a specific recipe
swarm recipe-info add-tests

# Execute a recipe with default parameters
swarm use add-tests

# Override parameters
swarm use add-tests --param framework=jest --param coverage-target=90

# Combine with execution flags
swarm use add-ci --param package-manager=pnpm --model claude-sonnet-4 --pr auto
```

## Available Recipes

| Recipe | Category | Steps | Description |
|--------|----------|-------|-------------|
| `add-tests` | testing | 3 | Add unit tests for untested modules |
| `add-auth` | feature | 4 | Add JWT or session-based authentication |
| `add-ci` | devops | 3 | Add GitHub Actions CI pipeline |
| `migrate-to-ts` | migration | 4 | Migrate a JavaScript project to TypeScript |
| `add-api-docs` | documentation | 3 | Generate OpenAPI spec and API docs |
| `security-audit` | security | 3 | Run security audit and fix findings |
| `refactor-modularize` | refactoring | 4 | Break monolithic code into modules |

## Parameters

Each recipe declares parameters with descriptions, defaults, and optional allowed values. Use `swarm recipe-info <name>` to see the full parameter list.

Pass parameters with `--param key=value`:

```bash
swarm use add-auth --param auth-type=jwt --param provider=github
```

Parameters with defaults can be omitted. The default value is used automatically.

## Recipe JSON Format

Recipes live in `templates/recipes/` as JSON files:

```json
{
  "name": "my-recipe",
  "description": "What this recipe does",
  "category": "testing",
  "parameters": {
    "framework": {
      "description": "Test framework to use",
      "default": "mocha",
      "options": ["mocha", "jest", "vitest"]
    }
  },
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "TesterElite",
      "task": "Write tests using {{framework}}",
      "dependencies": [],
      "expectedOutputs": ["test files"]
    }
  ]
}
```

Placeholders use `{{parameter-name}}` syntax. They are replaced with user-provided values or defaults before execution.

## How It Works

1. `swarm use <recipe>` loads the recipe JSON from `templates/recipes/`
2. Parameters are merged (user values override defaults)
3. `{{placeholder}}` tokens in step tasks are replaced with final values
4. The parameterized plan is saved to `plans/` and executed via the standard swarm pipeline
5. All normal execution features apply: verification, quality gates, cost estimation, repair agent

## Integration with Knowledge Base

Recipe executions are recorded in the knowledge base as `best_practice` patterns. This allows the cost estimator and planning heuristics to learn from recipe run history over time.

## Creating Custom Recipes

Add a JSON file to `templates/recipes/` following the format above. The recipe is immediately available via `swarm recipes` and `swarm use`.

Requirements:
- `name` must match the filename (without `.json`)
- Step numbers must be sequential starting at 1
- Dependencies must reference earlier step numbers
- Every `{{param}}` in task text must have a matching parameter definition
- Parameters should have descriptive text and sensible defaults where possible

## CLI Commands

| Command | Description |
|---------|-------------|
| `swarm recipes` | List all available recipes with categories and parameter names |
| `swarm recipe-info <name>` | Show full details: description, parameters (with defaults and options), steps |
| `swarm use <name> [flags]` | Execute a recipe with optional parameter overrides and execution flags |
