import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

/**
 * Shared context entry for cross-agent communication
 */
export interface ContextEntry {
  stepNumber: number;
  agentName: string;
  timestamp: string;
  data: {
    filesChanged: string[];
    outputsSummary: string;
    branchName?: string;
    commitShas?: string[];
    verificationPassed?: boolean;
  };
}

/**
 * Git lock for safe concurrent operations
 */
interface GitLock {
  lockId: string;
  agentName: string;
  operation: string;
  acquiredAt: string;
}

/**
 * Context Broker - manages shared state and git locking for parallel agents
 * Enables safe concurrent execution with file-based coordination
 */
export class ContextBroker {
  private contextDir: string;
  private lockDir: string;
  private contextFile: string;
  private maxLockWaitMs: number = 30000; // 30 seconds max wait for lock

  constructor(runDir: string) {
    this.contextDir = path.join(runDir, '.context');
    this.lockDir = path.join(runDir, '.locks');
    this.contextFile = path.join(this.contextDir, 'shared-context.json');
    
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.contextDir)) {
      fs.mkdirSync(this.contextDir, { recursive: true });
    }
    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true });
    }
  }

  /**
   * Acquire a git lock for safe concurrent operations
   * Returns lock ID if successful, null if timeout
   */
  async acquireGitLock(
    agentName: string,
    operation: string
  ): Promise<string | null> {
    const lockId = randomBytes(16).toString('hex');
    const lockFile = path.join(this.lockDir, 'git.lock');
    
    const lock: GitLock = {
      lockId,
      agentName,
      operation,
      acquiredAt: new Date().toISOString()
    };

    const startTime = Date.now();
    
    // spin-wait for lock with timeout
    while (Date.now() - startTime < this.maxLockWaitMs) {
      try {
        // atomic file creation (fails if exists)
        fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2), { flag: 'wx' });
        return lockId;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'EEXIST') {
          // lock exists, check if stale (> 5 minutes old)
          try {
            const existingLock = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as GitLock;
            const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
            
            if (lockAge > 300000) {
              // stale lock, force remove
              fs.unlinkSync(lockFile);
              continue;
            }
          } catch {
            // corrupted lock file, remove
            fs.unlinkSync(lockFile);
            continue;
          }
          
          // wait and retry
          await this.sleep(100);
          continue;
        }
        throw error;
      }
    }

    return null; // timeout
  }

  /**
   * Release a git lock
   */
  releaseGitLock(lockId: string): void {
    const lockFile = path.join(this.lockDir, 'git.lock');
    
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as GitLock;
      
      if (lock.lockId === lockId) {
        fs.unlinkSync(lockFile);
      } else {
        console.warn(`Lock mismatch: expected ${lockId}, got ${lock.lockId}`);
      }
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        console.error('Failed to release lock:', error);
      }
    }
  }

  /**
   * Add context from a completed step
   */
  addStepContext(entry: ContextEntry): void {
    const contexts = this.getAllContext();
    contexts.push(entry);
    
    fs.writeFileSync(
      this.contextFile,
      JSON.stringify(contexts, null, 2),
      'utf8'
    );
  }

  /**
   * Get all shared context entries
   */
  getAllContext(): ContextEntry[] {
    if (!fs.existsSync(this.contextFile)) {
      return [];
    }
    
    try {
      const content = fs.readFileSync(this.contextFile, 'utf8');
      return JSON.parse(content) as ContextEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Get context for specific steps (useful for dependency resolution)
   */
  getContextForSteps(stepNumbers: number[]): ContextEntry[] {
    const allContext = this.getAllContext();
    return allContext.filter(entry => stepNumbers.includes(entry.stepNumber));
  }

  /**
   * Get summary of changes from dependent steps
   */
  getDependencyContext(dependencies: number[]): string {
    if (dependencies.length === 0) {
      return 'No dependencies - you are starting fresh.';
    }

    const entries = this.getContextForSteps(dependencies);
    
    if (entries.length === 0) {
      return `Dependencies: Steps ${dependencies.join(', ')} (context not yet available)`;
    }

    const lines: string[] = [];
    lines.push(`Context from ${entries.length} dependent step(s):`);
    
    entries.forEach(entry => {
      lines.push(`\nStep ${entry.stepNumber} (${entry.agentName}):`);
      lines.push(`  - ${entry.data.outputsSummary}`);
      
      if (entry.data.filesChanged.length > 0) {
        lines.push(`  - Files modified: ${entry.data.filesChanged.slice(0, 5).join(', ')}${entry.data.filesChanged.length > 5 ? '...' : ''}`);
      }
      
      if (entry.data.branchName) {
        lines.push(`  - Branch: ${entry.data.branchName}`);
      }
      
      if (entry.data.commitShas && entry.data.commitShas.length > 0) {
        lines.push(`  - Commits: ${entry.data.commitShas.length}`);
      }
    });

    return lines.join('\n');
  }

  /**
   * Check if all dependencies are satisfied
   */
  areDependenciesSatisfied(dependencies: number[]): boolean {
    if (dependencies.length === 0) {
      return true;
    }

    const completedSteps = new Set(
      this.getAllContext().map(entry => entry.stepNumber)
    );

    return dependencies.every(dep => completedSteps.has(dep));
  }

  /**
   * Wait for dependencies to be satisfied
   */
  async waitForDependencies(
    dependencies: number[],
    timeoutMs: number = 600000 // 10 minutes
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (this.areDependenciesSatisfied(dependencies)) {
        return true;
      }
      
      await this.sleep(1000); // check every second
    }

    return false;
  }

  /**
   * Clear all context (useful for testing or fresh runs)
   */
  clearContext(): void {
    if (fs.existsSync(this.contextFile)) {
      fs.unlinkSync(this.contextFile);
    }
    
    // clean up any stale locks
    const lockFiles = fs.readdirSync(this.lockDir);
    lockFiles.forEach(file => {
      fs.unlinkSync(path.join(this.lockDir, file));
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ContextBroker;
