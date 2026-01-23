import * as assert from 'assert';
import { ConfigLoader } from '../src/config-loader';
import { PlanGenerator, ExecutionPlan } from '../src/plan-generator';

describe('Copilot-Driven Planning', () => {
  let generator: PlanGenerator;

  beforeEach(() => {
    const configLoader = new ConfigLoader();
    const agents = configLoader.loadAllAgents();
    generator = new PlanGenerator(agents);
  });

  describe('generateCopilotPlanningPrompt', () => {
    it('should generate valid prompt for simple goal', () => {
      const prompt = generator.generateCopilotPlanningPrompt('Build a REST API');

      assert.ok(prompt.includes('Build a REST API'));
      assert.ok(prompt.includes('OUTPUT ONLY THE JSON'));
      assert.ok(prompt.includes('stepNumber'));
      assert.ok(prompt.includes('agentName'));
      assert.ok(prompt.includes('task'));
      assert.ok(prompt.includes('dependencies'));
      assert.ok(prompt.includes('expectedOutputs'));
    });

    it('should include all available agents in prompt', () => {
      const prompt = generator.generateCopilotPlanningPrompt('Build something');

      assert.ok(prompt.includes('BackendMaster'));
      assert.ok(prompt.includes('FrontendExpert'));
      assert.ok(prompt.includes('DevOpsPro'));
      assert.ok(prompt.includes('SecurityAuditor'));
      assert.ok(prompt.includes('TesterElite'));
      assert.ok(prompt.includes('IntegratorFinalizer'));
    });

    it('should escape quotes in goal', () => {
      const prompt = generator.generateCopilotPlanningPrompt('Build "awesome" API');

      // should escape quotes in JSON
      assert.ok(prompt.includes('\\"awesome\\"'));
    });

    it('should include instructions for 4-8 steps', () => {
      const prompt = generator.generateCopilotPlanningPrompt('Build API');

      assert.ok(prompt.includes('4-8 realistic steps'));
    });

    it('should include DAG requirement', () => {
      const prompt = generator.generateCopilotPlanningPrompt('Build API');

      assert.ok(prompt.includes('valid DAG'));
      assert.ok(prompt.includes('no cycles'));
    });
  });

  describe('parseCopilotPlanFromTranscript', () => {
    it('should parse valid JSON from transcript', () => {
      const transcript = `
Here's the plan:

\`\`\`json
{
  "goal": "Build REST API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Design API",
      "dependencies": [],
      "expectedOutputs": ["API schema"]
    }
  ],
  "metadata": {
    "totalSteps": 1
  }
}
\`\`\`

That's the plan!
`;

      const plan = generator.parseCopilotPlanFromTranscript(transcript);

      assert.strictEqual(plan.goal, 'Build REST API');
      assert.strictEqual(plan.steps.length, 1);
      assert.strictEqual(plan.steps[0]?.stepNumber, 1);
      assert.strictEqual(plan.steps[0]?.agentName, 'BackendMaster');
    });

    it('should parse JSON without code block markers', () => {
      const transcript = `
{
  "goal": "Build REST API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Design API",
      "dependencies": [],
      "expectedOutputs": ["API schema"]
    }
  ],
  "metadata": {
    "totalSteps": 1
  }
}
`;

      const plan = generator.parseCopilotPlanFromTranscript(transcript);

      assert.strictEqual(plan.goal, 'Build REST API');
    });

    it('should reject transcript without JSON', () => {
      const transcript = `
I can help you build a REST API. Here's what we should do:
1. Design the API
2. Implement it
3. Test it
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /No valid JSON plan found/);
    });

    it('should reject invalid JSON', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API"
  "steps": []  // missing comma
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /Invalid JSON/);
    });

    it('should validate plan schema', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": []
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /at least one step/);
    });

    it('should reject plan with missing goal', () => {
      const transcript = `
\`\`\`json
{
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Task",
      "dependencies": [],
      "expectedOutputs": ["Output"]
    }
  ]
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /must have a goal/);
    });

    it('should reject plan with too many steps', () => {
      const steps = Array.from({ length: 25 }, (_, i) => ({
        stepNumber: i + 1,
        agentName: 'BackendMaster',
        task: `Task ${i + 1}`,
        dependencies: [],
        expectedOutputs: ['Output']
      }));

      const transcript = `
\`\`\`json
{
  "goal": "Big project",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": ${JSON.stringify(steps)},
  "metadata": { "totalSteps": 25 }
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /too many steps/);
    });

    it('should reject step with invalid stepNumber type', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": "1",
      "agentName": "BackendMaster",
      "task": "Task",
      "dependencies": [],
      "expectedOutputs": ["Output"]
    }
  ]
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /stepNumber must be a number/);
    });

    it('should reject step without agentName', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "task": "Task",
      "dependencies": [],
      "expectedOutputs": ["Output"]
    }
  ]
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /agentName must be a non-empty string/);
    });

    it('should reject step without expectedOutputs', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Task",
      "dependencies": []
    }
  ]
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /expectedOutputs must be an array/);
    });

    it('should reject step with empty expectedOutputs', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Task",
      "dependencies": [],
      "expectedOutputs": []
    }
  ]
}
\`\`\`
`;

      assert.throws(() => {
        generator.parseCopilotPlanFromTranscript(transcript);
      }, /expectedOutputs cannot be empty/);
    });

    it('should add default metadata if missing', () => {
      const transcript = `
\`\`\`json
{
  "goal": "Build API",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Task",
      "dependencies": [],
      "expectedOutputs": ["Output"]
    }
  ]
}
\`\`\`
`;

      const plan = generator.parseCopilotPlanFromTranscript(transcript);

      assert.ok(plan.metadata);
      assert.strictEqual(plan.metadata?.totalSteps, 1);
    });
  });

  describe('goal type detection', () => {
    it('should detect API projects', () => {
      const plan = generator.createPlan('Build a REST API for users');
      assert.ok(plan.steps.some(s => s.agentName === 'BackendMaster'));
    });

    it('should detect web app projects', () => {
      const plan = generator.createPlan('Build a React dashboard');
      assert.ok(plan.steps.some(s => s.agentName === 'FrontendExpert'));
    });

    it('should detect CLI tool projects', () => {
      const plan = generator.createPlan('Build a command line tool');
      assert.ok(plan.steps.some(s => s.agentName === 'BackendMaster'));
      assert.strictEqual(plan.steps.length, 3); // CLI tools get 3 steps
    });

    it('should detect library projects', () => {
      const plan = generator.createPlan('Build an npm package utility library');
      assert.ok(plan.steps.some(s => s.agentName === 'BackendMaster'));
      assert.strictEqual(plan.steps.length, 3); // libraries get 3 steps
    });

    it('should detect infrastructure projects', () => {
      const plan = generator.createPlan('Setup Kubernetes deployment');
      assert.ok(plan.steps.some(s => s.agentName === 'DevOpsPro'));
      assert.ok(plan.steps.some(s => s.agentName === 'SecurityAuditor'));
    });

    it('should detect data pipeline projects', () => {
      const plan = generator.createPlan('Build ETL pipeline for analytics');
      assert.ok(plan.steps.some(s => s.agentName === 'BackendMaster'));
      assert.strictEqual(plan.steps.length, 4);
    });

    it('should detect mobile app projects', () => {
      const plan = generator.createPlan('Build React Native mobile app');
      assert.ok(plan.steps.some(s => s.agentName === 'FrontendExpert'));
    });
  });

  describe('intelligent plan generation', () => {
    it('should create realistic API plan', () => {
      const plan = generator.createPlan('Build REST API for user management');

      assert.strictEqual(plan.steps.length, 4);
      assert.strictEqual(plan.steps[0]?.agentName, 'BackendMaster');
      assert.strictEqual(plan.steps[1]?.agentName, 'SecurityAuditor');
      assert.strictEqual(plan.steps[2]?.agentName, 'TesterElite');
      assert.strictEqual(plan.steps[3]?.agentName, 'IntegratorFinalizer');

      // verify dependencies
      assert.deepStrictEqual(plan.steps[0]?.dependencies, []);
      assert.deepStrictEqual(plan.steps[1]?.dependencies, [1]);
      assert.deepStrictEqual(plan.steps[2]?.dependencies, [2]);
      assert.deepStrictEqual(plan.steps[3]?.dependencies, [3]);
    });

    it('should create realistic web app plan', () => {
      const plan = generator.createPlan('Build a Next.js web application');

      assert.strictEqual(plan.steps.length, 5);
      assert.ok(plan.steps.some(s => s.agentName === 'FrontendExpert'));
      assert.ok(plan.steps.some(s => s.agentName === 'BackendMaster'));
      assert.ok(plan.steps.some(s => s.agentName === 'DevOpsPro'));
    });

    it('should include testing in all plans', () => {
      const apiPlan = generator.createPlan('Build API');
      const webPlan = generator.createPlan('Build web app');
      const cliPlan = generator.createPlan('Build CLI tool');

      assert.ok(apiPlan.steps.some(s => s.agentName === 'TesterElite'));
      assert.ok(webPlan.steps.some(s => s.agentName === 'TesterElite'));
      assert.ok(cliPlan.steps.some(s => s.agentName === 'TesterElite'));
    });

    it('should include security audit for API projects', () => {
      const plan = generator.createPlan('Build GraphQL API');

      assert.ok(plan.steps.some(s => s.agentName === 'SecurityAuditor'));
    });

    it('should include DevOps for deployment projects', () => {
      const plan = generator.createPlan('Deploy Docker containers to AWS');

      assert.ok(plan.steps.some(s => s.agentName === 'DevOpsPro'));
    });

    it('should create valid DAG for all plans', () => {
      const goals = [
        'Build REST API',
        'Build web app',
        'Build CLI tool',
        'Setup CI/CD pipeline',
        'Build data pipeline'
      ];

      for (const goal of goals) {
        const plan = generator.createPlan(goal);
        
        // should not throw
        const order = generator.getExecutionOrder(plan);
        
        // execution order should include all steps
        assert.strictEqual(order.length, plan.steps.length);
      }
    });

    it('should include meaningful expected outputs', () => {
      const plan = generator.createPlan('Build REST API');

      for (const step of plan.steps) {
        assert.ok(step.expectedOutputs.length > 0);
        assert.ok(step.expectedOutputs.every(o => o.length > 0));
      }
    });
  });

  describe('enhanced agent assignment', () => {
    it('should assign FrontendExpert for React', () => {
      assert.strictEqual(generator.assignAgent('Build React component'), 'FrontendExpert');
    });

    it('should assign FrontendExpert for Vue', () => {
      assert.strictEqual(generator.assignAgent('Create Vue page'), 'FrontendExpert');
    });

    it('should assign FrontendExpert for CSS', () => {
      assert.strictEqual(generator.assignAgent('Style with Tailwind CSS'), 'FrontendExpert');
    });

    it('should assign BackendMaster for GraphQL', () => {
      assert.strictEqual(generator.assignAgent('Build GraphQL API'), 'BackendMaster');
    });

    it('should assign BackendMaster for database', () => {
      assert.strictEqual(generator.assignAgent('Design PostgreSQL schema'), 'BackendMaster');
    });

    it('should assign BackendMaster for microservices', () => {
      assert.strictEqual(generator.assignAgent('Create microservice'), 'BackendMaster');
    });

    it('should assign DevOpsPro for Kubernetes', () => {
      assert.strictEqual(generator.assignAgent('Deploy to Kubernetes'), 'DevOpsPro');
    });

    it('should assign DevOpsPro for Docker', () => {
      assert.strictEqual(generator.assignAgent('Containerize with Docker'), 'DevOpsPro');
    });

    it('should assign DevOpsPro for Terraform', () => {
      assert.strictEqual(generator.assignAgent('Provision infrastructure with Terraform'), 'DevOpsPro');
    });

    it('should assign SecurityAuditor for OWASP', () => {
      assert.strictEqual(generator.assignAgent('Fix OWASP vulnerabilities'), 'SecurityAuditor');
    });

    it('should assign SecurityAuditor for encryption', () => {
      assert.strictEqual(generator.assignAgent('Implement encryption'), 'SecurityAuditor');
    });

    it('should assign SecurityAuditor for OAuth', () => {
      assert.strictEqual(generator.assignAgent('Setup OAuth authentication'), 'SecurityAuditor');
    });

    it('should assign TesterElite for Jest', () => {
      assert.strictEqual(generator.assignAgent('Write Jest tests'), 'TesterElite');
    });

    it('should assign TesterElite for Cypress', () => {
      assert.strictEqual(generator.assignAgent('Add Cypress e2e tests'), 'TesterElite');
    });

    it('should assign TesterElite for coverage', () => {
      assert.strictEqual(generator.assignAgent('Improve test coverage'), 'TesterElite');
    });

    it('should assign IntegratorFinalizer for generic tasks', () => {
      assert.strictEqual(generator.assignAgent('Complete the project'), 'IntegratorFinalizer');
    });
  });
});
