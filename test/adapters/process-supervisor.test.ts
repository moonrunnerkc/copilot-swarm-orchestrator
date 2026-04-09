import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { supervisedSpawn } from '../../src/adapters/process-supervisor';

describe('ProcessSupervisor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-supervisor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('supervisedSpawn', () => {
    it('captures stdout and stderr from a normal process', async () => {
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', 'echo hello && echo oops >&2'],
        cwd: tmpDir
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('hello'), 'stdout should contain "hello"');
      assert.ok(result.stderr.includes('oops'), 'stderr should contain "oops"');
    });

    it('returns non-zero exit code on failure', async () => {
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', 'exit 42'],
        cwd: tmpDir
      });

      assert.strictEqual(result.exitCode, 42);
    });

    it('captures multiline output with line buffering', async () => {
      const script = 'for i in 1 2 3; do echo "line $i"; done';
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', script],
        cwd: tmpDir
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('line 1'));
      assert.ok(result.stdout.includes('line 2'));
      assert.ok(result.stdout.includes('line 3'));
    });

    it('passes environment variables to the subprocess', async () => {
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', 'echo $TEST_SUPERVISOR_VAR'],
        cwd: tmpDir,
        env: { TEST_SUPERVISOR_VAR: 'hello_from_supervisor' }
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('hello_from_supervisor'));
    });

    it('resolves with error message when command does not exist', async () => {
      const result = await supervisedSpawn({
        command: 'nonexistent_command_xyz_123',
        args: [],
        cwd: tmpDir
      });

      assert.strictEqual(result.exitCode, 1);
      assert.ok(result.stderr.length > 0, 'stderr should contain the error');
    });

    it('calls onLine callback for each complete line', async () => {
      const lines: Array<{ line: string; stream: string }> = [];
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', 'echo first && echo second >&2 && echo third'],
        cwd: tmpDir,
        onLine: (line: string, stream: 'stdout' | 'stderr') => {
          lines.push({ line, stream });
        }
      });

      assert.strictEqual(result.exitCode, 0);
      const stdoutLines = lines.filter(l => l.stream === 'stdout');
      const stderrLines = lines.filter(l => l.stream === 'stderr');
      assert.ok(stdoutLines.length >= 2, 'should have at least 2 stdout lines');
      assert.ok(stderrLines.length >= 1, 'should have at least 1 stderr line');
    });

    it('kills a stalled process after the configured timeout', async function () {
      this.timeout(20_000);

      // Stall check runs every 10s, so a 1s stall timeout is detected
      // on the first check cycle (~10s). The subprocess sleeps 60s but
      // should be terminated well before that.
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', 'echo started && sleep 60'],
        cwd: tmpDir,
        stallTimeoutMs: 1_000
      });

      assert.strictEqual(result.exitCode, 1);
      assert.ok(
        result.stderr.includes('stall timeout'),
        `stderr should mention stall timeout, got: ${result.stderr}`
      );
      assert.ok(result.stdout.includes('started'), 'should have captured initial output');
    });

    it('does not kill a process that produces output within the timeout', async function () {
      this.timeout(10_000);

      // Process outputs a line every 200ms for 1s. Stall timeout set to 2s.
      const script = 'for i in 1 2 3 4 5; do echo "tick $i"; sleep 0.2; done';
      const result = await supervisedSpawn({
        command: 'bash',
        args: ['-c', script],
        cwd: tmpDir,
        stallTimeoutMs: 2_000
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('tick 5'), 'should complete all ticks');
    });

    it('uses the provided cwd for the subprocess', async () => {
      // Write a marker file so we can verify cwd
      fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'found_it');

      const result = await supervisedSpawn({
        command: 'cat',
        args: ['marker.txt'],
        cwd: tmpDir
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('found_it'));
    });

    it('respects custom stallTimeoutMs without killing healthy processes', async function () {
      this.timeout(5_000);

      // Fast process, generous timeout. Should complete normally.
      const result = await supervisedSpawn({
        command: 'echo',
        args: ['quick'],
        cwd: tmpDir,
        stallTimeoutMs: 60_000
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('quick'));
    });
  });
});
