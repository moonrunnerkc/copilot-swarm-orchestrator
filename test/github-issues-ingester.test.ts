import * as assert from 'assert';
import GitHubIssuesIngester from '../src/github-issues-ingester';

describe('GitHubIssuesIngester', () => {
  let ingester: GitHubIssuesIngester;

  beforeEach(() => {
    ingester = new GitHubIssuesIngester();
  });

  it('should check if gh CLI is available', async () => {
    const available = await ingester.isGhCliAvailable();
    // Will be true or false depending on system, just verify it doesn't throw
    assert.strictEqual(typeof available, 'boolean');
  });

  it('should link issues to tasks by keyword', () => {
    const issues = [
      {
        number: 1,
        title: 'Add user authentication',
        url: 'https://github.com/test/repo/issues/1',
        labels: ['enhancement'],
        repoName: 'test/repo',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        number: 2,
        title: 'Fix button styling',
        url: 'https://github.com/test/repo/issues/2',
        labels: ['bug'],
        repoName: 'test/repo',
        createdAt: '2024-01-02T00:00:00Z'
      }
    ];

    const goal = 'Build authentication system for user login';
    const linked = ingester.linkIssuesToTasks(issues, goal);

    assert.ok(linked.find(i => i.number === 1), 'Should link auth issue');
    assert.strictEqual(linked.find(i => i.number === 2), undefined, 'Should not link styling issue');
  });
});
