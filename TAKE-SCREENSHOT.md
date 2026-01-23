# 📸 SCREENSHOT INSTRUCTIONS

## What You Need to Screenshot

### 1. DASHBOARD (REQUIRED)

Run this command in your terminal:

```bash
cd ~/copilot-swarm-conductor
npm run build
node dist/src/cli.js dashboard exec-demo-status-command
```

**Screenshot should capture:**
- The full dashboard output
- Shows "Execution ID: exec-demo-status-command"
- Shows "GitHub Integration: ✓ /delegate enabled, ✓ MCP required"
- Shows both steps with ✓ completed status
- Shows agents (BackendMaster, TesterElite)
- Shows transcript links
- Shows "Completed: 2" in summary

**Save as:** `dashboard.png` or `dashboard.jpg`

---

### 2. TEST RESULTS (OPTIONAL - NICE TO HAVE)

Run this command:

```bash
npm test
```

**Screenshot should show:**
- Command output showing `126 passing`
- No failures
- Clean test run

**Save as:** `tests.png` or `tests.jpg`

---

## How to Take Good Screenshots

1. **Use a clean terminal**
   - Dark background preferred
   - Readable font (14pt+ recommended)
   - Full width (at least 80 characters)

2. **Capture the full output**
   - Don't crop important parts
   - Include command and output
   - Make sure text is readable

3. **Tools to use:**
   - macOS: Cmd+Shift+4 (select area)
   - Linux: Screenshot tool or `gnome-screenshot`
   - Windows: Snipping Tool or Win+Shift+S

---

## Where to Add Screenshots

After taking screenshots, you can:

1. **Add to proof/ directory** (if committing)
2. **Include in DEV post** when publishing
3. **Add to GitHub wiki** or README

---

## Quick Test Before Screenshot

Make sure everything works:

```bash
# Test that tests pass
npm test

# Test that dashboard works
node dist/src/cli.js dashboard exec-demo-status-command

# If dashboard shows the demo run, you're ready!
```

---

## Example: What Dashboard Should Look Like

```
══════════════════════════════════════════════════════════════════════
  Copilot Swarm Conductor - Execution Dashboard
══════════════════════════════════════════════════════════════════════
  Execution ID: exec-demo-status-command
──────────────────────────────────────────────────────────────────────

  Plan: Add status command with colored output
  Total Steps: 2
  Started: 1/22/2026, 5:30:00 PM

  GitHub Integration:
    ✓ /delegate enabled
    ✓ MCP evidence required

  Execution Steps:
  ────────────────────────────────────────────────────────────────────

  ✓ Step 1: Implement status command with colored terminal output
     Agent: BackendMaster
     📄 Transcript: runs/demo-status-command/steps/01/share.md

  ✓ Step 2: Add integration test and create pull request
     Agent: TesterElite
     Depends on: Steps 1
     📄 Transcript: runs/demo-status-command/steps/02/share.md

  ────────────────────────────────────────────────────────────────────

  Summary:
    ✓ Completed: 2
    ▶ Running: 0
    ○ Pending: 0

  ════════════════════════════════════════════════════════════════════
  Press Ctrl+C to exit
  ════════════════════════════════════════════════════════════════════
```

If your terminal shows this (with colors), you're good!

---

## That's It!

Just run the dashboard command and take a screenshot. The project is complete and ready for submission.
