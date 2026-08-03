---
description: Start an interactive Superconductor planning and automatic execution workflow
argument-hint: "<what to build>"
---
This `/plan` workflow uses Superconductor app-managed orchestration and the built-in in-app SC final-review lifecycle. Its managed-state scope is limited to the planning run: it does not include managed worktree creation/deletion, destructive cleanup, or review-thread mutations unrelated to this run.

Read `~/.pi/agent/skills/plan/SKILL.md` and follow it in the current visible Pi chat.

Preserve these workflow guarantees:

- Keep the interactive planning conversation in this chat, one focused phase per turn, through the final approach checkpoint.
- After the human selects an approach, this same chat becomes the coordinator; do not launch a replacement planner or use a parent handoff.
- Create one Workbench run, write the selected plan to `plan.md`, and create self-contained Workbench todos.
- Then begin SC execution automatically without asking for another confirmation.
- Treat launch/send as dispatch only: wait, read, and verify durable artifacts/todo state before advancing.
- Run dependent workers and the final reviewer sequentially; use teams only for genuinely independent fan-out whose provider/model constraints fit.
- Require each successful source-writing worker to create one focused verified commit, record its SHA, and never push.
- The final reviewer must read the Workbench artifacts and fully reconcile the run through SC review checklist, diff, comment, reply/status, and approval/finding capabilities; artifact-only review is not completion for `/plan`.

Planning request:
$ARGUMENTS
