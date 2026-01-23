# Judge Quick-Start Guide

**Estimated time:** <5 minutes  
**Goal:** Verify features and proof artifacts

## Prerequisites

```bash
# Ensure you have Node.js 18+ installed
node --version

# Clone and enter the repository
cd copilot-swarm-conductor
```

## 1. Verify Build & Tests (30 seconds)

```bash
# Clean build
npm run build

# Expected: Zero TypeScript errors

# Run test suite
npm test

# Expected: 213 passing tests in ~100ms
```

**What to verify:**
- Build completes with zero errors
- All 213 tests pass
- No warnings or failures

## 2. Test Copilot-Driven Planning (1 minute)

### Generate Copilot Planning Prompt

```bash
node dist/src/cli.js plan --copilot "Build a REST API for user management"
```

**What to verify:**
- JSON schema template output
- All 6 agent profiles listed
- Clear copy-paste instructions
- Requirements for valid DAG, 4-8 steps

**Note:** This prompt is designed to paste into Copilot CLI.

### Test Intelligent Fallback Planning

```bash
node dist/src/cli.js plan "Build a GraphQL API with authentication"
```

**What to verify:**
- Detects "API" goal type
- Generates realistic 4-step plan
- Assigns appropriate agents (Backend, Security, Tester, Integrator)
- Valid dependency DAG

## 3. Verify Drift Trap System (1 minute)

Run drift detection test:

```bash
npm test -- --grep "should catch lies"
```

**What to verify:**
- Test passes
- Detects claims without evidence
- Marks them as unverified

**Example:** If transcript says "All tests passed" but contains no test command, drift trap flags it.

## 4. Review Proof Artifacts (2 minutes)

### Demo Run

```bash
ls -la runs/demo-todo-api/proof/
```

**Files to check:**
- `01-planning-session-share.md` - Copilot planning transcript
- `02-step-1-backend-share.md` - Execution transcript
- `03-drift-trap-verification.md` - Evidence verification

Open `03-drift-trap-verification.md` to see:
- 10 commands extracted
- 4 claim types verified
- Evidence backing each claim

### Feature Summary

```bash
cat FEATURE-SUMMARY.md
```

**What to verify:**
- Breakdown of all 213 tests
- Feature descriptions
- Test coverage metrics
- Architecture details

## 5. Test Advanced Features (1 minute)

### Goal Type Detection

Try different goal types:

```bash
# API project
node dist/src/cli.js plan "Build REST API"

# Web app project
node dist/src/cli.js plan "Build React dashboard"

# Infrastructure project
node dist/src/cli.js plan "Deploy Kubernetes cluster"
```

### Agent Assignment

```bash
npm test -- --grep "enhanced agent assignment"
```

**What to verify:**
- 18 tests covering 30+ keywords per agent
- Pattern matching for all agent types

## 6. Verify No Placeholders (30 seconds)

Search codebase for placeholder indicators:

```bash
# Search for TODO/FIXME/placeholder comments
grep -r "TODO\|FIXME\|placeholder\|PLACEHOLDER" src/ --exclude-dir=node_modules

# Expected: No results in core functionality
# (May have some in test fixtures - that's OK)
```

```bash
# Check plan generation has no hardcoded examples
grep -A 5 "generateDefaultSteps\|generateIntelligentSteps" src/plan-generator.ts | head -20

# Verify goal type detection and multi-phase generation
```

## Verification Checklist

- [ ] **Build:** `npm run build` succeeds with zero errors
- [ ] **Tests:** `npm test` shows 213/213 passing
- [ ] **Copilot Planning:** `plan --copilot` generates valid prompt with JSON schema
- [ ] **Intelligent Fallback:** `plan` detects goal types and generates plans
- [ ] **Drift Trap:** Tests show claim verification working
- [ ] **Proof Artifacts:** Demo run contains transcripts and verification
- [ ] **Agent Assignment:** Pattern tests pass
- [ ] **Type Safety:** Zero TypeScript errors

## Expected Results

✅ Build and tests pass  
✅ Copilot CLI integration working  
✅ Drift trap verifies claims  
✅ Proof artifacts present  

## Additional Resources

- `FEATURE-SUMMARY.md` - Complete feature breakdown
- `runs/demo-todo-api/proof/` - Example workflow
- `.github/copilot-instructions.md` - Architecture details

---

**Total verification time:** ~5 minutes
