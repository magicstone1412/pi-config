# Superconductor Orchestration Reference

Use these recipes only after checking live instructions and capabilities. Replace example providers, models, labels, prompts, worktrees, and targets with verified values. Delegated Pi sessions default to `--provider pi --ui terminal`; chat-mode examples below are explicit UI exceptions.

## Contents

- Discovery
- Launching sessions
- Side-by-side agents
- Follow-ups and collection
- Sequential handoffs
- Parallel teams
- Targeting and groups
- Steering and stopping
- Cleanup
- Coordination state
- Other read-only surfaces

## Discovery

```bash
sc instructions orchestration
sc instructions layout
sc layout capabilities --output json
sc layout views --worktree "$PWD" --output json
sc agents list --worktree "$PWD" --output json
sc chat providers --json
```

Use provider keys from capability output. Use model ids from `sc chat providers --json`. Check these capability fields:

- `team_runs`
- `layout_orchestration.run`, `send`, `stop`, `state`, `read`, `move`
- provider `available`
- provider `terminal_chat_compatible`
- provider `terminal_to_api_chat`
- provider `structured_read`

## Launching sessions

### Explicit chat-mode Pi tab

```bash
sc layout run tabs \
  --provider pi \
  --ui chat \
  --model openai-codex/gpt-5.4-mini \
  --reasoning low \
  --label mini-task \
  --prompt 'Answer the requested question.' \
  --worktree "$PWD" \
  --active keep \
  --output json
```

### Terminal-mode agent tab

```bash
sc layout run tabs \
  --provider pi \
  --ui terminal \
  --label worker \
  --prompt 'Perform the requested task.' \
  --worktree "$PWD" \
  --active keep \
  --output json
```

Change `tabs` to `panes` or `views` only when the requested UI shape and capability output support it. Open a plain terminal with provider `terminal` and no prompt.

For long or shell-sensitive prompts, write the JSONL records required by `--from-file`; a plaintext prompt file is invalid. Each line requires `label` and `initial_message` and may include `system_prompt`:

```bash
set -e
label="worker"
prompt_file="$(mktemp)"
trap 'rm -f "$prompt_file"' EXIT
jq -cn --arg label "$label" --arg message "$PROMPT_TEXT" \
  '{label: $label, initial_message: $message}' >"$prompt_file"
sc layout run tabs --provider pi --ui terminal --from-file "$prompt_file" \
  --worktree "$PWD" --active keep --output json
rm -f "$prompt_file"
trap - EXIT
```

Clean up the temporary file even if launch fails.

## Side-by-side agents

Launch the first tab and activate it, then split that active tab:

```bash
sc layout run tabs --provider pi --ui terminal --label implementer --prompt 'Implement the task.' \
  --worktree "$PWD" --active new --output json
sc tab split --direction right --provider codex --ui chat --active new \
  --worktree "$PWD" --output json
sc agents list --worktree "$PWD" --output json
```

A single launch accepts one provider. Label the second target after discovering it if the split command did not assign a stable label:

```bash
sc agents label set --to id:STABLE_TARGET_ID reviewer --worktree "$PWD" --output json
```

## Follow-ups and collection

```bash
sc agent send --to label:worker --prompt 'Continue with this correction.' \
  --queue --worktree "$PWD" --output json
sc agent wait --to label:worker --idle --timeout-ms 120000 \
  --worktree "$PWD" --output json
sc agent read --to label:worker --last 20 --worktree "$PWD" --output json
```

Interpret the phases correctly:

1. `send` confirms dispatch or queue admission.
2. `wait --idle` confirms the target settled.
3. `read` retrieves the answer.

If structured output is unavailable, use `sc layout read` or the terminal snapshot and state that the read is snapshot-based. Do not invent content when a read returns metadata without text.

Use `sc agent subscribe` when the user requests streaming observation or pattern-based waiting.

## Sequential handoffs

For “A performs the task, then B reviews”:

1. Launch A with a stable label.
2. Wait for A to become idle.
3. Read and verify A's result.
4. Launch B with the relevant result, files, or target context.
5. Wait for B and read its result.

Do not launch B concurrently when the review depends on A's completed output.

## Parallel teams

Prefer a team run for durable fan-out/fan-in across 1–8 roles:

```bash
sc team run \
  --label researcher --provider pi --prompt 'Research the requested topic.' \
  --label reviewer --provider codex --prompt 'Independently review the requested topic.' \
  --worktree "$PWD" \
  --output json
```

Each role must finish with:

```bash
sc team report --run RUN_ID --role ROLE --status done \
  --summary 'Concise result summary.' --worktree "$PWD" --output json
```

Use `--result-file` for details beyond the 16 KiB report-summary limit. `sc team run` has no `--ui` flag, so use individually launched terminal-mode Pi sessions when the default UI must be selected. For synchronous collection, capture returned role target IDs, wait for them, then read durable reports from `sc team status`; inspect a role transcript only when its report is missing or failed. Omit `--notify self`: it prefills a follow-up in the creator's editor and can require manual submission. Reserve it for explicitly asynchronous workflows where the coordinator ends its turn after launch. A team run provides parallelism, not sequencing. Nonterminal runs become interrupted after an app restart and are not resumed automatically.

## Targeting and groups

Prefer targets in this order:

1. `label:NAME`
2. `id:STABLE_TARGET_ID`
3. `group:NAME` for intentional broadcasts
4. layout indexes only after fresh inspection

Manage groups with:

```bash
sc agents group create reviewers --agent label:reviewer-a --agent label:reviewer-b \
  --worktree "$PWD" --output json
sc agents group list --worktree "$PWD" --output json
```

Use `sc help agents` for add/remove/delete syntax.

## Steering and stopping

Redirect a running turn without destroying the session:

```bash
sc agent interrupt --to label:worker --signal interrupt \
  --worktree "$PWD" --output json
sc agent send --to label:worker --prompt 'Use the corrected requirement.' \
  --queue --worktree "$PWD" --output json
```

Cancel current work:

```bash
sc agent stop --to label:worker --worktree "$PWD" --output json
```

Add `--kill` only to force-kill a terminal process. Stopping does not necessarily close its pane, tab, view, or chat.

## Cleanup

### Chat sessions

```bash
sc chat list --json
sc chat close THREAD_ID
sc chat list --json
```

Do not confuse `conversation_id` with `thread_id`; use the identifier accepted by current `sc help chat` output. Verify the current parent chat remains open.

### Views and terminal work

```bash
sc layout views --worktree "$PWD" --output json
sc layout stop --to label:worker --worktree "$PWD" --output json
sc layout close --target view:N --worktree "$PWD" --json
```

Inspect current help before closing because closeable target shapes may differ by release. `sc tab stop` stops a tab/pane process but does not guarantee UI removal.

## Coordination state

Use coordination state for machine-readable locks, votes, decisions, or summaries:

```bash
sc coordination-state get KEY --worktree "$PWD" --output json
sc coordination-state set KEY '{"status":"ready"}' --if-version VERSION \
  --worktree "$PWD" --output json
sc coordination-state watch --key KEY --from-version VERSION \
  --worktree "$PWD" --output json
sc coordination-state delete KEY --if-version VERSION \
  --worktree "$PWD" --output json
```

Use `--if-version` for competing writers.

## Other read-only surfaces

```bash
sc status --json
sc workspace list --json
sc workspace watch --json
sc history list --cwd "$PWD" --main-repo MAIN_REPO
```

Use `sc workspace open/select`, `sc section`, and `sc layout set/insert/move/save/apply` only for an explicitly requested UI outcome. In a managed Pi terminal, update the app tab title with `sc tab title "$TITLE" --to "id:terminal:$SUPERCONDUCTOR_TERMINAL_ID" --json` and verify that `response.new_title` matches. Do not omit the stable target: the untargeted form may resolve without changing the app tab. Inspect current help first.
