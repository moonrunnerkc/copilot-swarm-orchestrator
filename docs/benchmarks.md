# Quality Benchmarks

The orchestrator's prompt injection and quality gates front-load requirements that developers normally discover through iterative reprompting. The same goal run through the orchestrator produces output that would take 30-40 follow-up prompts to reach with a standalone agent.

Six head-to-head comparisons below. All used the same orchestrator configuration with default quality gates.

## Benchmark 1: Copilot CLI, Markdown Note-Taking App

**Goal:** _"Create a browser-based markdown note-taking app with vanilla HTML, CSS, and JavaScript. Features: a text editor panel on the left, a live rendered preview panel on the right, a note list sidebar that lets users create, select, rename, and delete notes. Notes should persist across page reloads. Include a word count and character count display that updates as the user types."_

### Attribute comparison (30 criteria)

| Attribute | Copilot CLI | Orchestrator |
|-----------|:-----------:|:------------:|
| All requested features (editor, preview, sidebar, CRUD, persistence, word/char count) | Yes | Yes |
| Custom markdown renderer (no CDN dependency) | No (uses marked.js CDN) | Yes (80-line pure function with HTML escaping) |
| Module separation | No (single file, bare globals) | Yes (5 modules: notes, markdown, storage, audio, app) |
| Pure logic testable without DOM | No | Yes (notes.js, markdown.js, storage.js all pure) |
| Tests | None | 60+ across 5 test files |
| Zero runtime dependencies | No (marked.js CDN) | Yes |
| IIFE/module encapsulation | No (bare globals) | Yes (IIFE inside ES module) |
| `type="module"` on script | No | Yes |
| Skip link | No | Yes |
| `aria-label` on interactive elements | No | Yes (sidebar, note list, editor, preview, buttons, delete per-note, rename input) |
| `aria-live` / `role="status"` on stats | No | Yes |
| `aria-pressed` on note selection | No | Yes |
| `aria-expanded` / `aria-controls` on sidebar toggle | No | Yes |
| `aria-hidden` on decorative elements | No | Yes |
| `:focus-visible` on all interactive elements | No | Yes (buttons, note titles, delete buttons, links in preview) |
| Keyboard navigation (note titles are `<button>`) | No (list items with click handlers) | Yes |
| `prefers-reduced-motion` | No | Yes (sets duration vars to 0s, kills all animations) |
| `prefers-color-scheme` dark mode | No (dark only) | Yes (light default, full dark override via variables) |
| CSS custom properties | Yes (colors, spacing, radii) | Yes (colors, spacing, typography, layout, motion durations) |
| Responsive layout | No (fixed sidebar, three panels squeeze) | Yes (sidebar slides off-screen on mobile, editor/preview stack vertically, two breakpoints at 767px and 479px) |
| Mobile sidebar toggle button | No | Yes (hamburger with `aria-expanded`, click-outside-to-close) |
| `<meta name="description">` | No | Yes |
| `<meta name="theme-color">` | No | Yes (light + dark variants) |
| Inline SVG favicon | No | Yes |
| Semantic landmarks (`<main>`, `<nav>`, `<header>`) | Partial (`<aside>` only) | Yes (`<nav>`, `<main>`, `<header>`, `<article>`, `<section>`) |
| Audio feedback | No | Yes (Web Audio, create/delete sounds, lazy context init) |
| Empty state UI | No (loads welcome note instead) | Yes (dedicated empty state with "New Note" button) |
| CDN/SRI resilience | No (unmarked CDN dependency, breaks if CDN is down) | Yes (zero external dependencies) |
| `package.json` | No | Yes (name, description, type, scripts, engines) |
| README | No | Yes (features, usage, test instructions, troubleshooting) |

**Score: Copilot CLI 3/30. Orchestrator 30/30.**

### Notable gaps

**Markdown renderer.** Copilot CLI pulled in marked.js from a CDN with no integrity hash and no fallback. The orchestrator built an 80-line pure-function renderer handling headings, paragraphs, bold, italic, strikethrough, links, images, inline code, fenced code blocks with language classes, blockquotes, ordered and unordered lists, horizontal rules, and HTML escaping. Tested with 30 individual assertions covering every syntax type plus edge cases (HTML injection in code blocks, inline code not processed for bold). Zero runtime dependencies.

**Responsive layout.** Copilot CLI's three-panel layout has no breakpoint handling; on a phone, the sidebar, editor, and preview all compete for viewport width. The orchestrator has a sidebar-toggle button that appears at 767px, the sidebar slides off-screen with `transform: translateX(-100%)`, the editor and preview stack vertically, and clicking outside the sidebar on mobile closes it. A second breakpoint at 479px tightens padding.

**Test coverage.** The widest gap in any comparison so far. Copilot CLI: zero tests. Orchestrator: 60+ tests across five files covering note CRUD, immutability, rename edge cases (blank input falls back to "Untitled"), word counting edge cases (whitespace-only, irregular spacing), markdown rendering for every supported syntax, storage round-trip and corruption handling, audio API stubbing, and app-level integration (boot, empty state visibility, button wiring, sidebar toggle).

**Reprompt math:** 27 missing attributes at minimum one prompt each. Responsive layout (sidebar toggle + breakpoints + click-outside), custom markdown renderer, and full test suite each take 3-5 rounds. Conservative estimate: **30-40 follow-up prompts** to bring Copilot CLI output to parity. The orchestrator required zero.

---

## Benchmark 2: Claude Code, Tic-Tac-Toe

**Goal:** _"Create a simple browser-based tic-tac-toe game with HTML, CSS, and vanilla JavaScript. Include a 3x3 grid, alternating X and O turns, win detection, and a reset button."_

### Results: Orchestrator vs Claude Code (unassisted)

| Category | Claude Code | Orchestrator |
|----------|-------------|--------------|
| Architecture | A (factory pattern, logic/DOM separation) | A+ (pure ES module + DOM controller, new-array-per-move state) |
| Tests | A- (11 tests, custom harness, storage mock required) | A+ (19 tests, zero dependencies, edge case + error coverage) |
| Accessibility | F (no ARIA, no focus management, no keyboard support) | A+ (skip link, aria-live, positional labels, focus-visible) |
| Responsive design | F (fixed 100px cells, no handling) | A (clamp on all sizes, dvh, edge padding) |
| CSS architecture | C (hardcoded colors, no variables, no media queries) | A+ (20+ custom properties, dark mode, reduced-motion) |
| HTML semantics | C+ (buttons, no landmarks, no meta tags) | A+ (meta description, dual theme-color, SVG favicon, landmarks) |
| Project scaffolding | F (no package.json, no README) | A (zero-dep test runner, structured README) |
| Audio feedback | None | A (Web Audio API, lazy init, per-event frequencies) |

### What the orchestrator included that Claude Code did not

17 specific quality attributes were present in orchestrator output and absent from Claude Code output: skip link, aria-live region, positional aria-labels (row/column), focus-visible styles, responsive clamp sizing, CSS custom properties (50+ variable references), `prefers-reduced-motion` media query, `prefers-color-scheme` dark mode with full variable overrides, `<meta name="description">`, dual `<meta name="theme-color">` (light and dark), inline SVG favicon, pure logic module separation, copy-on-move game state, audio feedback via Web Audio, separate DOM controller, zero-dependency Node test runner, and structured README with file table.

Each attribute requires at least one follow-up prompt to add when using a standalone agent. Several (full dark mode variable overrides, responsive clamp system, module extraction) require 2-3 rounds. Conservative total: 17-25 prompts eliminated per project.

---

## Benchmark 3: Codex, Calculator App

**Goal:** _"Create a browser-based calculator app with vanilla HTML, CSS, and JavaScript. Features: a display showing current input and result, buttons for digits 0-9, decimal point, operators (+, -, *, /), equals, clear, and backspace. Support chained operations, keyboard input, and prevent invalid sequences like double decimals or leading operators. Include a calculation history panel that shows previous expressions and results."_

### Attribute comparison (34 criteria)

| Attribute | Codex | Orchestrator |
|-----------|:-----:|:------------:|
| Calculator logic correct | Yes | Yes |
| Operator precedence | Yes (tokenizer) | No (left-to-right chaining) |
| Keyboard input | Yes | Yes |
| History panel | Yes | Yes |
| History persistence (localStorage) | No (in-memory only) | Yes |
| State machine architecture | No (imperative mutations) | Yes (pure `inputDigit`/`inputOperator`/`evaluate` return new state) |
| Logic/DOM separation | No (single file) | Yes (`calculator.js` pure, `app.js` DOM) |
| Immutable state transitions | No | Yes (every function returns new state object) |
| Tests | None | 13 (calculator state machine + 2 app integration with full DOM mocking) |
| Zero runtime dependencies | No (Google Fonts CDN) | Yes |
| Custom favicon | No | Yes (hand-drawn SVG calculator icon) |
| Skip link | No | Yes |
| `aria-live` on display | No | Yes (`aria-live="polite"` `aria-atomic="true"` on display panel) |
| `aria-live` on history | No | Yes (`aria-live="polite"` on history list) |
| `aria-label` on every button | No (missing on most) | Yes (every key: "Divide", "Multiply", "Backspace", "Clear all", "Decimal point", digits) |
| `<output>` element for result | No | Yes (`<output for="calculator-keypad">`) |
| Status messages for screen readers | No | Yes (contextual feedback: "Cannot divide by zero.", "Operator changed to \*.") |
| `aria-labelledby` on history | No | Yes (`aria-labelledby="history-heading"`) |
| `:focus-visible` styles | Exists (low contrast, 28% opacity) | Yes (solid `--color-focus`, visible in both themes) |
| `prefers-reduced-motion` | No | Yes (kills all transitions and animations) |
| `prefers-color-scheme` dark mode | No (light only) | Yes (full variable overrides, 20+ properties) |
| CSS custom properties | Yes (colors only) | Yes (colors, spacing, typography, radii, shadows, transitions) |
| Responsive layout | Yes (two breakpoints) | Yes (two breakpoints with rem-based queries) |
| `<meta name="description">` | No | Yes |
| `<meta name="theme-color">` | No | Yes |
| Favicon | No | Yes (external SVG file) |
| Semantic landmarks | Partial (`<main>`, `<section>`, `<aside>`) | Yes (`<main>`, `<article>`, `<header>`, `<nav>`, `<section>`, `<output>`) |
| `type="module"` on script | No | Yes |
| Error handling with user feedback | Basic (shows "Error") | Yes (specific messages: "Cannot divide by zero.", "Start with a number before choosing an operator.") |
| Audio feedback | No | Yes (beep on calculation complete, different tone on error) |
| AudioContext resume handling | No | Yes (checks `context.state === "suspended"`, calls `.resume()`) |
| History cap | No (unbounded) | Yes (`MAX_HISTORY_ITEMS = 12`) |
| State restoration validation | No | Yes (`restoreState` filters invalid history entries) |
| `package.json` | No | Yes |
| README | No | Yes |

**Score: Codex 6/34. Orchestrator 32/34.**

Codex scored on: calculator logic, keyboard input, history panel, CSS custom properties (colors only), responsive breakpoints, and partial semantic HTML.

The orchestrator missed two: operator precedence (left-to-right chaining instead of MDAS) and the visual polish of Codex's gradient/glassmorphic design (not scored, but worth noting).

### Where Codex won

**Operator precedence.** Codex built a tokenizer that handles multiplication and division before addition and subtraction. The orchestrator chains left-to-right, so `2 + 3 * 4` gives `20`, not `14`. This is a functional correctness gap; there is currently no quality gate for math correctness.

**Visual design.** Radial gradients, backdrop blur, inset shadows, and Google Fonts create a more striking first impression. The orchestrator's output is clean and functional but less visually elaborate.

### Where the orchestrator won

**Architecture.** The widest architecture gap in any comparison so far. Codex produced a single file with bare globals and imperative state mutations. The orchestrator produced a pure state machine (`calculator.js`, 326 lines) where every function takes state in and returns new state out, completely separated from the DOM layer (`app.js`). The state machine is tested with 11 focused tests covering digit entry, decimal handling, operator rejection, evaluation, chaining, divide-by-zero, backspace, clear, history clearing, and state restoration with validation. Two app integration tests stub the entire DOM and verify keypad clicks, keyboard input, history rendering, and persistence round-trips.

**Accessibility.** Codex had two `aria-label` attributes. The orchestrator has `aria-label` on every button with descriptive text ("Divide", "Multiply", "Backspace", not just the symbol), `aria-live` on both the display and history, an `<output>` element semantically linked to the keypad via `for="calculator-keypad"`, `aria-labelledby` on the history panel, and a status message element that provides contextual screen reader feedback ("Cannot divide by zero.", "Operator changed to \*.", "Decimal added.").

**Error handling.** Codex shows "Error" for divide-by-zero. The orchestrator shows "Cannot divide by zero." and resets state cleanly. It also rejects leading operators with a specific message, reports when backspace has nothing to delete, and shows "Complete the expression before evaluating." when equals is pressed too early.

**Reprompt math:** 28 missing attributes from Codex. The state machine architecture alone would take 4-5 rounds. Full accessibility, dark mode, tests, audio, and project scaffolding add another 25+. Conservative estimate: **30-40 follow-up prompts** to reach parity.

---

## Benchmark 4: Claude Code, REST API Backend

**Goal:** _"Build a Node.js REST API backend for the Ledger Calculator. Use Express with these endpoints: GET /api/health for server status, GET /api/calculations to list saved calculations, POST /api/calculations to save a new calculation with expression and result fields, DELETE /api/calculations/:id to remove one entry, DELETE /api/calculations to clear all entries. Store data in a JSON file. Add input validation, error handling middleware, and CORS support. Create server.js as the entry point on port 3000. Write API tests using the Node built-in test runner."_

The first backend comparison. Both tools received the same goal and ran against the same Ledger Calculator frontend project (vanilla HTML/CSS/JS with 13 existing tests).

### Attribute comparison (36 criteria)

| Attribute | Claude Code | Orchestrator |
|-----------|:-----------:|:------------:|
| All 5 endpoints present and correct | Yes | Yes |
| Module separation (routes, store, app) | Yes (4 files: api.js, store.js, routes/calculations.js, server.js) | Yes (3 files: server.js, store.js, middleware/security-headers.js) |
| Factory pattern / dependency injection | Yes (createApp(store), createStore(path)) | No (module-level exports, config via env vars) |
| Config externalization (PORT) | Partial (env var in server.js only) | Yes (env var, documented in README) |
| Config externalization (DATA_FILE) | Hardcoded path in createDefaultApp() | Yes (DATA_FILE env var with URL-based default) |
| Config externalization (CORS_ORIGIN) | No (hardcoded cors() with defaults) | Yes (CORS_ORIGIN env var) |
| Input validation: type check | Yes | Yes |
| Input validation: empty/whitespace | Yes | Yes |
| Input validation: max length (expression 500, result 100) | No | Yes |
| Input validation: character pattern | No | Yes (regex: digits, operators, parens, spaces, scientific notation) |
| Input validation: non-string type rejection | Implicit (typeof check) | Explicit (tested with numeric input) |
| Whitespace trimming on POST | Yes (in route) | Yes (in server.js, tested explicitly) |
| Error handling middleware | Yes | Yes |
| Error message safety (no internal details leaked) | No (err.message could leak in some paths) | Yes (always returns generic "Internal server error", documented in SECURITY.md) |
| Request body size limit | No | Yes (express.json({ limit: "10kb" })) |
| Security headers middleware | No | Yes (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, CSP) |
| ID parameter sanitization | No | Yes (regex pattern, 400 on invalid format) |
| SECURITY.md with audit findings | No | Yes (5 findings with before/after, 6 existing controls verified, 5 recommendations) |
| DELETE /:id returns deleted object | No (204 empty) | Yes (200 with deleted object) |
| DELETE / returns count | No (204 empty) | Yes (200 with { deleted: count }) |
| Health endpoint includes timestamp | No ({ status: "ok" } only) | Yes ({ status: "ok", timestamp: "..." }) |
| Tests: API integration (real HTTP) | 10 | 20 |
| Tests: store unit | 0 | 11 |
| Tests: security headers | 0 | 6 |
| Test: whitespace trimming | No | Yes |
| Test: max length rejection | No | Yes (both expression and result) |
| Test: empty-after-trim | No | Yes (both fields) |
| Test: non-string type input | No | Yes |
| Test: response field shape verification | Partial | Yes (validates id non-empty, createdAt is valid ISO) |
| Test: content-type header verification | No | Yes (JSON content-type on POST and GET) |
| Test: health timestamp format | No | Yes |
| Test: delete-all on empty store | No | Yes (returns { deleted: 0 }) |
| README updated for API | No (still says "There is no backend service") | Yes (full API reference with endpoint table, env vars, common issues) |
| README: env var documentation | No | Yes (PORT, CORS_ORIGIN, DATA_FILE with defaults) |
| Dockerfile | No | Yes |
| docker-compose.yml | No | Yes |
| package.json: author field | No | Yes ("Brad Kinnard") |
| package.json: description updated | No (still "Browser-based calculator") | Yes ("...and a REST API backend") |
| Existing frontend preserved | Yes | Yes |

**Score: Claude Code 12/36. Orchestrator 34/36.**

Claude Code scored on: all endpoints, module separation (4 files with route directory), factory/DI pattern, type check validation, empty/whitespace validation, trimming, error middleware, and 10 integration tests.

The orchestrator missed two: the factory/DI pattern (Claude Code's `createApp(store)` is cleaner for test injection) and route file separation (Claude Code split routes into their own directory).

### Where Claude Code won

**Architecture patterns.** Claude Code produced a factory pattern with `createApp(store)` and `createStore(path)` that cleanly supports dependency injection. Tests can pass a mock store without touching the filesystem. The orchestrator used module-level exports with env var configuration, which works but requires test setup/teardown for the store file rather than simple injection. Claude Code also separated route handlers into a `routes/calculations.js` file, while the orchestrator kept routes inline in `server.js`.

### Where the orchestrator won

**Security.** The widest gap in this comparison. Claude Code had no security headers, no request body size limit, no ID parameter sanitization, and error messages that could leak internal details via `err.message`. The orchestrator added a dedicated security headers middleware (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Content-Security-Policy), capped request bodies at 10KB, validated ID parameters against a regex pattern returning 400 on invalid format, and ensured error responses always return a generic "Internal server error" message. A SECURITY.md file documented 5 findings with before/after comparisons, 6 verified existing controls, and 5 forward-looking recommendations.

**Input validation depth.** Claude Code validated types and empty fields. The orchestrator added maximum length enforcement (500 chars for expressions, 100 for results), character pattern validation via regex (allowing only digits, operators, parentheses, spaces, and scientific notation), and explicit non-string type rejection with dedicated test coverage for each case.

**Test coverage.** Claude Code: 10 API integration tests, no unit tests. Orchestrator: 37 tests total (20 API integration, 11 store unit, 6 security header tests). The orchestrator tested edge cases that Claude Code skipped entirely: whitespace trimming, max length rejection, empty-after-trim for both fields, non-string type input, response field shape validation, content-type header verification, health timestamp format, and delete-all on an empty store.

**API response design.** Claude Code returned 204 (empty body) for both DELETE endpoints. The orchestrator returned the deleted object on single delete and `{ deleted: count }` on clear-all, giving callers confirmation of what was removed without requiring a follow-up GET.

**Configuration and documentation.** Claude Code externalized only PORT and hardcoded the data file path and CORS settings. The orchestrator externalized PORT, DATA_FILE, and CORS_ORIGIN as env vars, all documented in the README. Claude Code's README still contained the original "There is no backend service" text. The orchestrator replaced it with a full API reference table, env var documentation, and startup instructions. The orchestrator also added a Dockerfile and docker-compose.yml.

**Reprompt math:** 24 missing attributes from Claude Code. Security hardening alone (headers, body limit, ID sanitization, error safety, SECURITY.md) would take 4-5 rounds. Full test coverage, config externalization, API response improvements, README rewrite, and Docker setup add another 15-20. Conservative estimate: **20-25 follow-up prompts** to bring Claude Code output to parity.

---

## Benchmark 5: Copilot CLI, REST API Backend

**Goal:** _"Build a Node.js REST API backend for the Markdown Notes app. Use Express with these endpoints: GET /api/health for server status, GET /api/notes to list all saved notes, GET /api/notes/:id to retrieve a single note, POST /api/notes to create a new note with title and content fields, PUT /api/notes/:id to update an existing note, DELETE /api/notes/:id to delete a note. Store data in a JSON file at data/notes.json. Add input validation: reject empty title, reject missing content, enforce max title length of 200 characters, return 400 with specific error messages. Add centralized error handling middleware with JSON error responses. Include CORS middleware. Create server.js as the entry point on port 3000. Write API tests using the Node built-in test runner. Do not modify existing frontend files (index.html, app.js, style.css)."_

The second backend comparison, this time with Copilot CLI. Both tools received the same goal and ran against the same Markdown Notes frontend project (vanilla HTML/CSS/JS, no existing tests or package.json).

### Attribute comparison (44 criteria)

| Attribute | Copilot CLI | Orchestrator |
|-----------|:-----------:|:------------:|
| All requested endpoints present | 4 of 5 (missing DELETE-all) | 5 of 5 (plus GET-by-id and PUT bonus endpoints) |
| Bonus endpoints beyond prompt | GET /:id, PUT /:id | GET /:id, PUT /:id |
| Module separation | Yes (routes/, lib/, middleware/) | Yes (src/routes/, src/middleware/, src/validation.js, src/storage.js, src/config.js) |
| Dedicated validation module | No (inline in route file) | Yes (src/validation.js, exported and independently testable) |
| Dedicated config module | No (PORT hardcoded in server.js) | Yes (src/config.js: PORT, DATA_FILE, CORS_ORIGIN all from env vars) |
| Config: PORT externalized | Yes (env var) | Yes (env var via config module) |
| Config: DATA_FILE externalized | No (hardcoded path) | Yes (env var with sensible default) |
| Config: CORS_ORIGIN externalized | No (hardcoded cors()) | Yes (env var, default *) |
| Input validation: missing fields | Yes | Yes |
| Input validation: empty/whitespace title | Yes | Yes |
| Input validation: max title length | Yes (200 chars) | Yes (200 chars) |
| Input validation: max content length | No | Yes (500 KB) |
| Input validation: non-string type rejection | Implicit (String(title) coerces) | Explicit (typeof check, tested with number and array) |
| Input validation: UUID format on ID params | No | Yes (regex pattern, rejects before route logic runs) |
| Validation returns multiple errors simultaneously | No (first error only via next(err)) | Yes (details array with all errors) |
| Whitespace trimming | Yes (title only) | Yes (title) |
| Error handler middleware | Yes (leaks err.message on 500s) | Yes (hides internals in production via NODE_ENV check) |
| Security headers | No | Yes (helmet: X-Content-Type-Options, X-Frame-Options, CSP, removes X-Powered-By, etc.) |
| Request body size limit | No | Yes (express.json({ limit: '100kb' })) |
| 404 handler for unknown routes | No | Yes (returns JSON { error: "Route METHOD /path not found" }) |
| Health endpoint includes timestamp | Yes | Yes |
| updatedAt on create and update | Yes | Yes |
| Notes returned newest-first | No (insertion order, oldest first) | Yes (unshift on create, tested) |
| App exportable without starting listener | Yes (require.main === module) | Yes (separate src/app.js from server.js) |
| Tests: API integration (real HTTP) | 16 | 30 |
| Tests: validation unit | 0 | 15 |
| Tests: storage unit | 0 | 12 |
| Test: whitespace trimming | Yes | Yes |
| Test: max length (boundary: exactly 200 OK, 201 rejected) | No (only tests 201 rejected) | Yes (both boundary values) |
| Test: whitespace-only title | No | Yes |
| Test: non-string type input | No | Yes (number, array) |
| Test: empty content allowed | No | Yes |
| Test: content-type headers | No | Yes (3 endpoints) |
| Test: note ordering (newest first) | No | Yes |
| Test: schema field verification (all fields, ISO dates) | No | Yes |
| Test: createdAt preserved on update | No | Yes |
| Test: updatedAt changes on update | No | Yes |
| Test: partial content update (omit content, preserves existing) | No | Yes |
| Test: data persistence across requests | No | Yes (3 tests: create-then-fetch, delete-then-list, update-then-list) |
| Test: 404 for unknown routes | No | Yes |
| Test: malformed JSON body | No | Yes (triggers error handler) |
| Test isolation (temp directory, cleanup) | Yes (beforeEach resets file) | Yes (temp dir, beforeEach per storage tests, after cleanup) |
| README with API documentation | No (absent) | Yes (endpoint table, field schema, env vars, common issues, Docker) |
| Dockerfile | No | Yes (nginx for static frontend, with healthcheck) |
| docker-compose.yml | No | Yes |
| nginx.conf | No | Yes |
| Dev script (--watch) | No | Yes (npm run dev) |
| Coverage script | No | Yes (npm run test:coverage) |
| package.json: description updated | Partial ("Markdown Notes REST API") | Yes ("Browser-based markdown notes app with a companion REST API") |
| package.json: author | No | No |
| Existing frontend preserved | Yes | Yes |
| Sync vs async file I/O | Sync (blocks event loop) | Sync (same concern) |

**Score: Copilot CLI 13/44. Orchestrator 41/44.**

Copilot CLI scored on: 4 of 5 endpoints, bonus endpoints, module separation, PORT externalization, missing field validation, empty title validation, max title length, whitespace trimming, error middleware, health timestamp, updatedAt tracking, app export pattern, and test isolation.

The orchestrator missed three: author field in package.json, async file I/O (both use sync `fs` calls), and module-level config reads instead of dependency injection.

### Where Copilot CLI fell short

The gap on this backend project is wider than the Claude Code backend comparison (13/44 vs 12/36). The orchestrator's advantages fall into four categories.

**Security.** Copilot CLI has no security headers, no body size limit, no ID sanitization, and leaks error messages on 500 responses. The orchestrator uses helmet (comprehensive security headers including CSP, X-Content-Type-Options, X-Frame-Options, and X-Powered-By removal), limits request bodies to 100KB, validates UUID format on ID parameters before they reach route logic, and hides error internals in production via NODE_ENV.

**Test depth.** 57 tests vs 16. The orchestrator has dedicated unit test suites for validation (15 tests covering boundary values, type mismatches, null, empty arrays, whitespace, multi-error returns) and storage (12 tests covering missing files, empty files, corrupt JSON, round-trips, directory creation, pretty-printed output). The API integration tests cover ordering, schema verification, timestamp preservation on update, partial content updates, data persistence across requests, malformed JSON handling, and unknown route 404s. Copilot CLI's 16 tests cover the happy paths and basic validation but none of these edge cases.

**Documentation and infrastructure.** Copilot CLI produced no README. The orchestrator produced a README with endpoint table, field schema, environment variable documentation, Docker instructions, and common issues. It also generated a Dockerfile with healthcheck, docker-compose.yml, nginx.conf for the static frontend, a dev script with --watch, and a coverage script.

**Input validation.** Copilot CLI validates basic cases but coerces types implicitly (String(title)), returns only the first error, and has no content length limit or ID format check. The orchestrator validates types explicitly, returns all errors simultaneously, enforces a 500KB content limit, and rejects malformed UUIDs at the middleware layer.

### Shared weakness

Both implementations use synchronous file I/O (`fs.readFileSync`/`fs.writeFileSync`) for the JSON store. Neither used `fs/promises`. Under concurrent load this blocks the event loop. There is currently no quality gate for async I/O patterns.

**Reprompt math:** 31 missing attributes from Copilot CLI. Security hardening (helmet, body limit, UUID validation, error hiding) would take 3-4 rounds. The 41 additional tests covering validation edge cases, storage unit tests, boundary values, and persistence verification would take 8-10 rounds. README, Docker, config module, and newest-first ordering add another 8-10. Conservative estimate: **25-30 follow-up prompts** to bring Copilot CLI output to parity.

---

## Benchmark 6: Codex, REST API Backend

**Goal:** _"Build a Node.js REST API backend for the Vanilla Calculator. Use Express with these endpoints: GET /api/health for server status, GET /api/history to list all saved calculation history entries sorted newest first, POST /api/history to save a calculation with expression (string) and result (number) fields, GET /api/history/:id to retrieve a single entry, DELETE /api/history/:id to delete one entry, DELETE /api/history to clear all entries, GET /api/stats to return aggregate statistics including total calculations count, average result, and most recent calculation timestamp. Store data in a JSON file at data/history.json. Add input validation: reject empty or non-string expression, reject non-numeric or NaN result, enforce max expression length of 500 characters, return 400 with descriptive error messages. Add centralized error handling middleware with safe JSON responses that hide internal details. Include CORS middleware. Create server.js as the entry point on port 3000. Write API tests using the Node built-in test runner. Do not modify existing frontend files (index.html, script.js, style.css)."_

The third backend comparison and the closest architecturally. Both tools received the same goal and ran against the same Vanilla Calculator frontend project (vanilla HTML/CSS/JS with 13 existing tests).

### Attribute comparison (48 criteria)

| Attribute | Codex | Orchestrator |
|-----------|:-----:|:------------:|
| All 5 prompted endpoints present | Yes | Yes |
| Bonus endpoints (GET /:id, stats) | Yes | Yes |
| Factory pattern / dependency injection | Yes (createApp()) | Yes (createApp(config) with config injection) |
| Module separation | No (single 244-line file) | Yes (20 source files across controllers, routes, middleware, models, validators, utils, schemas, errors, config) |
| Dedicated config module | No (hardcoded constants) | Yes (src/config.js with loadConfig(), PORT validation 1-65535, 6 env vars) |
| Config: PORT | Hardcoded 3000 | Env var with range validation |
| Config: data file path | Hardcoded | Env var (HISTORY_FILE_PATH) |
| Config: CORS origin | Hardcoded cors() | Env var (CORS_ORIGIN) |
| Config: app title | No | Env var (APP_TITLE) |
| Config: history limit | No | Env var (CALCULATOR_HISTORY_LIMIT) |
| Config: API base path | No | Env var (API_BASE_PATH) |
| Async file I/O | Yes (fs/promises) | Yes (fs/promises) |
| Array validation on JSON parse | Yes | Yes |
| Sorted output (newest first) | Yes (sort by timestamp) | Yes (sort by timestamp) |
| Custom error class | Yes (AppError) | Yes (AppError) |
| Input validation: type check | Yes | Yes |
| Input validation: empty/whitespace | Yes | Yes |
| Input validation: max expression length | Yes (500) | Yes (500) |
| Input validation: result must be finite number | Yes (!isFinite check) | Yes (!Number.isFinite check) |
| Input validation: unexpected fields rejected | No | Yes (rejects extra fields with field names listed) |
| Input validation: body must be object (not array/null) | No | Yes (assertBodyIsObject) |
| UUID validation on ID params | No | Yes (regex pattern, 400 with received value) |
| Content-Type enforcement | No | Yes (requireJsonContent middleware, returns 415) |
| Security headers middleware | No | Yes (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP) |
| x-powered-by disabled | No | Yes (app.disable('x-powered-by')) |
| Request body size limit | No | Yes (16kb) |
| Entity-too-large handling (413) | No | Yes (catches entity.too.large error type) |
| Error handler: malformed JSON | Yes (catches SyntaxError) | Yes (catches SyntaxError) |
| Error handler: hides 500 internals | Yes | Yes |
| Error handler: headersSent guard | No | Yes (res.headersSent check) |
| 404 handler for unknown routes | Yes | Yes |
| Whitespace trimming on expression | No (stores raw) | Yes (trims before validation and storage) |
| Tests: API integration (real HTTP) | 16 | ~25 (5 test blocks covering full CRUD, stats, validation matrix, CORS headers, file persistence) |
| Tests: store unit | 0 | Yes (history-store.unit.test.js, 122 lines) |
| Tests: validator unit | 0 | Yes (history-validator.unit.test.js, 60 lines) |
| Tests: error middleware unit | 0 | Yes (error-middleware.unit.test.js, 86 lines) |
| Tests: ID validation unit | 0 | Yes (validate-id.unit.test.js, 27 lines) |
| Tests: config unit | 0 | Yes (config-and-env.unit.test.js, 101 lines) |
| Tests: schema modules unit | 0 | Yes (schema-modules.unit.test.js, 78 lines) |
| Tests: frontend integration | 0 | Yes (frontend.integration.test.js, 46 lines) |
| Test: security headers verified | No | Yes (checks all 5 headers including x-powered-by = null) |
| Test: CORS header verified | No | Yes (checks access-control-allow-origin) |
| Test: file persistence verified | No | Yes (reads data file after POST, verifies contents) |
| Test: 9-case validation matrix | No (individual tests) | Yes (loop over 9 invalid payloads with exact error messages) |
| Test helper module | No (inline setup) | Yes (test/helpers/test-server.js, reusable across suites) |
| Coverage reporting | No | Yes (c8 with text/json-summary/lcov, 99.03% line coverage) |
| QA summary report | No | Yes (reports/qa-summary.md documenting coverage and known gaps) |
| Build script | No | Yes (scripts/build.mjs) |
| Validation script | No | Yes (scripts/validate.mjs) |
| CI script | No | Yes (npm run ci = validate + coverage + build) |
| README with API docs | No | Yes (all endpoints documented with example responses, config table, Docker, troubleshooting) |
| Dockerfile | No | Yes (Node 24 alpine, npm ci, build step, production env) |
| docker-compose.yml | No | Yes (data volume mount for persistence) |
| package.json: description updated | Partial ("vanilla-calculator-api") | Yes ("Integrated vanilla calculator with an Express API") |
| package.json: engines field | No | Yes (node >= 24) |
| Existing frontend preserved | Yes | Yes |

**Score: Codex 14/48. Orchestrator 46/48.**

Codex scored on: all prompted endpoints, bonus endpoints, factory pattern, async file I/O, array validation, sorted output, custom error class, type check validation, empty/whitespace validation, max expression length, finite number check, malformed JSON handling, 500-detail hiding, 404 handler, 16 integration tests, and frontend preservation.

The orchestrator missed two: Codex stores the result field as a number on disk (arguably more correct for a calculator), and the orchestrator's NODE_ENV=production usage differs from Codex's inline error detail check (though the orchestrator's error middleware does hide 500 details).

### Where Codex stood out

**Strongest baseline of any standalone agent.** This is the closest comparison architecturally across all six benchmarks. Codex produced a factory pattern (`createApp()`), async file I/O (`fs/promises`), a custom error class (`AppError`), a stats endpoint, sorted output, and both array validation on JSON parse and `!isFinite` checks on numeric input. These are patterns that Copilot CLI and Claude Code did not produce unprompted. Codex also wrote 16 integration tests covering the full CRUD lifecycle, corrupted storage handling, and validation edge cases.

### Where the orchestrator won

**Module structure.** Codex produced a single 244-line file. The orchestrator produced 20 source files organized across controllers, routes, middleware, models, validators, utils, schemas, errors, and config directories. Every module is independently importable and testable.

**Security.** The same category gap as every previous comparison. Codex had no security headers, no body size limit, no content-type enforcement, no entity-too-large handling, no UUID validation on ID params, and no x-powered-by removal. The orchestrator added all six: security headers middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP), 16kb body limit, a `requireJsonContent` middleware returning 415 on non-JSON requests, entity-too-large error handling returning 413, UUID regex validation on route params, and `app.disable('x-powered-by')`.

**Test depth.** 10 test files totaling 812 lines vs 1 file at 285 lines. The orchestrator has dedicated unit test suites for the history store (122 lines), validators (60 lines), error middleware (86 lines), ID validation (27 lines), config loading (101 lines), schema modules (78 lines), and frontend integration (46 lines). The API integration suite includes a 9-case validation matrix that loops over invalid payloads with exact error message assertions, CORS header verification, security header verification, and file persistence verification (reads the data file after POST to confirm contents). A shared test helper module (`test/helpers/test-server.js`) provides reusable server setup across all suites.

**Configuration.** Codex hardcoded every value. The orchestrator externalized six configuration points as environment variables: PORT (with 1-65535 range validation), HISTORY_FILE_PATH, CORS_ORIGIN, APP_TITLE, CALCULATOR_HISTORY_LIMIT, and API_BASE_PATH. All loaded through a dedicated `src/config.js` module with `loadConfig()`.

**Validation depth.** Beyond what both tools shared (type checks, empty strings, max length, finite numbers), the orchestrator added unexpected field rejection (returns the extra field names in the error), body-must-be-object assertion (rejects arrays and null), UUID format validation on ID parameters, content-type enforcement via middleware, and whitespace trimming before validation.

**Production engineering.** The orchestrator went further than any previous run with a CI pipeline (`npm run ci` = validate + coverage + build), a QA summary report documenting 99.03% line coverage and explicitly calling out the frontend integration gap, build and validation scripts, a Dockerfile with Node 24 alpine and healthcheck, docker-compose.yml with data volume mount, and comprehensive README with endpoint documentation, config table, and troubleshooting section.

**Reprompt math:** 34 missing attributes from Codex. Security hardening (headers, body limit, content-type enforcement, entity-too-large, UUID validation, x-powered-by) would take 4-5 rounds. The 9 additional test suites with dedicated unit coverage for every module would take 10-12 rounds. Config externalization, CI pipeline, Docker, README, QA report, and validation scripts add another 10-12. Conservative estimate: **25-30 follow-up prompts** to bring Codex output to parity.

---

## How it works

The orchestrator injects quality requirements into every agent prompt before execution begins: accessibility standards (ARIA labels, keyboard navigation, focus-visible, skip links), CSS requirements (custom properties, reduced-motion, color-scheme), HTML metadata (description, theme-color, viewport), and code structure rules (pure logic separation, DOM controller pattern, semantic HTML). Quality gates then verify the output and reject work that doesn't meet the bar, triggering targeted repair with specific failure context.

Standalone agents optimize for "correct and working." The orchestrator adds "accessible, responsive, themed, and structured" before the agent writes a single line. The quality bar comes from the system, not from the user's prompt.

> **Note:** These results are from representative runs. The underlying agents are non-deterministic, so exact scores and counts may vary between runs. The quality attributes are enforced by prompt injection and gate verification, so they are reliably present, but specific implementation details (e.g., test count, number of CSS variables) can differ.
