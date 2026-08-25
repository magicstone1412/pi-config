---
description: Inspect another local planning session via sc, critique its plan, and steer that session after confirmation
argument-hint: "[topic hint | session .jsonl path | plan.md path]"
---
Another local agent session (usually Pi) in this workspace ran a planning conversation. Your job: find it, independently review the plan it produced (or is still negotiating), report your assessment, and — after I confirm — steer that session with the agreed corrections. Use documented `sc` commands for all session inspection and messaging. Do not modify repo files or start executing the plan yourself; the deliverable is review + steering.

## 1. Locate the planning session

- If the arguments give a topic hint, session path, or plan file path, use it to narrow the search.
- List open sessions with `sc chat list --json` and recent ones with `sc history list --cwd "$PWD" --main-repo <git toplevel> --provider pi --limit 15`. Match on title, first message, and timestamp. With no hint, prefer the most recent planning-shaped session (e.g., one started from a `/plan` prompt).
- Fetch the transcript with `sc history get --provider pi --session <session_id> --cwd "$PWD"`. Large results are persisted to a file — parse that JSON programmatically (python3/jq) instead of reading it raw.

## 2. Reconstruct the planning state

- Derive the plan file path: the session's `.jsonl` path with `.plan.md` instead. Read it if it exists; also glance for `.todos.md` / `.review.md` siblings.
- From the transcript, extract: the original request, the investigation findings, the approaches presented, decisions the user already made, open questions, and whether the session is idle waiting on a selection or already wrote its plan.

## 3. Critique the plan — this is the core step

Do an independent technical review, not a summary:

- Verify load-bearing factual claims (service limits, pricing, API behavior, repo facts) yourself where cheap — check the repo, run quick commands, or search the web — rather than trusting the transcript.
- Explicitly confirm the parts that are right; credibility of the critique depends on it.
- Hunt for tradeoffs and risks the session did NOT mention: rate limits and bulk-operation paths, failure/resume/idempotency behavior, schema or storage decisions that are painful to change later, simpler alternatives, cost, and future extensibility that shouldn't be designed against.
- If a plan file exists, diff it mentally against the decisions in the transcript and flag any drift or omissions.
- Take a position: either endorse the session's recommended approach or propose concrete, numbered refinements. No rubber-stamping, and no bikeshedding on points that don't change outcomes.

## 4. Report and wait for confirmation

Present to me: where the session stands (what it's waiting on), your assessment, the numbered refinements, and the exact steering message you propose to send. Then STOP and wait for my confirmation — unless the arguments or my request already authorized sending (e.g. "and send it").

## 5. Steer the other session

After I confirm:

- Confirm the target is idle via `sc agents list --output json`; address it as `id:chat:<thread_id>` (the chat thread id, not the history .jsonl path — match them by title/timestamp).
- Write the multiline steering message to a scratchpad file, then send it with `sc agent send --to id:chat:<thread_id> --prompt "$(cat <file>)" --output json`.
- Respect the other session's own operating instructions (e.g. "write only PLAN_FILE and stop") — phrase the steering so it can comply, including an explicit approach selection if it is waiting on one.
- Wait with `sc agent wait --to id:chat:<thread_id> --idle`, then verify: the plan file was written/updated, each refinement actually landed (grep for its key terms), and read the session's final reply with `sc agent read`.
- Report the outcome with the plan file's absolute path and anything that did not land.

Session hint / arguments:
$ARGUMENTS
