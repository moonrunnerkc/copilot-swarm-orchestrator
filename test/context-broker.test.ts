import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import ContextBroker from '../src/context-broker';

describe('ContextBroker', () => {
  const testRunDir = path.join(process.cwd(), 'test', 'fixtures', 'context-broker-test');

  beforeEach(() => {
    if (fs.existsSync(testRunDir)) {
      fs.rmSync(testRunDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testRunDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRunDir)) {
      fs.rmSync(testRunDir, { recursive: true, force: true });
    }
  });

  describe('git locking', () => {
    it('should acquire and release git lock', async () => {
      const broker = new ContextBroker(testRunDir);

      const lockId = await broker.acquireGitLock('agent1', 'commit');
      
      assert(lockId !== null, 'should acquire lock');
      assert(typeof lockId === 'string', 'lock ID should be string');

      broker.releaseGitLock(lockId);

      // should be able to acquire again after release
      const lockId2 = await broker.acquireGitLock('agent2', 'merge');
      assert(lockId2 !== null, 'should acquire lock after release');
      
      broker.releaseGitLock(lockId2);
    });

    it('should block concurrent lock acquisition', async () => {
      const broker = new ContextBroker(testRunDir);

      const lock1 = await broker.acquireGitLock('agent1', 'commit');
      assert(lock1 !== null);

      // try to acquire while locked (should timeout quickly for test)
      const broker2 = new ContextBroker(testRunDir);
      (broker2 as any).maxLockWaitMs = 500; // reduce timeout for test

      const lock2 = await broker2.acquireGitLock('agent2', 'push');
      assert.strictEqual(lock2, null, 'second lock should timeout');

      broker.releaseGitLock(lock1);
    });

    it('should force-release all locks via forceReleaseStaleLocks', async () => {
      const broker = new ContextBroker(testRunDir);

      // Create a lock
      const lockId = await broker.acquireGitLock('agent1', 'merge');
      assert(lockId !== null);

      // Force release it
      broker.forceReleaseStaleLocks();

      // Should be able to acquire again immediately
      const lockId2 = await broker.acquireGitLock('agent2', 'merge');
      assert(lockId2 !== null);
      broker.releaseGitLock(lockId2);
    });

    it('should remove stale locks', async function() {
      this.timeout(10000);
      
      const broker = new ContextBroker(testRunDir);

      // create a stale lock manually
      const lockDir = path.join(testRunDir, '.locks');
      const lockFile = path.join(lockDir, 'git.lock');
      
      const staleLock = {
        lockId: 'stale-123',
        agentName: 'old-agent',
        operation: 'old-op',
        acquiredAt: new Date(Date.now() - 400000).toISOString() // 6 minutes ago
      };

      fs.writeFileSync(lockFile, JSON.stringify(staleLock));

      // should remove stale lock and acquire
      const lockId = await broker.acquireGitLock('new-agent', 'new-op');
      assert(lockId !== null, 'should acquire after removing stale lock');

      broker.releaseGitLock(lockId);
    });
  });

  describe('shared context', () => {
    it('should add and retrieve step context', () => {
      const broker = new ContextBroker(testRunDir);

      broker.addStepContext({
        stepNumber: 1,
        agentName: 'FrontendExpert',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: ['src/app.tsx', 'src/styles.css'],
          outputsSummary: 'UI components created',
          branchName: 'swarm/exec-1/step-1-frontend',
          commitShas: ['abc123']
        }
      });

      const allContext = broker.getAllContext();
      assert.strictEqual(allContext.length, 1);
      assert.strictEqual(allContext[0]?.stepNumber, 1);
      assert.strictEqual(allContext[0]?.agentName, 'FrontendExpert');
    });

    it('should retrieve context for specific steps', () => {
      const broker = new ContextBroker(testRunDir);

      broker.addStepContext({
        stepNumber: 1,
        agentName: 'Agent1',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: ['file1.ts'],
          outputsSummary: 'output1'
        }
      });

      broker.addStepContext({
        stepNumber: 2,
        agentName: 'Agent2',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: ['file2.ts'],
          outputsSummary: 'output2'
        }
      });

      broker.addStepContext({
        stepNumber: 3,
        agentName: 'Agent3',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: ['file3.ts'],
          outputsSummary: 'output3'
        }
      });

      const context = broker.getContextForSteps([1, 3]);
      assert.strictEqual(context.length, 2);
      assert.strictEqual(context[0]?.stepNumber, 1);
      assert.strictEqual(context[1]?.stepNumber, 3);
    });

    it('should generate dependency context summary', () => {
      const broker = new ContextBroker(testRunDir);

      broker.addStepContext({
        stepNumber: 1,
        agentName: 'BackendMaster',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: ['api/users.ts', 'api/auth.ts'],
          outputsSummary: 'User API endpoints created',
          branchName: 'swarm/exec-1/step-1-backend',
          commitShas: ['abc123', 'def456']
        }
      });

      const summary = broker.getDependencyContext([1]);
      
      assert(summary.includes('Step 1'), 'should mention step number');
      assert(summary.includes('BackendMaster'), 'should mention agent');
      assert(summary.includes('User API endpoints created'), 'should include summary');
      assert(summary.includes('api/users.ts'), 'should list files');
      assert(summary.includes('Commits: 2'), 'should show commit count');
    });

    it('should check if dependencies are satisfied', () => {
      const broker = new ContextBroker(testRunDir);

      broker.addStepContext({
        stepNumber: 1,
        agentName: 'Agent1',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: [],
          outputsSummary: 'done'
        }
      });

      assert.strictEqual(broker.areDependenciesSatisfied([1]), true);
      assert.strictEqual(broker.areDependenciesSatisfied([1, 2]), false);
      assert.strictEqual(broker.areDependenciesSatisfied([]), true);
    });

    it('should wait for dependencies', async function() {
      this.timeout(5000);
      
      const broker = new ContextBroker(testRunDir);

      // simulate async dependency completion
      setTimeout(() => {
        broker.addStepContext({
          stepNumber: 1,
          agentName: 'Agent1',
          timestamp: new Date().toISOString(),
          data: {
            filesChanged: [],
            outputsSummary: 'done'
          }
        });
      }, 500);

      const satisfied = await broker.waitForDependencies([1], 2000);
      assert.strictEqual(satisfied, true);
    });

    it('should timeout waiting for dependencies', async function() {
      this.timeout(3000);
      
      const broker = new ContextBroker(testRunDir);

      const satisfied = await broker.waitForDependencies([1], 1000);
      assert.strictEqual(satisfied, false);
    });

    it('should clear context', () => {
      const broker = new ContextBroker(testRunDir);

      broker.addStepContext({
        stepNumber: 1,
        agentName: 'Agent1',
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: [],
          outputsSummary: 'done'
        }
      });

      assert.strictEqual(broker.getAllContext().length, 1);

      broker.clearContext();

      assert.strictEqual(broker.getAllContext().length, 0);
    });
  });
});
