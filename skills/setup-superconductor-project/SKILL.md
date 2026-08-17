---
name: setup-superconductor-project
description: Configures a repository for super.engineering with repo-owned worktree setup and development-server scripts. Use when asked to "make this project Superconductor ready", "set up super.engineering", "add worktree setup", or "configure the dev server".
compatibility: Requires the super.engineering app and `sc` CLI.
---

# Set Up a Superconductor Project

Configure the current repository's `.superconductor/config.json` through the supported `sc project scripts` interface. Do not create a worktree, commit, push, or open a browser unless separately requested.

## Step 1: Load Live Guidance

1. Read `~/.pi/agent/skills/superconductor/SKILL.md`.
2. Run `sc instructions project` and `sc project scripts --help` before mutation.
3. Inspect current state:

```bash
sc project scripts --json
sc project scripts check --json
sc worktree status --json
git status --short --branch
```

Treat live instructions and current help as authoritative.

## Step 2: Derive Commands from Repository Evidence

Read repository instruction files, the existing `.superconductor/config.json` when present, root manifests, lockfiles, workspace configuration, and package scripts.

Choose commands only when repository evidence supports them:

- Derive setup from the committed package-manager lockfile, such as `pnpm install --frozen-lockfile` or `npm ci`.
- Prefer an existing `dev` or `start` script for the default run target.
- Inspect the framework CLI help before adding host, port, or forwarding arguments. Do not guess flag syntax.
- For a browser-facing development server, configure an IPv4-reachable bind address when the framework supports it; verify the exact invocation. For example, Astro accepts `pnpm run dev --host 0.0.0.0`, while other frameworks differ.
- Preserve an existing valid setup or run command unless evidence shows it is wrong.
- Ask one focused question when the package manager, run script, or intended service is ambiguous.

Do not invent teardown, stop, or cleanup commands. Add them only when the repository already defines the required lifecycle behavior.

## Step 3: Write Repo-Owned Configuration

Use repo scope so managed worktrees inherit the configuration. Use `sc`, not direct JSON replacement, because it preserves unknown fields and validates atomically.

```bash
sc project scripts set setup "<verified setup command>" --scope repo --json
sc project scripts set run devserver --default "<verified run command>" --scope repo --json
```

If no setup command is needed, do not add an empty one. If the repository already has multiple named run targets, preserve them and choose a descriptive name for the new target rather than replacing unrelated entries.

## Step 4: Verify

1. Validate the resulting config:

```bash
sc project scripts check --json
```

2. Run the setup command once when it is safe and non-destructive.
3. Start the configured target through `sc project scripts run <name> --json`.
4. Confirm `sc project scripts status --json` reports it running.
5. When the service exposes HTTP and its port is known from evidence, request its IPv4 loopback URL and require a successful response.
6. Stop the target after verification unless the user asked to leave it running, then verify it is idle.
7. Inspect `.superconductor/config.json`, `git diff`, and `git status --short`.

A successful process launch without a reachable service is not sufficient verification for a browser-facing app.

## Step 5: Report

Report:

```markdown
Configured `.superconductor/config.json`:
- Setup: `<command>` or none
- Default run target: `<name>` — `<command>`

Verification:
- Config validation — pass/fail
- Setup — pass/skipped with reason
- Runtime state — running/failed
- Service check — URL and result, or not applicable
- Final runtime state — idle or intentionally left running

Files changed:
- `.superconductor/config.json`
```

Leave the configuration uncommitted unless the user separately requests a commit.
