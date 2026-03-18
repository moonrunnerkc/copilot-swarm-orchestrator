import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { KnowledgeBaseManager } from '../src/knowledge-base';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-guard-'));
}

describe('knowledge-base growth guards', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  describe('auto-prune at 500 patterns', () => {
    it('triggers prunePatterns when crossing the 500 threshold', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      // Inject 500 patterns with stale dates and low confidence
      // to ensure they get pruned
      const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const patterns = [];
      for (let i = 0; i < 500; i++) {
        patterns.push({
          id: `test-${i}`,
          category: 'best_practice' as const,
          insight: `stale pattern number ${i}`,
          confidence: 'low' as const,
          evidence: [],
          occurrences: 1,
          firstSeen: staleDate,
          lastSeen: staleDate,
          impact: 'low' as const,
          examples: [],
        });
      }

      // Write directly to the knowledge base file to set up the 500 patterns
      const kbPath = path.join(dir, 'knowledge-base.json');
      const kbData = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        patterns,
        statistics: { totalRuns: 1, totalPatterns: 500, avgPatternsPerRun: 500 },
      };
      fs.writeFileSync(kbPath, JSON.stringify(kbData), 'utf8');

      // Reload to pick up the seeded data
      const kb2 = new KnowledgeBaseManager(dir);

      // This 501st pattern should trigger auto-prune
      kb2.addOrUpdatePattern({
        category: 'cost_history',
        insight: 'fresh pattern that survives',
        confidence: 'high',
        evidence: ['test'],
        impact: 'high',
      });

      const stats = kb2.getStatistics();
      // The stale, low-confidence patterns should have been pruned
      assert.ok(stats.totalPatterns < 500,
        `Expected fewer than 500 patterns after prune, got ${stats.totalPatterns}`);
      assert.ok(stats.totalPatterns >= 1,
        'The fresh high-confidence pattern should survive');
    });

    it('does not prune when under 500 patterns', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      // Use categorically distinct insights so isSimilarInsight does not merge them
      const categories: Array<'best_practice' | 'failure_mode' | 'anti_pattern'> = [
        'best_practice', 'failure_mode', 'anti_pattern',
      ];
      const topics = [
        'database migration rollback strategy',
        'React component rendering lifecycle',
        'kubernetes pod autoscaling thresholds',
        'GraphQL resolver caching behavior',
        'webpack bundle size optimization technique',
        'Python async generator memory footprint',
        'Redis pub sub connection pooling pattern',
        'Docker multi stage build layer pruning',
        'Terraform state locking conflict resolution',
        'Elasticsearch index mapping version control',
      ];
      for (let i = 0; i < 10; i++) {
        kb.addOrUpdatePattern({
          category: categories[i % categories.length],
          insight: topics[i],
          confidence: 'low',
          evidence: [],
          impact: 'low',
        });
      }

      assert.strictEqual(kb.getStatistics().totalPatterns, 10);
    });
  });

  describe('findSimilarTasks length pre-filter', () => {
    it('returns no matches when description is much longer than stored patterns', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'short',
        confidence: 'high',
        evidence: [],
        impact: 'medium',
      });

      // Description is >2x longer than insight; pre-filter should skip it
      const longDesc = 'a very long description that is much much longer than the short pattern stored above and should not match because of the length pre-filter';
      const results = kb.findSimilarTasks(longDesc);
      assert.strictEqual(results.length, 0);
    });

    it('still matches patterns of similar length', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      kb.addOrUpdatePattern({
        category: 'best_practice',
        insight: 'Build REST API with authentication and user management',
        confidence: 'high',
        evidence: [],
        impact: 'medium',
      });

      const results = kb.findSimilarTasks(
        'Build REST API with authentication and user management'
      );
      assert.strictEqual(results.length, 1);
    });
  });

  describe('levenshtein delegation', () => {
    it('delegates to shared text-similarity module', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      assert.strictEqual(kb.levenshtein('kitten', 'sitting'), 3);
      assert.strictEqual(kb.levenshtein('', ''), 0);
    });
  });
});
