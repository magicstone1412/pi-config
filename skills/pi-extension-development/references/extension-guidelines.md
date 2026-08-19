# Pi Extension Implementation Guidelines

## Contents

- Source and imports
- Factory lifecycle
- Tool definitions
- Output and images
- UI and commands
- Verification

## Source and imports

Load TypeScript directly through Pi. Do not add a compilation step unless a runtime dependency cannot work through Pi's loader.

Use current package names:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
```

Add imported Pi core packages to `peerDependencies` with `"*"`. Add third-party runtime imports to `dependencies`.

## Factory lifecycle

Export one default factory:

```ts
export default function exampleExtension(pi: ExtensionAPI) {
  // register tools, commands, and lifecycle handlers
}
```

Do not start subprocesses, timers, sockets, or watchers in the factory. Some Pi invocations load extensions without starting a session. Start resources in `session_start` or on first use and close them idempotently in `session_shutdown`.

Treat `ctx` and session-bound objects as stale after reload or session replacement.

## Tool definitions

Use strict parameter schemas and clear descriptions. Add `promptSnippet` only when the tool should appear in Pi's concise available-tools list. Every `promptGuidelines` bullet must name the tool.

Use `executionMode: "sequential"` when calls share state or control external UI. Leave independent read-only operations parallel.

Honor the execution signal:

```ts
async execute(_id, params, signal, onUpdate, ctx) {
  signal?.throwIfAborted();
  onUpdate?.({ content: [{ type: "text", text: "Working…" }] });
  // bounded work
}
```

Throw an `Error` for failed execution. Returning `{ isError: true }` does not mark a tool result as failed.

Use `StringEnum` from `@earendil-works/pi-ai` for string enum parameters so Google-compatible providers receive valid schemas.

For file mutations, resolve the real target path and wrap the full read-modify-write window in `withFileMutationQueue()`.

## Output and images

Never return unbounded output. Use Pi's exported truncation helpers and defaults:

- `truncateHead` for source, search, and ordered records.
- `truncateTail` for logs and command output.
- `DEFAULT_MAX_BYTES` and `DEFAULT_MAX_LINES` for standard limits.

When truncating, save complete output to a unique temporary file and tell the model where it is. Remove temporary test artifacts; keep runtime files only when the result explicitly references them for later access.

Return screenshots as native image blocks:

```ts
{
  type: "image",
  data: pngBuffer.toString("base64"),
  mimeType: "image/png"
}
```

Limit image count and size. Pi normalizes oversized tool-result images, but extensions should avoid generating unnecessary images.

## UI and commands

Guard dialogs and notifications with `ctx.hasUI`. Guard terminal components and `ctx.ui.custom()` with `ctx.mode === "tui"`.

Use commands for user-initiated workflows and tools for model-callable operations. Make permission requests and consequential actions user-initiated.

Keep renderers optional. Pi's fallback rendering is preferable to custom UI that adds no useful state or affordance.

## Verification

Perform three layers:

1. Static checks:
   ```bash
   vp check
   git diff --check
   ```
2. Loader check:
   ```bash
   pi --no-extensions -e "$PWD" --no-skills --list-models '__load_check__'
   ```
3. Runtime smoke test:
   - invoke the registered tool from a fresh Pi session or Pi's extension loader
   - use safe input
   - assert meaningful output and detail fields
   - test at least one error path
   - verify cancellation, timeout, truncation, or image behavior when implemented

After Git publication, install with `pi install git:github.com/OWNER/REPO`, reload Pi, and repeat the runtime smoke test through the installed tool. Source-only success does not prove the package manifest or Git install path works.
