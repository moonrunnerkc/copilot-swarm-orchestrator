// Tests PriorityQueue (ordering/peek/empty), WorkerPool (concurrency/drain/stats),
// and TaskScheduler (schedule+processAll, result shape, priority ordering).
// Run with: node --test test/task-scheduler.test.js

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// src/ has its own package.json with "type":"module", so we load via dynamic import.
let PriorityQueue, WorkerPool, TaskScheduler;

before(async () => {
  const root = path.resolve(__dirname, '..');
  ({ PriorityQueue } = await import(path.join(root, 'src/priority-queue.js')));
  ({ WorkerPool } = await import(path.join(root, 'src/worker-pool.js')));
  ({ TaskScheduler } = await import(path.join(root, 'src/task-scheduler.js')));
});

// ---------------------------------------------------------------------------
// PriorityQueue
// ---------------------------------------------------------------------------

describe('PriorityQueue', () => {
  it('dequeues items in ascending priority order (lower number first)', () => {
    const pq = new PriorityQueue();
    pq.enqueue('low', 10);
    pq.enqueue('high', 1);
    pq.enqueue('mid', 5);

    assert.equal(pq.dequeue(), 'high');
    assert.equal(pq.dequeue(), 'mid');
    assert.equal(pq.dequeue(), 'low');
  });

  it('peek returns the highest-priority item without removing it', () => {
    const pq = new PriorityQueue();
    pq.enqueue('b', 2);
    pq.enqueue('a', 1);

    assert.equal(pq.peek(), 'a');
    assert.equal(pq.size(), 2); // still 2 items
  });

  it('isEmpty returns true on empty queue and false after enqueue', () => {
    const pq = new PriorityQueue();
    assert.equal(pq.isEmpty(), true);
    pq.enqueue('x', 0);
    assert.equal(pq.isEmpty(), false);
  });

  it('dequeue on an empty queue returns undefined', () => {
    const pq = new PriorityQueue();
    assert.equal(pq.dequeue(), undefined);
  });

  it('size tracks the number of items correctly', () => {
    const pq = new PriorityQueue();
    assert.equal(pq.size(), 0);
    pq.enqueue('a', 1);
    pq.enqueue('b', 2);
    assert.equal(pq.size(), 2);
    pq.dequeue();
    assert.equal(pq.size(), 1);
  });
});

// ---------------------------------------------------------------------------
// WorkerPool
// ---------------------------------------------------------------------------

describe('WorkerPool', () => {
  it('respects maxConcurrency — no more than N tasks run simultaneously', async () => {
    const maxConcurrency = 2;
    const pool = new WorkerPool(maxConcurrency);
    let concurrentPeak = 0;
    let currentlyRunning = 0;

    const makeSlow = () => async () => {
      currentlyRunning++;
      if (currentlyRunning > concurrentPeak) concurrentPeak = currentlyRunning;
      await new Promise((r) => setTimeout(r, 20));
      currentlyRunning--;
    };

    await Promise.all([
      pool.submit(makeSlow()),
      pool.submit(makeSlow()),
      pool.submit(makeSlow()),
      pool.submit(makeSlow()),
    ]);

    assert.ok(concurrentPeak <= maxConcurrency,
      `Peak concurrency ${concurrentPeak} exceeded max ${maxConcurrency}`);
  });

  it('drain() resolves only after all submitted tasks have finished', async () => {
    const pool = new WorkerPool(2);
    let done = 0;
    const delay = (ms) => () => new Promise((r) => setTimeout(r, ms)).then(() => { done++; });

    pool.submit(delay(30));
    pool.submit(delay(30));
    pool.submit(delay(30));

    await pool.drain();
    assert.equal(done, 3);
  });

  it('getStats() reports accurate completed and failed counts', async () => {
    const pool = new WorkerPool(3);

    pool.submit(async () => 'ok1');
    pool.submit(async () => { throw new Error('boom'); }).catch(() => {});
    pool.submit(async () => 'ok2');

    await pool.drain();
    const stats = pool.getStats();

    assert.equal(stats.completed, 2);
    assert.equal(stats.failed, 1);
    assert.equal(stats.running, 0);
    assert.equal(stats.queued, 0);
  });

  it('getStats() shows running > 0 while tasks are in-flight', async () => {
    const pool = new WorkerPool(2);
    let resolveTask;
    const blocker = () => new Promise((r) => { resolveTask = r; });

    const p = pool.submit(blocker);
    // Yield to let the task start
    await new Promise((r) => setImmediate(r));

    const stats = pool.getStats();
    assert.equal(stats.running, 1);

    resolveTask();
    await p;
  });
});

// ---------------------------------------------------------------------------
// TaskScheduler
// ---------------------------------------------------------------------------

describe('TaskScheduler', () => {
  it('processAll returns one result per scheduled task', async () => {
    const scheduler = new TaskScheduler({ concurrency: 3 });
    scheduler.schedule('t1', async () => 'r1', 2);
    scheduler.schedule('t2', async () => 'r2', 1);
    scheduler.schedule('t3', async () => 'r3', 3);
    scheduler.schedule('t4', async () => 'r4', 0);
    scheduler.schedule('t5', async () => 'r5', 4);

    const results = await scheduler.processAll();
    assert.equal(results.length, 5);
  });

  it('each result has name, status, result, and durationMs fields', async () => {
    const scheduler = new TaskScheduler({ concurrency: 2 });
    scheduler.schedule('alpha', async () => 42, 1);
    scheduler.schedule('beta', async () => 'hello', 2);
    scheduler.schedule('gamma', async () => ({ x: 1 }), 0);
    scheduler.schedule('delta', async () => true, 3);
    scheduler.schedule('epsilon', async () => null, 5);

    const results = await scheduler.processAll();
    for (const r of results) {
      assert.ok('name' in r, 'missing name');
      assert.ok('status' in r, 'missing status');
      assert.ok('result' in r, 'missing result');
      assert.ok('durationMs' in r, 'missing durationMs');
      assert.equal(typeof r.durationMs, 'number');
      assert.ok(r.durationMs >= 0);
    }
  });

  it('higher-priority tasks (lower number) are submitted first', async () => {
    const executionOrder = [];
    const scheduler = new TaskScheduler({ concurrency: 1 }); // serial to observe order

    scheduler.schedule('p5', async () => { executionOrder.push('p5'); }, 5);
    scheduler.schedule('p1', async () => { executionOrder.push('p1'); }, 1);
    scheduler.schedule('p3', async () => { executionOrder.push('p3'); }, 3);
    scheduler.schedule('p2', async () => { executionOrder.push('p2'); }, 2);
    scheduler.schedule('p4', async () => { executionOrder.push('p4'); }, 4);

    await scheduler.processAll();

    assert.deepEqual(executionOrder, ['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('fulfilled tasks have status "fulfilled" with correct result', async () => {
    const scheduler = new TaskScheduler({ concurrency: 3 });
    scheduler.schedule('sum', async () => 2 + 2, 0);
    scheduler.schedule('str', async () => 'world', 1);
    scheduler.schedule('arr', async () => [1, 2, 3], 2);
    scheduler.schedule('obj', async () => ({ ok: true }), 3);
    scheduler.schedule('num', async () => 99, 4);

    const results = await scheduler.processAll();
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));

    assert.equal(byName.sum.status, 'fulfilled');
    assert.equal(byName.sum.result, 4);
    assert.equal(byName.str.result, 'world');
  });

  it('rejected tasks have status "rejected" and result is the error', async () => {
    const scheduler = new TaskScheduler({ concurrency: 2 });
    const err = new Error('task failed');

    scheduler.schedule('ok', async () => 'fine', 0);
    scheduler.schedule('bad', async () => { throw err; }, 1);
    scheduler.schedule('ok2', async () => 'also fine', 2);
    scheduler.schedule('bad2', async () => { throw new Error('also bad'); }, 3);
    scheduler.schedule('ok3', async () => 'still fine', 4);

    const results = await scheduler.processAll();
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));

    assert.equal(byName.bad.status, 'rejected');
    assert.equal(byName.bad.result, err);
    assert.equal(byName.ok.status, 'fulfilled');
    assert.equal(byName.ok.result, 'fine');
  });
});
