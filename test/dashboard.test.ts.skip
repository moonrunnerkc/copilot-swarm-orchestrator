import { describe, it, before, after } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Dashboard } from '../src/dashboard';
import { ExecutionContext } from '../src/step-runner';

describe('Dashboard', () => {
  const testDir = path.join(process.cwd(), 'test-dashboard');

  before(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('render', () => {
    it('should render dashboard with mock execution data', () => {
      const mockContext: ExecutionContext = {
        plan: {
          goal: 'Build a REST API',
          createdAt: '2026-01-23T00:00:00.000Z',
          steps: [
            {
              stepNumber: 1,
              task: 'Set up database schema',
              agentName: 'BackendMaster',
              dependencies: [],
              expectedOutputs: ['schema.sql']
            },
            {
              stepNumber: 2,
              task: 'Implement API endpoints',
              agentName: 'BackendMaster',
              dependencies: [1],
              expectedOutputs: ['src/api.ts']
            },
            {
              stepNumber: 3,
              task: 'Write API tests',
              agentName: 'TesterElite',
              dependencies: [2],
              expectedOutputs: ['test/api.test.ts']
            }
          ]
        },
        planFilename: 'plan-test.json',
        executionId: 'exec-test-123',
        startTime: '2026-01-23T00:00:00.000Z',
        currentStep: 2,
        stepResults: [
          {
            stepNumber: 1,
            agentName: 'BackendMaster',
            status: 'completed',
            transcriptPath: 'proof/step-01-share.md'
          },
          {
            stepNumber: 2,
            agentName: 'BackendMaster',
            status: 'running'
          },
          {
            stepNumber: 3,
            agentName: 'TesterElite',
            status: 'pending'
          }
        ],
        priorContext: ['Step 1: Database schema created']
      };

      const dashboard = new Dashboard(mockContext);
      
      // capture stdout
      const originalLog = console.log;
      const originalClear = console.clear;
      let output = '';
      
      console.log = (...args: any[]) => {
        output += args.join(' ') + '\n';
      };
      console.clear = () => {};

      try {
        dashboard.render();
        
        // verify output contains key elements
        assert.ok(output.includes('Execution Dashboard'));
        assert.ok(output.includes('exec-test-123'));
        assert.ok(output.includes('Build a REST API'));
        assert.ok(output.includes('Step 1: Set up database schema'));
        assert.ok(output.includes('Step 2: Implement API endpoints'));
        assert.ok(output.includes('Step 3: Write API tests'));
        assert.ok(output.includes('BackendMaster'));
        assert.ok(output.includes('TesterElite'));
        assert.ok(output.includes('Completed: 1'));
        assert.ok(output.includes('Running: 1'));
        assert.ok(output.includes('Pending: 1'));
      } finally {
        console.log = originalLog;
        console.clear = originalClear;
      }
    });

    it('should show GitHub integration options when enabled', () => {
      const mockContext: ExecutionContext = {
        plan: {
          goal: 'Add feature',
          createdAt: '2026-01-23T00:00:00.000Z',
          steps: [
            {
              stepNumber: 1,
              task: 'Implement feature',
              agentName: 'BackendMaster',
              dependencies: [],
              expectedOutputs: ['src/feature.ts']
            }
          ]
        },
        planFilename: 'plan-test.json',
        executionId: 'exec-test-456',
        startTime: '2026-01-23T00:00:00.000Z',
        currentStep: 1,
        stepResults: [
          {
            stepNumber: 1,
            agentName: 'BackendMaster',
            status: 'pending'
          }
        ],
        priorContext: [],
        options: {
          delegate: true,
          mcp: true
        }
      };

      const dashboard = new Dashboard(mockContext);
      
      const originalLog = console.log;
      const originalClear = console.clear;
      let output = '';
      
      console.log = (...args: any[]) => {
        output += args.join(' ') + '\n';
      };
      console.clear = () => {};

      try {
        dashboard.render();
        
        assert.ok(output.includes('GitHub Integration'));
        assert.ok(output.includes('/delegate enabled'));
        assert.ok(output.includes('MCP evidence required'));
      } finally {
        console.log = originalLog;
        console.clear = originalClear;
      }
    });

    it('should show errors when steps have errors', () => {
      const mockContext: ExecutionContext = {
        plan: {
          goal: 'Test plan',
          createdAt: '2026-01-23T00:00:00.000Z',
          steps: [
            {
              stepNumber: 1,
              task: 'Failed step',
              agentName: 'BackendMaster',
              dependencies: [],
              expectedOutputs: []
            }
          ]
        },
        planFilename: 'plan-test.json',
        executionId: 'exec-test-789',
        startTime: '2026-01-23T00:00:00.000Z',
        currentStep: 1,
        stepResults: [
          {
            stepNumber: 1,
            agentName: 'BackendMaster',
            status: 'failed',
            errors: ['Tests failed', 'Build error']
          }
        ],
        priorContext: []
      };

      const dashboard = new Dashboard(mockContext);
      
      const originalLog = console.log;
      const originalClear = console.clear;
      let output = '';
      
      console.log = (...args: any[]) => {
        output += args.join(' ') + '\n';
      };
      console.clear = () => {};

      try {
        dashboard.render();
        
        assert.ok(output.includes('Errors:'));
        assert.ok(output.includes('Tests failed'));
        assert.ok(output.includes('Build error'));
        assert.ok(output.includes('Failed: 1'));
      } finally {
        console.log = originalLog;
        console.clear = originalClear;
      }
    });
  });
});
