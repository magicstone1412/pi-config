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

An in-app SC review thread is optional and only appropriate when the human explicitly requested that review outcome. Ordinary reviews remain artifact-only and must not read or mutate SC review threads. The durable review record remains the Workbench artifact; SC comments, target output, and idle state do not prove review completion.

## Process

1. Inspect the requested diff and recent repository state.
2. When the human explicitly authorized an in-app SC review:
   - Run `sc instructions review` before using the review commands.
   - Inspect `sc worktree review-checklist --json`, `sc worktree diff-summary --json`, and `sc worktree review-list --json`.
   - Use `sc worktree review-get COMMENT_ID --json` to read every existing open comment before deciding the verdict. Assess those comments against the current diff; do not assume they are addressed from status or summary output.
3. Trace important changed logic and run targeted checks when useful.
4. Flag only real, actionable, introduced issues.
5. In explicitly authorized SC-review mode, reconcile the in-app review after assessing the code:
   - Reply with verification evidence to each existing comment that is now addressed, then resolve only that comment. Do not resolve unrelated comments or comments whose requested change remains actionable.
   - For a `NEEDS CHANGES` verdict, leave every unaddressed actionable comment open. Ensure each actionable finding is represented in SC: retain a matching existing comment or add one comment for each new finding, using the file and line anchor required by the live guide.
   - For an `APPROVED` verdict, require no remaining actionable findings and publish one SC review entry whose summary starts with `[APPROVED]`.
   - Re-run `review-list`, then `review-get` for every replied-to, resolved, or newly added comment. Confirm the exact IDs and resulting states; a successful mutation response alone is insufficient.
6. Write `artifacts/<label>/review.md`, including the SC evidence below when applicable, then stop.

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

## SC Review (explicitly authorized mode only)
- Existing open comments inspected: [IDs and initial states]
- Replies and resolutions: [IDs, evidence, and verified resulting states]
- Published findings or approval: [new IDs and verified states]
```

If there are no findings, set the verdict to `APPROVED` and keep the report short. In authorized SC-review mode, the artifact must record all relevant SC comment IDs and the states verified with `review-list`/`review-get`. The Workbench artifact is required even when the SC lifecycle succeeds. In the final response, give the artifact path and verdict.
