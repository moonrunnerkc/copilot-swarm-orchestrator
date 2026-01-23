# Phase 5 Proof: Session Capture and Share Indexing

**Date:** 2026-01-23  
**Repository:** moonrunnerkc/copilot-swarm-conductor  
**Phase:** 5 - session capture, share parsing, and drift trap

## Overview

Phase 5 implements the critical "drift trap" mechanism that prevents AI hallucination by parsing `/share` transcripts and verifying claims against actual evidence.

**The Core Problem This Solves:**  
AI agents often claim "all tests passed" without actually running tests. This phase catches those lies.

## Components Implemented

### 1. ShareParser (`src/share-parser.ts`)

Extracts and verifies key facts from `/share` transcripts:

**Extracts:**
- Changed files (from git status, explicit mentions)
- Commands executed (with $ prompt or in code blocks)
- Test runs (npm test, jest, pytest, go test, etc.)
- PR links (GitHub URLs and #N references)
- Claims (test passed, build succeeded, deployment, etc.)

**Verifies:**
- Tests actually ran (looks for test output patterns)
- Builds actually executed (looks for build commands)
- Deployments actually happened (looks for deploy commands)

**Critical Feature - The Drift Trap:**
```typescript
// if transcript claims "tests passed"
// but has no test output
// mark as UNVERIFIED
{
  claim: "All tests passed",
  verified: false,
  evidence: "no test execution found in transcript"
}
```

### 2. SessionManager (`src/session-manager.ts`)

Manages run directory structure and context handoff:

**Directory Structure:**
```
runs/
└── <run-id>/
    ├── context.json          # cumulative context
    ├── steps/
    │   ├── 01/
    │   │   ├── share.md      # /share transcript
    │   │   ├── index.json    # parsed facts
    │   │   ├── summary.md    # optional summary
    │   │   └── verification.md  # optional verification notes
    │   └── 02/
    │       └── ...
    └── ...
```

**Core Methods:**
- `createRun()` - initialize run directory
- `importShare()` - parse and store /share transcript
- `getPriorContext()` - get context from previous steps
- `generateContextSummary()` - create text summary for next step
- `getUnverifiedClaims()` - find all unverified claims across run

### 3. CLI Commands

**Import Share:**
```bash
swarm-conductor share import <runid> <step> <agent> <path-to-share.md>
```

Parses transcript and displays:
- Changed files
- Commands executed
- Tests run (with verification status)
- PR links
- Claims with evidence/warnings

**Show Context:**
```bash
swarm-conductor share context <runid> <step>
```

Displays context from all prior steps for the current step.

## Test Results

**106 tests passing** (39 new tests for Phase 5):

```
ShareParser
  extractChangedFiles
    ✔ should extract files from git status output
    ✔ should extract files from explicit mentions
  extractCommands
    ✔ should extract commands with $ prompt
    ✔ should extract commands from code blocks
  extractTestRuns - DRIFT TRAP
    ✔ should verify test command with output
    ✔ should mark test as unverified without output
    ✔ should detect jest test output
    ✔ should detect pytest output
    ✔ should detect go test output
  extractPRLinks
    ✔ should extract GitHub PR URLs
    ✔ should extract PR number references
  extractClaims - CRITICAL DRIFT PREVENTION
    ✔ should verify "tests passed" claim with evidence
    ✔ should reject "tests passed" claim without evidence
    ✔ should verify build claims with evidence
    ✔ should reject build claims without evidence
    ✔ should catch multiple unverified claims
  negative tests - AI lying detection
    ✔ should flag "tests pass" without any test command
    ✔ should flag test command without output as unverified
    ✔ should flag generic success claims without commands

SessionManager
  createRun
    ✔ should create run directory structure
    ✔ should throw error if run already exists
  createStepDir
    ✔ should create step directory with padded number
  importShare
    ✔ should import and parse share transcript from file
    ✔ should import inline content
    ✔ should save index to step directory
    ✔ should update run context
  getPriorContext
    ✔ should return empty array for first step
    ✔ should return previous step for step 2
    ✔ should return all previous steps in order
  generateContextSummary
    ✔ should return "no prior context" for first step
    ✔ should include changed files from prior steps
    ✔ should include verified tests from prior steps
    ✔ should warn about unverified claims
  getUnverifiedClaims
    ✔ should return empty array when all claims verified
    ✔ should return unverified claims across steps

106 passing (55ms)
```

## Drift Trap Examples

### Example 1: Unverified Test Claim

**Transcript:**
```
I made the changes to the API.
All tests are passing.
Everything looks good.
```

**Parser Output:**
```
⚠ WARNING: 1 unverified claims detected

Claims Verification:
  ⚠ All tests are passing.
    evidence: no test execution found in transcript
```

### Example 2: Test Command Without Output

**Transcript:**
```
$ npm test

Tests passed!
```

**Parser Output:**
```
Tests Run:
  ✗ npm test
    reason: no test output found in transcript

Claims Verification:
  ⚠ Tests passed!
    evidence: no test execution found in transcript
```

### Example 3: Verified Test Run

**Transcript:**
```
$ npm test

  ConfigLoader
    ✔ should load agents

  14 passing (10ms)

All tests passed.
```

**Parser Output:**
```
Tests Run:
  ✓ npm test

Claims Verification:
  ✓ All tests passed.
    evidence: verified test command: npm test
```

## Prior Context Handoff

When a later step imports its `/share`, it can see what earlier steps accomplished:

**Step 1 completes:**
```bash
swarm-conductor share import run-001 1 BackendMaster step1-share.md
```

Index saved:
```json
{
  "changedFiles": ["src/api.ts", "src/db.ts"],
  "testsRun": [{
    "command": "npm test",
    "verified": true
  }],
  "prLinks": ["https://github.com/owner/repo/pull/42"]
}
```

**Step 2 asks for context:**
```bash
swarm-conductor share context run-001 2
```

Output:
```
context from prior steps:

step 1 (BackendMaster):
  changed files: src/api.ts, src/db.ts
  tests verified: npm test
  PRs created: https://github.com/owner/repo/pull/42
```

This ensures Step 2 knows what Step 1 did.

## Negative Test Cases

### Catching the Classic Lie

**Test:** "should flag 'tests pass' without any test command"

```typescript
const transcript = 'I made the changes. All tests are passing.';
const index = parser.parse(transcript);

// should have zero verified test runs
assert.strictEqual(index.testsRun.length, 0);

// should have unverified claim
const claim = index.claims.find(c => c.claim.includes('tests are passing'));
assert.strictEqual(claim?.verified, false);
```

This test **proves** the drift trap works.

## Why This Matters

Without this phase, agents could claim:
- "All tests passed" (no tests run)
- "Build succeeded" (no build run)
- "Deployed to production" (no deployment)

With this phase:
- Every claim requires evidence
- Missing evidence = unverified warning
- Judges can see verification status

This is **not optional**. This is what prevents the tool from being "vibes-based."

## Proof Gates Met

✅ **ShareParser implemented** - Extracts facts from transcripts  
✅ **SessionManager implemented** - Manages runs and context  
✅ **CLI import command** - Parse and index /share transcripts  
✅ **CLI context command** - Show prior step summaries  
✅ **39 new tests** (106 total) - Including negative tests  
✅ **Drift trap proven** - Catches unverified test claims  
✅ **Prior context handoff** - Later steps see earlier work  

## Files Created

- `src/share-parser.ts` (7,785 bytes) - Transcript parser with verification
- `src/session-manager.ts` (6,976 bytes) - Run and context manager
- `test/share-parser.test.ts` (8,923 bytes) - Parser tests with drift traps
- `test/session-manager.test.ts` (8,491 bytes) - Manager tests
- Updated `src/cli.ts` - Added share import and context commands

## Evidence for Judges

**Drift trap test:**
```typescript
it('should flag "tests pass" without any test command', () => {
  const transcript = 'All tests are passing.';
  const index = parser.parse(transcript);
  
  assert.strictEqual(index.testsRun.length, 0);
  const claim = index.claims.find(c => c.claim.includes('tests are passing'));
  assert.strictEqual(claim?.verified, false);
});
```

**Test output:**
```
✔ should flag "tests pass" without any test command
✔ should flag test command without output as unverified
✔ should reject "tests passed" claim without evidence
```

## Critical Insight

This phase is the difference between:
- ❌ "Copilot said tests passed" (unverifiable)
- ✅ "Transcript shows `npm test` ran with `14 passing` output" (verified)

Every claim now has evidence or a warning. No more "trust me."

---

**Phase 5 Complete** ✅  
Next: Phase 6 - GitHub integration with /delegate and MCP
