import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentAdapter, AgentResult, AgentSpawnOptions } from '../src/adapters/agent-adapter';
import { CopilotAdapter } from '../src/adapters/copilot-adapter';
import { ClaudeCodeAdapter } from '../src/adapters/claude-code-adapter';
import { CodexAdapter } from '../src/adapters/codex-adapter';
import { resolveAdapter } from '../src/adapters';
import SessionExecutor, { SessionResult } from '../src/session-executor';
import { parseSwarmFlags } from '../src/cli-handlers';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapters-test-'));
}

// Stub adapter for testing SessionExecutor delegation without spawning real processes
class StubAdapter implements AgentAdapter {
  readonly name = 'stub';
  lastOpts: AgentSpawnOptions | undefined;
  resultToReturn: AgentResult;

  constructor(result?: Partial<AgentResult>) {
    this.resultToReturn = {
      stdout: result?.stdout ?? 'stub output',
      stderr: result?.stderr ?? '',
      exitCode: result?.exitCode ?? 0,
      durationMs: result?.durationMs ?? 42,
      shareTranscriptPath: result?.shareTranscriptPath,
    };
  }

  async spawn(opts: AgentSpawnOptions): Promise<AgentResult> {
    this.lastOpts = opts;
    return this.resultToReturn;
  }
}

describe('Agent Adapters', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  describe('resolveAdapter()', () => {
    it('resolves "copilot" to CopilotAdapter', () => {
      const adapter = resolveAdapter('copilot');
      assert.strictEqual(adapter.name, 'copilot');
      assert.ok(adapter instanceof CopilotAdapter);
    });

    it('resolves "claude-code" to ClaudeCodeAdapter', () => {
      const adapter = resolveAdapter('claude-code');
      assert.strictEqual(adapter.name, 'claude-code');
      assert.ok(adapter instanceof ClaudeCodeAdapter);
    });

    it('resolves "codex" to CodexAdapter', () => {
      const adapter = resolveAdapter('codex');
      assert.strictEqual(adapter.name, 'codex');
      assert.ok(adapter instanceof CodexAdapter);
    });

    it('throws on unknown adapter with available names in message', () => {
      assert.throws(
        () => resolveAdapter('unknown-agent'),
        (err: Error) => {
          assert.ok(err.message.includes('"unknown-agent"'));
          assert.ok(err.message.includes('copilot'));
          assert.ok(err.message.includes('claude-code'));
          assert.ok(err.message.includes('codex'));
          return true;
        }
      );
    });
  });

  describe('Adapter names', () => {
    it('CopilotAdapter has name "copilot"', () => {
      assert.strictEqual(new CopilotAdapter().name, 'copilot');
    });

    it('ClaudeCodeAdapter has name "claude-code"', () => {
      assert.strictEqual(new ClaudeCodeAdapter().name, 'claude-code');
    });

    it('CodexAdapter has name "codex"', () => {
      assert.strictEqual(new CodexAdapter().name, 'codex');
    });
  });

  describe('SessionExecutor with adapter', () => {
    it('delegates to adapter.spawn when adapter is set', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const stub = new StubAdapter({ stdout: 'hello world', stderr: '', exitCode: 0, durationMs: 100 });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('test prompt');

      assert.ok(stub.lastOpts, 'adapter.spawn should have been called');
      assert.strictEqual(stub.lastOpts!.prompt, 'test prompt');
      assert.strictEqual(stub.lastOpts!.workdir, dir);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'hello world');
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.duration, 100);
    });

    it('maps model and agent options to adapter spawn', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const stub = new StubAdapter();
      const executor = new SessionExecutor(dir, stub);

      await executor.executeSession('task', { model: 'o3', agent: '@workspace' });

      assert.strictEqual(stub.lastOpts!.model, 'o3');
      assert.strictEqual(stub.lastOpts!.copilotAgent, '@workspace');
    });

    it('maps failed exit code to SessionResult error field', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const stub = new StubAdapter({ stdout: '', stderr: 'build failed', exitCode: 1 });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('failing task');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.error, 'build failed');
    });

    it('does not set error when exit code is 0', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const stub = new StubAdapter({ stdout: 'ok', stderr: 'warning', exitCode: 0 });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('task');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.error, undefined);
      // stderr is still part of output
      assert.ok(result.output.includes('warning'));
    });

    it('generates fallback transcript for non-Copilot adapters', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const transcriptPath = path.join(dir, 'proof', 'step-1.md');
      const stub = new StubAdapter({ stdout: 'generated code here' });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('build api', { shareToFile: transcriptPath });

      assert.ok(fs.existsSync(transcriptPath), 'fallback transcript should be written');
      const content = fs.readFileSync(transcriptPath, 'utf8');
      assert.ok(content.includes('generated code here'));
      assert.strictEqual(result.transcriptPath, transcriptPath);
    });

    it('does not write transcript when session fails', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const transcriptPath = path.join(dir, 'proof', 'step-1.md');
      const stub = new StubAdapter({ exitCode: 1, stderr: 'error' });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('failing', { shareToFile: transcriptPath });

      assert.ok(!fs.existsSync(transcriptPath), 'no transcript on failure');
      assert.strictEqual(result.transcriptPath, undefined);
    });

    it('passes shareTranscriptPath from adapter result when present', async () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const sharePath = path.join(dir, 'copilot-share.md');
      fs.writeFileSync(sharePath, '# transcript', 'utf8');
      const stub = new StubAdapter({ shareTranscriptPath: sharePath });
      const executor = new SessionExecutor(dir, stub);

      const result = await executor.executeSession('task');

      assert.strictEqual(result.transcriptPath, sharePath);
    });
  });

  describe('SessionExecutor without adapter (backward compat)', () => {
    it('falls back to copilot path when no adapter set', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      // Constructor without adapter should not throw
      const executor = new SessionExecutor(dir);
      assert.ok(executor, 'executor should be created');
    });
  });

  describe('--tool CLI flag parsing', () => {
    it('parses --tool copilot', () => {
      const opts = parseSwarmFlags(['swarm', 'plan.json', '--tool', 'copilot']);
      assert.strictEqual(opts.cliAgent, 'copilot');
    });

    it('parses --tool claude-code', () => {
      const opts = parseSwarmFlags(['swarm', 'plan.json', '--tool', 'claude-code']);
      assert.strictEqual(opts.cliAgent, 'claude-code');
    });

    it('parses --tool codex', () => {
      const opts = parseSwarmFlags(['swarm', 'plan.json', '--tool', 'codex']);
      assert.strictEqual(opts.cliAgent, 'codex');
    });

    it('does not set cliAgent when --tool is absent', () => {
      const opts = parseSwarmFlags(['swarm', 'plan.json']);
      assert.strictEqual(opts.cliAgent, undefined);
    });

    it('preserves existing --agent flag independently', () => {
      // The --agent flag is handled in handleQuickCommand, not parseSwarmFlags,
      // so it should not interfere with --tool
      const opts = parseSwarmFlags(['swarm', 'plan.json', '--tool', 'claude-code']);
      assert.strictEqual(opts.cliAgent, 'claude-code');
    });
  });
});
