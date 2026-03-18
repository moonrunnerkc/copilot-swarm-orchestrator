import { execSync } from 'child_process';

// Minimum copilot CLI version that supports /fleet
const MIN_FLEET_VERSION = '0.0.412';

// Session-level cache so we only shell out once per process
let fleetAvailableCache: boolean | null = null;

export class FleetWrapper {
  /**
   * Prefix a prompt with /fleet for Copilot CLI's native subagent dispatch.
   */
  static wrapPrompt(prompt: string): string {
    return `/fleet ${prompt}`;
  }

  /**
   * Check whether the installed copilot CLI supports /fleet.
   * Runs `copilot --version` once and caches the result for the process lifetime.
   */
  static isFleetAvailable(workingDir: string): boolean {
    if (fleetAvailableCache !== null) return fleetAvailableCache;

    try {
      const output = execSync('copilot --version', {
        cwd: workingDir,
        timeout: 5000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      fleetAvailableCache = FleetWrapper.versionSupportsFleet(output);
    } catch {
      // copilot binary not found or timed out; fleet unavailable
      fleetAvailableCache = false;
    }

    return fleetAvailableCache;
  }

  /**
   * Heuristic for how many subagents /fleet will spawn for a given task.
   * Feeds into the cost estimator's fleet-mode multiplier.
   * Returns 1-4.
   */
  static estimateSubagentCount(taskComplexity: string): number {
    const lower = taskComplexity.toLowerCase();

    const multiIndicators = [
      'multiple files', 'several files', 'all files',
      'each module', 'every module', 'across modules',
      'components', 'services', 'endpoints',
      'frontend and backend', 'client and server',
    ];
    const matchCount = multiIndicators.filter(phrase => lower.includes(phrase)).length;

    if (matchCount >= 3) return 4;
    if (matchCount >= 2) return 3;
    if (matchCount >= 1) return 2;

    // Check for list-like structure (commas separating distinct items)
    const commaSegments = taskComplexity.split(',').length;
    if (commaSegments >= 4) return 3;
    if (commaSegments >= 2) return 2;

    return 1;
  }

  /**
   * Parse a version string and compare against the minimum fleet version.
   * Handles formats like "0.0.415", "copilot version 0.0.415", etc.
   */
  static versionSupportsFleet(versionOutput: string): boolean {
    const match = versionOutput.match(/(\d+\.\d+\.\d+)/);
    if (!match) return false;

    const parts = match[1].split('.').map(Number);
    const minParts = MIN_FLEET_VERSION.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts[i] > minParts[i]) return true;
      if (parts[i] < minParts[i]) return false;
    }
    return true; // exact match
  }

  /**
   * Reset the session cache. Primarily for testing.
   */
  static resetCache(): void {
    fleetAvailableCache = null;
  }

  /**
   * Pre-seed the cache to a known value. Used in tests to avoid
   * shelling out to `copilot --version`.
   */
  static seedCache(available: boolean): void {
    fleetAvailableCache = available;
  }
}
