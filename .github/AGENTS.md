# GitHub Copilot Custom Agents

This repository defines specialized Copilot custom agents for the **Swarm Orchestrator** - enabling true parallel AI workflows with natural, incremental git commits.

## Available Agents

All agents are located in `.github/agents/` and follow the official Copilot custom agent format.

### 🎨 FrontendExpert
**File**: `.github/agents/frontend-expert.agent.md`  
**Purpose**: UI components, styling, and client-side logic  
**Domains**: React, Vue, Angular, HTML, CSS, JavaScript, TypeScript  
**Key Feature**: Natural incremental commits for frontend changes

### 🔧 BackendMaster
**File**: `.github/agents/backend-master.agent.md`  
**Purpose**: Server-side logic, APIs, and data processing  
**Domains**: Node.js, Python, Go, Java, databases, API design  
**Key Feature**: Descriptive commits for backend implementations

### 🚀 DevOpsPro
**File**: `.github/agents/devops-pro.agent.md`  
**Purpose**: CI/CD, deployment, and infrastructure  
**Domains**: GitHub Actions, Docker, Kubernetes, Terraform  
**Key Feature**: Professional commits for infrastructure changes

### 🔒 SecurityAuditor
**File**: `.github/agents/security-auditor.agent.md`  
**Purpose**: Security analysis and vulnerability fixes  
**Domains**: OWASP, security scanning, dependency auditing  
**Key Feature**: Clear security-focused commit messages

### ✅ TesterElite
**File**: `.github/agents/tester-elite.agent.md`  
**Purpose**: Test creation, execution, and quality assurance  
**Domains**: Jest, Mocha, Pytest, Cypress, coverage analysis  
**Key Feature**: Test-focused commits with clear intent

### 🔗 IntegratorFinalizer
**File**: `.github/agents/integrator-finalizer.agent.md`  
**Purpose**: Component integration and release preparation  
**Domains**: E2E testing, documentation, release management  
**Key Feature**: Preserves natural git history from all agents

## Using Custom Agents

### With Copilot CLI

```bash
# Use a specific agent
copilot -p "your task" --agent frontend_expert

# Agents auto-infer from context when appropriate
copilot
```

### With Swarm Orchestrator

```bash
# Agents are automatically assigned based on task analysis
npm run orchestrator -- plan "Build todo app with auth"

# Manual agent assignment in YAML plan
agents assign step-1 frontend_expert
```

## Agent Configuration Format

Each agent file follows this structure:

```yaml
---
name: agent_name
description: "Short description"
target: github-copilot
tools: [read, edit, run, search]
infer: true
metadata:
  team: "Engineering Team"
  scope: "Responsibility area"
---

# Agent Instructions

Detailed instructions, workflows, and examples...
```

## Commit Message Philosophy

**All agents are trained to produce human-like, incremental git commits:**

✅ **Good (Natural, Human-Like):**
```
add user profile component
fix: button alignment issue
update dependencies and config
implement todo API with tests
```

❌ **Bad (AI-Pattern, Perfect):**
```
feat(components): Implement comprehensive user profile component with full accessibility support and test coverage
```

## Creating Custom Agents

1. Copy one of the existing `.agent.md` files as a template
2. Update the YAML frontmatter (name, description, tools, metadata)
3. Write detailed instructions including:
   - Scope and boundaries
   - Done definition
   - Git commit guidelines with examples
   - Hard rules and refusal conditions
4. Save to `.github/agents/your-agent.agent.md`
5. Add entry to this AGENTS.md file

## Agent Discovery

Copilot CLI discovers agents in this order:
1. **Repository**: `.github/agents/` (highest priority)
2. **Organization**: Org's `.github` repo
3. **User**: `~/.copilot/agents/`

## Best Practices

- **Be specific**: Define precise scope and boundaries
- **Provide examples**: Show expected output and commit messages
- **Set boundaries**: List what the agent should NOT do
- **Enable inference**: Set `infer: true` for automatic context-based routing
- **Natural commits**: Emphasize human-like, incremental commit behavior

## User Extensibility

You can add your own custom agents by:

1. Creating `.github/agents/my-agent.agent.md`
2. Following the format above
3. Agents are automatically loaded by the orchestrator

**Alternatively**, define agents in `config/user-agents.yaml` for YAML-only workflows (legacy support).

## Learn More

- [GitHub Docs: Custom Agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [How to Write Great AGENTS.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)
- [Copilot CLI Documentation](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)

---

**Note**: This orchestrator's unique feature is **coordinating parallel sessions** with **natural incremental commits** from multiple specialized agents working concurrently.
