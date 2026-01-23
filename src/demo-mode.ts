import * as fs from 'fs';
import * as path from 'path';
import { ExecutionPlan, PlanStep } from './plan-generator';

export interface DemoScenario {
  name: string;
  description: string;
  goal: string;
  steps: PlanStep[];
  expectedDuration: string;
}

/**
 * Pre-configured demo scenarios for showcasing swarm orchestrator
 */
export class DemoMode {
  private scenariosDir: string;

  constructor(scenariosDir?: string) {
    this.scenariosDir = scenariosDir || path.join(process.cwd(), 'demos');
  }

  /**
   * Get all available demo scenarios
   */
  getAvailableScenarios(): DemoScenario[] {
    return [
      this.getTodoAppScenario(),
      this.getApiServerScenario(),
      this.getFullStackScenario()
    ];
  }

  /**
   * Get scenario by name
   */
  getScenario(name: string): DemoScenario | undefined {
    const scenarios = this.getAvailableScenarios();
    return scenarios.find(s => s.name === name);
  }

  /**
   * Todo App Demo - Small, fast demo
   */
  private getTodoAppScenario(): DemoScenario {
    return {
      name: 'todo-app',
      description: 'Simple todo app with React frontend and Express backend',
      goal: 'Build a todo app with React frontend, Express backend, and basic tests',
      expectedDuration: '5-8 minutes',
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Create Express server with todo CRUD endpoints (GET, POST, PUT, DELETE /api/todos)',
          dependencies: [],
          expectedOutputs: [
            'src/server/index.ts',
            'src/server/routes/todos.ts',
            'src/server/models/todo.ts'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'frontend_expert',
          task: 'Create React todo UI with list, add, edit, delete functionality',
          dependencies: [],
          expectedOutputs: [
            'src/client/App.tsx',
            'src/client/components/TodoList.tsx',
            'src/client/components/TodoItem.tsx'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'tester_elite',
          task: 'Add unit tests for backend API and frontend components',
          dependencies: [1, 2],
          expectedOutputs: [
            'test/server/todos.test.ts',
            'test/client/TodoList.test.tsx'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'integrator_finalizer',
          task: 'Integrate frontend and backend, add E2E tests, finalize docs',
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'test/e2e/todo-workflow.test.ts',
            'README.md',
            'docs/API.md'
          ]
        }
      ]
    };
  }

  /**
   * API Server Demo - Medium complexity
   */
  private getApiServerScenario(): DemoScenario {
    return {
      name: 'api-server',
      description: 'RESTful API server with auth, database, and deployment',
      goal: 'Build a production-ready REST API with authentication, PostgreSQL database, and Docker deployment',
      expectedDuration: '10-15 minutes',
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Create Express server with user authentication (JWT), CRUD endpoints for users and posts',
          dependencies: [],
          expectedOutputs: [
            'src/server.ts',
            'src/routes/auth.ts',
            'src/routes/users.ts',
            'src/routes/posts.ts',
            'src/middleware/auth.ts'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'backend_master',
          task: 'Add PostgreSQL database integration with Prisma ORM, migrations, and seed data',
          dependencies: [1],
          expectedOutputs: [
            'prisma/schema.prisma',
            'prisma/migrations/',
            'src/db/client.ts'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'security_auditor',
          task: 'Audit authentication implementation, add rate limiting, sanitize inputs, security headers',
          dependencies: [1, 2],
          expectedOutputs: [
            'src/middleware/ratelimit.ts',
            'src/middleware/security.ts',
            'SECURITY.md'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'tester_elite',
          task: 'Add comprehensive API tests (unit, integration, auth flows)',
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'test/routes/auth.test.ts',
            'test/routes/users.test.ts',
            'test/integration/api.test.ts'
          ]
        },
        {
          stepNumber: 5,
          agentName: 'devops_pro',
          task: 'Create Dockerfile, docker-compose.yml, GitHub Actions CI/CD pipeline',
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'Dockerfile',
            'docker-compose.yml',
            '.github/workflows/ci.yml',
            '.github/workflows/deploy.yml'
          ]
        },
        {
          stepNumber: 6,
          agentName: 'integrator_finalizer',
          task: 'Final integration tests, API documentation, deployment guide, release notes',
          dependencies: [1, 2, 3, 4, 5],
          expectedOutputs: [
            'docs/API.md',
            'docs/DEPLOYMENT.md',
            'CHANGELOG.md',
            'test/e2e/api-workflow.test.ts'
          ]
        }
      ]
    };
  }

  /**
   * Full-Stack Demo - Complex, showcase all features
   */
  private getFullStackScenario(): DemoScenario {
    return {
      name: 'full-stack-app',
      description: 'Full-stack application with auth, testing, and deployment (showcase all agents)',
      goal: 'Build a complete full-stack todo app with user authentication, comprehensive tests, security, and deployment',
      expectedDuration: '15-20 minutes',
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Create Express + PostgreSQL backend with user auth (JWT), todo CRUD, user management',
          dependencies: [],
          expectedOutputs: [
            'src/server/index.ts',
            'src/routes/auth.ts',
            'src/routes/todos.ts',
            'src/models/',
            'prisma/schema.prisma'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'frontend_expert',
          task: 'Create React frontend with auth pages, todo dashboard, user profile',
          dependencies: [],
          expectedOutputs: [
            'src/client/App.tsx',
            'src/client/pages/Login.tsx',
            'src/client/pages/Dashboard.tsx',
            'src/client/components/TodoList.tsx'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'security_auditor',
          task: 'Security audit: rate limiting, input sanitization, CORS, CSP headers, vulnerability scan',
          dependencies: [1],
          expectedOutputs: [
            'src/middleware/security.ts',
            'src/middleware/ratelimit.ts',
            'SECURITY.md'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'tester_elite',
          task: 'Backend unit and integration tests (auth, todos, models)',
          dependencies: [1],
          expectedOutputs: [
            'test/routes/auth.test.ts',
            'test/routes/todos.test.ts',
            'test/models/user.test.ts'
          ]
        },
        {
          stepNumber: 5,
          agentName: 'tester_elite',
          task: 'Frontend component tests and E2E tests with Playwright',
          dependencies: [2],
          expectedOutputs: [
            'test/client/components/TodoList.test.tsx',
            'test/e2e/auth-flow.spec.ts',
            'test/e2e/todo-crud.spec.ts'
          ]
        },
        {
          stepNumber: 6,
          agentName: 'devops_pro',
          task: 'Docker setup, GitHub Actions CI/CD, deployment to cloud (Railway/Render)',
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'Dockerfile',
            'docker-compose.yml',
            '.github/workflows/ci.yml',
            '.github/workflows/deploy.yml'
          ]
        },
        {
          stepNumber: 7,
          agentName: 'integrator_finalizer',
          task: 'Integration: connect frontend to backend, E2E tests, docs, deployment guide, release',
          dependencies: [1, 2, 3, 4, 5, 6],
          expectedOutputs: [
            'test/e2e/full-workflow.test.ts',
            'README.md',
            'docs/API.md',
            'docs/DEPLOYMENT.md',
            'CHANGELOG.md'
          ]
        }
      ]
    };
  }

  /**
   * Save scenario to file
   */
  saveScenario(scenario: DemoScenario): void {
    if (!fs.existsSync(this.scenariosDir)) {
      fs.mkdirSync(this.scenariosDir, { recursive: true });
    }

    const filePath = path.join(this.scenariosDir, `${scenario.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
  }

  /**
   * Load scenario from file
   */
  loadScenarioFromFile(name: string): DemoScenario | undefined {
    const filePath = path.join(this.scenariosDir, `${name}.json`);
    
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as DemoScenario;
  }

  /**
   * Convert scenario to ExecutionPlan
   */
  scenarioToPlan(scenario: DemoScenario): ExecutionPlan {
    return {
      goal: scenario.goal,
      createdAt: new Date().toISOString(),
      steps: scenario.steps,
      metadata: {
        totalSteps: scenario.steps.length,
        estimatedDuration: scenario.expectedDuration
      }
    };
  }
}

export default DemoMode;
