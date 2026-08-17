---
description: Execute this session's Markdown todos sequentially through Superconductor
---
Derive and validate the handover paths in a shell first:

```bash
if [ -z "${PI_SESSION_FILE:-}" ]; then
  echo "Error: PI_SESSION_FILE is required for /execute; no session handover files can be derived." >&2
  exit 1
fi
PLAN_FILE="${PI_SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${PI_SESSION_FILE%.jsonl}.todos.md"
test -f "$PLAN_FILE" || { echo "Error: plan file not found: $PLAN_FILE" >&2; exit 1; }
test -f "$TODOS_FILE" || { echo "Error: todos file not found: $TODOS_FILE" >&2; exit 1; }
printf 'PLAN_FILE=%s\nTODOS_FILE=%s\n' "$PLAN_FILE" "$TODOS_FILE"
```

If a check fails, report the error and stop. Use the printed absolute paths. Read both absolute handover files and `~/.pi/agent/skills/superconductor/SKILL.md`. Run the live `sc instructions orchestration` preflight and use raw Superconductor commands.

Remain the coordinator. Process ready source-writing todos sequentially in dependency order. Before each launch, update that todo to `In Progress`. Give the worker the absolute plan and todos paths, the exact todo ID and scope, and require it to read `~/.pi/agent/skills/worker/SKILL.md`. Workers must treat the handover files as read-only, make one focused verified commit, report its SHA, and never push.

For every worker, launch through raw SC, wait for it, read its response, check for target/provider errors, and verify the reported commit and scope with Git before starting the next todo. The coordinator alone updates `TODOS_FILE` with status, commit, verification, and result evidence. Mark failures `Blocked`; never hide them or infer completion from dispatch/idle state.

Use only raw SC plus normal file and Git tools. Do not use extension-backed task tools, child state writes, sidecar directories, run stores, custom JSONL state, worktree automation, push, PR, merge, or cleanup behavior. Stop after all possible todos are complete or one blocks further progress, and report the final todos path plus verified commit SHAs.
