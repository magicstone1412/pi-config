---
name: review
description: Coordinate an independent local code review, automatically repair actionable findings with sequential workers, and re-review to a final verdict. Use for /review or when launched as an SC team reviewer.
---

# Review and Repair

Review for correctness, security, regressions, and acceptance-criteria gaps. Team reviewers remain read-only. In coordinator mode, do not edit source directly; coordinate repair workers when the review requires changes.

## Coordinator Mode

### 1. Establish context and scope

Derive the coordinator files before continuing:

```bash
if [ -z "${PI_SESSION_FILE:-}" ] || [ ! -f "$PI_SESSION_FILE" ]; then
  echo "Error: /review requires a persistent PI_SESSION_FILE." >&2
  exit 1
fi
SESSION_FILE="$PI_SESSION_FILE"
PLAN_FILE="${PI_SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${PI_SESSION_FILE%.jsonl}.todos.md"
REVIEW_FILE="${PI_SESSION_FILE%.jsonl}.review.md"
```

1. Require `SESSION_FILE`. Read `PLAN_FILE` or `TODOS_FILE` when each exists; they are optional.
2. Recover intent from the current session and repository state when handovers are absent. Use the session-reader skill for focused extraction instead of parsing a large JSONL manually.
3. Determine the exact base commit and current HEAD from managed-worktree and Git evidence. Ask only when a material scope ambiguity remains.
4. Read `~/.pi/agent/skills/superconductor/SKILL.md` and follow its live orchestration preflight.

### 2. Run one review attempt

Launch one local SC team with three independent read-only roles and unique attempt-scoped labels:

| Role | Owns | Avoids |
|---|---|---|
| correctness | backend behavior, data integrity, concurrency, acceptance criteria | broad UI and security review |
| regressions | frontend behavior, accessibility, responsive layout, focused tests | backend/security duplication |
| security | authentication, authorization, privacy, trust boundaries | general maintainability polish |

Give each role:

- the exact diff/commit range and checkout;
- a concise intent summary;
- available plan/todos paths;
- the session path only as optional fallback context;
- its exclusive focus and the delegated contract below.

Do not use `--notify self`. Capture the returned stable role targets, wait for all of them, then collect durable reports with `sc team status`. When every role is `Reported`, use the report summaries directly. Read an agent transcript only when its report is missing, failed, or malformed.

Reviewers should not all run the same broad suite. Let the regressions role run focused tests when useful; the coordinator runs one definitive verification set after collecting reports.

Deduplicate and independently verify findings. A finding blocks approval only when it is concrete, introduced by the review range, and either P0/P1 or a P2 required by the selected acceptance criteria. P3 never blocks approval.

Write the current attempt to the supplied review file before any repair. Set `APPROVED` only when no blocking finding remains.

### 3. Repair `NEEDS CHANGES` automatically

When blocking findings remain:

1. Require a clean checkout and a committed review range before automatic repair. If the reviewed implementation includes uncommitted changes, write `NEEDS CHANGES` and stop rather than letting a worker absorb user-owned work into a commit.
2. Group findings into at most three coherent, dependency-ordered repair tasks. Use IDs `REVIEW-FIX-<round>-<n>`.
3. Launch one source-writing Pi worker at a time through raw SC. Give it the review path, available plan/todos paths, exact findings, acceptance criteria, and checkout. Require it to read `~/.pi/agent/skills/worker/SKILL.md`.
4. Require one focused verified commit per repair task and no push. The worker must leave task-owned files clean after its final verification.
5. Wait and read the same stable worker target. Verify its reported SHA, diff scope, checks, and clean status independently before launching the next worker.
6. Record repair task IDs, commit SHAs, and verification in the review file.
7. Re-run a fresh independent review attempt against the original base through the new HEAD, using new team labels.

Run at most two repair rounds. Stop early and report `NEEDS CHANGES` when a worker blocks, verification fails, a safety decision requires the user, or blocking findings remain after round two. Do not hide or downgrade unresolved findings to force approval.

### 4. Finish visibly

Always end with a normal assistant response containing:

- final verdict;
- review-file path;
- reviewed range;
- repair commit SHAs;
- remaining blocking findings or `none`;
- verification results.

Do not end after only writing or rereading the review file.

The coordinator owns every handover-file write. Do not create a captain protocol, custom state store, worktree, push, PR, merge, or cleanup action.

## Delegated Reviewer Contract

When the launch prompt identifies this session as a team reviewer:

- Read the supplied handovers and optional session path directly; treat them as read-only.
- Inspect the assigned diff and trace relevant unchanged logic before judging it.
- Stay within the assigned focus and avoid duplicating another role's scope.
- Run only safe, read-only, focused checks. Do not run a broad suite unless your assigned focus requires it.
- Report only concrete, introduced, actionable issues. Include priority, file/line, impact, and suggested fix.
- Do not edit files, write handovers, commit, push, or launch agents.
- Finish with `sc team report` using the supplied team context. Return `APPROVED` when no blocking finding exists.

## Priorities

- **P0:** production breakage, data loss, or exploitable security flaw.
- **P1:** likely functional failure or serious foot gun.
- **P2:** concrete scoped improvement; blocks only when required by acceptance criteria.
- **P3:** minor polish; never blocks approval.

## Review File Format

```markdown
# Code Review

**Verdict:** APPROVED | NEEDS CHANGES
**Session:** `/absolute/path/to/session.jsonl`
**Plan:** `/absolute/path/to/session.plan.md` | not provided
**Todos:** `/absolute/path/to/session.todos.md` | not provided
**Reviewed commits:** [base..HEAD]
**Repair rounds:** 0 | 1 | 2

## Summary
[Concise evidence-based assessment]

## Verification
- `[command]` — [result]

## Findings
### [P1] [title]
- **File:** `path/to/file:line`
- **Issue:** [specific problem]
- **Impact:** [observable consequence]
- **Suggested fix:** [concrete direction]
- **State:** open | addressed by `<sha>`

## Repair Commits
- `REVIEW-FIX-1-1` — `<sha>` — [summary and verification]

## Independent Reports
- **correctness:** [verdict and evidence]
- **regressions:** [verdict and evidence]
- **security:** [verdict and evidence]

## Residual Risks
- None | [nonblocking risk]
```

Omit empty findings or repair sections. Preserve concise attempt and repair evidence when replacing the file with the final verdict.
