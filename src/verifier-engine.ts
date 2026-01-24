import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ShareParser, { ShareIndex } from './share-parser';

export interface VerificationCheck {
  type: 'test' | 'build' | 'lint' | 'commit' | 'claim';
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
}

export interface RollbackResult {
  success: boolean;
  commitReverted?: string;
  filesRestored: string[];
  error?: string;
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
    }
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

    const transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
    const shareIndex = this.shareParser.parse(transcriptContent);

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

    // Overall pass/fail: only required checks must pass
    // Unverified claims are warnings for drift detection, NOT hard failures
    const passed = checks.every(check => !check.required || check.passed);

    const result: VerificationResult = {
      stepNumber,
      agentName,
      passed,
      checks,
      unverifiedClaims,
      timestamp: new Date().toISOString(),
      transcriptPath
    };

    return result;
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
            // file might not exist in HEAD, that's ok
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

    await this.runGitCommand(['add', reportPath]);
    await this.runGitCommand(['commit', '-m', message]);
  }
}

export default VerifierEngine;
