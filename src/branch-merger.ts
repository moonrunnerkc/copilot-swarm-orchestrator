import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Spinner } from './spinner';
import { WorktreeManager } from './worktree-manager';
import ContextBroker from './context-broker';

/** Tracking data for branches that failed to merge. */
export interface UnmergedBranch {
  stepNumber: number;
  branchName: string;
  agentName: string;
  reason: string;
}

/** Minimal view of what the merger needs from the execution context. */
export interface MergeContext {
  mainBranch: string;
  contextBroker: ContextBroker;
  prManager?: {
    createStepPR(
      branchName: string, baseBranch: string, stepNumber: number,
      agentName: string, taskDesc: string, meta: Record<string, unknown>
    ): { success: boolean; url?: string; number?: number; error?: string };
    autoMergePR(prNumber: number): boolean;
    waitForApproval(prNumber: number): Promise<{ approved: boolean; state: string }>;
  } | undefined;
}

/** Minimal view of a completed step result needed by the merger. */
export interface MergeableResult {
  stepNumber: number;
  agentName: string;
  status: string;
  branchName?: string;
  verificationResult?: unknown;
}

/**
 * Handles all git branch merging: wave merges, final merges, and conflict
 * resolution strategies. Extracted from SwarmOrchestrator for cohesion.
 */
export class BranchMerger {
  constructor(
    private workingDir: string,
    private worktreeManager: WorktreeManager
  ) {}

  /**
   * Merge completed wave branches back to main, with PR or direct merge.
   * Records unmerged branches and returns them for caller tracking.
   */
  async mergeWaveBranches(
    completedResults: MergeableResult[],
    context: MergeContext,
    prMode?: 'auto' | 'review',
    prUrls?: Map<number, string>,
    stepCostRecords?: Array<{ stepNumber: number }>,
    plan?: { steps: Array<{ stepNumber: number; task: string }> }
  ): Promise<UnmergedBranch[]> {
    const unmerged: UnmergedBranch[] = [];
    const branches = completedResults
      .filter(r => r.branchName)
      .map(r => r.branchName!);

    if (branches.length === 0) return unmerged;

    if (context.prManager) {
      for (const result of completedResults) {
        if (!result.branchName) continue;

        const step = plan?.steps.find(s => s.stepNumber === result.stepNumber);
        const taskDesc = step?.task || `Step ${result.stepNumber}`;
        const costRecord = stepCostRecords?.find(r => r.stepNumber === result.stepNumber);

        const prResult = context.prManager.createStepPR(
          result.branchName,
          context.mainBranch,
          result.stepNumber,
          result.agentName,
          taskDesc,
          { verification: result.verificationResult, costRecord }
        );

        if (prResult.success && prResult.url) {
          prUrls?.set(result.stepNumber, prResult.url);
          console.log(`  \u{1F4CB} PR created for step ${result.stepNumber}: ${prResult.url}`);

          if (prMode === 'auto' && prResult.number) {
            const merged = context.prManager.autoMergePR(prResult.number);
            if (merged) {
              console.log(`  \u2705 Auto-merged PR #${prResult.number}`);
            } else {
              console.warn(`  \u26A0\uFE0F  Auto-merge failed for PR #${prResult.number}; manual merge required`);
            }
          } else if (prMode === 'review' && prResult.number) {
            console.log(`  \u23F3 Waiting for approval on PR #${prResult.number}...`);
            const status = await context.prManager.waitForApproval(prResult.number);
            if (status.approved || status.state === 'MERGED') {
              console.log(`  \u2705 PR #${prResult.number} approved`);
              if (status.state !== 'MERGED') {
                context.prManager.autoMergePR(prResult.number);
              }
            } else {
              console.warn(`  \u26A0\uFE0F  PR #${prResult.number} review timed out or was not approved`);
            }
          }
        } else {
          console.warn(`  \u26A0\uFE0F  PR creation failed for ${result.branchName}: ${prResult.error}`);
          try {
            await this.mergeBranch(result.branchName, context);
            console.log(`  \u2705 Merged ${result.branchName} (fallback)`);
          } catch (error: unknown) {
            const err = error as Error;
            console.warn(`  \u26A0\uFE0F  Merge conflict for ${result.branchName}: ${err.message}`);
          }
        }
      }
      return unmerged;
    }

    try {
      await this.worktreeManager.switchBranch(context.mainBranch);

      for (const result of completedResults) {
        if (result.branchName) {
          try {
            await this.mergeBranch(result.branchName, context);
            console.log(`  \u2705 Merged ${result.branchName}`);
          } catch (error: unknown) {
            const err = error as Error;
            try {
              execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' });
            } catch { /* no merge in progress */ }

            console.log(`  \u{1F504} Merge conflict for ${result.branchName}, rebasing onto ${context.mainBranch}...`);
            const rebased = this.tryRebaseAndMerge(result.branchName, context);
            if (rebased) {
              console.log(`  \u2705 Merged ${result.branchName} (rebased)`);
            } else {
              console.warn(`  \u26A0\uFE0F  Could not merge ${result.branchName} after rebase: ${err.message}`);
              console.warn(`     Step ${result.stepNumber} work preserved on branch ${result.branchName}`);
              unmerged.push({
                stepNumber: result.stepNumber,
                branchName: result.branchName,
                agentName: result.agentName,
                reason: err.message,
              });
            }
          }
        }
      }
    } finally {
      // switchBranch and mergeBranch pass cwd explicitly; no global state to restore
    }

    return unmerged;
  }

  /**
   * Final merge phase: remove worktrees, merge all remaining branches to main,
   * with stash/pop to preserve working directory state.
   */
  async mergeAllBranches(
    results: MergeableResult[],
    runDir: string,
    context: MergeContext
  ): Promise<UnmergedBranch[]> {
    const unmerged: UnmergedBranch[] = [];

    // Remove all worktrees before branch operations
    const worktreesDir = path.join(runDir, 'worktrees');
    if (fs.existsSync(worktreesDir)) {
      for (const result of results) {
        if (result.branchName) {
          const worktreePath = path.join(worktreesDir, `step-${result.stepNumber}`);
          await this.worktreeManager.removeAgentWorktree(worktreePath);
        }
      }
    }

    await this.worktreeManager.switchBranch(context.mainBranch);

    // Stash only tracked modifications (preserve untracked artifacts in runs/)
    let stashed = false;
    try {
      const stashResult = execSync('git stash push --no-include-untracked', {
        cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe'
      });
      stashed = !stashResult.includes('No local changes');
    } catch {
      // Clean working tree; expected
    }

    // Determine already-merged branches to avoid double-merge
    let mergedBranches: string[] = [];
    try {
      const merged = execSync(`git branch --merged ${context.mainBranch}`, {
        cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe'
      });
      mergedBranches = merged.split('\n').map(b => b.trim().replace(/^\* /, ''));
    } catch {
      // Shallow clones or empty repos; safe to attempt all merges
    }

    for (const result of results) {
      if (result.status === 'completed' && result.branchName) {
        if (mergedBranches.includes(result.branchName)) {
          console.log(`  \u2705 ${result.branchName} (already merged)`);
          continue;
        }
        const mergeSpinner = new Spinner(`Merging ${result.branchName}...`, { style: 'dots', prefix: '  ' });
        mergeSpinner.start();
        try {
          await this.mergeBranch(result.branchName, context);
          mergeSpinner.succeed(`Merged ${result.branchName}`);
        } catch (error: unknown) {
          const err = error as Error;
          try {
            execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' });
          } catch { /* no merge in progress */ }

          const rebased = this.tryRebaseAndMerge(result.branchName, context);
          if (rebased) {
            mergeSpinner.succeed(`Merged ${result.branchName} (rebased)`);
          } else {
            mergeSpinner.fail(`Conflict merging ${result.branchName}: ${err.message}`);
            console.error(`     Work preserved on branch ${result.branchName}`);
            unmerged.push({
              stepNumber: result.stepNumber,
              branchName: result.branchName,
              agentName: result.agentName,
              reason: err.message,
            });
          }
        }
      }
    }

    if (stashed) {
      try {
        execSync('git stash pop', { cwd: this.workingDir, stdio: 'pipe' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[merge] Stash pop conflict after final merge (non-fatal): ${msg}`);
      }
    }

    return unmerged;
  }

  /**
   * Three-strategy conflict resolution:
   * 1. Rebase onto main, fast-forward merge
   * 2. merge -X theirs (accept branch version of conflicting hunks)
   * 3. Manual modify/delete conflict resolution
   */
  tryRebaseAndMerge(branchName: string, context: MergeContext): boolean {
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    const mergeEnv = { ...gitEnv, GIT_MERGE_AUTOEDIT: 'no' };

    // Strategy 1: rebase + fast-forward
    try {
      execSync(`git rebase ${context.mainBranch} "${branchName}"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: gitEnv
      });
      execSync(`git checkout "${context.mainBranch}"`, {
        cwd: this.workingDir, stdio: 'pipe', env: gitEnv
      });
      execSync(`git merge --no-ff "${branchName}" -m "Merge ${branchName} (rebased)"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: mergeEnv
      });
      return true;
    } catch {
      try { execSync('git rebase --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync(`git checkout "${context.mainBranch}"`, { cwd: this.workingDir, stdio: 'pipe', env: gitEnv }); } catch { /* best-effort */ }
    }

    // Strategy 2: -X theirs auto-resolution
    try {
      console.log(`  \u{1F500} Retrying merge of ${branchName} with conflict auto-resolution...`);
      execSync(`git merge -X theirs --no-ff "${branchName}" -m "Merge ${branchName} (auto-resolved)"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: mergeEnv
      });
      return true;
    } catch {
      // Handle modify/delete conflicts that -X theirs can't resolve
      try {
        const statusOutput = execSync('git status --porcelain', {
          cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe'
        });
        const conflictLines = statusOutput.split('\n').filter(l => l.startsWith('UD') || l.startsWith('DU'));

        if (conflictLines.length > 0) {
          for (const line of conflictLines) {
            const filePath = line.slice(3).trim();
            if (line.startsWith('UD')) {
              execSync(`git rm -f "${filePath}"`, { cwd: this.workingDir, stdio: 'pipe' });
            } else {
              execSync(`git checkout --theirs "${filePath}" && git add "${filePath}"`, {
                cwd: this.workingDir, stdio: 'pipe', shell: '/bin/bash'
              });
            }
          }

          try {
            execSync('git add -u', { cwd: this.workingDir, stdio: 'pipe' });
          } catch { /* ignore */ }

          execSync(
            `git commit --no-edit -m "Merge ${branchName} (auto-resolved with modify/delete fix)"`,
            { cwd: this.workingDir, stdio: 'pipe', env: mergeEnv }
          );
          console.log(`  \u2705 Resolved modify/delete conflicts for ${branchName}`);
          return true;
        }
      } catch {
        // Manual resolution failed; fall through to abort
      }

      try { execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync(`git checkout "${context.mainBranch}"`, { cwd: this.workingDir, stdio: 'pipe', env: gitEnv }); } catch { /* best-effort */ }
      return false;
    }
  }

  /**
   * Merge a single branch via git merge --no-ff, with git lock coordination.
   */
  async mergeBranch(branchName: string, context: MergeContext): Promise<void> {
    const lockId = await context.contextBroker.acquireGitLock('orchestrator', `merge ${branchName}`);
    if (!lockId) {
      throw new Error('Failed to acquire git lock for merge');
    }

    try {
      execSync(`git merge --no-ff "${branchName}" -m "Merge ${branchName}"`, {
        cwd: this.workingDir,
        stdio: 'pipe',
        timeout: 120000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_MERGE_AUTOEDIT: 'no'
        }
      });
    } catch (err: unknown) {
      const e = err as { killed?: boolean; stderr?: Buffer | string; message?: string };
      if (e.killed) {
        throw new Error(`Timeout merging ${branchName}`);
      }
      throw new Error(`Merge conflict: ${e.stderr?.toString() || e.message || 'unknown error'}`);
    } finally {
      context.contextBroker.releaseGitLock(lockId);
    }
  }
}

export default BranchMerger;
