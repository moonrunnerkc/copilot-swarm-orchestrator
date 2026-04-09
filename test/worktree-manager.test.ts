import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { WorktreeManager } from '../src/worktree-manager';

describe('WorktreeManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-mgr-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('ensureOwnGitRepo', () => {
    it('returns the directory unchanged when it is already a git root', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "init"', {
        cwd: tempDir, stdio: 'pipe',
        env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com',
               GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' }
      });

      const manager = new WorktreeManager(tempDir);
      const result = manager.ensureOwnGitRepo(tempDir);
      assert.strictEqual(path.resolve(result), path.resolve(tempDir));
    });

    it('initializes a git repo when the directory has no git at all', () => {
      const subDir = path.join(tempDir, 'no-git-project');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'file.txt'), 'content');

      // Ensure tempDir itself is NOT a git repo so subDir has nothing to inherit
      const manager = new WorktreeManager(subDir);
      const result = manager.ensureOwnGitRepo(subDir);

      assert.strictEqual(path.resolve(result), path.resolve(subDir));

      // Verify .git was created
      assert.ok(fs.existsSync(path.join(subDir, '.git')), 'should have .git directory');

      // Verify the resolved git root is the subDir, not a parent
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: subDir, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      assert.strictEqual(path.resolve(gitRoot), path.resolve(subDir));
    });

    it('initializes a new repo when directory is inside a parent repo', () => {
      // Create parent repo
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "parent init"', {
        cwd: tempDir, stdio: 'pipe',
        env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com',
               GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' }
      });

      // Create subdirectory (no .git of its own)
      const childDir = path.join(tempDir, 'projects', 'my-app');
      fs.mkdirSync(childDir, { recursive: true });
      fs.writeFileSync(path.join(childDir, 'app.py'), 'print("hello")');

      // Before fix: git would resolve to parent. After fix: gets its own repo.
      const manager = new WorktreeManager(childDir);
      const result = manager.ensureOwnGitRepo(childDir);

      assert.strictEqual(path.resolve(result), path.resolve(childDir));

      // The child directory now has its own .git
      assert.ok(fs.existsSync(path.join(childDir, '.git')), 'child should have its own .git');

      // git root from within child should resolve to child, not parent
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: childDir, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      assert.strictEqual(path.resolve(gitRoot), path.resolve(childDir));

      // Parent repo should still resolve to parent
      const parentRoot = execSync('git rev-parse --show-toplevel', {
        cwd: tempDir, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      assert.strictEqual(path.resolve(parentRoot), path.resolve(tempDir));
    });

    it('commits existing files when initializing a subdirectory repo', () => {
      // Create parent repo
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "parent init"', {
        cwd: tempDir, stdio: 'pipe',
        env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com',
               GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' }
      });

      const childDir = path.join(tempDir, 'child');
      fs.mkdirSync(childDir);
      fs.writeFileSync(path.join(childDir, 'main.py'), 'print("hi")');
      fs.writeFileSync(path.join(childDir, 'README.md'), '# Child');

      const manager = new WorktreeManager(childDir);
      manager.ensureOwnGitRepo(childDir);

      // Files should be committed (not just init'd empty)
      const log = execSync('git log --oneline', {
        cwd: childDir, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      assert.ok(log.length > 0, 'should have at least one commit');

      const tracked = execSync('git ls-files', {
        cwd: childDir, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      assert.ok(tracked.includes('main.py'), 'main.py should be tracked');
      assert.ok(tracked.includes('README.md'), 'README.md should be tracked');
    });
  });
});
