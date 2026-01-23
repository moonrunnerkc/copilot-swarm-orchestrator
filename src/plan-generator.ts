import { AgentProfile } from './config-loader';

export interface PlanStep {
  stepNumber: number;
  agentName: string;
  task: string;
  dependencies: number[];
  expectedOutputs: string[];
}

export interface ExecutionPlan {
  goal: string;
  createdAt: string;
  steps: PlanStep[];
  metadata?: {
    totalSteps: number;
    estimatedDuration?: string;
  };
}

export class PlanGenerator {
  constructor(private availableAgents: AgentProfile[]) {}

  /**
   * Creates an execution plan from a high-level goal.
   * In a real implementation, this would use Copilot CLI to generate the plan.
   * For now, this is a structured interface for plan storage.
   */
  createPlan(goal: string, userProvidedSteps?: PlanStep[]): ExecutionPlan {
    if (!goal || goal.trim() === '') {
      throw new Error('Goal cannot be empty');
    }

    const steps = userProvidedSteps || this.generateDefaultSteps(goal);

    // Validate that all assigned agents exist
    this.validateAgentAssignments(steps);

    // Validate dependencies
    this.validateDependencies(steps);

    return {
      goal: goal.trim(),
      createdAt: new Date().toISOString(),
      steps,
      metadata: {
        totalSteps: steps.length,
      }
    };
  }

  private generateDefaultSteps(goal: string): PlanStep[] {
    // This is a placeholder. In the real system, Copilot CLI would generate this.
    // For now, return a single-step plan that needs to be filled in.
    return [
      {
        stepNumber: 1,
        agentName: 'IntegratorFinalizer',
        task: `Complete: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Task completion confirmation']
      }
    ];
  }

  private validateAgentAssignments(steps: PlanStep[]): void {
    const agentNames = new Set(this.availableAgents.map(a => a.name));

    for (const step of steps) {
      if (!agentNames.has(step.agentName)) {
        throw new Error(
          `Step ${step.stepNumber} assigns unknown agent: ${step.agentName}. ` +
          `Available agents: ${Array.from(agentNames).join(', ')}`
        );
      }
    }
  }

  private validateDependencies(steps: PlanStep[]): void {
    const stepNumbers = new Set(steps.map(s => s.stepNumber));

    for (const step of steps) {
      for (const dep of step.dependencies) {
        if (!stepNumbers.has(dep)) {
          throw new Error(
            `Step ${step.stepNumber} has invalid dependency: step ${dep} does not exist`
          );
        }
        if (dep >= step.stepNumber) {
          throw new Error(
            `Step ${step.stepNumber} has invalid dependency: step ${dep} must come before this step`
          );
        }
      }
    }
  }

  assignAgent(task: string): string {
    // Simple keyword-based agent assignment
    // In reality, Copilot CLI would make this decision
    const taskLower = task.toLowerCase();

    // Check more specific patterns first
    if (taskLower.includes('api') || taskLower.includes('backend') || taskLower.includes('server')) {
      return 'BackendMaster';
    }
    if (taskLower.includes('ui') || taskLower.includes('frontend') || taskLower.includes('component')) {
      return 'FrontendExpert';
    }
    if (taskLower.includes('deploy') || taskLower.includes('ci') || taskLower.includes('docker')) {
      return 'DevOpsPro';
    }
    if (taskLower.includes('security') || taskLower.includes('vulnerability')) {
      return 'SecurityAuditor';
    }
    if (taskLower.includes('test') || taskLower.includes('quality')) {
      return 'TesterElite';
    }

    return 'IntegratorFinalizer';
  }

  getExecutionOrder(plan: ExecutionPlan): number[] {
    // Simple topological sort for step execution order
    const steps = plan.steps;
    const executed = new Set<number>();
    const order: number[] = [];

    while (order.length < steps.length) {
      let foundStep = false;

      for (const step of steps) {
        if (executed.has(step.stepNumber)) {
          continue;
        }

        const depsReady = step.dependencies.every(dep => executed.has(dep));
        if (depsReady) {
          order.push(step.stepNumber);
          executed.add(step.stepNumber);
          foundStep = true;
        }
      }

      if (!foundStep && order.length < steps.length) {
        throw new Error('Circular dependency detected in plan');
      }
    }

    return order;
  }
}

export default PlanGenerator;
