import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import SessionExecutor from '../src/session-executor';

describe('SessionExecutor', () => {
  const testDir = path.join(process.cwd(), 'test', 'fixtures', 'session-executor');

  before(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  after(() => {
    // clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('buildStepPrompt', () => {
    it('should include human-like commit instructions', () => {
      const executor = new SessionExecutor();
      
      const step = {
        stepNumber: 1,
        task: 'Add user authentication',
        agentName: 'BackendMaster',
        dependencies: [],
        expectedOutputs: ['Auth module', 'Tests']
      };

      const agent = {
        name: 'BackendMaster',
        purpose: 'Server-side development',
        scope: ['Backend code', 'APIs'],
        boundaries: ['No frontend'],
        done_definition: ['Tests pass'],
        refusal_rules: ['No invented APIs'],
        output_contract: {
          transcript: 'proof/step-{N}-backend.md',
          artifacts: []
        }
      };

      const context = {
        plan: {
          goal: 'Build auth system',
          steps: [step],
          agentAssignments: ['BackendMaster']
        },
        planFilename: 'test-plan.json',
        executionId: 'test-123',
        startTime: new Date().toISOString(),
        currentStep: 0,
        stepResults: [],
        priorContext: []
      };

      // access private method via any cast for testing
      const prompt = (executor as any).buildStepPrompt(step, agent, context);

      // verify critical commit instructions are present
      assert(prompt.includes('INCREMENTAL commits'), 'should mention incremental commits');
      assert(prompt.includes('Natural and human-written'), 'should mention natural messages');
      assert(prompt.includes('Descriptive and imperative'), 'should mention imperative style');
      assert(prompt.includes('git add'), 'should show git add command');
      assert(prompt.includes('git commit -m'), 'should show git commit command');
      assert(prompt.includes('Good commit message examples'), 'should include examples');
      assert(prompt.includes('add user authentication'), 'should have example messages');
      assert(prompt.includes('fix:'), 'should show conventional commit example');
      assert(prompt.includes('Multiple small commits'), 'should emphasize multiple commits');
    });

    it('should include agent scope and boundaries', () => {
      const executor = new SessionExecutor();
      
      const step = {
        stepNumber: 1,
        task: 'Test task',
        agentName: 'TestAgent',
        dependencies: [],
        expectedOutputs: []
      };

      const agent = {
        name: 'TestAgent',
        purpose: 'Testing',
        scope: ['Unit tests', 'Integration tests'],
        boundaries: ['No production code'],
        done_definition: ['All pass'],
        refusal_rules: ['No mocking real behavior'],
        output_contract: {
          transcript: 'proof/step-{N}-test.md',
          artifacts: []
        }
      };

      const context = {
        plan: {
          goal: 'Test goal',
          steps: [step],
          agentAssignments: ['TestAgent']
        },
        planFilename: 'plan.json',
        executionId: 'exec-1',
        startTime: new Date().toISOString(),
        currentStep: 0,
        stepResults: [],
        priorContext: []
      };

      const prompt = (executor as any).buildStepPrompt(step, agent, context);

      assert(prompt.includes('Unit tests'), 'should include scope items');
      assert(prompt.includes('No production code'), 'should include boundaries');
      assert(prompt.includes('All pass'), 'should include done definition');
    });

    it('should include prior context when dependencies exist', () => {
      const executor = new SessionExecutor();
      
      const step = {
        stepNumber: 2,
        task: 'Second step',
        agentName: 'Agent2',
        dependencies: [1],
        expectedOutputs: []
      };

      const agent = {
        name: 'Agent2',
        purpose: 'Second agent',
        scope: ['Task 2'],
        boundaries: [],
        done_definition: [],
        refusal_rules: [],
        output_contract: {
          transcript: 'proof/step-2.md',
          artifacts: []
        }
      };

      const context = {
        plan: {
          goal: 'Multi-step',
          steps: [step],
          agentAssignments: ['Agent1', 'Agent2']
        },
        planFilename: 'plan.json',
        executionId: 'exec-2',
        startTime: new Date().toISOString(),
        currentStep: 1,
        stepResults: [],
        priorContext: ['Step 1 (Agent1): Created module']
      };

      const prompt = (executor as any).buildStepPrompt(step, agent, context);

      assert(prompt.includes('Dependencies'), 'should mention dependencies');
      assert(prompt.includes('Step 1 (Agent1): Created module'), 'should include prior context');
    });
  });

  describe('executeSession', () => {
    it('should construct correct command args', async function() {
      this.timeout(10000);
      this.skip(); // skip for now - requires full copilot CLI setup
      
      const executor = new SessionExecutor(testDir);

      // note: this test will fail if copilot is not installed
      // we're just verifying the command construction
      const result = await executor.executeSession(
        'echo test',
        {
          model: 'gpt-5-mini',
          silent: true,
          allowAllTools: true
        }
      );

      // verify result structure
      assert(typeof result.success === 'boolean', 'should have success field');
      assert(typeof result.output === 'string', 'should have output field');
      assert(typeof result.exitCode === 'number', 'should have exitCode field');
      assert(typeof result.duration === 'number', 'should have duration field');
    });
  });

  describe('executeWithRetry', () => {
    it('should retry on failure up to max attempts', async function() {
      this.timeout(10000);
      
      const executor = new SessionExecutor(testDir);

      let attemptCount = 0;
      
      // override executeSession to simulate failures
      const originalExecute = executor.executeSession.bind(executor);
      executor.executeSession = async (prompt, options) => {
        attemptCount++;
        if (attemptCount < 2) {
          // fail first attempt
          return {
            success: false,
            output: 'error',
            error: 'simulated error',
            exitCode: 1,
            duration: 100
          };
        }
        // succeed on second attempt
        return {
          success: true,
          output: 'success',
          exitCode: 0,
          duration: 100
        };
      };

      const result = await executor.executeWithRetry('test', {}, 3);

      assert.strictEqual(attemptCount, 2, 'should have attempted twice');
      assert.strictEqual(result.success, true, 'should succeed after retry');
    });

    it('should return last failure if all retries exhausted', async function() {
      this.timeout(10000);
      
      const executor = new SessionExecutor(testDir);

      // override to always fail
      executor.executeSession = async () => {
        return {
          success: false,
          output: 'error',
          error: 'persistent error',
          exitCode: 1,
          duration: 100
        };
      };

      const result = await executor.executeWithRetry('test', {}, 2);

      assert.strictEqual(result.success, false, 'should fail after all retries');
      assert(result.error?.includes('persistent error'), 'should include error message');
    });
  });
});
