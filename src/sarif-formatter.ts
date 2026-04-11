import { GateResult, GateIssue, GateStatus } from './quality-gates/types';
import { QualityGatesRunResult } from './quality-gates/gate-runner';

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const TOOL_NAME = 'swarm-orchestrator';

interface SarifRule {
  id: string;
  shortDescription: { text: string };
}

interface SarifPhysicalLocation {
  artifactLocation: { uri: string };
  region?: { startLine: number };
}

interface SarifResult {
  ruleId: string;
  message: { text: string };
  level: 'error' | 'warning' | 'note';
  locations: Array<{ physicalLocation: SarifPhysicalLocation }>;
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }>;
}

/** Maps gate IDs to their SARIF rule descriptions. */
const RULE_DESCRIPTIONS: Record<string, string> = {
  'scaffold-defaults': 'Generated code contains TODO comments, placeholder text, or default scaffold values',
  'duplicate-blocks': 'Code block duplicated beyond configured threshold',
  'hardcoded-config': 'Configuration value hardcoded instead of externalized',
  'readme-claims': 'README claim does not match implemented functionality',
  'test-isolation': 'Test depends on shared mutable state',
  'test-coverage': 'Test coverage below configured threshold',
  'accessibility': 'Missing accessibility attribute or semantic element',
  'runtime-checks': 'Code fails build or test execution',
};

/**
 * Convert a GateStatus to the corresponding SARIF level.
 * Gates that pass produce no results; only fail and skip are mapped.
 * @param status - The gate status from the quality gates pipeline
 * @returns The SARIF severity level
 */
function statusToLevel(status: GateStatus): 'error' | 'note' {
  return status === 'fail' ? 'error' : 'note';
}

/**
 * Normalize a file path to a forward-slash relative URI with no leading "./".
 * @param filePath - Absolute or relative file path from a gate issue
 * @returns SARIF-compliant relative URI
 */
function normalizeUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.replace(/^\.\//, '');
}

/**
 * Build a SARIF physical location from a gate issue.
 * Populates region.startLine when the issue references a specific line.
 * @param issue - The gate issue with optional file and line info
 * @returns Physical location for the SARIF result
 */
function buildLocation(issue: GateIssue): SarifPhysicalLocation {
  const uri = issue.filePath ? normalizeUri(issue.filePath) : '.';
  const location: SarifPhysicalLocation = {
    artifactLocation: { uri },
  };
  if (issue.line && issue.line > 0) {
    location.region = { startLine: issue.line };
  }
  return location;
}

/**
 * Build SARIF rules array from gate results.
 * One rule per gate that produced results (fail or skip with issues).
 * @param gateResults - Array of gate results from the pipeline
 * @returns Deduplicated SARIF rules
 */
function buildRules(gateResults: GateResult[]): SarifRule[] {
  const seen = new Set<string>();
  const rules: SarifRule[] = [];

  for (const gate of gateResults) {
    const ruleId = `swarm/${gate.id}`;
    if (seen.has(ruleId)) continue;
    seen.add(ruleId);

    rules.push({
      id: ruleId,
      shortDescription: {
        text: RULE_DESCRIPTIONS[gate.id] || gate.title,
      },
    });
  }

  return rules;
}

/**
 * Convert gate results into SARIF result entries.
 * Only gates with status 'fail' produce error-level results.
 * Gates with status 'skip' produce note-level entries if they have issues.
 * Gates with status 'pass' are omitted entirely.
 * @param gateResults - Array of gate results from the pipeline
 * @returns SARIF result entries
 */
function buildResults(gateResults: GateResult[]): SarifResult[] {
  const results: SarifResult[] = [];

  for (const gate of gateResults) {
    if (gate.status === 'pass') continue;
    if (gate.status === 'skip' && gate.issues.length === 0) continue;

    const ruleId = `swarm/${gate.id}`;
    const level = statusToLevel(gate.status);

    if (gate.issues.length === 0) {
      // Gate failed/skipped but has no specific issues; emit a single project-level entry
      results.push({
        ruleId,
        message: { text: gate.title },
        level,
        locations: [{ physicalLocation: { artifactLocation: { uri: '.' } } }],
      });
      continue;
    }

    for (const issue of gate.issues) {
      results.push({
        ruleId,
        message: { text: issue.message },
        level,
        locations: [{ physicalLocation: buildLocation(issue) }],
      });
    }
  }

  return results;
}

/**
 * Format quality gate results as a SARIF 2.1.0 JSON log.
 * Produces output compatible with GitHub code scanning upload.
 * @param runResult - The complete gate run result from the pipeline
 * @param toolVersion - The swarm-orchestrator version from package.json
 * @returns SARIF JSON string
 */
export function formatSarif(runResult: QualityGatesRunResult, toolVersion: string): string {
  const allGates = runResult.results;
  const reportableGates = allGates.filter(
    g => g.status === 'fail' || (g.status === 'skip' && g.issues.length > 0)
  );

  const sarifLog: SarifLog = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: toolVersion,
            rules: buildRules(reportableGates),
          },
        },
        results: buildResults(allGates),
      },
    ],
  };

  return JSON.stringify(sarifLog, null, 2);
}
