/**
 * Types for bootstrap analysis and multi-repo orchestration
 */

export interface RepoAnalysis {
  repoPath: string;
  repoName: string;
  languages: string[];  // Detected from file extensions only
  buildScripts: BuildScript[];
  testScripts: TestScript[];
  dependencies: DependencyInfo[];
  techDebtMarkers: TechDebtMarker[];
  baselineConcerns: BaselineConcern[];
  gitRemote?: string;
}

export interface BuildScript {
  name: string;
  command: string;
  source: string;  // File path where found (e.g., "package.json:scripts.build")
}

export interface TestScript {
  name: string;
  command: string;
  source: string;
  framework?: string;  // Only if provable from config file
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  source: string;  // File path (e.g., "package.json:dependencies")
}

export interface TechDebtMarker {
  type: 'skipped_test' | 'disabled_lint_rule' | 'todo_comment' | 'dead_code';
  location: string;  // File:line
  evidence: string;
  severity: 'low' | 'medium' | 'high';
}

export interface BaselineConcern {
  type: 'missing_auth' | 'missing_config' | 'missing_logging' | 'missing_ci';
  reason: string;
  evidence: string;  // What proved it's missing
}

export interface CrossRepoRelationship {
  sourceRepo: string;
  targetRepo: string;
  type: 'api_dependency' | 'schema_sharing' | 'build_coupling';
  evidence: string[];
  details: string;
}

export interface GitHubIssueReference {
  number: number;
  title: string;
  url: string;
  labels: string[];
  repoName: string;
  createdAt: string;
}

export interface BootstrapAnalysisResult {
  repos: RepoAnalysis[];
  relationships: CrossRepoRelationship[];
  issues: GitHubIssueReference[];
  goal: string;
  analyzedAt: string;
}

export interface AnnotatedPlanStep {
  stepNumber: number;
  agentName: string;
  task: string;
  dependencies: number[];
  expectedOutputs: string[];
  sourceAnnotations: SourceAnnotation[];
}

export interface SourceAnnotation {
  type: 'repo_file' | 'github_issue' | 'build_script' | 'test_gap' | 'tech_debt';
  reference: string;
  evidence: string;
}
