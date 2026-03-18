import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { KnowledgeBaseManager, KnowledgePattern, KnowledgeBase } from '../src/knowledge-base';

describe('KnowledgeBaseManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('creates a new knowledge base when none exists', () => {
      const kb = new KnowledgeBaseManager(testDir);
      const exported = kb.export();
      assert.strictEqual(exported.version, 1);
      assert.strictEqual(exported.patterns.length, 0);
      assert.strictEqual(exported.statistics.totalRuns, 0);
    });

    it('loads existing knowledge base from disk', () => {
      // Pre-seed a knowledge base file
      const kbData: KnowledgeBase = {
        version: 1,
        lastUpdated: '2025-01-01T00:00:00.000Z',
        patterns: [{
          id: 'test-1',
          category: 'best_practice',
          insight: 'Use dependency injection',
          confidence: 'high',
          evidence: ['run:1'],
          occurrences: 3,
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-01-01T00:00:00.000Z',
          impact: 'high',
          examples: [],
        }],
        statistics: { totalRuns: 5, totalPatterns: 1, avgPatternsPerRun: 0.2 },
      };
      fs.writeFileSync(path.join(testDir, 'knowledge-base.json'), JSON.stringify(kbData));

      const kb = new KnowledgeBaseManager(testDir);
      const exported = kb.export();
      assert.strictEqual(exported.patterns.length, 1);
      assert.strictEqual(exported.statistics.totalRuns, 5);
    });

    it('creates fresh KB when existing file is corrupt', () => {
      fs.writeFileSync(path.join(testDir, 'knowledge-base.json'), '{bad json');
      const kb = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb.export().patterns.length, 0);
    });
  });

  describe('addOrUpdatePattern', () => {
    it('adds a new pattern', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Always run tests before merge',
        confidence: 'high',
        evidence: ['run:abc'],
        impact: 'high',
      });

      const patterns = kb.getPatternsByCategory('best_practice');
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].occurrences, 1);
      assert.ok(patterns[0].id.startsWith('best_practice'));
    });

    it('updates existing pattern when insight is similar', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'anti_pattern',
        insight: 'Agent skips test execution',
        confidence: 'medium',
        evidence: ['run:1'],
        impact: 'medium',
      });
      kb.addOrUpdatePattern({
        category: 'anti_pattern',
        insight: 'Agent skips test execution frequently',
        confidence: 'high',
        evidence: ['run:2'],
        impact: 'high',
      });

      const patterns = kb.getPatternsByCategory('anti_pattern');
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].occurrences, 2);
      assert.strictEqual(patterns[0].confidence, 'high');
    });

    it('creates separate patterns for different categories', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Run lint before commit',
        confidence: 'high',
        evidence: ['run:1'],
        impact: 'medium',
      });
      kb.addOrUpdatePattern({
        category: 'anti_pattern',
        insight: 'Skipping lint checks',
        confidence: 'medium',
        evidence: ['run:2'],
        impact: 'high',
      });

      assert.strictEqual(kb.getPatternsByCategory('best_practice').length, 1);
      assert.strictEqual(kb.getPatternsByCategory('anti_pattern').length, 1);
    });

    it('persists to disk after adding', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'failure_mode',
        insight: 'Timeout on large repos',
        confidence: 'medium',
        evidence: ['run:x'],
        impact: 'high',
      });

      // Reload from disk
      const kb2 = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb2.getPatternsByCategory('failure_mode').length, 1);
    });

    it('supports cost_history category', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'cost_history',
        insight: '5 steps, model claude-sonnet-4, 8 premium requests',
        confidence: 'high',
        evidence: ['run:test-1'],
        impact: 'medium',
      });

      const patterns = kb.getPatternsByCategory('cost_history');
      assert.strictEqual(patterns.length, 1);
    });
  });

  describe('getPatternsByCategory', () => {
    it('returns empty array for category with no patterns', () => {
      const kb = new KnowledgeBaseManager(testDir);
      assert.deepStrictEqual(kb.getPatternsByCategory('dependency_order'), []);
    });

    it('filters correctly by category', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Practice A', confidence: 'high', evidence: ['e1'], impact: 'low' });
      kb.addOrUpdatePattern({ category: 'anti_pattern', insight: 'Anti A', confidence: 'low', evidence: ['e2'], impact: 'high' });
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Totally different practice B', confidence: 'medium', evidence: ['e3'], impact: 'medium' });

      const practices = kb.getPatternsByCategory('best_practice');
      assert.strictEqual(practices.length, 2);
      assert.strictEqual(kb.getPatternsByCategory('anti_pattern').length, 1);
    });
  });

  describe('getHighConfidencePatterns', () => {
    it('returns only high-confidence patterns', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'High conf unique alpha', confidence: 'high', evidence: ['e1'], impact: 'high' });
      kb.addOrUpdatePattern({ category: 'anti_pattern', insight: 'Low conf unique beta', confidence: 'low', evidence: ['e2'], impact: 'low' });

      const highConf = kb.getHighConfidencePatterns();
      assert.strictEqual(highConf.length, 1);
      assert.ok(highConf[0].insight.includes('alpha'));
    });
  });

  describe('getPlanningRelevantPatterns', () => {
    it('returns dependency_order and best_practice with >= 2 occurrences and non-low confidence', () => {
      const kb = new KnowledgeBaseManager(testDir);

      // Add a pattern and bump its occurrence count
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Relevant planning pattern unique zeta', confidence: 'medium', evidence: ['e1'], impact: 'high' });
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Relevant planning pattern unique zeta again', confidence: 'medium', evidence: ['e2'], impact: 'high' });

      const relevant = kb.getPlanningRelevantPatterns();
      assert.strictEqual(relevant.length, 1);
      assert.strictEqual(relevant[0].occurrences, 2);
    });

    it('excludes low-confidence patterns', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'dependency_order', insight: 'Low conf dep order unique gamma', confidence: 'low', evidence: ['e1'], impact: 'high' });
      kb.addOrUpdatePattern({ category: 'dependency_order', insight: 'Low conf dep order unique gamma repeat', confidence: 'low', evidence: ['e2'], impact: 'high' });

      assert.strictEqual(kb.getPlanningRelevantPatterns().length, 0);
    });
  });

  describe('getAntiPatterns', () => {
    it('returns anti_pattern category with non-low impact', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'anti_pattern', insight: 'Dangerous pattern X unique delta', confidence: 'high', evidence: ['e1'], impact: 'high' });
      kb.addOrUpdatePattern({ category: 'anti_pattern', insight: 'Minor pattern Y unique epsilon', confidence: 'low', evidence: ['e2'], impact: 'low' });

      const antiPatterns = kb.getAntiPatterns();
      assert.strictEqual(antiPatterns.length, 1);
      assert.ok(antiPatterns[0].insight.includes('delta'));
    });
  });

  describe('recordRun', () => {
    it('increments totalRuns and updates avgPatternsPerRun', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Record run test unique theta', confidence: 'high', evidence: ['e1'], impact: 'low' });
      kb.recordRun(1);

      const stats = kb.getStatistics();
      assert.strictEqual(stats.totalRuns, 1);
      assert.ok(stats.avgPatternsPerRun > 0);
    });

    it('accumulates across multiple calls', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.recordRun(2);
      kb.recordRun(3);
      assert.strictEqual(kb.getStatistics().totalRuns, 2);
    });
  });

  describe('prunePatterns', () => {
    it('removes patterns older than specified days', () => {
      const kb = new KnowledgeBaseManager(testDir);
      // Manually seed a very old pattern
      const old: KnowledgeBase = kb.export();
      old.patterns.push({
        id: 'old-1',
        category: 'anti_pattern',
        insight: 'Very old pattern unique iota',
        confidence: 'high',
        evidence: [],
        occurrences: 10,
        firstSeen: '2020-01-01T00:00:00.000Z',
        lastSeen: '2020-01-01T00:00:00.000Z',
        impact: 'high',
        examples: [],
      });
      fs.writeFileSync(path.join(testDir, 'knowledge-base.json'), JSON.stringify(old));

      // Reload and prune
      const kb2 = new KnowledgeBaseManager(testDir);
      const removed = kb2.prunePatterns({ removeOlderThan: 30 });
      assert.ok(removed > 0);
      assert.strictEqual(kb2.getPatternsByCategory('anti_pattern').length, 0);
    });

    it('removes low-confidence patterns', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Low conf to prune unique kappa', confidence: 'low', evidence: [], impact: 'low' });
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'High conf to keep unique lambda', confidence: 'high', evidence: [], impact: 'high' });

      const removed = kb.prunePatterns({ removeLowConfidence: true });
      assert.strictEqual(removed, 1);
      assert.strictEqual(kb.export().patterns.length, 1);
    });

    it('removes rare patterns (occurrences < 2)', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'failure_mode', insight: 'Rare failure unique mu', confidence: 'medium', evidence: [], impact: 'medium' });

      const removed = kb.prunePatterns({ removeRare: true });
      assert.strictEqual(removed, 1);
    });

    it('returns 0 when no patterns match prune criteria', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({ category: 'best_practice', insight: 'Keep me unique nu', confidence: 'high', evidence: [], impact: 'high' });

      const removed = kb.prunePatterns({ removeLowConfidence: true });
      assert.strictEqual(removed, 0);
    });
  });

  describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
      const kb = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb.levenshtein('hello', 'hello'), 0);
    });

    it('returns string length for empty vs non-empty', () => {
      const kb = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb.levenshtein('', 'abc'), 3);
      assert.strictEqual(kb.levenshtein('xyz', ''), 3);
    });

    it('computes correct distance for known pairs', () => {
      const kb = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb.levenshtein('kitten', 'sitting'), 3);
      assert.strictEqual(kb.levenshtein('saturday', 'sunday'), 3);
    });

    it('is symmetric', () => {
      const kb = new KnowledgeBaseManager(testDir);
      assert.strictEqual(kb.levenshtein('abc', 'def'), kb.levenshtein('def', 'abc'));
    });
  });

  describe('findSimilarTasks', () => {
    it('finds patterns with high keyword overlap', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'implement REST API for user management',
        confidence: 'high',
        evidence: ['run:1'],
        impact: 'medium',
      });

      const similar = kb.findSimilarTasks('build a REST API for user management');
      assert.ok(similar.length > 0);
    });

    it('does not match completely unrelated descriptions', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'configure kubernetes deployment pipeline',
        confidence: 'high',
        evidence: ['run:1'],
        impact: 'medium',
      });

      const similar = kb.findSimilarTasks('fix CSS styling in login page');
      assert.strictEqual(similar.length, 0);
    });

    it('returns empty array when KB is empty', () => {
      const kb = new KnowledgeBaseManager(testDir);
      const similar = kb.findSimilarTasks('anything at all');
      assert.deepStrictEqual(similar, []);
    });

    it('respects custom threshold', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'add user authentication',
        confidence: 'high',
        evidence: ['run:1'],
        impact: 'medium',
      });

      // Very high threshold should exclude most matches
      const strict = kb.findSimilarTasks('add user authentication module', 0.99);
      // Very low threshold should include most
      const loose = kb.findSimilarTasks('add user authentication module', 0.1);
      assert.ok(loose.length >= strict.length);
    });

    it('skips patterns with large length difference (pre-filter)', () => {
      const kb = new KnowledgeBaseManager(testDir);
      const longInsight = 'a'.repeat(200);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: longInsight,
        confidence: 'high',
        evidence: ['run:1'],
        impact: 'medium',
      });

      // Short description vs very long insight; length ratio > 2x
      const similar = kb.findSimilarTasks('short');
      assert.strictEqual(similar.length, 0);
    });
  });

  describe('auto-pruning at MAX_PATTERNS', () => {
    it('triggers pruning when pattern count exceeds 500', () => {
      const kb = new KnowledgeBaseManager(testDir);

      // Seed 501 unique patterns (each must be different enough to avoid merging)
      const seeded: KnowledgeBase = kb.export();
      for (let i = 0; i < 501; i++) {
        seeded.patterns.push({
          id: `pattern-${i}`,
          category: 'failure_mode',
          insight: `unique pattern ${i} with identifier ${Math.random().toString(36)}`,
          confidence: 'low',
          evidence: [],
          occurrences: 1,
          firstSeen: '2020-01-01T00:00:00.000Z',
          lastSeen: '2020-01-01T00:00:00.000Z',
          impact: 'low',
          examples: [],
        });
      }
      fs.writeFileSync(path.join(testDir, 'knowledge-base.json'), JSON.stringify(seeded));

      // Reload and add one more to trigger prune
      const kb2 = new KnowledgeBaseManager(testDir);
      kb2.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'trigger prune unique omega',
        confidence: 'high',
        evidence: ['run:prune'],
        impact: 'high',
      });

      // After prune, count should be well below 501
      const finalCount = kb2.export().patterns.length;
      assert.ok(finalCount < 501, `Expected pruning to reduce from 501+, got ${finalCount}`);
    });
  });

  describe('export', () => {
    it('returns a deep copy that does not affect the internal state', () => {
      const kb = new KnowledgeBaseManager(testDir);
      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Export deep copy test unique psi',
        confidence: 'high',
        evidence: ['e1'],
        impact: 'low',
      });

      const exported = kb.export();
      exported.patterns.length = 0; // mutate the export

      assert.strictEqual(kb.export().patterns.length, 1);
    });
  });
});
