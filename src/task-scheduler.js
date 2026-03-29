// TaskScheduler: schedules named tasks by priority and executes them through a bounded WorkerPool

import PriorityQueue from './priority-queue.js';
import WorkerPool from './worker-pool.js';

/**
 * Schedules async tasks by priority and runs them through a WorkerPool.
 * Lower priority numbers execute first.
 */
class TaskScheduler {
  /**
   * @param {object} [options={}]
   * @param {number} [options.concurrency=3] - Max concurrent tasks in the worker pool.
   */
  constructor({ concurrency = 3 } = {}) {
    this._queue = new PriorityQueue();
    this._pool = new WorkerPool(concurrency);
  }

  /**
   * Enqueues a named task with a given priority.
   * Lower priority numbers run first.
   * @param {string} name - Unique identifier for the task.
   * @param {() => Promise<any>} taskFn - Async function to execute.
   * @param {number} [priority=0] - Numeric priority (lower = runs sooner).
   */
  schedule(name, taskFn, priority = 0) {
    this._queue.enqueue({ name, taskFn }, priority);
  }

  /**
   * Drains the priority queue through the worker pool.
   * Submits all enqueued tasks in priority order and waits for all to complete.
   * @returns {Promise<Array<{name: string, status: 'fulfilled'|'rejected', result: any, durationMs: number}>>}
   *   Resolves with one result object per task, in the order they were submitted.
   */
  async processAll() {
    const promises = [];

    while (!this._queue.isEmpty()) {
      const { name, taskFn } = this._queue.dequeue();
      const start = Date.now();

      const p = this._pool
        .submit(taskFn)
        .then((result) => ({
          name,
          status: 'fulfilled',
          result,
          durationMs: Date.now() - start,
        }))
        .catch((err) => ({
          name,
          status: 'rejected',
          result: err,
          durationMs: Date.now() - start,
        }));

      promises.push(p);
    }

    await this._pool.drain();
    return Promise.all(promises);
  }
}

export { TaskScheduler };
export default TaskScheduler;
