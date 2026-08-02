# Pi Config

Personal global [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration. Clone it to `~/.pi/agent/` for shared settings, skills, prompt templates, extensions, and model configuration.

## Setup

```bash
mkdir -p ~/.pi
git clone git@github.com:HazAT/pi-config ~/.pi/agent
cd ~/.pi/agent && ./setup.sh
```

Add provider credentials to `~/.pi/agent/auth.json` and restart Pi. The optional providers in `models.json` use `PERSONAL_OPENROUTER_API_KEY` and `OPENROUTER_API_KEY` where applicable.

`setup.sh` requires this repository at `~/.pi/agent/`. It creates `settings.json` only when absent, so it does not overwrite local selections, then installs the two packages declared in the generated defaults.

## Checked-in defaults

| Setting | Value |
|---|---|
| Default provider | `openai-codex` |
| Default model | `gpt-5.6-sol` |
| Thinking level | `high` |
| Enabled models | none |
| Theme | `dark` |
| Thinking block | shown |
| Packages | `git:github.com/pasky/chrome-cdp-skill`, `git:github.com/HazAT/pi-parallel` |

`models.json` holds optional local and custom provider definitions. `models-store.json` is Pi runtime state and is intentionally ignored.

## Architecture

- **Workbench** (`extensions/workbench/`) is the durable layer for plans, todos, and role artifacts. It identifies Git repositories by common directory, so managed worktrees share one run history.
- **Superconductor** (`sc`) is the runtime control plane for explicitly requested visible sessions, labels, layouts, teams, coordination state, managed worktrees, and in-app reviews.
- **Skills and prompts** define the planner, coordinator, scout, worker, reviewer, and architecture-review contracts.

A Workbench run contains `run.json`, `plan.md`, `todos/`, and `artifacts/`. SC labels and coordination-state are runtime addresses, never the durable source of task completion. See [`extensions/workbench/README.md`](extensions/workbench/README.md) for the storage and tool contract.

## Orchestration policy

Superconductor is opt-in. Use it only when the human explicitly requests SC/Superconductor/super.engineering/orchestration, names another provider or model for delegated work, or requests app-managed UI such as tabs, panes, views, splits, or side-by-side agents. Generic requests for subagents, workers, reviewers, delegation, or parallel work use the current provider's native subagent capability; they do not authorize `sc` mutations.

Before mutating SC-managed state, load the matching live guide:

| Outcome | Required command |
|---|---|
| Agents, teams, or orchestration | `sc instructions orchestration` |
| Tabs, panes, views, or layouts | `sc instructions layout` |
| Managed worktrees or branches | `sc instructions worktree` |
| In-app review threads | `sc instructions review` |

Managed worktree creation/deletion, destructive cleanup, and in-app review-thread changes always require their own explicit request. Operational recipes launch delegated Pi sessions with `--provider pi --ui terminal`; chat mode is an explicit app UI exception. Pi `set_tab_title` is not authoritative for SC-managed tabs because SC auto-titling can replace it, so use `sc tab title` only for a human-requested title mutation. Launch is only dispatch: coordinators wait, read the exact target, check errors, and verify the corresponding Workbench artifact and todo state before advancing.

## Workflows and roles

- **`/plan <request>`** is an explicit, scoped SC trigger. Planning remains interactive in the current visible Pi chat through the final approach checkpoint. That chat then creates one Workbench run, writes `plan.md` and todos, and coordinates authorized execution.
- **Ordinary planning language** stays in the current chat unless another explicit SC trigger is present.
- **Scouts** are read-only and write `artifacts/<label>/report.md`.
- **Workers** join the supplied run, claim exactly one todo, verify their implementation, write `artifacts/<label>/result.md`, then complete or block it. Source-writing workers are sequential in a shared worktree unless managed worktrees were explicitly requested.
- **Reviewers** do not fix code; they always write the durable `artifacts/<label>/review.md`. Ordinary reviews are artifact-only. When the human separately authorizes an in-app SC review, the reviewer first loads `sc instructions review`, reads the existing open comments, replies to and resolves only comments verified as addressed, leaves still-actionable comments open, and publishes each new finding or one `[APPROVED]` summary in the Review tool. The reviewer verifies the resulting comment IDs/states with review list/get commands and records them in the Workbench artifact; neither SC state nor an idle session replaces that durable completion record.
- **Architecture review** records its durable findings at `artifacts/architecture/review.md`; interface alternatives use separate design artifacts.

## Skills and prompt templates

| Path | Purpose |
|---|---|
| `skills/plan/` | Interactive plan-to-coordinator workflow |
| `skills/scout/`, `skills/worker/`, `skills/review/` | Workbench role contracts |
| `skills/write-todos/` | Worker-ready durable todo guidance |
| `skills/superconductor/` | Explicit SC control-plane procedures and recipes |
| `skills/improve-codebase-architecture/` | Architecture deepening and interface-design workflow |
| `skills/commit/` | Required procedure before every Git commit |
| `skills/add-mcp-server/`, `skills/code-simplifier/`, `skills/frontend-design/`, `skills/github/`, `skills/iterate-pr/`, `skills/learn-codebase/`, `skills/session-reader/`, `skills/skill-creator/` | Specialized Pi workflows |
| `prompts/plan.md` | `/plan <description>` |
| `prompts/improve-codebase-architecture.md` | Architecture-review entry point |

## Extensions

| Path | Provides |
|---|---|
| `extensions/workbench/` | `run_workspace`, artifact, and todo tools plus `/runs` and `/todos` |
| `extensions/execute-command/` | `execute_command` for self-invoked slash commands and steer messages |

## Verification

```bash
jq empty settings.json models.json package.json
npm run test:workbench
git diff --check
```

To verify that the Workbench extension loads without the rest of the global configuration:

```bash
pi --no-extensions --no-skills --no-prompt-templates --no-context-files \
  -e ./extensions/workbench/index.ts --list-models gpt-5.6
```

## Update

```bash
cd ~/.pi/agent
git pull
./setup.sh
```
