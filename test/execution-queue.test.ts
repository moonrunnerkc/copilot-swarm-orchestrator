import * as assert from 'assert';
import { ExecutionQueue, QueueStats, RetryConfig } from '../src/execution-queue';

describe('ExecutionQueue', () => {
  let queue: ExecutionQueue;

  afterEach(() => {
    // Prevent listener leaks in tests
    if (queue) queue.removeAllListeners();
  });

  describe('constructor', () => {
    it('creates a queue with default concurrency and retry config', () => {
      queue = new ExecutionQueue();
      const stats = queue.getStats();
      assert.strictEqual(stats.maxConcurrency, 3);
      assert.strictEqual(stats.running, 0);
      assert.strictEqual(stats.queued, 0);
    });

    it('accepts custom concurrency limit', () => {
      queue = new ExecutionQueue(5);
      assert.strictEqual(queue.getStats().maxConcurrency, 5);
    });
  });

  describe('enqueue and execute', () => {
    it('executes a simple task and returns result', async () => {
      queue = new ExecutionQueue(2);
      const result = await queue.enqueue('t1', async () => 42);
      assert.strictEqual(result, 42);
      assert.strictEqual(queue.getStats().completed, 1);
    });

    it('executes multiple tasks up to concurrency limit', async () => {
      queue = new ExecutionQueue(2);
      let concurrentRunning = 0;
      let maxConcurrent = 0;

      const makeTask = (id: string, delayMs: number) =>
        queue.enqueue(id, async () => {
          concurrentRunning++;
          maxConcurrent = Math.max(maxConcurrent, concurrentRunning);
          await new Promise(r => setTimeout(r, delayMs));
          concurrentRunning--;
          return id;
        });

      const results = await Promise.all([
        makeTask('a', 50),
        makeTask('b', 50),
        makeTask('c', 50),
      ]);

      assert.deepStrictEqual(results.sort(), ['a', 'b', 'c']);
      assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}, expected <= 2`);
    });

    it('rejects when task throws a non-rate-limit error', async () => {
      queue = new ExecutionQueue(1, { maxRetries: 0 });
      await assert.rejects(
        () => queue.enqueue('fail', async () => { throw new Error('bad input'); }),
        (err: Error) => err.message === 'bad input'
      );
      assert.strictEqual(queue.getStats().failed, 1);
    });
  });

  describe('priority ordering', () => {
    it('executes higher priority tasks first', async () => {
      // concurrency 1 forces serial execution; order reveals priority
      queue = new ExecutionQueue(1);
      const order: string[] = [];

      // Enqueue a blocking task to hold the queue while we add prioritized tasks
      let unblock: () => void;
      const blocker = new Promise<void>(r => { unblock = r; });
      const blockTask = queue.enqueue('block', () => blocker);

      // Now enqueue tasks with different priorities while 'block' is running
      const lowP = queue.enqueue('low', async () => { order.push('low'); return 'low'; }, { priority: 1 });
      const highP = queue.enqueue('high', async () => { order.push('high'); return 'high'; }, { priority: 10 });

      // Release the blocker
      unblock!();
      await blockTask;
      await Promise.all([lowP, highP]);

      assert.strictEqual(order[0], 'high');
      assert.strictEqual(order[1], 'low');
    });
  });

  describe('rate limit retry', () => {
    it('retries on rate limit errors with exponential backoff', async () => {
      queue = new ExecutionQueue(1, { maxRetries: 2, baseDelay: 10, maxDelay: 100 });
      let attempts = 0;

      const result = await queue.enqueue('retry-task', async () => {
        attempts++;
        if (attempts < 3) throw new Error('rate limit exceeded');
        return 'success';
      }, { maxRetries: 3 });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });

    it('fails permanently after exhausting retries on rate limit', async () => {
      queue = new ExecutionQueue(1, { maxRetries: 1, baseDelay: 10, maxDelay: 50 });

      await assert.rejects(
        () => queue.enqueue('doomed', async () => { throw new Error('429 Too Many Requests'); }, { maxRetries: 1 }),
        (err: Error) => err.message.includes('429')
      );

      assert.strictEqual(queue.getStats().failed, 1);
    });

    it('does not retry non-rate-limit errors', async () => {
      queue = new ExecutionQueue(1, { maxRetries: 3, baseDelay: 10 });
      let attempts = 0;

      await assert.rejects(
        () => queue.enqueue('no-retry', async () => {
          attempts++;
          throw new Error('null pointer exception');
        }, { maxRetries: 3 }),
        (err: Error) => err.message.includes('null pointer')
      );

      // Should only attempt once because the error is not a rate limit pattern
      assert.strictEqual(attempts, 1);
    });
  });

  describe('getStats', () => {
    it('tracks running, queued, completed, and failed counts', async () => {
      queue = new ExecutionQueue(1);

      let unblock: () => void;
      const blocker = new Promise<void>(r => { unblock = r; });
      const t1 = queue.enqueue('t1', () => blocker);
      // t1 is running, t2 should be queued
      const t2 = queue.enqueue('t2', async () => 'done');

      const midStats = queue.getStats();
      assert.strictEqual(midStats.running, 1);
      assert.strictEqual(midStats.queued, 1);

      unblock!();
      await t1;
      await t2;

      const finalStats = queue.getStats();
      assert.strictEqual(finalStats.completed, 2);
      assert.strictEqual(finalStats.running, 0);
      assert.strictEqual(finalStats.queued, 0);
    });
  });

  describe('setMaxConcurrency', () => {
    it('updates concurrency and reflects in stats', () => {
      queue = new ExecutionQueue(2);
      queue.setMaxConcurrency(5);
      assert.strictEqual(queue.getStats().maxConcurrency, 5);
    });

    it('throws for concurrency less than 1', () => {
      queue = new ExecutionQueue(2);
      assert.throws(() => queue.setMaxConcurrency(0), /at least 1/);
    });
  });

  describe('pause and resume', () => {
    it('pauses processing by setting concurrency to 0', () => {
      queue = new ExecutionQueue(3);
      queue.pause();
      assert.strictEqual(queue.getStats().maxConcurrency, 0);
    });

    it('resumes processing with optional new concurrency', () => {
      queue = new ExecutionQueue(3);
      queue.pause();
      queue.resume(4);
      assert.strictEqual(queue.getStats().maxConcurrency, 4);
    });

    it('resume defaults to concurrency 3 when no argument given', () => {
      queue = new ExecutionQueue(5);
      queue.pause();
      queue.resume();
      assert.strictEqual(queue.getStats().maxConcurrency, 3);
    });
  });

  describe('clear', () => {
    it('rejects all queued tasks and empties the queue', async () => {
      queue = new ExecutionQueue(1);

      // Hold the queue with a running task
      let unblock: () => void;
      const blocker = new Promise<void>(r => { unblock = r; });
      const running = queue.enqueue('running', () => blocker);

      // Queue up a task that will be cleared
      const clearable = queue.enqueue('clearable', async () => 'never');

      // Clear while running task is active
      queue.clear();
      assert.strictEqual(queue.getStats().queued, 0);

      // The cleared task should reject
      await assert.rejects(() => clearable, /Queue cleared/);

      // Let the running task finish normally
      unblock!();
      await running;
    });
  });

  describe('drain', () => {
    it('resolves immediately when queue is empty and nothing running', async () => {
      queue = new ExecutionQueue(2);
      await queue.drain(); // should not hang
    });

    it('resolves after all enqueued tasks complete', async () => {
      queue = new ExecutionQueue(2);
      const results: number[] = [];

      queue.enqueue('a', async () => { results.push(1); return 1; });
      queue.enqueue('b', async () => { results.push(2); return 2; });
      queue.enqueue('c', async () => { results.push(3); return 3; });

      await queue.drain();
      assert.strictEqual(results.length, 3);
      assert.strictEqual(queue.getStats().completed, 3);
    });

    it('resolves after tasks that include failures', async () => {
      queue = new ExecutionQueue(2, { maxRetries: 0 });

      queue.enqueue('ok', async () => 'ok');
      queue.enqueue('fail', async () => { throw new Error('boom'); }).catch(() => {
        // Suppress unhandled rejection; we just want drain to resolve
      });

      await queue.drain();
      assert.strictEqual(queue.getStats().completed, 1);
      assert.strictEqual(queue.getStats().failed, 1);
    });
  });

  describe('events', () => {
    it('emits enqueued event', (done) => {
      queue = new ExecutionQueue(1);
      queue.on('enqueued', (data) => {
        assert.strictEqual(data.id, 'ev-task');
        done();
      });
      queue.enqueue('ev-task', async () => 'ok');
    });

    it('emits started event when task begins', (done) => {
      queue = new ExecutionQueue(1);
      queue.on('started', (data) => {
        assert.strictEqual(data.id, 'start-task');
        done();
      });
      queue.enqueue('start-task', async () => 'ok');
    });

    it('emits completed event', (done) => {
      queue = new ExecutionQueue(1);
      queue.on('completed', (data) => {
        assert.strictEqual(data.id, 'comp-task');
        done();
      });
      queue.enqueue('comp-task', async () => 'ok');
    });

    it('emits failed event on permanent failure', (done) => {
      queue = new ExecutionQueue(1, { maxRetries: 0 });
      queue.on('failed', (data) => {
        assert.strictEqual(data.id, 'fail-task');
        assert.ok(data.error.includes('oops'));
        done();
      });
      queue.enqueue('fail-task', async () => { throw new Error('oops'); }).catch(() => {
        // Suppress unhandled rejection
      });
    });
  });
});
