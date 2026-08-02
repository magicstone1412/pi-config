---
name: superconductor
description: Operates the super.engineering/Superconductor `sc` CLI for app-managed chats, tabs, panes, views, agents, teams, worktrees, and review threads. Use when the user explicitly mentions "sc", "Superconductor", "super.engineering", "orchestrate", or "orchestration"; names another provider or model for delegated work; or requests visible/app-managed chats, tabs, panes, views, splits, side-by-side agents, teams, worktrees, or reviews.
compatibility: Requires the super.engineering/Superconductor app and the `sc` CLI. Some operations require Experimental Agent orchestration.
---

# Superconductor CLI

Use `sc` as the control plane for explicitly requested super.engineering UI, sessions, orchestration, worktrees, and reviews. Treat live CLI instructions and capability output as authoritative.

## Step 1: Preserve the authorization boundary

- Use `sc` orchestration only for an explicit super.engineering trigger from the human user.
- Treat ordinary requests for a subagent, worker, reviewer, delegation, or parallel work as requests for the current provider's native subagent tools. Do not substitute `sc` unless the user asks for Superconductor, app-managed UI, another named provider/model, or orchestration.
- Do not infer delegation from task size or possible speedups.
- Mutate tabs, panes, views, chats, agents, worktrees, review threads, or shared state only when the requested outcome requires it.
- Create an app-managed worktree only when the human explicitly requests a new worktree or branch. Never use worktree creation merely to obtain isolation or replace unavailable agent capability.
- Once the user has explicitly authorized the operation, execute it without asking again unless a destructive ambiguity remains.

## Step 2: Load current guidance

Run the relevant built-in instruction command before the first mutation in that area:

| Area | Command |
|---|---|
| Agents, teams, delegation | `sc instructions orchestration` |
| Tabs, panes, views, layout | `sc instructions layout` |
| Managed worktrees or branches | `sc instructions worktree` |
| In-app review threads | `sc instructions review` |

Use `sc help <command>` immediately before uncommon or destructive operations. Prefer current help over remembered syntax.

Load references conditionally:

| Requested outcome | Read |
|---|---|
| Launch, control, read, coordinate, or close agents/chats/layouts | [references/orchestration.md](references/orchestration.md) |
| Create/manage worktrees or in-app review threads | [references/worktrees-and-reviews.md](references/worktrees-and-reviews.md) |

## Step 3: Inspect capabilities and targets

Before orchestration or layout changes, run:

```bash
command -v sc
sc layout capabilities --output json
```

Then inspect only the state needed for safe targeting:

```bash
sc layout views --worktree "$PWD" --output json
sc agents list --worktree "$PWD" --output json
sc chat providers --json
```

- Confirm the requested launch shape appears under `layout_orchestration.run`.
- Confirm the provider is available and the requested UI/model is supported.
- If orchestration is disabled, report the exact error and direct the user to **Settings → Experimental → Agent orchestration**. Do not silently choose another mechanism.
- Prefer `label:NAME` or `id:STABLE_TARGET_ID` over volatile view/tab/pane indexes.
- Inspect views before any command that targets an index.

## Step 4: Select the narrowest control surface

For delegated Pi sessions, use `--provider pi --ui terminal` by default. Use chat mode only for an explicitly requested app UI outcome.

| Outcome | Use |
|---|---|
| Initial visible agent session | `sc layout run views|tabs|panes` |
| Default delegated Pi session | `sc layout run ... --provider pi --ui terminal` |
| Explicit chat-mode session in app UI | `sc layout run ... --ui chat` |
| Follow-up to an existing agent | `sc agent send` |
| Wait for completion and collect output | `sc agent wait`, then `sc agent read` |
| Redirect a running agent | `sc agent interrupt`, then `sc agent send` |
| Parallel fan-out/fan-in | `sc team run` |
| Sequential worker then reviewer | launch, wait/read, then launch reviewer |
| Layout-only broadcast/prefill/dry run | `sc layout send` |
| Stable names or broadcasts | `sc agents label`, `sc agents group` |
| Shared machine-readable coordination | `sc coordination-state` |
| App-managed worktree | `sc worktree` |
| In-app review thread | `sc worktree review-*` |
| Workspace/sidebar management | `sc workspace`, `sc section` |

Do not launch a replacement agent for a follow-up to an existing target.

## Step 5: Execute safely

- Use `--output json` for discovery, orchestration, coordination, and verification.
- Give every managed agent a short unique label when follow-ups are likely.
- Use `--active keep` unless the user asks to focus the new session.
- Use the current worktree explicitly when needed: `--worktree "$PWD"`.
- Use `--from-file` for long or shell-sensitive prompts and remove temporary files afterward.
- Pass the real task and relevant context, not a meta-prompt asking the new agent to rediscover the task.
- Pi `set_tab_title` is not authoritative for SC-managed tabs: SC auto-titling can replace it. Use `sc tab title` only when the human explicitly requests that UI title mutation.
- Use `--kill` only when the user requests force termination or normal cancellation fails.
- Never treat successful dispatch as completed work.

## Step 6: Wait, read, and verify

After launching or sending work:

1. Capture the returned selector, stable target id, conversation/session id, and label.
2. Wait for idle with a bounded timeout.
3. Read the response from the same stable target.
4. Check for `target_error`, provider failure, incomplete snapshots, or missing content.
5. Relay only output actually returned by `sc` or the provider session.

A successful `run` or `send` confirms launch/queue admission, not turn completion. `--wait-until-idle` waits for availability before dispatch; it does not collect the resulting answer.

## Step 7: Clean up when requested

- Discover exact targets before closing them.
- Stop active work before closing when necessary.
- Close chat sessions with `sc chat close THREAD_ID` after obtaining thread ids from `sc chat list --json`.
- Close views only after inspecting `sc layout views`; use `sc layout close` with the documented target.
- Remember that `sc agent stop`, `sc layout stop`, and `sc tab stop` stop work but do not necessarily remove the UI container.
- Never close the current parent session unless the user explicitly asks.
- Re-list agents/chats/views afterward and verify only the intended targets disappeared.

## Step 8: Report the outcome

Report concisely:

- what was launched, changed, or closed;
- provider, model, UI mode, and label when relevant;
- the verified agent response or final state;
- any capability restriction or failure exactly as returned.

Do not dump raw orchestration JSON unless the user requests it.
