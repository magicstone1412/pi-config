---
name: write-todos
description: Write clear Workbench todos that workers can execute without losing architectural intent. Use when asked to "create todos", "write todos", "break into tasks", "plan todos", or create work items from a plan.
---

# Write Workbench Todos

Write durable Workbench todos that a worker can execute from the todo body, `plan.md`, referenced artifacts, and source files. Every todo must preserve the architectural intent from the plan.

## Run Setup

The coordinator creates or joins the Workbench run before creating todos. A directly launched coordinator session that is already joined uses its active run. Write the selected plan to `plan.md` before creating todos.

Create each item with:

```typescript
todo({
  action: "create",
  title: "Short outcome",
  body: "...",
  priority: "high",
  tags: ["plan-tag"],
  dependsOn: ["TODO-001"]
})
```

Use `dependsOn: []` when there are no dependencies. Todo IDs are assigned by Workbench; record them in dependent todo bodies after creation if helpful.

## Todo Body Template

```markdown
**Run plan:** `plan.md`
**Relevant artifacts:** `artifacts/<label>/report.md` or "none"
**Depends on:** TODO-001 or "none"

## Outcome
[One paragraph: what this todo produces and why]

## Constraints
- [Architectural constraints]
- [Libraries/patterns to use]
- [Explicit anti-patterns to avoid]

## Files
- `path/to/file` — [what changes]

## References
- `path/to/example.ts:10-45` — [pattern to follow]

## Expected Shape
```typescript
// Short code sketch when no existing reference is sufficient
```

## Acceptance Criteria
- [ ] [Specific, verifiable criterion]
- [ ] `<command>` passes
```

## Rules

- Repeat every relevant plan decision in the body; workers must not infer constraints.
- Include an inline code sketch or a precise existing source reference.
- Name plausible wrong approaches explicitly.
- Keep one todo to one focused worker session. Source-writing todos are sequential in one shared worktree unless the human explicitly authorizes managed worktrees.
- Use dependencies for ordering; workers cannot claim an item until its dependencies complete.
- Make acceptance criteria objective, with commands, file checks, API results, or exact behavior.
- Require every worker to join the run, claim exactly one todo, write `artifacts/<label>/result.md`, record verification, then complete or block it.

Before creating each todo, verify it is independently implementable, references `plan.md`, states dependencies, includes constraints and a source reference or sketch, and has objective acceptance criteria.
