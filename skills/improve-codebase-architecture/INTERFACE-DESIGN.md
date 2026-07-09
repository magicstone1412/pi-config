# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel Solo subagent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning Solo subagents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, write the problem framing to the architecture review scratchpad if one exists, then immediately proceed to Step 2. The user reads and thinks while the subagents work in parallel.

### 2. Spawn sub-agents

Spawn 3+ Solo subagents in parallel with `scratchpad: true`. Each must produce a **radically different** interface for the deepened module and save its design to its Solo scratchpad. Do not let these subagents edit source files or create todos.

Use this shape, varying the design constraint for each subagent:

```typescript
subagent({
  name: "Interface Design <A/B/C>: <review tag>",
  scratchpad: true,
  systemPrompt: "You are a read-only architecture/interface designer. Produce one interface design, save it to your Solo scratchpad, and stop. Do not edit files or create todos.",
  task: `Design one interface option for this deepening candidate.

Review tag: <review tag>
Architecture review scratchpad: <id/name>
Scout scratchpad: <id/name if relevant>
Candidate: <selected candidate>
Design constraint: <constraint for this subagent>

Read LANGUAGE.md, DEEPENING.md, relevant CONTEXT.md/ADRs, and the cited source files.
Use the project's domain vocabulary and the architecture vocabulary exactly.
Save the required output sections to your Solo scratchpad.`
})
```

Prompt each subagent with a separate technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each agent a different design constraint:

- Agent 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Agent 2: "Maximise flexibility — support many use cases and extension."
- Agent 3: "Optimise for the most common caller — make the default case trivial."
- Agent 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and CONTEXT.md vocabulary in the brief so each Solo subagent names things consistently with the architecture language and the project's domain language.

Each subagent outputs to its Solo scratchpad:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

After spawning all interface-design subagents, stop and wait for Solo wake-ups. Read every design scratchpad with `scratchpad_read` before comparing designs.

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.

Write the comparison, recommendation, and linked design scratchpad ids back to the architecture review scratchpad. If the user wants to execute the chosen design, return to the main skill's Solo todo rules rather than writing a bespoke task list.
