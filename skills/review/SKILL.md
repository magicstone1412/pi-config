---
name: review
description: Coordinate or perform an independent read-only code review and produce a concise Markdown verdict. Use for /review or when launched as an SC team reviewer.
---

# Review

Review for correctness, security, regressions, and acceptance-criteria gaps. Do not fix code, commit, push, or expand scope.

## Coordinator Mode

When invoked in the user's session:

1. Read the supplied session JSONL and any supplied plan or todos files that exist, plus the relevant Git diff and commits. Plan and todos are optional; when absent, recover intent and implementation evidence from the current session and repository state. Use the session-reader skill for focused extraction rather than parsing a large JSONL manually.
2. Determine and state the exact review scope. Ask the user only when the session and Git evidence leave a material scope ambiguity.
3. Read `~/.pi/agent/skills/superconductor/SKILL.md`, follow its live preflight, and launch one local SC team with 2–3 independent read-only roles. Useful focuses are correctness, tests/regressions, and security/maintainability.
4. Give each role the absolute session path, every available handover path, exact diff/commit scope, its focus, and the delegated contract below.
5. Collect every team report and check for target/provider errors. Run targeted verification yourself where useful.
6. Synthesize evidence, deduplicate findings, and write only the supplied absolute review path. Stop.

The coordinator owns the review file. Do not create a separate captain, final-marker protocol, sidecar, or other state.

## Delegated Reviewer Contract

When the launch prompt identifies this session as a team reviewer:

- Read the supplied session path and any available handover paths directly; treat them as read-only.
- Inspect the assigned diff/commits and trace changed logic before judging it.
- Run only safe, read-only checks.
- Report only concrete, introduced, actionable issues. Include file/line, impact, and a suggested fix.
- Do not launch agents or write any handover file.
- Finish using the `sc team report` context supplied by the team launch. Put detailed findings in the report; return `APPROVED` when none exist.

## Priorities

- **P0:** production breakage, data loss, or exploitable security flaw.
- **P1:** likely functional failure or serious foot gun.
- **P2:** concrete scoped improvement; implementation otherwise works.
- **P3:** minor polish.

## Review File Format

```markdown
# Code Review

**Verdict:** APPROVED | NEEDS CHANGES
**Session:** `/absolute/path/to/session.jsonl`
**Plan:** `/absolute/path/to/session.plan.md` | not provided
**Todos:** `/absolute/path/to/session.todos.md` | not provided
**Reviewed commits:** [SHAs or range]

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

## Independent Reports
- **[role]:** [verdict and key evidence]

## Residual Risks
- None | [risk not established as a finding]
```

If there are no actionable findings, set `APPROVED` and omit the findings section.
