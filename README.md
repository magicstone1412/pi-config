# Pi Config

Personal global [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration. Clone it to `~/.pi/agent/` for shared settings, skills, prompt templates, extensions, and model configuration.

## Setup

```bash
mkdir -p ~/.pi
git clone git@github.com:magicstone1412/pi-config ~/.pi/agent
cd ~/.pi/agent && ./setup.sh
```

`~/.pi/agent` is Pi's global configuration directory. If it already exists, do not clone over it: clone this repo elsewhere, set `PI_CODING_AGENT_DIR` to that checkout, and run `./setup.sh` from there, or merge the repo files into the existing directory first.

Add provider credentials to `auth.json` in the Pi config directory and restart Pi. `setup.sh` runs headlessly on Linux or on Windows through Git Bash, MSYS2, or Cygwin. It installs the configured Git-backed packages and preserves existing `settings.json`, `models.json`, provider credentials, and installed packages. Existing settings therefore keep their provider/model defaults; the repo's non-package settings are only applied when you merge them yourself. The script intentionally skips `pi-macos-harness`, which is macOS-only. Run `./link-claude.sh` separately only if you also want the skills and prompts linked into Claude Code.

## Session-file workflow

The workflow is four explicit prompt commands:

1. **`/plan <request>`** — loads the planning skill, investigates interactively, records the selected approach, and stops.
2. **`/todos`** — loads the todo-writing skill, converts the selected plan into worker-ready todos, and stops.
3. **`/execute`** — reads the plan and todos, uses raw Superconductor orchestration, runs source-writing workers sequentially, verifies each focused commit, and updates todo evidence from the coordinator session.
4. **`/review`** — runs an independent local SC review team, automatically repairs blocking findings with sequential workers, and re-reviews to approval or a bounded stop.

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
- Synchronous teams omit `--notify self`; the coordinator waits for role targets and collects durable reports from `sc team status` without requiring the user to submit a generated follow-up.
- A `NEEDS CHANGES` review launches sequential repair workers automatically, verifies their commits, and runs a fresh review. Repair is bounded to two rounds.
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
| `skills/pi-extension-development/` | Manual-only standards for standalone Pi extension repositories and releases |
| `skills/go-hugo/` | Hugo site creation, content, themes, modules, mounts, and GitHub Pages deployment |
| `skills/commit/` | Required procedure before every Git commit |
| `extensions/execute-command/` | `execute_command` for self-invoked slash commands and steer messages |
| `settings.json`, `models.json`, `mcp.json` | Pi configuration |

Pi discovers global prompt templates from `~/.pi/agent/prompts/*.md` and skills from directories under `~/.pi/agent/skills/` that contain `SKILL.md`.

## Verification

Run these commands from the checkout after setup:

```bash
jq empty settings.json models.json mcp.json package.json
git diff --check
pi list
pi --no-session --no-context-files --list-models
```

The last command confirms that Pi can load the configured provider/model catalog without starting a session. If you keep an existing global `settings.json`, verify the effective values with:

```bash
jq '{defaultProvider, defaultModel, packages}' "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
```

If package installation reports blocked install scripts or audit findings, review them before enabling scripts or applying automatic fixes; do not use `npm audit fix --force` as part of setup.

## Update

```bash
cd ~/.pi/agent
git pull
./setup.sh
```
