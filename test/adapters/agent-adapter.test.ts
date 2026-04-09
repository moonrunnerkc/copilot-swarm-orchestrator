import * as assert from 'assert';
import { CopilotAdapter } from '../../src/adapters/copilot-adapter';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code-adapter';
import { resolveAdapter, registerAdapter, listAdapterNames } from '../../src/adapters/adapter-factory';
import { AgentAdapter, AgentResult, AgentSpawnOptions } from '../../src/adapters/agent-adapter';

describe('Agent Adapter Infrastructure', () => {
  describe('CopilotAdapter', () => {
    it('has name "copilot"', () => {
      const adapter = new CopilotAdapter();
      assert.strictEqual(adapter.name, 'copilot');
    });

    it('implements AgentAdapter interface', () => {
      const adapter: AgentAdapter = new CopilotAdapter();
      assert.strictEqual(typeof adapter.spawn, 'function');
      assert.strictEqual(typeof adapter.name, 'string');
    });
  });

  describe('ClaudeCodeAdapter', () => {
    it('has name "claude-code"', () => {
      const adapter = new ClaudeCodeAdapter();
      assert.strictEqual(adapter.name, 'claude-code');
    });

    it('implements AgentAdapter interface', () => {
      const adapter: AgentAdapter = new ClaudeCodeAdapter();
      assert.strictEqual(typeof adapter.spawn, 'function');
      assert.strictEqual(typeof adapter.name, 'string');
    });
  });

  describe('adapter-factory', () => {
    it('resolves copilot adapter', () => {
      const adapter = resolveAdapter('copilot');
      assert.strictEqual(adapter.name, 'copilot');
    });

    it('resolves claude-code adapter', () => {
      const adapter = resolveAdapter('claude-code');
      assert.strictEqual(adapter.name, 'claude-code');
    });

    it('throws for unknown tool name with valid options listed', () => {
      assert.throws(
        () => resolveAdapter('nonexistent'),
        (err: Error) => {
          assert.ok(err.message.includes('Unknown tool "nonexistent"'));
          assert.ok(err.message.includes('copilot'));
          assert.ok(err.message.includes('claude-code'));
          return true;
        }
      );
    });

    it('listAdapterNames returns registered names', () => {
      const names = listAdapterNames();
      assert.ok(names.includes('copilot'));
      assert.ok(names.includes('claude-code'));
    });

    it('registerAdapter adds a custom adapter', () => {
      const customAdapter: AgentAdapter = {
        name: 'test-adapter',
        async spawn(_opts: AgentSpawnOptions): Promise<AgentResult> {
          return { stdout: 'test', stderr: '', exitCode: 0, durationMs: 0 };
        }
      };
      registerAdapter('test-adapter', () => customAdapter);
      const resolved = resolveAdapter('test-adapter');
      assert.strictEqual(resolved.name, 'test-adapter');
    });
  });
});
