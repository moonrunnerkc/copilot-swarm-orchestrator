// Deterministic goal-to-task-type classifier using keyword matching.
// No LLM call: classification drives tier-based requirement filtering
// so it must be fast, reproducible, and testable.

export type TaskType = 'api-backend' | 'frontend-web' | 'cli-tool' | 'library-package' | 'full-stack';

export interface TaskClassification {
  taskType: TaskType;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

interface CategoryMatch {
  category: TaskType;
  keywords: string[];
  count: number;
}

// Each pattern is a regex that matches whole-ish tokens in the goal prompt.
// Word boundaries prevent "express" from matching inside "expression".
const CATEGORY_PATTERNS: Record<Exclude<TaskType, 'full-stack'>, RegExp[]> = {
  'api-backend': [
    /\bexpress\b/i,
    /\bfastapi\b/i,
    /\bflask\b/i,
    /\brest\b/i,
    /\bapi\b/i,
    /\bendpoints?\b/i,
    /\broutes?\b/i,
    /\bmiddleware\b/i,
    /\bserver\b/i,
    /\bbackend\b/i,
    /\bdatabase\b/i,
    /\b(?:GET|POST|PUT|DELETE|PATCH)\b/,
    /\bport\b/i,
    /\bcors\b/i,
  ],
  'frontend-web': [
    /\bhtml\b/i,
    /\bcss\b/i,
    /\bbrowser[- ]based\b/i,
    /\breact\b/i,
    /\bvue\b/i,
    /\bsvelte\b/i,
    /\bangular\b/i,
    /\bdashboard\b/i,
    /\bpanel\b/i,
    /\bcomponents?\b/i,
    /\bresponsive\b/i,
    /\baccessibility\b/i,
    /\baria\b/i,
    /\bdom\b/i,
    /\bcanvas\b/i,
    /\bsvg\b/i,
    /\bui\b/i,
    /\bfrontend\b/i,
    /\bwebapp\b/i,
    /\bweb\s+app\b/i,
    /\blanding\s+page\b/i,
    /\bforms?\b/i,
    /\bmodal\b/i,
  ],
  'cli-tool': [
    /\bcli\b/i,
    /\bcommand\s+line\b/i,
    /\bterminal\b/i,
    /\bflags?\b/i,
    /--\w+/,
    /\barguments?\b/i,
    /\bargv\b/i,
    /\bstdin\b/i,
    /\bstdout\b/i,
    /\bpipes?\b/i,
    /\bshell\b/i,
    /\bbinary\b/i,
    /\bbin\b/i,
    /\bsubcommands?\b/i,
  ],
  'library-package': [
    /\blibrary\b/i,
    /\bpackage\b/i,
    /\bsdk\b/i,
    /\bnpm\s+package\b/i,
    /\bpip\s+package\b/i,
    /\bcrate\b/i,
    /\bimportable\b/i,
    /\breusable\b/i,
    /\bpublishable\b/i,
  ],
};

function matchCategory(prompt: string, category: Exclude<TaskType, 'full-stack'>): CategoryMatch {
  const matched: string[] = [];
  for (const pattern of CATEGORY_PATTERNS[category]) {
    const match = prompt.match(pattern);
    if (match) {
      matched.push(match[0]);
    }
  }
  return { category, keywords: matched, count: matched.length };
}

export class TaskClassifier {
  classify(goalPrompt: string): TaskClassification {
    if (!goalPrompt || goalPrompt.trim().length === 0) {
      return { taskType: 'full-stack', confidence: 'low', matchedKeywords: [] };
    }

    const categories: Exclude<TaskType, 'full-stack'>[] = [
      'api-backend', 'frontend-web', 'cli-tool', 'library-package'
    ];

    const matches = categories.map(cat => matchCategory(goalPrompt, cat));

    const backendMatch = matches.find(m => m.category === 'api-backend')!;
    const frontendMatch = matches.find(m => m.category === 'frontend-web')!;

    // Full-stack: both backend and frontend have 2+ matches
    if (backendMatch.count >= 2 && frontendMatch.count >= 2) {
      const combined = [...backendMatch.keywords, ...frontendMatch.keywords];
      return { taskType: 'full-stack', confidence: 'high', matchedKeywords: combined };
    }

    // Sort by match count descending
    const sorted = [...matches].sort((a, b) => b.count - a.count);
    const winner = sorted[0];
    const runner = sorted[1];

    // No category has 2+ matches: default to full-stack with low confidence
    if (winner.count < 2) {
      if (winner.count === 1) {
        return { taskType: 'full-stack', confidence: 'low', matchedKeywords: winner.keywords };
      }
      return { taskType: 'full-stack', confidence: 'low', matchedKeywords: [] };
    }

    // Determine confidence based on separation from runner-up
    let confidence: 'high' | 'medium' | 'low';
    if (winner.count >= 3 && runner.count < 2) {
      confidence = 'high';
    } else if (winner.count >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      taskType: winner.category,
      confidence,
      matchedKeywords: winner.keywords,
    };
  }
}
