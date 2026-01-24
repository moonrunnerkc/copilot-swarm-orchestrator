import * as fs from 'fs';
import * as path from 'path';

export interface KnowledgePattern {
  id: string;
  category: 'dependency_order' | 'agent_behavior' | 'anti_pattern' | 'best_practice' | 'failure_mode';
  insight: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  impact: 'low' | 'medium' | 'high';
  examples: string[];
}

export interface KnowledgeBase {
  version: number;
  lastUpdated: string;
  patterns: KnowledgePattern[];
  statistics: {
    totalRuns: number;
    totalPatterns: number;
    avgPatternsPerRun: number;
  };
}

/**
 * knowledge base for learning from execution patterns
 * stores insights from meta-reviewer analysis
 */
export class KnowledgeBaseManager {
  private knowledgeBasePath: string;
  private knowledgeBase: KnowledgeBase;

  constructor(workingDir?: string) {
    const baseDir = workingDir || process.cwd();
    this.knowledgeBasePath = path.join(baseDir, 'knowledge-base.json');
    this.knowledgeBase = this.loadKnowledgeBase();
  }

  /**
   * load knowledge base from disk or create new
   */
  private loadKnowledgeBase(): KnowledgeBase {
    if (fs.existsSync(this.knowledgeBasePath)) {
      try {
        const content = fs.readFileSync(this.knowledgeBasePath, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to load knowledge base, creating new: ${error}`);
      }
    }

    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      patterns: [],
      statistics: {
        totalRuns: 0,
        totalPatterns: 0,
        avgPatternsPerRun: 0
      }
    };
  }

  /**
   * save knowledge base to disk
   */
  private saveKnowledgeBase(): void {
    try {
      fs.writeFileSync(
        this.knowledgeBasePath,
        JSON.stringify(this.knowledgeBase, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error(`Failed to save knowledge base: ${error}`);
    }
  }

  /**
   * add or update pattern in knowledge base
   */
  addOrUpdatePattern(pattern: Omit<KnowledgePattern, 'id' | 'firstSeen' | 'occurrences' | 'examples' | 'lastSeen'>): void {
    const now = new Date().toISOString();
    
    // check if similar pattern exists
    const existing = this.knowledgeBase.patterns.find(
      p => p.category === pattern.category && 
           this.isSimilarInsight(p.insight, pattern.insight)
    );

    if (existing) {
      // update existing pattern
      existing.occurrences++;
      existing.lastSeen = now;
      existing.confidence = pattern.confidence;
      existing.evidence.push(...pattern.evidence);
      existing.impact = pattern.impact;
    } else {
      // create new pattern
      const newPattern: KnowledgePattern = {
        id: this.generatePatternId(pattern.category),
        category: pattern.category,
        insight: pattern.insight,
        confidence: pattern.confidence,
        evidence: pattern.evidence,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
        impact: pattern.impact,
        examples: []
      };
      this.knowledgeBase.patterns.push(newPattern);
    }

    this.knowledgeBase.lastUpdated = now;
    this.knowledgeBase.statistics.totalPatterns = this.knowledgeBase.patterns.length;
    this.saveKnowledgeBase();
  }

  /**
   * get patterns by category
   */
  getPatternsByCategory(category: KnowledgePattern['category']): KnowledgePattern[] {
    return this.knowledgeBase.patterns.filter(p => p.category === category);
  }

  /**
   * get high-confidence patterns
   */
  getHighConfidencePatterns(): KnowledgePattern[] {
    return this.knowledgeBase.patterns.filter(p => p.confidence === 'high');
  }

  /**
   * get patterns that should influence planning
   */
  getPlanningRelevantPatterns(): KnowledgePattern[] {
    return this.knowledgeBase.patterns.filter(
      p => (p.category === 'dependency_order' || p.category === 'best_practice') &&
           p.confidence !== 'low' &&
           p.occurrences >= 2
    );
  }

  /**
   * get anti-patterns to warn about
   */
  getAntiPatterns(): KnowledgePattern[] {
    return this.knowledgeBase.patterns.filter(
      p => p.category === 'anti_pattern' && p.impact !== 'low'
    );
  }

  /**
   * record execution run
   */
  recordRun(patternsDetected: number): void {
    this.knowledgeBase.statistics.totalRuns++;
    const { totalRuns, totalPatterns } = this.knowledgeBase.statistics;
    this.knowledgeBase.statistics.avgPatternsPerRun = totalPatterns / totalRuns;
    this.knowledgeBase.lastUpdated = new Date().toISOString();
    this.saveKnowledgeBase();
  }

  /**
   * get summary statistics
   */
  getStatistics(): KnowledgeBase['statistics'] {
    return { ...this.knowledgeBase.statistics };
  }

  /**
   * export knowledge base for review
   */
  export(): KnowledgeBase {
    return JSON.parse(JSON.stringify(this.knowledgeBase));
  }

  /**
   * clear old or low-value patterns
   */
  prunePatterns(options?: {
    removeOlderThan?: number; // days
    removeLowConfidence?: boolean;
    removeRare?: boolean; // occurrences < 2
  }): number {
    const now = new Date();
    let removed = 0;

    this.knowledgeBase.patterns = this.knowledgeBase.patterns.filter(pattern => {
      if (options?.removeOlderThan) {
        const lastSeenDate = new Date(pattern.lastSeen);
        const daysSinceLastSeen = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastSeen > options.removeOlderThan) {
          removed++;
          return false;
        }
      }

      if (options?.removeLowConfidence && pattern.confidence === 'low') {
        removed++;
        return false;
      }

      if (options?.removeRare && pattern.occurrences < 2) {
        removed++;
        return false;
      }

      return true;
    });

    if (removed > 0) {
      this.knowledgeBase.statistics.totalPatterns = this.knowledgeBase.patterns.length;
      this.saveKnowledgeBase();
    }

    return removed;
  }

  /**
   * check if two insights are similar (simple string similarity)
   */
  private isSimilarInsight(insight1: string, insight2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const n1 = normalize(insight1);
    const n2 = normalize(insight2);
    
    // exact match
    if (n1 === n2) return true;
    
    // high overlap (simple check)
    const words1 = new Set(n1.split(/\s+/));
    const words2 = new Set(n2.split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    return similarity > 0.7;
  }

  /**
   * generate unique pattern ID
   */
  private generatePatternId(category: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${category}-${timestamp}-${random}`;
  }
}
