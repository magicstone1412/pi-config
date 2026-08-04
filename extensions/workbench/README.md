# Workbench Extension

Durable run workspaces for Pi sessions orchestrated through Superconductor. SC owns visible sessions and runtime control; Workbench owns plans, todos, and agent-produced files.

## Storage

Each Git repository gets one identity derived from its Git common directory, so its managed worktrees share history:

```text
~/.pi/history/<repository-id>/
├── repository.json
└── runs/<run-id>/
    ├── run.json
    ├── plan.md
    ├── todos/
    │   └── TODO-001.md
    └── artifacts/
        ├── scout-api/report.md
        ├── worker-001/result.md
        └── reviewer/review.md
```

A non-Git directory uses its canonical path as the identity source.

## Automatic workspace membership

A clean Pi session started by Superconductor automatically joins a deterministic Workbench workspace run for its managed worktree. The extension detects Superconductor's managed-session environment, including its workspace/worktree path, name, and terminal identity, creates the workspace run once under the repository's shared history, and persists membership in the Pi session before the first prompt. The footer immediately shows `WB <workspace> · workspace`, and the first model turn receives the active Workbench context.

The automatic workspace run is stable across clean sessions in the same managed worktree and starts in `ready/workspace` state. Ordinary Pi sessions outside Superconductor and resumed sessions with conversational history are not auto-joined. Existing persisted task-run membership always wins.

## Agent handshake

The automatic workspace is the ambient orchestration context, not a replacement for a dedicated task run. A coordinating Pi session creates a task run when a workflow needs its own plan, todos, artifacts, and lifecycle. When it is coordinating a repository other than its current directory, it passes that repository as `projectPath`. Every SC-launched Pi role receives the task run ID, role, label, and optional todo ID in its launch prompt, then calls:

```text
run_workspace({ action: "join", runId: "...", role: "scout", label: "run-scout-api" })
```

Joining the dedicated task run replaces the ambient membership and persists it in the Pi session. Subsequent artifact and todo calls automatically use that run, including after session resume. The additive footer status uses a compact `WB` prefix, shows the workspace name for ambient membership, strips task-run timestamps for display, bounds the run slug, and shows role/todo identity without repeating a redundant run-scoped SC label. A nonredundant label suffix remains visible. The status refreshes when membership or todo assignment changes and clears when no valid membership can be restored; persisted membership values are unchanged.

Only the clean-session bootstrap uses Superconductor's managed-session environment to establish ambient membership. Dedicated task-run membership is explicit and durable; it is never inferred from the active SC view, label, or coordination state. SC labels and coordination-state are runtime controls; Workbench files are durable state.

## Native SC execution tools

Both native tools require active Workbench membership. They are focused execution primitives, not orchestration policy: callers still perform raw SC capability/model preflight and choose prompts, roles, verified models, sequencing, and durable completion criteria. Raw SC also remains necessary for teams, send/interrupt/stop, review commands, and unsupported launch topologies.

### `launch_agent`

```text
launch_agent({ label, prompt, todoId?, model?, reasoning?, interactive? })
```

Launches one labeled Pi terminal with `sc layout run tabs --provider pi --ui terminal --active keep` in Pi's current working directory. The prompt is passed directly as one argv value, including when multiline; no shell interpolation or temporary prompt file is used. Optional model and reasoning values must be verified by the coordinator before the call.

Worker launches pass `todoId` (or use the deterministic `TODO-NNN` label segment). Before SC dispatch, Workbench atomically reserves that todo for the launch label. A second launch for the same todo is rejected while the reservation or worker claim exists. The matching worker consumes the reservation when it claims the todo; other labels cannot claim it. Force-recovery permits a replacement only under a new retry label, preserving an unambiguous attempt history.

The launch tool returns immediately with a compact green `started` result and terminates that coordinator turn. An extension-owned background watcher first requires positive evidence that the new target entered `working`; it never accepts the transient idle state between terminal creation and prompt startup as completion. After startup, it waits in internal 120-second windows, updates the live panel, and reads the target when it becomes idle. Completion or failure is delivered later as a separate themed message block and automatically starts the coordinator's next turn. The coordinator does not call another tool, poll, or inspect the child session while monitoring is healthy.

For worker launches, runtime idle is still insufficient: the watcher renders a green completion only when the assigned Workbench todo is durably `done`. An idle worker with an `open`, `in_progress`, `blocked`, or `failed` todo produces a failure block and explicitly prevents dependent work from launching. The automatically awakened coordinator must then verify the Workbench artifact and focused commit before advancing.

### Interactive agents and `report_to_parent`

Set `interactive: true` for long-lived agents where the user works directly in the child tab. These agents do not complete when they become idle; idle simply means they are waiting for another user message. The launch prompt first requires the child to join the parent's exact Workbench run with role `interactive` and its launch label; this handshake makes `report_to_parent` available and prevents ambient workspace membership from being mistaken for delegated identity. The child then uses:

```text
report_to_parent({ status: "needs_input", summary: "Choose A or B" })
report_to_parent({ status: "done", summary: "Final design approved" })
```

`needs_input` creates an amber message block in the parent, wakes the coordinator, keeps the child alive, and leaves the panel row in `waiting`. `done` verifies any assigned todo, creates the final green parent block, removes the panel row, and gracefully closes the child session. Reports are atomic, durable Workbench state rather than transient terminal text.

Active monitor records are persisted in the parent Pi session. Reload aborts the old in-memory watcher and the new extension instance restores it, including interactive report polling, panel metrics, and the original elapsed start time.

### `wait_for_agent`

```text
wait_for_agent({ target, last? })
```

This is an explicit recovery tool, not part of the normal launch lifecycle. Use it only after automatic monitoring failed or was interrupted and the user chose to retry. If the launch-owned watcher is still active, the tool returns immediately and tells the coordinator to await automatic delivery instead of creating a second wait row.

A structured target/provider error becomes a delegated-agent failure. Control-plane connection errors, unavailable APIs/WebSockets, malformed responses, and transcript-read failures become monitoring failures and explicitly state that the delegated agent may still be running. These failures arrive as a separate result block and instruct the coordinator to stop and ask the user whether to inspect, retry, or stop rather than relaunch automatically.

A coordinator's supported sequential path is therefore:

```text
launch_agent({ label: "RUN_ID-worker-TODO-001", todoId: "TODO-001", prompt: "<complete role prompt>" })
# Background watcher delivers a new completion/failure message and wakes the coordinator.
todo({ action: "get", id: "TODO-001" })
read_artifact({ path: "artifacts/RUN_ID-worker-TODO-001/result.md" })
```

The coordinator advances only after the todo and artifact provide the required durable acceptance evidence and the worker's recorded focused commit SHA is verified.

## Live agent panel

Workbench renders launched and monitored agents in a bordered panel above the editor. Each row shows a compact worker/scout/reviewer identity and elapsed time. Once the child session records model activity, the right side shows real assistant-turn count and accumulated provider cost (including nested tool, compaction, and branch-summary usage) instead of a synthetic check counter. Starting, delegated failure, and monitoring failure states remain explicit.

The panel incrementally reads only newly appended JSONL session entries once per second. When monitoring an already-running target after reload, Workbench resolves its Pi session path from one bounded runtime read so metrics do not depend on the original launch response remaining in memory. The panel supports multiple tracked agents, preserves failed rows while the user decides how to proceed, removes completed agents, and clears when no agents remain. Rendering is width-bounded for narrow terminals and uses the active Pi theme.

## Durable Workbench tools

- `run_workspace` — create, join, inspect, list, or update runs.
- `report_to_parent` — send `needs_input` or final `done` from an interactive delegated agent.
- `write_artifact` — write or append `plan.md` and files beneath the run root.
- `read_artifact` — read a run file with line slicing and output limits.
- `list_artifacts` — list plans and agent files, excluding internal state and todos.
- `todo` — list, get, create, update, append, claim, release, force-release, block, complete, or delete run todos.

Todo files contain JSON metadata followed by a Markdown body. Claims are session-aware, dependencies must be complete before claim and completion, and generic updates cannot mark work in progress or done. Completion is allowed only for the current assignee and requires non-empty verification plus at least one existing, safe artifact file.

Claimed workers hold a fenced single-writer lease around `bash`, `edit`, `write`, and `write_artifact`. A coordinator cannot force-release the claim during one of those operations. Once force-released, the old session cannot reclaim the todo and all later guarded mutations fail even if its Pi process continues running. This couples durable ownership to filesystem mutation instead of trusting SC idle/stop state.

A coordinator may recover a claim or an unclaimed launch reservation left by a disappeared worker only with the explicit `force_release` action and a non-empty reason. Each force release records the previous assignment/reservation, coordinator identity, reason, and timestamp in the todo. Workers must never force-release claims.

Artifact paths reject reserved root names regardless of case and reject existing symbolic-link components. Artifact references are normalized run-relative paths. Writes use token-owned cross-process lock files plus atomic replacement; stale takeover and cleanup remove a lock only while its ownership token still matches.

## Commands

- `/runs` — browse and join repository runs.
- `/todos` — browse and manage todos in the active run.

## Verification

```bash
npm run test:workbench
pi --no-extensions --no-skills --no-prompt-templates --no-context-files \
  -e ./extensions/workbench/index.ts --list-models gpt-5.6
```
