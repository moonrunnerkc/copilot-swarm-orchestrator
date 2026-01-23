# Demo Video Recording Guide

Complete checklist for recording the 4-6 minute championship demo video.

---

## Pre-Recording Setup

### 1. Environment Preparation

- [ ] Clean git state: `git status` shows no uncommitted changes
- [ ] Latest build: `npm run build` completes successfully
- [ ] Tests passing: `npm test` shows 358 passing
- [ ] Terminal: Use a clean terminal with good contrast
- [ ] Font size: Increase terminal font for readability (16-18pt recommended)
- [ ] Terminal size: 120x30 or similar (readable but not huge)
- [ ] Close unnecessary applications
- [ ] Disable notifications (macOS: Do Not Disturb, Windows: Focus Assist)

### 2. OBS Studio Setup

Download: https://obsproject.com/

**Recommended Settings:**
- [ ] Canvas Resolution: 1920x1080 (1080p)
- [ ] Output Resolution: 1920x1080
- [ ] FPS: 30 (smooth but not excessive file size)
- [ ] Encoder: x264 (CPU) or NVENC/AMD (GPU if available)
- [ ] Rate Control: CBR
- [ ] Bitrate: 5000-8000 Kbps
- [ ] Audio: 160 Kbps AAC

**Scene Setup:**
- [ ] Add "Display Capture" source (or "Window Capture" for terminal only)
- [ ] Add "Audio Input Capture" for microphone (if doing voiceover)
- [ ] Test audio levels (speak at normal volume, aim for -12dB to -6dB)

### 3. Script Preparation

Print or have open on second monitor:
- [ ] Key talking points (see below)
- [ ] Demo commands sequence
- [ ] Timing targets for each section

---

## Recording Structure (4-6 minutes)

### Section 1: Introduction (30 seconds)

**What to show:**
- [ ] Terminal with copilot-swarm-conductor directory
- [ ] Quick `ls` showing project structure
- [ ] `cat README.md | head -20` showing project name and tagline

**What to say (adapt naturally):**
> "This is Copilot Swarm Orchestrator - a production-ready tool that unlocks true parallel AI workflows using GitHub Copilot CLI custom agents. Unlike typical AI swarms that simulate parallelism, this orchestrator runs actual concurrent Copilot sessions with automatic verification and human-like git commits."

### Section 2: Quick Capabilities Overview (30 seconds)

**What to show:**
- [ ] `cat README.md | grep "###" | head -10` (show capabilities list)
- Or prepared slide/graphic (optional)

**What to say:**
> "It features: true parallel execution via concurrent sessions, dependency-aware orchestration with waves, human-like incremental commits, evidence-based verification to prevent AI drift, safe per-agent branch management, a live terminal dashboard, adaptive replanning when things go wrong, and productivity analytics that learn from every run."

### Section 3: Live Demo - SaaS MVP Scenario (3-4 minutes)

**Part A: Start the Demo (30 seconds)**

**Commands:**
```bash
# Show available demos
npm start demo list

# Start flagship demo
npm start demo saas-mvp
```

**What to say:**
> "Let me demonstrate with our flagship scenario: building a complete SaaS todo app MVP with authentication, Stripe subscription payments, analytics dashboard, security audit, and deployment. This is an open-ended goal - watch how it breaks down into 8 concrete steps across 5 waves of parallel execution."

**Part B: Watch Dashboard (2-3 minutes)**

**What to show:**
- [ ] Live dashboard with wave progress
- [ ] Steps changing status (pending → running → completed)
- [ ] Commit counter increasing
- [ ] Wave transitions
- [ ] Productivity summary at end (if run completes)

**What to say during execution:**
> "Notice the dashboard shows real-time progress. Steps 1 and 3 are running in parallel - backend auth and frontend pages - because they have no dependencies on each other. Each agent is running in its own Copilot CLI session on a dedicated branch."
>
> (As commits appear)
> "See the commit counter? These are real incremental commits happening right now - not a giant squash at the end. Each agent produces natural, human-written commit messages."
>
> (As verification runs)
> "After each step, the system verifies the work - extracting claims from the Copilot transcript and matching them against actual evidence. If tests fail or files are missing, it triggers an automatic rollback and can request replanning."
>
> (If productivity summary shows)
> "And here's the productivity summary - comparing this run's time, commit count, and verification pass rate against the historical average of the last 5 runs. The system learns and adapts."

**Part C: Show Artifacts (30 seconds)**

**Commands** (while demo is running or after completion):
```bash
# Show run directory (open new terminal tab if demo still running)
ls -la runs/demo-saas-mvp/

# Show a verification report
cat runs/demo-saas-mvp/verification/step-1-verification.md | head -30

# Show metrics
cat runs/demo-saas-mvp/metrics.json | jq '{time_minutes: (.totalTimeMs / 60000), commits: .commitCount, pass_rate: (.verificationsPassed / (.verificationsPassed + .verificationsFailed))}'
```

**What to say:**
> "Every run creates a complete audit trail. Here's the verification report for step 1 - you can see every claim the AI made, matched against real evidence from the transcript. This is how we prevent drift and hallucinations. And here are the metrics - total time, commit count, verification success rate - all tracked automatically."

### Section 4: Git History (30 seconds)

**Commands:**
```bash
# Show recent commits
git log --oneline -15

# Or show one detailed commit
git show HEAD~5 --stat
```

**What to say:**
> "Most importantly, look at the git history. These commits weren't generated in one batch - they happened incrementally during execution. Each message is natural and descriptive, reading like a real developer wrote them. This is critical for PR review and collaboration."

### Section 5: Wrap-Up (30 seconds)

**What to show:**
- [ ] Back to README or project root
- [ ] Optional: Show test count `npm test | grep passing`

**What to say:**
> "This isn't a prototype or a proof of concept - it's a production-ready tool with 358 passing tests, full TypeScript strict mode, and complete documentation. It represents a paradigm shift in how we think about AI-assisted development: from single-agent iteration to true parallel orchestration with built-in quality gates and human oversight. Thank you."

---

## Post-Recording Checklist

### 1. Review Recording

- [ ] Watch full video
- [ ] Check audio quality (clear, no distortion)
- [ ] Check video quality (readable terminal text)
- [ ] Verify all key points covered
- [ ] Check timing (4-6 minutes target)

### 2. Edit (Optional)

**Tools:** DaVinci Resolve (free), iMovie, Kdenlive

**Recommended edits:**
- [ ] Trim dead air at start/end
- [ ] Remove long pauses during waiting
- [ ] Add intro title card: "Copilot Swarm Orchestrator - GitHub Copilot CLI Challenge"
- [ ] Add chapter markers or lower thirds (optional)
- [ ] Speed up slow sections (1.5x) if needed to fit time

**Do NOT:**
- ❌ Cut out errors or real failures (shows honesty)
- ❌ Add fake success screens
- ❌ Overdub fabricated results

### 3. Export

**Settings:**
- [ ] Format: MP4 (H.264)
- [ ] Resolution: 1920x1080
- [ ] Frame rate: 30fps
- [ ] Bitrate: 5000-8000 Kbps
- [ ] Audio: AAC 160 Kbps

**File size target:** 100-300 MB for 4-6 minutes

### 4. Upload

**Platforms:**
- [ ] YouTube (unlisted or public)
- [ ] Loom (if you want built-in player)
- [ ] Direct file upload to DEV.to (if small enough)

**Get the embed URL** - you'll need it for the DEV.to post.

---

## Backup Plan (If Demo Fails Mid-Recording)

**Option 1: Keep Recording**
- Continue and show the error
- Demonstrate recovery or rollback
- This shows the system handles failures gracefully (good!)

**Option 2: Pause and Resume**
- Stop recording
- Investigate the issue
- Fix if needed
- Restart demo and recording

**Option 3: Use Recorded Artifacts**
- Show the run directory from a successful prior run
- Walk through the artifacts and explain what happened
- Less impressive but still valid

---

## Tips for Natural Delivery

1. **Don't memorize a script** - Know your key points, speak naturally
2. **Pause for demo actions** - Let the terminal work, don't rush to fill silence
3. **Point out interesting details** - Commits appearing, parallel steps, verification passes
4. **Be honest about limitations** - If something takes time, acknowledge it
5. **Show enthusiasm** - You built this, you're proud of it!

---

## Time Estimates

| Section | Target Time | Can Compress To | Can Expand To |
|---------|-------------|-----------------|---------------|
| Intro | 30s | 20s | 45s |
| Capabilities | 30s | 20s | 45s |
| Demo Start | 30s | 20s | 45s |
| Demo Watch | 2-3min | 1.5min | 4min |
| Artifacts | 30s | 20s | 1min |
| Git History | 30s | 20s | 45s |
| Wrap-Up | 30s | 20s | 45s |
| **TOTAL** | **4-6min** | **3min** | **8min** |

**Target:** 4-6 minutes (sweet spot for judge attention)

---

## Final Checks Before Publishing

- [ ] Video plays correctly
- [ ] Audio is clear and balanced
- [ ] Terminal text is readable
- [ ] All claims are accurate (no exaggerations)
- [ ] Video link/embed code ready for DEV.to post
- [ ] Video includes repository link in description
- [ ] Video has accurate title and tags

---

**You're ready! Take a deep breath, hit record, and show off your work. Good luck! 🎬**
