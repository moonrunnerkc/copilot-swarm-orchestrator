import * as fs from 'fs';
import * as path from 'path';
import { ExecutionPlan } from './plan-generator';

export class PlanStorage {
  private planDir: string;

  constructor(planDir?: string) {
    this.planDir = planDir || path.join(process.cwd(), 'plans');
  }

  ensurePlanDirectory(): void {
    if (!fs.existsSync(this.planDir)) {
      fs.mkdirSync(this.planDir, { recursive: true });
    }
  }

  savePlan(plan: ExecutionPlan, filename?: string): string {
    this.ensurePlanDirectory();

    const planFilename = filename || this.generatePlanFilename(plan);
    const planPath = path.join(this.planDir, planFilename);

    const planJson = JSON.stringify(plan, null, 2);
    fs.writeFileSync(planPath, planJson, 'utf8');

    return planPath;
  }

  loadPlan(filename: string): ExecutionPlan {
    const planPath = this.resolvePlanPath(filename);

    if (!fs.existsSync(planPath)) {
      throw new Error(`Plan file not found: ${planPath}`);
    }

    const content = fs.readFileSync(planPath, 'utf8');
    return JSON.parse(content) as ExecutionPlan;
  }

  listPlans(): string[] {
    if (!fs.existsSync(this.planDir)) {
      return [];
    }

    return fs.readdirSync(this.planDir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first
  }

  deletePlan(filename: string): void {
    const planPath = this.resolvePlanPath(filename);

    if (!fs.existsSync(planPath)) {
      throw new Error(`Plan file not found: ${planPath}`);
    }

    fs.unlinkSync(planPath);
  }

  private generatePlanFilename(plan: ExecutionPlan): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const goalSlug = plan.goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    return `plan-${timestamp}-${goalSlug}.json`;
  }

  getLatestPlan(): ExecutionPlan | null {
    const plans = this.listPlans();
    if (plans.length === 0) {
      return null;
    }

    const latestPlan = plans[0];
    if (!latestPlan) {
      return null;
    }

    return this.loadPlan(latestPlan);
  }

  private resolvePlanPath(planRef: string): string {
    // allow callers to pass either:
    // - a bare filename (resolved under planDir)
    // - a relative path (resolved from cwd)
    // - an absolute path
    if (path.isAbsolute(planRef)) {
      return planRef;
    }

    const looksLikePath = planRef.includes(path.sep) || planRef.startsWith('./') || planRef.startsWith('../');
    if (looksLikePath) {
      return path.resolve(process.cwd(), planRef);
    }

    return path.join(this.planDir, planRef);
  }
}

export default PlanStorage;
