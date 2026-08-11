---
name: superconductor
description: Operates the super.engineering/Superconductor `sc` CLI for app-managed chats, tabs, panes, views, agents, teams, worktrees, and review threads. Use for agents, subagents, workers, delegation, parallel work, teams, provider/model-specific work, or app-managed UI, session, worktree, and review operations.
compatibility: Requires the super.engineering/Superconductor app and the `sc` CLI. Some operations require Experimental Agent orchestration.
---

# Superconductor CLI

Use `sc` as the default control plane for super.engineering sessions, orchestration, worktrees, and reviews. Treat live CLI instructions and capability output as authoritative.

## Step 1: Use SC by default and preserve destructive boundaries

- Pi may choose `sc` orchestration whenever agents, delegation, parallel work, teams, or session coordination materially help the task; no special SC keyword or additional permission check is required.
- Generic requests for subagents, workers, reviewers, delegation, or parallel work may be fulfilled through SC. Use provider-native subagents when the human explicitly requests native provider behavior or SC lacks the required capability.
- Choose delegation based on concrete benefit rather than task size alone.
- Keep tabs, panes, views, chats, agents, review threads, and shared state scoped to the requested work. Prefer non-disruptive launches with `--active keep`.
- Require explicit human intent for managed worktree creation or deletion, target-branch changes, force termination, destructive cleanup, closing or rearranging existing user sessions, and review-thread mutations unrelated to the requested workflow.
- Never use worktree creation merely to obtain delegation isolation or replace unavailable agent capability.
- Once the operation is selected and its scope is clear, execute it without asking again unless a destructive ambiguity remains.

## Step 2: Load current guidance

Run the relevant built-in instruction command before the first mutation in that area:

| Area                          | Command                         |
| ----------------------------- | ------------------------------- |
| Agents, teams, delegation     | `sc instructions orchestration` |
| Tabs, panes, views, layout    | `sc instructions layout`        |
| Managed worktrees or branches | `sc instructions worktree`      |
| In-app review threads         | `sc instructions review`        |

Use `sc help <command>` immediately before uncommon or destructive operations. Prefer current help over remembered syntax.

Load references conditionally:

| Requested outcome                                                | Read                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Launch, control, read, coordinate, or close agents/chats/layouts | [references/orchestration.md](references/orchestration.md)                 |
| Create/manage worktrees or in-app review threads                 | [references/worktrees-and-reviews.md](references/worktrees-and-reviews.md) |

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

| Outcome                                | Use                                                               |
| -------------------------------------- | ----------------------------------------------------------------- | ---- | ------ |
| Initial visible agent session          | `sc layout run views                                              | tabs | panes` |
| Default delegated Pi session           | `sc layout run ... --provider pi --ui terminal`                   |
| Explicit chat-mode session in app UI   | `sc layout run ... --ui chat`                                     |
| Follow-up to an existing agent         | `sc agent send`                                                   |
| Wait for completion and collect output | `sc agent wait`, then `sc agent read`                             |
| Redirect a running agent               | `sc agent interrupt`, then `sc agent send`                        |
| Parallel fan-out/fan-in                | `sc team run`                                                     |
| Workbench Pi role                      | `launch_agent` with explicit role; durable report/todo monitoring |
| External-provider code review          | `launch_review_agent`; nonce-bound SC comments + review artifact  |
| Raw sequential worker then reviewer    | launch, wait/read, then launch reviewer                           |
| Layout-only broadcast/prefill/dry run  | `sc layout send`                                                  |
| Stable names or broadcasts             | `sc agents label`, `sc agents group`                              |
| Shared machine-readable coordination   | `sc coordination-state`                                           |
| App-managed worktree                   | `sc worktree`                                                     |
| In-app review thread                   | `sc worktree review-*`                                            |
| Workspace/sidebar management           | `sc workspace`, `sc section`                                      |

Do not launch a replacement agent for a follow-up to an existing target.

## Step 5: Execute safely

- Use `--output json` for discovery, orchestration, coordination, and verification.
- Give every managed agent a short unique label when follow-ups are likely.
- Use `--active keep` unless the user asks to focus the new session.
- Use the current worktree explicitly when needed: `--worktree "$PWD"`.
- For long or shell-sensitive layout prompts, use `sc layout run --from-file` with JSONL—not plaintext. Each line requires `label` and `initial_message` and may include `system_prompt`; construct records with `jq -cn --arg ...` and remove the file afterward.
- Pass the real task and relevant context, not a meta-prompt asking the new agent to rediscover the task.
- In a managed Pi terminal, update the app tab title with `sc tab title "$TITLE" --to "id:terminal:$SUPERCONDUCTOR_TERMINAL_ID" --json`, and verify that `response.new_title` matches. Keep the stable target explicit because an untargeted command may not update the app tab.
- Use `--kill` only when the user requests force termination or normal cancellation fails.
- Never treat successful dispatch as completed work.

## Step 6: Wait, read, and verify

For raw SC launches or sends:

1. Capture the returned selector, stable target id, conversation/session id, and label.
2. Wait for idle with a bounded timeout.
3. Read the response from the same stable target.
4. Check for `target_error`, provider failure, incomplete snapshots, or missing content.
5. Relay only output actually returned by `sc` or the provider session.

A successful raw `run` or `send` confirms launch/queue admission, not turn completion. `--wait-until-idle` waits for availability before dispatch; it does not collect the resulting answer. Do not apply this raw idle protocol to Workbench-native launches: `launch_agent` waits for durable parent-report/todo agreement, and `launch_review_agent` waits for a nonce-bound final SC review comment and generated review artifact. In both cases, runtime idle is only a waiting state.

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
