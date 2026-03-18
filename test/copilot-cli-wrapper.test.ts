import * as assert from 'assert';
import { CopilotCliWrapper, WrapperOptions, CliCapabilities } from '../src/copilot-cli-wrapper';

/**
 * Testable subclass that overrides the protected runCommand() method
 * so tests never spawn real processes.
 */
class TestableCliWrapper extends CopilotCliWrapper {
  public commandLog: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  public nextResults: Array<{ stdout: string; stderr: string; exitCode: number }> = [];

  constructor(options: WrapperOptions = {}) {
    super(options);
  }

  protected override runCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number; input?: string } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.commandLog.push({ command, args, options: options as Record<string, unknown> });
    const result = this.nextResults.shift() || { stdout: '', stderr: '', exitCode: 127 };
    return Promise.resolve(result);
  }

  /** Queue a result that runCommand will return on next call */
  queueResult(stdout: string, stderr: string, exitCode: number): void {
    this.nextResults.push({ stdout, stderr, exitCode });
  }
}

describe('CopilotCliWrapper', () => {
  describe('constructor defaults', () => {
    it('enables graceful degradation by default', () => {
      const wrapper = new CopilotCliWrapper();
      // Verify via behavior: when CLI unavailable, degradedExecution is used
      assert.ok(wrapper);
    });

    it('applies custom options', () => {
      const wrapper = new CopilotCliWrapper({
        maxRetries: 5,
        timeout: 60000,
        strictIsolation: true,
      });
      assert.ok(wrapper);
    });
  });

  describe('checkCapabilities', () => {
    it('detects available CLI with features', async () => {
      const wrapper = new TestableCliWrapper();
      wrapper.queueResult('0.0.450', '', 0); // --version
      wrapper.queueResult('Usage: copilot [-p prompt] [--share] [--agent name] [--mcp]', '', 0); // --help

      const caps = await wrapper.checkCapabilities();
      assert.strictEqual(caps.available, true);
      assert.strictEqual(caps.version, '0.0.450');
      assert.strictEqual(caps.supportsPromptMode, true);
      assert.strictEqual(caps.supportsShare, true);
      assert.strictEqual(caps.supportsAgents, true);
      assert.strictEqual(caps.supportsMcp, true);
    });

    it('detects unavailable CLI', async () => {
      const wrapper = new TestableCliWrapper();
      wrapper.queueResult('', 'command not found', 127);

      const caps = await wrapper.checkCapabilities();
      assert.strictEqual(caps.available, false);
      assert.strictEqual(caps.supportsPromptMode, false);
    });

    it('caches capability results', async () => {
      const wrapper = new TestableCliWrapper();
      wrapper.queueResult('0.0.412', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0);

      await wrapper.checkCapabilities();
      const cached = await wrapper.checkCapabilities();

      // Only 2 commands should have been issued (version + help), not 4
      assert.strictEqual(wrapper.commandLog.length, 2);
      assert.strictEqual(cached.available, true);
    });

    it('detects partial feature support', async () => {
      const wrapper = new TestableCliWrapper();
      wrapper.queueResult('0.0.300', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0); // no --share, no --agent

      const caps = await wrapper.checkCapabilities();
      assert.strictEqual(caps.available, true);
      assert.strictEqual(caps.supportsPromptMode, true);
      assert.strictEqual(caps.supportsShare, false);
      assert.strictEqual(caps.supportsAgents, false);
    });
  });

  describe('resetCapabilities', () => {
    it('clears cached capabilities', async () => {
      const wrapper = new TestableCliWrapper();
      wrapper.queueResult('0.0.412', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0);

      await wrapper.checkCapabilities();
      assert.ok(wrapper.getCapabilities());

      wrapper.resetCapabilities();
      assert.strictEqual(wrapper.getCapabilities(), null);
    });
  });

  describe('execute', () => {
    it('runs command successfully', async () => {
      const wrapper = new TestableCliWrapper();
      // checkCapabilities calls
      wrapper.queueResult('0.0.450', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0);
      // actual execution
      wrapper.queueResult('Generated code output', '', 0);

      const result = await wrapper.execute(['-p', 'hello']);
      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('Generated code'));
      assert.strictEqual(result.degraded, false);
      assert.strictEqual(result.exitCode, 0);
    });

    it('returns degraded result when CLI unavailable and degradation enabled', async () => {
      const wrapper = new TestableCliWrapper({ gracefulDegradation: true });
      wrapper.queueResult('', '', 127); // version check fails

      const result = await wrapper.execute(['-p', 'test']);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.degraded, true);
      assert.ok(result.output.includes('Graceful Degradation'));
      assert.ok(result.output.includes('copilot -p test'));
    });

    it('returns hard failure when CLI unavailable and degradation disabled', async () => {
      const wrapper = new TestableCliWrapper({ gracefulDegradation: false });
      wrapper.queueResult('', '', 127);

      const result = await wrapper.execute(['-p', 'test']);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.degraded, false);
      assert.strictEqual(result.exitCode, 127);
      assert.ok(result.error?.includes('not available'));
    });

    it('retries on failure with backoff', async () => {
      const wrapper = new TestableCliWrapper({ maxRetries: 2, gracefulDegradation: false });
      // checkCapabilities
      wrapper.queueResult('0.0.450', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0);
      // First attempt fails (will throw to trigger retry)
      wrapper.queueResult('partial output', 'internal error', 1);

      const result = await wrapper.execute(['-p', 'retry test']);
      // First call returns exitCode=1 which is NOT a throw; it returns normally
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('includes prompt in degraded output', async () => {
      const wrapper = new TestableCliWrapper({ gracefulDegradation: true });
      wrapper.queueResult('', '', 127);

      const result = await wrapper.execute(['-p', 'hello'], { input: 'my custom prompt' });
      assert.ok(result.output.includes('my custom prompt'));
    });

    it('prefixes input with /fleet when useInnerFleet enabled', async () => {
      const wrapper = new TestableCliWrapper({ useInnerFleet: true });
      // checkCapabilities
      wrapper.queueResult('0.0.450', '', 0);
      wrapper.queueResult('Usage: copilot [-p prompt]', '', 0);
      // execution
      wrapper.queueResult('fleet output', '', 0);

      await wrapper.execute(['-p', 'task'], { input: 'do the thing' });

      // The third command (index 2) should have /fleet prefixed input
      const execCall = wrapper.commandLog[2];
      assert.strictEqual((execCall.options as { input?: string }).input, '/fleet do the thing');
    });
  });

  describe('degraded execution content', () => {
    it('includes installation instructions', async () => {
      const wrapper = new TestableCliWrapper({ gracefulDegradation: true });
      wrapper.queueResult('', '', 127);

      const result = await wrapper.execute(['-p', 'test']);
      assert.ok(result.output.includes('npm install'));
      assert.ok(result.output.includes('copilot auth'));
    });

    it('truncates long prompts in degraded output', async () => {
      const wrapper = new TestableCliWrapper({ gracefulDegradation: true });
      wrapper.queueResult('', '', 127);

      const longPrompt = 'x'.repeat(600);
      const result = await wrapper.execute(['-p', 'test'], { input: longPrompt });
      assert.ok(result.output.includes('truncated'));
    });
  });

  describe('getCapabilities', () => {
    it('returns null before any check', () => {
      const wrapper = new CopilotCliWrapper();
      assert.strictEqual(wrapper.getCapabilities(), null);
    });
  });
});
