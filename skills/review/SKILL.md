---
name: review
description: Coordinate a model-diverse local code review, automatically repair actionable findings with sequential workers, and re-review to a final verdict. Use for /review or when launched as an SC ensemble reviewer.
---

# Review and Repair

Review for correctness, security, regressions, and acceptance-criteria gaps. Delegated reviewers remain read-only. In coordinator mode, do not edit source directly; coordinate repair workers when the review requires changes.

## Coordinator Mode

### 1. Establish context and scope

Derive the coordinator files before continuing:

```bash
if [ -n "${PI_SESSION_FILE:-}" ]; then
  SESSION_FILE="$PI_SESSION_FILE"
elif [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  SESSION_FILE="$HOME/.claude/projects/$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | tr '/.' '--')/${CLAUDE_CODE_SESSION_ID}.jsonl"
else
  echo "Error: /review requires a persistent session file (PI_SESSION_FILE or CLAUDE_CODE_SESSION_ID)." >&2
  exit 1
fi
test -f "$SESSION_FILE" || { echo "Error: session file not found: $SESSION_FILE" >&2; exit 1; }
PLAN_FILE="${SESSION_FILE%.jsonl}.plan.md"
TODOS_FILE="${SESSION_FILE%.jsonl}.todos.md"
REVIEW_FILE="${SESSION_FILE%.jsonl}.review.md"
```

1. Require `SESSION_FILE`. Read `PLAN_FILE` or `TODOS_FILE` when each exists; they are optional.
2. Recover intent from the current session and repository state when handovers are absent. Use the session-reader skill for focused extraction instead of parsing a large JSONL manually.
3. Determine the exact base commit and current HEAD from managed-worktree and Git evidence. Ask only when a material scope ambiguity remains.
4. Read `~/.pi/agent/skills/superconductor/SKILL.md` and follow its live orchestration preflight.

### 2. Run one review attempt

Launch one model-diverse SC reviewer ensemble with three independent read-only Pi Chat UI sessions and unique attempt-scoped labels:

| Role | Pi model | Reasoning | Owns | Avoids |
|---|---|---|---|---|
| lead | `openai-codex/gpt-5.6-sol` | `high` | broad correctness, acceptance criteria, cross-report synthesis | style-only polish |
| grok | `openrouter/x-ai/grok-4.6` | configured default | adversarial correctness, security, trust boundaries | general maintainability polish |
| kimi | `openrouter/moonshotai/kimi-k3` | configured default | regressions, cross-file behavior, frontend/accessibility, focused tests | duplicating broad security review |

At preflight, verify all three exact model IDs under the enabled `pi` provider with `sc chat providers --json`. Fail clearly rather than substituting a provider or model. Current `sc team run` cannot select a UI or model per role, so do not use it for this ensemble. Launch each role with `sc layout run tabs`, `--provider pi`, `--ui chat`, its exact `--model`, and `--reasoning high` only for the lead. The explicit Chat UI is required because SC's omitted/auto UI currently resolves delegated Pi launches to terminal mode rather than the configured Pi chat experience.

Give each role:

- the exact diff/commit range and checkout;
- a concise intent summary;
- available plan/todos paths;
- the session path only as optional fallback context;
- its exclusive focus and the delegated contract below.

Start all three sessions without waiting between launches. Capture every returned stable target, wait for all three, and read each target's final report. Check target/provider errors and malformed or incomplete output; do not infer success from idle state.

After collecting the grok and kimi reports, send them to the same lead target for a synthesis turn. Require the lead to deduplicate claims, preserve disagreements, and return one proposed verdict with concrete findings. Wait for and read that same lead target again; do not launch a replacement lead.

Reviewers should not all run the same broad suite. Let the kimi role run focused tests when useful; the coordinator runs one definitive verification set after collecting reports.

Independently verify the lead's synthesis against the diff and specialist reports. A finding blocks approval only when it is concrete, introduced by the review range, and either P0/P1 or a P2 required by the selected acceptance criteria. P3 never blocks approval.

Write the current attempt to the supplied review file before any repair. Set `APPROVED` only when no blocking finding remains.

### 3. Repair `NEEDS CHANGES` automatically

When blocking findings remain:

1. Require a clean checkout and a committed review range before automatic repair. If the reviewed implementation includes uncommitted changes, write `NEEDS CHANGES` and stop rather than letting a worker absorb user-owned work into a commit.
2. Group findings into at most three coherent, dependency-ordered repair tasks. Use IDs `REVIEW-FIX-<round>-<n>`.
3. Launch one source-writing Pi worker at a time through raw SC. Give it the review path, available plan/todos paths, exact findings, acceptance criteria, and checkout. Require it to read `~/.pi/agent/skills/worker/SKILL.md`.
4. Require one focused verified commit per repair task and no push. The worker must leave task-owned files clean after its final verification.
5. Wait and read the same stable worker target. Verify its reported SHA, diff scope, checks, and clean status independently before launching the next worker.
6. Record repair task IDs, commit SHAs, and verification in the review file.
7. Re-run a fresh independent review attempt against the original base through the new HEAD, using new ensemble labels.

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

When the launch prompt identifies this session as an ensemble reviewer:

- Read the supplied handovers and optional session path directly; treat them as read-only.
- Inspect the assigned diff and trace relevant unchanged logic before judging it.
- Stay within the assigned focus and avoid duplicating another role's scope.
- Run only safe, read-only, focused checks. Do not run a broad suite unless your assigned focus requires it.
- Report only concrete, introduced, actionable issues. Include priority, file/line, impact, and suggested fix.
- Do not edit files, write handovers, commit, push, or launch agents.
- Finish with a concise normal assistant response containing `APPROVED` or `NEEDS CHANGES`, followed by findings and evidence. Do not call `sc team report`; these model-pinned Chat UI reviewers are collected from their stable targets.

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
- **lead (`openai-codex/gpt-5.6-sol`, high):** [synthesized verdict and evidence]
- **grok (`openrouter/x-ai/grok-4.6`):** [verdict and evidence]
- **kimi (`openrouter/moonshotai/kimi-k3`):** [verdict and evidence]

## Residual Risks
- None | [nonblocking risk]
```

Omit empty findings or repair sections. Preserve concise attempt and repair evidence when replacing the file with the final verdict.
