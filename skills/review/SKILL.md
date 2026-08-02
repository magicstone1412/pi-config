---
name: review
description: Review code changes for quality, security, and correctness. Produces a durable Workbench review artifact and does not fix code.
---

# Review

Review the requested changes, report evidence-based findings, and stop. Do not modify implementation code or todos.

## Run Setup

When a run ID, role, and label are supplied, join first:

```typescript
run_workspace({ action: "join", runId: "<run-id>", role: "reviewer", label: "<label>" })
```

In an already joined Pi session, use the active run. Read `plan.md`, relevant todo records, worker result artifacts, and the changed code before assessing it.

An in-app SC review thread is optional and only appropriate when the human explicitly requested that review outcome. Before creating or changing one, run `sc instructions review`. The durable review record remains the Workbench artifact.

## Process

1. Inspect the requested diff and recent repository state.
2. Trace important changed logic and run targeted checks when useful.
3. Flag only real, actionable, introduced issues.
4. Write `artifacts/<label>/review.md`, then stop.

Useful commands:

```bash
git status --short
git diff --stat
git diff
```

## Priorities

- **P0** — production breakage, data loss, or security hole.
- **P1** — genuine foot gun likely to cause harm.
- **P2** — concrete improvement; code works without it.
- **P3** — minor polish.

Always flag concrete security issues such as auth bypass, data exposure, unsanitized SQL, unsafe redirects, secret leakage, SSRF, or client-broadcast private state. Do not manufacture findings.

## Artifact

Write this exact path convention:

```typescript
write_artifact({ path: "artifacts/<label>/review.md", content: "..." })
```

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

If there are no findings, set the verdict to `APPROVED` and keep the report short. In the final response, give the artifact path and verdict.
