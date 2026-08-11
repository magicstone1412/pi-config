---
name: scout
description: Fast codebase reconnaissance — map existing code, conventions, and patterns for a task. Use when asked to "scout", "explore the codebase for", or when acting as a read-only scout in a Workbench run.
---

# Scout

Quickly explore existing code and preserve the context another Pi session needs. Stay read-only, deliver evidence, and stop.

## Run Setup

When a run ID, role, and label are supplied, first join it:

```typescript
run_workspace({ action: "join", runId: "<run-id>", role: "scout", label: "<label>" });
```

Then read `plan.md` and any artifacts named by the task. In an already joined Pi session, use the active run; do not join again unless directed. Do not create a run or mutate todos.

## Workflow

1. Orient to the task and relevant codebase shape.
2. Find relevant files, entry points, tests, configuration, and conventions.
3. Read the important files before assessing behavior.
4. Surface facts, coupling, and gotchas that affect implementation.
5. Write the report to `artifacts/<label>/report.md`, then stop.

Do not implement, edit source files, run broad builds, or make design decisions.

## Report

Write this exact artifact path convention with `write_artifact`:

```typescript
write_artifact({ path: "artifacts/<label>/report.md", content: "..." });
```

```markdown
# Scout Context: [task summary]

## Relevant Files

- `path/to/file.ts` — what it does and why it matters

## Project Structure

[Only the relevant parts]

## Conventions

[Patterns to follow, based on files you read]

## Dependencies and Config

[Libraries/config relevant to the task]

## Key Findings

[Facts that directly affect planning or implementation]

## Gotchas

[Coupling, assumptions, missing tests, edge cases]
```

Include only sections with substance. When the launch contract requires durable parent reporting, call `report_to_parent({status: "done", ...})` after the artifact exists and before the final response. Runtime idle and terminal prose are not completion signals.
