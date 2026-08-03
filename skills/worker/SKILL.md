---
name: worker
description: "Implement one Workbench todo: join the run, claim, implement, verify, commit successful work, write a result artifact, and complete or block the todo."
---

# Worker

Execute exactly one well-scoped Workbench todo. Do not redesign, re-plan, expand scope, or launch other agents.

## 1. Join and Claim

When the task supplies a run ID, role, label, and todo ID, join before any other Workbench operation:

```typescript
run_workspace({ action: "join", runId: "<run-id>", role: "worker", label: "<label>", todoId: "TODO-001" })
```

In a directly launched session that is already joined, inspect `run_workspace({ action: "current" })` and use that run. Read `plan.md`, the todo, and referenced artifacts. Inspect `git status --short` before editing. A source-writing worker should start from the clean commit left by the previous sequential worker; if unrelated dirty changes make an isolated commit ambiguous, record a blocker instead of absorbing them. Claim exactly that one todo before implementation:

```typescript
todo({ action: "claim", id: "TODO-001" })
```

If required context, references, constraints, or acceptance criteria are missing, do not guess. Record an objective blocker with `todo({ action: "block", id, reason })`, write `artifacts/<label>/result.md`, and stop.

## 2. Implement

Read every target file before editing. Preserve unrelated user changes and keep the implementation focused on the claimed todo. Do not claim, release, force-release, or alter another todo. `force_release` is an explicit coordinator-only recovery action for claims left by disappeared workers; a worker must never use it to steal a claim.

## 3. Verify

Run the smallest meaningful verification: targeted tests, typecheck, build, or an appropriate smoke check. Capture the command and result. If verification cannot run or the acceptance criteria fail, block the todo with the concrete reason; do not complete it.

## 4. Commit Successful Work

After verification passes, read and follow `~/.pi/agent/skills/commit/SKILL.md`. Create exactly one focused commit for the claimed todo and do not push it.

- Inspect the complete diff and remove debugging/test artifacts first.
- Stage only files owned by this todo. Never include unrelated pre-existing changes.
- Do not skip hooks. If a hook changes files, re-run the relevant verification and include those changes.
- Verify the resulting SHA with `git show --stat --oneline HEAD` and inspect `git status --short`.
- If an isolated commit cannot be made safely, block the todo with the concrete ambiguity rather than committing someone else's work.
- A legitimately no-op todo may complete without a commit only when the result artifact proves that no source change was necessary.

## 5. Record Result

Always write `artifacts/<label>/result.md` after the commit and before the final todo transition:

```markdown
# Worker Result: TODO-001

## Summary
[What changed, or why work is blocked]

## Files Changed
- `path` — [why]

## Verification
- `<command>` — [pass/fail output or reason it could not run]

## Commit
- `<sha>` — `<subject>`

## Risks
[Known follow-up, or "None"]
```

Use:

```typescript
write_artifact({ path: "artifacts/<label>/result.md", content: "..." })
```

## 6. Complete or Block

Only after the artifact is written and verification passes, complete the claimed todo with verification evidence:

```typescript
todo({
  action: "complete",
  id: "TODO-001",
  verification: "<command> — passed",
  artifactRefs: ["artifacts/<label>/result.md"]
})
```

On a blocker or failed verification, use `todo({ action: "block", id, reason })` and leave it incomplete. Do not commit partial or failing work. Report the todo status, artifact path, verification result, and commit SHA when completed.
