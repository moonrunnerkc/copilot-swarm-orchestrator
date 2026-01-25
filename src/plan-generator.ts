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

// replan structure returned by meta_reviewer analysis
export interface ReplanPayload {
  retrySteps: number[];
  addSteps?: { agent: string; task: string; afterStep?: number }[];
}

export type GoalType = 'api' | 'web-app' | 'cli-tool' | 'library' | 'infrastructure' | 'data-pipeline' | 'mobile-app' | 'generic';

export class PlanGenerator {
  constructor(private availableAgents: AgentProfile[]) {}

  /**
   * Creates an execution plan from a high-level goal.
   * If userProvidedSteps is given, validates and uses them.
   * Otherwise, generates intelligent default steps based on goal analysis.
   */
  createPlan(goal: string, userProvidedSteps?: PlanStep[]): ExecutionPlan {
    if (!goal || goal.trim() === '') {
      throw new Error('Goal cannot be empty');
    }

    const steps = userProvidedSteps || this.generateIntelligentSteps(goal);

    // validate that all assigned agents exist
    this.validateAgentAssignments(steps);

    // validate dependencies
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

  /**
   * Generate Copilot CLI prompt for plan creation
   * User pastes this into Copilot CLI, gets JSON back, then imports via `plan import`
   */
  generateCopilotPlanningPrompt(goal: string): string {
    const agentList = this.availableAgents
      .map(a => `  - ${a.name}: ${a.purpose}`)
      .join('\n');

    return `You are a software project planning expert. Generate a detailed, realistic execution plan for the following goal.

GOAL: ${goal}

Available agents (assign ONE agent per step):
${agentList}

CRITICAL: Output ONLY valid JSON matching this exact schema, no explanation before or after:

{
  "goal": "${goal.replace(/"/g, '\\"')}",
  "createdAt": "${new Date().toISOString()}",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "AgentName",
      "task": "Specific, actionable task description",
      "dependencies": [],
      "expectedOutputs": ["Output 1", "Output 2"]
    }
  ],
  "metadata": {
    "totalSteps": 4
  }
}

Requirements:
1. Create 4-8 realistic steps (not too few, not too many)
2. Assign appropriate agent to each step based on task domain
3. Use dependencies array to create a valid DAG (no cycles, only reference earlier steps)
4. Each task must be specific and actionable (not vague like "do everything")
5. expectedOutputs should list concrete artifacts (files, test results, PRs, etc.)
6. Consider typical software workflow: design → implement → test → review/integrate
7. If goal involves security, include a SecurityAuditor step
8. If goal involves infrastructure/deployment, include a DevOpsPro step
9. Always include a testing step with TesterElite
10. Final step should be IntegratorFinalizer for verification and integration

OUTPUT ONLY THE JSON, NOTHING ELSE.`;
  }

  /**
   * Create plan from bootstrap analysis
   * Uses annotated steps with source evidence
   */
  createBootstrapPlan(
    goal: string,
    annotatedSteps: import('./bootstrap-types').AnnotatedPlanStep[]
  ): ExecutionPlan {
    // Validate agent assignments
    const regularSteps = annotatedSteps.map(s => ({
      stepNumber: s.stepNumber,
      agentName: s.agentName,
      task: s.task,
      dependencies: s.dependencies,
      expectedOutputs: s.expectedOutputs
    }));

    this.validateAgentAssignments(regularSteps);
    this.validateDependencies(regularSteps);

    return {
      goal: goal.trim(),
      createdAt: new Date().toISOString(),
      steps: annotatedSteps,
      metadata: {
        totalSteps: annotatedSteps.length
      }
    };
  }

  /**
   * Parse Copilot-generated plan from /share transcript
   * Extracts JSON from transcript and validates against schema
   */
  parseCopilotPlanFromTranscript(transcriptContent: string): ExecutionPlan {
    // extract JSON from transcript (might be in code block or plain text)
    const jsonMatch = transcriptContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                     transcriptContent.match(/(\{[\s\S]*"goal"[\s\S]*"steps"[\s\S]*\})/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('No valid JSON plan found in transcript. Ensure Copilot output contains a complete JSON object.');
    }

    let plan: ExecutionPlan;
    try {
      plan = JSON.parse(jsonMatch[1]);
    } catch (error) {
      throw new Error(`Invalid JSON in transcript: ${error instanceof Error ? error.message : 'parse error'}`);
    }

    // validate schema
    this.validatePlanSchema(plan);

    return plan;
  }

  /**
   * Validate plan structure matches expected schema
   */
  private validatePlanSchema(plan: any): asserts plan is ExecutionPlan {
    if (!plan || typeof plan !== 'object') {
      throw new Error('Plan must be an object');
    }

    if (!plan.goal || typeof plan.goal !== 'string') {
      throw new Error('Plan must have a goal string');
    }

    if (!plan.createdAt || typeof plan.createdAt !== 'string') {
      throw new Error('Plan must have a createdAt timestamp');
    }

    if (!Array.isArray(plan.steps)) {
      throw new Error('Plan must have a steps array');
    }

    if (plan.steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }

    if (plan.steps.length > 20) {
      throw new Error('Plan has too many steps (max 20)');
    }

    plan.steps.forEach((step: any, index: number) => {
      if (typeof step.stepNumber !== 'number') {
        throw new Error(`Step ${index}: stepNumber must be a number`);
      }

      if (!step.agentName || typeof step.agentName !== 'string') {
        throw new Error(`Step ${index}: agentName must be a non-empty string`);
      }

      if (!step.task || typeof step.task !== 'string') {
        throw new Error(`Step ${index}: task must be a non-empty string`);
      }

      if (!Array.isArray(step.dependencies)) {
        throw new Error(`Step ${index}: dependencies must be an array`);
      }

      if (!Array.isArray(step.expectedOutputs)) {
        throw new Error(`Step ${index}: expectedOutputs must be an array`);
      }

      if (step.expectedOutputs.length === 0) {
        throw new Error(`Step ${index}: expectedOutputs cannot be empty`);
      }
    });

    if (!plan.metadata || typeof plan.metadata !== 'object') {
      plan.metadata = { totalSteps: plan.steps.length };
    }
  }

  /**
   * Generate intelligent default steps based on goal analysis
   * This is the enhanced fallback for instant usability without Copilot CLI
   */
  private generateIntelligentSteps(goal: string): PlanStep[] {
    const goalType = this.detectGoalType(goal);
    const steps: PlanStep[] = [];
    let stepNumber = 1;

    // determine project phases based on goal type
    switch (goalType) {
      case 'api':
        steps.push(...this.generateApiSteps(goal, stepNumber));
        break;

      case 'web-app':
        steps.push(...this.generateWebAppSteps(goal, stepNumber));
        break;

      case 'cli-tool':
        steps.push(...this.generateCliToolSteps(goal, stepNumber));
        break;

      case 'library':
        steps.push(...this.generateLibrarySteps(goal, stepNumber));
        break;

      case 'infrastructure':
        steps.push(...this.generateInfrastructureSteps(goal, stepNumber));
        break;

      case 'data-pipeline':
        steps.push(...this.generateDataPipelineSteps(goal, stepNumber));
        break;

      case 'mobile-app':
        steps.push(...this.generateMobileAppSteps(goal, stepNumber));
        break;

      default:
        steps.push(...this.generateGenericSteps(goal, stepNumber));
    }

    return steps;
  }

  private detectGoalType(goal: string): GoalType {
    const goalLower = goal.toLowerCase();

    if (goalLower.match(/\b(rest|api|endpoint|graphql|microservice|backend|server)\b/)) {
      return 'api';
    }

    if (goalLower.match(/\b(web app|website|frontend|react|vue|angular|next\.js|dashboard)\b/)) {
      return 'web-app';
    }

    if (goalLower.match(/\b(cli|command.line|terminal|console tool|script)\b/)) {
      return 'cli-tool';
    }

    if (goalLower.match(/\b(library|package|module|sdk|npm package|component library)\b/)) {
      return 'library';
    }

    if (goalLower.match(/\b(deploy|infrastructure|ci\/cd|docker|kubernetes|terraform|cloud)\b/)) {
      return 'infrastructure';
    }

    if (goalLower.match(/\b(etl|pipeline|data processing|analytics|streaming)\b/)) {
      return 'data-pipeline';
    }

    if (goalLower.match(/\b(mobile|ios|android|react native|flutter)\b/)) {
      return 'mobile-app';
    }

    return 'generic';
  }

  private generateApiSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'BackendMaster',
        task: `Design and implement API structure for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['API endpoint definitions', 'Request/response schemas', 'Database models']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'SecurityAuditor',
        task: 'Review API authentication, authorization, and input validation',
        dependencies: [startNumber],
        expectedOutputs: ['Security audit report', 'Auth implementation', 'Input validation']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'TesterElite',
        task: 'Create comprehensive API test suite',
        dependencies: [startNumber + 1],
        expectedOutputs: ['Integration tests', 'Unit tests', 'Test coverage report']
      },
      {
        stepNumber: startNumber + 3,
        agentName: 'IntegratorFinalizer',
        task: 'Verify API integration, documentation, and deployment readiness',
        dependencies: [startNumber + 2],
        expectedOutputs: ['API documentation', 'Integration verification', 'Deployment checklist']
      }
    ];
  }

  private generateWebAppSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'FrontendExpert',
        task: `Build UI components and pages for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['React/Vue components', 'Page layouts', 'Styling']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'BackendMaster',
        task: 'Implement backend API and data layer',
        dependencies: [],
        expectedOutputs: ['API endpoints', 'Database schema', 'Business logic']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'TesterElite',
        task: 'Create frontend and integration tests',
        dependencies: [startNumber, startNumber + 1],
        expectedOutputs: ['Component tests', 'E2E tests', 'Test coverage']
      },
      {
        stepNumber: startNumber + 3,
        agentName: 'DevOpsPro',
        task: 'Setup CI/CD pipeline and deployment',
        dependencies: [startNumber + 2],
        expectedOutputs: ['CI workflow', 'Build pipeline', 'Deployment config']
      },
      {
        stepNumber: startNumber + 4,
        agentName: 'IntegratorFinalizer',
        task: 'Final integration verification and documentation',
        dependencies: [startNumber + 3],
        expectedOutputs: ['User documentation', 'Integration tests', 'Release notes']
      }
    ];
  }

  private generateCliToolSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'BackendMaster',
        task: `Implement CLI core functionality for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['CLI commands', 'Argument parsing', 'Core logic']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'TesterElite',
        task: 'Create CLI tests and validation',
        dependencies: [startNumber],
        expectedOutputs: ['Unit tests', 'CLI integration tests', 'Test coverage']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'IntegratorFinalizer',
        task: 'Add documentation, examples, and publish preparation',
        dependencies: [startNumber + 1],
        expectedOutputs: ['README with examples', 'Help text', 'Package metadata']
      }
    ];
  }

  private generateLibrarySteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'BackendMaster',
        task: `Implement library core API for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Public API', 'Type definitions', 'Core implementation']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'TesterElite',
        task: 'Create comprehensive test suite',
        dependencies: [startNumber],
        expectedOutputs: ['Unit tests', 'Integration tests', 'Coverage report']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'IntegratorFinalizer',
        task: 'Add documentation, examples, and package config',
        dependencies: [startNumber + 1],
        expectedOutputs: ['API documentation', 'Usage examples', 'Package.json config']
      }
    ];
  }

  private generateInfrastructureSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'DevOpsPro',
        task: `Design and implement infrastructure for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Infrastructure as code', 'Configuration files', 'Deployment scripts']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'SecurityAuditor',
        task: 'Review security configuration and access controls',
        dependencies: [startNumber],
        expectedOutputs: ['Security audit', 'Access policies', 'Secrets management']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'TesterElite',
        task: 'Create infrastructure tests and validation',
        dependencies: [startNumber + 1],
        expectedOutputs: ['Infrastructure tests', 'Validation scripts', 'Test results']
      },
      {
        stepNumber: startNumber + 3,
        agentName: 'IntegratorFinalizer',
        task: 'Verify deployment and create runbooks',
        dependencies: [startNumber + 2],
        expectedOutputs: ['Deployment verification', 'Runbooks', 'Documentation']
      }
    ];
  }

  private generateDataPipelineSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'BackendMaster',
        task: `Implement data pipeline for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Pipeline code', 'Data transformations', 'Storage layer']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'TesterElite',
        task: 'Create data validation and pipeline tests',
        dependencies: [startNumber],
        expectedOutputs: ['Data quality tests', 'Pipeline tests', 'Test coverage']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'DevOpsPro',
        task: 'Setup pipeline orchestration and monitoring',
        dependencies: [startNumber + 1],
        expectedOutputs: ['Orchestration config', 'Monitoring setup', 'Alerting']
      },
      {
        stepNumber: startNumber + 3,
        agentName: 'IntegratorFinalizer',
        task: 'Verify end-to-end pipeline and documentation',
        dependencies: [startNumber + 2],
        expectedOutputs: ['Pipeline verification', 'Documentation', 'Runbooks']
      }
    ];
  }

  private generateMobileAppSteps(goal: string, startNumber: number): PlanStep[] {
    return [
      {
        stepNumber: startNumber,
        agentName: 'FrontendExpert',
        task: `Build mobile UI and screens for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Mobile screens', 'Navigation', 'UI components']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'BackendMaster',
        task: 'Implement mobile backend and API integration',
        dependencies: [],
        expectedOutputs: ['API client', 'State management', 'Backend integration']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'TesterElite',
        task: 'Create mobile app tests',
        dependencies: [startNumber, startNumber + 1],
        expectedOutputs: ['Component tests', 'Integration tests', 'Test coverage']
      },
      {
        stepNumber: startNumber + 3,
        agentName: 'IntegratorFinalizer',
        task: 'App store preparation and documentation',
        dependencies: [startNumber + 2],
        expectedOutputs: ['App metadata', 'Screenshots', 'Documentation']
      }
    ];
  }

  private generateGenericSteps(goal: string, startNumber: number): PlanStep[] {
    // for generic goals, create a simple 3-step plan
    const primaryAgent = this.assignAgent(goal);

    return [
      {
        stepNumber: startNumber,
        agentName: primaryAgent,
        task: `Implement core functionality for: ${goal}`,
        dependencies: [],
        expectedOutputs: ['Implementation', 'Core files', 'Basic functionality']
      },
      {
        stepNumber: startNumber + 1,
        agentName: 'TesterElite',
        task: 'Create tests and verify functionality',
        dependencies: [startNumber],
        expectedOutputs: ['Tests', 'Test results', 'Coverage report']
      },
      {
        stepNumber: startNumber + 2,
        agentName: 'IntegratorFinalizer',
        task: 'Integration verification and documentation',
        dependencies: [startNumber + 1],
        expectedOutputs: ['Documentation', 'Integration verification', 'Final review']
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

  /**
   * Enhanced agent assignment with comprehensive keyword matching
   */
  assignAgent(task: string): string {
    const taskLower = task.toLowerCase();

    // SecurityAuditor keywords (30+ patterns) - check FIRST for security-specific terms
    if (taskLower.match(/\b(security|vulnerability|audit|penetration|owasp|xss|csrf|sql.injection|oauth|saml|encryption|hashing|ssl|tls|certificate|secrets|key.management|rbac|permission|access.control|compliance|gdpr|hipaa|pci|sanitize|validate.input|escape|csp|cors|rate.limit|ddos|firewall)\b/)) {
      return 'SecurityAuditor';
    }

    // FrontendExpert keywords (30+ patterns)
    if (taskLower.match(/\b(ui|ux|frontend|react|vue|angular|svelte|next\.js|nuxt|component|page|layout|css|scss|tailwind|styled|material.ui|chakra|responsive|mobile.first|accessibility|a11y|seo|animation|transitions|dom|browser|webpack|vite|parcel)\b/)) {
      return 'FrontendExpert';
    }

    // BackendMaster keywords (30+ patterns)
    if (taskLower.match(/\b(backend|server|api|rest|graphql|endpoint|route|controller|service|database|schema|sql|nosql|postgres|postgresql|mongodb|mysql|redis|orm|prisma|sequelize|typeorm|authentication|authorization|jwt|session|middleware|express|fastify|koa|nest\.js|microservice|websocket|grpc|message.queue|kafka|rabbitmq|lambda|serverless)\b/)) {
      return 'BackendMaster';
    }

    // DevOpsPro keywords (30+ patterns)
    if (taskLower.match(/\b(devops|deploy|deployment|ci\/cd|pipeline|github.actions|jenkins|circleci|travis|docker|container|kubernetes|k8s|helm|terraform|ansible|cloud|aws|azure|gcp|nginx|apache|load.balancer|cdn|monitoring|prometheus|grafana|logging|elk|observability|infrastructure|iac|provision|scaling|orchestration)\b/)) {
      return 'DevOpsPro';
    }

    // TesterElite keywords (30+ patterns)
    if (taskLower.match(/\b(tests?|testing|qa|quality|jest|mocha|chai|vitest|cypress|playwright|selenium|unit.test|integration.test|e2e|end.to.end|coverage|tdd|bdd|assertion|mock|stub|spy|fixture|snapshot|regression|performance.test|load.test|stress.test|benchmark|validation|verification)\b/)) {
      return 'TesterElite';
    }

    // Generic app/system/implementation tasks should go to BackendMaster
    if (taskLower.match(/\b(implement|create|build|develop|system|app|application|service|functionality|core|main)\b/)) {
      return 'BackendMaster';
    }

    // IntegratorFinalizer as last resort fallback
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

  /**
   * revise plan based on replan payload from meta_reviewer
   * preserves completed steps, marks retries with suffix, appends new steps
   */
  revisePlan(
    plan: ExecutionPlan,
    replanPayload: ReplanPayload,
    completedSteps: number[]
  ): ExecutionPlan {
    const revisedSteps: PlanStep[] = [];

    // copy all existing steps (completed ones stay as-is)
    for (const step of plan.steps) {
      revisedSteps.push({ ...step });
    }

    // track highest step number
    let maxStepNumber = Math.max(...plan.steps.map(s => s.stepNumber));

    // mark retry steps with updated task description
    // actual retry branches use suffix like step-3-retry1
    for (const retryStepNum of replanPayload.retrySteps) {
      const existing = revisedSteps.find(s => s.stepNumber === retryStepNum);
      if (existing && !completedSteps.includes(retryStepNum)) {
        // prepend retry indicator to task
        if (!existing.task.startsWith('[RETRY]')) {
          existing.task = `[RETRY] ${existing.task}`;
        }
      }
    }

    // append new steps if any
    if (replanPayload.addSteps && replanPayload.addSteps.length > 0) {
      for (const addReq of replanPayload.addSteps) {
        // validate agent exists
        const agentNames = new Set(this.availableAgents.map(a => a.name));
        if (!agentNames.has(addReq.agent)) {
          console.warn(`replan: unknown agent "${addReq.agent}", skipping`);
          continue;
        }

        maxStepNumber++;
        const newStep: PlanStep = {
          stepNumber: maxStepNumber,
          agentName: addReq.agent,
          task: addReq.task,
          // depend on afterStep if provided, else last existing step
          dependencies: addReq.afterStep
            ? [addReq.afterStep]
            : plan.steps.length > 0 ? [plan.steps[plan.steps.length - 1].stepNumber] : [],
          expectedOutputs: ['Replan-generated output']
        };
        revisedSteps.push(newStep);
      }
    }

    const metadata: { totalSteps: number; estimatedDuration?: string } = {
      totalSteps: revisedSteps.length
    };
    if (plan.metadata?.estimatedDuration) {
      metadata.estimatedDuration = plan.metadata.estimatedDuration;
    }

    return {
      ...plan,
      createdAt: new Date().toISOString(),
      steps: revisedSteps,
      metadata
    };
  }
}

export default PlanGenerator;
