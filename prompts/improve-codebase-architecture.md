---
description: Find architecture deepening opportunities in the current codebase
argument-hint: "[focus area]"
---
Read `~/.pi/agent/skills/improve-codebase-architecture/SKILL.md` and follow it for this architecture review.

Resolve supporting-file links relative to `~/.pi/agent/skills/improve-codebase-architecture/`. Read `LANGUAGE.md`, `DEEPENING.md`, and `INTERFACE-DESIGN.md` before applying their guidance.

Use Workbench for durable review state: use the active run or create one review run as directed by the skill, and keep the source of truth at `artifacts/architecture/review.md`. Create Workbench todos only after I select a candidate and explicitly confirm that I want execution tasks.

This prompt does not by itself authorize Superconductor orchestration. Explore with `read`, `bash`, and `rg` in the current chat unless my request contains an explicit SC trigger. For authorized SC scouting or parallel interface design, follow the Superconductor skill and live instructions, give every Pi role the exact run handshake and deterministic artifact path, then wait for, read, and verify every actual role result before fan-in.

Focus area or request:
$ARGUMENTS
