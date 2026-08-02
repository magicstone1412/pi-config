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

## Agent handshake

The coordinating Pi session creates a run. When it is coordinating a repository other than its current directory, it passes that repository as `projectPath`. Every SC-launched Pi session receives the run ID, role, label, and optional todo ID in its launch prompt, then calls:

```text
run_workspace({ action: "join", runId: "...", role: "scout", label: "run-scout-api" })
```

Joining persists membership in the Pi session. Subsequent artifact and todo calls automatically use that run, including after session resume.

Do not infer run membership from the active SC view. SC labels and coordination-state are runtime controls; Workbench files are durable state.

## Tools

- `run_workspace` — create, join, inspect, list, or update runs.
- `write_artifact` — write or append `plan.md` and files beneath the run root.
- `read_artifact` — read a run file with line slicing and output limits.
- `list_artifacts` — list plans and agent files, excluding internal state and todos.
- `todo` — list, get, create, update, append, claim, release, force-release, block, complete, or delete run todos.

Todo files contain JSON metadata followed by a Markdown body. Claims are session-aware, dependencies must be complete before claim and completion, and generic updates cannot mark work in progress or done. Completion is allowed only for the current assignee and requires non-empty verification plus at least one existing, safe artifact file.

A coordinator may recover a claim left by a disappeared worker only with the explicit `force_release` action and a non-empty reason. Each force release records the previous assignment, coordinator identity, reason, and timestamp in the todo. Workers must never force-release claims.

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
