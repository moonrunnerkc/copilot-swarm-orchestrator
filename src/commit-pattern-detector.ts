/**
 * Commit Pattern Detector
 * 
 * Analyzes git commit patterns to detect anti-patterns like:
 * - Generic/vague messages
 * - Repetitive patterns
 * - Single-commit dumps
 * - Non-incremental commits
 */

export interface CommitMessage {
  hash: string;
  message: string;
  timestamp: Date;
  files: string[];
}

export interface PatternDetectionResult {
  hasAntiPatterns: boolean;
  warnings: string[];
  score: number; // 0-100, higher is better
  details: {
    genericMessages: number;
    repetitivePatterns: number;
    singleCommitDump: boolean;
    averageFilesPerCommit: number;
    commitCount: number;
  };
}

/**
 * Generic/vague message patterns that indicate low quality
 */
const GENERIC_PATTERNS = [
  /^update/i,
  /^fix$/i,
  /^fix bug/i,
  /^changes$/i,
  /^wip$/i,
  /^work in progress/i,
  /^temp$/i,
  /^temporary/i,
  /^misc/i,
  /^various/i,
  /^stuff$/i,
  /^code$/i,
  /^update code/i,
  /^fix code/i,
  /^fix issue/i,
  /^address.*feedback/i,
  /^pr feedback/i,
  /^refactor$/i,
  /^cleanup$/i,
  /^done$/i,
  /^complete$/i
];

/**
 * Detects commit anti-patterns in a branch's history
 */
export class CommitPatternDetector {
  /**
   * Analyze commit patterns for quality
   */
  analyzeCommits(commits: CommitMessage[]): PatternDetectionResult {
    if (commits.length === 0) {
      return {
        hasAntiPatterns: false,
        warnings: [],
        score: 100,
        details: {
          genericMessages: 0,
          repetitivePatterns: 0,
          singleCommitDump: false,
          averageFilesPerCommit: 0,
          commitCount: 0
        }
      };
    }

    const warnings: string[] = [];
    let score = 100;

    // Check for generic messages
    const genericCount = commits.filter(c => 
      GENERIC_PATTERNS.some(pattern => pattern.test(c.message))
    ).length;

    if (genericCount > 0) {
      warnings.push(`Found ${genericCount} generic/vague commit message(s)`);
      score -= genericCount * 15;
    }

    // Check for repetitive patterns (same message multiple times)
    const messageFrequency = new Map<string, number>();
    for (const commit of commits) {
      const normalized = commit.message.toLowerCase().trim();
      messageFrequency.set(normalized, (messageFrequency.get(normalized) || 0) + 1);
    }

    const repetitiveCount = Array.from(messageFrequency.values()).filter(count => count > 2).length;
    if (repetitiveCount > 0) {
      warnings.push(`Found ${repetitiveCount} repetitive commit message pattern(s)`);
      score -= repetitiveCount * 20;
    }

    // Check for single-commit dump (one commit with many files)
    const singleCommitDump = commits.length === 1 && commits[0].files.length > 5;
    if (singleCommitDump) {
      warnings.push('Single-commit dump detected (one commit with many files)');
      score -= 30;
    }

    // Check for non-incremental work (too many files per commit on average)
    const totalFiles = commits.reduce((sum, c) => sum + c.files.length, 0);
    const avgFilesPerCommit = totalFiles / commits.length;
    
    if (avgFilesPerCommit > 8 && commits.length > 1) {
      warnings.push(`High files-per-commit average (${avgFilesPerCommit.toFixed(1)}), suggests non-incremental work`);
      score -= 15;
    }

    // Check for too few commits given file count
    if (commits.length === 1 && totalFiles > 3) {
      warnings.push('Too few commits for amount of work (should break into logical chunks)');
      score -= 20;
    }

    // Ensure score stays in 0-100 range
    score = Math.max(0, Math.min(100, score));

    return {
      hasAntiPatterns: warnings.length > 0,
      warnings,
      score,
      details: {
        genericMessages: genericCount,
        repetitivePatterns: repetitiveCount,
        singleCommitDump,
        averageFilesPerCommit: parseFloat(avgFilesPerCommit.toFixed(1)),
        commitCount: commits.length
      }
    };
  }

  /**
   * Check if a single commit message is problematic
   */
  isGenericMessage(message: string): boolean {
    return GENERIC_PATTERNS.some(pattern => pattern.test(message));
  }

  /**
   * Get suggestions for improving commit quality
   */
  getSuggestions(result: PatternDetectionResult): string[] {
    const suggestions: string[] = [];

    if (result.details.genericMessages > 0) {
      suggestions.push('Use specific, descriptive commit messages (e.g., "add user authentication API" not "update code")');
    }

    if (result.details.repetitivePatterns > 0) {
      suggestions.push('Vary commit messages to reflect different work done');
    }

    if (result.details.singleCommitDump) {
      suggestions.push('Break work into multiple logical commits (e.g., separate commits for API, tests, docs)');
    }

    if (result.details.averageFilesPerCommit > 8) {
      suggestions.push('Make smaller, more focused commits (aim for 2-5 files per commit)');
    }

    if (result.score < 70) {
      suggestions.push('Review git commit guidelines in your agent instructions for examples');
    }

    return suggestions;
  }
}

export default CommitPatternDetector;
