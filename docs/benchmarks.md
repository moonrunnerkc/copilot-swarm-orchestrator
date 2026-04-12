# Swarm Orchestrator vs Standalone Agents: Benchmark Results

**Date:** April 9, 2026
**Author:** Bradley R. Kinnard

## What This Document Measures

The orchestrator injects quality requirements (security headers, input validation, accessibility, CI pipelines, configuration management) into every agent prompt before execution begins. Standalone agents receive only the goal prompt with no additional requirements. This document compares the outputs.

This is not a comparison of base model capability. It is a comparison of system-level output: what you get from the orchestrator's full pipeline (requirement injection, multi-agent execution, quality gates, automated repair) versus what you get from a single prompt to a standalone agent CLI.

The standalone agents were not asked for security headers, dark mode, accessibility, or CI pipelines. They were asked to build a specific feature. The orchestrator asked its agents for all of that automatically. Every attribute comparison below should be read with that context.

---

## Benchmark 1: PromptVault REST API (FastAPI + Python)

**Goal prompt (identical for both):**
> Add a /api/health endpoint to the FastAPI app that returns JSON with server uptime, database connectivity status, and current UTC timestamp. Include a test file with pytest tests covering the happy path and database-unavailable error case.

**Target:** FastAPI + HTMX + SQLite, 2940 pre-existing files
**Baseline commit:** `8eaf69d`
**Agents compared:** Swarm Orchestrator (5 agents, claude-sonnet-4) vs Copilot CLI (single agent, same model)

### Execution

| Metric | Orchestrator | Copilot CLI |
|--------|-------------|-------------|
| Time | 22 min 11 sec | 3 min 6 sec |
| Premium requests | 7 | 1 |
| Files created/modified | 27 | 3 |
| Net lines of code | +841 | ~85 |
| Tests | 46 (518 lines, 5 files) | 2 (39 lines, 1 file) |
| Tests passing | 46/46 | 2/2 |
| Commits | 12 | 0 (uncommitted) |

### Goal Completion

Both systems delivered the stated goal. Both produced a working `/api/health` endpoint with uptime, database status, UTC timestamp, and pytest coverage for happy path and DB-unavailable cases.

Implementation differences in the health endpoint itself:

The orchestrator returns HTTP 503 when the database is unreachable. Copilot returns 200 with `"status": "degraded"`. This matters operationally: Kubernetes liveness probes, AWS ALB health checks, and monitoring systems interpret 200 as healthy and continue routing traffic to instances that can't reach their database. 503 is the correct status for a degraded service.

The orchestrator uses `time.monotonic()` for uptime (immune to NTP clock adjustments). Copilot uses `time.time()` (affected by clock changes, can report negative uptime after a time sync).

The orchestrator uses `datetime.now(timezone.utc)`. Copilot uses `datetime.utcnow()`, which is deprecated since Python 3.12.

### Correctness Issues in Copilot Output

These are bugs or antipatterns in what Copilot actually wrote, not things it failed to add:

**XSS in HTML templates.** Copilot's existing threat routes render user-controlled satellite names as raw HTML:
```python
html += f"<div style='color:{color}'><strong>{t.risk}</strong>: {t.sat1} vs {t.sat2}"
```
No escaping. The orchestrator's SecurityAuditor agent added `markupsafe.escape()` across all 4 HTML rendering blocks.

**Exception leakage.** Three locations return `str(e)` directly to clients:
```python
except Exception as e:
    return {"status": "error", "detail": str(e)}
```
In production, this reveals database paths, connection strings, and stack context.

**No input validation.** Threat routes accept `dict = Body(...)` with no type checking, length limits, or field validation. Missing keys produce unhandled `KeyError` (500).

### Additional Output from Orchestrator

The orchestrator's multi-agent pipeline produced these beyond the stated goal:

| Deliverable | Details |
|-------------|---------|
| Security hardening | SecurityHeadersMiddleware (CSP, X-Content-Type-Options, X-Frame-Options, XSS-Protection, Referrer-Policy), CORS from env vars, HTML escaping |
| Input validation | Pydantic schemas with field validators, regex patterns, range checks |
| Configuration management | Centralized config.py, all env-dependent values from environment variables, .env.example |
| Extended test suite | 44 additional tests across crypto, DB utils, API routes, live HTTP integration |
| Infrastructure | Production Dockerfile (tini, non-root, layer caching), CI pipeline (lint + test + Docker build + smoke test), .dockerignore, .gitignore |
| Documentation | README with endpoint docs and env var reference |

Total output: 27 files changed, +1,027/-186 lines.

### Empirically Validated Reprompt Cost

This is the only benchmark where the cost to bring the standalone agent to parity was tested with real iterative prompting, not estimated.

Predicted follow-up prompts to reach parity: 13-15. Actual: 14. Each gap was addressed with a targeted prompt, and iteration failures (tests breaking after refactors, missed HTML escaping locations) added 2 additional fix prompts.

| | Orchestrator | Copilot CLI (to parity) |
|--|-------------|------------------------|
| Premium requests | 7 | 15 (1 initial + 14 follow-up) |
| Wall clock time | 22 min (unattended) | ~45 min (human-supervised) |

---

## Benchmark 2: Markdown Note-Taking App (Vanilla HTML/CSS/JS)

**Goal:** Browser-based markdown editor with live preview, note sidebar (CRUD), persistence, word/character count.
**Agents compared:** Copilot CLI vs Orchestrator

### Goal Completion

Both delivered all requested features: editor panel, preview panel, note sidebar with create/select/rename/delete, localStorage persistence, and live word/character count.

### Notable Implementation Differences

**Markdown rendering.** Copilot pulled in marked.js from a CDN with no integrity hash and no fallback. The orchestrator built an 80-line pure-function renderer handling headings, paragraphs, bold, italic, strikethrough, links, images, inline code, fenced code blocks, blockquotes, ordered/unordered lists, horizontal rules, and HTML escaping. Zero runtime dependencies.

**Responsive layout.** Copilot's three-panel layout has no breakpoint handling; on mobile, the sidebar, editor, and preview compete for viewport width. The orchestrator has a sidebar toggle at 767px, slide-off-screen transform, vertical stacking of editor/preview, and a second breakpoint at 479px.

**Tests.** Copilot: zero. Orchestrator: 60+ across 5 files covering note CRUD, markdown rendering, storage round-trip, corruption handling, and app integration.

**Module structure.** Copilot: single file with bare globals. Orchestrator: 5 modules (notes, markdown, storage, audio, app) with pure logic testable without DOM.

### Attribute Comparison

30 criteria evaluated across both outputs. Copilot delivered 3/30. Orchestrator delivered 30/30. The gap is almost entirely in attributes the orchestrator injects as requirements (accessibility, responsive design, dark mode, tests, module separation) that Copilot was never asked for.

---

## Benchmark 3: Tic-Tac-Toe (Vanilla HTML/CSS/JS)

**Goal:** 3x3 grid, alternating X/O, win detection, reset button.
**Agents compared:** Claude Code vs Orchestrator

### Goal Completion

Both delivered all requested features.

### Where Claude Code Won

Claude Code produced a `createGame()` factory pattern with clean dependency injection, which the orchestrator did not. Tests can pass mock dependencies without touching global state. This is a better architecture choice for testability.

### Where the Orchestrator Won

Accessibility (skip link, aria-live on game status, positional aria-labels, keyboard navigation, focus-visible styles), CSS architecture (20+ custom properties, full dark mode, prefers-reduced-motion), responsive layout (clamp(), dvh units), and test depth (19 vs 11 tests).

### Attribute Comparison

24 criteria. Claude Code: 5/24. Orchestrator: 23/24. Claude Code scored on all features, logic/DOM separation, factory pattern, tests, and semantic buttons. The orchestrator missed Claude Code's factory/DI pattern.

---

## Benchmark 4: Calculator App (Vanilla HTML/CSS/JS)

**Goal:** Calculator with digits, operators, chained operations, keyboard input, history panel.
**Agents compared:** Codex vs Orchestrator

### Goal Completion

Both delivered all requested features.

### Where Codex Won

**Operator precedence.** Codex built a tokenizer that handles multiplication/division before addition/subtraction. The orchestrator chains left-to-right, so `2 + 3 * 4` gives 20, not 14. This is a functional correctness gap.

**Visual design.** Radial gradients, backdrop blur, inset shadows, Google Fonts. More striking first impression.

### Where the Orchestrator Won

**Architecture.** Codex: single file with bare globals and imperative mutations. Orchestrator: pure state machine (calculator.js) where every function takes state in and returns new state out, separated from DOM. 13 tests on the state machine alone.

**Accessibility.** Codex had 2 aria-label attributes. Orchestrator has descriptive labels on every button, aria-live on display and history, `<output>` element semantically linked to keypad, contextual screen reader feedback ("Cannot divide by zero.", "Operator changed to *.").

### Attribute Comparison

34 criteria. Codex: 6/34. Orchestrator: 32/34. The orchestrator missed operator precedence and Codex's visual polish.

---

## Benchmark 5: REST API Backend for Ledger Calculator (Node.js)

**Goal:** Express API with health, CRUD for calculations, JSON file storage, input validation, error handling, CORS, tests.
**Agents compared:** Claude Code vs Orchestrator

### Goal Completion

Both delivered all 5 endpoints, working correctly.

### Where Claude Code Won

**Factory pattern.** `createApp(store)` and `createStore(path)` with clean dependency injection. Tests can pass mock store without filesystem setup. The orchestrator used module-level exports with env var configuration.

**Route separation.** Claude Code split routes into `routes/calculations.js`. The orchestrator kept routes inline in server.js.

### Where the Orchestrator Won

**Security.** Claude Code: no security headers, no body size limit, no ID sanitization, error messages could leak internals. Orchestrator: 5 security headers via middleware, 10KB body limit, ID regex validation, generic error responses with SECURITY.md documenting findings.

**Input validation depth.** Orchestrator added max length enforcement (500/100 chars), character pattern regex, explicit non-string type rejection with test coverage for each.

**Tests.** 37 vs 10. Orchestrator has dedicated store unit tests (11), security header tests (6), and edge cases (whitespace trimming, max length rejection, empty-after-trim, non-string input, response shape verification, content-type headers, delete-all on empty store).

**Documentation.** Claude Code's README still said "There is no backend service." Orchestrator replaced it with full API reference, env var docs, Dockerfile, and docker-compose.yml.

### Attribute Comparison

36 criteria. Claude Code: 12/36. Orchestrator: 34/36. The orchestrator missed Claude Code's factory/DI pattern and route directory structure.

---

## Benchmark 6: REST API Backend for Markdown Notes (Node.js)

**Goal:** Express API with CRUD for notes, JSON file storage, input validation, error handling, CORS, tests.
**Agents compared:** Copilot CLI vs Orchestrator

### Goal Completion

Copilot delivered 4 of 5 endpoints (missing DELETE-all). Orchestrator delivered all 5 plus bonus endpoints.

### Attribute Comparison

44 criteria. Copilot CLI: 13/44. Orchestrator: 41/44. The gap follows the same pattern: security (no headers, no body limit, error leakage), test depth (16 vs 57 tests), configuration (hardcoded values), and documentation (no README).

**Shared weakness:** Both implementations use synchronous file I/O, blocking the event loop under concurrent load.

---

## Benchmark 7: REST API Backend for Vanilla Calculator (Node.js)

**Goal:** Express API with CRUD for calculation history, stats endpoint, JSON file storage, validation, error handling, CORS, tests.
**Agents compared:** Codex vs Orchestrator

### Goal Completion

Both delivered all endpoints including the stats aggregation.

### Where Codex Stood Out

This is Codex's strongest showing across all benchmarks. It produced a factory pattern, async file I/O (fs/promises), a custom error class, sorted output, array validation on JSON parse, and `!isFinite` checks. These are patterns Copilot CLI and Claude Code didn't produce unprompted.

### Attribute Comparison

48 criteria. Codex: 14/48. Orchestrator: 46/48. Despite Codex's strongest baseline, the gap in security, test coverage (10 test files / 812 lines vs 1 file / 285 lines), configuration, and documentation remains wide.

---

## Benchmark 8: CLI Tool, Logwatch (Node.js)

**Goal:** Tail a log file in real time, filter by severity, JSON mode with pretty-printing, stats on exit, error handling, tests.
**Agents compared:** Claude Code vs Orchestrator

### Goal Completion

Both delivered all requested features.

### Where Claude Code Won

This is the closest comparison across all benchmarks, and Claude Code produced the more technically robust core implementation.

**Async tail.** Claude Code uses `fs/promises` with `fd.read` and `fd.stat` throughout. The orchestrator uses sync `readFileSync`/`fstatSync` inside a poll loop, blocking the event loop. For a continuously running tool, async is the correct approach.

**File truncation handling.** Claude Code detects when file size shrinks (log rotation) and resets position. The orchestrator doesn't handle truncation.

**Richer JSON field normalization.** Claude Code recognizes `lvl`, `log_level`, `WARNING` to `warn`, `err` to `error`. The orchestrator only checks `level` and `severity`.

**Word-boundary level detection.** Claude Code uses regex matching at word boundaries, avoiding false positives where "info" appears inside "information." The orchestrator uses `includes()`, which matches incorrectly.

**End-to-end CLI tests.** 5 tests spawning the actual binary as a child process, verifying exit codes, stdout, stderr, and signal handling. The orchestrator has zero CLI-level integration tests.

### Where the Orchestrator Won

Module separation (5 focused modules vs single 368-line file), project scaffolding (README, CI, .gitignore, .dockerignore, author/license in package.json), short flag aliases, non-object JSON detection, and typed value colorization.

### Attribute Comparison

50 criteria. Claude Code: 30/50. Orchestrator: 35/50. The narrowest gap of any benchmark. For a CLI tool that someone would actually use to tail production logs, Claude Code's version handles more real-world scenarios correctly. The orchestrator's advantages in scaffolding, accessibility, and security hardening matter less for a CLI tool than for a web application.

---

## Cross-Benchmark Patterns

### What the Orchestrator Consistently Adds

Across all 8 benchmarks, the orchestrator's requirement injection and quality gates produce the same categories of additional output:

**Security** (present in 7/7 web benchmarks): headers middleware, HTML escaping, input validation schemas, body size limits, error message sanitization, CORS configuration, ID parameter validation.

**Tests** (all 8): 2-10x more tests than standalone agents. Dedicated unit suites for individual modules, edge case coverage, boundary value testing.

**Configuration** (7/8): environment variable externalization, config modules, .env.example documentation.

**Infrastructure** (7/8): Dockerfiles, CI pipelines, .gitignore, .dockerignore, package.json metadata.

**Accessibility** (4/4 frontend benchmarks): ARIA labels, keyboard navigation, focus-visible styles, skip links, prefers-reduced-motion, prefers-color-scheme.

### Where Standalone Agents Won

**Architecture decisions.** Claude Code's factory/DI pattern appeared in 3 benchmarks. Codex produced operator precedence, async I/O, and rich field normalization. These are engineering judgment calls that the orchestrator's requirement injection doesn't target.

**Implementation correctness on edge cases.** Claude Code's Logwatch benchmark showed stronger handling of file rotation, word-boundary matching, and async I/O. The orchestrator's agents are the same underlying models; the quality gates don't catch every implementation subtlety.

**Speed.** Standalone agents consistently finish in 2-4 minutes. The orchestrator takes 15-25 minutes due to multi-agent coordination, parallel verification, and quality gate remediation.

### The Honest Tradeoff

The orchestrator turns a 3-minute, 1-request task into a 22-minute, 7-request task. What you get for that cost is a production-complete output: security hardening, comprehensive tests, configuration management, CI, documentation, and accessibility that would otherwise require the user to know to ask for each of those things and then verify the results manually.

If you know exactly what to ask for and have time to iterate, a skilled user can close much of the gap with follow-up prompts. The empirically validated test on the PromptVault benchmark showed 14 follow-up prompts to reach parity, compared to the orchestrator's 7 total requests.

If you don't know what to ask for, or don't want to supervise 14 rounds of iteration, the orchestrator automates that knowledge. That's the product.

### Attribute Score Summary

| Benchmark | Standalone Agent | Agent Score | Orchestrator Score | Criteria Count |
|-----------|-----------------|-------------|-------------------|----------------|
| Markdown Notes App | Copilot CLI | 3/30 | 30/30 | 30 |
| Tic-Tac-Toe | Claude Code | 5/24 | 23/24 | 24 |
| Calculator | Codex | 6/34 | 32/34 | 34 |
| Ledger Calculator API | Claude Code | 12/36 | 34/36 | 36 |
| Markdown Notes API | Copilot CLI | 13/44 | 41/44 | 44 |
| Vanilla Calculator API | Codex | 14/48 | 46/48 | 48 |
| PromptVault API | Copilot CLI | 7/8 (goal) | 8/8 (goal) | 8 (goal only) |
| Logwatch CLI | Claude Code | 30/50 | 35/50 | 50 |

These scores reflect total attribute coverage, not quality of implementation. A standalone agent scoring 12/36 means it delivered 12 of 36 evaluated attributes, not that its code quality is 33%. Most of the missing attributes are things the agent was never asked for.

---

## Methodology Notes

**Scoring.** The attribute comparisons evaluate presence of specific, verifiable deliverables (does the output have security headers? does it have tests? are IDs validated?). Each criterion is binary: delivered or not. There are no weighted composite scores; those obscure more than they reveal when the two systems received different instructions.

**Evaluator.** All benchmarks were conducted and evaluated by the orchestrator's author. Grok (xAI) assisted with attribute verification on the PromptVault benchmark. The evaluator had full access to both codebases for line-by-line inspection.

**Non-determinism.** The underlying agents are non-deterministic. Exact test counts, file counts, and implementation details vary between runs. The attribute categories (security, tests, config, CI, accessibility) are reliably present due to requirement injection, but specific values can differ.

**Reprompt estimates.** Per-benchmark projections of follow-up prompt counts appear only where empirically validated (Benchmark 1, PromptVault: predicted 13-15, actual 14). Unvalidated projections from earlier versions of this document have been removed.