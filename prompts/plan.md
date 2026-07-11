---
description: Start a Solo-native planning and automatic execution workflow
argument-hint: "<what to build>"
---
Read `~/.pi/agent/skills/plan/SKILL.md` and follow the orchestrator role for this Solo-native planning workflow.

Important workflow behavior:
- The planner subagent is interactive only through the approach checkpoint; after that it finishes autonomously.
- When the planner notifies the parent that plan/todos are ready, start workers automatically without asking for execute confirmation.

Planning request:
$ARGUMENTS
