---
name: plan
description: Interactive planning for requests to plan, brainstorm, design, create a plan, or build something. Uses Superconductor for research, coordination, and execution when it materially helps; exact `/plan` guarantees the complete SC execution and review workflow.
---

# Plan

Turn a request into a selected approach, a durable Workbench plan and todos, and, when implementation is requested, coordinate it through Superconductor's built-in orchestration and review surfaces.

The current visible Pi chat is both planner and coordinator. Keep the planning conversation here through the final approach checkpoint; never launch a replacement planner or hand control back to another session. After the user selects an approach, this same chat creates the run and coordinates execution.

## Orchestration Modes

### Exact `/plan`

The `/plan` workflow includes app-managed Superconductor orchestration and the built-in in-app SC final-review lifecycle for its Workbench run. Every `/plan` implementation role is launched and coordinated through SC, and artifact-only final review is not completion.

This workflow does **not** include managed worktree creation/deletion, destructive cleanup, or review-thread mutations unrelated to the run.

### Ordinary planning language

Requests such as “plan this,” “brainstorm,” or “design” do not by themselves request implementation. Keep the interactive planning conversation in the current chat, and use SC for requested research, design exploration, delegation, or implementation whenever it materially helps. After the final checkpoint, execute implementation only when the user's request includes it; SC itself requires no separate trigger or permission check.

## SC Preflight

Before the first SC mutation:

1. Read `~/.pi/agent/skills/superconductor/SKILL.md` and its `references/orchestration.md` completely. For exact `/plan`, also read `references/worktrees-and-reviews.md` completely.
2. Run `sc instructions orchestration` and `sc instructions layout`. For exact `/plan`, also run `sc instructions review`.
3. Run `command -v sc`, `sc layout capabilities --output json`, `sc layout views --worktree "$PWD" --output json`, `sc agents list --worktree "$PWD" --output json`, and `sc chat providers --json`.
4. Verify the requested launch shape, provider, model, UI mode, structured-read support, and reasoning level from live output. For exact `/plan`, verify the review checklist, diff, list/get, add, reply, and status commands from current help.

If SC or a requested capability is unavailable, state the exact limitation. Do not silently switch providers or orchestration mechanisms. Planning can continue in the current chat, but do not promise automatic SC execution that cannot run.

## Interactive Planning

Work interactively only through Phase 5. Use one focused conversational phase per assistant turn, end with the phase’s question, and wait for the user. Investigate codebase facts instead of asking the user to supply them. Do not edit implementation files or launch implementation roles before the checkpoint.

### Phase 1: Investigate Context

Orient to the repository with `ls`, `find`, `rg`, Git state, project instructions, and focused file reads. Identify existing patterns, tests, constraints, and relevant in-progress changes. End with:

> Here’s what I see… Does that match your understanding?

### Phase 2: Confirm Intent

Present:

- explicit asks;
- implicit needs;
- out-of-scope items;
- the apparent speed/quality signal;
- the most important outcome to get right.

Ask the user to confirm or correct that intent.

### Phase 3: Clarify Requirements

Ask only questions whose answers change the design: scope boundaries, observable behavior, edge cases, integration constraints, and any explicit UI, provider/model, cleanup, or managed-worktree outcomes. For non-`/plan` flows, also clarify any requested review-thread outcome; exact `/plan` already includes its run-scoped final review. Prefer concise multiple-choice questions. Resolve every destructive-state or scope ambiguity here, not after the final checkpoint.

### Phase 4: Effort and Ideal State Criteria

Ask the user to choose:

- effort: Prototype / MVP / Production / Critical;
- tests: none / smoke / thorough / comprehensive;
- docs: none / inline / README / full.

Then draft compact, binary Ideal State Criteria (ISC):

```markdown
### Core Functionality
- [ ] ISC-1: [atomic yes/no criterion]

### Edge Cases
- [ ] ISC-2: [atomic yes/no criterion]

### Anti-Criteria
- [ ] ISC-A-1: No [thing that must not happen]
```

Ask what is missing or should be out of scope.

### Phase 5: Explore Approaches — Final Checkpoint

Present 2–3 materially different approaches with tradeoffs, risks, effort, and a recommendation tied directly to the ISC. Ask the user to confirm the recommendation or select another approach. Explicitly say:

> This is the final approach checkpoint. After your answer, I’ll finish the plan and todos autonomously; for an exact `/plan` run, I’ll then coordinate execution without asking for another confirmation.

After the user answers, do not ask more planning questions. Resolve routine details yourself from evidence and the selected approach. Stop only for a genuine safety blocker or a destructive-state or scope ambiguity that should not be guessed.

## Post-Checkpoint: Become the Coordinator

### 1. Validate and premortem

Write concise architecture, components, data flow, and edge-case sections. Record 2–5 load-bearing assumptions and realistic failure modes, with each mitigation or accepted risk and rationale. Ensure the selected approach satisfies every ISC.

### 2. Create one Workbench run

Create the run in the current visible session:

```typescript
run_workspace({
  action: "create",
  title: "<short plan title>",
  role: "coordinator",
  projectPath: "<target repository when it differs from the current directory>"
})
```

Capture the returned run ID. Creation joins this session; do not create a second coordinator or run for the same plan. After inspecting the current SC target, label it `<run-id>-coordinator` so its runtime identity is run-scoped.

### 3. Write `plan.md`

Write the selected plan with `write_artifact({ path: "plan.md", ... })`:

```markdown
# [Plan Name]

**Status:** Ready for execution
**Run ID:** [run ID]
**Approach:** [selected approach]

## Intent
## Behavior (happy path and edge cases)
## Scope (in and out)
## Effort and Quality
## Ideal State Criteria
## Architecture
## Key Decisions
## Assumptions and Premortem
## Todo Plan
```

### 4. Create self-contained todos

Read `~/.pi/agent/skills/write-todos/SKILL.md`, then create Workbench todos in dependency order. Every todo must reference `plan.md`, repeat relevant constraints, name files and source references, identify wrong approaches, and contain objective acceptance criteria tied to ISC items. Record dependencies with actual assigned todo IDs.

Source-writing todos are sequential in a shared worktree. Parallel source writers are allowed only when the human explicitly requested managed worktrees and the applicable live worktree instructions have been followed.

### 5. Start execution

For an exact `/plan` run, summarize the run ID, selected approach, and todo sequence briefly, then start execution without asking for another confirmation. The current chat remains coordinator throughout fan-out, workers, review, and final verification.

For an ordinary planning request, execute only work included in the user's requested outcome. SC may be used for any requested research, design, delegation, or implementation without a separate trigger, but planning language alone does not request implementation.

## Run-Scoped Identity and Live State

Use deterministic, run-scoped names:

- coordinator: `<run-id>-coordinator`;
- scout: `<run-id>-scout-<topic>`;
- worker: `<run-id>-worker-<todo-id>`;
- reviewer: `<run-id>-reviewer`;
- group: `<run-id>-<role-plural>`.

Prefer `label:NAME`, then stable target IDs. Set or replace labels only after inspecting targets. Use groups only for intentional broadcasts or grouped lifecycle control, never as a substitute for todo dependencies:

```bash
sc agents label set --to id:STABLE_TARGET_ID RUN_ID-scout-api \
  --worktree "$PWD" --output json
sc agents group create RUN_ID-scouts \
  --agent label:RUN_ID-scout-api --agent label:RUN_ID-scout-ui \
  --worktree "$PWD" --output json
sc agents group list --worktree "$PWD" --output json
```

Inspect before adding, removing, or deleting group members. Do not use a group broadcast when roles require different prompts.

Workbench is the durable source of truth. SC coordination-state may mirror reconstructable live data such as phase, active todo, blockers, or summaries:

```bash
sc coordination-state get RUN_ID/phase --worktree "$PWD" --output json
sc coordination-state set RUN_ID/phase '{"phase":"workers","activeTodo":"TODO-001"}' \
  --if-version VERSION --worktree "$PWD" --output json
```

Use `--if-version` for competing writers. Never treat coordination-state, target idle state, or a dispatched command as proof that a plan, artifact, or todo exists.

## Launch Contract

Every launched Pi role prompt must contain the real task plus the exact Workbench run ID, role, SC label, and optional todo ID. It must tell the role to read its migrated skill, join that run first, write its exact durable artifact, and avoid launching additional agents. Source-writing worker prompts must require one focused verified commit, use of the commit skill, and no push.

For the supported individual Pi terminal shape, prefer the Workbench-native tool after joining or creating the run:

```text
launch_agent({
  label: "RUN_ID-worker-TODO-001",
  todoId: "TODO-001",
  prompt: "<complete multiline role prompt>",
  model: "VERIFIED_MODEL_ID",
  reasoning: "VERIFIED_LEVEL"
})
```

The tool executes `sc layout run tabs --provider pi --ui terminal --active keep` with direct argv, so the complete multiline prompt remains one value. It returns SC's raw response and only the identifiers SC actually supplied. Capture the returned label/selector, stable target ID, and available conversation/session IDs. Successful launch means only that dispatch was accepted.

Keep raw `sc layout run` for unsupported providers, UI modes, layouts, batch inputs, or when the native tool is unavailable. For raw launches, use long prompt files when needed and always remove them after the attempt. `--from-file` consumes JSONL, not plaintext: every line must contain `label` and `initial_message` (plus optional `system_prompt`). Build it with `jq` so multiline prompts remain valid JSON:

```bash
set -e
label="RUN_ID-worker-TODO-001"
prompt_file="$(mktemp)"
trap 'rm -f "$prompt_file"' EXIT
jq -cn --arg label "$label" --arg message "$PROMPT_TEXT" \
  '{label: $label, initial_message: $message}' >"$prompt_file"
sc layout run tabs \
  --provider pi \
  --ui terminal \
  --model VERIFIED_MODEL_ID \
  --reasoning VERIFIED_LEVEL \
  --from-file "$prompt_file" \
  --worktree "$PWD" \
  --active keep \
  --output json
rm -f "$prompt_file"
trap - EXIT
```

A provider being listed in layout capabilities does not prove its chat configuration or requested model is enabled. Verify both surfaces before passing optional model/reasoning values. One raw `sc layout run` invocation has one provider/model/reasoning selection; launch roles separately when they need different settings.

## Independent Fan-Out

Read-only scouts or independent research roles may run concurrently. Use individually launched labeled terminal-mode tabs when roles need different Pi models/reasoning, when the terminal-mode default applies, or when a simple explicit collection sequence is clearer.

Use `sc team run` only when all roles are truly independent and its constraints fit. `sc team run` currently has no `--ui` flag, so it cannot select the terminal-mode default for Pi roles; launch individual `sc layout run --provider pi --ui terminal` sessions instead when that default is required:

- 1–8 roles launch in parallel with per-role labels, providers, and prompts;
- team launch has no per-role `--model` or `--reasoning` flags;
- it provides no sequencing;
- every role must call `sc team report`;
- report summaries are capped at 16 KiB, so detailed results belong in Workbench artifacts (and `--result-file` when needed);
- a nonterminal team becomes Interrupted after an app restart and is not resumed automatically.

A suitable independent launch looks like:

```bash
sc team run \
  --label RUN_ID-scout-api --provider pi \
  --prompt 'Run ID: RUN_ID. Role: scout. SC label: RUN_ID-scout-api. Join with those exact values, scout the API, write artifacts/RUN_ID-scout-api/report.md, then call sc team report using your team context.' \
  --label RUN_ID-scout-ui --provider pi \
  --prompt 'Run ID: RUN_ID. Role: scout. SC label: RUN_ID-scout-ui. Join with those exact values, scout the UI, write artifacts/RUN_ID-scout-ui/report.md, then call sc team report using your team context.' \
  --notify self --worktree "$PWD" --output json
sc team status --run TEAM_RUN_ID --worktree "$PWD" --output json
```

A team role prompt must still join the Workbench run, write its role artifact, and finish with `sc team report` using its team run/role context. After team notification/status, wait for and read each stable role target, then verify each expected artifact. If a team was interrupted, inspect durable artifacts and todos and relaunch only incomplete work; never claim the team resumed.

`sc agent subscribe --to label:ROLE_LABEL ...` is optional for user-requested streaming or early pattern signals. It does not replace bounded `wait`, final `read`, or durable verification.

## Sequential Workers

Process claimable source-writing todos one at a time unless explicit managed worktrees authorize another topology.

For each todo:

1. Read the todo and its dependencies.
2. Launch one terminal-mode Pi worker with `launch_agent` and a deterministic label. Its complete prompt must include:

   ```text
   Read ~/.pi/agent/skills/worker/SKILL.md and follow it.
   Implement Workbench todo TODO-NNN.
   Run ID: <exact run ID>
   Role: worker
   SC label: <exact worker label>
   Todo ID: TODO-NNN
   Join the run first with those exact values. Do not launch other agents.
   After verification passes, read the commit skill, create one focused commit for this todo, and do not push.
   ```

   Pass `todoId: "TODO-NNN"` to `launch_agent`; Workbench reserves it atomically before dispatch. If recovery is genuinely required, force-release the stale claim/reservation and use a new retry label such as `<worker-label>-retry-2`.
3. Collect the same exact target with one `wait_for_agent` call:

   ```text
   wait_for_agent({ target: "label:WORKER_LABEL", last: 20 })
   ```

   Call it once. It reports elapsed time and handles ordinary idle-check timeouts internally before reading the completed target. Do not issue repeated wait calls while it is pending.
4. If `wait_for_agent` reports a delegated-agent or monitoring failure, stop orchestration, explain whether the worker may still be running, and ask the user whether to inspect, retry, or stop. Never relaunch automatically.
5. Read the todo with `todo({ action: "get", id: "TODO-NNN" })` and read `artifacts/<worker-label>/result.md`.
6. Verify the recorded commit SHA with `git show --stat --oneline <sha>` and confirm it contains only the todo's scoped changes.
7. Advance only when the todo is durably `done`, the result artifact exists, its verification evidence satisfies the acceptance criteria, and its focused commit is verified.

A successful launch/send, an idle target, or a confident chat response is never completion. If clarification is needed in an existing worker session, use raw `sc agent send`, then collect it with one new `wait_for_agent` call and perform durable verification; do not launch a replacement merely for a follow-up. If the worker blocks, inspect the recorded reason and fix missing plan/todo context before retrying. Never mark the todo done on the worker’s behalf to hide a failed handoff. Never force-release based only on idle/aborted/WebSocket state; Workbench fencing is the safety boundary for an explicitly recovered stale worker.

## Final Review

After all implementation todos are durably done, launch one labeled terminal-mode Pi reviewer sequentially with `launch_agent`. Its prompt must supply the exact run ID, role `reviewer`, label, plan path, relevant todo IDs, worker artifact paths, and `artifacts/<reviewer-label>/review.md`, and require `~/.pi/agent/skills/review/SKILL.md`. Do not launch the reviewer concurrently with work it must assess. Collect that exact reviewer with `wait_for_agent`; use raw launch/wait/read only when the native tools do not support the required target or topology.

For every exact `/plan` run, state this launch contract explicitly:

```text
Review mode: Workbench + in-app SC review.
The human invoked /plan; this workflow includes the run's built-in final review lifecycle.
Read the supplied Workbench plan, todos, and worker artifacts; reconcile SC review state; write the required review artifact; do not fix code or launch agents.
```

Artifact-only final review is not valid for `/plan`. For another planning flow, use SC review when the requested outcome includes in-app review; otherwise retain artifact-only review.

In SC-review mode, the reviewer must:

1. Run `sc instructions review` in its own session.
2. Inspect `review-checklist`, `diff-summary`, and `review-list --status open`, then use `review-get` for every returned open ID. Classify each thread as current actionable, addressed by the current diff, or unrelated/nonactionable history before acting.
3. Read the Workbench artifacts and code, trace changed logic, and run targeted checks.
4. Reconcile only applicable threads:
   - reply with verification evidence to an addressed finding, verify the reply with `review-get`, set it to `resolved`, then verify the status with `review-get`;
   - leave still-actionable or unrelated comments open;
   - add each new actionable finding with priority and Workbench run ID at the relevant file/line anchor;
   - when no actionable finding remains, add one file-anchored entry whose body starts `[APPROVED]` and includes the run ID and concise verification.
5. Re-run `review-list` and `review-get` for every replied-to, resolved, or newly added ID.
6. Only after SC verification, write `artifacts/<reviewer-label>/review.md` with initial open IDs/classifications, replies, resolutions, published IDs, verified states, remaining actionable IDs, commands/results, and verdict.

Use `wait_for_agent`, check its raw SC wait/read details for target errors, and read the durable review artifact. A review response, idle target, or SC comment without that artifact is incomplete. In SC-review mode, independently repeat the raw `review-list`/`review-get` verification and require Workbench and SC evidence to agree.

- `APPROVED`: continue only when the artifact exists, no actionable comment remains open, and the current run has a verified `[APPROVED]` entry. An open approval entry or unrelated historical comment is not itself an actionable finding. Leave approval entries open during review; the conditional post-commit reconciliation below resolves them only after a requested commit succeeds.
- `NEEDS CHANGES`: turn actionable P0/P1 findings into self-contained dependent Workbench todos, run workers sequentially, then send the existing reviewer a follow-up for re-review. It must verify fixes, reply to and resolve only addressed applicable comments, leave unresolved findings open, publish the refreshed verdict, and rewrite the artifact with current IDs/states. Repeat wait → read → artifact and SC verification. Handle P2 only when required by ISC or clearly worth the scoped effort; do not expand scope for P3 polish.

## Post-Approval Commit Reconciliation

Source-writing workers commit before completing their todos. Do not create a redundant coordinator commit after approval.

1. Confirm the final Workbench review verdict is `APPROVED` and no actionable comment remains open.
2. Verify every completed implementation/fix todo's recorded commit SHA and confirm the worktree contains no uncommitted run changes.
3. Run `review-list --status open` and `review-get` for every returned ID. For every still-open comment whose body begins `[APPROVED]`, set it to `resolved`, then verify that exact status with `review-get`. This cleanup applies to all open approval entries, including historical approvals; never resolve an actionable finding or any nonapproval thread through this rule.
4. Re-run `review-list --status open` and verify that no `[APPROVED]` entry remains open while unrelated nonapproval threads retain their prior state.
5. Write `artifacts/<coordinator-label>/post-commit-review-cleanup.md` with the worker commit SHAs, every resolved approval ID, verification commands/results, and remaining open IDs/classifications.

A `/plan` implementation is not complete until worker commits, approval cleanup, and the durable verification record all exist.

## Steering, Cleanup, and Recovery

For a running target that needs correction, use `sc agent interrupt` and then `sc agent send`. Use `sc agent stop` for cancellation; stopping work does not close its UI container. Use `--kill` only when explicitly requested or normal cancellation fails.

Do not close run-created tabs/views or delete groups merely because work finished. Cleanup is an explicit human choice. When requested:

1. inspect exact targets and group membership;
2. stop active work if needed;
3. inspect `sc help layout` immediately before close operations;
4. close only known run-created UI containers;
5. remove only known run-created groups/state requested for cleanup;
6. re-list targets and verify the coordinator remains open.

```bash
sc layout views --worktree "$PWD" --output json
sc agents group list --worktree "$PWD" --output json
sc agent stop --to label:RUN_ID-worker-TODO-001 --worktree "$PWD" --output json
# Use the exact close target supported by current help.
sc agents list --worktree "$PWD" --output json
```

Managed worktree creation and deletion always require a separate explicit human request and `sc instructions worktree`. Never create a worktree as delegation or as a fallback for unavailable capability.

If a session or app restarts, reconstruct progress from `plan.md`, todo records, and artifacts. Treat team state and coordination-state as runtime hints only.

## Final Verification and Report

Before reporting completion:

1. Read `plan.md` and confirm the selected approach and ISC are represented.
2. List todos and confirm every required implementation/fix todo is durably `done` with dependencies satisfied.
3. Read every expected scout, worker, and reviewer artifact.
4. Confirm every SC launch/send was followed by wait and read, with no unresolved target/provider errors.
5. Run the plan’s targeted tests/build/typecheck and inspect `git status --short` plus the relevant diff.
6. Confirm the final Workbench review verdict. For exact `/plan` and any other SC-review flow, re-run `review-list` and `review-get` for every relevant ID, confirm the final states match the review artifact, confirm no actionable comments remain open for an `APPROVED` verdict, and verify the current run's `[APPROVED]` entry. SC state without the Workbench artifact is incomplete, and artifact-only review cannot complete `/plan`.
7. Verify every worker commit SHA, read `artifacts/<coordinator-label>/post-commit-review-cleanup.md`, re-run `review-list`/`review-get`, and confirm every open `[APPROVED]` entry was resolved only after the worker commits while nonapproval threads were left unchanged.
8. Confirm that no unrequested worktree, unrelated nonapproval review-thread, cleanup, push, or coordinator catch-all commit occurred.

Report the Workbench run ID, completed todo IDs, verification commands/results, final review verdict, relevant SC review IDs/states, worker commit SHAs, resolved approval IDs, remaining risks, and any UI sessions intentionally left open. Evidence—not dispatch—is the completion boundary.
