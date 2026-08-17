---
name: plan
description: Interactively investigate a request, compare approaches, and write the selected implementation plan to a supplied Markdown path. Use for planning, brainstorming, or exact /plan.
---

# Plan

Plan in the current chat. Do not implement, create todos, review, or launch source-writing agents.

## Workflow

1. **Investigate:** inspect repository instructions, Git state, relevant files, tests, and existing patterns. Ground claims in what you read.
2. **Confirm intent:** summarize the requested outcome, implicit requirements, boundaries, and the most important success condition. Ask for corrections.
3. **Clarify:** ask only questions whose answers materially change the design. Resolve observable behavior, edge cases, quality level, and explicit exclusions.
4. **Compare approaches:** present 2–3 materially different options with tradeoffs, risks, effort, and a recommendation.
5. **Select:** ask the user to choose or approve an approach. Do not write the plan before this checkpoint.
6. **Write:** after selection, resolve routine details from evidence and write only the absolute plan path supplied by the caller. Stop.

Keep each interactive turn focused. Investigate facts instead of asking the user to provide facts available in the checkout.

## Plan Format

```markdown
# [Plan name]

**Status:** Ready
**Request:** [one sentence]
**Selected approach:** [one sentence]

## Intent

## Scope

### In scope
- ...

### Out of scope
- ...

## Acceptance Criteria
- [ ] ISC-1: [binary, observable criterion]
- [ ] ISC-2: ...

## Repository Evidence
- `path:line` — [relevant fact or convention]

## Approaches Considered

### Selected: [name]
[Why it best fits]

### Rejected: [name]
[Tradeoff that ruled it out]

## Implementation
1. [ordered change with files/components]

## Verification
- `[command]` — [what it proves]

## Assumptions and Risks
- [assumption or failure mode] — [mitigation or accepted risk]
```

Use objective acceptance criteria and name important wrong approaches. Do not create a sidecar directory, run record, todo file, review file, or custom state.
