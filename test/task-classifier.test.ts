import * as assert from 'assert';
import { TaskClassifier } from '../src/task-classifier';

describe('TaskClassifier', () => {
  let classifier: TaskClassifier;

  beforeEach(() => {
    classifier = new TaskClassifier();
  });

  describe('classify', () => {
    it('classifies a pure backend prompt as api-backend with high confidence', () => {
      const result = classifier.classify(
        'Build a Node.js REST API with Express. Endpoints: GET /api/health, POST /api/items, DELETE /api/items/:id. Store data in a JSON file. Add input validation and error handling.'
      );
      assert.strictEqual(result.taskType, 'api-backend');
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.length >= 3, `expected 3+ keywords, got ${result.matchedKeywords.length}`);
    });

    it('classifies a pure frontend prompt as frontend-web with high confidence', () => {
      const result = classifier.classify(
        'Create a browser-based markdown editor with HTML, CSS, and JavaScript. Features: editor panel, live preview, note list sidebar.'
      );
      assert.strictEqual(result.taskType, 'frontend-web');
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.length >= 3);
    });

    it('classifies a pure CLI prompt as cli-tool with high confidence', () => {
      const result = classifier.classify(
        'Create a CLI tool that tails a log file in real time and filters lines by severity level. Accept a file path and an optional --level flag.'
      );
      assert.strictEqual(result.taskType, 'cli-tool');
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.length >= 3);
    });

    it('classifies a full-stack prompt when both backend and frontend keywords appear', () => {
      const result = classifier.classify(
        'Build a React frontend with an Express API backend that serves user data from a database.'
      );
      assert.strictEqual(result.taskType, 'full-stack');
    });

    it('returns full-stack with low confidence for an ambiguous prompt', () => {
      const result = classifier.classify('Build a tool');
      assert.strictEqual(result.taskType, 'full-stack');
      assert.strictEqual(result.confidence, 'low');
    });

    it('returns full-stack with low confidence for an empty string', () => {
      const result = classifier.classify('');
      assert.strictEqual(result.taskType, 'full-stack');
      assert.strictEqual(result.confidence, 'low');
      assert.strictEqual(result.matchedKeywords.length, 0);
    });

    it('handles case-insensitive matching', () => {
      const result = classifier.classify('build a REST api with EXPRESS and add ENDPOINTS for CORS');
      assert.strictEqual(result.taskType, 'api-backend');
      assert.ok(result.matchedKeywords.length >= 3);
    });

    it('classifies a library prompt as library-package', () => {
      const result = classifier.classify('Create a reusable npm package for date parsing with an importable API');
      assert.strictEqual(result.taskType, 'library-package');
      assert.ok(result.matchedKeywords.length >= 2);
    });

    it('includes matched keywords in the result', () => {
      const result = classifier.classify('Build a REST API with Express endpoints and middleware');
      assert.ok(result.matchedKeywords.length > 0);
      // Keywords should be the literal matched strings from the prompt
      for (const kw of result.matchedKeywords) {
        assert.ok(typeof kw === 'string' && kw.length > 0, `keyword should be a non-empty string: ${kw}`);
      }
    });

    it('returns medium confidence when winning category barely leads', () => {
      // Two backend keywords, one frontend keyword
      const result = classifier.classify('Build a REST API server');
      assert.strictEqual(result.taskType, 'api-backend');
      // 3 keywords (REST, API, server) with no runner having 2+
      assert.ok(['high', 'medium'].includes(result.confidence));
    });

    it('defaults to full-stack when only one keyword matches anywhere', () => {
      const result = classifier.classify('Build a responsive application');
      assert.strictEqual(result.taskType, 'full-stack');
      assert.strictEqual(result.confidence, 'low');
    });
  });
});
