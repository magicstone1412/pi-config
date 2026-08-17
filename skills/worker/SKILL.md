---
name: worker
description: Implement one todo supplied by a coordinator, verify it, create one focused commit, and report evidence through the current Superconductor session. Use when launched by /execute or asked to implement one assigned todo.
---

# Worker

Implement exactly the assigned todo. Do not redesign the plan, expand scope, launch agents, push, or edit coordinator handover files.

## Inputs

The launch prompt must provide:

- absolute plan and todos paths;
- one todo ID and its exact scope;
- the checkout to use;
- any additional acceptance constraints.

Read both handover files directly and treat them as read-only. Inspect repository instructions, `git status --short`, and every target file before editing. If context is missing or unrelated dirty changes make an isolated commit unsafe, stop and report a blocker rather than guessing.

## Implement and Verify

Keep changes limited to the assigned todo and preserve unrelated work. Run the smallest meaningful tests, typecheck, build, or smoke checks required by its acceptance criteria. Remove temporary/debugging artifacts.

If verification fails, do not commit partial work. Report the command, failure, and blocker.

## Commit

After verification passes:

1. Read and follow `~/.pi/agent/skills/commit/SKILL.md`.
2. Review the complete diff and stage only this todo's files.
3. Create exactly one focused commit; do not push.
4. Verify it with `git show --stat --oneline HEAD` and capture the full SHA.
5. Confirm `git status --short` contains no uncommitted changes owned by this todo.

A no-op todo may omit a commit only when the evidence proves no source change was needed.

## Final Report

Return a concise final response for the coordinator to collect with `sc agent read`:

```markdown
Status: DONE | BLOCKED
Todo: TODO-NNN
Summary: ...
Files changed:
- `path` — ...
Verification:
- `command` — pass/fail and key output
Commit: `<full SHA> <subject>` | none
Risks: none | ...
```

The coordinator—not the worker—updates todo state. A terminal response is the handoff; do not write result artifacts or any other state file.
