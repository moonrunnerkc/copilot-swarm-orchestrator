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
      this.getFullStackScenario(),
      this.getSaaSMvpScenario()
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
          task: 'Create Express server with todo CRUD endpoints (GET, POST, PUT, DELETE /api/todos). Use "title" as the field name for todo text. Add input validation (trim whitespace, require title). Enable CORS. Add comment at top of server.js. Export app for testing. Set author in package.json.',
          dependencies: [],
          expectedOutputs: [
            'server.js with CRUD endpoints',
            'package.json with scripts and author',
            'Input validation for title field'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'frontend_expert',
          task: 'Create React todo UI that calls the backend API via fetch(). Use "title" field (matching backend). Add loading states during API calls. Add error handling with user feedback. Configure vite proxy for /api. Add comment at top of each component file.',
          dependencies: [],
          expectedOutputs: [
            'src/App.jsx with fetch() calls to /api/todos',
            'vite.config.js with proxy config',
            'Loading and error states in UI'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'tester_elite',
          task: 'Add unit tests for backend API and frontend components. Use "title" field in all tests (matching backend). Include at least one real integration test with supertest. Add comment at top of each test file.',
          dependencies: [1, 2],
          expectedOutputs: [
            'API tests using supertest',
            'Component tests with React Testing Library',
            'Tests use correct field names'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'integrator_finalizer',
          task: 'Verify frontend actually calls backend (check for fetch calls). Fix any field name mismatches (title vs text). Ensure vite proxy is configured. Add troubleshooting section to README. Add E2E tests. Verify README accurately describes the app.',
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'E2E integration tests',
            'README with troubleshooting section',
            'Verified frontend-backend integration'
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
   * SaaS MVP Demo - Flagship scenario showcasing all capabilities
   */
  private getSaaSMvpScenario(): DemoScenario {
    return {
      name: 'saas-mvp',
      description: 'Full SaaS todo app MVP with auth, Stripe payments, analytics dashboard, and deployment',
      goal: 'Build and deploy a complete SaaS todo app MVP with user authentication, Stripe subscription payments, analytics dashboard, comprehensive tests, security audit, and cloud deployment',
      expectedDuration: '20-30 minutes',
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Create Express + PostgreSQL backend with user auth (JWT), session management, todo CRUD with user ownership',
          dependencies: [],
          expectedOutputs: [
            'src/server/index.ts',
            'src/routes/auth.ts',
            'src/routes/todos.ts',
            'src/models/user.ts',
            'src/models/todo.ts',
            'prisma/schema.prisma'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'backend_master',
          task: 'Add Stripe integration: subscription plans (free, pro, enterprise), webhook handling, payment methods',
          dependencies: [1],
          expectedOutputs: [
            'src/routes/stripe.ts',
            'src/services/stripe.ts',
            'src/webhooks/stripe-events.ts',
            'src/models/subscription.ts'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'frontend_expert',
          task: 'Create React frontend with auth pages, todo dashboard, subscription management, pricing page',
          dependencies: [],
          expectedOutputs: [
            'src/client/App.tsx',
            'src/client/pages/Login.tsx',
            'src/client/pages/Dashboard.tsx',
            'src/client/pages/Pricing.tsx',
            'src/client/components/TodoList.tsx',
            'src/client/components/SubscriptionCard.tsx'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'frontend_expert',
          task: 'Add analytics dashboard with user metrics (todos completed, active time, engagement), charts (Chart.js)',
          dependencies: [3],
          expectedOutputs: [
            'src/client/pages/Analytics.tsx',
            'src/client/components/MetricsCard.tsx',
            'src/client/components/ActivityChart.tsx',
            'src/services/analytics.ts'
          ]
        },
        {
          stepNumber: 5,
          agentName: 'security_auditor',
          task: 'Security audit: rate limiting, input sanitization, CORS, CSP, Stripe webhook signature verification, PCI compliance',
          dependencies: [1, 2],
          expectedOutputs: [
            'src/middleware/security.ts',
            'src/middleware/ratelimit.ts',
            'src/middleware/stripe-verify.ts',
            'SECURITY.md'
          ]
        },
        {
          stepNumber: 6,
          agentName: 'tester_elite',
          task: 'Comprehensive tests: auth flows, todo CRUD, Stripe integration (mocked webhooks), analytics data',
          dependencies: [1, 2, 3, 4],
          expectedOutputs: [
            'test/routes/auth.test.ts',
            'test/routes/todos.test.ts',
            'test/services/stripe.test.ts',
            'test/client/components/TodoList.test.tsx',
            'test/e2e/subscription-flow.spec.ts'
          ]
        },
        {
          stepNumber: 7,
          agentName: 'devops_pro',
          task: 'Deployment setup: Docker multi-stage build, environment configs, GitHub Actions CI/CD, deploy to Railway/Render with DB',
          dependencies: [1, 2, 3, 4, 5],
          expectedOutputs: [
            'Dockerfile',
            'docker-compose.yml',
            '.github/workflows/ci.yml',
            '.github/workflows/deploy-preview.yml',
            '.env.example'
          ]
        },
        {
          stepNumber: 8,
          agentName: 'integrator_finalizer',
          task: 'Final integration: connect all services, E2E tests (auth → subscribe → todos → analytics), comprehensive docs, deployment guide',
          dependencies: [1, 2, 3, 4, 5, 6, 7],
          expectedOutputs: [
            'test/e2e/full-saas-workflow.spec.ts',
            'README.md',
            'docs/API.md',
            'docs/DEPLOYMENT.md',
            'docs/STRIPE-SETUP.md',
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
