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
      this.getDemoFastScenario(),
      this.getDashboardShowcaseScenario(),
      this.getTodoAppScenario(),
      this.getApiServerScenario(),
      this.getFullStackScenario(),
      this.getSaaSMvpScenario()
    ];
  }

  /**
   * Demo Fast - "hello world" swarm
   * Two agents, one wave, minimal work.
   * Both steps are truly independent - no shared files.
   */
  private getDemoFastScenario(): DemoScenario {
    return {
      name: 'demo-fast',
      description: 'Two-step hello-world swarm proving parallel execution (one wave)',
      goal: 'Quick swarm hello-world: two independent micro-tasks running in parallel',
      expectedDuration: '20-30 seconds',
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Create a tiny TypeScript utility module at src/string-utils.ts that exports a function greet(name: string): string which returns "Hello, <name>!". Keep it boring. No new deps. Add a short top-of-file comment. Commit your work.',
          dependencies: [],
          expectedOutputs: [
            'src/string-utils.ts with exported greet() function'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'tester_elite',
          task: 'Create a tiny TypeScript utility module at src/number-utils.ts that exports a function double(n: number): number which returns n * 2. Keep it boring. No new deps. Add a short top-of-file comment. Commit your work.',
          dependencies: [],
          expectedOutputs: [
            'src/number-utils.ts with exported double() function'
          ]
        }
      ]
    };
  }

  /**
   * Dashboard Showcase - Impressive visual demo (~5-6 minutes)
   * Creates an analytics dashboard with charts, animated counters, and live data.
   * Wave 1: Two agents work in parallel (UI shell + data utils)
   * Wave 2: API server (needs mockData from Wave 1)
   * Wave 3: Integration step wires everything together with charts
   */
  private getDashboardShowcaseScenario(): DemoScenario {
    return {
      name: 'dashboard-showcase',
      description: 'Analytics dashboard with charts, animated counters, and live data',
      goal: 'Build a visually impressive analytics dashboard with Chart.js charts, animated stat counters, mock API, and dark theme',
      expectedDuration: '5-6 minutes',
      steps: [
        {
          stepNumber: 1,
          agentName: 'frontend_expert',
          task: `Create a React + Vite dashboard shell. YOU ARE RESPONSIBLE FOR:
- package.json with "type": "module", vite, react, react-dom, chart.js, react-chartjs-2, express, cors deps
- vite.config.js with proxy to localhost:3001 for /api
- index.html with root div, viewport meta, lang="en", and Google Fonts Inter link
- src/main.jsx entry point that wraps App in a React ErrorBoundary component
- src/ErrorBoundary.jsx - a class component that catches render errors and shows a styled fallback UI with role="alert"
- src/App.jsx with CSS Grid layout: sidebar (200px, dark #0f0f23), main area with header and 2x2 grid of placeholder cards (background #1a1a2e, card bg #252542)
- src/App.css with dark theme styles, responsive breakpoints (@media max-width: 1024px collapses sidebar to horizontal nav, @media max-width: 640px stacks to single column)
- CSS MUST use /* */ comments only (never // comments, those are invalid CSS)
- Add "start:server": "node server/index.js" and "test": "node --test test/*.test.js" scripts to package.json

ACCESSIBILITY REQUIREMENTS (a11y):
- Use semantic HTML elements: <nav> for navigation, <main> for main content, <header> for page header, <section> for card groups
- Add aria-label on the <nav> element (e.g. "Main navigation")
- Navigation links must be keyboard-focusable with visible focus styles in CSS (:focus-visible outline)
- Cards should use <article> or have role="region" with aria-label
- Ensure color contrast: text on dark backgrounds must be at least #a0a0a0 (ratio 4.5:1 minimum)
- Add aria-live="polite" on the container where dynamic content (stats/chart) will load

IMPORTANT: package.json MUST have "type": "module". ALL .js files in this project use ES module syntax (import/export), never CommonJS (require/module.exports).

Style it modern, dark, and responsive. Add author comment "Author: Bradley R. Kinnard" at top of each file. Commit with message "add dashboard shell with dark theme".`,
          dependencies: [],
          expectedOutputs: [
            'package.json with "type": "module", vite, react, chart.js, express, cors deps, start:server and test scripts',
            'vite.config.js with API proxy to localhost:3001',
            'src/ErrorBoundary.jsx class component with styled fallback',
            'src/App.jsx with CSS Grid layout and dark theme',
            'src/App.css with responsive breakpoints at 1024px and 640px, :focus-visible styles',
            'src/main.jsx entry point wrapping App in ErrorBoundary',
            'index.html shell with Inter font and lang attribute',
            'Semantic HTML: nav, main, header, section elements with ARIA labels'
          ]
        },
        {
          stepNumber: 2,
          agentName: 'backend_master',
          task: `Create mock data utilities. YOU ARE RESPONSIBLE FOR ONLY THIS FILE:
- src/utils/mockData.js

IMPORTANT: This project uses "type": "module" in package.json. You MUST use ES module syntax (export function / export default). NEVER use require() or module.exports.

This file should export three pure functions:
1. generateStats() - returns { users: random 1000-5000, revenue: random 10000-50000, orders: random 100-500, conversion: random 2.5-8.5 }
2. generateChartData(days=7) - returns { labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], datasets: [{label: "Revenue", data: [random values 1000-5000 for each day], borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.1)"}] }
3. generateActivityFeed(count=5) - returns array of { id, user: random name, action: random action like "placed order", timestamp: recent ISO string }

All functions return fresh random data each call. Use ES module named exports (export function ...).
Add author comment "Author: Bradley R. Kinnard" at top.
Commit with message "add mock data generators".`,
          dependencies: [],
          expectedOutputs: [
            'src/utils/mockData.js with generateStats, generateChartData, generateActivityFeed',
            'Pure functions returning randomized mock data',
            'ES module named exports (export function)'
          ]
        },
        {
          stepNumber: 3,
          agentName: 'tester_elite',
          task: `Create the Express API server AND unit tests. YOU ARE RESPONSIBLE FOR THESE FILES:
- server/index.js
- test/mockData.test.js

IMPORTANT: This project uses "type": "module" in package.json. You MUST use ES module syntax (import/export). NEVER use require() or module.exports.

SERVER (server/index.js):
The mockData functions already exist at src/utils/mockData.js (created by another agent).
Import them with: import { generateStats, generateChartData, generateActivityFeed } from '../src/utils/mockData.js';

Create an Express server that:
1. Enables CORS
2. GET /api/stats returns generateStats()
3. GET /api/chart returns generateChartData(7)
4. GET /api/activity returns generateActivityFeed(5)
5. Listens on port 3001

TESTS (test/mockData.test.js):
Import from node:test and node:assert/strict. Write tests for all three generator functions:
- generateStats returns object with users, revenue, orders, conversion (all numbers)
- generateChartData returns object with labels array and datasets array
- generateActivityFeed returns array of objects with id, user, action, timestamp

Add author comment "Author: Bradley R. Kinnard" at top of each file.
Commit with message "add Express API server and unit tests".`,
          dependencies: [2],
          expectedOutputs: [
            'server/index.js with /api/stats, /api/chart, /api/activity endpoints using ES module imports',
            'test/mockData.test.js with tests for all three generator functions',
            'Imports mockData using ES module import syntax',
            'CORS enabled, port 3001'
          ]
        },
        {
          stepNumber: 4,
          agentName: 'integrator_finalizer',
          task: `Complete the dashboard by UPDATING the existing src/App.jsx file.

CONTEXT: Other agents have already created:
- src/App.jsx (placeholder dashboard shell with dark theme)
- src/App.css (dark theme styles with responsive breakpoints)
- src/ErrorBoundary.jsx (error boundary component)
- src/utils/mockData.js (ES module data generators)
- server/index.js (Express API on port 3001, ES module)
- test/mockData.test.js (unit tests for data generators)
- package.json with "type": "module" and all deps including chart.js, react-chartjs-2

IMPORTANT: This project uses "type": "module". Use ES module syntax only (import/export). Never use require() or module.exports.

YOUR JOB: Update src/App.jsx to add:
1. Import { Line } from 'react-chartjs-2' and Chart.js registration
2. Add useState for stats, chartData, activity, loading, fetchError
3. Add useEffect to fetch from /api/stats, /api/chart, /api/activity on mount with try/catch error handling that sets fetchError state
4. Show an error banner with retry button when fetchError is set
5. Create a StatCard component with animated count-up effect using requestAnimationFrame
6. Render 4 stat cards in the grid: Users (icon users), Revenue $ (icon dollar), Orders (icon package), Conversion % (icon chart)
7. Add a Line chart card using react-chartjs-2 with the fetched chartData
8. Add an activity feed card showing recent actions with relative timestamps
9. Add a "Refresh Data" button in the header that re-fetches all endpoints
10. Add subtle hover effects on cards (transform: translateY(-2px), box-shadow)

Also update src/App.css:
- Use ONLY /* */ CSS comments, never // comments (those are invalid CSS)
- Ensure all color hex values are valid (3, 4, 6, or 8 digits only)
- Ensure responsive breakpoints at 1024px and 640px are present
- Add :focus-visible outline styles for interactive elements

ACCESSIBILITY:
- Stat cards should have aria-label describing the stat (e.g. aria-label="Users: 3,421")
- The refresh button must have aria-label="Refresh data"
- The error banner must have role="alert" so screen readers announce it
- Chart container should have role="img" and aria-label describing the chart
- Activity feed list should use <ul> with <li> items

README: Create or update README.md with:
- Project title and one-line description
- Prerequisites (Node.js 18+)
- Install instructions (npm install)
- How to run: "npm run start:server" in one terminal, "npm run dev" in another, open http://localhost:5173
- How to run tests: "npm test"
- Tech stack list (React 18, Vite 5, Chart.js 4, Express 4)
- Brief architecture overview (frontend fetches from /api proxy to Express server)

COMPONENT TEST: Create test/App.test.js using node:test and node:assert/strict that:
- Tests the StatCard component renders (import and call it, verify it returns non-null)
- Or if direct component testing is not feasible, add integration tests that verify server endpoints return valid JSON shapes (fetch http://localhost:3001/api/stats and check the response has users, revenue, orders, conversion fields)

Make it visually polished. The app should work when running "npm run dev" (frontend) and "npm run start:server" (API) concurrently.
Commit with message "complete dashboard with charts, live data, and docs".`,
          dependencies: [1, 2, 3],
          expectedOutputs: [
            'Complete dashboard with animated stat cards and error handling',
            'Error banner with retry button and role="alert" for fetch failures',
            'Line chart with Chart.js and gradient fill, role="img" and aria-label',
            'Activity feed with timestamps using semantic ul/li',
            'Refresh button with aria-label for live data updates',
            'Polished dark theme with hover effects and responsive layout',
            'README.md with install, run, and test instructions',
            'test/App.test.js with component or integration tests'
          ]
        }
      ]
    };
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
      expectedDuration: '12-18 minutes',
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
      expectedDuration: '20-30 minutes',
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
      expectedDuration: '25-35 minutes',
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
      expectedDuration: '30-45 minutes',
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
