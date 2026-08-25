---
description: Investigate a request interactively and write the selected plan beside this session
argument-hint: "<what to plan>"
---
Before planning, derive the handover path in a shell:

```bash
if [ -n "${PI_SESSION_FILE:-}" ]; then
  SESSION_FILE="$PI_SESSION_FILE"
elif [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  SESSION_FILE="$HOME/.claude/projects/$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | tr '/.' '--')/${CLAUDE_CODE_SESSION_ID}.jsonl"
else
  echo "Error: PI_SESSION_FILE or CLAUDE_CODE_SESSION_ID is required for /plan; no session handover file can be derived." >&2
  exit 1
fi
PLAN_FILE="${SESSION_FILE%.jsonl}.plan.md"
printf 'PLAN_FILE=%s\n' "$PLAN_FILE"
```

If that check fails, report the error and stop. Use the printed absolute path. Read `~/.pi/agent/skills/plan/SKILL.md` and follow it in this chat, using the absolute `PLAN_FILE` path.

Investigate the repository, confirm intent, present materially different approaches, and wait for the user to select one. Then write or update **only** `PLAN_FILE` and stop. Do not create todos, execute the plan, launch implementation agents, review changes, or create any other handover state.

Planning request:
$ARGUMENTS
