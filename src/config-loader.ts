import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface AgentProfile {
  name: string;
  purpose: string;
  scope: string[];
  boundaries: string[];
  done_definition: string[];
  output_contract: {
    transcript: string;
    artifacts: string[];
  };
  refusal_rules: string[];
}

export interface AgentConfig {
  agents: AgentProfile[];
}

export class ConfigLoader {
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(process.cwd(), 'config');
  }

  loadDefaultAgents(): AgentConfig {
    const filePath = path.join(this.configDir, 'default-agents.yaml');
    return this.loadAgentFile(filePath);
  }

  loadUserAgents(): AgentConfig {
    const filePath = path.join(this.configDir, 'user-agents.yaml');
    return this.loadAgentFile(filePath);
  }

  loadAllAgents(): AgentProfile[] {
    const defaultAgents = this.loadDefaultAgents();
    const userAgents = this.loadUserAgents();
    return [...defaultAgents.agents, ...userAgents.agents];
  }

  private loadAgentFile(filePath: string): AgentConfig {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(content) as AgentConfig;

    this.validateConfig(config, filePath);
    return config;
  }

  private validateConfig(config: AgentConfig, filePath: string): void {
    if (!config || typeof config !== 'object') {
      throw new Error(`Invalid config format in ${filePath}`);
    }

    if (!Array.isArray(config.agents)) {
      throw new Error(`Missing 'agents' array in ${filePath}`);
    }

    config.agents.forEach((agent, index) => {
      this.validateAgent(agent, `${filePath}[${index}]`);
    });
  }

  private validateAgent(agent: AgentProfile, context: string): void {
    const requiredFields = [
      'name',
      'purpose',
      'scope',
      'boundaries',
      'done_definition',
      'output_contract',
      'refusal_rules'
    ];

    for (const field of requiredFields) {
      if (!(field in agent)) {
        throw new Error(`Missing required field '${field}' in agent at ${context}`);
      }
    }

    // Validate name is non-empty string
    if (typeof agent.name !== 'string' || agent.name.trim() === '') {
      throw new Error(`Agent name must be non-empty string at ${context}`);
    }

    // Validate purpose is non-empty string
    if (typeof agent.purpose !== 'string' || agent.purpose.trim() === '') {
      throw new Error(`Agent purpose must be non-empty string at ${context}`);
    }

    // Validate arrays
    const arrayFields: (keyof AgentProfile)[] = ['scope', 'boundaries', 'done_definition', 'refusal_rules'];
    for (const field of arrayFields) {
      if (!Array.isArray(agent[field])) {
        throw new Error(`Agent field '${field}' must be an array at ${context}`);
      }
    }

    // Validate output_contract
    if (!agent.output_contract || typeof agent.output_contract !== 'object') {
      throw new Error(`Agent output_contract must be an object at ${context}`);
    }

    if (typeof agent.output_contract.transcript !== 'string') {
      throw new Error(`Agent output_contract.transcript must be a string at ${context}`);
    }

    if (!Array.isArray(agent.output_contract.artifacts)) {
      throw new Error(`Agent output_contract.artifacts must be an array at ${context}`);
    }
  }

  getAgentByName(name: string): AgentProfile | undefined {
    const allAgents = this.loadAllAgents();
    return allAgents.find(agent => agent.name === name);
  }
}

export default ConfigLoader;
