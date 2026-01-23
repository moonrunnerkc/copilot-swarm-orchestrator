import * as fs from 'fs';
import * as path from 'path';
import { BootstrapAnalysisResult, AnnotatedPlanStep } from './bootstrap-types';
import { ExecutionPlan } from './plan-generator';

export interface BootstrapEvidence {
  schemaVersion: string;
  goal: string;
  analyzedRepos: string[];
  analysisResult: BootstrapAnalysisResult;
  generatedPlan: ExecutionPlan & { steps: AnnotatedPlanStep[] };
  createdAt: string;
}

/**
 * Bootstrap Evidence Manager - persist and load bootstrap artifacts
 */
export class BootstrapEvidenceManager {
  private schemaVersion = '1.0.0';

  /**
   * Save bootstrap evidence to runs/ directory
   */
  saveEvidence(evidence: BootstrapEvidence, runDir: string): string {
    const evidenceDir = path.join(runDir, 'bootstrap');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const evidencePath = path.join(evidenceDir, 'analysis.json');
    
    const json = JSON.stringify(evidence, null, 2);
    fs.writeFileSync(evidencePath, json, 'utf8');

    return evidencePath;
  }

  /**
   * Load bootstrap evidence
   */
  loadEvidence(runDir: string): BootstrapEvidence {
    const evidencePath = path.join(runDir, 'bootstrap', 'analysis.json');
    
    if (!fs.existsSync(evidencePath)) {
      throw new Error(`Bootstrap evidence not found: ${evidencePath}`);
    }

    const content = fs.readFileSync(evidencePath, 'utf8');
    const evidence = JSON.parse(content) as BootstrapEvidence;

    // Validate schema version
    if (evidence.schemaVersion !== this.schemaVersion) {
      throw new Error(`Schema version mismatch: expected ${this.schemaVersion}, got ${evidence.schemaVersion}`);
    }

    return evidence;
  }

  /**
   * Create evidence object from analysis and plan
   */
  createEvidence(
    goal: string,
    analysisResult: BootstrapAnalysisResult,
    plan: ExecutionPlan & { steps: AnnotatedPlanStep[] }
  ): BootstrapEvidence {
    return {
      schemaVersion: this.schemaVersion,
      goal,
      analyzedRepos: analysisResult.repos.map(r => r.repoPath),
      analysisResult,
      generatedPlan: plan,
      createdAt: new Date().toISOString()
    };
  }
}

export default BootstrapEvidenceManager;
