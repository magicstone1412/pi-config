---
name: pi-extension-development
description: Defines the local standard for standalone Pi extension repositories. Use when manually invoked to create, audit, test, publish, or release an extension with Git-backed installation, local loading, and Vite+ linting and formatting.
disable-model-invocation: true
---

# Pi Extension Development

Build standalone Pi extensions as Git-backed Pi packages with consistent local development, verification, and release workflows. Never publish these repositories to npm.

## Step 1: Establish the task

Interpret the arguments appended to the skill invocation as an operation and optional path:

- `create <path-or-name>` — scaffold a standalone extension repository.
- `audit <path>` — compare an existing repository against this standard.
- `release <version>` — apply the standardized release workflow to the current repository.
- No operation — ask what repository and outcome the user wants.

Before creating files, inspect the target path and read its `AGENTS.md`, `CLAUDE.md`, and applicable rule files. Never overwrite an existing repository or unrelated work.

## Step 2: Read only the needed reference

| Operation | Read |
|---|---|
| Create or restructure a repository | `references/repository-structure.md` |
| Implement or review extension code | `references/extension-guidelines.md` |
| Release or add a release skill | `references/release-workflow.md` |

For Pi APIs, read the installed Pi documentation completely before implementation:

- Extensions: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Packages: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`
- Skills: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md`
- TUI, when needed: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`

Follow relevant links and examples referenced by those documents.

## Step 3: Verify the development tools

Use the globally installed Vite+ CLI:

```bash
command -v pi
command -v vp
vp --version
```

If `vp` is absent, report that and stop before adding a substitute formatter or linter. Do not install standalone Oxlint, Oxfmt, ESLint, Prettier, or Vitest when Vite+ provides the needed command.

Use Vite+ for package operations and checks:

```bash
vp install
vp add -D vite-plus
vp check
vp check --fix
vp fmt --check
vp lint
```

The global `vp` executable drives the workflow. Keep `vite-plus` in `devDependencies` because `vite.config.ts` imports `defineConfig`; Git package production installs omit it.

## Step 4: Use the canonical package model

Require:

- A standalone Git repository under `~/Projects/` unless the user specifies another location.
- A `package.json` with `private: true`, `keywords: ["pi-package"]`, peer dependencies for Pi-provided imports, and an explicit `pi` manifest.
- TypeScript source loaded directly by Pi; do not add a build or bundled `dist/` directory unless runtime requirements make one necessary.
- Installation through `pi install git:github.com/OWNER/REPO`, never npm publication.
- A checked-in `.pi/settings.json` that disables an installed copy while loading checkout-local resources.
- Vite+ configuration, editor settings, and a checked-in `vp staged` pre-commit hook.
- A manual-only repository release skill under `.pi/skills/release/`.

## Step 5: Implement the minimum extension

Prefer one focused extension entry point and split files only when the implementation has real independent concerns. Reuse Pi APIs and Node built-ins before adding dependencies.

For custom tools:

- Use strict TypeBox schemas and `StringEnum` for string enums.
- Set `executionMode: "sequential"` for stateful, desktop-control, or otherwise conflicting operations.
- Honor `AbortSignal` and set bounded timeouts for subprocesses or network work.
- Truncate output to Pi limits and preserve full output in a temporary file when truncated.
- Throw errors to produce failed tool results.
- Return native image blocks for generated screenshots or previews.
- Start long-lived resources only after `session_start` or on demand, and close them during `session_shutdown`.

Do not request permissions, perform destructive setup, or mutate unrelated user configuration without explicit approval.

## Step 6: Configure local loading

Verify both paths:

```bash
# Explicit checkout loading
pi -e ./pi-extension/EXTENSION/index.ts --skill ./skills/SKILL/SKILL.md

# Git installation
pi install git:github.com/OWNER/REPO
```

When developing inside the checkout, `.pi/settings.json` must prevent duplicate global and local resources.

## Step 7: Verify before publishing

Run, at minimum:

```bash
vp check
pi --no-extensions -e "$PWD" --no-skills --list-models '__load_check__'
git diff --check
git status --short
```

Also execute the registered tool through Pi's extension loader or a fresh Pi session with a safe real scenario. Verify failure propagation, cancellation or timeout behavior, truncation when applicable, and cleanup of temporary artifacts.

## Step 8: Publish and install

Before any commit, read and follow the global `commit` skill. Create a focused conventional commit. Create or push a public GitHub repository only when the user authorizes publication.

After pushing, install from Git and verify the installed checkout rather than relying only on source-tree tests:

```bash
pi install git:github.com/OWNER/REPO
pi --no-context-files --list-models '__installed_load_check__'
```

Report repository URL, commit SHA, install command, verification evidence, and any remaining manual permission step.

## Exit criteria

Finish only when:

- `vp check` passes.
- Pi loads the local package and the Git-installed package.
- The repository and installed checkout are clean.
- No temporary test files remain.
- Documentation contains install, local development, permissions or prerequisites, verification, and release instructions.
