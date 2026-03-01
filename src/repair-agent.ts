import * as fs from 'fs';
import * as path from 'path';
import SessionExecutor, { SessionOptions, SessionResult } from './session-executor';
import VerifierEngine, { VerificationResult } from './verifier-engine';

/**
 * Context provided to the repair agent for a single failed step.
 */
export interface RepairContext {
  stepNumber: number;
  agentName: string;
  originalTask: string;
  transcriptPath: string;
  verificationReportPath: string;
  branchName: string;
  failedChecks: string[];
  rootCause: string;
  retryCount: number;
}

/**
 * Result of a repair attempt (one or more retries).
 */
export interface RepairResult {
  success: boolean;
  attempts: number;
  verificationPassed: boolean;
  transcriptPath: string | null;
  estimatedTokenCost: number;
  totalDurationMs: number;
  attemptDetails: RepairAttemptDetail[];
  error?: string;
}

/**
 * Detail for a single repair attempt within the retry loop.
 */
export interface RepairAttemptDetail {
  attempt: number;
  durationMs: number;
  sessionSuccess: boolean;
  verificationPassed: boolean;
  estimatedTokens: number;
  error?: string;
}

// Approximate tokens per character (GPT-family average: ~4 chars per token).
const CHARS_PER_TOKEN = 4;

/**
 * RepairAgent - spawns a dedicated Copilot CLI session with failure context
 * to fix issues detected by the verifier, then re-verifies.
 *
 * Retry loop: up to maxRetries attempts. Each attempt receives the prior
 * transcript and verification report so the agent can see what went wrong.
 */
export class RepairAgent {
  private workingDir: string;
  private maxRetries: number;

  constructor(workingDir: string, maxRetries?: number) {
    this.workingDir = workingDir;
    this.maxRetries = maxRetries ?? 3;
  }

  /**
   * Build a repair prompt that includes the failure context so the agent
   * knows exactly what to fix.
   */
  buildRepairPrompt(context: RepairContext): string {
    const sections: string[] = [];

    sections.push('=== REPAIR AGENT - Self-Repair Session ===');
    sections.push('');
    sections.push(`Step ${context.stepNumber} (${context.agentName}) failed verification.`);
    sections.push(`Repair attempt ${context.retryCount} of ${this.maxRetries}.`);
    sections.push('');
    sections.push('--- ORIGINAL TASK ---');
    sections.push(context.originalTask);
    sections.push('');

    // Include failed checks so the repair agent knows exactly what to fix
    if (context.failedChecks.length > 0) {
      sections.push('--- FAILED VERIFICATION CHECKS ---');
      context.failedChecks.forEach((check, i) => {
        sections.push(`  ${i + 1}. ${check}`);
      });
      sections.push('');
    }

    if (context.rootCause) {
      sections.push('--- ROOT CAUSE ---');
      sections.push(context.rootCause);
      sections.push('');
    }

    // Include the verification report if it exists on disk
    if (context.verificationReportPath && fs.existsSync(context.verificationReportPath)) {
      const report = fs.readFileSync(context.verificationReportPath, 'utf8');
      // Cap at 4000 chars to stay within prompt budget
      const trimmed = report.length > 4000 ? report.slice(0, 4000) + '\n... (truncated)' : report;
      sections.push('--- VERIFICATION REPORT ---');
      sections.push(trimmed);
      sections.push('');
    }

    // Include the original transcript so the repair agent can see what the
    // previous agent actually did (and did wrong).
    if (context.transcriptPath && fs.existsSync(context.transcriptPath)) {
      const transcript = fs.readFileSync(context.transcriptPath, 'utf8');
      // Cap at 6000 chars
      const trimmed = transcript.length > 6000 ? transcript.slice(0, 6000) + '\n... (truncated)' : transcript;
      sections.push('--- PRIOR SESSION TRANSCRIPT ---');
      sections.push(trimmed);
      sections.push('');
    }

    // Include git diff on the branch so the agent sees current state
    const diff = this.getGitDiff(context.branchName);
    if (diff) {
      const trimmed = diff.length > 4000 ? diff.slice(0, 4000) + '\n... (truncated)' : diff;
      sections.push('--- GIT DIFF ON BRANCH ---');
      sections.push(trimmed);
      sections.push('');
    }

    sections.push('--- REPAIR INSTRUCTIONS ---');
    sections.push('1. Read the failed checks and root cause above carefully.');
    sections.push('2. Fix the specific issues identified. Do not redo unrelated work.');
    sections.push('3. Run tests if the task requires tests.');
    sections.push('4. Commit your fixes with a clear message starting with "repair:".');
    sections.push('5. Do not claim work is done without evidence in the transcript.');
    sections.push('');

    return sections.join('\n');
  }

  /**
   * Estimate token cost from a transcript string.
   * Uses a simple character-to-token ratio (approximately 4 chars per token
   * for English text in GPT-family models).
   */
  estimateTokenCost(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Run the repair loop: up to maxRetries attempts.
   * Each attempt spawns a Copilot CLI session with the failure context,
   * then re-verifies. Stops on first successful verification.
   *
   * Returns a RepairResult summarizing all attempts.
   */
  async attemptRepair(
    context: RepairContext,
    sessionOptions: SessionOptions,
    verificationRequirements?: {
      requireTests?: boolean;
      requireBuild?: boolean;
      requireCommits?: boolean;
    }
  ): Promise<RepairResult> {
    const attemptDetails: RepairAttemptDetail[] = [];
    let totalTokens = 0;
    const overallStart = Date.now();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const attemptStart = Date.now();

      // Update retry count in context for prompt generation
      const repairContext: RepairContext = { ...context, retryCount: attempt };
      const prompt = this.buildRepairPrompt(repairContext);
      totalTokens += this.estimateTokenCost(prompt);

      // Set up transcript path for this repair attempt
      const repairTranscript = this.getRepairTranscriptPath(context, attempt);
      const repairDir = path.dirname(repairTranscript);
      if (!fs.existsSync(repairDir)) {
        fs.mkdirSync(repairDir, { recursive: true });
      }

      const opts: SessionOptions = {
        ...sessionOptions,
        shareToFile: repairTranscript,
        logPrefix: `[REPAIR:${context.agentName}:${context.stepNumber}:attempt-${attempt}]`
      };

      let sessionResult: SessionResult;
      let verificationPassed = false;

      try {
        // Create session executor for the working directory (may be a worktree)
        const executor = new SessionExecutor(this.workingDir);
        sessionResult = await executor.executeSession(prompt, opts);

        // Estimate tokens from output
        if (sessionResult.output) {
          totalTokens += this.estimateTokenCost(sessionResult.output);
        }

        if (!sessionResult.success) {
          attemptDetails.push({
            attempt,
            durationMs: Date.now() - attemptStart,
            sessionSuccess: false,
            verificationPassed: false,
            estimatedTokens: this.estimateTokenCost(prompt) + this.estimateTokenCost(sessionResult.output || ''),
            error: sessionResult.error || 'Session exited with non-zero code'
          });
          continue;
        }

        // Re-verify
        const transcriptToVerify = fs.existsSync(repairTranscript)
          ? repairTranscript
          : context.transcriptPath;

        const verifier = new VerifierEngine(this.workingDir);
        const verificationResult = await verifier.verifyStep(
          context.stepNumber,
          context.agentName,
          transcriptToVerify,
          verificationRequirements
        );

        verificationPassed = verificationResult.passed;

        attemptDetails.push({
          attempt,
          durationMs: Date.now() - attemptStart,
          sessionSuccess: true,
          verificationPassed,
          estimatedTokens: this.estimateTokenCost(prompt) + this.estimateTokenCost(sessionResult.output || '')
        });

        if (verificationPassed) {
          return {
            success: true,
            attempts: attempt,
            verificationPassed: true,
            transcriptPath: repairTranscript,
            estimatedTokenCost: totalTokens,
            totalDurationMs: Date.now() - overallStart,
            attemptDetails
          };
        }

        // Update the context with the new transcript and report for next attempt
        context = {
          ...context,
          transcriptPath: repairTranscript,
          failedChecks: this.extractFailedChecks(verificationResult)
        };

      } catch (error: unknown) {
        const err = error as Error;
        attemptDetails.push({
          attempt,
          durationMs: Date.now() - attemptStart,
          sessionSuccess: false,
          verificationPassed: false,
          estimatedTokens: this.estimateTokenCost(prompt),
          error: err.message
        });
      }
    }

    // All retries exhausted
    return {
      success: false,
      attempts: this.maxRetries,
      verificationPassed: false,
      transcriptPath: attemptDetails.length > 0
        ? this.getRepairTranscriptPath(context, attemptDetails.length)
        : null,
      estimatedTokenCost: totalTokens,
      totalDurationMs: Date.now() - overallStart,
      attemptDetails,
      error: `Repair failed after ${this.maxRetries} attempt(s)`
    };
  }

  /**
   * Extract human-readable failed check descriptions from a VerificationResult.
   */
  extractFailedChecks(result: VerificationResult): string[] {
    const checks: string[] = [];
    for (const check of result.checks) {
      if (!check.passed) {
        const reason = check.reason ? ` - ${check.reason}` : '';
        checks.push(`[${check.type}] ${check.description}${reason}`);
      }
    }
    if (result.unverifiedClaims.length > 0) {
      checks.push(`Unverified claims: ${result.unverifiedClaims.join('; ')}`);
    }
    return checks;
  }

  /**
   * Get the transcript path for a given repair attempt.
   */
  private getRepairTranscriptPath(context: RepairContext, attempt: number): string {
    const dir = path.dirname(context.transcriptPath);
    return path.join(dir, `repair-attempt-${attempt}.md`);
  }

  /**
   * Get git diff for a branch. Returns empty string on failure.
   */
  private getGitDiff(branchName: string): string {
    try {
      const { execSync } = require('child_process');
      const diff = execSync(`git diff HEAD~1 --stat 2>/dev/null || echo ""`, {
        cwd: this.workingDir,
        encoding: 'utf8',
        timeout: 10000
      });
      return diff.trim();
    } catch {
      return '';
    }
  }
}

export default RepairAgent;
