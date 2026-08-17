# Pi Config

Personal global [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration. Clone it to `~/.pi/agent/` for shared settings, skills, prompt templates, one small extension, and model configuration.

## Setup

```bash
mkdir -p ~/.pi
git clone git@github.com:HazAT/pi-config ~/.pi/agent
cd ~/.pi/agent && ./setup.sh
```

Add provider credentials to `~/.pi/agent/auth.json` and restart Pi. `setup.sh` requires this repository at `~/.pi/agent/`, preserves an existing `settings.json`, and installs the configured external packages.

## Session-file workflow

The workflow is four explicit prompt commands:

1. **`/plan <request>`** — loads the planning skill, investigates interactively, records the selected approach, and stops.
2. **`/todos`** — loads the todo-writing skill, converts the selected plan into worker-ready todos, and stops.
3. **`/execute`** — reads the plan and todos, uses raw Superconductor orchestration, runs source-writing workers sequentially, verifies each focused commit, and updates todo evidence from the coordinator session.
4. **`/review`** — uses the current session and Git state, plus plan/todos when available, to run a local SC team for independent read-only review and write the final verdict.

`PI_SESSION_FILE` is required. Handover state is plain Markdown beside the current Pi session:

```text
${PI_SESSION_FILE%.jsonl}.plan.md
${PI_SESSION_FILE%.jsonl}.todos.md
${PI_SESSION_FILE%.jsonl}.review.md
```

There is no sidecar directory, repository run store, membership system, or custom JSONL state. The current coordinator owns all writes. Delegated agents receive resolved absolute paths in their SC prompts, read the handovers directly, and return results through SC. `/review` requires only the session JSONL; the plan and todos files are optional context so directly implemented work can be reviewed without first running `/plan` or `/todos`.

The todos file uses stable IDs, dependency and status fields, objective acceptance criteria, verification evidence, and commit SHAs. Workers never edit it themselves.

## Superconductor policy

Workflow orchestration uses the `sc` CLI directly. Before launching agents or teams, read `skills/superconductor/SKILL.md` and run `sc instructions orchestration`; live instructions and capability output override remembered syntax.

- Source-writing workers share the checkout and run sequentially.
- Every successful worker reads `skills/worker/SKILL.md` and the commit skill, creates one focused verified commit, reports its full SHA, and does not push.
- The coordinator waits for and reads each stable worker target, checks errors, verifies the commit with Git, then updates the todos file.
- Review team members are independent and read-only. They report through their SC team context; only the coordinator writes the review file.
- Dispatch or idle state never proves completion.

The workflow does not create worktrees or branches, arrange fixed panels, ship, push, open PRs, merge, or clean up sessions. Those outcomes require separate explicit requests and the relevant live SC instructions.

## Repository layout

| Path | Purpose |
|---|---|
| `prompts/plan.md` | `/plan <request>` |
| `prompts/todos.md` | `/todos` |
| `prompts/execute.md` | `/execute` |
| `prompts/review.md` | `/review` |
| `prompts/superconductor-setup.md` | `/superconductor-setup [requirements]` |
| `skills/plan/` | Interactive planning and plan Markdown format |
| `skills/write-todos/` | Worker-ready todo decomposition and format |
| `skills/worker/` | One-todo implementation, verification, commit, and response contract |
| `skills/review/` | Coordinator/team review roles and review Markdown format |
| `skills/scout/` | Read-only repository reconnaissance |
| `skills/superconductor/` | Central SC policy, syntax, and live-preflight guidance |
| `skills/setup-superconductor-project/` | Repo-owned worktree setup and development-server configuration |
| `skills/commit/` | Required procedure before every Git commit |
| `extensions/execute-command/` | `execute_command` for self-invoked slash commands and steer messages |
| `settings.json`, `models.json`, `mcp.json` | Pi configuration |

Pi discovers global prompt templates from `~/.pi/agent/prompts/*.md` and skills from directories under `~/.pi/agent/skills/` that contain `SKILL.md`.

## Verification

```bash
jq empty settings.json models.json mcp.json package.json
pi --no-extensions --no-context-files \
  --skill ./skills/plan/SKILL.md \
  --prompt-template ./prompts/plan.md \
  --list-models gpt-5.6
git diff --check
```

Also search the repository for names from the deleted extension and confirm no stale API or package references remain.

## Update

```bash
cd ~/.pi/agent
git pull
./setup.sh
```
