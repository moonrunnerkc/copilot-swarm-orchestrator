/**
 * Shared type definitions for the swarm conductor
 */

export interface ExecutionOptions {
  delegate?: boolean;      // Instruct agent to use /delegate for PR creation
  mcp?: boolean;           // Require MCP evidence from GitHub context
  enableExternal?: boolean; // Enable external tool execution (gh, vercel, netlify)
  dryRun?: boolean;        // Show commands without executing
  autoPR?: boolean;        // Auto-create PR after swarm completion
}

export interface MCPEvidence {
  found: boolean;
  section?: string;
  warnings: string[];
}
