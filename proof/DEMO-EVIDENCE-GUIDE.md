# Demo Evidence & Audit Trail Guide

This guide explains where to find artifacts and evidence for all demo scenarios in the Copilot Swarm Orchestrator.

---

## Artifact Structure

Every swarm execution creates a complete audit trail under `runs/{execution-id}/`:

```
runs/exec-20260123-123456/
├── plan.json                           # Execution plan with all steps
├── metrics.json                        # Run metrics (time, commits, verifications)
├── analytics-comparison.json           # Comparison vs historical runs (if available)
├── steps/
│   ├── step-1/
│   │   ├── share.md                    # Copilot session transcript
│   │   └── index.json                  # Step metadata
│   ├── step-2/
│   │   └── ...
│   └── ...
├── verification/
│   ├── step-1-verification.md          # Verification report (claims vs evidence)
│   ├── step-2-verification.md
│   └── ...
├── conflicts.json                      # Conflict approvals (if any, Phase 4)
├── steering-log.json                   # Human steering commands (if any, Phase 4)
└── external-commands.log               # External tool executions (Phase 3)
```

---

## Available Demo Scenarios

### 1. **todo-app** (Quick Demo - 5-8 minutes)

**Goal:** Build a todo app with React frontend, Express backend, and basic tests

**Steps:** 4 steps in 2 waves
- Wave 1: Backend (BackendMaster), Frontend (FrontendExpert) - parallel
- Wave 2: Tests (TesterElite), Integration (IntegratorFinalizer)

**Expected Artifacts:**
- `runs/demo-todo-app/plan.json` - 4-step plan
- `runs/demo-todo-app/steps/step-{1-4}/share.md` - Session transcripts
- `runs/demo-todo-app/metrics.json` - ~5-8 min execution time, 10-15 commits

**Run Command:**
```bash
npm start demo todo-app
```

### 2. **api-server** (Medium Demo - 10-15 minutes)

**Goal:** Build a production-ready REST API with auth, PostgreSQL, and Docker deployment

**Steps:** 6 steps in 3 waves
- Wave 1: Backend auth (BackendMaster)
- Wave 2: Database (BackendMaster), Security audit (SecurityAuditor) - parallel
- Wave 3: Tests (TesterElite), Deployment (DevOpsPro) - parallel, then Finalization (IntegratorFinalizer)

**Expected Artifacts:**
- Comprehensive security audit in `verification/step-3-verification.md`
- Docker configs and CI/CD workflows
- Deployment preview metadata (if external tools enabled)

**Run Command:**
```bash
npm start demo api-server
```

### 3. **full-stack** (Large Demo - 15-20 minutes)

**Goal:** Complete full-stack app with auth, tests, security, and deployment

**Steps:** 7 steps in 4 waves

**Expected Artifacts:**
- Full security audit with rate limiting, CORS, CSP
- Comprehensive test coverage (unit, integration, E2E)
- Deployment to Railway/Render with environment configs

**Run Command:**
```bash
npm start demo full-stack
```

### 4. **saas-mvp** (Flagship Demo - 20-30 minutes)

**Goal:** Build and deploy a complete SaaS todo app MVP with auth, Stripe payments, analytics dashboard

**Steps:** 8 steps in 5 waves
- Wave 1: Backend auth (BackendMaster), Frontend (FrontendExpert) - parallel
- Wave 2: Stripe integration (BackendMaster), Analytics dashboard (FrontendExpert) - parallel
- Wave 3: Security audit (SecurityAuditor)
- Wave 4: Tests (TesterElite), Deployment (DevOpsPro) - parallel
- Wave 5: Final integration (IntegratorFinalizer)

**Key Features:**
- Stripe subscription handling (free, pro, enterprise tiers)
- Analytics dashboard with user metrics and charts
- PCI compliance and webhook signature verification
- Full deployment with environment secrets

**Expected Artifacts:**
- Stripe integration code and tests
- Analytics dashboard components
- Security audit with PCI compliance verification
- Deployment with preview URL (if enabled)
- Comprehensive E2E tests (auth → subscribe → todos → analytics)

**Run Command:**
```bash
npm start demo saas-mvp
```

---

## Verifying Demo Artifacts

### 1. Check Plan Was Executed

```bash
cat runs/{execution-id}/plan.json | jq '.goal, .steps | length'
```

Expected: Goal matches demo, step count matches scenario.

### 2. Verify All Steps Completed

```bash
ls runs/{execution-id}/steps/
```

Expected: Directories for all steps (step-1 through step-N).

### 3. Check Metrics

```bash
cat runs/{execution-id}/metrics.json | jq '{time: .totalTimeMs, commits: .commitCount, verifications: {passed: .verificationsPassed, failed: .verificationsFailed}}'
```

Expected:
- Time within expected range for scenario
- Commit count reasonable (2-3 commits per step)
- All verifications passed (failed = 0)

### 4. Review Verification Reports

```bash
cat runs/{execution-id}/verification/step-1-verification.md
```

Expected:
- Claims matched with evidence
- All tests passing (if test step)
- Build successful (if build required)
- Commits present (always required)

### 5. Check for Replanning (if MetaReviewer active)

```bash
cat runs/{execution-id}/replanning-events.json 2>/dev/null || echo "No replanning events"
```

If replanning occurred:
- Reason for replan documented
- Affected steps identified
- New plan generated

### 6. Productivity Comparison (Phase 5)

```bash
cat runs/{execution-id}/analytics-comparison.json 2>/dev/null || echo "First run - no comparison"
```

If not first run:
- Time delta (% faster/slower)
- Commit count difference
- Pass rate improvement

---

## Common Artifact Locations

| Artifact | Location | Purpose |
|----------|----------|---------|
| Execution plan | `runs/{id}/plan.json` | Shows what was supposed to happen |
| Session transcripts | `runs/{id}/steps/step-{N}/share.md` | Proves what actually happened |
| Verification reports | `runs/{id}/verification/step-{N}-verification.md` | Evidence matching and drift detection |
| Metrics | `runs/{id}/metrics.json` | Performance and productivity data |
| Global analytics | `runs/analytics.json` | Historical run comparisons |
| User profile | `config/user-profile.json` | Learned preferences (Phase 5) |
| Conflicts | `runs/{id}/conflicts.json` | Human approvals (Phase 4) |
| Steering log | `runs/{id}/steering-log.json` | Human commands (Phase 4) |
| External commands | `runs/{id}/external-commands.log` | Tool executions (Phase 3) |

---

## Evidence for Judges

### Proof of Real Copilot CLI Usage

**Location:** `runs/{execution-id}/steps/step-{N}/share.md`

**What to look for:**
- Copilot CLI markers: `## Session Information`, `## Commands`, `## Changes`
- Real git commit SHAs
- Real file paths in the repo
- Real command outputs (npm, git, etc.)

**Not present:**
- Mock data
- Simulated outputs
- Hardcoded responses

### Proof of Parallel Execution

**Location:** `runs/{execution-id}/plan.json` + step timestamps in `metrics.json`

**What to look for:**
- Steps in same wave have no dependencies on each other
- Start times overlap (prove concurrent execution)
- Wave structure documented in plan

### Proof of Human-Like Commits

**Location:** Git log in repo after demo

```bash
git log --oneline -20
```

**What to look for:**
- Multiple commits per step (not one giant commit)
- Varied commit messages (not templated)
- Imperative mood, descriptive, or conventional commits style
- Natural progression (setup → implementation → tests → docs)

### Proof of Drift Prevention

**Location:** `runs/{execution-id}/verification/step-{N}-verification.md`

**What to look for:**
- Claims extracted from transcript
- Evidence matched for each claim
- Verification passed/failed status
- Rollback triggered on failure (if applicable)

---

## Troubleshooting Demo Artifacts

### Missing artifacts?

**Likely cause:** Demo didn't complete successfully.

**Check:**
```bash
tail -50 runs/{execution-id}/steps/step-{N}/share.md
```

Look for errors or incomplete sessions.

### Metrics missing?

**Likely cause:** Run predates Phase 5.

**Solution:** Re-run demo with latest code.

### Analytics comparison missing?

**Expected:** First run has no comparison (no history).

**Solution:** Run demo multiple times to build history.

---

## Next Steps

1. Run a demo scenario
2. Examine artifacts in `runs/{execution-id}/`
3. Verify evidence completeness
4. Compare metrics across runs
5. Review verification reports for drift detection

For submission, capture screenshots of:
- Dashboard during execution
- Productivity summary at end
- Verification report (proof of drift prevention)
- Analytics comparison (if available)
