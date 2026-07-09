---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase, informed by CONTEXT.md and docs/adr/. Records findings in Solo scratchpads and can turn selected refactors into Solo todos. Use when improving architecture, finding refactoring opportunities, or making a codebase more testable and AI-navigable.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Solo primitives

Use Solo primitives as the durable workflow state. Do not hand-roll architecture reports or implementation task lists in chat when a scratchpad or todo fits.

### Review scratchpad

Pick a short review tag, such as `order-intake-architecture`. Create a Solo scratchpad named `Architecture Review: <tag>` early in the review, then update it at each meaningful transition: after exploration, after candidate selection, after grilling decisions, after interface-design comparisons, and when todos are created.

Use this scratchpad shape:

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
- Scout scratchpad: [id/name]
- `path/to/file` — friction observed

## Deepening Candidates
1. [candidate summary, files, problem, solution, benefits]

## Selected Candidate
[Candidate, rationale, constraints, rejected alternatives]

## Grilling Decisions
- **Question:** ...
  **Outcome:** ...
  **Docs updated:** ...

## Interface Designs
- Scratchpads: [id/name]
- Recommendation: ...

## Solo Todos
- #[id] — [title]
```

### Scouts and design subagents

Use direct `read`, `bash`, and `rg` for quick facts. For multi-file reconnaissance, spawn a Solo `scout` subagent with `scratchpad: true`, stop, wait for the Solo wake-up, then read the scout scratchpad before presenting candidates.

For parallel interface exploration, use Solo subagents with scratchpads as described in [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md). Read every design scratchpad before comparing designs.

### Todos

Only create implementation todos after the user chooses a candidate and confirms they want execution tasks. Before creating todos, read `~/.pi/agent/skills/write-todos/SKILL.md` and use `todo_create`.

Every architecture todo must:

- Be tagged with the review tag.
- Reference the architecture review scratchpad plus relevant scout/interface scratchpads.
- Preserve the selected candidate's constraints, anti-patterns, files, references, and verification criteria.
- Fit one worker session and one commit.

If the candidate is still too broad or ambiguous for worker-ready todos, spawn an interactive Solo `planner` or recommend `/plan` with the architecture review scratchpad instead of creating vague todos.

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

Read the project's domain glossary and any ADRs in the area you're touching first.

Then create or update the architecture review scratchpad. For anything beyond a quick local read, spawn a Solo `scout` subagent to walk the codebase and save evidence to its scratchpad:

```typescript
subagent({
  name: "Scout: <review tag>",
  agent: "scout",
  scratchpad: true,
  task: `Explore architecture friction for: <focus>

Review tag: <review tag>
Read CONTEXT.md / CONTEXT-MAP.md and relevant ADRs first.
Look for shallow modules, weak seams, coupling, testability gaps, and codebase navigation friction.
Save findings with file paths and evidence to your Solo scratchpad.`
})
```

After spawning the scout, stop and wait for Solo to wake you. Read the scout scratchpad before presenting candidates. Don't follow rigid heuristics — explore organically and note where you experience friction:

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

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly (e.g. _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

Write the candidate list to the architecture review scratchpad. Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` with a one-line definition so the domain language stays authoritative. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones. Write it to `docs/adr/NNNN-<slug>.md` with context, decision, and consequences.
- **Want to explore alternative interfaces for the deepened module?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md). Use Solo subagents with scratchpads, then record the comparison and recommendation in the architecture review scratchpad.

Update the architecture review scratchpad after each crystallised decision. It is the source of truth for future planners, workers, and reviewers.

### 4. Convert selected work to Solo todos

When the selected architecture change is ready to execute and the user confirms they want task creation, create Solo todos rather than a bespoke checklist.

Before creating todos, read `~/.pi/agent/skills/write-todos/SKILL.md`. Create focused todos with `todo_create`, all tagged with the review tag. Each todo body should include:

- Architecture review scratchpad name/id.
- Scout scratchpad and interface-design scratchpads, if relevant.
- The selected candidate and the exact deepening decision it implements.
- Files to read/change and references to existing patterns.
- Explicit constraints and anti-patterns, especially seam/interface decisions.
- Acceptance criteria and verification commands.

If further design work is needed before worker-ready todos can be written, spawn an interactive Solo `planner` with the architecture review scratchpad and scout scratchpads instead of creating low-quality todos.
