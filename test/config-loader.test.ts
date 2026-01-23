import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigLoader, AgentProfile } from '../src/config-loader';

describe('ConfigLoader', () => {
  // Config is in project root, not in dist
  const configDir = path.join(__dirname, '..', '..', 'config');

  describe('loadDefaultAgents', () => {
    it('should load default agents successfully', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      assert.ok(config);
      assert.ok(Array.isArray(config.agents));
      assert.ok(config.agents.length > 0);
    });

    it('should load all expected default agents', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      const expectedAgents = [
        'FrontendExpert',
        'BackendMaster',
        'DevOpsPro',
        'SecurityAuditor',
        'TesterElite',
        'IntegratorFinalizer'
      ];

      const agentNames = config.agents.map(a => a.name);
      
      for (const expectedName of expectedAgents) {
        assert.ok(
          agentNames.includes(expectedName),
          `Expected agent '${expectedName}' not found`
        );
      }
    });

    it('should validate required fields exist', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      config.agents.forEach(agent => {
        assert.ok(agent.name, 'Agent must have name');
        assert.ok(agent.purpose, 'Agent must have purpose');
        assert.ok(Array.isArray(agent.scope), 'Agent must have scope array');
        assert.ok(Array.isArray(agent.boundaries), 'Agent must have boundaries array');
        assert.ok(Array.isArray(agent.done_definition), 'Agent must have done_definition array');
        assert.ok(agent.output_contract, 'Agent must have output_contract');
        assert.ok(agent.output_contract.transcript, 'Agent must have transcript path');
        assert.ok(Array.isArray(agent.output_contract.artifacts), 'Agent must have artifacts array');
        assert.ok(Array.isArray(agent.refusal_rules), 'Agent must have refusal_rules array');
      });
    });
  });

  describe('loadUserAgents', () => {
    it('should load user agents successfully', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadUserAgents();

      assert.ok(config);
      assert.ok(Array.isArray(config.agents));
    });
  });

  describe('loadAllAgents', () => {
    it('should combine default and user agents', () => {
      const loader = new ConfigLoader(configDir);
      const allAgents = loader.loadAllAgents();

      assert.ok(Array.isArray(allAgents));
      assert.ok(allAgents.length >= 6); // At least the 6 default agents
    });
  });

  describe('getAgentByName', () => {
    it('should find agent by name', () => {
      const loader = new ConfigLoader(configDir);
      const agent = loader.getAgentByName('FrontendExpert');

      assert.ok(agent);
      assert.strictEqual(agent?.name, 'FrontendExpert');
    });

    it('should return undefined for non-existent agent', () => {
      const loader = new ConfigLoader(configDir);
      const agent = loader.getAgentByName('NonExistentAgent');

      assert.strictEqual(agent, undefined);
    });
  });

  describe('validation', () => {
    it('should throw error if config file not found', () => {
      const loader = new ConfigLoader('/nonexistent/path');

      assert.throws(() => {
        loader.loadDefaultAgents();
      }, /Config file not found/);
    });

    it('should validate agent has all required fields', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      // Verify first agent has all required fields
      const agent = config.agents[0];
      assert.ok(agent, 'At least one agent should exist');
      
      const requiredFields = [
        'name',
        'purpose',
        'scope',
        'boundaries',
        'done_definition',
        'output_contract',
        'refusal_rules'
      ];

      requiredFields.forEach(field => {
        assert.ok(
          field in agent!,
          `Agent missing required field: ${field}`
        );
      });
    });

    it('should validate output_contract structure', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      config.agents.forEach(agent => {
        assert.ok(agent.output_contract.transcript);
        assert.ok(Array.isArray(agent.output_contract.artifacts));
      });
    });
  });

  describe('agent content validation', () => {
    it('should have non-empty purpose for all agents', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      config.agents.forEach(agent => {
        assert.ok(agent.purpose.length > 0, `Agent ${agent.name} has empty purpose`);
      });
    });

    it('should have at least one scope item for all agents', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      config.agents.forEach(agent => {
        assert.ok(agent.scope.length > 0, `Agent ${agent.name} has no scope items`);
      });
    });

    it('should have at least one refusal rule for all agents', () => {
      const loader = new ConfigLoader(configDir);
      const config = loader.loadDefaultAgents();

      config.agents.forEach(agent => {
        assert.ok(
          agent.refusal_rules.length > 0,
          `Agent ${agent.name} has no refusal rules (required for drift control)`
        );
      });
    });
  });
});
