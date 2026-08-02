---
name: plan
description: Interactive planning for requests to plan, brainstorm, design, create a plan, or build something. Invoking `/plan` explicitly authorizes the Superconductor workflow; ordinary planning language stays in the current session unless the human gives another explicit SC trigger.
---

# Plan

Turn a request into a selected approach, a durable Workbench plan and todos, and—when explicitly authorized—an SC-coordinated implementation.

The current visible Pi chat is both planner and coordinator. Keep the planning conversation here through the final approach checkpoint; never launch a replacement planner or hand control back to another session. After the user selects an approach, this same chat creates the run and coordinates execution.

## Authorization Modes

### `/plan` or another explicit SC trigger

The `/plan` prompt explicitly authorizes app-managed Superconductor orchestration for that planning run. A human request that independently satisfies the global SC policy—such as asking to orchestrate, naming another provider/model, or requesting visible tabs/panes—also authorizes only the requested SC outcome.

The authorization does **not** implicitly authorize managed worktree creation/deletion, destructive cleanup, or in-app review-thread mutation. Those still require the human to request that outcome.

### Ordinary planning language

Requests such as “plan this,” “brainstorm,” “design,” or “let’s build” are not SC triggers by themselves. Perform the interactive phases in the current chat, but do not run `sc agent`, `sc team`, `sc layout`, or other SC mutations unless the human separately provides an explicit trigger. Do not substitute SC for requested native subagents. If no SC trigger exists, finish the selected plan in the current session and follow the normal non-SC execution policy.

## SC Preflight

For an authorized SC run, before the first SC mutation:

1. Read `~/.pi/agent/skills/superconductor/SKILL.md` and its `references/orchestration.md` completely.
2. Run `sc instructions orchestration` and `sc instructions layout`.
3. Run `command -v sc`, `sc layout capabilities --output json`, `sc layout views --worktree "$PWD" --output json`, `sc agents list --worktree "$PWD" --output json`, and `sc chat providers --json`.
4. Verify the requested launch shape, provider, model, UI mode, structured-read support, and reasoning level from live output.

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

Ask only questions whose answers change the design: scope boundaries, observable behavior, edge cases, integration constraints, and any explicit UI, provider/model, review-thread, cleanup, or managed-worktree outcomes. Prefer concise multiple-choice questions. Resolve every authorization-sensitive ambiguity here, not after the final checkpoint.

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

> This is the final approach checkpoint. After your answer, I’ll finish the plan and todos autonomously; for an authorized `/plan` run, I’ll then coordinate execution without asking for another confirmation.

After the user answers, do not ask more planning questions. Resolve routine details yourself from evidence and the selected approach. Stop only for a genuine safety blocker or an authorization-sensitive ambiguity that should not be guessed.

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

For an authorized `/plan` run, summarize the run ID, selected approach, and todo sequence briefly, then start execution without asking for another confirmation. The current chat remains coordinator throughout fan-out, workers, review, and final verification.

For an ordinary planning request without an SC trigger, do not execute the SC sections below. Present the completed plan and proceed only through mechanisms authorized by the user and global policy.

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

Every launched Pi role prompt must contain the real task plus the exact Workbench run ID, role, SC label, and optional todo ID. It must tell the role to read its migrated skill, join that run first, write its exact durable artifact, and avoid launching additional agents. Include any commit constraint explicitly.

Use long prompt files when needed and always remove them after the launch attempt. For delegated Pi workers, scouts, and reviewers, terminal mode is the operational default; use chat only when the human explicitly requests that app UI. For role-specific model/reasoning selection, choose only values verified by `sc chat providers --json`:

```bash
sc layout run tabs \
  --provider pi \
  --ui terminal \
  --model VERIFIED_MODEL_ID \
  --reasoning VERIFIED_LEVEL \
  --label RUN_ID-worker-TODO-001 \
  --from-file "$prompt_file" \
  --worktree "$PWD" \
  --active keep \
  --output json
```

A provider being listed in layout capabilities does not prove its chat configuration or requested model is enabled. Verify both surfaces. One `sc layout run` invocation has one provider/model/reasoning selection; launch roles separately when they need different settings.

Capture the launch selector, stable target ID, label, and conversation/session ID. Successful launch means only that dispatch was accepted.

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
2. Launch one terminal-mode Pi worker with `--provider pi --ui terminal --active keep` and a deterministic label. Its prompt must include:

   ```text
   Read ~/.pi/agent/skills/worker/SKILL.md and follow it.
   Implement Workbench todo TODO-NNN.
   Run ID: <exact run ID>
   Role: worker
   SC label: <exact worker label>
   Todo ID: TODO-NNN
   Join the run first with those exact values. Do not launch other agents.
   Do not create a git commit unless this todo explicitly requests one.
   ```

3. Wait for that exact target to settle:

   ```bash
   sc agent wait --to label:WORKER_LABEL --idle --timeout-ms 120000 \
     --worktree "$PWD" --output json
   ```

4. Read from the same target:

   ```bash
   sc agent read --to label:WORKER_LABEL --last 20 \
     --worktree "$PWD" --output json
   ```

5. Check `target_error`, provider failure, incomplete output, and timeouts.
6. Read the todo with `todo({ action: "get", id: "TODO-NNN" })` and read `artifacts/<worker-label>/result.md`.
7. Advance only when the todo is durably `done`, the result artifact exists, and its verification evidence satisfies the acceptance criteria.

A successful launch/send, an idle target, or a confident chat response is never completion. If clarification is needed in an existing worker session, use `sc agent send`, then repeat wait → read → durable verification; do not launch a replacement merely for a follow-up. If the worker blocks, inspect the recorded reason and fix missing plan/todo context before retrying. Never mark the todo done on the worker’s behalf to hide a failed handoff.

## Final Review

After all implementation todos are durably done, launch one labeled terminal-mode Pi reviewer sequentially with `--provider pi --ui terminal`. Its prompt must supply the exact run ID, role `reviewer`, label, plan path, relevant todo IDs, and worker artifact paths, and require `~/.pi/agent/skills/review/SKILL.md` plus `artifacts/<reviewer-label>/review.md`.

Wait, read, check target errors, and read the durable review artifact. A review chat response without that artifact is incomplete.

- `APPROVED`: continue to final verification.
- `NEEDS CHANGES`: turn actionable P0/P1 findings into self-contained dependent Workbench todos, run workers sequentially, then send the existing reviewer a follow-up for re-review and repeat wait → read → artifact verification. Handle P2 only when required by ISC or clearly worth the scoped effort; do not expand scope for P3 polish.

The reviewer normally uses a Workbench artifact only. Create or mutate an in-app SC review thread only when the human explicitly requested that review outcome; first run `sc instructions review` and follow the live review guide.

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
6. Confirm the final review verdict and that no unauthorized worktree, review-thread, cleanup, or commit operation occurred.

Report the Workbench run ID, completed todo IDs, verification commands/results, final review verdict, remaining risks, and any UI sessions intentionally left open. Evidence—not dispatch—is the completion boundary.
