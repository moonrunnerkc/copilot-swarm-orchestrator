// WorkerPool: manages concurrent async task execution with a fixed concurrency limit

/**
 * A pool that runs async tasks with bounded concurrency.
 */
class WorkerPool {
  /**
   * @param {number} [maxConcurrency=3] - Maximum number of tasks to run simultaneously.
   */
  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this._queue = [];
    this._running = 0;
    this._completed = 0;
    this._failed = 0;
    this._drainResolvers = [];
  }

  /**
   * Submit an async task to the pool. The task will start immediately if a slot
   * is available, otherwise it will be queued until one opens up.
   * @param {() => Promise<any>} taskFn - Async function to execute.
   * @returns {Promise<any>} Resolves with the task's return value, or rejects if it throws.
   */
  submit(taskFn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ taskFn, resolve, reject });
      this._dispatch();
    });
  }

  /**
   * Returns a Promise that resolves when all currently submitted tasks have
   * finished (both running and queued). Resolves immediately if nothing is pending.
   * @returns {Promise<void>}
   */
  drain() {
    if (this._running === 0 && this._queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._drainResolvers.push(resolve);
    });
  }

  /**
   * Returns a snapshot of pool activity counters.
   * @returns {{ running: number, queued: number, completed: number, failed: number }}
   */
  getStats() {
    return {
      running: this._running,
      queued: this._queue.length,
      completed: this._completed,
      failed: this._failed,
    };
  }

  /** @private */
  _dispatch() {
    while (this._running < this.maxConcurrency && this._queue.length > 0) {
      const { taskFn, resolve, reject } = this._queue.shift();
      this._running++;
      Promise.resolve()
        .then(() => taskFn())
        .then(
          (result) => {
            this._running--;
            this._completed++;
            resolve(result);
            this._onTaskDone();
          },
          (err) => {
            this._running--;
            this._failed++;
            reject(err);
            this._onTaskDone();
          }
        );
    }
  }

  /** @private */
  _onTaskDone() {
    this._dispatch();
    if (this._running === 0 && this._queue.length === 0) {
      const resolvers = this._drainResolvers.splice(0);
      for (const resolve of resolvers) resolve();
    }
  }
}

export { WorkerPool };
export default WorkerPool;
