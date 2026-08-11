---
name: review
description: Review code changes for quality, security, and correctness. Produces a durable Workbench review artifact and does not fix code.
---

# Review

Review the requested changes, report evidence-based findings, and stop. Do not modify implementation code or todos.

## Run Setup

When a run ID, role, and label are supplied, join first:

```typescript
run_workspace({ action: "join", runId: "<run-id>", role: "reviewer", label: "<label>" });
```

In an already joined Pi session, use the active run. Read `plan.md`, relevant todo records, worker result artifacts, and the changed code before assessing it.

Use in-app SC review mode when the human directly authorized that outcome or when the launch contract says the reviewer belongs to an exact `/plan` run. Exact `/plan` always requires this mode for its run-scoped final review. Ordinary reviews remain artifact-only and must not read or mutate SC review threads. The durable review record remains the Workbench artifact; SC comments, target output, and idle state do not prove review completion.

## Process

1. Inspect the requested diff and recent repository state.
2. In SC-review mode:
   - Run `sc instructions review` before using the review commands.
   - Inspect `sc worktree review-checklist --json`, `sc worktree diff-summary --json`, and `sc worktree review-list --status open --json`.
   - Use `sc worktree review-get COMMENT_ID --json` for every returned open ID. Classify each as current actionable, addressed by the current diff, or unrelated/nonactionable history; do not infer this from checklist, list, or age.
3. Read the supplied Workbench plan, todo, and worker artifacts; trace important changed logic and run targeted checks when useful.
4. Flag only real, actionable, introduced issues.
5. In SC-review mode, reconcile only comments applicable to the current review:
   - For an addressed existing finding, reply with verification evidence, verify the reply with `review-get`, set the comment to `resolved`, then verify the status with `review-get` again.
   - Leave unrelated comments and every unaddressed actionable comment open.
   - For `NEEDS CHANGES`, retain a matching existing comment or add one comment for each new actionable finding. Anchor it to the relevant file/line (or file), and include priority plus the Workbench run ID.
   - For `APPROVED`, require no remaining actionable findings and add one file-anchored SC entry whose body starts with `[APPROVED]` and includes the Workbench run ID and concise verification. An approval entry may itself remain open and is not an actionable finding.
   - Re-run `review-list`, then `review-get` for every replied-to, resolved, or newly added comment. Confirm exact IDs and resulting states; a successful mutation response alone is insufficient.
6. After SC verification, write `artifacts/<label>/review.md`, including the evidence below when applicable, then stop.

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
write_artifact({ path: "artifacts/<label>/review.md", content: "..." });
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

## SC Review (SC-review mode only)

- Existing open comments inspected and classified: [IDs, initial states, classifications]
- Replies and resolutions: [IDs, evidence, and separately verified resulting states]
- Published findings or approval: [new IDs and verified states]
- Remaining open actionable comments: [IDs or none]
```

If there are no findings, set the verdict to `APPROVED` and keep the report short. In SC-review mode, the artifact must record all relevant SC comment IDs, classifications, and states verified with `review-list`/`review-get`. The Workbench artifact is required even when the SC lifecycle succeeds; artifact-only review cannot complete an exact `/plan` run.

When the launch contract requires durable parent reporting, call `report_to_parent({status: "done", ...})` only after the review artifact and required SC comments are verified, and before the final response. A terminal verdict or runtime idle is not a handoff.
