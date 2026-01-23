/**
 * Shared type definitions for the swarm conductor
 */

export interface ExecutionOptions {
  delegate?: boolean;  // Instruct agent to use /delegate for PR creation
  mcp?: boolean;       // Require MCP evidence from GitHub context
}

export interface MCPEvidence {
  found: boolean;
  section?: string;
  warnings: string[];
}
