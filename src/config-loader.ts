import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface AgentProfile {
  name: string;
  purpose: string;
  scope: string[];
  boundaries: string[];
  done_definition: string[];
  refusal_rules: string[];
  output_contract: {
    transcript: string;
    artifacts: string[];
  };
  // Custom agent metadata from .agent.md files
  customAgentPath?: string;
  description?: string;
  tools?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  agents: AgentProfile[];
}

/**
 * Custom agent frontmatter from .agent.md files
 */
export interface CustomAgentFrontmatter {
  name: string;
  description: string;
  target?: string;
  tools?: string[];
  infer?: boolean;
  metadata?: Record<string, unknown>;
}

export class ConfigLoader {
  private configDir: string;
  private customAgentsDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(process.cwd(), 'config');
    this.customAgentsDir = path.join(process.cwd(), '.github', 'agents');
  }

  loadDefaultAgents(): AgentConfig {
    const filePath = path.join(this.configDir, 'default-agents.yaml');
    return this.loadAgentFile(filePath);
  }

  loadUserAgents(): AgentConfig {
    const filePath = path.join(this.configDir, 'user-agents.yaml');
    return this.loadAgentFile(filePath);
  }

  /**
   * Load all agents: custom .agent.md files + YAML configs
   * Custom agents take precedence over YAML
   */
  loadAllAgents(): AgentProfile[] {
    const agentMap = new Map<string, AgentProfile>();

    // Load YAML configs first (legacy/fallback)
    try {
      const defaultAgents = this.loadDefaultAgents();
      defaultAgents.agents.forEach(agent => {
        agentMap.set(agent.name, agent);
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.warn(`Failed to load default agents: ${err.message}`);
    }

    try {
      const userAgents = this.loadUserAgents();
      userAgents.agents.forEach(agent => {
        agentMap.set(agent.name, agent);
      });
    } catch {
      // user agents file may not exist, that's ok
    }

    // Load custom .agent.md files (override YAML if name matches)
    const customAgents = this.loadCustomAgents();
    customAgents.forEach(agent => {
      agentMap.set(agent.name, agent);
    });

    return Array.from(agentMap.values());
  }

  /**
   * Load custom agents from .github/agents/*.agent.md
   */
  loadCustomAgents(): AgentProfile[] {
    if (!fs.existsSync(this.customAgentsDir)) {
      return [];
    }

    const agentFiles = fs.readdirSync(this.customAgentsDir)
      .filter(file => file.endsWith('.agent.md'));

    const agents: AgentProfile[] = [];

    for (const file of agentFiles) {
      try {
        const agentPath = path.join(this.customAgentsDir, file);
        const agent = this.parseCustomAgentFile(agentPath);
        if (agent) {
          agents.push(agent);
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.warn(`Failed to load custom agent ${file}: ${err.message}`);
      }
    }

    return agents;
  }

  /**
   * Parse a .agent.md custom agent file
   */
  private parseCustomAgentFile(filePath: string): AgentProfile | null {
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract frontmatter (YAML between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) {
      console.warn(`No frontmatter found in ${filePath}`);
      return null;
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as CustomAgentFrontmatter;
    
    // Extract markdown content after frontmatter
    const markdownContent = content.substring(frontmatterMatch[0].length).trim();

    // Parse sections from markdown
    const scope = this.extractMarkdownSection(markdownContent, 'Scope');
    const boundaries = this.extractMarkdownSection(markdownContent, 'Boundaries');
    const doneDefinition = this.extractMarkdownSection(markdownContent, 'Done Definition');
    const refusalRules = this.extractMarkdownSection(markdownContent, 'Refusal Rules');

    // Convert custom agent to AgentProfile format
    const agent: AgentProfile = {
      name: frontmatter.name,
      purpose: frontmatter.description,
      scope: scope.length > 0 ? scope : ['See .agent.md file for details'],
      boundaries: boundaries.length > 0 ? boundaries : ['See .agent.md file for details'],
      done_definition: doneDefinition.length > 0 ? doneDefinition : ['See .agent.md file for details'],
      refusal_rules: refusalRules.length > 0 ? refusalRules : ['Follow agent guidelines'],
      output_contract: {
        transcript: `proof/step-{N}-${frontmatter.name.replace(/_/g, '-')}.md`,
        artifacts: []
      },
      customAgentPath: filePath,
      description: frontmatter.description,
      ...(frontmatter.tools && { tools: frontmatter.tools }),
      ...(frontmatter.metadata && { metadata: frontmatter.metadata })
    };

    return agent;
  }

  /**
   * Extract bullet point list from markdown section
   */
  private extractMarkdownSection(markdown: string, sectionHeader: string): string[] {
    const items: string[] = [];
    
    // Find section header (## Scope or ## Boundaries, etc.)
    const headerRegex = new RegExp(`##\\s+${sectionHeader}[^\\n]*\\n`, 'i');
    const match = markdown.match(headerRegex);
    
    if (!match || match.index === undefined) {
      return items;
    }

    // Extract content until next ## header or end
    const startIndex = match.index + match[0].length;
    const remainingContent = markdown.substring(startIndex);
    const nextHeaderMatch = remainingContent.match(/\n##\s+/);
    const sectionContent = nextHeaderMatch 
      ? remainingContent.substring(0, nextHeaderMatch.index)
      : remainingContent;

    // Extract bullet points (lines starting with - or *)
    const lines = sectionContent.split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch && bulletMatch[1]) {
        items.push(bulletMatch[1].trim());
      }
    }

    return items;
  }

  /**
   * Get agent name for --agent flag (converts names to match .agent.md naming)
   */
  getAgentCLIName(agentName: string): string {
    // If agent has customAgentPath, use the name from frontmatter
    const agent = this.getAgentByName(agentName);
    if (agent?.customAgentPath) {
      return agent.name; // already in correct format from frontmatter
    }

    // Otherwise convert "FrontendExpert" -> "frontend_expert"
    return agentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
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
