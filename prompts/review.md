---
description: Independently review this session's implementation through a local Superconductor team
---
Derive and validate the handover paths in a shell first:

```bash
if [ -z "${PI_SESSION_FILE:-}" ]; then
  echo "Error: PI_SESSION_FILE is required for /review; no session handover files can be derived." >&2
  exit 1
fi
PLAN_FILE="${PI_SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${PI_SESSION_FILE%.jsonl}.todos.md"
REVIEW_FILE="${PI_SESSION_FILE%.jsonl}.review.md"
test -f "$PLAN_FILE" || { echo "Error: plan file not found: $PLAN_FILE" >&2; exit 1; }
test -f "$TODOS_FILE" || { echo "Error: todos file not found: $TODOS_FILE" >&2; exit 1; }
printf 'PLAN_FILE=%s\nTODOS_FILE=%s\nREVIEW_FILE=%s\n' "$PLAN_FILE" "$TODOS_FILE" "$REVIEW_FILE"
```

If a check fails, report the error and stop. Use the printed absolute paths. Read the absolute plan and todos files, `~/.pi/agent/skills/review/SKILL.md`, and `~/.pi/agent/skills/superconductor/SKILL.md`. Run the live `sc instructions orchestration` preflight.

Remain the coordinator. Launch a local SC team of independent, read-only reviewers. Give every reviewer the absolute plan and todos paths, the Git review scope, and a distinct review focus. Reviewers must not edit files, commit, launch agents, or write handover state; they return evidence through their SC team reports. Collect and verify every report, inspect the relevant diff and checks yourself, then write or replace **only** the absolute `REVIEW_FILE` using the review skill's Markdown format.

Use only raw SC plus normal read-only repository tools. Do not introduce extension-backed task tools, a custom review handoff protocol, custom review state, worktree automation, push, PR, merge, or cleanup behavior. Stop after reporting the review path and verdict.
