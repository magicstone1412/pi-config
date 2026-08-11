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

The native launch tools require active Workbench membership. They are focused execution primitives, not orchestration policy: callers still perform raw SC capability/model preflight and choose prompts, roles, verified models, sequencing, and durable completion criteria. Raw SC remains necessary for teams, send/interrupt/stop, and unsupported launch topologies.

### `launch_agent`

```text
launch_agent({ label, role, prompt, todoId?, model?, reasoning?, interactive? })
```

Launches one labeled Pi terminal with `sc layout run tabs --provider pi --ui terminal --active keep` in Pi's current working directory. The prompt is passed directly as one argv value. Workbench appends an exact run/role/label/todo join handshake and requires a final `report_to_parent` call. Optional model and reasoning values must be verified before launch.

Worker launches pass `todoId` (or use the deterministic `TODO-NNN` label segment). Before SC dispatch, Workbench atomically reserves that todo for the launch label. A second launch for the same todo is rejected while the reservation or worker claim exists. The matching worker consumes the reservation when it claims the todo; other labels cannot claim it. Force-recovery permits a replacement only under a new retry label.

The tool returns immediately and terminates the coordinator turn. The background watcher first requires positive `working` evidence, then polls durable parent reports, todo state, and runtime state. Runtime idle—brief or sustained—is only `waiting`; it never marks an `open` or `in_progress` worker failed. A premature `done` report also remains waiting until the assigned todo is durably `done`. A completed todo may finish the monitor even if the worker's final report is lost, because todo completion already requires the claimed session, verification, and an existing artifact. Blocked/failed todos produce a needs-input handoff rather than a false runtime failure.

Every labeled Pi delegate uses:

```text
report_to_parent({ status: "needs_input", summary: "Blocked on an API choice" })
report_to_parent({ status: "done", summary: "TODO-001 is verified and committed" })
```

`needs_input` wakes the parent, keeps the child available, and leaves the row waiting. `done` is downgraded to `needs_input` when an assigned todo is not yet durably done. A valid `done` creates the final green parent block and removes the row, but leaves the finished agent pane open for inspection. Set `interactive: true` for user-driven sessions whose ordinary idle periods are expected; their idle state never generates timeout-style needs-input notices.

### `launch_review_agent`

```text
launch_review_agent({ label, provider, prompt, model?, reasoning? })
```

Launches a read-only external-provider reviewer and tracks it in the same Agents panel. The standard `/plan` and direct-review workflows select Claude Code with `claude-fable-5` and `high` reasoning after live capability verification. Workbench appends the run ID/root, Workbench artifact-reading requirements, full SC review-command contract, and a random per-launch completion nonce. Every finding must be published as a tagged, file-anchored `sc worktree review-add` comment. Approval or needs-changes must end with one final tagged comment containing the nonce and reconciliation evidence. Terminal prose and idle are never accepted.

When the reviewer becomes idle, Workbench reads SC review state from the monitored worktree, verifies the provider-authored nonce-bound final comment against one of two exact verdict prefixes, collects the reviewer's tagged comments, and writes `artifacts/<label>/review.md` automatically before waking the coordinator. Marker quotations, wrong authors, and malformed verdict comments cannot complete the review. A reviewer that idles without the marker remains waiting and eventually produces a needs-input notice, not a false completion.

Active monitor records use a versioned durable schema in the parent Pi session. Reload restores the completion contract, panel state, metrics when available, and original elapsed start time.

### `wait_for_agent`

```text
wait_for_agent({ target, last? })
```

This is an explicit recovery tool, not part of the normal launch lifecycle. Use it only after automatic monitoring failed or was interrupted and the user chose to retry. If the launch-owned watcher is still active, the tool returns immediately and tells the coordinator to await automatic delivery instead of creating a second wait row.

A structured target/provider error becomes a delegated-agent failure. Control-plane connection errors, unavailable APIs/WebSockets, malformed responses, and transcript-read failures become monitoring failures and explicitly state that the delegated agent may still be running. These failures arrive as a separate result block and instruct the coordinator to stop and ask the user whether to inspect, retry, or stop rather than relaunch automatically.

A coordinator's supported sequential path is therefore:

```text
launch_agent({ label: "RUN_ID-worker-TODO-001", role: "worker", todoId: "TODO-001", prompt: "<complete role prompt>" })
# Background watcher waits through transient idle and wakes on durable completion/input/failure.
todo({ action: "get", id: "TODO-001" })
read_artifact({ path: "artifacts/RUN_ID-worker-TODO-001/result.md" })
```

The coordinator advances only after the todo and artifact provide the required durable acceptance evidence and the worker's recorded focused commit SHA is verified.

## Live agent panel

Workbench renders launched and monitored Pi and external-provider agents in a bordered panel above the editor. Each row shows a compact worker/scout/reviewer identity, active runtime, and running/waiting/failure state. Waiting rows are amber and their active-runtime clock freezes until work resumes. When a Pi JSONL session is available, the right side also shows real assistant-turn count and accumulated provider cost; providers without a Pi JSONL session still receive full lifecycle tracking.

The panel incrementally reads only newly appended JSONL entries once per second. It supports multiple tracked agents, keeps ordinary idle amber as waiting, preserves only real delegated/monitoring failures while the user decides how to proceed, removes completed agents, and clears when no agents remain. Rendering is width-bounded for narrow terminals and uses the active Pi theme.

## Durable Workbench tools

- `run_workspace` — create, join, inspect, list, or update runs.
- `report_to_parent` — durably send `needs_input` or final `done` from any labeled delegated Pi agent.
- `launch_review_agent` — launch an external-provider reviewer, verify SC review comments, and generate its Workbench review artifact.
- `write_artifact` — write or append `plan.md` and files beneath the run root.
- `read_artifact` — read a run file with line slicing and output limits.
- `list_artifacts` — list plans and agent files, excluding internal state and todos.
- `todo` — list, get, create, update, append, claim, release, force-release, block, complete, or delete run todos.

Todo files contain JSON metadata followed by a Markdown body. Claims are session-aware, dependencies must be complete before claim and completion, and generic updates cannot mark work in progress or done. Completion is allowed only for the current assignee and requires non-empty verification plus at least one existing, safe artifact file.

Claimed workers hold a fenced single-writer lease around `bash`, `edit`, `write`, and `write_artifact`. A coordinator cannot force-release the claim during one of those operations. Once force-released, the old session cannot reclaim the todo and all later guarded mutations fail even if its Pi process continues running. This couples durable ownership to filesystem mutation instead of trusting SC idle/stop state.

A coordinator may recover a claim or an unclaimed launch reservation left by a disappeared worker only with the explicit `force_release` action and a non-empty reason. Each force release records the previous assignment/reservation, coordinator identity, reason, and timestamp in the todo. Workers must never force-release claims.

Artifact paths reject reserved root names regardless of case and reject existing symbolic-link components. Artifact references are normalized run-relative paths. Writes use token-owned cross-process lock files plus atomic replacement; stale takeover and cleanup remove a lock only while its ownership token still matches.

## Commands

- `/handoff` — open Pi's **Fork from Message** picker in a new Superconductor tab while leaving the parent open. Selecting an older user message creates a new session from the path before that message and restores the selected prompt in the editor, matching Pi's built-in `/fork` behavior. The fork launches in the same managed worktree and explicitly joins the same Workbench run under a new session and tab identity. Workbench runtime entries and agent monitors are not copied. If the parent has a claimed todo, the claim stays with the parent and the fork joins without a todo assignment.
- `/runs` — browse and join repository runs.
- `/todos` — browse and manage todos in the active run.

## Verification

```bash
npm run test:workbench
pi --no-extensions --no-skills --no-prompt-templates --no-context-files \
  -e ./extensions/workbench/index.ts --list-models gpt-5.6
```
