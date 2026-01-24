import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import VerifierEngine, { VerificationResult } from '../src/verifier-engine';

describe('VerifierEngine', () => {
  let testDir: string;
  let verifier: VerifierEngine;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-test-'));
    verifier = new VerifierEngine(testDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('verifyStep', () => {
    it('should fail verification if transcript does not exist', async () => {
      const result = await verifier.verifyStep(
        1,
        'test-agent',
        path.join(testDir, 'nonexistent.md'),
        { requireTests: true }
      );

      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.checks.length, 1);
      assert.ok(result.checks[0].description.includes('Transcript file exists'));
      assert.strictEqual(result.checks[0].passed, false);
    });

    it('should verify tests when test output is present', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

\`\`\`bash
$ npm test
\`\`\`

Output:
228 passing (5s)
1 pending
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'test-agent',
        transcriptPath,
        { requireTests: true }
      );

      const testCheck = result.checks.find(c => c.type === 'test');
      assert.ok(testCheck);
      assert.strictEqual(testCheck?.passed, true);
      assert.ok(testCheck?.evidence?.includes('test'));
    });

    it('should fail verification when tests are required but missing', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

No test commands run.
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'test-agent',
        transcriptPath,
        { requireTests: true }
      );

      const testCheck = result.checks.find(c => c.type === 'test');
      assert.ok(testCheck);
      assert.strictEqual(testCheck?.passed, false);
      assert.ok(testCheck?.reason?.includes('No test commands found'));
    });

    it('should verify build when build output is present', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

\`\`\`bash
$ npm run build
\`\`\`

Output:
Successfully built
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'build-agent',
        transcriptPath,
        { requireBuild: true }
      );

      const buildCheck = result.checks.find(c => c.type === 'build');
      assert.ok(buildCheck);
      assert.strictEqual(buildCheck?.passed, true);
    });

    it('should verify git commits when present', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

\`\`\`bash
$ git commit -m "add feature"
\`\`\`

Output:
[main abc1234] add feature
 2 files changed, 10 insertions(+)
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'dev-agent',
        transcriptPath,
        { requireCommits: true }
      );

      const commitCheck = result.checks.find(c => c.type === 'commit');
      assert.ok(commitCheck);
      assert.strictEqual(commitCheck?.passed, true);
      assert.ok(commitCheck?.evidence?.includes('add feature'));
    });

    it('should detect unverified claims', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

All tests passed successfully!
Build succeeded!
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'claim-agent',
        transcriptPath
      );

      assert.ok(result.unverifiedClaims.length > 0);
      // unverified claims are warnings, not hard failures (no required checks specified)
      assert.strictEqual(result.passed, true);
    });

    it('should pass when all required checks pass and no unverified claims', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const transcriptContent = `
# Session Transcript

\`\`\`bash
$ npm test
\`\`\`

Output:
228 passing (5s)

\`\`\`bash
$ npm run build
\`\`\`

Output:
Successfully built in 2.3s

\`\`\`bash
$ git commit -m "implement feature"
\`\`\`

Output:
[main def5678] implement feature
 3 files changed, 25 insertions(+)
      `;

      fs.writeFileSync(transcriptPath, transcriptContent);

      const result = await verifier.verifyStep(
        1,
        'full-agent',
        transcriptPath,
        {
          requireTests: true,
          requireBuild: true,
          requireCommits: true
        }
      );

      assert.strictEqual(result.passed, true);
      assert.ok(result.checks.every(c => !c.required || c.passed));
    });
  });

  describe('generateVerificationReport', () => {
    it('should generate a markdown report file', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const reportPath = path.join(testDir, 'verification-report.md');

      fs.writeFileSync(transcriptPath, '# Test transcript\n\nNo content.');

      const result: VerificationResult = {
        stepNumber: 1,
        agentName: 'test-agent',
        passed: true,
        checks: [
          {
            type: 'test',
            description: 'Tests executed',
            required: true,
            passed: true,
            evidence: 'npm test ran successfully'
          }
        ],
        unverifiedClaims: [],
        timestamp: new Date().toISOString(),
        transcriptPath
      };

      await verifier.generateVerificationReport(result, reportPath);

      assert.ok(fs.existsSync(reportPath));
      const reportContent = fs.readFileSync(reportPath, 'utf8');
      assert.ok(reportContent.includes('# Verification Report'));
      assert.ok(reportContent.includes('test-agent'));
      assert.ok(reportContent.includes('✅ PASSED'));
      assert.ok(reportContent.includes('Tests executed'));
    });

    it('should include unverified claims in report', async () => {
      const transcriptPath = path.join(testDir, 'transcript.md');
      const reportPath = path.join(testDir, 'verification-report.md');

      fs.writeFileSync(transcriptPath, '# Test transcript');

      const result: VerificationResult = {
        stepNumber: 2,
        agentName: 'claim-agent',
        passed: false,
        checks: [],
        unverifiedClaims: ['All tests passed', 'Build succeeded'],
        timestamp: new Date().toISOString(),
        transcriptPath
      };

      await verifier.generateVerificationReport(result, reportPath);

      const reportContent = fs.readFileSync(reportPath, 'utf8');
      assert.ok(reportContent.includes('Unverified Claims'));
      assert.ok(reportContent.includes('All tests passed'));
      assert.ok(reportContent.includes('Build succeeded'));
    });
  });

  describe('rollback', () => {
    it('should return success when rollback completes', async () => {
      // Initialize a git repo for testing
      await verifier['runGitCommand'](['init']);
      await verifier['runGitCommand'](['config', 'user.email', 'test@test.com']);
      await verifier['runGitCommand'](['config', 'user.name', 'Test User']);

      // Create initial commit
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'initial content');
      await verifier['runGitCommand'](['add', '.']);
      await verifier['runGitCommand'](['commit', '-m', 'initial commit']);

      // Make some changes
      fs.writeFileSync(testFile, 'modified content');
      await verifier['runGitCommand'](['add', '.']);

      // Rollback
      const result = await verifier.rollback(1, undefined, [testFile]);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.error, undefined);

      // Verify file was restored
      const content = fs.readFileSync(testFile, 'utf8');
      assert.strictEqual(content, 'initial content');
    });

    it('should delete branch if specified', async () => {
      // Initialize git repo with a master branch first
      await verifier['runGitCommand'](['init', '-b', 'main']);
      await verifier['runGitCommand'](['config', 'user.email', 'test@test.com']);
      await verifier['runGitCommand'](['config', 'user.name', 'Test User']);

      // Create initial commit on main
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'content');
      await verifier['runGitCommand'](['add', '.']);
      await verifier['runGitCommand'](['commit', '-m', 'initial']);

      // Create a test branch
      await verifier['runGitCommand'](['checkout', '-b', 'test-branch']);

      // Rollback should delete the branch
      const result = await verifier.rollback(1, 'test-branch');

      assert.strictEqual(result.success, true);

      // Verify we're back on main
      const currentBranch = await verifier['runGitCommand'](['branch', '--show-current']);
      assert.strictEqual(currentBranch.trim(), 'main');

      // Verify branch is deleted
      const branches = await verifier['runGitCommand'](['branch']);
      assert.ok(!branches.includes('test-branch'));
    });
  });

  describe('commitVerificationReport', () => {
    it('should commit report with natural message', async () => {
      // Initialize git repo with main branch
      await verifier['runGitCommand'](['init', '-b', 'main']);
      await verifier['runGitCommand'](['config', 'user.email', 'test@test.com']);
      await verifier['runGitCommand'](['config', 'user.name', 'Test User']);

      // Create initial commit (needed for next commit)
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'initial');
      await verifier['runGitCommand'](['add', '.']);
      await verifier['runGitCommand'](['commit', '-m', 'initial']);

      // Create report
      const reportPath = path.join(testDir, 'report.md');
      fs.writeFileSync(reportPath, '# Verification Report\n\nTest passed.');

      // Commit report
      await verifier.commitVerificationReport(reportPath, 1, 'test-agent', true);

      // Verify commit was made
      const log = await verifier['runGitCommand'](['log', '--oneline', '-1']);
      assert.ok(log.includes('step 1'));
      assert.ok(log.toLowerCase().match(/verif|test-agent/));
    });
  });
});
