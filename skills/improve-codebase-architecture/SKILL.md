---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase, informed by CONTEXT.md and docs/adr/. Records findings in Workbench artifacts and can turn selected refactors into Workbench todos. Use when improving architecture, finding refactoring opportunities, or making a codebase more testable and AI-navigable.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Durable review state

Use Workbench as the durable source of truth. Do not hand-roll architecture reports or implementation task lists in chat when an artifact or todo fits.

At the start of a review, pick a short review tag such as `order-intake-architecture`. Use the active Workbench run when the session is already joined. Otherwise create one run with the current chat as coordinator and a title such as `Architecture Review: <tag>`; pass `projectPath` when the reviewed repository differs from the current directory. Do not create a second run for the same review.

Write the review to `artifacts/architecture/review.md` early, then replace it with the complete current record at each meaningful transition: after exploration, candidate selection, grilling decisions, interface-design comparisons, and todo creation. SC labels and coordination-state are runtime controls; this artifact is the durable review record.

Use this shape:

```markdown
# Architecture Review: [focus]

**Status:** Exploring | Candidates presented | Grilling | Ready for todos | Complete
**Review tag:** [tag]
**Project:** [cwd]

## Focus
[User request and any explicit non-goals]

## Domain and ADR Context
- `CONTEXT.md` / `CONTEXT-MAP.md` findings
- ADRs read and decisions not to re-litigate

## Exploration Evidence
- `artifacts/<scout-label>/report.md` — relevant evidence
- `path/to/file` — friction observed directly

## Deepening Candidates
1. [candidate summary, files, problem, solution, benefits]

## Selected Candidate
[Candidate, rationale, constraints, rejected alternatives]

## Grilling Decisions
- **Question:** ...
  **Outcome:** ...
  **Docs updated:** ...

## Interface Designs
- `artifacts/<designer-label>/design.md`
- Recommendation: ...

## Workbench Todos
- TODO-NNN — [title]
```

## Exploration and orchestration

Use direct `read`, `bash`, and `rg` for quick facts. For multi-file reconnaissance, either explore in the current chat or, when the human has explicitly authorized Superconductor orchestration, launch a read-only terminal-mode Pi scout with `sc layout run ... --provider pi --ui terminal` and a deterministic run-scoped label. Ordinary requests for a scout, delegation, or parallel work do not authorize SC.

Before any authorized SC mutation, read `~/.pi/agent/skills/superconductor/SKILL.md` and its orchestration reference, run `sc instructions orchestration` and `sc instructions layout`, and verify current capabilities, providers, models, reasoning levels, targets, and the requested launch shape. Every launched scout receives the exact Workbench run ID, role `scout`, SC label, and task; it must join first, read `~/.pi/agent/skills/scout/SKILL.md`, remain read-only, and write `artifacts/<label>/report.md`. Wait for and read the same target, check target/provider errors, and read the report artifact before presenting candidates. Dispatch or idle state is not completion.

For parallel interface exploration, follow [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md). Every designer is read-only and writes a separate deterministic Workbench artifact. Fan-in must wait for and read every actual designer target and every expected design artifact before comparison.

## Todos

Only create implementation todos after the user chooses a candidate and explicitly confirms they want execution tasks. Before creating them, read `~/.pi/agent/skills/write-todos/SKILL.md` and use the Workbench `todo` tool.

Every architecture todo must:

- Be tagged with the review tag.
- Reference `artifacts/architecture/review.md` plus relevant scout and interface-design artifacts in its body.
- Preserve the selected candidate's constraints, anti-patterns, files, references, and verification criteria.
- Fit one worker session and one commit.
- State dependencies and objective acceptance criteria.

If the candidate is still too broad or ambiguous for worker-ready todos, recommend `/plan` with the architecture review and supporting artifact paths instead of creating vague todos.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## Process

### 1. Explore

Read the project's domain glossary and any ADRs in the area you're touching first. Read [LANGUAGE.md](LANGUAGE.md), [DEEPENING.md](DEEPENING.md), and [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md) before applying their guidance.

Create or update `artifacts/architecture/review.md`. For anything beyond a quick local read, gather evidence across the codebase in the current chat or use an authorized SC-launched scout as described above. Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and also in how tests would improve

**Use CONTEXT.md vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly (for example, _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

Write the candidate list to `artifacts/architecture/review.md`. Do not propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, and what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` with a one-line definition so the domain language stays authoritative. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones. Write an accepted ADR to `docs/adr/NNNN-<slug>.md` with context, decision, and consequences.
- **Want to explore alternative interfaces for the deepened module?** Use Design It Twice through [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md), then record the comparison and recommendation in the architecture review artifact.

Update `artifacts/architecture/review.md` after each crystallised decision. It is the source of truth for future planners, workers, and reviewers.

### 4. Convert selected work to Workbench todos

When the selected architecture change is ready to execute and the user confirms they want task creation, read `~/.pi/agent/skills/write-todos/SKILL.md` and create focused Workbench todos with the `todo` tool, all tagged with the review tag. Each todo body must include:

- `artifacts/architecture/review.md`.
- Scout and interface-design artifact paths, if relevant.
- The selected candidate and the exact deepening decision it implements.
- Files to read/change and references to existing patterns.
- Explicit constraints and anti-patterns, especially seam/interface decisions.
- Dependencies, acceptance criteria, and verification commands.

If further design work is needed before worker-ready todos can be written, run `/plan` with the architecture review and supporting artifact paths instead of creating low-quality todos.
