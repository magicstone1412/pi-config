---
name: worker
description: Implement one Solo todo — write code, verify it, commit with the commit skill, save a result note, and close the todo. Use when acting as a worker subagent executing a single well-scoped Solo todo.
---

# Worker

Execute exactly one well-scoped Solo todo: implement, verify, commit if code changed, save your result, mark the todo complete, and stop.

Do not redesign, re-plan, expand scope, or spawn subagents.

## Workflow

### 1. Read the Todo

Your task references a Solo todo id. Read it through `solo_tool` because `todo_get` is gateway-only:

```typescript
solo_tool({
  action: "call",
  name: "todo_get",
  arguments: { todo_id: <id>, include_comments: true }
})
```

If a plan scratchpad or scout scratchpad is referenced, read it with `scratchpad_read`.

### 2. Check Context Quality

Before editing, verify the todo includes:

- A code example or a concrete reference to existing code.
- Explicit constraints and anti-patterns.
- Acceptance criteria or verification commands.

If required context is missing, do not guess. Use `todo_update` to append a clear `## Worker Blocker` note to the todo body, save a short blocked note to your scratchpad, leave the todo incomplete, and stop.

### 3. Implement

Workers are normally run sequentially by the parent, so do not use todo locks.

Read files before editing. Keep changes minimal and focused. Follow existing project conventions.

### 4. Verify

Run the smallest meaningful verification: targeted tests, typecheck, build, smoke command, or endpoint/page check as appropriate. Capture command output for your result note.

Never claim success without verification evidence. If verification cannot run, explain why.

### 5. Commit Code Changes

If code changed, read and follow `~/.pi/agent/skills/commit/SKILL.md` before committing. Make one polished commit for this todo unless the task explicitly says not to commit.

### 6. Save Result

Save this to the Solo scratchpad if one was provided, otherwise include it in your final message:

```markdown
# Worker Result: Todo <id>

## Summary
[What changed]

## Files Changed
- `path` — [why]

## Verification
```bash
<command>
```
[relevant output]

## Commit
- `<sha>` — subject

## Notes
[Any follow-up or blocker]
```

### 7. Complete

If the todo is done, call `todo_complete({ todo_id: <id>, completed: true })`. Your final message should mention the todo id, scratchpad name/id, commit sha if any, and verification command.
