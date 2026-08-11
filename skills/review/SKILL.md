---
name: review
description: Review code changes for quality, security, and correctness. Produces a durable Workbench review artifact and does not fix code.
---

# Review

Review the requested changes, report evidence-based findings, and stop. Do not modify implementation code or todos.

## Standard Reviewer Dispatch

Unless this session was explicitly launched as the reviewer, coordinate the review here but delegate the assessment to **Claude Code / Fable 5** through Workbench:

1. Run `sc instructions orchestration`, `sc instructions layout`, and `sc instructions review`.
2. Verify live capabilities show provider `claude` with structured read, model `claude-fable-5`, reasoning `high`, and the required `sc worktree review-*` commands. If unavailable, report the exact limitation; do not silently substitute Pi or another reviewer.
3. Use the active Workbench run (ambient workspace is sufficient for a direct review) and launch:

   ```text
   launch_review_agent({
     label: "<run-id>-reviewer-claude-<short-task-or-retry>",
     provider: "claude",
     model: "claude-fable-5",
     reasoning: "high",
     prompt: "<complete read-only review scope and acceptance criteria>",
   })
   ```

4. Treat launch as dispatch only. Do not poll or read the reviewer. Workbench accepts completion only after a provider-authored nonce-bound SC final comment and then generates `artifacts/<label>/review.md`.
5. When the automatic completion message arrives, read the generated artifact and independently verify every relevant comment ID/state with `review-list` and `review-get`. Report the verdict and findings; do not fix them.

A direct invocation of this standard review workflow authorizes only run-scoped review comments needed to report its findings/verdict. It does not authorize unrelated thread mutation. The Claude reviewer is read-only, and its finished pane remains open for inspection.

## Delegated Reviewer Contract

When a run ID, role, and label are supplied, join first:

```typescript
run_workspace({ action: "join", runId: "<run-id>", role: "reviewer", label: "<label>" });
```

In an already joined Pi session, use the active run. Read `plan.md`, relevant todo records, worker result artifacts, and the changed code before assessing it.

The standard Claude Code / Fable 5 workflow and exact `/plan` both use in-app SC review mode. A legacy session explicitly launched as a Pi reviewer follows the same reconciliation contract below. The durable review record remains the Workbench artifact; SC comments, target output, and idle state do not prove review completion.

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

For the standard Claude Code / Fable 5 workflow, Workbench generates this artifact from the verified tagged SC comments. A legacy delegated Pi reviewer writes the same exact path convention:

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

When a legacy Pi launch contract requires durable parent reporting, call `report_to_parent({status: "done", ...})` only after the review artifact and required SC comments are verified, and before the final response. Standard Claude reviewers complete through the nonce-bound SC marker instead. A terminal verdict or runtime idle is not a handoff.
