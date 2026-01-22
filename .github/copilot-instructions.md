starter prompt: You are operating as a GitHub Copilot CLI custom agent within a supervised, sequential workflow.

Context
- This repository is part of a Copilot CLI Challenge entry.
- Your work must be fully auditable through session transcripts, git history, and test output.
- You are one step in a multi-step plan. You must not assume future steps or undo prior work.

Your assigned role
- Agent name: {{AGENT_NAME}}
- Domain scope: {{AGENT_DOMAIN}}
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

Required artifacts for this step
You must produce all of the following before ending the session:

1. A short plan in plain text describing exactly what you will change.
2. The actual implementation changes.
3. A verification section that includes:
   - What commands you ran.
   - What tests were executed.
   - The results of those tests.
   - Any gaps or risks that remain.
4. A clear summary written for a human reviewer.

Session closure
- When the step is complete, run /share.
- The /share output is the authoritative record of this step.
- Do not summarize results outside of /share.

If any requirement cannot be met, stop and explain why before proceeding.

Begin by confirming your understanding of this role and restating the task in your own words.
 ----

Copilot Swarm Conductor

A step-by-step build guide using GitHub Copilot CLI, with proof and hard tests

Latest Docs Reference

Verify all claims against official documentation:

- Main CLI docs: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli
- About CLI: https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli
- Slash commands cheat sheet: https://github.blog/ai-and-ml/github-copilot/a-cheat-sheet-to-slash-commands-in-github-copilot-cli
- GitHub MCP: https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server

What this does for the “business” (the competition)

This project is a visible demonstration of Copilot CLI as a real development partner in the terminal:

It turns one developer into a structured, repeatable “team workflow” using sequential custom agents.

It proves Copilot CLI value with artifacts judges can check: PRs created via /delegate, GitHub-context decisions via MCP, and complete session transcripts via /share.

It avoids fantasy features. No “parallel swarms.” No mystery APIs. No invented flags.

If you ship this cleanly with receipts, it is exactly what the challenge is asking for.

Non-negotiable reality checks (so we do not lie to ourselves)

This tool does not “spawn” Copilot agents in parallel. It coordinates sequential sessions.

/share is a transcript capture and handoff mechanism. It is not magic state import.

MCP gives GitHub context if configured, but it is not omniscient. Treat it like a read-only research tool.

/delegate can propose PRs; always manually review approvals, commits, and merge.

These constraints keep the story credible.

System definition (tight and accurate)

Copilot Swarm Conductor is a Node.js/TypeScript CLI that:

Takes a high-level build goal.

Uses Copilot CLI to generate a step plan and assign a custom agent per step.

For each step, prints the exact Copilot CLI session starter prompt, including the prior /share context.

Captures /share transcript outputs and indexes them per step.

Optionally guides PR creation via /delegate.

Shows everything in a TUI so the “team-like workflow” is visible.

That is it. If you try to make it more magical, you lose credibility.

Build phases and proof gates
Phase 0: Repo and local environment
Steps

Create a new GitHub repo: copilot-swarm-conductor.

Create the minimal Node + TypeScript CLI scaffold.

Commit immediately: “chore: initial scaffold”.

Create a basic GitHub Actions workflow (.github/workflows/ci.yml) that runs npm test and npm run build.

Commit immediately: "ci: add basic workflow".

Proof gate

Judges can see the repo history from the first commit.

You are not “starting from a finished project.”

Test gate

npm test exists and runs, even if empty at first.

npm run build works.

If this fails now, the rest is theater.

Phase 1: Copilot CLI sanity and GitHub context
Steps

Install GitHub Copilot CLI and authenticate.

In the repo root, start a Copilot CLI session.

Confirm Copilot can:

read repo files

propose edits

run basic commands with explicit approval

Confirm GitHub context access via MCP inside the session, at minimum:

repo metadata

open issues list

recent PR list

Proof gate

Save the /share transcript as proof/00-copilot-cli-smoke.md.

In your DEV post, quote 2 to 4 lines showing it actually read the repo and saw GitHub context.

Drift control

In every Copilot session, you include a rule: “If you are not certain, say so and ask for verification steps.”

You are building a conductor. You do not allow fantasy answers.

Phase 2: Agent profiles (this is where you “show the tool”)
Steps

Use a Copilot session to draft custom agent definitions for:

FrontendExpert

BackendMaster

DevOpsPro

SecurityAuditor

TesterElite

IntegratorFinalizer

Store them in:

config/default-agents.yaml

config/user-agents.yaml (empty template)

Each agent definition must contain:

purpose

scope boundaries

done definition

output contract (what files it must produce under proof/step-XX/)

refusal rules (examples: “do not invent API behavior”, “do not claim tests passed if not run”)

Proof gate

Save a /share transcript showing Copilot generated the first draft.

Commit the YAML with a message like: “feat: add default agent profiles”.

Test gate

Add a config loader test:

it loads the YAML

it validates required fields

it errors on missing fields

This prevents “agent drift” where your configs quietly rot.

Phase 3: Plan generation (Copilot writes the plan, your tool stores it)
Steps

Implement swarm-conductor plan "<prompt>".

The command runs a Copilot CLI session to generate:

a numbered step plan

assigned agent per step

dependencies

required outputs per step

Store the plan as a real artifact:

runs/<run-id>/plan.json

runs/<run-id>/plan.md

Proof gate

Save the /share transcript used to generate the plan:

runs/<run-id>/proof/01-plan-generation-share.md

In the DEV post, show the plan and link the transcript.

Test gate

Unit test: plan parser

rejects malformed output

rejects missing agent assignments

rejects circular dependencies

Snapshot test: plan JSON schema stays stable

This is how you prevent Copilot from “kind of” generating a plan that breaks your pipeline.

Phase 4: Step runner (the conductor’s real job)
Steps

Implement swarm-conductor run "<prompt>".

Flow:

generate plan (Phase 3)

for step 1..N:

print exact Copilot CLI instructions for the next session

include prior step summary and /share link

require step outputs

The conductor does not need to fully automate Copilot execution. It must be reliable and auditable.

Required per-step outputs (hard contract)

Each step must end with:

/share transcript saved to runs/<run-id>/steps/<step>/share.md

A short “step summary” file: summary.md

A “claims and checks” file: verification.md listing:

what changed

what was tested

what was not tested and why

If Copilot does not produce these, you do not proceed to the next step.

Proof gate

Every step folder has artifacts. No missing links. No hand waving.

Test gate

Integration test: simulate a run with mocked step outputs and ensure:

the conductor advances steps only when required files exist

it halts on missing artifacts

it halts on “verification.md” containing “not tested” for critical items unless explicitly overridden

This is your anti-hallucination enforcement.

Phase 5: Session capture and share indexing
Steps

Implement sessionManager that:

stores /share transcripts by run and step

extracts key facts into a machine-readable index:

changed files

commands executed

tests run

PR links (if any)

Provide swarm-conductor share import <path-or-url>:

pulls a prior transcript into the current run context

does not pretend it can “resume” Copilot state

it is just context packaging

Proof gate

Show a step where a later agent clearly uses earlier /share content.

Test gate

Unit test: share parser extracts links and identifies “tests run” lines.

Negative test: if transcript contains “tests pass” but has no evidence of a test command, mark it as unverified in the index.

This catches the classic AI lie: “All tests passed” with no tests run.

Phase 6: GitHub integration with /delegate and MCP
Steps

Add a conductor option: --delegate which:

instructs the agent step to produce a PR using /delegate

collects PR URL into the run index

Add a conductor option: --mcp which:

instructs the agent to consult GitHub context before decisions

requires a short “MCP evidence” section in verification.md

Proof gate

At least one PR created from /delegate, linked in run summary.

At least one step where MCP context is cited in the transcript and echoed in verification notes.

Test gate

End-to-end demo run on a small prompt:

creates a PR

adds a CI workflow or test

merges successfully after checks pass

If CI is absent, this looks like a hack project, not a competition winner.

Phase 7: TUI dashboard (make the workflow visible)
Steps

Implement swarm-conductor dashboard that shows:

plan tree

current step

current agent

status: waiting, running, blocked, done

last /share link per step

The dashboard is read-only control with minimal buttons:

“open step folder”

“mark step complete”

“next step instructions”

Keep it simple. Nobody wins because you built a terminal circus.

The dashboard must never attempt to control or automate Copilot sessions. It only displays run artifacts and provides navigation shortcuts.

Proof gate

Screenshot or short screen recording in DEV post.

It must show real run data, not fake placeholders.

Test gate

Snapshot tests for dashboard render with mock run state.

File structure (clean, minimal, real)
copilot-swarm-conductor/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── swarm-conductor
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
│   ├── conductor.ts
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


This layout forces proof to exist as files, not vibes.

Internal API structure (contracts you enforce)
Conductor

inputs: high-level prompt, selected agents, options (--mcp, --delegate)

outputs: run folder with plan, step artifacts, index, summary

rule: cannot advance steps without required artifacts

PlanGenerator

job: produce plan via Copilot session, then parse and validate

rule: plan must be schema-valid or run fails immediately

AgentConfig

job: load YAML agent profiles, validate required fields

rule: invalid config is fatal

SessionManager

job: store /share, parse, index, detect unverified claims

rule: “tests passed” without test evidence becomes “unverified”

GitHubMcpIntegrator

job: generate MCP prompts and enforce “evidence included” sections

rule: if --mcp enabled and no evidence is present, step fails verification

Credible testing plan (no AI drift allowed)

This is where you separate yourself from the average submission.

1) Drift trap: claim vs evidence

For every step:

If transcript claims a command ran, it must appear in transcript output or in a copied command block.

If transcript claims tests passed, transcript must show a test command and exit status.

If not, your parser flags it “unverified” and the step is blocked.

2) Parser truth tests

Feed the parser real /share transcripts and ensure it extracts:

PR URLs

test commands

changed file lists

Feed it deceptive transcripts (no test run) and ensure it flags unverified claims.

3) End-to-end run tests

Create one tiny demo prompt like:

“Add a small CLI command that prints run status and write a unit test.”

Then prove:

plan generated

step executed

transcript saved

test ran in CI

If CI does not run, judges have no reason to trust your “verification.md”.

4) Human review checkpoints

At minimum, you personally review:

any command that touches auth tokens, git remotes, or publishing

any security-related step

any step that alters CI workflows

Copilot is helpful. It is not a priest.

Style rules for code, comments, docs (what Copilot must follow)

You said “apply my typical styling rules.” I am not putting code here, but these rules must be embedded into the conductor’s “session starter prompt”:

no em dashes

comments are lowercase, short, and factual

no marketing copy in comments or docs

if unsure, state uncertainty and provide a verification step

no fake performance numbers, no fake claims, no invented flags

any mention of “tests pass” must include the command that ran them

This is how you prevent AI drift before it starts.

What you ship as the final “judge kit”

In the repo root, include a section in README called “Judge quick start” that points to:

one demo run folder under runs/<run-id>/

plan

step transcripts

PR links

CI results

screenshot of dashboard

walkthrough: "Open runs/demo-todo-app/ then follow plan.md then click /share links then see PRs created via /delegate."

Make the demo run a complete tiny app (e.g., CLI tool with tests + workflow) so judges can verify end-to-end in under 5 minutes.

That gives judges a straight line from claim to evidence.