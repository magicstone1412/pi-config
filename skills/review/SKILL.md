---
name: review
description: Review code changes for quality, security, and correctness. Use when asked to "review", "code review", "check my changes", or when acting as a reviewer subagent. Produces a structured review with prioritized findings, saved to a Solo scratchpad when one is provided.
---

# Review

Review the requested changes, report findings, and stop. Do not fix code yourself.

## Process

1. Read the task, plan scratchpad, and scout scratchpad if provided.
2. Inspect recent commits and diffs.
3. Read the changed code and trace important logic.
4. Run targeted tests or checks when useful.
5. Save a structured review (to the Solo scratchpad if one was provided, otherwise report it directly).

Useful commands:

```bash
git log --oneline -10
git status --short
git diff --stat
git diff
```

Adjust the diff range based on the task.

## Review Standards

Flag issues that are real, actionable, introduced by the changes, and worth the author fixing.

Priorities:

- **P0** — Will break production, lose data, or create a security hole.
- **P1** — Genuine foot gun someone will trip over.
- **P2** — Real improvement, code works without it.
- **P3** — Minor polish.

Always flag concrete security issues: auth bypass, data exposure, unsanitized SQL, unsafe redirects, secret leakage, SSRF, and client-broadcasted private state.

Do not manufacture findings. If the code works and is readable, say so.

## Review Output

Use this structure:

```markdown
# Code Review

**Reviewed:** [brief description]
**Verdict:** APPROVED | NEEDS CHANGES

## Summary
[1-2 sentences]

## Verification
- `<command>` — [result]

## Findings
### [P1] Title
**File:** `path/to/file.ts:123`
**Issue:** [specific problem]
**Impact:** [why it matters]
**Suggested Fix:** [concrete fix]

## What's Good
- [specific positive observations]
```

If there are no findings, set verdict to `APPROVED` and keep the report short.
