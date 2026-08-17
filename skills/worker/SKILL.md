---
name: worker
description: Implement one todo or review-fix task supplied by a coordinator, verify it, create one focused commit, and report evidence through the current Superconductor session. Use when launched by /execute, launched from a review repair loop, or asked to implement one assigned task.
---

# Worker

Implement exactly the assigned todo or review-fix task. Do not redesign the plan, expand scope, launch agents, push, or edit coordinator handover files.

## Inputs

The launch prompt must provide:

- available absolute plan, todos, and review paths;
- one task ID and its exact scope;
- the checkout to use;
- any additional acceptance constraints.

Read the supplied handover files directly and treat them as read-only. Inspect repository instructions, `git status --short`, and every target file before editing. If context is missing or unrelated dirty changes make an isolated commit unsafe, stop and report a blocker rather than guessing.

## Implement and Verify

Keep changes limited to the assigned task and preserve unrelated work. Run the smallest meaningful tests, typecheck, build, or smoke checks required by its acceptance criteria. Remove temporary/debugging artifacts.

Run every mutation-capable verification command before the commit. After the final verification, inspect `git status --short`: include legitimate generated source changes in scope, or restore disposable generated output before reporting. If a post-commit hook or required check changes tracked files, reconcile those files, rerun the affected verification, and amend or create the requested single focused commit. Never report completion with task-owned changes left dirty.

If verification fails, do not commit partial work. Report the command, failure, and blocker.

## Commit

After verification passes:

1. Read and follow `~/.pi/agent/skills/commit/SKILL.md`.
2. Review the complete diff and stage only this task's files.
3. Create exactly one focused commit; do not push.
4. Verify it with `git show --stat --oneline HEAD` and capture the full SHA.
5. Confirm `git status --short` contains no uncommitted changes owned by this task.

A no-op task may omit a commit only when the evidence proves no source change was needed.

## Final Report

Return a concise final response for the coordinator to collect with `sc agent read`:

```markdown
Status: DONE | BLOCKED
Task: TODO-NNN | REVIEW-FIX-NNN
Summary: ...
Files changed:
- `path` — ...
Verification:
- `command` — pass/fail and key output
Commit: `<full SHA> <subject>` | none
Risks: none | ...
```

The coordinator—not the worker—updates todo or review state. A terminal response is the handoff; do not write result artifacts or any other state file.
