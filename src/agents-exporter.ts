// Generates empirically-derived .agent.md files from execution history.
// Reads knowledge base patterns across runs, aggregates per-agent stats,
// and produces agent definitions enriched with learned conventions.

import * as fs from 'fs';
import * as path from 'path';
import { AgentProfile, ConfigLoader } from './config-loader';
import { KnowledgeBase, KnowledgePattern } from './knowledge-base';

/**
 * Per-agent aggregated statistics derived from knowledge base entries.
 */
export interface AgentStats {
  agentName: string;
  totalMentions: number;
  failureModes: string[];
  successPatterns: string[];
  toolGuidance: { tool: string; outcome: 'success' | 'failure'; count: number }[];
  scopePatterns: string[];
  boundaryViolations: string[];
  avgDurationHint: string | undefined;
  costHint: string | undefined;
}

/**
 * Diff entry showing what changed between two exports.
 */
export interface AgentDiffEntry {
  agentName: string;
  field: string;
  previous: string;
  current: string;
}

/**
 * Options for the export command.
 */
export interface ExportOptions {
  outputDir: string;
  minRuns: number;
  diff: boolean;
}

/**
 * Result of an agent export operation.
 */
export interface ExportResult {
  agentsExported: string[];
  outputDir: string;
  fromData: boolean;
  diffs: AgentDiffEntry[];
}

// 30-day half-life for exponential decay weighting
const HALF_LIFE_DAYS = 30;

/**
 * Reads knowledge base data from execution history and generates
 * .agent.md files with learned conventions baked into the instructions.
 */
export class AgentsExporter {
  private runsDir: string;
  private configLoader: ConfigLoader;

  constructor(workingDir?: string) {
    const baseDir = workingDir || process.cwd();
    this.runsDir = path.join(baseDir, 'runs');
    this.configLoader = new ConfigLoader();
  }

  /**
   * Export all agents as .agent.md files.
   * If sufficient run data exists, enriches base definitions with learned patterns.
   * Otherwise, generates from base definitions with a note about needing more data.
   */
  export(options: ExportOptions): ExportResult {
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    const baseAgents = this.loadBaseAgents();
    const knowledgeBases = this.loadAllKnowledgeBases();
    const totalRuns = this.countDistinctRuns(knowledgeBases);
    const fromData = totalRuns >= options.minRuns;

    const agentStats = fromData
      ? this.aggregatePerAgent(knowledgeBases, baseAgents)
      : new Map<string, AgentStats>();

    const diffs: AgentDiffEntry[] = [];
    const agentsExported: string[] = [];

    for (const agent of baseAgents) {
      const stats = agentStats.get(agent.name);
      const content = this.generateAgentMd(agent, stats, fromData, totalRuns);
      const filename = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.agent.md';
      const outputPath = path.join(options.outputDir, filename);

      // Compute diff if requested and a previous export exists
      if (options.diff && fs.existsSync(outputPath)) {
        const previous = fs.readFileSync(outputPath, 'utf8');
        const entryDiffs = this.computeDiff(agent.name, previous, content);
        diffs.push(...entryDiffs);
      }

      fs.writeFileSync(outputPath, content, 'utf8');
      agentsExported.push(agent.name);
    }

    return { agentsExported, outputDir: options.outputDir, fromData, diffs };
  }

  /**
   * Load base agent profiles from config.
   */
  private loadBaseAgents(): AgentProfile[] {
    return this.configLoader.loadAllAgents();
  }

  /**
   * Scan the runs directory for knowledge-base.json files.
   */
  loadAllKnowledgeBases(): KnowledgeBase[] {
    if (!fs.existsSync(this.runsDir)) return [];

    const results: KnowledgeBase[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.runsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const kbPath = path.join(this.runsDir, entry.name, 'knowledge-base.json');
      if (fs.existsSync(kbPath)) {
        try {
          const content = fs.readFileSync(kbPath, 'utf8');
          const kb = JSON.parse(content) as KnowledgeBase;
          results.push(kb);
        } catch {
          // Skip malformed files without crashing the export
        }
      }
    }

    return results;
  }

  /**
   * Count distinct runs across all knowledge bases, weighting recent runs
   * more heavily via exponential decay (30-day half-life).
   */
  private countDistinctRuns(bases: KnowledgeBase[]): number {
    // Each knowledge base file represents one or more runs.
    // totalRuns from the statistics field is the authoritative count per file.
    return bases.reduce((sum, kb) => sum + (kb.statistics.totalRuns || 1), 0);
  }

  /**
   * Aggregate knowledge patterns per agent with recency weighting.
   */
  aggregatePerAgent(
    bases: KnowledgeBase[],
    agents: AgentProfile[]
  ): Map<string, AgentStats> {
    const statsMap = new Map<string, AgentStats>();

    // Initialize stats for each known agent
    for (const agent of agents) {
      statsMap.set(agent.name, {
        agentName: agent.name,
        totalMentions: 0,
        failureModes: [],
        successPatterns: [],
        toolGuidance: [],
        scopePatterns: [],
        boundaryViolations: [],
        avgDurationHint: undefined,
        costHint: undefined
      });
    }

    const now = Date.now();

    for (const kb of bases) {
      for (const pattern of kb.patterns) {
        const weight = this.computeRecencyWeight(pattern.lastSeen, now);
        // Only process patterns above minimum relevance weight
        if (weight < 0.1) continue;

        // Find which agent(s) this pattern mentions
        for (const agent of agents) {
          const nameLower = agent.name.toLowerCase();
          // Normalize for matching: strip underscores so "backend_master" matches "backendmaster" in KB text
          const nameNormalized = nameLower.replace(/_/g, '');
          const insightLower = pattern.insight.toLowerCase();
          const evidenceStr = pattern.evidence.join(' ').toLowerCase();

          const nameMatches = insightLower.includes(nameLower)
            || insightLower.includes(nameNormalized)
            || evidenceStr.includes(nameLower)
            || evidenceStr.includes(nameNormalized);

          if (!nameMatches) {
            continue;
          }

          const stats = statsMap.get(agent.name);
          if (!stats) continue;

          stats.totalMentions++;
          this.classifyPattern(pattern, stats, weight);
        }
      }
    }

    return statsMap;
  }

  /**
   * Apply exponential decay weighting based on when the pattern was last seen.
   */
  computeRecencyWeight(lastSeen: string, nowMs: number): number {
    const seenMs = new Date(lastSeen).getTime();
    if (isNaN(seenMs)) return 0.5; // Unknown date gets neutral weight
    const daysSince = (nowMs - seenMs) / (1000 * 60 * 60 * 24);
    return Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
  }

  /**
   * Classify a knowledge pattern into the appropriate stats bucket.
   */
  private classifyPattern(
    pattern: KnowledgePattern,
    stats: AgentStats,
    _weight: number
  ): void {
    switch (pattern.category) {
      case 'failure_mode':
        if (!stats.failureModes.includes(pattern.insight)) {
          stats.failureModes.push(pattern.insight);
        }
        break;

      case 'best_practice':
        if (!stats.successPatterns.includes(pattern.insight)) {
          stats.successPatterns.push(pattern.insight);
        }
        break;

      case 'anti_pattern':
        if (!stats.boundaryViolations.includes(pattern.insight)) {
          stats.boundaryViolations.push(pattern.insight);
        }
        break;

      case 'agent_behavior':
        // Extract file path patterns from evidence
        for (const ev of pattern.evidence) {
          if (ev.includes('/') && !stats.scopePatterns.includes(ev)) {
            stats.scopePatterns.push(ev);
          }
        }
        break;

      case 'cost_history':
        // Extract cost insights for the agent
        if (pattern.insight.includes('premium request')) {
          stats.costHint = pattern.insight;
        }
        break;

      default:
        break;
    }
  }

  /**
   * Generate .agent.md content for a single agent with optional learned data.
   */
  generateAgentMd(
    agent: AgentProfile,
    stats: AgentStats | undefined,
    fromData: boolean,
    totalRuns: number
  ): string {
    const sections: string[] = [];

    // YAML frontmatter
    sections.push('---');
    sections.push(`name: ${agent.name}`);
    sections.push(`description: ${agent.purpose}`);
    sections.push('tools:');
    const tools = agent.tools || ['file_operations', 'terminal', 'git'];
    for (const tool of tools) {
      sections.push(`  - ${tool}`);
    }
    sections.push('model: claude-sonnet-4');
    sections.push('---');
    sections.push('');

    // Title
    sections.push(`# ${agent.name}`);
    sections.push('');

    // Data notice
    if (!fromData) {
      sections.push('> **Note:** This agent definition is generated from base configuration.');
      sections.push(`> Only ${totalRuns} run(s) recorded. Export again after 5+ runs for`);
      sections.push('> data-driven recommendations.');
      sections.push('');
    }

    // Purpose
    sections.push('## Purpose');
    sections.push('');
    sections.push(agent.purpose + '.');
    sections.push('');

    // Scope
    sections.push('## Scope');
    sections.push('');
    for (const item of agent.scope) {
      sections.push(`- ${item}`);
    }
    sections.push('');

    // Boundaries
    sections.push('## Boundaries');
    sections.push('');
    for (const item of agent.boundaries) {
      sections.push(`- ${item}`);
    }
    sections.push('');

    // Done Definition
    sections.push('## Done Definition');
    sections.push('');
    for (const item of agent.done_definition) {
      sections.push(`- ${item}`);
    }
    sections.push('');

    // Learned sections (only when sufficient data exists)
    if (fromData && stats && stats.totalMentions > 0) {
      // Failure prevention
      if (stats.failureModes.length > 0) {
        sections.push('## Failure Prevention (Learned)');
        sections.push('');
        sections.push('The following patterns have caused failures in past runs. Avoid them:');
        sections.push('');
        for (const mode of stats.failureModes.slice(0, 10)) {
          sections.push(`- ${mode}`);
        }
        sections.push('');
      }

      // Success patterns
      if (stats.successPatterns.length > 0) {
        sections.push('## Proven Patterns');
        sections.push('');
        sections.push('These approaches have consistently succeeded:');
        sections.push('');
        for (const pattern of stats.successPatterns.slice(0, 10)) {
          sections.push(`- ${pattern}`);
        }
        sections.push('');
      }

      // Scope insights from actual file paths
      if (stats.scopePatterns.length > 0) {
        sections.push('## Observed File Scope');
        sections.push('');
        sections.push('Files this agent typically modifies (based on execution history):');
        sections.push('');
        for (const sp of stats.scopePatterns.slice(0, 15)) {
          sections.push(`- \`${sp}\``);
        }
        sections.push('');
      }

      // Boundary violations
      if (stats.boundaryViolations.length > 0) {
        sections.push('## Anti-Patterns (Do Not Repeat)');
        sections.push('');
        for (const violation of stats.boundaryViolations.slice(0, 10)) {
          sections.push(`- ${violation}`);
        }
        sections.push('');
      }

      // Cost hints
      if (stats.costHint) {
        sections.push('## Performance Notes');
        sections.push('');
        sections.push(`- ${stats.costHint}`);
        sections.push('');
      }
    }

    // Refusal rules (always included)
    sections.push('## Refusal Rules');
    sections.push('');
    for (const rule of agent.refusal_rules) {
      sections.push(`- ${rule}`);
    }
    sections.push('');

    return sections.join('\n');
  }

  /**
   * Compute a simple section-level diff between previous and current exports.
   */
  computeDiff(agentName: string, previous: string, current: string): AgentDiffEntry[] {
    const diffs: AgentDiffEntry[] = [];

    const prevSections = this.extractSections(previous);
    const currSections = this.extractSections(current);

    // Compare each section header
    const allHeaders = new Set([...prevSections.keys(), ...currSections.keys()]);
    for (const header of allHeaders) {
      const prevContent = prevSections.get(header) || '';
      const currContent = currSections.get(header) || '';

      if (prevContent !== currContent) {
        diffs.push({
          agentName,
          field: header,
          previous: prevContent.slice(0, 200),
          current: currContent.slice(0, 200)
        });
      }
    }

    return diffs;
  }

  /**
   * Extract markdown sections as header -> body map.
   */
  private extractSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = content.split('\n');
    let currentHeader = '_frontmatter';
    let currentBody: string[] = [];

    for (const line of lines) {
      const match = line.match(/^##?\s+(.+)/);
      if (match) {
        // Save previous section
        sections.set(currentHeader, currentBody.join('\n').trim());
        currentHeader = match[1];
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }

    // Save last section
    sections.set(currentHeader, currentBody.join('\n').trim());

    return sections;
  }
}

export default AgentsExporter;
