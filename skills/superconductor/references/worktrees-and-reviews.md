# Superconductor Worktrees and Reviews

Use app-managed worktree and review commands only for explicit human requests. Read live instructions before mutations.

## Managed worktrees

Start with:

```bash
sc instructions worktree
sc worktree status --json
sc worktree create --help
```

Rules:

- Use `sc worktree create` by default when the user explicitly requests an app-managed worktree or new branch.
- Do not replace it with `git worktree`, provider-specific worktrees, or manual directories unless the user requests that mechanism.
- Run creation only from a verified app-launched agent session.
- Read the managed identity, base branch, and target branch from `sc worktree status --json`; do not infer them from names or Git defaults.
- Give the new session the actual task with `--prompt`, `--stdin`, or `--from-file`.
- Never ask a newly created worktree session to create another worktree.
- Keep managed agents in their launch worktree. If another worktree is required, report that requirement to the human.
- Change the target branch only for an explicit outcome with `sc worktree set-target-branch BRANCH`.

Inspect before selecting, closing, or deleting:

```bash
sc worktree status --json
sc workspace list --json
```

Use `sc worktree close` to close app state and `sc worktree delete` only when deletion is explicitly requested. Inspect current help before destructive operations.

## In-app review threads

Start with:

```bash
sc instructions review
sc worktree review-checklist --json
sc worktree diff-summary --json
sc worktree review-list --json
```

Read a specific thread:

```bash
sc worktree review-get COMMENT_ID --json
```

Mutate review state only when required:

```bash
sc worktree review-add --file PATH --start-line START --end-line END \
  --provider PROVIDER --stdin --json
sc worktree review-reply COMMENT_ID --provider PROVIDER --stdin --json
sc worktree review-set-status COMMENT_ID STATUS --json
```

Use `--anchor file` instead of line ranges for file-level comments. Use `--resolve` on a reply only when the requested outcome includes resolution.

Treat review threads as super.engineering-managed state. Do not reconstruct or replace them with guessed state from source files, GitHub, or provider-specific APIs.

## Verification

After any mutation:

1. Re-run the corresponding status/list/get command.
2. Confirm the exact worktree or review-thread state changed.
3. Report identifiers and resulting state without dumping unrelated JSON.
