import * as assert from 'assert';
import { CommitPatternDetector, CommitMessage, PatternDetectionResult } from '../src/commit-pattern-detector';

describe('CommitPatternDetector', () => {
  let detector: CommitPatternDetector;

  beforeEach(() => {
    detector = new CommitPatternDetector();
  });

  describe('analyzeCommits', () => {
    it('returns perfect score for empty commit list', () => {
      const result = detector.analyzeCommits([]);
      assert.strictEqual(result.hasAntiPatterns, false);
      assert.strictEqual(result.score, 100);
      assert.strictEqual(result.details.commitCount, 0);
      assert.strictEqual(result.details.genericMessages, 0);
      assert.strictEqual(result.warnings.length, 0);
    });

    it('scores well for descriptive commit messages', () => {
      const commits: CommitMessage[] = [
        { hash: 'a1', message: 'add user authentication API with JWT tokens', timestamp: new Date(), files: ['src/auth.ts'] },
        { hash: 'b2', message: 'create login and signup UI components', timestamp: new Date(), files: ['src/Login.tsx', 'src/Signup.tsx'] },
      ];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.score, 100);
      assert.strictEqual(result.hasAntiPatterns, false);
      assert.strictEqual(result.details.commitCount, 2);
    });

    it('detects generic commit messages and deducts score', () => {
      const commits: CommitMessage[] = [
        { hash: 'a1', message: 'update', timestamp: new Date(), files: ['src/a.ts'] },
        { hash: 'b2', message: 'fix bug', timestamp: new Date(), files: ['src/b.ts'] },
      ];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.details.genericMessages, 2);
      assert.ok(result.hasAntiPatterns);
      assert.ok(result.score < 100);
      assert.ok(result.warnings.some(w => w.includes('generic')));
    });

    it('detects repetitive commit messages', () => {
      const msg = 'add feature X';
      const commits: CommitMessage[] = [
        { hash: 'a1', message: msg, timestamp: new Date(), files: ['a.ts'] },
        { hash: 'b2', message: msg, timestamp: new Date(), files: ['b.ts'] },
        { hash: 'c3', message: msg, timestamp: new Date(), files: ['c.ts'] },
      ];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.details.repetitivePatterns, 1);
      assert.ok(result.warnings.some(w => w.includes('repetitive')));
    });

    it('detects single-commit dump with many files', () => {
      const commits: CommitMessage[] = [{
        hash: 'a1',
        message: 'implement entire feature',
        timestamp: new Date(),
        files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
      }];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.details.singleCommitDump, true);
      assert.ok(result.warnings.some(w => w.includes('Single-commit dump')));
    });

    it('does not flag single commit with few files as dump', () => {
      const commits: CommitMessage[] = [{
        hash: 'a1',
        message: 'fix typo in readme',
        timestamp: new Date(),
        files: ['README.md'],
      }];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.details.singleCommitDump, false);
    });

    it('detects high files-per-commit average', () => {
      const commits: CommitMessage[] = [
        { hash: 'a1', message: 'big change 1', timestamp: new Date(), files: Array(10).fill('f.ts') },
        { hash: 'b2', message: 'big change 2', timestamp: new Date(), files: Array(10).fill('g.ts') },
      ];
      const result = detector.analyzeCommits(commits);
      assert.ok(result.details.averageFilesPerCommit > 8);
      assert.ok(result.warnings.some(w => w.includes('files-per-commit')));
    });

    it('clamps score to 0 when heavily penalized', () => {
      // Stack multiple anti-patterns to push score well below 0
      const commits: CommitMessage[] = [
        { hash: 'a1', message: 'wip', timestamp: new Date(), files: Array(10).fill('f.ts') },
        { hash: 'b2', message: 'wip', timestamp: new Date(), files: Array(10).fill('g.ts') },
        { hash: 'c3', message: 'wip', timestamp: new Date(), files: Array(10).fill('h.ts') },
        { hash: 'd4', message: 'temp', timestamp: new Date(), files: Array(10).fill('i.ts') },
        { hash: 'e5', message: 'temp', timestamp: new Date(), files: Array(10).fill('j.ts') },
        { hash: 'f6', message: 'temp', timestamp: new Date(), files: Array(10).fill('k.ts') },
        { hash: 'g7', message: 'stuff', timestamp: new Date(), files: Array(10).fill('l.ts') },
      ];
      const result = detector.analyzeCommits(commits);
      assert.strictEqual(result.score, 0);
    });

    it('score clamps to 100 (all passing)', () => {
      // Single clean commit should not exceed 100
      const commits: CommitMessage[] = [
        { hash: 'a1', message: 'add user model with validation', timestamp: new Date(), files: ['src/user.ts'] },
      ];
      const result = detector.analyzeCommits(commits);
      assert.ok(result.score <= 100);
    });
  });

  describe('isGenericMessage', () => {
    it('flags known generic patterns', () => {
      const generic = ['update', 'fix', 'wip', 'temp', 'done', 'misc', 'stuff', 'changes', 'refactor', 'cleanup'];
      for (const msg of generic) {
        assert.ok(detector.isGenericMessage(msg), `Expected "${msg}" to be flagged as generic`);
      }
    });

    it('does not flag descriptive messages', () => {
      const descriptive = [
        'add JWT authentication to login endpoint',
        'fix off-by-one error in pagination logic',
        'remove deprecated API v1 handlers',
      ];
      for (const msg of descriptive) {
        assert.ok(!detector.isGenericMessage(msg), `Expected "${msg}" NOT to be flagged as generic`);
      }
    });

    it('is case-insensitive', () => {
      assert.ok(detector.isGenericMessage('WIP'));
      assert.ok(detector.isGenericMessage('Temp'));
      assert.ok(detector.isGenericMessage('DONE'));
    });
  });

  describe('getSuggestions', () => {
    it('returns no suggestions for clean results', () => {
      const clean: PatternDetectionResult = {
        hasAntiPatterns: false,
        warnings: [],
        score: 100,
        details: { genericMessages: 0, repetitivePatterns: 0, singleCommitDump: false, averageFilesPerCommit: 2, commitCount: 3 },
      };
      const suggestions = detector.getSuggestions(clean);
      assert.strictEqual(suggestions.length, 0);
    });

    it('suggests specific messages when generic messages found', () => {
      const result: PatternDetectionResult = {
        hasAntiPatterns: true,
        warnings: [],
        score: 70,
        details: { genericMessages: 2, repetitivePatterns: 0, singleCommitDump: false, averageFilesPerCommit: 2, commitCount: 3 },
      };
      const suggestions = detector.getSuggestions(result);
      assert.ok(suggestions.some(s => s.includes('descriptive commit messages')));
    });

    it('suggests breaking up work for single-commit dump', () => {
      const result: PatternDetectionResult = {
        hasAntiPatterns: true,
        warnings: [],
        score: 60,
        details: { genericMessages: 0, repetitivePatterns: 0, singleCommitDump: true, averageFilesPerCommit: 8, commitCount: 1 },
      };
      const suggestions = detector.getSuggestions(result);
      assert.ok(suggestions.some(s => s.includes('multiple logical commits')));
    });

    it('suggests reviewing guidelines when score is low', () => {
      const result: PatternDetectionResult = {
        hasAntiPatterns: true,
        warnings: [],
        score: 50,
        details: { genericMessages: 3, repetitivePatterns: 1, singleCommitDump: false, averageFilesPerCommit: 5, commitCount: 4 },
      };
      const suggestions = detector.getSuggestions(result);
      assert.ok(suggestions.some(s => s.includes('commit guidelines')));
    });

    it('suggests varying messages for repetitive patterns', () => {
      const result: PatternDetectionResult = {
        hasAntiPatterns: true,
        warnings: [],
        score: 80,
        details: { genericMessages: 0, repetitivePatterns: 2, singleCommitDump: false, averageFilesPerCommit: 3, commitCount: 5 },
      };
      const suggestions = detector.getSuggestions(result);
      assert.ok(suggestions.some(s => s.includes('Vary commit messages')));
    });

    it('suggests smaller commits for high files-per-commit', () => {
      const result: PatternDetectionResult = {
        hasAntiPatterns: true,
        warnings: [],
        score: 75,
        details: { genericMessages: 0, repetitivePatterns: 0, singleCommitDump: false, averageFilesPerCommit: 12, commitCount: 3 },
      };
      const suggestions = detector.getSuggestions(result);
      assert.ok(suggestions.some(s => s.includes('smaller, more focused')));
    });
  });
});
