---
name: plan
description: Solo-native planning workflow. Use when asked to "plan", "brainstorm", "design", "create a plan", "I want to build", or "let's build". Covers both orchestrating a plan (scout → planner → workers → review) and acting as the interactive planner subagent.
---

# Plan

Turn a request into a concrete plan and Solo todos, then execute them. Uses Solo subagents, scratchpads, and todos.

This skill has two roles:

- **Orchestrator** — the parent session coordinating the workflow. Read [Orchestrating](#orchestrating).
- **Planner** — a subagent spawned to plan interactively with the user. Read [Being the Planner](#being-the-planner).

If your task says you are the planner, skip to [Being the Planner](#being-the-planner).

Solo subagents are asynchronous. After every `subagent` call, stop and wait for Solo to inject the wake-up turn. Do not poll, guess, or fabricate child results.

## Orchestrating

### 1. Quick Assessment

Orient for ~30 seconds (`ls`, `find`, read key config). Pick a short plan tag such as `auth-redesign`. Use it for scratchpad names and todo tags.

### 2. Scout

Always run a scout before the planner:

```typescript
subagent({
  name: "Scout: <tag>",
  scratchpad: true,
  task: `Read ~/.pi/agent/skills/scout/SKILL.md and follow it.

Scout for this planning request: <user request>

Focus on the files, patterns, conventions, tests, and gotchas a planner needs before designing the change. Save your findings to your pre-created Solo scratchpad.`
})
```

Stop. When Solo wakes you, read the scout scratchpad with `scratchpad_read`.

### 3. Interactive Planner

Get this parent session's Solo process id first so the planner can notify you when done:

```typescript
solo_tool({ action: "call", name: "whoami", arguments: {} })
```

Then spawn the planner:

```typescript
subagent({
  name: "Planner: <tag>",
  interactive: true,
  scratchpad: true,
  task: `Read ~/.pi/agent/skills/plan/SKILL.md — you are the planner subagent; follow the "Being the Planner" section.

Plan this request: <user request>

Plan tag: <tag>
Parent Solo process id: <process_id from whoami>
Scout scratchpad: <scratchpad name/id>`
})
```

Tell the user to continue the planning conversation in the planner pane through the approach checkpoint; after that the planner finishes autonomously. The first interactive wake-up only means the planner is waiting for the user — do not treat it as completion unless the plan scratchpad is final and the todos exist.

### 4. Execute Todos

When the planner notifies you that todos are ready: read the plan scratchpad, list todos with `todo_list({ tags: ["<tag>"], completed: false })`, summarize briefly, and start executing immediately — do not ask for confirmation.

Run workers **one todo at a time** (parallel workers in one git repo will conflict):

```typescript
subagent({
  name: "Worker: <todo id>",
  scratchpad: true,
  task: `Read ~/.pi/agent/skills/worker/SKILL.md and follow it.

Implement Solo todo <todo id>.

Plan scratchpad: <planner scratchpad id/name>
Scout scratchpad: <scout scratchpad id/name>
Plan tag: <tag>`
})
```

After each worker wake-up:

1. Read the worker scratchpad.
2. Check the todo via `solo_tool` (gateway-only `todo_get`).
3. If complete, start the next worker.
4. If blocked, update the todo with the missing examples/constraints via `todo_update`, then rerun a worker.

### 5. Review

After all todos are complete, run a reviewer:

```typescript
subagent({
  name: "Reviewer: <tag>",
  scratchpad: true,
  task: `Read ~/.pi/agent/skills/review/SKILL.md and follow it.

Review the recent changes for plan tag <tag>.

Plan scratchpad: <planner scratchpad id/name>
Review the implementation commits and save your review to your pre-created Solo scratchpad.`
})
```

Triage findings: P0/P1 → create todos and run workers to fix; P2 → fix if quick; P3 → skip unless asked. Then report completion to the user.

## Being the Planner

You are the planning subagent. Work interactively only until the approach is selected, then finish autonomously. Your deliverables are a plan in your pre-created Solo scratchpad and Solo todos. Do not implement the feature or edit production source files.

**Hard rules:**

- Interactive only through Phase 5 (approach selection): one phase per message, then stop and wait for user input.
- After the approach checkpoint, do not ask anything else — make agent decisions, record them, and continue through completion.
- Clarify WHAT only enough to remove meaningful ambiguity, then design HOW.

### Phase 1: Investigate Context

Read the scout scratchpad provided in the task. If a codebase fact blocks planning, check it yourself with `ls`, `rg`, and file reads. End with: "Here's what I see... Does that match your understanding?"

### Phase 2: Confirm Intent

Present: explicit asks, implicit needs, out of scope, speed/quality signal, and the key thing to get right. Ask the user to confirm or correct.

### Phase 3: Clarify Requirements

Ask only questions that change the design: scope boundaries, behavior, edge cases, integration constraints. Prefer multiple choice. If the answer is a codebase fact, look it up instead of asking.

### Phase 4: Effort and ISC

Ask for effort level (Prototype / MVP / Production / Critical), tests (none / smoke / thorough / comprehensive), and docs (none / inline / README / full). Then draft compact, binary Ideal State Criteria:

```markdown
### Core Functionality
- [ ] ISC-1: [atomic yes/no criterion]

### Edge Cases
- [ ] ISC-2: [atomic yes/no criterion]

### Anti-Criteria
- [ ] ISC-A-1: No [thing that must not happen]
```

Ask what is missing or out of scope.

### Phase 5: Explore Approaches

Present 2-3 approaches with tradeoffs and a recommendation tied to the ISC. This is the final user checkpoint: ask the user to confirm the recommended approach or pick another. Tell them that after this answer you finish autonomously.

### Phase 6: Validate and Premortem (autonomous)

Validate the design in short written sections: architecture, components, data flow, edge cases. Then list 2-5 load-bearing assumptions and realistic failure modes; decide yourself whether to mitigate or accept each, and record the rationale.

### Phase 7: Write the Plan Scratchpad

Use `scratchpad_write` to replace your pre-created scratchpad with:

```markdown
# [Plan Name]

**Status:** Ready for execution
**Plan tag:** [tag]

## Intent
## Behavior (happy path + edge cases)
## Scope (in / out)
## Effort and Quality
## Ideal State Criteria
## Approach (chosen + why)
## Architecture
## Key Decisions
## Assumptions and Premortem
## Todo Plan
```

### Phase 8: Create Solo Todos

Read `~/.pi/agent/skills/write-todos/SKILL.md` first. Create todos with `todo_create`, all tagged with the plan tag. Every todo body must be self-contained: plan/scout scratchpad refs, explicit constraints, files to touch, an inline code example or exact existing-file reference, and acceptance criteria tied to ISC items. Each todo must fit one worker session and one commit.

### Phase 9: Notify the Parent

If the task included `Parent Solo process id: <number>`, get your own process id with `solo_tool({ action: "call", name: "whoami", arguments: {} })`, then schedule an immediate wake-up:

```typescript
solo_tool({
  action: "call",
  name: "timer_set",
  arguments: {
    delay_ms: 0,
    delivery_process_id: <parent process id>,
    body: `[pi-solo:subagent-done id=<your process id> scratchpad=<plan scratchpad id> name="Planner: <tag>"]

Planner finished. Plan scratchpad: <name/id>. Plan tag: <tag>. Todo IDs: <list>.

Parent: read the plan scratchpad, list todos tagged "<tag>", and begin executing them sequentially without asking for confirmation.`
  },
  reason: "notify parent that planner completed plan and todos"
})
```

Do not notify before the todos exist. Finish with a summary: plan scratchpad name/id, todo IDs and titles, key decisions, risks accepted/mitigated.
