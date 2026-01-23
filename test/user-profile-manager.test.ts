import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import UserProfileManager from '../src/user-profile-manager.js';
import { AgentProfile } from '../src/config-loader.js';

describe('UserProfileManager', () => {
  let tmpDir: string;
  let profileManager: UserProfileManager;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-profile-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    profileManager = new UserProfileManager(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create default profile if none exists', () => {
    const profile = profileManager.loadProfile();
    
    assert.strictEqual(profile.schemaVersion, 1);
    assert.ok(profile.preferences);
    assert.strictEqual(profile.preferences.commitStyle, 'mixed');
    assert.strictEqual(profile.preferences.verbosity, 'normal');
  });

  it('should persist profile to disk', () => {
    profileManager.loadProfile();
    
    const profilePath = path.join(tmpDir, 'user-profile.json');
    assert.ok(fs.existsSync(profilePath));

    const content = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    assert.strictEqual(content.schemaVersion, 1);
  });

  it('should load existing profile', () => {
    // Create a profile
    const profile = profileManager.loadProfile();
    profile.preferences.commitStyle = 'conventional';
    profileManager.saveProfile();

    // Create new manager instance
    const newManager = new UserProfileManager(tmpDir);
    const loaded = newManager.loadProfile();

    assert.strictEqual(loaded.preferences.commitStyle, 'conventional');
  });

  it('should update preferences', () => {
    profileManager.updatePreferences({
      commitStyle: 'imperative',
      verbosity: 'detailed'
    });

    const profile = profileManager.loadProfile();
    assert.strictEqual(profile.preferences.commitStyle, 'imperative');
    assert.strictEqual(profile.preferences.verbosity, 'detailed');
  });

  it('should update learned behaviors', () => {
    profileManager.updateLearnedBehaviors({
      averageRunTime: 180000,
      mostUsedAgents: ['FrontendExpert', 'BackendMaster'],
      commitFrequency: 2.5
    });

    const profile = profileManager.loadProfile();
    assert.ok(profile.learnedBehaviors);
    assert.strictEqual(profile.learnedBehaviors.averageRunTime, 180000);
    assert.strictEqual(profile.learnedBehaviors.mostUsedAgents?.length, 2);
    assert.strictEqual(profile.learnedBehaviors.commitFrequency, 2.5);
  });

  it('should apply commit style preference to agent instructions', () => {
    profileManager.updatePreferences({ commitStyle: 'conventional' });

    const agent: AgentProfile = {
      name: 'TestAgent',
      purpose: 'Test',
      scope: ['Testing'],
      boundaries: [],
      done_definition: [],
      refusal_rules: [],
      output_contract: { transcript: '', artifacts: [] }
    };

    const result = profileManager.applyToAgentInstructions(agent, 'Base instructions');

    assert.ok(result.instructions.includes('conventional commits'));
    assert.strictEqual(result.modifications.length, 2); // commit style + verbosity
    assert.ok(result.modifications[0].includes('conventional'));
  });

  it('should apply verbosity preference to agent instructions', () => {
    profileManager.updatePreferences({ verbosity: 'minimal' });

    const agent: AgentProfile = {
      name: 'TestAgent',
      purpose: 'Test',
      scope: ['Testing'],
      boundaries: [],
      done_definition: [],
      refusal_rules: [],
      output_contract: { transcript: '', artifacts: [] }
    };

    const result = profileManager.applyToAgentInstructions(agent, 'Base instructions');

    assert.ok(result.instructions.includes('minimal'));
    assert.ok(result.modifications.some(m => m.includes('minimal')));
  });

  it('should get agent priority', () => {
    profileManager.updatePreferences({
      agentPriorities: {
        'FrontendExpert': 8,
        'BackendMaster': 6,
        'TesterElite': 9
      }
    });

    assert.strictEqual(profileManager.getAgentPriority('FrontendExpert'), 8);
    assert.strictEqual(profileManager.getAgentPriority('BackendMaster'), 6);
    assert.strictEqual(profileManager.getAgentPriority('TesterElite'), 9);
    assert.strictEqual(profileManager.getAgentPriority('UnknownAgent'), 5); // default
  });

  it('should handle corrupted profile file', () => {
    const profilePath = path.join(tmpDir, 'user-profile.json');
    fs.writeFileSync(profilePath, 'invalid json{{{', 'utf8');

    const profile = profileManager.loadProfile();

    // Should fall back to defaults
    assert.strictEqual(profile.schemaVersion, 1);
    assert.strictEqual(profile.preferences.commitStyle, 'mixed');
  });

  it('should handle schema version mismatch', () => {
    const profilePath = path.join(tmpDir, 'user-profile.json');
    fs.writeFileSync(profilePath, JSON.stringify({
      schemaVersion: 999,
      preferences: { commitStyle: 'old' }
    }), 'utf8');

    const profile = profileManager.loadProfile();

    // Should reset to defaults
    assert.strictEqual(profile.schemaVersion, 1);
    assert.strictEqual(profile.preferences.commitStyle, 'mixed');
  });

  it('should provide different commit style guidance', () => {
    const agent: AgentProfile = {
      name: 'TestAgent',
      purpose: 'Test',
      scope: ['Testing'],
      boundaries: [],
      done_definition: [],
      refusal_rules: [],
      output_contract: { transcript: '', artifacts: [] }
    };

    // Test conventional
    profileManager.updatePreferences({ commitStyle: 'conventional' });
    let result = profileManager.applyToAgentInstructions(agent, '');
    assert.ok(result.instructions.includes('feat:'));

    // Test imperative
    profileManager.updatePreferences({ commitStyle: 'imperative' });
    result = profileManager.applyToAgentInstructions(agent, '');
    assert.ok(result.instructions.includes('Add feature'));

    // Test descriptive
    profileManager.updatePreferences({ commitStyle: 'descriptive' });
    result = profileManager.applyToAgentInstructions(agent, '');
    assert.ok(result.instructions.includes('descriptive'));

    // Test mixed
    profileManager.updatePreferences({ commitStyle: 'mixed' });
    result = profileManager.applyToAgentInstructions(agent, '');
    assert.ok(result.instructions.includes('Vary commit style'));
  });
});
