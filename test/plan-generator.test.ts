import * as assert from 'assert';
import { ConfigLoader } from '../src/config-loader';
import { PlanGenerator, PlanStep, ExecutionPlan } from '../src/plan-generator';

describe('PlanGenerator', () => {
  let generator: PlanGenerator;

  beforeEach(() => {
    const configLoader = new ConfigLoader();
    const agents = configLoader.loadAllAgents();
    generator = new PlanGenerator(agents);
  });

  describe('createPlan', () => {
    it('should create a plan with a goal', () => {
      const plan = generator.createPlan('Build a REST API');

      assert.ok(plan);
      assert.strictEqual(plan.goal, 'Build a REST API');
      assert.ok(plan.createdAt);
      assert.ok(Array.isArray(plan.steps));
      assert.ok(plan.metadata);
    });

    it('should reject empty goal', () => {
      assert.throws(() => {
        generator.createPlan('');
      }, /Goal cannot be empty/);
    });

    it('should trim whitespace from goal', () => {
      const plan = generator.createPlan('  Build API  ');
      assert.strictEqual(plan.goal, 'Build API');
    });

    it('should create plan with custom steps', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Create API',
          dependencies: [],
          expectedOutputs: ['API code']
        },
        {
          stepNumber: 2,
          agentName: 'TesterElite',
          task: 'Test API',
          dependencies: [1],
          expectedOutputs: ['Test results']
        }
      ];

      const plan = generator.createPlan('Build API', steps);

      assert.strictEqual(plan.steps.length, 2);
      assert.ok(plan.steps[0]);
      assert.ok(plan.steps[1]);
      assert.strictEqual(plan.steps[0].agentName, 'BackendMaster');
      assert.strictEqual(plan.steps[1].agentName, 'TesterElite');
    });

    it('should set totalSteps in metadata', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Task 1',
          dependencies: [],
          expectedOutputs: ['Output']
        }
      ];

      const plan = generator.createPlan('Goal', steps);
      assert.strictEqual(plan.metadata?.totalSteps, 1);
    });
  });

  describe('validation', () => {
    it('should reject unknown agent assignment', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'UnknownAgent',
          task: 'Do something',
          dependencies: [],
          expectedOutputs: ['Output']
        }
      ];

      assert.throws(() => {
        generator.createPlan('Goal', steps);
      }, /unknown agent: UnknownAgent/);
    });

    it('should reject invalid dependency reference', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Task 1',
          dependencies: [99],
          expectedOutputs: ['Output']
        }
      ];

      assert.throws(() => {
        generator.createPlan('Goal', steps);
      }, /invalid dependency: step 99 does not exist/);
    });

    it('should reject forward dependency', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Task 1',
          dependencies: [2],
          expectedOutputs: ['Output']
        },
        {
          stepNumber: 2,
          agentName: 'TesterElite',
          task: 'Task 2',
          dependencies: [],
          expectedOutputs: ['Output']
        }
      ];

      assert.throws(() => {
        generator.createPlan('Goal', steps);
      }, /step 2 must come before this step/);
    });
  });

  describe('assignAgent', () => {
    it('should assign FrontendExpert for UI tasks', () => {
      assert.strictEqual(generator.assignAgent('Build UI component'), 'FrontendExpert');
      assert.strictEqual(generator.assignAgent('Create frontend'), 'FrontendExpert');
    });

    it('should assign BackendMaster for API tasks', () => {
      assert.strictEqual(generator.assignAgent('Build API endpoint'), 'BackendMaster');
      assert.strictEqual(generator.assignAgent('Create backend service'), 'BackendMaster');
    });

    it('should assign DevOpsPro for deployment tasks', () => {
      assert.strictEqual(generator.assignAgent('Setup CI pipeline'), 'DevOpsPro');
      assert.strictEqual(generator.assignAgent('Configure Docker'), 'DevOpsPro');
    });

    it('should assign SecurityAuditor for security tasks', () => {
      assert.strictEqual(generator.assignAgent('Fix security vulnerability'), 'SecurityAuditor');
      assert.strictEqual(generator.assignAgent('Audit security'), 'SecurityAuditor');
    });

    it('should assign TesterElite for testing tasks', () => {
      assert.strictEqual(generator.assignAgent('Write tests'), 'TesterElite');
      assert.strictEqual(generator.assignAgent('Improve quality'), 'TesterElite');
    });

    it('should assign IntegratorFinalizer as fallback', () => {
      assert.strictEqual(generator.assignAgent('Random task'), 'IntegratorFinalizer');
    });
  });

  describe('getExecutionOrder', () => {
    it('should return correct order for linear dependencies', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Step 1',
          dependencies: [],
          expectedOutputs: []
        },
        {
          stepNumber: 2,
          agentName: 'TesterElite',
          task: 'Step 2',
          dependencies: [1],
          expectedOutputs: []
        },
        {
          stepNumber: 3,
          agentName: 'IntegratorFinalizer',
          task: 'Step 3',
          dependencies: [2],
          expectedOutputs: []
        }
      ];

      const plan = generator.createPlan('Goal', steps);
      const order = generator.getExecutionOrder(plan);

      assert.deepStrictEqual(order, [1, 2, 3]);
    });

    it('should handle parallel steps (no dependencies)', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Step 1',
          dependencies: [],
          expectedOutputs: []
        },
        {
          stepNumber: 2,
          agentName: 'FrontendExpert',
          task: 'Step 2',
          dependencies: [],
          expectedOutputs: []
        }
      ];

      const plan = generator.createPlan('Goal', steps);
      const order = generator.getExecutionOrder(plan);

      // Both can run, order doesn't matter but both should be present
      assert.strictEqual(order.length, 2);
      assert.ok(order.includes(1));
      assert.ok(order.includes(2));
    });

    it('should handle complex dependency graph', () => {
      const steps: PlanStep[] = [
        {
          stepNumber: 1,
          agentName: 'BackendMaster',
          task: 'Step 1',
          dependencies: [],
          expectedOutputs: []
        },
        {
          stepNumber: 2,
          agentName: 'FrontendExpert',
          task: 'Step 2',
          dependencies: [],
          expectedOutputs: []
        },
        {
          stepNumber: 3,
          agentName: 'TesterElite',
          task: 'Step 3',
          dependencies: [1, 2],
          expectedOutputs: []
        }
      ];

      const plan = generator.createPlan('Goal', steps);
      const order = generator.getExecutionOrder(plan);

      // Step 3 must come after both 1 and 2
      const indexOf3 = order.indexOf(3);
      const indexOf1 = order.indexOf(1);
      const indexOf2 = order.indexOf(2);

      assert.ok(indexOf3 > indexOf1);
      assert.ok(indexOf3 > indexOf2);
    });

    it('should detect circular dependencies', () => {
      // Create plan with circular dependency by bypassing validation
      const plan: ExecutionPlan = {
        goal: 'Test',
        createdAt: new Date().toISOString(),
        steps: [
          {
            stepNumber: 1,
            agentName: 'BackendMaster',
            task: 'Step 1',
            dependencies: [2],
            expectedOutputs: []
          },
          {
            stepNumber: 2,
            agentName: 'FrontendExpert',
            task: 'Step 2',
            dependencies: [1],
            expectedOutputs: []
          }
        ],
        metadata: { totalSteps: 2 }
      };

      assert.throws(() => {
        generator.getExecutionOrder(plan);
      }, /Circular dependency detected/);
    });
  });
});
