# v5.0.0 Release Notes

Three new features focused on catching quality issues earlier, reducing repair cycles, and integrating with existing CI/CD workflows.

## SARIF Output from Quality Gates

Quality gate violations can now be exported as SARIF 2.1.0 JSON for GitHub code scanning. This produces inline PR annotations for every gate violation alongside existing CodeQL or third-party scanner results.

```bash
swarm gates ./repo --sarif results.sarif
swarm gates ./repo --sarif -  # stdout
```

The GitHub Action gains a `sarif: true` input that runs gates and produces SARIF output automatically. All eight gate types map to SARIF rules with `swarm/` prefixed IDs. Failed gates produce error-level results; skipped gates with issues produce note-level entries.

New files: `src/sarif-formatter.ts`, `test/sarif-formatter.test.ts`
Modified: `src/cli-handlers.ts`, `action.yml`, `entrypoint.sh`

## Per-Project Gate Configuration

Projects can now override gate defaults by placing a `.swarm/gates.yaml` file in their repository root. The schema is identical to `config/quality-gates.yaml`; only include fields that differ from defaults.

```yaml
# .swarm/gates.yaml
gates:
  duplicateBlocks:
    minLines: 20
  accessibility:
    enabled: false
```

Config resolution: built-in defaults, then `.swarm/gates.yaml`, then `--quality-gates-config`. Unknown gate keys now produce a descriptive error listing valid names. YAML syntax errors surface the file path.

The config loader also returns defensive copies, preventing shared-state mutation across concurrent gate runs.

Modified: `src/quality-gates/config-loader.ts`
New test: `test/gate-config-resolver.test.ts`

## Spec-Aware Planning

The plan generator reads the resolved gate configuration before generating steps. When gates are enabled, corresponding requirements are appended as concise clauses to each step's agent prompt:

- `scaffoldDefaults`: "Remove all TODO comments, placeholder text, and default scaffold values before completing."
- `duplicateBlocks`: "Avoid duplicating code blocks. Extract shared logic into utility functions."
- `testCoverage`: "Achieve thorough test coverage. Test every exported function and major code path."
- And similar clauses for all eight gates.

Clauses are filtered by step category (code-generation, test, frontend, documentation). When `testCoverage` is enabled and the plan has no TesterElite step, one is injected automatically.

The cost estimator reduces the estimated retry probability by 30% when gate-aware prompts are active, reflecting fewer repair cycles from front-loaded requirements.

New files: `src/gate-prompt-builder.ts`, `test/spec-aware-planning.test.ts`
Modified: `src/plan-generator.ts`, `src/cost-estimator.ts`

## Prerequisite Features (from v4.2.0, verified and stabilized)

- OWASP ASI Mapper and Report Renderer
- Structured Run Report Generator and Renderer
- Claude Code Agent Teams Adapter
- CLI commands: `swarm report`, `--owasp-report`, `--tool claude-code-teams`, `--team-size`

## Test Summary

63 new tests across 4 test files. Full suite: 1385 passing, 6 pending, 0 failing.
