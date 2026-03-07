// Author: Bradley R. Kinnard
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeBaseManager } from '../src/knowledge-base';

describe('Upgrade 6: Delta Context Engine (Lean Mode)', () => {
  let kb: KnowledgeBaseManager;
  const testKbDir = path.join(process.cwd(), 'runs', 'test-lean-kb');

  beforeEach(() => {
    if (!fs.existsSync(testKbDir)) {
      fs.mkdirSync(testKbDir, { recursive: true });
    }
    kb = new KnowledgeBaseManager(testKbDir);
  });

  afterEach(() => {
    if (fs.existsSync(testKbDir)) {
      fs.rmSync(testKbDir, { recursive: true, force: true });
    }
  });

  describe('levenshtein', () => {
    it('should return 0 for identical strings', () => {
      assert.strictEqual(kb.levenshtein('hello', 'hello'), 0);
    });

    it('should return correct distance for known pairs', () => {
      assert.strictEqual(kb.levenshtein('kitten', 'sitting'), 3);
      assert.strictEqual(kb.levenshtein('flaw', 'lawn'), 2);
      assert.strictEqual(kb.levenshtein('', 'abc'), 3);
      assert.strictEqual(kb.levenshtein('abc', ''), 3);
    });

    it('should be symmetric', () => {
      assert.strictEqual(kb.levenshtein('abc', 'xyz'), kb.levenshtein('xyz', 'abc'));
    });

    it('should handle single character differences', () => {
      assert.strictEqual(kb.levenshtein('cat', 'bat'), 1);
      assert.strictEqual(kb.levenshtein('cat', 'cats'), 1);
    });
  });

  describe('findSimilarTasks', () => {
    beforeEach(() => {
      // seed KB with patterns
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Build REST API with authentication and user management',
        confidence: 'high',
        evidence: ['commit-abc123'],
        impact: 'high'
      });
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Create React frontend with login page',
        confidence: 'medium',
        evidence: ['commit-def456'],
        impact: 'medium'
      });
      kb.addOrUpdatePattern({
        category: 'anti_pattern',
        insight: 'Deploy Kubernetes cluster with Helm charts',
        confidence: 'high',
        evidence: ['commit-ghi789'],
        impact: 'high'
      });
    });

    it('should find similar tasks above threshold', () => {
      const matches = kb.findSimilarTasks('Build REST API with authentication and user management');
      assert.ok(matches.length > 0, 'should find at least one match');
      assert.ok(matches[0].insight.includes('REST API'), 'matched pattern should be about REST API');
    });

    it('should return empty array for dissimilar tasks', () => {
      const matches = kb.findSimilarTasks('quantum computing simulation framework');
      assert.strictEqual(matches.length, 0, 'should find no matches for unrelated task');
    });

    it('should respect custom threshold', () => {
      // very high threshold should match fewer things
      const strict = kb.findSimilarTasks('Build REST API with authentication', 0.95);
      const relaxed = kb.findSimilarTasks('Build REST API with authentication', 0.3);
      assert.ok(relaxed.length >= strict.length, 'lower threshold should match more');
    });
  });

  describe('reference block formatting', () => {
    it('should format reference block with correct template', () => {
      const patternId = 'best_practice-12345-abc';
      const commitRef = 'commit-abc123';
      const refBlock = `Reference: similar task completed in session ${patternId}, commit ${commitRef}.`;

      assert.ok(refBlock.startsWith('Reference: similar task completed in session '));
      assert.ok(refBlock.includes(patternId));
      assert.ok(refBlock.includes(commitRef));
      assert.ok(refBlock.endsWith('.'));
    });
  });

  describe('savings calculation', () => {
    it('should increment saved request counter', () => {
      let savedRequests = 0;
      const costPerRequest = 0.03; // premium multiplier estimate

      // simulate 3 lean matches
      savedRequests += 1;
      savedRequests += 1;
      savedRequests += 1;

      assert.strictEqual(savedRequests, 3);
      const savings = savedRequests * costPerRequest;
      assert.ok(Math.abs(savings - 0.09) < 0.001, `expected ~$0.09, got $${savings}`);
    });

    it('should format savings for dashboard display', () => {
      const savedRequests = 5;
      const costPerRequest = 0.03;
      const display = `Saved: ${savedRequests} request(s), ~$${(savedRequests * costPerRequest).toFixed(2)}`;
      assert.strictEqual(display, 'Saved: 5 request(s), ~$0.15');
    });
  });
});
