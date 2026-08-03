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
launch_agent({ label, prompt, todoId?, model?, reasoning? })
```

Launches one labeled Pi terminal with `sc layout run tabs --provider pi --ui terminal --active keep` in Pi's current working directory. The prompt is passed directly as one argv value, including when multiline; no shell interpolation or temporary prompt file is used. Optional model and reasoning values must be verified by the coordinator before the call.

Worker launches pass `todoId` (or use the deterministic `TODO-NNN` label segment). Before SC dispatch, Workbench atomically reserves that todo for the launch label. A second launch for the same todo is rejected while the reservation or worker claim exists. The matching worker consumes the reservation when it claims the todo; other labels cannot claim it. Force-recovery permits a replacement only under a new retry label, preserving an unambiguous attempt history.

The result preserves SC's raw JSON response and exposes only identifiers SC actually returned: label, selector, stable target ID, session ID, and conversation ID. Model-facing JSON is capped at Pi's 50 KB / 2,000-line custom-tool limits, with identifiers kept in the visible prefix. If truncated, the result marks that complete structured launch data remains in tool details. A successful call means dispatch was accepted, not that the agent completed its Workbench assignment.

### `wait_for_agent`

```text
wait_for_agent({ target, timeoutMs?, last? })
```

Runs `sc agent wait --idle` for the exact target. Only after that succeeds, it runs `sc agent read` for the same target. `timeoutMs` is passed to SC's idle wait and `last` limits transcript entries read. The pending tool update represents only the in-flight SC wait.

Nonzero SC exits, malformed JSON, timeouts, and structured `target_error` responses fail the tool. Cancellation is forwarded to launch, wait, and read processes. Model-facing wait/read JSON is capped at Pi's 50 KB / 2,000-line custom-tool limits while complete structured data remains in tool details. A truncation marker instructs the coordinator to call `wait_for_agent` again with a smaller `last` value for a bounded transcript. Successful wait/read output remains runtime evidence only: callers must separately verify the Workbench todo and artifact before advancing.

A coordinator's supported sequential path is therefore:

```text
launch_agent({ label: "RUN_ID-worker-TODO-001", todoId: "TODO-001", prompt: "<complete role prompt>" })
wait_for_agent({ target: "label:RUN_ID-worker-TODO-001", timeoutMs: 120000, last: 20 })
todo({ action: "get", id: "TODO-001" })
read_artifact({ path: "artifacts/RUN_ID-worker-TODO-001/result.md" })
```

The first call confirms dispatch only, and the second performs SC wait + read only. The coordinator advances only after the todo and artifact provide the required durable acceptance evidence and the worker's recorded focused commit SHA is verified.

## Durable Workbench tools

- `run_workspace` — create, join, inspect, list, or update runs.
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
