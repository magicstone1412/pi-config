---
name: write-todos
description: Convert a selected Markdown plan into clear, dependency-ordered Markdown todos. Use for /todos, breaking plans into tasks, or updating execution status from coordinator evidence.
---

# Write Todos

Read the absolute plan path supplied by the caller. Write only the supplied todos path; do not implement work or launch agents.

## Rules

- Preserve the plan's architecture, scope, exclusions, and acceptance criteria.
- Use stable sequential IDs (`TODO-001`, `TODO-002`, ...). When updating an existing file, preserve IDs and completed evidence.
- Make each source-writing todo fit one focused worker and one commit.
- Source-writing todos must be dependency ordered because workers share one checkout and run sequentially.
- Repeat the constraints a worker needs; do not make it infer critical intent.
- Name target files, useful source references, objective checks, and plausible wrong approaches.
- Only the coordinator updates status, owner, commit, verification, and result fields. Delegated agents read this file but never edit it.

## File Format

```markdown
# Execution Todos

**Status:** Pending | In Progress | Complete | Blocked
**Plan:** `/absolute/path/to/session.plan.md`
**Updated:** [ISO-8601 timestamp]

## TODO-001 — [outcome]

**Status:** Pending | In Progress | Complete | Blocked
**Depends on:** none | TODO-NNN
**Owner:** unassigned | [SC label]
**Commit:** pending | [full SHA] | n/a

### Outcome
[What this produces and why]

### Constraints
- [plan decision to preserve]
- [explicit non-goal or wrong approach]

### Files and References
- `path/to/file` — [expected change]
- `path/to/example:line` — [pattern to follow]

### Acceptance Criteria
- [ ] [observable result tied to a plan criterion]
- [ ] `[verification command]` passes
- [ ] One focused commit contains only this todo's changes and is not pushed

### Verification
- Pending

### Result
- Pending
```

Use `Blocked` with an objective reason. Mark the top-level status `Complete` only when every required todo is complete with verified commit/result evidence (or an explicitly justified `n/a`).
