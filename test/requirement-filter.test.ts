import * as assert from 'assert';
import { RequirementFilter, FilteredRequirements } from '../src/requirement-filter';
import { TaskClassifier, TaskClassification } from '../src/task-classifier';
import { TIER_MAPS } from '../src/tier-maps';

describe('RequirementFilter', () => {
  let filter: RequirementFilter;
  let classifier: TaskClassifier;

  beforeEach(() => {
    filter = new RequirementFilter(TIER_MAPS);
    classifier = new TaskClassifier();
  });

  describe('filter', () => {
    it('splits api-backend requirements into correct tiers', () => {
      const classification: TaskClassification = { taskType: 'api-backend', confidence: 'high', matchedKeywords: ['REST', 'API', 'Express'] };
      const result = filter.filter(classification);
      assert.strictEqual(result.taskType, 'api-backend');
      assert.ok(result.enforced.length > 0, 'should have enforced requirements');
      assert.ok(result.recommended.length > 0, 'should have recommended requirements');
      assert.ok(result.skipped.length > 0, 'should have skipped requirements');

      // Every enforced item has tier === 'enforce'
      for (const req of result.enforced) {
        assert.strictEqual(req.tier, 'enforce');
      }
      for (const req of result.recommended) {
        assert.strictEqual(req.tier, 'recommend');
      }
      for (const req of result.skipped) {
        assert.strictEqual(req.tier, 'skip');
      }
    });

    it('splits frontend-web requirements correctly (ARIA enforced, no security headers enforced)', () => {
      const classification: TaskClassification = { taskType: 'frontend-web', confidence: 'high', matchedKeywords: ['HTML', 'CSS', 'browser'] };
      const result = filter.filter(classification);
      assert.strictEqual(result.taskType, 'frontend-web');

      const enforcedIds = result.enforced.map(r => r.id);
      assert.ok(enforcedIds.includes('aria-interactive'), 'frontend should enforce ARIA on interactive elements');
      assert.ok(!enforcedIds.includes('security-headers'), 'frontend should not enforce security headers');
    });

    it('splits cli-tool requirements correctly (no web stuff enforced)', () => {
      const classification: TaskClassification = { taskType: 'cli-tool', confidence: 'high', matchedKeywords: ['CLI', 'flags', 'terminal'] };
      const result = filter.filter(classification);
      assert.strictEqual(result.taskType, 'cli-tool');

      const enforcedIds = result.enforced.map(r => r.id);
      assert.ok(enforcedIds.includes('arg-validation'), 'CLI should enforce arg validation');
      assert.ok(enforcedIds.includes('help-flag'), 'CLI should enforce help flag');
      assert.ok(enforcedIds.includes('exit-codes'), 'CLI should enforce exit codes');
      assert.ok(!enforcedIds.includes('security-headers'), 'CLI should not enforce security headers');
      assert.ok(!enforcedIds.includes('aria-interactive'), 'CLI should not enforce ARIA');
    });

    it('full-stack includes union of backend + frontend enforce with no duplicates', () => {
      const classification: TaskClassification = { taskType: 'full-stack', confidence: 'high', matchedKeywords: ['React', 'Express'] };
      const result = filter.filter(classification);
      assert.strictEqual(result.taskType, 'full-stack');

      const enforcedIds = result.enforced.map(r => r.id);
      // Has backend enforced items
      assert.ok(enforcedIds.includes('security-headers'), 'full-stack should enforce security headers from backend');
      assert.ok(enforcedIds.includes('body-size-limit'), 'full-stack should enforce body size limit from backend');
      // Has frontend enforced items
      assert.ok(enforcedIds.includes('aria-interactive'), 'full-stack should enforce ARIA from frontend');
      assert.ok(enforcedIds.includes('keyboard-navigation'), 'full-stack should enforce keyboard nav from frontend');

      // No duplicate ids
      const idSet = new Set(enforcedIds);
      assert.strictEqual(idSet.size, enforcedIds.length, 'enforced ids should have no duplicates');
    });

    it('library-package has correct enforced requirements', () => {
      const classification: TaskClassification = { taskType: 'library-package', confidence: 'high', matchedKeywords: ['library', 'npm package'] };
      const result = filter.filter(classification);
      const enforcedIds = result.enforced.map(r => r.id);
      assert.ok(enforcedIds.includes('type-exports'), 'library should enforce type exports');
      assert.ok(enforcedIds.includes('zero-side-effects'), 'library should enforce zero side effects');
    });
  });

  describe('toPromptInjection', () => {
    it('contains all enforced items under Required heading', () => {
      const classification: TaskClassification = { taskType: 'api-backend', confidence: 'high', matchedKeywords: ['REST'] };
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      assert.ok(prompt.includes('## Required (these are mandatory, your code will be rejected if missing):'));
      for (const req of filtered.enforced) {
        assert.ok(prompt.includes(req.description), `prompt should contain enforced requirement: ${req.id}`);
      }
    });

    it('contains all recommended items under Recommended heading', () => {
      const classification: TaskClassification = { taskType: 'api-backend', confidence: 'high', matchedKeywords: ['REST'] };
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      assert.ok(prompt.includes('## Recommended (include where applicable):'));
      for (const req of filtered.recommended) {
        assert.ok(prompt.includes(req.description), `prompt should contain recommended requirement: ${req.id}`);
      }
    });

    it('contains zero skip-tier items anywhere in the prompt string', () => {
      const classification: TaskClassification = { taskType: 'api-backend', confidence: 'high', matchedKeywords: ['REST'] };
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      for (const req of filtered.skipped) {
        assert.ok(!prompt.includes(req.description), `prompt must not contain skipped requirement: ${req.id}`);
      }
    });

    it('api-backend prompt has zero cross-contamination from frontend/a11y', () => {
      const classification = classifier.classify(
        'Build a Node.js REST API with Express. Endpoints: GET /api/health, POST /api/items, DELETE /api/items/:id.'
      );
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      // Word-boundary checks prevent false positives from substrings (e.g. "variables" containing "aria")
      const forbidden = [/\bARIA\b/i, /\bresponsive\b/i, /\bfavicon\b/i, /\baudio\b/i, /\bdark mode\b/i, /\bfocus-visible\b/i];
      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(prompt),
          `api-backend prompt must not match ${pattern}, but found it in: ${prompt}`
        );
      }
    });

    it('cli-tool prompt has zero cross-contamination from web/api requirements', () => {
      const classification = classifier.classify(
        'Create a Node.js CLI tool that tails a log file in real time and filters lines by severity level. Accept a file path and an optional --level flag.'
      );
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      // Word-boundary checks prevent false positives from substrings (e.g. "variables" containing "aria")
      const forbidden = [/\bsecurity headers\b/i, /\bARIA\b/i, /\bresponsive\b/i, /\bfavicon\b/i, /\bbody size limit\b/i, /\bCORS\b/i];
      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(prompt),
          `cli-tool prompt must not match ${pattern}, but found it in: ${prompt}`
        );
      }
    });

    it('frontend-web prompt has zero cross-contamination from api/backend requirements', () => {
      const classification = classifier.classify(
        'Create a browser-based markdown note-taking app with vanilla HTML, CSS, and JavaScript. Features: editor panel, live preview, note list sidebar.'
      );
      const filtered = filter.filter(classification);
      const prompt = filter.toPromptInjection(filtered);

      // Word-boundary checks prevent false positives from substrings
      const forbidden = [/\bsecurity headers\b/i, /\bbody size limit\b/i, /\bCORS\b/i, /\bparam sanitization\b/i];
      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(prompt),
          `frontend-web prompt must not match ${pattern}, but found it in: ${prompt}`
        );
      }
    });
  });
});
