---
description: Start an interactive Superconductor planning and automatic execution workflow
argument-hint: "<what to build>"
---
Invoking this exact `/plan` prompt is the human's explicit trigger for Superconductor app-managed orchestration for this workflow. This authorization is scoped to the planning run: it does not make ordinary natural-language planning an SC trigger, and it does not authorize managed worktree creation/deletion, destructive cleanup, or in-app review-thread mutation unless the human separately requests those outcomes.

Read `~/.pi/agent/skills/plan/SKILL.md` and follow it in the current visible Pi chat.

Preserve these workflow guarantees:

- Keep the interactive planning conversation in this chat, one focused phase per turn, through the final approach checkpoint.
- After the human selects an approach, this same chat becomes the coordinator; do not launch a replacement planner or use a parent handoff.
- Create one Workbench run, write the selected plan to `plan.md`, and create self-contained Workbench todos.
- Then begin authorized SC execution automatically without asking for another confirmation.
- Treat launch/send as dispatch only: wait, read, and verify durable artifacts/todo state before advancing.
- Run dependent workers and the final reviewer sequentially; use teams only for genuinely independent fan-out whose provider/model constraints fit.

Planning request:
$ARGUMENTS
