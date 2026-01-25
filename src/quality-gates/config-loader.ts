import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { DEFAULT_QUALITY_GATES_CONFIG } from './default-config';
import { QualityGatesConfig } from './types';

function is_object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge_config(base: QualityGatesConfig, override: Partial<QualityGatesConfig>): QualityGatesConfig {
  const merged: QualityGatesConfig = {
    ...base,
    ...override,
    gates: {
      ...base.gates,
      ...(override.gates || {})
    }
  };

  // deep merge for each gate
  merged.gates = {
    scaffoldDefaults: { ...base.gates.scaffoldDefaults, ...(override.gates?.scaffoldDefaults || {}) },
    duplicateBlocks: { ...base.gates.duplicateBlocks, ...(override.gates?.duplicateBlocks || {}) },
    hardcodedConfig: { ...base.gates.hardcodedConfig, ...(override.gates?.hardcodedConfig || {}) },
    readmeClaims: { ...base.gates.readmeClaims, ...(override.gates?.readmeClaims || {}) },
    testIsolation: { ...base.gates.testIsolation, ...(override.gates?.testIsolation || {}) }
  };

  return merged;
}

export function load_quality_gates_config(projectRoot: string, explicitPath?: string): QualityGatesConfig {
  const candidatePaths: string[] = [];

  if (explicitPath) {
    candidatePaths.push(path.isAbsolute(explicitPath) ? explicitPath : path.join(projectRoot, explicitPath));
  }

  candidatePaths.push(path.join(projectRoot, 'config', 'quality-gates.yaml'));

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const raw = fs.readFileSync(candidate, 'utf8');
    const parsed = yaml.load(raw);

    if (!is_object(parsed)) {
      throw new Error(`quality gates config must be a YAML object: ${candidate}`);
    }

    return merge_config(DEFAULT_QUALITY_GATES_CONFIG, parsed as Partial<QualityGatesConfig>);
  }

  return DEFAULT_QUALITY_GATES_CONFIG;
}
