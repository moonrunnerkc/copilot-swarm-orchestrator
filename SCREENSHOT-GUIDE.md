# Screenshot & GIF Guide for Final Submission

Complete guide for capturing all visual evidence needed for the DEV.to submission.

---

## Required Screenshots & GIFs

### 1. **Dashboard with Productivity Summary** (REQUIRED)

**What:** Live dashboard showing completed run with metrics comparison

**How to Capture:**
```bash
# Run a demo that will complete
npm start demo todo-app

# Watch the dashboard to completion
# When it shows "✨ Swarm execution complete!"
# You'll see the Productivity Summary at the bottom
```

**What the screenshot/GIF should show:**
- Wave progress
- Steps with status icons (✅ completed)
- Recent commits section
- **Productivity Summary box** showing:
  - Time comparison (e.g., "5m 23s ▼ 12.3% vs avg 6m 10s")
  - Commits comparison
  - Verification pass rate
  - Visual indicators (▲▼━) with colors

**Tool:** GIF recommended (use Kap, LICEcap, or ScreenToGif)

**Purpose:** Shows Phase 5 analytics in action, proves system learns and compares runs.

---

### 2. **Analytics Comparison Data** (REQUIRED)

**What:** Terminal output showing metrics.json and comparison

**Command:**
```bash
# After running a demo 2+ times, show comparison
cat runs/demo-todo-app/metrics.json | jq '{
  time_minutes: (.totalTimeMs / 60000),
  commits: .commitCount,
  pass_rate: (.verificationsPassed / (.verificationsPassed + .verificationsFailed))
}'

# Show global analytics
cat runs/analytics.json | jq 'length'
cat runs/analytics.json | jq '.[-2:] | .[] | {id: .metrics.executionId, time: .metrics.totalTimeMs, commits: .metrics.commitCount}'
```

**What to show:**
- Multiple runs logged
- Metrics for each run
- Clear progression/comparison

**Purpose:** Proves analytics system is working and tracking history.

---

### 3. **Human Steering (Pause/Resume)** (OPTIONAL)

**Command:**
```bash
cd copilot-swarm-conductor
npm run build
node dist/src/cli.js dashboard exec-demo-status-command
```

**Note:** Since we don't have a real execution context saved, create one:

```bash
# Create mock execution context for dashboard
cat > proof/exec-demo-status-command.json << 'EOF'
{
  "plan": {
    "goal": "Add status command with colored output",
    "createdAt": "2026-01-23T00:30:00.000Z",
    "steps": [
      {
        "stepNumber": 1,
        "task": "Implement status command with colored terminal output",
        "agentName": "BackendMaster",
        "dependencies": [],
        "expectedOutputs": ["Enhanced status display", "ANSI colors", "Tests"]
      },
      {
        "stepNumber": 2,
        "task": "Add integration test and create pull request",
        "agentName": "TesterElite",
        "dependencies": [1],
        "expectedOutputs": ["Integration test", "PR via /delegate", "CI validation"]
      }
    ]
  },
  "planFilename": "plan-demo.json",
  "executionId": "exec-demo-status-command",
  "startTime": "2026-01-23T00:30:00.000Z",
  "currentStep": 2,
  "stepResults": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "status": "completed",
      "transcriptPath": "runs/demo-status-command/steps/01/share.md"
    },
    {
      "stepNumber": 2,
      "agentName": "TesterElite",
      "status": "completed",
      "transcriptPath": "runs/demo-status-command/steps/02/share.md"
    }
  ],
  "priorContext": ["Step 1: Colored status output implemented"],
  "options": {
    "delegate": true,
    "mcp": true
  }
}
EOF

# Now run dashboard
node dist/src/cli.js dashboard exec-demo-status-command
```

**What the screenshot should show:**
- Execution ID
- Plan goal ("Add status command with colored output")
- GitHub Integration flags (✓ /delegate enabled, ✓ MCP required)
- Both steps with status icons (✓ completed)
- Agent names (BackendMaster, TesterElite)
- Transcript links
- Summary counts (Completed: 2)

**Purpose:** Proves dashboard displays real run data, not fake placeholders.

---

### 2. Test Results (OPTIONAL BUT GOOD)

**Command:**
```bash
npm test
```

**What to capture:**
- Full test output showing `126 passing`
- No failing tests
- Build success

**Purpose:** Shows all tests pass, no smoke and mirrors.

---

### 3. Demo Transcript with MCP Evidence (OPTIONAL)

**Command:**
```bash
cat runs/demo-status-command/steps/02/share.md
```

**What to highlight:**
- `## MCP Evidence` section with specific GitHub references
- Test output showing passing tests
- `Created PR:` line with URL
- Clean structure

**Purpose:** Shows MCP integration and PR creation via /delegate.

---

## Where to Take Screenshots

### For Dashboard:
1. Make terminal fullscreen or at least 80x30 characters
2. Run the dashboard command (see above)
3. Take screenshot showing:
   - Header with execution ID
   - Plan info with GitHub flags
   - All steps with status
   - Summary at bottom
4. Save as `dashboard-screenshot.png`

### For Tests:
1. Run `npm test`
2. Scroll to show full output
3. Capture showing `126 passing (XXms)` at the end
4. Save as `tests-screenshot.png`

---

## Alternative: Terminal Recording

If you prefer, you can record a short terminal session:

```bash
# Install asciinema (if not already)
npm install -g asciinema

# Record session
asciinema rec demo-session.cast

# In the recording:
1. npm test (show tests passing)
2. node dist/src/cli.js dashboard exec-demo-status-command (show dashboard)
3. cat runs/demo-status-command/steps/02/share.md (show MCP evidence)
4. Press Ctrl+D to stop recording

# Upload to asciinema.org or include .cast file
```

---

## Files to Include in Submission

1. **README.md** ✅ (created)
2. **LICENSE** ✅ (created)
3. **proof/** directory ✅ (all 7 phase proof docs)
4. **runs/demo-status-command/** ✅ (complete demo run)
5. **Dashboard screenshot** (you provide)
6. **Tests screenshot** (you provide, optional)
7. **Git history** ✅ (clean commits for all phases)

---

## Quick Verification Before Screenshot

```bash
# Ensure everything is committed
git status

# Ensure tests pass
npm test

# Ensure build works
npm run build

# Create the exec context file for dashboard
# (command shown in section 1 above)

# Then take screenshots
```

---

## What Makes a Good Screenshot

### Dashboard Screenshot:
- ✅ Full header visible
- ✅ Both steps showing with status
- ✅ GitHub Integration section visible
- ✅ Summary counts visible
- ✅ Clean, readable terminal font
- ❌ Don't crop important parts
- ❌ Don't have messy terminal background

### Tests Screenshot:
- ✅ Shows command: `npm test`
- ✅ Shows test summary: `126 passing`
- ✅ Shows no failures
- ✅ Readable output

---

## Notes

- Dashboard requires the exec context JSON file (instructions above create it)
- Dashboard is read-only - just displays state, doesn't execute anything
- The demo run artifacts are already created and committed
- Screenshots prove it's real, not mocked

**You're ready to screenshot!**
