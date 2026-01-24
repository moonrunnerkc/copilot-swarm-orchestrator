import { EventEmitter } from 'events';

export interface QueuedTask<T> {
  id: string;
  priority: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
  metadata: {
    stepNumber?: number;
    agentName?: string;
    wave?: number;
  };
}

export interface QueueStats {
  running: number;
  queued: number;
  completed: number;
  failed: number;
  maxConcurrency: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  rateLimitPatterns: RegExp[];
}

/**
 * execution queue with concurrency control and retry logic
 * handles rate limits and quota exhaustion gracefully
 */
export class ExecutionQueue extends EventEmitter {
  private queue: QueuedTask<any>[] = [];
  private running: Map<string, QueuedTask<any>> = new Map();
  private maxConcurrency: number;
  private retryConfig: RetryConfig;
  private stats = {
    completed: 0,
    failed: 0
  };

  constructor(maxConcurrency: number = 3, retryConfig?: Partial<RetryConfig>) {
    super();
    this.maxConcurrency = maxConcurrency;
    this.retryConfig = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      baseDelay: retryConfig?.baseDelay ?? 5000,
      maxDelay: retryConfig?.maxDelay ?? 60000,
      rateLimitPatterns: retryConfig?.rateLimitPatterns ?? [
        /rate limit/i,
        /quota.*exceed/i,
        /too many requests/i,
        /429/,
        /throttle/i
      ]
    };
  }

  /**
   * add task to queue with priority
   */
  async enqueue<T>(
    id: string,
    task: () => Promise<T>,
    options?: {
      priority?: number;
      maxRetries?: number;
      metadata?: QueuedTask<T>['metadata'];
    }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedTask: QueuedTask<T> = {
        id,
        priority: options?.priority ?? 0,
        execute: task,
        resolve,
        reject,
        retries: 0,
        maxRetries: options?.maxRetries ?? this.retryConfig.maxRetries,
        metadata: options?.metadata || {}
      };

      // insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex(t => t.priority < queuedTask.priority);
      if (insertIndex === -1) {
        this.queue.push(queuedTask);
      } else {
        this.queue.splice(insertIndex, 0, queuedTask);
      }

      this.emit('enqueued', { id, stats: this.getStats() });
      this.processQueue();
    });
  }

  /**
   * process queued tasks up to concurrency limit
   */
  private async processQueue(): Promise<void> {
    while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running.set(task.id, task);
      this.emit('started', { id: task.id, stats: this.getStats() });

      this.executeTask(task);
    }
  }

  /**
   * execute single task with retry on rate limits
   */
  private async executeTask<T>(task: QueuedTask<T>): Promise<void> {
    try {
      const result = await task.execute();
      this.running.delete(task.id);
      this.stats.completed++;
      this.emit('completed', { id: task.id, stats: this.getStats() });
      task.resolve(result);
      this.processQueue();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = this.retryConfig.rateLimitPatterns.some(pattern =>
        pattern.test(errorMessage)
      );

      if (isRateLimit && task.retries < task.maxRetries) {
        // exponential backoff
        task.retries++;
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, task.retries - 1),
          this.retryConfig.maxDelay
        );

        this.emit('retrying', {
          id: task.id,
          attempt: task.retries,
          maxRetries: task.maxRetries,
          delay,
          reason: 'rate_limit',
          stats: this.getStats()
        });

        this.running.delete(task.id);

        // re-enqueue after delay
        setTimeout(() => {
          this.queue.unshift(task);
          this.processQueue();
        }, delay);
      } else {
        // permanent failure
        this.running.delete(task.id);
        this.stats.failed++;
        this.emit('failed', {
          id: task.id,
          error: errorMessage,
          retries: task.retries,
          stats: this.getStats()
        });
        task.reject(error instanceof Error ? error : new Error(errorMessage));
        this.processQueue();
      }
    }
  }

  /**
   * get current queue statistics
   */
  getStats(): QueueStats {
    return {
      running: this.running.size,
      queued: this.queue.length,
      completed: this.stats.completed,
      failed: this.stats.failed,
      maxConcurrency: this.maxConcurrency
    };
  }

  /**
   * update max concurrency dynamically
   */
  setMaxConcurrency(limit: number): void {
    if (limit < 1) {
      throw new Error('Max concurrency must be at least 1');
    }
    this.maxConcurrency = limit;
    this.emit('concurrency_changed', { maxConcurrency: limit });
    this.processQueue();
  }

  /**
   * pause queue processing
   */
  pause(): void {
    this.maxConcurrency = 0;
    this.emit('paused');
  }

  /**
   * resume queue processing
   */
  resume(concurrency?: number): void {
    this.maxConcurrency = concurrency ?? 3;
    this.emit('resumed', { maxConcurrency: this.maxConcurrency });
    this.processQueue();
  }

  /**
   * clear all queued tasks
   */
  clear(): void {
    const cleared = this.queue.length;
    this.queue.forEach(task => {
      task.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    this.emit('cleared', { cleared });
  }

  /**
   * wait for all tasks to complete
   */
  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const checkDrained = () => {
        if (this.running.size === 0 && this.queue.length === 0) {
          this.removeListener('completed', checkDrained);
          this.removeListener('failed', checkDrained);
          resolve();
        }
      };

      if (this.running.size === 0 && this.queue.length === 0) {
        resolve();
      } else {
        this.on('completed', checkDrained);
        this.on('failed', checkDrained);
      }
    });
  }
}
