# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use Design It Twice (Ousterhout): the first idea is unlikely to be the best.

Use the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**, and **locality** — and the dependency categories in [DEEPENING.md](DEEPENING.md).

## Durable output

The architecture review remains at `artifacts/architecture/review.md`. Give each interface designer a deterministic run-scoped SC label and artifact path:

```text
<run-id>-architecture-design-a -> artifacts/<run-id>-architecture-design-a/design.md
<run-id>-architecture-design-b -> artifacts/<run-id>-architecture-design-b/design.md
<run-id>-architecture-design-c -> artifacts/<run-id>-architecture-design-c/design.md
```

Use additional letters when launching more roles. Never let two designers write the same artifact. Every designer is read-only: it must not edit source files, update the architecture review, or create todos.

## Process

### 1. Frame the problem space

Before launching designers, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user and write the problem framing to `artifacts/architecture/review.md`, then proceed to Step 2. The user can read and think while authorized parallel designers work.

### 2. Establish authorization and preflight

A request for alternative interfaces, parallel work, or designers does not by itself authorize Superconductor orchestration. Use SC sessions only when the human has explicitly asked for SC/Superconductor/orchestration, an app-managed visible layout, or another qualifying trigger in the global policy. If no trigger exists, ask whether the user wants visible SC parallel designers or prefers the coordinator to perform Design It Twice sequentially in the current chat. Do not mutate SC state while waiting for that choice.

For authorized SC exploration, before the first mutation:

1. Read `~/.pi/agent/skills/superconductor/SKILL.md` and `~/.pi/agent/skills/superconductor/references/orchestration.md` completely.
2. Run `sc instructions orchestration` and `sc instructions layout`.
3. Inspect `command -v sc`, layout capabilities, current views and agents, and Pi providers/models with the documented JSON commands.
4. Verify the launch shape, provider, model/reasoning requirements, and structured-read support. Do not silently substitute another provider or mechanism.

Do not create a managed worktree for design exploration. Designers are read-only and may share the current worktree.

If the user chooses current-chat exploration instead, develop at least two materially different interfaces sequentially, write each completed option to a separate deterministic design artifact, then perform the comparison in Step 4. Do not claim that this path was parallel or SC-orchestrated.

### 3. Launch 3+ independent designers

Give every designer a separate technical brief containing source paths, coupling details, the dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam, and one distinct design constraint:

- Designer A: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Designer B: "Maximise flexibility — support many use cases and extension."
- Designer C: "Optimise for the most common caller — make the default case trivial."
- Designer D, when applicable: "Design around ports & adapters for cross-seam dependencies."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and the project's `CONTEXT.md` vocabulary so each designer names things consistently.

Every launch prompt must include:

- The exact Workbench run ID, role `interface-designer`, and exact SC label.
- An instruction to join that run first with those exact values.
- `artifacts/architecture/review.md` and any relevant scout artifact paths.
- The exact output path `artifacts/<label>/design.md`.
- Instructions to read `LANGUAGE.md`, `DEEPENING.md`, relevant `CONTEXT.md`/`CONTEXT-MAP.md`, ADRs, and cited source files.
- A prohibition on source edits, architecture-review edits, todo creation, and additional agents.

Each design artifact must contain:

1. Interface — types, methods, parameters, invariants, ordering, and error modes
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high and where it is thin

#### Team launch when constraints fit

Use `sc team run` only when all designers are independent and the team's same-launch constraints fit. Team launch has no per-role Pi model or reasoning flags, no `--ui` flag, and provides no sequencing; use individually launched terminal-mode Pi sessions when the default UI must be selected. Detailed output still belongs in each designer's Workbench artifact.

Every team role prompt must additionally require the role to finish with `sc team report` using its actual team run/role context. The report contains a concise summary; it never replaces `artifacts/<label>/design.md`. Capture the team run ID and every returned stable role target.

#### Individually labeled sessions otherwise

When designers need different Pi models/reasoning levels, team launch constraints do not fit, or the terminal-mode default must be selected, launch individually labeled Pi sessions with `sc layout run ... --provider pi --ui terminal` using verified values. Capture every label, stable target ID, and conversation/session ID. A run-scoped group may be created for intentional grouped lifecycle control, but do not use a broadcast because each designer has a different brief.

Whichever launch shape is used, successful dispatch is not completion.

### 4. Fan in every actual result

Build the fan-in list from the roles actually returned by SC, not from the intended role count. For every returned role, without exception:

1. Wait for that exact stable target to become idle with a bounded timeout.
2. Read from that same target.
3. Check `target_error`, provider failures, incomplete snapshots, and missing content.
4. Read its exact `artifacts/<label>/design.md` with `read_artifact`.
5. Confirm the artifact contains all five required sections.

For a team, inspect team status and role reports as runtime evidence, but still wait/read every stable role target and read every detailed Workbench artifact. For individual sessions, do the same per-target wait/read/artifact sequence. Optional subscribe or group state never replaces this fan-in.

Do not compare designs while any actually launched role is unread, failed, or missing its artifact. Send a correction to the existing target when appropriate, then repeat wait, read, and artifact verification. If a role cannot complete, record that concrete gap in `artifacts/architecture/review.md`; never invent or silently omit its result.

Present the verified designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

Give an opinionated recommendation: identify the strongest design and why. If elements from different designs combine well, propose a hybrid. Write every actual design artifact path, the comparison, and the recommendation to `artifacts/architecture/review.md`.

If the user wants to execute the chosen design, return to the main skill's Workbench todo rules rather than writing a bespoke task list. Todo creation still occurs only after user selection and explicit confirmation that they want execution tasks.
