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
| Thinking block | hidden |
| Packages | `git:github.com/pasky/chrome-cdp-skill`, `git:github.com/HazAT/pi-parallel` |

`models.json` holds optional local and custom provider definitions. `models-store.json` is Pi runtime state and is intentionally ignored.

## Architecture

- **Workbench** (`extensions/workbench/`) is the durable layer for plans, todos, and role artifacts. A clean Superconductor-managed Pi session automatically joins a deterministic ambient workspace run for its worktree, so Workbench and orchestration tools are active from the first prompt. Dedicated workflows still create and join task-specific runs. Git repositories are identified by common directory, so managed worktrees share one run history. `launch_agent` dispatches and monitors an individual Pi terminal asynchronously, keeps live progress in the Agents panel, and delivers completion as a new message. Interactive launches remain alive across idle periods and explicitly notify the parent through `report_to_parent`; `wait_for_agent` is reserved for monitoring recovery.
- **Superconductor** (`sc`) is the runtime control plane for delegated work, visible sessions, labels, layouts, teams, coordination state, managed worktrees, and in-app reviews. Raw SC remains the interface for capability preflight, follow-up controls, teams, unsupported launch topologies, and review operations.
- **Skills and prompts** define the planner, coordinator, scout, worker, reviewer, and architecture-review contracts.

A Workbench run contains `run.json`, `plan.md`, `todos/`, and `artifacts/`. The automatic ambient run is stable per managed worktree; a supplied task run always replaces it for that Pi session. SC labels and coordination-state are runtime addresses, never the durable source of task completion. See [`extensions/workbench/README.md`](extensions/workbench/README.md) for the storage and tool contract.

## Orchestration policy

Inside super.engineering, Superconductor is available by default. Pi may use it for agents, workers, reviewers, delegation, parallel work, teams, and session coordination whenever doing so materially helps the task. Generic agent and delegation requests may be fulfilled through SC without a special trigger or an additional permission check. Provider-native subagents remain appropriate when the human explicitly requests native provider behavior or SC lacks the required capability.

Before the first mutation in an SC-managed area, load the matching live guide:

| Outcome | Required command |
|---|---|
| Agents, teams, or orchestration | `sc instructions orchestration` |
| Tabs, panes, views, or layouts | `sc instructions layout` |
| Managed worktrees or branches | `sc instructions worktree` |
| In-app review threads | `sc instructions review` |

Explicit human intent remains required for managed worktree creation/deletion, target-branch changes, force termination, destructive cleanup, closing or rearranging existing user sessions, and review-thread mutations unrelated to the requested workflow. The `/plan` contract includes its run-scoped final-review lifecycle, but not unrelated thread maintenance. Operational recipes prefer Workbench's async `launch_agent` lifecycle for supported individual Pi terminals and use `wait_for_agent` only to recover failed or interrupted monitoring; raw SC remains mandatory for live capability/model preflight, send/interrupt/stop, teams, unsupported topologies, and review commands. Chat mode is an explicit app UI exception. Managed terminal title updates use `sc tab title "$TITLE" --to "id:terminal:$SUPERCONDUCTOR_TERMINAL_ID" --json` and verify `response.new_title`. Native launch success is only dispatch, and the later automatic runtime result is only runtime evidence: coordinators still check errors and verify the corresponding Workbench artifact and todo state before advancing.

## Workflows and roles

- **`/plan <request>`** guarantees the complete SC workflow. Planning remains interactive in the current visible Pi chat through the final approach checkpoint. That chat then creates one Workbench run, writes `plan.md` and todos, coordinates execution through SC, and completes the run with SC's built-in final-review lifecycle plus the durable Workbench review artifact.
- **Ordinary planning language** stays in the current chat, but the coordinator may use SC for requested research, design, or execution when it helps. Planning language alone does not request implementation.
- **Scouts** are read-only and write `artifacts/<label>/report.md`.
- **Workers** join the supplied run, claim exactly one todo, verify their implementation, read the commit skill, create one focused commit without pushing, record its SHA in `artifacts/<label>/result.md`, then complete or block it. Source-writing workers are sequential in a shared worktree unless managed worktrees were explicitly requested. Workbench reserves worker launches per todo and fences `bash`/`edit`/`write`/artifact mutations to the current claim, so a force-released stale session cannot keep writing while a replacement runs.
- **Reviewers** do not fix code; they always write the durable `artifacts/<label>/review.md`. Reviews use in-app SC threads when the requested workflow includes them; otherwise they are artifact-only. A reviewer launched by exact `/plan` always uses the run-scoped SC review lifecycle: load `sc instructions review`, inspect and classify every open thread against the current diff, reply to and resolve only comments verified as addressed, leave still-actionable or unrelated comments untouched, and publish each new finding or one run-scoped `[APPROVED]` entry. The reviewer verifies the resulting comment IDs/states with review list/get commands and records them in the Workbench artifact; neither SC state nor an idle session replaces that durable completion record.
- **Architecture review** records its durable findings at `artifacts/architecture/review.md`; interface alternatives use separate design artifacts.

## Skills and prompt templates

| Path | Purpose |
|---|---|
| `skills/plan/` | Interactive plan-to-coordinator workflow |
| `skills/scout/`, `skills/worker/`, `skills/review/` | Workbench role contracts |
| `skills/write-todos/` | Worker-ready durable todo guidance |
| `skills/superconductor/` | Default SC control-plane procedures and recipes |
| `skills/improve-codebase-architecture/` | Architecture deepening and interface-design workflow |
| `skills/commit/` | Required procedure before every Git commit |
| `skills/add-mcp-server/`, `skills/code-simplifier/`, `skills/frontend-design/`, `skills/github/`, `skills/iterate-pr/`, `skills/learn-codebase/`, `skills/session-reader/`, `skills/skill-creator/` | Specialized Pi workflows |
| `prompts/plan.md` | `/plan <description>` |
| `prompts/improve-codebase-architecture.md` | Architecture-review entry point |

## Extensions

| Path | Provides |
|---|---|
| `extensions/workbench/` | Durable runs/todos/artifacts, async `launch_agent`, interactive `report_to_parent`, recovery waits, plus `/runs` and `/todos` |
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
