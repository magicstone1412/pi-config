---
description: Independently review this session's implementation through a local Superconductor team
---
Derive the session and handover paths in a shell first:

```bash
if [ -z "${PI_SESSION_FILE:-}" ]; then
  echo "Error: PI_SESSION_FILE is required for /review; no review file can be derived." >&2
  exit 1
fi
SESSION_FILE="$PI_SESSION_FILE"
test -f "$SESSION_FILE" || { echo "Error: session file not found: $SESSION_FILE" >&2; exit 1; }
PLAN_FILE="${PI_SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${PI_SESSION_FILE%.jsonl}.todos.md"
REVIEW_FILE="${PI_SESSION_FILE%.jsonl}.review.md"
printf 'SESSION_FILE=%s\nPLAN_FILE=%s (%s)\nTODOS_FILE=%s (%s)\nREVIEW_FILE=%s\n' \
  "$SESSION_FILE" "$PLAN_FILE" "$([ -f "$PLAN_FILE" ] && echo available || echo optional-missing)" \
  "$TODOS_FILE" "$([ -f "$TODOS_FILE" ] && echo available || echo optional-missing)" "$REVIEW_FILE"
```

If the session check fails, report the error and stop. The plan and todos are optional: read them when present, but do not fail when either is absent. Use the current session conversation and Git state as the review intent and execution evidence when no handover exists. Read `~/.pi/agent/skills/review/SKILL.md`, `~/.pi/agent/skills/superconductor/SKILL.md`, and, when session history needs focused extraction, `~/.pi/agent/skills/session-reader/SKILL.md`. Run the live `sc instructions orchestration` preflight.

Remain the coordinator. Determine the exact Git review scope from repository and managed-worktree evidence. Launch a local SC team of independent, read-only reviewers. Give every reviewer the absolute session path, every available handover path, the exact Git review scope, and a distinct review focus. Reviewers must not edit files, commit, launch agents, or write handover state; they return evidence through their SC team reports. Collect and verify every report, inspect the relevant diff and checks yourself, then write or replace **only** the absolute `REVIEW_FILE` using the review skill's Markdown format.

Use only raw SC plus normal read-only repository tools. Do not introduce extension-backed task tools, a custom review handoff protocol, custom review state, worktree automation, push, PR, merge, or cleanup behavior. Stop after reporting the review path and verdict.
