---
name: superconductor
description: Operates the super.engineering/Superconductor `sc` CLI for app-managed agents, teams, sessions, layouts, worktrees, and review threads. Use when a workflow explicitly calls for SC orchestration or app-managed UI/session behavior.
compatibility: Requires the super.engineering/Superconductor app and the `sc` CLI. Some operations require Experimental Agent orchestration.
---

# Superconductor CLI

Use live `sc` instructions and capability output as authoritative. Keep SC syntax and lifecycle policy here; role skills should reference this skill rather than reproduce commands.

## Boundaries

- Use SC only for the requested orchestration or app-managed outcome.
- Require explicit human intent for worktree/branch creation or deletion, target-branch changes, force termination, destructive cleanup, closing/rearranging existing sessions, and unrelated review-thread mutations.
- Never create a worktree merely for delegation or launch replacement agents for follow-ups.
- Prefer stable labels or stable target IDs and `--active keep`.
- Dispatch and idle state are not completion; always wait, read, and verify.

## Live Preflight

Before the first mutation, run the matching guide:

| Area | Command |
|---|---|
| Agents, teams, delegation | `sc instructions orchestration` |
| Tabs, panes, views | `sc instructions layout` |
| Worktrees or branches | `sc instructions worktree` |
| In-app review threads | `sc instructions review` |

For orchestration, inspect current capabilities and targets:

```bash
command -v sc
sc layout capabilities --output json
sc layout views --worktree "$PWD" --output json
sc agents list --worktree "$PWD" --output json
sc chat providers --json
```

Verify the launch shape, provider, UI mode, model, reasoning level, and structured-read support before specifying them. If unavailable, report the exact limitation instead of silently substituting another mechanism.

Read [references/orchestration.md](references/orchestration.md) before launching or controlling sessions. Read [references/worktrees-and-reviews.md](references/worktrees-and-reviews.md) before requested worktree or review-thread operations.

## Individual Pi Worker

Delegated Pi sessions default to terminal mode. Long prompts should use a temporary JSONL launch input built with `jq`; it is command input, not durable workflow state, and must be removed after launch.

```bash
sc layout run tabs \
  --provider pi --ui terminal \
  --label worker-TODO-001 \
  --prompt 'Complete prompt with task and absolute handover paths.' \
  --worktree "$PWD" --active keep --output json
```

Capture the returned label/stable target. Then collect that same target:

```bash
sc agent wait --to label:worker-TODO-001 --idle --timeout-ms 120000 \
  --worktree "$PWD" --output json
sc agent read --to label:worker-TODO-001 --last 40 \
  --worktree "$PWD" --output json
```

Check reads for target/provider errors, incomplete output, and the evidence required by the prompt. Verify source-writing results independently with Git and tests. Run shared-checkout source writers sequentially.

Use `sc agent send` for clarification in the existing session. If a turn must be redirected, interrupt then send. Do not infer success from launch, queue admission, or idle state.

## Independent Teams

Use `sc team run` only for genuinely independent fan-out:

```bash
sc team run \
  --label correctness --provider pi --prompt 'Independent read-only review prompt.' \
  --label regressions --provider pi --prompt 'Independent read-only review prompt.' \
  --worktree "$PWD" --output json
```

Every team prompt must include its task, absolute handover paths, read/write limits, and this completion contract:

```bash
sc team report --run RUN_ID --role ROLE --status done \
  --summary 'Concise evidence-based report.' --worktree "$PWD" --output json
```

Use `--result-file` only when a detailed report exceeds the summary limit; do not use it for the session-file workflow. In a synchronous workflow, capture the returned stable role targets, wait for them, then collect the durable reports with `sc team status`. Once every role is `Reported`, use those report summaries directly; call `sc agent read` only for a missing, failed, or malformed report.

Do not pass `--notify self` when the coordinator waits synchronously. That option inserts the team synthesis into the creator's editor as a follow-up prompt and may require the user to submit it. Use it only for an explicitly asynchronous workflow, end the coordinator turn after launch, and explain that behavior to the user. Never combine it with manual wait/status collection. Team launch provides parallelism, not sequencing.

## Session-File Handover

For `/plan`, `/todos`, `/execute`, and `/review`:

- `PI_SESSION_FILE` is required in the coordinator session.
- Durable handover files are exactly `${PI_SESSION_FILE%.jsonl}.plan.md`, `${PI_SESSION_FILE%.jsonl}.todos.md`, and `${PI_SESSION_FILE%.jsonl}.review.md`.
- `/review` may use the session JSONL and Git state without plan or todos files; include either handover when it exists.
- The coordinator alone writes these files.
- Delegated prompts receive the resolved absolute paths and read them directly.
- Do not create sidecar directories, repository run stores, membership records, coordination-state mirrors, or custom JSONL state.

## Managed Terminal Title

In a managed Pi terminal:

```bash
sc tab title "$TITLE" --to "id:terminal:$SUPERCONDUCTOR_TERMINAL_ID" --json
```

Verify `response.new_title`. Do not omit the stable target.

## Cleanup

Do not stop agents, close tabs/views, delete groups, or remove other managed state unless the human requested cleanup. Inspect exact targets and current help before any such operation.
