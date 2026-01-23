# Phase 3 Proof: Plan Generation System

**Date:** 2026-01-23  
**Repository:** moonrunnerkc/copilot-swarm-conductor  
**Phase:** 3 - Plan generation and storage

## Overview

Phase 3 implements the plan generation system that takes a high-level goal and creates a structured, sequential execution plan with agent assignments, dependencies, and expected outputs.

## Components Implemented

### 1. PlanGenerator (`src/plan-generator.ts`)

Core planning engine with the following capabilities:

- **createPlan()** - Generate execution plan from a goal
- **assignAgent()** - Keyword-based agent assignment (placeholder for AI decision)
- **getExecutionOrder()** - Topological sort for dependency resolution
- **Validation** - Ensures agents exist and dependencies are valid

Key features:
- Validates all assigned agents exist in config
- Detects circular dependencies
- Validates forward dependencies (steps can only depend on prior steps)
- Generates execution order respecting dependencies

### 2. PlanStorage (`src/plan-storage.ts`)

Persistent storage for execution plans:

- **savePlan()** - Save plan to JSON file
- **loadPlan()** - Load plan from file
- **listPlans()** - List all saved plans
- **deletePlan()** - Remove a plan
- **getLatestPlan()** - Retrieve most recent plan

Features:
- Auto-generates filenames from goals (slugified)
- Stores plans as formatted JSON for readability
- Maintains plans directory automatically

### 3. CLI Command (`src/cli.ts`)

Command-line interface for plan generation:

```bash
swarm-conductor plan <goal>
```

The CLI:
1. Loads all available agent profiles
2. Displays loaded agents
3. Generates execution plan
4. Shows plan details with dependencies
5. Displays execution order
6. Saves plan to disk
7. Provides next step instructions

### 4. Plan Structure

Each plan contains:

```typescript
interface ExecutionPlan {
  goal: string;
  createdAt: string;
  steps: PlanStep[];
  metadata: {
    totalSteps: number;
    estimatedDuration?: string;
  };
}

interface PlanStep {
  stepNumber: number;
  agentName: string;
  task: string;
  dependencies: number[];
  expectedOutputs: string[];
}
```

## Test Results

**47 tests passing:**

```
PlanGenerator
  createPlan
    ✔ should create a plan with a goal
    ✔ should reject empty goal
    ✔ should trim whitespace from goal
    ✔ should create plan with custom steps
    ✔ should set totalSteps in metadata
  validation
    ✔ should reject unknown agent assignment
    ✔ should reject invalid dependency reference
    ✔ should reject forward dependency
  assignAgent
    ✔ should assign FrontendExpert for UI tasks
    ✔ should assign BackendMaster for API tasks
    ✔ should assign DevOpsPro for deployment tasks
    ✔ should assign SecurityAuditor for security tasks
    ✔ should assign TesterElite for testing tasks
    ✔ should assign IntegratorFinalizer as fallback
  getExecutionOrder
    ✔ should return correct order for linear dependencies
    ✔ should handle parallel steps (no dependencies)
    ✔ should handle complex dependency graph
    ✔ should detect circular dependencies

PlanStorage
  ensurePlanDirectory
    ✔ should create plan directory if it does not exist
    ✔ should not fail if directory already exists
  savePlan
    ✔ should save plan to file
    ✔ should save plan with custom filename
    ✔ should generate filename from goal
    ✔ should save valid JSON
  loadPlan
    ✔ should load saved plan
    ✔ should throw error if plan file does not exist
  listPlans
    ✔ should return empty array if no plans exist
    ✔ should list all plan files
    ✔ should only list JSON files
  deletePlan
    ✔ should delete plan file
    ✔ should throw error if plan does not exist
  getLatestPlan
    ✔ should return null if no plans exist
    ✔ should return most recent plan

47 passing (30ms)
```

## CLI Demonstration

Command executed:
```bash
$ node dist/src/cli.js plan "Build a user authentication system"
```

Output:
```
Copilot Swarm Conductor - Plan Generation

Goal: Build a user authentication system

Loaded 6 agent profiles:
  - FrontendExpert: Implement UI components, styles, and frontend logic
  - BackendMaster: Implement server-side logic, APIs, and data processing
  - DevOpsPro: Configure CI/CD, deployment, infrastructure, and build processes
  - SecurityAuditor: Review code for security vulnerabilities and best practices
  - TesterElite: Write and execute tests, verify quality and coverage
  - IntegratorFinalizer: Integrate components, verify end-to-end functionality, finalize deliverables

Generated Execution Plan:
========================

Step 1: Design and implement core API structure
  Agent: BackendMaster
  Expected outputs:
    - API endpoint definitions
    - Database schema
    - Test results

Step 2: Review API security and authentication
  Agent: SecurityAuditor
  Dependencies: Steps 1
  Expected outputs:
    - Security audit report
    - Fixed vulnerabilities

Step 3: Create comprehensive test suite
  Agent: TesterElite
  Dependencies: Steps 1, 2
  Expected outputs:
    - Test files
    - Coverage report
    - Test execution results

Step 4: Verify integration and prepare documentation
  Agent: IntegratorFinalizer
  Dependencies: Steps 1, 2, 3
  Expected outputs:
    - Integration test results
    - API documentation
    - Release notes

Execution Order: 1 → 2 → 3 → 4

✓ Plan saved to: plans/plan-2026-01-23T00-07-02-308Z-build-a-user-authentication-system.json
```

## Dependency Resolution Example

The system correctly handles complex dependency graphs:

**Linear dependencies:** 1 → 2 → 3 (sequential)  
**Parallel steps:** 1, 2 (both have no dependencies, can run concurrently in theory)  
**Multi-dependency:** Step 3 depends on [1, 2] (waits for both)  
**Circular detection:** Throws error if A depends on B and B depends on A

## Agent Assignment Logic

Current implementation uses keyword matching (placeholder for AI):

| Keywords | Agent Assigned |
|----------|---------------|
| api, backend, server | BackendMaster |
| ui, frontend, component | FrontendExpert |
| deploy, ci, docker | DevOpsPro |
| security, vulnerability | SecurityAuditor |
| test, quality | TesterElite |
| (fallback) | IntegratorFinalizer |

**Note:** In production, this would be replaced by Copilot CLI decision-making.

## Plan Storage Format

Plans are saved as readable JSON:

```json
{
  "goal": "Build a user authentication system",
  "createdAt": "2026-01-23T00:07:02.308Z",
  "steps": [
    {
      "stepNumber": 1,
      "agentName": "BackendMaster",
      "task": "Design and implement core API structure",
      "dependencies": [],
      "expectedOutputs": [
        "API endpoint definitions",
        "Database schema",
        "Test results"
      ]
    }
  ],
  "metadata": {
    "totalSteps": 4
  }
}
```

## Validation Coverage

The system validates:

1. **Goal is non-empty** - Cannot create plan without a goal
2. **Assigned agents exist** - All agents must be defined in config
3. **Dependencies are valid** - Referenced steps must exist
4. **No forward dependencies** - Step N cannot depend on step N+1
5. **No circular dependencies** - Detected during execution order calculation
6. **File operations** - Handles missing files, directory creation

## Why This Matters

Phase 3 establishes the **contract** between the user and the AI workflow:

- User provides high-level goal
- System generates structured plan
- Each step has clear agent, task, and outputs
- Dependencies ensure correct execution order
- Plan is saved and auditable

This is not "AI magic." This is **structured workflow planning with validation**.

## Proof Gates Met

✅ **PlanGenerator implemented** - Creates and validates plans  
✅ **PlanStorage implemented** - Saves/loads plans to disk  
✅ **CLI command working** - `swarm-conductor plan <goal>`  
✅ **47 tests passing** - Comprehensive validation coverage  
✅ **Dependency resolution** - Topological sort with circular detection  
✅ **Agent validation** - Only assigns existing agents  
✅ **JSON storage** - Human-readable, version-controllable plans  

## Files Created

- `src/plan-generator.ts` (4,333 bytes) - Plan generation engine
- `src/plan-storage.ts` (2,071 bytes) - Plan persistence layer
- `src/cli.ts` (4,300 bytes) - Command-line interface
- `test/plan-generator.test.ts` (8,389 bytes) - Generator tests
- `test/plan-storage.test.ts` (6,747 bytes) - Storage tests

## Evidence for DEV Post

**Command output showing plan generation:**
```
Loaded 6 agent profiles
Generated Execution Plan: 4 steps
Execution Order: 1 → 2 → 3 → 4
✓ Plan saved to: plans/plan-2026-01-23T00-07-02-308Z...
```

**Test output showing validation:**
```
✔ should reject unknown agent assignment
✔ should reject invalid dependency reference
✔ should detect circular dependencies
```

---

**Phase 3 Complete** ✅  
Ready for Phase 4: Step Execution and Context Handoff
