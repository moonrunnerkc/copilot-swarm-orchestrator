import * as path from 'path';
import RepoAnalyzer from './repo-analyzer';
import GitHubIssuesIngester from './github-issues-ingester';
import MultiRepoCoordinator from './multi-repo-coordinator';
import BootstrapEvidenceManager from './bootstrap-evidence';
import { PlanGenerator } from './plan-generator';
import { ConfigLoader } from './config-loader';
import {
  BootstrapAnalysisResult,
  AnnotatedPlanStep,
  SourceAnnotation
} from './bootstrap-types';
import { ExecutionPlan } from './plan-generator';

/**
 * Bootstrap Orchestrator - main entry point for bootstrap mode
 * Coordinates analysis, ingestion, and plan generation
 */
export class BootstrapOrchestrator {
  private repoAnalyzer: RepoAnalyzer;
  private issuesIngester: GitHubIssuesIngester;
  private multiRepoCoordinator: MultiRepoCoordinator;
  private evidenceManager: BootstrapEvidenceManager;
  private planGenerator: PlanGenerator;

  constructor() {
    this.repoAnalyzer = new RepoAnalyzer();
    this.issuesIngester = new GitHubIssuesIngester();
    this.multiRepoCoordinator = new MultiRepoCoordinator();
    this.evidenceManager = new BootstrapEvidenceManager();
    
    const configLoader = new ConfigLoader();
    const agents = configLoader.loadAllAgents();
    this.planGenerator = new PlanGenerator(agents);
  }

  /**
   * Execute full bootstrap analysis and plan generation
   */
  async bootstrap(
    repoPaths: string[],
    goal: string,
    runDir: string
  ): Promise<{ evidencePath: string; plan: ExecutionPlan & { steps: AnnotatedPlanStep[] } }> {
    console.log('🔍 Bootstrap Analysis Starting...\n');

    // Step 1: Analyze all repos
    console.log(`Analyzing ${repoPaths.length} repository(ies)...`);
    const repoAnalyses = await Promise.all(
      repoPaths.map(p => this.repoAnalyzer.analyzeRepo(p))
    );
    
    for (const analysis of repoAnalyses) {
      console.log(`  ✓ ${analysis.repoName}: ${analysis.languages.join(', ')}`);
      console.log(`    Build scripts: ${analysis.buildScripts.length}`);
      console.log(`    Test scripts: ${analysis.testScripts.length}`);
      console.log(`    Dependencies: ${analysis.dependencies.length}`);
      console.log(`    Tech debt markers: ${analysis.techDebtMarkers.length}`);
      console.log(`    Baseline concerns: ${analysis.baselineConcerns.length}`);
    }
    console.log();

    // Step 2: Identify cross-repo relationships
    console.log('Identifying cross-repo relationships...');
    const relationships = this.multiRepoCoordinator.identifyRelationships(repoAnalyses);
    console.log(`  Found ${relationships.length} relationship(s)`);
    for (const rel of relationships) {
      console.log(`    ${rel.sourceRepo} → ${rel.targetRepo} (${rel.type})`);
    }
    console.log();

    // Step 3: Ingest GitHub issues
    console.log('Fetching GitHub issues...');
    let allIssues: any[] = [];
    for (const repoPath of repoPaths) {
      const issues = await this.issuesIngester.fetchIssues(repoPath);
      allIssues.push(...issues);
    }
    console.log(`  Found ${allIssues.length} open issue(s)`);
    
    // Link relevant issues to goal
    const relevantIssues = this.issuesIngester.linkIssuesToTasks(allIssues, goal);
    console.log(`  ${relevantIssues.length} issue(s) relevant to goal`);
    for (const issue of relevantIssues.slice(0, 5)) {
      console.log(`    #${issue.number}: ${issue.title}`);
    }
    console.log();

    // Step 4: Build analysis result
    const analysisResult: BootstrapAnalysisResult = {
      repos: repoAnalyses,
      relationships,
      issues: relevantIssues,
      goal,
      analyzedAt: new Date().toISOString()
    };

    // Step 5: Generate annotated plan
    console.log('Generating execution plan...');
    const plan = this.generateAnnotatedPlan(goal, analysisResult);
    console.log(`  Generated ${plan.steps.length} step(s)`);
    console.log();

    // Step 6: Save evidence
    console.log('Saving bootstrap evidence...');
    const evidence = this.evidenceManager.createEvidence(goal, analysisResult, plan);
    const evidencePath = this.evidenceManager.saveEvidence(evidence, runDir);
    console.log(`  ✓ Evidence saved: ${evidencePath}`);
    console.log();

    console.log('✅ Bootstrap analysis complete!\n');

    return { evidencePath, plan };
  }

  /**
   * Generate plan with source annotations
   */
  private generateAnnotatedPlan(
    goal: string,
    analysis: BootstrapAnalysisResult
  ): ExecutionPlan & { steps: AnnotatedPlanStep[] } {
    // Use PlanGenerator to create base plan
    const basePlan = this.planGenerator.createPlan(goal);
    
    // Annotate steps with analysis evidence
    const annotatedSteps: AnnotatedPlanStep[] = basePlan.steps.map(step => {
      const annotations: SourceAnnotation[] = [];

      // Link to relevant issues
      for (const issue of analysis.issues) {
        if (this.isStepRelatedToIssue(step.task, issue.title)) {
          annotations.push({
            type: 'github_issue',
            reference: `#${issue.number}`,
            evidence: `Issue: ${issue.title} (${issue.url})`
          });
        }
      }

      // Link to tech debt if tester/security step
      if (step.agentName === 'tester_elite' || step.agentName === 'security_auditor') {
        const relevantDebt = analysis.repos.flatMap(r => r.techDebtMarkers).slice(0, 3);
        for (const debt of relevantDebt) {
          annotations.push({
            type: 'tech_debt',
            reference: debt.location,
            evidence: debt.evidence
          });
        }
      }

      // Link to build scripts if relevant
      if (step.task.toLowerCase().includes('build') || step.task.toLowerCase().includes('compile')) {
        const buildScripts = analysis.repos.flatMap(r => r.buildScripts);
        for (const script of buildScripts) {
          annotations.push({
            type: 'build_script',
            reference: script.source,
            evidence: `Build command: ${script.command}`
          });
        }
      }

      return {
        ...step,
        sourceAnnotations: annotations
      };
    });

    return {
      ...basePlan,
      steps: annotatedSteps
    };
  }

  private isStepRelatedToIssue(task: string, issueTitle: string): boolean {
    const taskWords = task.toLowerCase().split(/\s+/);
    const issueWords = issueTitle.toLowerCase().split(/\s+/);
    
    // Simple keyword overlap check
    const overlap = taskWords.filter(w => w.length > 3 && issueWords.includes(w));
    return overlap.length >= 2;
  }
}

export default BootstrapOrchestrator;
