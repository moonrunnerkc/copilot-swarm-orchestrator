import { spawn } from 'child_process';
import { GitHubIssueReference } from './bootstrap-types';

/**
 * GitHub Issues Ingester - fetch open issues via gh CLI
 * Only used if gh CLI is available and repo has .git directory
 */
export class GitHubIssuesIngester {
  
  /**
   * Check if gh CLI is available
   */
  async isGhCliAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', ['gh']);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Fetch open issues for a repository
   */
  async fetchIssues(repoPath: string): Promise<GitHubIssueReference[]> {
    const ghAvailable = await this.isGhCliAvailable();
    if (!ghAvailable) {
      console.warn('gh CLI not available, skipping issue ingestion');
      return [];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('gh', ['issue', 'list', '--json', 'number,title,url,labels,createdAt', '--limit', '50'], {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.warn(`gh issue list failed: ${stderr}`);
          resolve([]);
          return;
        }

        try {
          const rawIssues = JSON.parse(stdout);
          const issues: GitHubIssueReference[] = rawIssues.map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            url: issue.url,
            labels: issue.labels?.map((l: any) => l.name || l) || [],
            repoName: this.extractRepoName(issue.url),
            createdAt: issue.createdAt
          }));
          
          resolve(issues);
        } catch (error) {
          console.warn(`Failed to parse gh issue output: ${error}`);
          resolve([]);
        }
      });
    });
  }

  /**
   * Extract repo name from GitHub URL
   */
  private extractRepoName(url: string): string {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Link issues to plan context based on keywords
   */
  linkIssuesToTasks(issues: GitHubIssueReference[], goal: string): GitHubIssueReference[] {
    // Simple keyword matching - find issues relevant to goal
    const goalKeywords = goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    return issues.filter(issue => {
      const searchText = `${issue.title} ${issue.labels.join(' ')}`.toLowerCase();
      return goalKeywords.some(keyword => searchText.includes(keyword));
    });
  }
}

export default GitHubIssuesIngester;
