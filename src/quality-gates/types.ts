export type GateStatus = 'pass' | 'fail' | 'skip';

export interface GateIssue {
  message: string;
  filePath?: string;
  line?: number;
  excerpt?: string;
  hint?: string;
}

export interface GateResult {
  id: string;
  title: string;
  status: GateStatus;
  durationMs: number;
  issues: GateIssue[];
  stats?: Record<string, number>;
}

export interface GateContext {
  projectRoot: string;
  files: ProjectFile[];
}

export interface ProjectFile {
  path: string; // absolute
  relativePath: string; // from projectRoot, posix-ish
  sizeBytes: number;
  text?: string;
}

export interface QualityGate<TConfig> {
  id: string;
  title: string;
  run(ctx: GateContext, config: TConfig): Promise<GateResult>;
}

export interface ScaffoldDefaultsConfig {
  enabled: boolean;
  bannedTitleRegexes: string[];
  bannedReadmeRegexes: string[];
  bannedFiles: string[];
}

export interface DuplicateBlocksConfig {
  enabled: boolean;
  minLines: number;
  maxOccurrences: number;
  maxFindings: number;
  excludeFileRegexes: string[];
}

export interface HardcodeConfig {
  enabled: boolean;
  bannedLiteralRegexes: string[];
  allowIfFileContainsRegexes: string[];
  excludeFileRegexes: string[];
}

export interface ReadmeClaimsConfig {
  enabled: boolean;
  claimRules: Array<{
    id: string;
    readmeRegex: string;
    requiredEvidence: Array<{ fileRegex: string; contentRegex: string; note?: string }>;
  }>;
}

export interface TestIsolationConfig {
  enabled: boolean;
  mutableStoreRegexes: string[];
  allowIfFileContainsRegexes: string[];
  testFileRegexes: string[];
  allowIfAnyTestContainsRegexes: string[];
}

export interface RuntimeChecksConfig {
  enabled: boolean;
  /** Number of retry attempts for each check (0 = no retries) */
  retries: number;
  /** Run `npm test` or equivalent */
  runTests: boolean;
  /** Run `npx eslint .` if eslint config exists */
  runLint: boolean;
  /** Run `npm audit --audit-level=moderate` */
  runAudit: boolean;
  /** Timeout per command in ms (default 120000) */
  timeoutMs: number;
}

export interface QualityGatesConfig {
  enabled: boolean;
  failOnIssues: boolean;
  autoAddRefactorStepOnDuplicateBlocks: boolean;
  autoAddReadmeTruthStepOnReadmeClaims: boolean;
  autoAddScaffoldFixStepOnScaffoldDefaults: boolean;
  autoAddConfigFixStepOnHardcodedConfig: boolean;
  excludeDirNames: string[];
  maxFileSizeBytes: number;
  gates: {
    scaffoldDefaults: ScaffoldDefaultsConfig;
    duplicateBlocks: DuplicateBlocksConfig;
    hardcodedConfig: HardcodeConfig;
    readmeClaims: ReadmeClaimsConfig;
    testIsolation: TestIsolationConfig;
    runtimeChecks: RuntimeChecksConfig;
  };
}
