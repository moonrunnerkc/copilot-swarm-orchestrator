import * as fs from 'fs';
import * as path from 'path';

export interface ShareTranscript {
  stepNumber: number;
  agentName: string;
  transcriptPath: string;
  rawContent: string;
  parsedAt: string;
}

export interface ShareIndex {
  changedFiles: string[];
  commandsExecuted: string[];
  testsRun: {
    command: string;
    verified: boolean;
    reason?: string;
  }[];
  prLinks: string[];
  claims: {
    claim: string;
    verified: boolean;
    evidence?: string;
  }[];
}

export class ShareParser {
  /**
   * parse /share transcript and extract key facts
   */
  parse(content: string): ShareIndex {
    const index: ShareIndex = {
      changedFiles: [],
      commandsExecuted: [],
      testsRun: [],
      prLinks: [],
      claims: []
    };

    const lines = content.split('\n');

    // extract changed files
    index.changedFiles = this.extractChangedFiles(lines);

    // extract commands executed
    index.commandsExecuted = this.extractCommands(lines);

    // extract test runs
    index.testsRun = this.extractTestRuns(lines, index.commandsExecuted);

    // extract PR links
    index.prLinks = this.extractPRLinks(lines);

    // extract and verify claims
    index.claims = this.extractClaims(lines, index);

    return index;
  }

  private extractChangedFiles(lines: string[]): string[] {
    const files = new Set<string>();

    // look for git status output
    let inGitStatus = false;
    for (const line of lines) {
      if (line.includes('git status') || line.includes('git diff')) {
        inGitStatus = true;
        continue;
      }

      if (inGitStatus) {
        // match modified files
        const modifiedMatch = line.match(/^\s*modified:\s+(.+)$/);
        if (modifiedMatch && modifiedMatch[1]) {
          files.add(modifiedMatch[1].trim());
        }

        // match new files
        const newFileMatch = line.match(/^\s*new file:\s+(.+)$/);
        if (newFileMatch && newFileMatch[1]) {
          files.add(newFileMatch[1].trim());
        }

        // match deleted files
        const deletedMatch = line.match(/^\s*deleted:\s+(.+)$/);
        if (deletedMatch && deletedMatch[1]) {
          files.add(deletedMatch[1].trim());
        }

        // end of git status block
        if (line.trim() === '' || line.includes('$') || line.includes('>')) {
          inGitStatus = false;
        }
      }

      // also look for explicit file mentions in code blocks
      const filePathMatch = line.match(/^[\s]*(?:edited|created|modified|deleted):\s+([^\s]+\.[a-z]+)/i);
      if (filePathMatch && filePathMatch[1]) {
        files.add(filePathMatch[1]);
      }
    }

    return Array.from(files);
  }

  private extractCommands(lines: string[]): string[] {
    const commands: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // look for command prompts
      if (line.match(/^[\$>]\s+/) || line.match(/^npm\s+/) || line.match(/^git\s+/)) {
        const cmd = line.replace(/^[\$>]\s+/, '').trim();
        if (cmd) {
          commands.push(cmd);
        }
      }

      // look for commands in code blocks
      if (line.includes('```') && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && (nextLine.startsWith('$') || nextLine.startsWith('npm') || nextLine.startsWith('git'))) {
          const cmd = nextLine.replace(/^[\$>]\s+/, '').trim();
          if (cmd) {
            commands.push(cmd);
          }
        }
      }
    }

    return commands;
  }

  private extractTestRuns(lines: string[], commands: string[]): ShareIndex['testsRun'] {
    const testRuns: ShareIndex['testsRun'] = [];

    // find test commands
    const testCommands = commands.filter(cmd =>
      cmd.includes('test') ||
      cmd.includes('jest') ||
      cmd.includes('mocha') ||
      cmd.includes('pytest') ||
      cmd.includes('go test') ||
      cmd.includes('cargo test')
    );

    for (const cmd of testCommands) {
      // verify test actually ran by looking for output
      const hasOutput = this.hasTestOutput(lines, cmd);

      if (hasOutput) {
        testRuns.push({
          command: cmd,
          verified: true
        });
      } else {
        testRuns.push({
          command: cmd,
          verified: false,
          reason: 'no test output found in transcript'
        });
      }
    }

    return testRuns;
  }

  private hasTestOutput(lines: string[], testCommand: string): boolean {
    // look for common test output patterns after the command
    const cmdIndex = lines.findIndex(line => line.includes(testCommand));
    if (cmdIndex === -1) return false;

    // check next 50 lines for test output
    const outputLines = lines.slice(cmdIndex + 1, cmdIndex + 51);

    for (const line of outputLines) {
      // mocha/jest patterns
      if (line.match(/\d+\s+passing/)) return true;
      if (line.match(/\d+\s+tests?\s+passed/)) return true;

      // pytest patterns
      if (line.match(/\d+\s+passed/)) return true;

      // go test patterns
      if (line.match(/PASS/)) return true;
      if (line.match(/ok\s+/)) return true;

      // generic success patterns
      if (line.match(/all tests passed/i)) return true;
    }

    return false;
  }

  private extractPRLinks(lines: string[]): string[] {
    const links = new Set<string>();

    for (const line of lines) {
      // github PR URLs
      const prMatch = line.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/g);
      if (prMatch) {
        prMatch.forEach(url => links.add(url));
      }

      // shortened PR references
      const shortMatch = line.match(/#(\d+)/g);
      if (shortMatch) {
        // note: we can't construct full URL without repo context
        // so we just note the PR number
        shortMatch.forEach(ref => links.add(ref));
      }
    }

    return Array.from(links);
  }

  private extractClaims(lines: string[], index: ShareIndex): ShareIndex['claims'] {
    const claims: ShareIndex['claims'] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // check for test passing claims
      if (lowerLine.includes('tests pass') ||
          lowerLine.includes('all tests passed') ||
          lowerLine.includes('tests are passing')) {

        const hasVerifiedTests = index.testsRun.some(t => t.verified);

        claims.push({
          claim: line.trim(),
          verified: hasVerifiedTests,
          evidence: hasVerifiedTests
            ? `verified test command: ${index.testsRun.find(t => t.verified)?.command}`
            : 'no test execution found in transcript'
        });
      }

      // check for build success claims
      if (lowerLine.includes('build succeed') ||
          lowerLine.includes('build passed') ||
          lowerLine.includes('compiled successfully')) {

        const hasBuildCommand = index.commandsExecuted.some(cmd =>
          cmd.includes('build') || cmd.includes('compile') || cmd.includes('tsc')
        );

        claims.push({
          claim: line.trim(),
          verified: hasBuildCommand,
          evidence: hasBuildCommand
            ? `verified build command: ${index.commandsExecuted.find(cmd => cmd.includes('build'))}`
            : 'no build command found in transcript'
        });
      }

      // check for deployment claims
      if (lowerLine.includes('deployed') ||
          lowerLine.includes('deployment succeeded')) {

        const hasDeployCommand = index.commandsExecuted.some(cmd =>
          cmd.includes('deploy') || cmd.includes('publish')
        );

        claims.push({
          claim: line.trim(),
          verified: hasDeployCommand,
          evidence: hasDeployCommand
            ? 'verified deployment command found'
            : 'no deployment command found in transcript'
        });
      }
    }

    return claims;
  }
}

export default ShareParser;
