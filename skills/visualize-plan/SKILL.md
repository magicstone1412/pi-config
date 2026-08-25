---
name: visualize-plan
description: Turns an existing implementation plan into a polished self-contained HTML page and opens it in the browser. Use when asked to "visualize a plan", "open this plan as HTML", "make this plan visual", or present a Markdown plan visually without changing its decisions.
---

<!--
Uses Visual Explainer by Nico Bailon:
https://github.com/nicobailon/visual-explainer
-->

# Visualize Plan

Transform an existing plan into a faithful, polished HTML explanation. Do not review, rewrite, execute, or expand the plan into new requirements.

## Step 1: Resolve the plan

Resolve the plan source in this order:

1. If the input names a readable file, use that file. Treat the full input as one path after removing optional surrounding quotes or a leading `@`.
2. If the input is empty, derive the session file (`PI_SESSION_FILE`, or in Claude Code `$HOME/.claude/projects/<project slug>/$CLAUDE_CODE_SESSION_ID.jsonl` with `/` and `.` in the project path mapped to `-`) and use `${SESSION_FILE%.jsonl}.plan.md` when it exists.
3. If the input contains substantial inline plan content, use it directly.
4. Otherwise, stop and ask for a plan file path or pasted plan.

For path-like input that does not exist, report the missing path; do not reinterpret it as plan text. Read the complete plan before generating anything.

## Step 2: Load the visual system

Load the `visual-explainer` skill and follow its full-HTML workflow, design rules, reference routing, and delivery checklist. Do not use quick mode: implementation plans need custom hierarchy and composition.

Use only the source plan unless the user explicitly asks to verify it against the repository. Do not research the codebase merely because the plan mentions files or symbols.

## Step 3: Inventory the source

Create a private coverage inventory of every substantive source section, including:

- goal, intent, and selected approach;
- in-scope and out-of-scope boundaries;
- architecture, data flow, or behavior changes actually stated in the plan;
- implementation phases and dependencies;
- affected files, interfaces, contracts, and migrations;
- acceptance criteria and verification commands;
- assumptions, risks, rejected alternatives, and repository evidence.

Preserve exact commands, paths, identifiers, and acceptance-criterion IDs. Never invent missing architecture, dependencies, evidence, or requirements. Use cards or prose when the source does not justify a diagram.

## Step 4: Compose the page

Choose a distinctive editorial, blueprint, paper/ink, or IDE-inspired direction suited to the plan. Make the first viewport communicate the goal, selected approach, scope, and implementation shape.

Prefer this hierarchy when the source supports it:

1. executive overview and scope;
2. architecture or behavior map;
3. ordered implementation sequence with dependencies;
4. contracts and affected-file map;
5. acceptance criteria and test/verification plan;
6. risks, assumptions, evidence, and rejected alternatives.

Use Mermaid only for relationships or flow present in the source. Use semantic tables for matrices and compact cards or timelines for implementation work. Keep dense evidence and reference material collapsible. Preserve all substantive source content even when this requires additional sections.

## Step 5: Render and open

Generate one complete self-contained HTML document. Derive a descriptive kebab-case filename from the plan title, ending in `-visual-plan.html`. Avoid overwriting an existing output by adding a short numeric suffix when needed.

Call `visual_explainer` with:

- `action: "render"`;
- the basename in `filename`;
- the complete document in `html`;
- `open: true`;
- `viewer: "browser"`.

The renderer writes under `~/.agent/diagrams/`. Do not create a Markdown companion unless requested.

## Step 6: Verify and report

Confirm the render result reports the output path and a dispatched browser open. Confirm the HTML file exists. If browser opening fails, report the failure and provide the file path without claiming it opened.

Reply with only a concise result: the plan title, output path, and whether the browser open was dispatched.

## Completion criteria

- The page is faithful to the supplied plan and introduces no new decisions.
- Every substantive plan section appears in the page.
- The HTML is self-contained, readable, responsive, and visually intentional.
- The file exists under `~/.agent/diagrams/` and browser-open status is reported accurately.
