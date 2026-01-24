We are in the open VS Code project root for "copilot-swarm-orchestrator". You can see the entire codebase as described in the README: src/ files (cli.ts, swarm-orchestrator.ts for wave-based parallel execution, session-executor.ts for programmatic copilot -p sessions, verifier-engine.ts for evidence verification, plan-generator.ts for planning/dependencies, context-broker.ts for shared state, config-loader.ts for agents, demo-mode.ts for scenarios, share-parser.ts for transcripts); .github/agents/ with 6 custom .agent.md agents; config/ YAML; runs/ artifacts; 392+ passing tests; demo scenarios like todo-app to saas-mvp.

The system is fully built to the README spec: parallel execution via waves, per-agent branches/auto-merge, evidence verification via transcript parsing, natural git history emphasis in agent instructions, quick-start/commands, etc. Using only real Jan 2026 Copilot CLI features.

Before upgrades, review the project to confirm accuracy: Summarize key code logic with snippets (e.g., wave calculation in swarm-orchestrator.ts, branch creation in session-executor.ts, verification in verifier-engine.ts). Match to README features; note strengths (e.g., quota handling if present) and exact weaknesses per critiques below.

Then, upgrade to address these critiques, making it paradigm-shifting: Scalable for large swarms, adaptive with replanning/learning, expanded scope (bootstrapping/issues/deployment), reinforced human-like history, broader appeal (quick modes/resilience).

Replace old build guide/steps with this new strategy. Embed all style rules, hard rules, non-negotiable checks, system definition, file structure, API contracts, testing plan, and "judge kit" from the instructions below. Reference them in upgrades.

Starter prompt: You are operating as a GitHub Copilot CLI custom agent within a supervised, sequential workflow.

Context
- This repository is part of a Copilot CLI Challenge entry.
- Your work must be fully auditable through session transcripts, git history, and test output.
- You are one step in a multi-step plan. You must not assume future steps or undo prior work.

Your assigned role
- Agent name: {{AGENT_NAME}} (use UpgraderElite for this session)
- Domain scope: {{AGENT_DOMAIN}} (system upgrades to address scalability, adaptability, scope, history, appeal)
- You must stay strictly within this domain.
- If a task exceeds this scope, say so and stop.

Hard rules
1. Do not invent features, flags, APIs, or tool behavior.
2. If you are uncertain about anything, explicitly say you are uncertain and list how to verify it.
3. Do not claim tests passed unless you actually ran them and can show the command output.
4. Do not say “done” unless all required artifacts listed below exist.
5. Prefer small, reviewable changes over large refactors.
6. When creating pull requests, use /delegate and include the resulting PR URL in your verification section.
7. When using MCP for GitHub context, quote the specific evidence (e.g., issue numbers, workflow snippets) in your summary.

Repository rules
- Only modify files that are directly required for this step.
- Do not touch unrelated files.
- Do not remove existing tests unless instructed and justified.

Required artifacts for each upgrade phase
Produce:
1. Short plan in plain text for changes.
2. Implementation changes.
3. Verification: commands run, tests executed/results, gaps/risks.
4. Human reviewer summary.

Session closure: Run /share when complete.

If requirement unmet, stop and explain.

Begin by confirming role and restating task.

--- System definition (reference for upgrades) ---

Copilot Swarm Orchestrator is a Node.js/TypeScript CLI that:
Takes high-level goal.
Generates plan with agents/dependencies.
Executes in parallel waves.
Uses per-agent branches, programmatic copilot -p.
Verifies via transcripts.
Auto-merges verified work.
Produces natural git history.
Shows in dashboard.
Upgrades must enhance without breaking this.

Non-negotiable reality checks
Tool does not spawn parallel agents magically—uses waves.
 /share is transcript/handoff, not state import.
MCP provides context if configured, not omniscient.
 /delegate proposes PRs; review manually.

File structure (update as needed)
copilot-swarm-orchestrator/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── swarm-orchestrator
├── config/
│   ├── default-agents.yaml
│   └── user-agents.yaml
├── runs/
│   └── <run-id>/
│       ├── plan.json
│       ├── plan.md
│       ├── run-summary.md
│       ├── index.json
│       └── steps/
│           ├── 01/
│           │   ├── share.md
│           │   ├── summary.md
│           │   └── verification.md
│           └── 02/
│               ├── share.md
│               ├── summary.md
│               └── verification.md
├── proof/
│   └── 00-copilot-cli-smoke.md
├── src/
│   ├── index.ts
│   ├── orchestrator.ts
│   ├── planGenerator.ts
│   ├── agentConfig.ts
│   ├── sessionManager.ts
│   ├── githubMcpIntegrator.ts
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   └── components/
│   │       ├── PlanTree.tsx
│   │       ├── AgentCard.tsx
│   │       ├── ProgressLog.tsx
│   │       └── StepControls.tsx
│   ├── utils/
│   │   ├── cliHelper.ts
│   │   └── shareParser.ts
│   └── types.ts
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/

Internal API structure (enforce in upgrades)
Orchestrator: Inputs goal/options, outputs run folder.
PlanGenerator: Produces/validates plan.
AgentConfig: Loads/validates YAML.
SessionManager: Stores/parses /share, detects unverified claims.
GitHubMcpIntegrator: Generates MCP prompts, enforces evidence.

Credible testing plan (expand in upgrades)
Drift trap: Claim vs evidence parsing.
Parser tests: Real/deceptive transcripts.
E2E: Demo prompts with CI.
Human review: Auth/git/security steps.

Style rules for code/comments/docs
No em dashes.
Comments lowercase, short, factual.
No marketing in comments/docs.
State uncertainty with verification steps.
No fake claims/numbers/flags.
"Tests passed" must include command output.

Judge kit (update README with)
Demo run folder.
Plan/step artifacts/PR links/CI results/dashboard screenshot.
5-min walkthrough.

Implement phase by phase after review. For each: New/updated files (full/diffs), tests (to 500+), deps, commands, README diffs, manuals.

Phase 1: Review Current Project
- Detailed code summary/snippets, README match, strengths/weaknesses per critiques.

Phase 2: Scalability
- Async queuing in swarm-orchestrator.ts: Limit sessions, queue/retries on limits.
- Dynamic wave resizing: Split/merge based on runtime.
- Dashboard: Queue/status warnings.

Phase 3: Adaptive Intelligence
- meta-reviewer.agent.md: Analyzes for replans.
- swarm-orchestrator.ts: Invoke post-wave/failure, revise plan.
- knowledge-base.json: Store patterns, seed plans.
- Loops: Respawn, preserve history.

Phase 4: Scope Expansion
- Bootstrap command: MCP repo/issues analysis for plan.
- Issues: Pull/close via gh CLI.
- Deployment: DevOpsPro runs deploys (Vercel/gh), preview in PR.

Phase 5: Human-Like History
- Update .agent.md: Commit guidelines/examples.
- session-executor.ts: Parse/flag patterned commits.

Phase 6: Broaden Appeal
- Quick-fix mode: Single-agent bypass.
- copilot-cli-wrapper.ts: Abstract calls for resilience.
- Degradation on CLI issues.

Phase 7: Polish/Demo
- README: New features/demos.
- Flagship demo: Open-ended saas-mvp with replan/deploy.
- Manual: Video/DEV updates.

Start with Phase 1.
