// Tests for BranchMerger: stash handling, wave merges, conflict resolution.
import { strict as assert } from 'assert';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BranchMerger, MergeContext, MergeableResult } from '../src/branch-merger';
import ContextBroker from '../src/context-broker';
import { WorktreeManager } from '../src/worktree-manager';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `branch-merger-${prefix}-`));
}

function initRepo(dir: string): void {
  execSync('git init -b main', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "initial commit"', { cwd: dir, stdio: 'pipe' });
}

function createBranchWithFile(
  dir: string, branchName: string, fileName: string, content: string
): void {
  execSync(`git checkout -b ${branchName}`, { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, fileName), content, 'utf8');
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -m "add ${fileName}"`, { cwd: dir, stdio: 'pipe' });
  execSync('git checkout main', { cwd: dir, stdio: 'pipe' });
}

describe('BranchMerger', () => {
  let repoDir: string;
  let runDir: string;

  afterEach(() => {
    for (const d of [repoDir, runDir]) {
      if (d && fs.existsSync(d)) {
        fs.rmSync(d, { recursive: true, force: true });
      }
    }
  });

  describe('mergeWaveBranches stashes untracked files', () => {
    it('should merge branch despite untracked file with same name', async () => {
      repoDir = tmpDir('wave-untracked');
      runDir = tmpDir('wave-run');
      initRepo(repoDir);

      // Create a branch that introduces README.md
      createBranchWithFile(repoDir, 'feature-1', 'README.md', '# Feature README');

      // Place an untracked README.md in the working directory (simulates
      // leftover from orchestrator or a previous partial run)
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Untracked', 'utf8');

      const worktreeManager = new WorktreeManager(repoDir);
      const merger = new BranchMerger(repoDir, worktreeManager);
      const broker = new ContextBroker(runDir);

      const context: MergeContext = {
        mainBranch: 'main',
        contextBroker: broker,
      };

      const results: MergeableResult[] = [{
        stepNumber: 1,
        agentName: 'TestAgent',
        status: 'completed',
        branchName: 'feature-1',
      }];

      const unmerged = await merger.mergeWaveBranches(results, context);

      // Branch should merge without error
      assert.strictEqual(unmerged.length, 0, 'Expected zero unmerged branches');

      // Verify the file from the branch is now on main
      const content = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf8');
      assert.strictEqual(content, '# Feature README');
    });

    it('should merge multiple branches with overlapping new files', async () => {
      repoDir = tmpDir('wave-multi');
      runDir = tmpDir('wave-multi-run');
      initRepo(repoDir);

      // Branch A introduces index.html
      createBranchWithFile(repoDir, 'branch-a', 'index.html', '<h1>A</h1>');
      // Branch B introduces style.css
      createBranchWithFile(repoDir, 'branch-b', 'style.css', 'body{}');

      const worktreeManager = new WorktreeManager(repoDir);
      const merger = new BranchMerger(repoDir, worktreeManager);
      const broker = new ContextBroker(runDir);

      const context: MergeContext = {
        mainBranch: 'main',
        contextBroker: broker,
      };

      const results: MergeableResult[] = [
        { stepNumber: 1, agentName: 'A', status: 'completed', branchName: 'branch-a' },
        { stepNumber: 2, agentName: 'B', status: 'completed', branchName: 'branch-b' },
      ];

      const unmerged = await merger.mergeWaveBranches(results, context);
      assert.strictEqual(unmerged.length, 0);

      // Both files on main
      assert.ok(fs.existsSync(path.join(repoDir, 'index.html')));
      assert.ok(fs.existsSync(path.join(repoDir, 'style.css')));
    });
  });

  describe('mergeAllBranches stashes untracked files', () => {
    it('should merge branch when untracked files exist in working dir', async () => {
      repoDir = tmpDir('final-untracked');
      runDir = tmpDir('final-run');
      initRepo(repoDir);

      // Create a branch with app files
      createBranchWithFile(repoDir, 'step-branch', 'app.js', 'console.log("app");');

      // Place an untracked app.js in the working directory
      fs.writeFileSync(path.join(repoDir, 'app.js'), '// leftover', 'utf8');

      const worktreeManager = new WorktreeManager(repoDir);
      const merger = new BranchMerger(repoDir, worktreeManager);
      const broker = new ContextBroker(runDir);

      const context: MergeContext = {
        mainBranch: 'main',
        contextBroker: broker,
      };

      const results: MergeableResult[] = [{
        stepNumber: 1,
        agentName: 'TestAgent',
        status: 'completed',
        branchName: 'step-branch',
      }];

      const unmerged = await merger.mergeAllBranches(results, runDir, context);
      assert.strictEqual(unmerged.length, 0, 'Expected zero unmerged branches');

      // Verify the branch version is now on main
      const content = fs.readFileSync(path.join(repoDir, 'app.js'), 'utf8');
      assert.strictEqual(content, 'console.log("app");');
    });
  });

  describe('mergeWaveBranches without conflicts', () => {
    it('should merge a simple branch to main', async () => {
      repoDir = tmpDir('simple');
      runDir = tmpDir('simple-run');
      initRepo(repoDir);

      createBranchWithFile(repoDir, 'feat', 'hello.txt', 'hello');

      const worktreeManager = new WorktreeManager(repoDir);
      const merger = new BranchMerger(repoDir, worktreeManager);
      const broker = new ContextBroker(runDir);

      const context: MergeContext = {
        mainBranch: 'main',
        contextBroker: broker,
      };

      const results: MergeableResult[] = [{
        stepNumber: 1,
        agentName: 'Agent',
        status: 'completed',
        branchName: 'feat',
      }];

      const unmerged = await merger.mergeWaveBranches(results, context);
      assert.strictEqual(unmerged.length, 0);
      assert.ok(fs.existsSync(path.join(repoDir, 'hello.txt')));
    });

    it('should skip non-completed results', async () => {
      repoDir = tmpDir('skip');
      runDir = tmpDir('skip-run');
      initRepo(repoDir);

      const worktreeManager = new WorktreeManager(repoDir);
      const merger = new BranchMerger(repoDir, worktreeManager);
      const broker = new ContextBroker(runDir);

      const context: MergeContext = {
        mainBranch: 'main',
        contextBroker: broker,
      };

      // No branches to merge (failed status)
      const results: MergeableResult[] = [{
        stepNumber: 1,
        agentName: 'Agent',
        status: 'failed',
      }];

      const unmerged = await merger.mergeWaveBranches(results, context);
      assert.strictEqual(unmerged.length, 0);
    });
  });
});
