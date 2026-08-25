---
description: Turn this session's selected plan into worker-ready Markdown todos
---
Derive the handover paths in a shell before doing anything else:

```bash
if [ -n "${PI_SESSION_FILE:-}" ]; then
  SESSION_FILE="$PI_SESSION_FILE"
elif [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  SESSION_FILE="$HOME/.claude/projects/$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | tr '/.' '--')/${CLAUDE_CODE_SESSION_ID}.jsonl"
else
  echo "Error: PI_SESSION_FILE or CLAUDE_CODE_SESSION_ID is required for /todos; no session handover files can be derived." >&2
  exit 1
fi
PLAN_FILE="${SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${SESSION_FILE%.jsonl}.todos.md"
test -f "$PLAN_FILE" || { echo "Error: plan file not found: $PLAN_FILE" >&2; exit 1; }
printf 'PLAN_FILE=%s\nTODOS_FILE=%s\n' "$PLAN_FILE" "$TODOS_FILE"
```

If a check fails, report the error and stop. Use the printed absolute paths. Read `~/.pi/agent/skills/write-todos/SKILL.md` and follow it. Read the absolute `PLAN_FILE`, then write or update **only** the absolute `TODOS_FILE`. Do not execute any todo, launch agents, edit source files, or create other state. Stop after reporting the todos path.
