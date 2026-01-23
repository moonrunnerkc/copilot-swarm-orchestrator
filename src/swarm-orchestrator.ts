import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionPlan, PlanStep } from './plan-generator';
import { AgentProfile } from './config-loader';
import SessionExecutor, { SessionResult, SessionOptions } from './session-executor';
import ContextBroker, { ContextEntry } from './context-broker';
import ShareParser from './share-parser';
import VerifierEngine, { VerificationResult } from './verifier-engine';
import { DeploymentMetadata } from './deployment-manager';

export interface ParallelStepResult {
  stepNumber: number;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  branchName?: string;
  sessionResult?: SessionResult;
  verificationResult?: VerificationResult;
  error?: string;
  startTime?: string;
  endTime?: string;
}

export interface SwarmExecutionContext {
  plan: ExecutionPlan;
  runDir: string;
  executionId: string;
  startTime: string;
  results: ParallelStepResult[];
  contextBroker: ContextBroker;
  mainBranch: string;
  deployments?: DeploymentMetadata[];
}

/**
 * Swarm Orchestrator - coordinates parallel execution of independent Copilot CLI sessions
 * Manages concurrent sessions, per-agent branches, and automatic merging
 */
export class SwarmOrchestrator {
  private sessionExecutor: SessionExecutor;
  private shareParser: ShareParser;
  private verifier: VerifierEngine;
  private workingDir: string;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.sessionExecutor = new SessionExecutor(this.workingDir);
    this.shareParser = new ShareParser();
    this.verifier = new VerifierEngine(this.workingDir);
  }

  /**
   * Initialize swarm execution context
   */
  initializeSwarmExecution(
    plan: ExecutionPlan,
    runDir: string
  ): SwarmExecutionContext {
    const executionId = this.generateExecutionId();
    const contextBroker = new ContextBroker(runDir);
    
    // get current git branch
    const mainBranch = this.getCurrentBranch();

    const context: SwarmExecutionContext = {
      plan,
      runDir,
      executionId,
      startTime: new Date().toISOString(),
      results: plan.steps.map(step => ({
        stepNumber: step.stepNumber,
        agentName: step.agentName,
        status: 'pending'
      })),
      contextBroker,
      mainBranch
    };

    return context;
  }

  /**
   * Execute plan with parallel swarm - independent steps run concurrently
   */
  async executeSwarm(
    plan: ExecutionPlan,
    agents: Map<string, AgentProfile>,
    runDir: string,
    options?: {
      model?: string;
      maxConcurrency?: number;
      enableExternal?: boolean;
      dryRun?: boolean;
      autoPR?: boolean;
    }
  ): Promise<SwarmExecutionContext> {
    const context = this.initializeSwarmExecution(plan, runDir);
    
    console.log('\n🚀 Starting Parallel Swarm Execution');
    console.log(`Execution ID: ${context.executionId}`);
    console.log(`Main branch: ${context.mainBranch}`);
    console.log(`Steps: ${plan.steps.length}`);
    console.log(`Max concurrency: ${options?.maxConcurrency || 'unlimited'}\n`);

    // build dependency graph
    const dependencyGraph = this.buildDependencyGraph(plan);
    
    // identify waves of parallel execution
    const executionWaves = this.identifyExecutionWaves(dependencyGraph);
    
    console.log(`Execution will proceed in ${executionWaves.length} wave(s)\n`);

    // execute each wave
    for (let waveIndex = 0; waveIndex < executionWaves.length; waveIndex++) {
      const wave = executionWaves[waveIndex];
      console.log(`\n📊 Wave ${waveIndex + 1}: ${wave.length} step(s) in parallel`);
      
      const wavePromises = wave.map(stepNumber => {
        const step = plan.steps.find(s => s.stepNumber === stepNumber);
        const agent = agents.get(step!.agentName);
        
        if (!step || !agent) {
          throw new Error(`Step ${stepNumber} or agent not found`);
        }

        return this.executeStepInSwarm(step, agent, context, options);
      });

      // wait for all steps in wave to complete
      const waveResults = await Promise.allSettled(wavePromises);
      
      // check for failures
      const failures = waveResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`\n❌ Wave ${waveIndex + 1} had ${failures.length} failure(s)`);
        failures.forEach((failure, idx) => {
          const reason = failure.status === 'rejected' ? failure.reason : 'unknown';
          console.error(`  - Step ${wave[idx]}: ${reason}`);
        });
        // continue to next wave anyway (for partial results)
      }
    }

    // merge all agent branches back to main
    console.log('\n🔀 Merging agent branches to main...');
    await this.mergeAllBranches(context);

    // Auto-create PR if requested
    if (options?.autoPR) {
      console.log('\n📝 Creating PR...');
      try {
        const PRAutomation = require('./pr-automation').default;
        const ExternalToolManager = require('./external-tool-manager').default;
        const DeploymentManager = require('./deployment-manager').default;
        
        const toolManager = new ExternalToolManager({
          enableExternal: options.enableExternal || false,
          dryRun: options.dryRun || false,
          logFile: path.join(runDir, 'external-commands.log')
        });
        
        const deploymentManager = new DeploymentManager(toolManager, this.workingDir);
        const prAutomation = new PRAutomation(toolManager, this.workingDir);
        
        const deployments = deploymentManager.loadDeploymentMetadata(runDir);
        const summary = prAutomation.generatePRSummary(context, deployments);
        const prResult = await prAutomation.createPR(summary);
        
        if (prResult.success) {
          console.log(`✅ PR created: ${prResult.url}`);
        } else {
          console.warn(`⚠️  PR creation failed: ${prResult.error}`);
        }
      } catch (error) {
        console.warn(`⚠️  PR automation error: ${error instanceof Error ? error.message : error}`);
      }
    }

    return context;
  }

  /**
   * Execute a single step within the swarm
   */
  private async executeStepInSwarm(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options?: { model?: string }
  ): Promise<void> {
    const resultIndex = context.results.findIndex(r => r.stepNumber === step.stepNumber);
    const result = context.results[resultIndex];
    if (!result) {
      throw new Error(`Result for step ${step.stepNumber} not found`);
    }

    try {
      // wait for dependencies
      if (step.dependencies.length > 0) {
        console.log(`  ⏳ Step ${step.stepNumber} waiting for dependencies: ${step.dependencies.join(', ')}`);
        
        const satisfied = await context.contextBroker.waitForDependencies(step.dependencies, 600000);
        if (!satisfied) {
          throw new Error('Dependencies timeout after 10 minutes');
        }
      }

      // create per-agent branch
      const branchName = `swarm/${context.executionId}/step-${step.stepNumber}-${agent.name.toLowerCase()}`;
      result.branchName = branchName;
      result.status = 'running';
      result.startTime = new Date().toISOString();

      await this.createAgentBranch(branchName, context.mainBranch);
      console.log(`  🌿 Step ${step.stepNumber} (${agent.name}) on branch: ${branchName}`);

      // build enhanced prompt with dependency context
      const dependencyContext = context.contextBroker.getDependencyContext(step.dependencies);
      const enhancedPrompt = this.buildSwarmPrompt(step, agent, context, dependencyContext);

      // execute session on agent branch
      const transcriptPath = path.join(
        context.runDir,
        'steps',
        `step-${step.stepNumber}`,
        'share.md'
      );

      const sessionOptions: SessionOptions = {
        allowAllTools: true,
        shareToFile: transcriptPath,
        ...(options?.model && { model: options.model })
      };

      const sessionResult = await this.sessionExecutor.executeSession(enhancedPrompt, sessionOptions);

      result.sessionResult = sessionResult;

      if (!sessionResult.success) {
        throw new Error(sessionResult.error || 'Session failed');
      }

      // parse transcript for context
      const transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
      const shareIndex = this.shareParser.parse(transcriptContent);

      // verify the step
      const verificationResult = await this.verifier.verifyStep(
        step.stepNumber,
        agent.name,
        transcriptPath,
        {
          requireTests: step.task.toLowerCase().includes('test'),
          requireBuild: step.task.toLowerCase().includes('build'),
          requireCommits: true // Always require commits for human-like history
        }
      );

      result.verificationResult = verificationResult;

      // generate and commit verification report
      const reportPath = path.join(
        context.runDir,
        'verification',
        `step-${step.stepNumber}-verification.md`
      );
      
      await this.verifier.generateVerificationReport(verificationResult, reportPath);

      if (verificationResult.passed) {
        await this.verifier.commitVerificationReport(
          reportPath,
          step.stepNumber,
          agent.name,
          true
        );
      } else {
        // verification failed - attempt rollback
        console.warn(`  ⚠️ Step ${step.stepNumber} failed verification, attempting rollback...`);
        
        const rollbackResult = await this.verifier.rollback(
          step.stepNumber,
          branchName,
          shareIndex.changedFiles
        );

        if (rollbackResult.success) {
          console.warn(`  🔄 Rollback successful, ${rollbackResult.filesRestored.length} file(s) restored`);
        }

        throw new Error('Step failed verification - see verification report');
      }

      // add to shared context
      const contextEntry: ContextEntry = {
        stepNumber: step.stepNumber,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: shareIndex.changedFiles,
          outputsSummary: step.expectedOutputs.join(', '),
          branchName,
          commitShas: shareIndex.gitCommits.map(c => c.sha || 'unknown'),
          verificationPassed: verificationResult.passed
        }
      };

      context.contextBroker.addStepContext(contextEntry);

      result.status = 'completed';
      result.endTime = new Date().toISOString();

      console.log(`  ✅ Step ${step.stepNumber} (${agent.name}) completed and verified`);

    } catch (error: unknown) {
      const err = error as Error;
      result.status = 'failed';
      result.error = err.message;
      result.endTime = new Date().toISOString();
      
      console.error(`  ❌ Step ${step.stepNumber} (${agent.name}) failed: ${err.message}`);
      throw error;
    }
  }

  /**
   * Build enhanced prompt for swarm execution
   */
  private buildSwarmPrompt(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    dependencyContext: string
  ): string {
    const sections: string[] = [];

    sections.push('=== COPILOT SWARM ORCHESTRATOR - Parallel Execution ===\n');
    sections.push(`Step ${step.stepNumber} of ${context.plan.steps.length}`);
    sections.push(`Agent: ${agent.name}`);
    sections.push(`Branch: swarm/${context.executionId}/step-${step.stepNumber}-${agent.name.toLowerCase()}`);
    sections.push(`Execution Mode: PARALLEL\n`);

    sections.push('YOUR TASK:');
    sections.push(step.task + '\n');

    sections.push('PARALLEL EXECUTION CONTEXT:');
    sections.push('You are running in parallel with other agents. Your changes are isolated');
    sections.push('on a dedicated branch and will be auto-merged when complete.\n');

    sections.push('DEPENDENCY CONTEXT:');
    sections.push(dependencyContext + '\n');

    sections.push('GIT WORKFLOW:');
    sections.push('- You are on your own agent branch');
    sections.push('- Make incremental commits with natural, human-like messages');
    sections.push('- Your branch will auto-merge to main when you complete');
    sections.push('- If conflicts arise, they will be flagged for manual resolution\n');

    sections.push('COMMIT MESSAGE GUIDELINES:');
    sections.push('Use varied, natural messages like:');
    sections.push('  "add user authentication module"');
    sections.push('  "fix: handle null case in parser"');
    sections.push('  "update config and deps"');
    sections.push('  "implement todo API with tests"\n');

    sections.push('SCOPE: ' + agent.scope.join(', '));
    sections.push('BOUNDARIES: ' + agent.boundaries.join(', '));
    sections.push('\nDONE WHEN: ' + agent.done_definition.join(', '));

    sections.push('\n=== BEGIN PARALLEL WORK ===');

    return sections.join('\n');
  }

  /**
   * Build dependency graph from plan
   */
  private buildDependencyGraph(plan: ExecutionPlan): Map<number, number[]> {
    const graph = new Map<number, number[]>();
    
    plan.steps.forEach(step => {
      graph.set(step.stepNumber, step.dependencies);
    });

    return graph;
  }

  /**
   * Identify waves of parallel execution (topological sort by levels)
   */
  private identifyExecutionWaves(graph: Map<number, number[]>): number[][] {
    const waves: number[][] = [];
    const completed = new Set<number>();
    const allSteps = Array.from(graph.keys());

    while (completed.size < allSteps.length) {
      const currentWave: number[] = [];

      // find steps whose dependencies are all completed
      for (const step of allSteps) {
        if (completed.has(step)) continue;

        const deps = graph.get(step) || [];
        const allDepsCompleted = deps.every(dep => completed.has(dep));

        if (allDepsCompleted) {
          currentWave.push(step);
        }
      }

      if (currentWave.length === 0) {
        throw new Error('Circular dependency detected or graph issue');
      }

      waves.push(currentWave);
      currentWave.forEach(step => completed.add(step));
    }

    return waves;
  }

  /**
   * Create a new git branch for an agent
   */
  private async createAgentBranch(branchName: string, fromBranch: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['checkout', '-b', branchName, fromBranch], {
        cwd: this.workingDir
      });

      let stderr = '';
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create branch: ${stderr}`));
        }
      });
    });
  }

  /**
   * Merge all agent branches back to main
   */
  private async mergeAllBranches(context: SwarmExecutionContext): Promise<void> {
    // switch back to main branch
    await this.switchBranch(context.mainBranch);

    for (const result of context.results) {
      if (result.status === 'completed' && result.branchName) {
        try {
          await this.mergeBranch(result.branchName, context);
          console.log(`  ✅ Merged ${result.branchName}`);
        } catch (error: unknown) {
          const err = error as Error;
          console.error(`  ⚠️  Conflict merging ${result.branchName}: ${err.message}`);
          console.error(`     Manual resolution required`);
        }
      }
    }
  }

  /**
   * Switch to a git branch
   */
  private async switchBranch(branchName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['checkout', branchName], {
        cwd: this.workingDir
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to switch to branch ${branchName}`));
        }
      });
    });
  }

  /**
   * Merge a branch with conflict detection
   */
  private async mergeBranch(branchName: string, context: SwarmExecutionContext): Promise<void> {
    // acquire git lock
    const lockId = await context.contextBroker.acquireGitLock('orchestrator', `merge ${branchName}`);
    if (!lockId) {
      throw new Error('Failed to acquire git lock for merge');
    }

    try {
      return await new Promise((resolve, reject) => {
        const proc = spawn('git', ['merge', '--no-ff', branchName, '-m', `Merge ${branchName}`], {
          cwd: this.workingDir
        });

        let stderr = '';
        if (proc.stderr) {
          proc.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Merge conflict: ${stderr}`));
          }
        });
      });
    } finally {
      context.contextBroker.releaseGitLock(lockId);
    }
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(): string {
    const result = require('child_process').execSync('git branch --show-current', {
      cwd: this.workingDir,
      encoding: 'utf8'
    });
    return result.trim();
  }

  private generateExecutionId(): string {
    return `swarm-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  }
}

export default SwarmOrchestrator;
