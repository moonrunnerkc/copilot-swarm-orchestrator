import { spawn } from 'child_process';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ShareParser, { ShareIndex } from './share-parser';
import { HookGenerator, EvidenceEntry } from './hook-generator';

export interface VerificationCheck {
  type: 'test' | 'build' | 'lint' | 'commit' | 'claim' | 'output'
    | 'git_diff' | 'file_existence' | 'build_exec' | 'test_exec';
  description: string;
  required: boolean;
  passed: boolean;
  evidence?: string;
  reason?: string;
}

export interface VerificationResult {
  stepNumber: number;
  agentName: string;
  passed: boolean;
  checks: VerificationCheck[];
  unverifiedClaims: string[];
  timestamp: string;
  transcriptPath: string;
  gracefulFailure?: boolean;
  degradationReason?: string | undefined;
  failureContext?: string | undefined;
  summary?: string | undefined;
  baseSha?: string | undefined;
}

export interface OutcomeVerificationOpts {
  workdir: string;
  baseSha: string;
  expectedFiles?: string[];
}

export interface RollbackResult {
  success: boolean;
  commitReverted?: string;
  filesRestored: string[];
  error?: string;
}

/**
 * Truncate output to the last 20 lines for error display.
 * Returns the full string if it has 20 lines or fewer.
 */
export function last20Lines(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= 20) return output;
  return '...\n' + lines.slice(-20).join('\n');
}

// Ordering for failure context: more actionable types first
const FAILURE_TYPE_PRIORITY: Record<string, number> = {
  file_existence: 0,
  test_exec: 1,
  build_exec: 2,
  git_diff: 3,
};

/**
 * Build a structured failure context string from failed checks.
 * Ordered by actionability and truncated to ~500 tokens (2000 chars).
 */
export function buildFailureContext(checks: VerificationCheck[]): string {
  const failed = checks.filter(c => !c.passed);
  if (failed.length === 0) return '';

  failed.sort((a, b) => {
    const pa = FAILURE_TYPE_PRIORITY[a.type] ?? 10;
    const pb = FAILURE_TYPE_PRIORITY[b.type] ?? 10;
    return pa - pb;
  });

  const lines = failed.map(c => `- ${c.type}: ${c.reason || c.description}`);
  const joined = lines.join('\n');

  // ~500 tokens at 4 chars/token = 2000 chars
  if (joined.length > 2000) {
    return joined.slice(0, 2000) + '\n... (truncated)';
  }
  return joined;
}

/**
 * Verifier Engine - proactive real-time verification and drift prevention
 * Validates agent claims against actual evidence in transcripts
 */
export class VerifierEngine {
  private shareParser: ShareParser;
  private workingDir: string;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.shareParser = new ShareParser();
  }

  /**
   * Verify a completed step by analyzing its transcript
   */
  async verifyStep(
    stepNumber: number,
    agentName: string,
    transcriptPath: string,
    requirements?: {
      requireTests?: boolean;
      requireBuild?: boolean;
      requireCommits?: boolean;
      gracefulDegradation?: boolean; // Allow continuation even if verification fails
    },
    preParsedIndex?: ShareIndex,
    evidenceLogPath?: string,
    outcomeOpts?: OutcomeVerificationOpts
  ): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];
    const unverifiedClaims: string[] = [];

    // Read and parse transcript
    if (!fs.existsSync(transcriptPath)) {
      return {
        stepNumber,
        agentName,
        passed: false,
        checks: [{
          type: 'claim',
          description: 'Transcript file exists',
          required: true,
          passed: false,
          reason: `Transcript not found: ${transcriptPath}`
        }],
        unverifiedClaims: [],
        timestamp: new Date().toISOString(),
        transcriptPath
      };
    }

    // Skip re-parse when the caller already parsed the transcript
    const shareIndex = preParsedIndex ?? (() => {
      const transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
      return this.shareParser.parse(transcriptContent);
    })();

    // Verify tests if required
    if (requirements?.requireTests) {
      const testCheck = this.verifyTests(shareIndex);
      checks.push(testCheck);
    }

    // Verify build if required
    if (requirements?.requireBuild) {
      const buildCheck = this.verifyBuild(shareIndex);
      checks.push(buildCheck);
    }

    // Verify commits if required
    if (requirements?.requireCommits) {
      const commitCheck = this.verifyCommits(shareIndex);
      checks.push(commitCheck);
    }

    // Check for unverified claims (drift detection) - these are warnings only
    const claimCheck = this.verifyAllClaims(shareIndex);
    checks.push(...claimCheck.checks);
    unverifiedClaims.push(...claimCheck.unverifiedClaims);

    // Cross-reference hook evidence against transcript claims (defense in depth)
    if (evidenceLogPath) {
      const hookEvidence = this.crossReferenceEvidence(shareIndex, evidenceLogPath);
      checks.push(...hookEvidence);
    }

    // Outcome-based checks: run when the caller provides worktree info
    if (outcomeOpts) {
      const outcomeChecks = this.runOutcomeChecks(outcomeOpts);
      checks.push(...outcomeChecks);

      // Demote transcript-parsed test/build checks when real execution checks exist
      const hasOutcomeExecChecks = checks.some(
        c => c.type === 'build_exec' || c.type === 'test_exec'
      );
      if (hasOutcomeExecChecks) {
        for (const c of checks) {
          if (c.type === 'build' || c.type === 'test') {
            c.required = false;
          }
        }
      }
    }

    // Overall pass/fail: every required check must pass (vacuously true when none are required)
    const passed = checks.every(c => !c.required || c.passed);

    // Build failure context for repair agent consumption
    const failureContext = passed ? undefined : buildFailureContext(checks);
    const summary = this.buildSummary(checks, passed);

    // Apply graceful degradation if enabled and verification failed
    let gracefulFailure = false;
    let degradationReason: string | undefined;

    if (!passed && requirements?.gracefulDegradation) {
      gracefulFailure = true;
      const failedRequired = checks.filter(c => c.required && !c.passed);
      degradationReason = `Verification failed but graceful degradation enabled. Failed checks: ${failedRequired.map(c => c.type).join(', ')}`;
    }

    const result: VerificationResult = {
      stepNumber,
      agentName,
      passed: passed || gracefulFailure,
      checks,
      unverifiedClaims,
      timestamp: new Date().toISOString(),
      transcriptPath,
      gracefulFailure,
      degradationReason,
      failureContext,
      summary,
      baseSha: outcomeOpts?.baseSha,
    };

    return result;
  }

  /**
   * Run outcome-based checks against the actual worktree state.
   * These checks verify what the agent actually produced, independent of
   * what the transcript claims.
   */
  private runOutcomeChecks(opts: OutcomeVerificationOpts): VerificationCheck[] {
    const checks: VerificationCheck[] = [];

    checks.push(this.checkGitDiff(opts.workdir, opts.baseSha));

    if (opts.expectedFiles && opts.expectedFiles.length > 0) {
      checks.push(this.checkFileExistence(opts.workdir, opts.expectedFiles));
    }

    const buildCheck = this.checkBuildExec(opts.workdir);
    if (buildCheck) {
      checks.push(buildCheck);
    }

    const testCheck = this.checkTestExec(opts.workdir);
    if (testCheck) {
      checks.push(testCheck);
    }

    return checks;
  }

  /**
   * git_diff: verifies the agent made at least one change since baseSha.
   */
  private checkGitDiff(workdir: string, baseSha: string): VerificationCheck {
    try {
      const diffOutput = execSync(
        `git diff --stat ${baseSha}..HEAD`,
        { cwd: workdir, encoding: 'utf8', timeout: 10_000 }
      ).trim();

      if (!diffOutput) {
        return {
          type: 'git_diff',
          description: 'Agent produced code changes',
          required: true,
          passed: false,
          reason: `No changes detected since ${baseSha.slice(0, 8)}`,
        };
      }

      // Parse summary line (e.g. "3 files changed, 42 insertions(+), 5 deletions(-)")
      const lines = diffOutput.split('\n');
      const summaryLine = lines[lines.length - 1] || '';

      return {
        type: 'git_diff',
        description: 'Agent produced code changes',
        required: true,
        passed: true,
        evidence: summaryLine.trim(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        type: 'git_diff',
        description: 'Agent produced code changes',
        required: true,
        passed: false,
        reason: `git diff failed: ${msg.split('\n')[0]}`,
      };
    }
  }

  /**
   * file_existence: checks that expected files exist in the worktree.
   */
  private checkFileExistence(workdir: string, expectedFiles: string[]): VerificationCheck {
    const missing: string[] = [];
    const present: string[] = [];

    for (const file of expectedFiles) {
      const fullPath = path.join(workdir, file);
      if (fs.existsSync(fullPath)) {
        present.push(file);
      } else {
        missing.push(file);
      }
    }

    if (missing.length > 0) {
      return {
        type: 'file_existence',
        description: 'Expected files exist in worktree',
        required: true,
        passed: false,
        reason: `Missing files: ${missing.join(', ')}`,
        evidence: `${present.length}/${expectedFiles.length} present`,
      };
    }

    return {
      type: 'file_existence',
      description: 'Expected files exist in worktree',
      required: true,
      passed: true,
      evidence: `All ${expectedFiles.length} expected file(s) found`,
    };
  }

  /**
   * build_exec: detects and runs the build command in the worktree.
   * Returns null if no build script detected (no check generated).
   */
  private checkBuildExec(workdir: string): VerificationCheck | null {
    const buildCmd = this.detectBuildCommand(workdir);
    if (!buildCmd) return null;

    try {
      execSync(buildCmd, {
        cwd: workdir,
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return {
        type: 'build_exec',
        description: `Build succeeded (${buildCmd})`,
        required: true,
        passed: true,
        evidence: `Ran "${buildCmd}" in worktree`,
      };
    } catch (err: unknown) {
      const output = this.extractCommandOutput(err);
      return {
        type: 'build_exec',
        description: `Build failed (${buildCmd})`,
        required: true,
        passed: false,
        reason: last20Lines(output),
      };
    }
  }

  /**
   * test_exec: detects and runs the test command in the worktree.
   * Returns null if no test script detected (no check generated).
   */
  private checkTestExec(workdir: string): VerificationCheck | null {
    const testCmd = this.detectTestCommand(workdir);
    if (!testCmd) return null;

    try {
      execSync(testCmd, {
        cwd: workdir,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return {
        type: 'test_exec',
        description: `Tests passed (${testCmd})`,
        required: true,
        passed: true,
        evidence: `Ran "${testCmd}" in worktree`,
      };
    } catch (err: unknown) {
      const output = this.extractCommandOutput(err);

      // Node.js v24+ has a bug where `node --test <dir>` fails with
      // MODULE_NOT_FOUND in ESM projects ("type": "module"). The CJS
      // loader tries to resolve the directory as a require path instead
      // of discovering test files. Fall back to `node --test` which uses
      // auto-discovery and works correctly in both CJS and ESM projects.
      if (testCmd === 'npm test' && output.includes('MODULE_NOT_FOUND')) {
        const fallback = this.retryTestWithAutoDiscovery(workdir);
        if (fallback) return fallback;
      }

      return {
        type: 'test_exec',
        description: `Tests failed (${testCmd})`,
        required: true,
        passed: false,
        reason: last20Lines(output),
      };
    }
  }

  /**
   * Retry test execution using `node --test` auto-discovery when `npm test`
   * fails due to the ESM directory resolution bug in Node.js v24+.
   * Returns null if the fallback also fails or is not applicable.
   */
  private retryTestWithAutoDiscovery(workdir: string): VerificationCheck | null {
    const pkgPath = path.join(workdir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const testScript: string = pkg.scripts?.test || '';
      // Only retry when the test script passes a directory to node --test
      if (!/node\s+--test\s+\S+/.test(testScript)) return null;
    } catch {
      return null;
    }

    const fallbackCmd = 'node --test';
    try {
      execSync(fallbackCmd, {
        cwd: workdir,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return {
        type: 'test_exec',
        description: `Tests passed (${fallbackCmd}, auto-discovery fallback)`,
        required: true,
        passed: true,
        evidence: `Original npm test hit ESM directory bug; retried with "${fallbackCmd}"`,
      };
    } catch {
      // Fallback also failed; let the original error propagate
      return null;
    }
  }

  /**
   * Detect build command from project config files.
   */
  private detectBuildCommand(workdir: string): string | null {
    const pkgPath = path.join(workdir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.build) return 'npm run build';
      } catch { /* malformed package.json; skip */ }
    }

    const makefilePath = path.join(workdir, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      const content = fs.readFileSync(makefilePath, 'utf8');
      if (/^build\s*:/m.test(content)) return 'make build';
    }

    return null;
  }

  /**
   * Detect test command from project config files.
   */
  private detectTestCommand(workdir: string): string | null {
    const pkgPath = path.join(workdir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.test) return 'npm test';
      } catch { /* malformed package.json; skip */ }
    }

    const makefilePath = path.join(workdir, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      const content = fs.readFileSync(makefilePath, 'utf8');
      if (/^test\s*:/m.test(content)) return 'make test';
    }

    return null;
  }

  /**
   * Extract stdout+stderr from a child_process error for truncated display.
   */
  private extractCommandOutput(err: unknown): string {
    if (err && typeof err === 'object') {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const parts: string[] = [];
      if (e.stdout) parts.push(e.stdout);
      if (e.stderr) parts.push(e.stderr);
      if (parts.length > 0) return parts.join('\n');
      if (e.message) return e.message;
    }
    return String(err);
  }

  /**
   * One-line summary of verification outcome.
   */
  private buildSummary(checks: VerificationCheck[], passed: boolean): string {
    const total = checks.length;
    const passedCount = checks.filter(c => c.passed).length;
    const requiredFailed = checks.filter(c => c.required && !c.passed).length;
    if (passed) {
      return `${passedCount}/${total} checks passed`;
    }
    return `${requiredFailed} required check(s) failed out of ${total} total`;
  }

  /**
   * Verify that tests were actually executed
   */
  private verifyTests(shareIndex: ShareIndex): VerificationCheck {
    const testsRun = shareIndex.testsRun;

    if (testsRun.length === 0) {
      return {
        type: 'test',
        description: 'Tests executed',
        required: true,
        passed: false,
        reason: 'No test commands found in transcript'
      };
    }

    const verifiedTests = testsRun.filter(t => t.verified);

    if (verifiedTests.length === 0) {
      return {
        type: 'test',
        description: 'Tests executed with output',
        required: true,
        passed: false,
        reason: 'Test commands found but no test output detected',
        evidence: `Commands: ${testsRun.map(t => t.command).join(', ')}`
      };
    }

    return {
      type: 'test',
      description: 'Tests executed successfully',
      required: true,
      passed: true,
      evidence: `${verifiedTests.length} test(s) verified: ${verifiedTests.map(t => t.command).join(', ')}`
    };
  }

  /**
   * Verify that build succeeded
   */
  private verifyBuild(shareIndex: ShareIndex): VerificationCheck {
    const builds = shareIndex.buildOperations;

    if (builds.length === 0) {
      return {
        type: 'build',
        description: 'Build executed',
        required: true,
        passed: false,
        reason: 'No build commands found in transcript'
      };
    }

    const verifiedBuilds = builds.filter(b => b.verified);

    if (verifiedBuilds.length === 0) {
      return {
        type: 'build',
        description: 'Build succeeded',
        required: true,
        passed: false,
        reason: 'Build commands found but no success output detected',
        evidence: `Tools: ${builds.map(b => b.tool).join(', ')}`
      };
    }

    return {
      type: 'build',
      description: 'Build succeeded',
      required: true,
      passed: true,
      evidence: `Verified builds: ${verifiedBuilds.map(b => b.tool).join(', ')}`
    };
  }

  /**
   * Verify that commits were made
   */
  private verifyCommits(shareIndex: ShareIndex): VerificationCheck {
    const commits = shareIndex.gitCommits;

    if (commits.length === 0) {
      return {
        type: 'commit',
        description: 'Git commits made',
        required: true,
        passed: false,
        reason: 'No git commits found in transcript'
      };
    }

    const verifiedCommits = commits.filter(c => c.verified);

    if (verifiedCommits.length === 0) {
      return {
        type: 'commit',
        description: 'Git commits verified',
        required: true,
        passed: false,
        reason: 'Commit messages found but not verified in output'
      };
    }

    return {
      type: 'commit',
      description: 'Git commits verified',
      required: true,
      passed: true,
      evidence: `${verifiedCommits.length} commit(s): ${verifiedCommits.map(c => c.message).slice(0, 3).join('; ')}${verifiedCommits.length > 3 ? '...' : ''}`
    };
  }

  /**
   * Verify all claims made in transcript against evidence
   */
  private verifyAllClaims(shareIndex: ShareIndex): {
    checks: VerificationCheck[];
    unverifiedClaims: string[];
  } {
    const checks: VerificationCheck[] = [];
    const unverifiedClaims: string[] = [];

    // Check all claims from parser
    shareIndex.claims.forEach(claim => {
      if (!claim.verified) {
        checks.push({
          type: 'claim',
          description: `Verify claim: "${claim.claim.substring(0, 50)}..."`,
          required: false,
          passed: false,
          reason: claim.evidence || 'No evidence found',
          evidence: claim.claim
        });
        unverifiedClaims.push(claim.claim);
      }
    });

    return { checks, unverifiedClaims };
  }

  /**
   * Verify expected outputs by checking files and content in the worktree.
   * Each expectedOutput string is parsed for file paths and key terms,
   * then verified against the actual file system.
   */
  verifyExpectedOutputs(
    stepNumber: number,
    agentName: string,
    expectedOutputs: string[],
    worktreeDir: string
  ): VerificationCheck[] {
    const checks: VerificationCheck[] = [];

    // Regex to extract file paths from expected output descriptions
    const filePathRegex = /\b((?:src|test|tests|server|config|public)\/[\w./-]+\.\w+|[\w-]+\.\w{2,4})\b/g;
    // Key terms that can be grepped in source files
    const termPatterns: Array<{ term: string; regex: RegExp }> = [
      { term: 'aria-label', regex: /aria-label/i },
      { term: 'aria-live', regex: /aria-live/i },
      { term: 'role="alert"', regex: /role\s*=\s*["']alert["']/i },
      { term: 'focus-visible', regex: /:focus-visible/i },
      { term: 'skip-link', regex: /skip-link|skip.to.content|#main-content/i },
      { term: 'ErrorBoundary', regex: /ErrorBoundary/i },
      { term: 'AbortController', regex: /AbortController/i },
      { term: 'retry', regex: /retry|backoff/i },
      { term: 'responsive breakpoint', regex: /@media\s*\(/i },
      { term: 'heading hierarchy', regex: /<h[12]/i },
      { term: 'skeleton shimmer', regex: /skeleton|shimmer/i },
      { term: 'animation', regex: /animation\s*[:={]/i }
    ];

    for (const expected of expectedOutputs) {
      const filePaths: string[] = [];
      let match: RegExpExecArray | null;
      const pathRegex = new RegExp(filePathRegex.source, 'g');

      while ((match = pathRegex.exec(expected)) !== null) {
        // Skip common false positives like version numbers
        if (/^\d+\.\d+/.test(match[1])) continue;
        filePaths.push(match[1]);
      }

      if (filePaths.length > 0) {
        // File-existence check: verify at least one mentioned file exists
        const existingFiles = filePaths.filter(fp => {
          const fullPath = path.join(worktreeDir, fp);
          return fs.existsSync(fullPath);
        });

        if (existingFiles.length > 0) {
          checks.push({
            type: 'output',
            description: `Expected files present: ${existingFiles.join(', ')}`,
            required: false,
            passed: true,
            evidence: `${existingFiles.length}/${filePaths.length} expected files found in worktree`
          });
        } else {
          checks.push({
            type: 'output',
            description: `Expected files: ${filePaths.join(', ')}`,
            required: false,
            passed: false,
            reason: `None of the expected files found in ${worktreeDir}`,
            evidence: `Looked for: ${filePaths.join(', ')}`
          });
        }

        // Content check: grep existing files for key terms mentioned in expected output
        const lowerExpected = expected.toLowerCase();
        for (const { term, regex } of termPatterns) {
          if (!lowerExpected.includes(term.toLowerCase().split(/[="]/)[0])) continue;

          const found = existingFiles.some(fp => {
            try {
              const content = fs.readFileSync(path.join(worktreeDir, fp), 'utf8');
              return regex.test(content);
            } catch {
              // File may be binary or permission-restricted; skip it
              return false;
            }
          });

          if (found) {
            checks.push({
              type: 'output',
              description: `"${term}" found in output files`,
              required: false,
              passed: true,
              evidence: `Matched ${term} pattern in generated code`
            });
          }
        }
      } else {
        // No file paths extracted; try to match key terms across all changed files
        const lowerExpected = expected.toLowerCase();
        const matchedTerms: string[] = [];

        for (const { term, regex } of termPatterns) {
          if (!lowerExpected.includes(term.toLowerCase().split(/[="]/)[0])) continue;

          // Search all non-binary files in worktree src/ and test/
          const searchDirs = ['src', 'test', 'tests', 'server'].map(d => path.join(worktreeDir, d));
          let found = false;

          for (const dir of searchDirs) {
            if (!fs.existsSync(dir)) continue;
            try {
              const files = fs.readdirSync(dir, { recursive: true, encoding: 'utf8' });
              for (const file of files) {
                const fullPath = path.join(dir, file);
                try {
                  const stat = fs.statSync(fullPath);
                  if (!stat.isFile() || stat.size > 256 * 1024) continue;
                  const content = fs.readFileSync(fullPath, 'utf8');
                  if (regex.test(content)) { found = true; break; }
                } catch {
                  // Binary or permission-restricted file; skip
                }
              }
            } catch {
              // Directory unreadable (permissions, broken symlink); skip
            }
            if (found) break;
          }

          if (found) matchedTerms.push(term);
        }

        if (matchedTerms.length > 0) {
          checks.push({
            type: 'output',
            description: `Expected features verified: ${matchedTerms.join(', ')}`,
            required: false,
            passed: true,
            evidence: `Found evidence for: ${matchedTerms.join(', ')}`
          });
        }
      }
    }

    return checks;
  }

  /**
   * Generate verification report and save to file
   */
  async generateVerificationReport(
    result: VerificationResult,
    outputPath: string
  ): Promise<void> {
    const lines: string[] = [];

    lines.push('# Verification Report');
    lines.push('');
    lines.push(`**Step**: ${result.stepNumber}`);
    lines.push(`**Agent**: ${result.agentName}`);
    lines.push(`**Status**: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`**Timestamp**: ${result.timestamp}`);
    lines.push(`**Transcript**: ${result.transcriptPath}`);
    lines.push('');

    lines.push('## Verification Checks');
    lines.push('');

    result.checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      const req = check.required ? '(required)' : '(optional)';
      lines.push(`### ${icon} ${check.description} ${req}`);
      lines.push('');
      lines.push(`**Type**: ${check.type}`);
      lines.push(`**Passed**: ${check.passed}`);

      if (check.evidence) {
        lines.push(`**Evidence**: ${check.evidence}`);
      }

      if (check.reason) {
        lines.push(`**Reason**: ${check.reason}`);
      }

      lines.push('');
    });

    if (result.unverifiedClaims.length > 0) {
      lines.push('## ⚠️ Unverified Claims (Drift Detection)');
      lines.push('');
      lines.push('The following claims were made without supporting evidence:');
      lines.push('');
      result.unverifiedClaims.forEach(claim => {
        lines.push(`- ${claim}`);
      });
      lines.push('');
    }

    lines.push('## Summary');
    lines.push('');
    const passedCount = result.checks.filter(c => c.passed).length;
    const totalCount = result.checks.length;
    lines.push(`**Checks Passed**: ${passedCount}/${totalCount}`);
    lines.push(`**Unverified Claims**: ${result.unverifiedClaims.length}`);
    lines.push('');

    if (!result.passed) {
      lines.push('**Action Required**: This step failed verification. Review the issues above and retry.');
    } else {
      lines.push('**Result**: All required checks passed. Step verified successfully.');
    }

    const reportContent = lines.join('\n');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, reportContent, 'utf8');
  }

  /**
   * Rollback changes from a failed step
   */
  async rollback(
    stepNumber: number,
    branchName?: string,
    filesChanged?: string[]
  ): Promise<RollbackResult> {
    const filesRestored: string[] = [];

    try {
      // If on a branch, switch back and delete the branch
      if (branchName) {
        await this.runGitCommand(['checkout', 'main']);
        await this.runGitCommand(['branch', '-D', branchName]);
      }

      // Reset any uncommitted changes
      await this.runGitCommand(['reset', '--hard', 'HEAD']);

      // If specific files were changed, restore them
      if (filesChanged && filesChanged.length > 0) {
        for (const file of filesChanged) {
          try {
            await this.runGitCommand(['checkout', 'HEAD', '--', file]);
            filesRestored.push(file);
          } catch {
            // File does not exist in HEAD (new file from the agent); nothing to restore
          }
        }
      }

      return {
        success: true,
        filesRestored
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false,
        filesRestored,
        error: err.message
      };
    }
  }

  /**
   * Run a git command
   */
  private async runGitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: this.workingDir
      });

      let stdout = '';
      let stderr = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Git command failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Commit verification report with natural message
   * Skips if file is in a gitignored path (e.g., runs/)
   */
  async commitVerificationReport(
    reportPath: string,
    stepNumber: number,
    agentName: string,
    passed: boolean
  ): Promise<void> {
    const status = passed ? 'verified' : 'failed verification';
    const messages = [
      `verify step ${stepNumber} (${agentName}) - ${status}`,
      `add verification report for step ${stepNumber}`,
      `verification: step ${stepNumber} ${status}`,
      `step ${stepNumber} verification ${passed ? 'passed' : 'failed'}`
    ];

    // Pick a random message for variety
    const message = messages[Math.floor(Math.random() * messages.length)];

    // Skip committing when the report lives outside the target repo (e.g. bootstrap
    // targeting an external project stores runs/ under the orchestrator's directory)
    const resolvedReport = path.resolve(reportPath);
    const resolvedWorkDir = path.resolve(this.workingDir);
    if (!resolvedReport.startsWith(resolvedWorkDir + path.sep)) {
      return;
    }

    // Use git add -f to force-add files in gitignored paths (like runs/)
    try {
      await this.runGitCommand(['add', '-f', reportPath]);
      await this.runGitCommand(['commit', '-m', message]);
    } catch (err: unknown) {
      // If commit fails (nothing to commit, or other issue), just log and continue
      // Verification reports are nice-to-have in git, not required for success
      const error = err as Error;
      if (!error.message.includes('nothing to commit')) {
        console.warn(`  ⚠️  Could not commit verification report: ${error.message.split('\n')[0]}`);
      }
    }
  }

  /**
   * Cross-reference hook-captured evidence with transcript-based claims.
   * If hooks recorded errors or scope violations that the transcript does not
   * mention, the step fails (defense in depth).
   */
  private crossReferenceEvidence(shareIndex: ShareIndex, evidenceLogPath: string): VerificationCheck[] {
    const hookGen = new HookGenerator();
    const entries = hookGen.parseEvidenceLog(evidenceLogPath);

    if (entries.length === 0) {
      return [{
        type: 'claim',
        description: 'Hook evidence log exists and is non-empty',
        required: false,
        passed: false,
        reason: `No hook evidence entries found at ${evidenceLogPath}`
      }];
    }

    const checks: VerificationCheck[] = [];

    // Check for errors captured by hooks that transcript might not mention
    const errorEntries = entries.filter(e => e.event === 'errorOccurred');
    // Transcript error signals: failed tests, failed builds, or unverified claims
    const transcriptHasErrors = shareIndex.testsRun.some(t => !t.verified)
      || shareIndex.buildOperations.some(b => !b.verified)
      || shareIndex.claims.some(c => !c.verified);

    if (errorEntries.length > 0 && !transcriptHasErrors) {
      checks.push({
        type: 'claim',
        description: 'Hook error evidence cross-references transcript',
        required: true,
        passed: false,
        evidence: `Hooks captured ${errorEntries.length} error(s) but transcript reports none`,
        reason: `Hook evidence contradicts transcript: ${errorEntries.length} error(s) captured by hooks were not mentioned in transcript`
      });
    } else if (errorEntries.length > 0) {
      checks.push({
        type: 'claim',
        description: 'Hook error evidence cross-references transcript',
        required: false,
        passed: true,
        evidence: `Both hooks (${errorEntries.length}) and transcript acknowledge errors`
      });
    }

    // Verify file operations recorded by hooks match transcript claims
    const hookFiles = new Set(
      entries
        .filter(e => e.filePath)
        .map(e => e.filePath as string)
    );
    const transcriptFiles = new Set(shareIndex.changedFiles || []);

    // Scope violation enforcement: if hooks logged any scope_violation entries,
    // the step fails verification. This compensates for the Copilot CLI SDK not
    // honoring deny decisions at execution time (SDK <=1.0.7).
    const scopeViolations = entries.filter(e => e.event === 'scope_violation');
    if (scopeViolations.length > 0) {
      const violatedFiles = scopeViolations.map(v => v.filePath || 'unknown').join(', ');
      const agents = [...new Set(scopeViolations.map(v => v.agentName || 'unknown'))];
      const rules = [...new Set(scopeViolations.map(v => v.boundaryRule || 'unknown'))];
      checks.push({
        type: 'claim',
        description: 'No scope violations detected during execution',
        required: true,
        passed: false,
        evidence: `${scopeViolations.length} scope violation(s) logged by hooks`,
        reason: `Agent ${agents.join(', ')} wrote to files outside its declared scope: ${violatedFiles}. Violated boundary rule(s): ${rules.join(', ')}`
      });
    }

    // Hook-only files that transcript didn't mention (informational, not blocking)
    const hookOnlyFiles = [...hookFiles].filter(f => !transcriptFiles.has(f));
    if (hookOnlyFiles.length > 0) {
      checks.push({
        type: 'claim',
        description: 'Hook file evidence has unmentioned files',
        required: false,
        passed: true,
        evidence: `Hooks captured ${hookOnlyFiles.length} file(s) not mentioned in transcript: ${hookOnlyFiles.slice(0, 5).join(', ')}`
      });
    }

    // Overall: hooks corroborate transcript
    checks.push({
      type: 'claim',
      description: 'Hook evidence corroborates transcript',
      required: false,
      passed: true,
      evidence: `${entries.length} hook evidence entries, ${hookFiles.size} files tracked`
    });

    return checks;
  }
}

export default VerifierEngine;
