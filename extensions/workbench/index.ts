import { StringEnum } from "@earendil-works/pi-ai";
import {
  createBashTool,
  createEditTool,
  createWriteTool,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  keyHint,
  SessionManager,
  truncateHead,
  UserMessageSelectorComponent,
  type ExtensionAPI,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { listArtifacts, readArtifact, resolveArtifactPath, writeArtifact } from "./artifacts.ts";
import {
  clearParentReport,
  readParentReport,
  writeParentReport,
  type ParentReport,
} from "./agent-reports.ts";
import {
  buildHandoffResumePrompt,
  claimHandoffDescriptor,
  createHandoffDescriptor,
  createHandoffSession,
  parseHandoffResumeArgs,
  removePendingHandoff,
} from "./handoff.ts";
import {
  agentName,
  agentPanelName,
  launchAgentResultText,
  launchAgentToolResult,
  renderAgentPanelLines,
  runWorkspaceResultText,
  taskLineCount,
  taskPreview,
  todoResultText,
  toolResultText,
  waitForAgentResultText,
  waitForAgentToolResult,
  workbenchStatusText,
  type AgentPanelItem,
} from "./rendering.ts";
import { createRun, ensureWorkspaceRun, getRun, joinRun, listRuns, updateRun } from "./runs.ts";
import { SessionMetricsReader } from "./session-metrics.ts";
import {
  AgentWaitError,
  classifyDurableHandoff,
  findReviewCompletion,
  getAgentRuntimeState,
  inferTodoIdFromAgentLabel,
  launchAgent,
  listReviewComments,
  resolveAgentSessionFile,
  reviewCompletionMarker,
  shouldNotifyMissingCompletion,
  waitForAgent,
  waitForAgentActivity,
  type ScExecutor,
  type ScReviewComment,
} from "./sc.ts";
import {
  appendTodo,
  blockTodo,
  cancelTodoLaunchReservation,
  claimTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  forceReleaseTodo,
  getTodo,
  getTodoPath,
  isTodoReady,
  listTodos,
  releaseTodo,
  reserveTodoLaunch,
  updateTodo,
  withActiveTodoClaim,
} from "./todos.ts";
import type { RunMembership, RunStatus, TodoPriority, TodoStatus } from "./types.ts";
import { detectSuperconductorWorkspace, isCleanSession } from "./workspace.ts";

const RunStatusSchema = StringEnum([
  "planning",
  "ready",
  "executing",
  "reviewing",
  "completed",
  "paused",
  "failed",
] as const);
const TodoStatusSchema = StringEnum(["open", "in_progress", "blocked", "done", "failed"] as const);
const TodoPrioritySchema = StringEnum(["high", "medium", "low"] as const);
const ScResultLimits = {
  maxBytes: DEFAULT_MAX_BYTES,
  maxLines: DEFAULT_MAX_LINES,
  truncateHead,
};

function renderToolCall(name: string, detail: string, theme: any): Text {
  return new Text(theme.fg("toolTitle", theme.bold(`${name} `)) + theme.fg("muted", detail), 0, 0);
}

function renderResultText(text: string, theme: any): Text {
  const themedText = text
    .split("\n")
    .map((line: string) => theme.fg("muted", line))
    .join("\n");
  return new Text(theme.fg("success", "✓ ") + themedText, 0, 0);
}

function renderToolResult(result: any, expanded: boolean, theme: any): Text {
  return renderResultText(toolResultText(result, expanded), theme);
}

function renderRunWorkspaceResult(result: any, expanded: boolean, theme: any): Text {
  return renderResultText(runWorkspaceResultText(result, expanded), theme);
}

function renderTodoResult(result: any, expanded: boolean, theme: any): Text {
  return renderResultText(todoResultText(result, expanded), theme);
}

function renderAgentCall(
  action: "launch" | "wait",
  args: Record<string, unknown> | undefined,
  theme: any,
): Text {
  const input = args ?? {};
  const name = agentPanelName(agentName(action === "launch" ? input.label : input.target));
  let text =
    theme.fg("toolTitle", theme.bold(name)) +
    theme.fg("muted", action === "launch" ? " — launch" : " — wait");
  if (action === "launch") {
    const preview = taskPreview(input.prompt);
    if (preview) {
      text += `\n${theme.fg("toolOutput", preview)}`;
      const lineCount = taskLineCount(input.prompt);
      if (lineCount > 1) text += theme.fg("muted", ` (${lineCount} lines)`);
    }
  }
  return new Text(text, 0, 0);
}

function renderAgentResult(text: string, isPartial: boolean, isError: boolean, theme: any): Text {
  const marker = isError
    ? theme.fg("error", "✗ ")
    : isPartial
      ? theme.fg("warning", "… ")
      : theme.fg("success", "✓ ");
  return new Text(marker + theme.fg(isError ? "error" : "muted", text), 0, 0);
}

function summarizedTodos(todos: Awaited<ReturnType<typeof listTodos>>) {
  return todos.map(({ body: _body, ...todo }) => ({
    ...todo,
    ready: isTodoReady(todo, todos),
  }));
}

export default function workbenchExtension(pi: ExtensionAPI): void {
  let membership: RunMembership | undefined;
  const scExec: ScExecutor = (command, args, options) => pi.exec(command, args, options);
  type AgentCompletionContract =
    | { kind: "parent_report" }
    | {
        kind: "sc_review";
        provider: string;
        token: string;
        artifactPath: string;
      };
  interface TrackedAgent extends AgentPanelItem {
    aliases: Set<string>;
    metricsReader?: SessionMetricsReader;
    resolvingSession?: boolean;
    interactive?: boolean;
    lastReportId?: string;
    lastTodoNotice?: string;
    idleSince?: number;
    idleNoticeSent?: boolean;
    completion?: AgentCompletionContract;
    monitorRecord?: PersistedAgentMonitor;
  }
  interface PersistedAgentMonitor {
    schema: 2;
    action: "start" | "stop";
    runId: string;
    label: string;
    target: string;
    cwd: string;
    startedAt: number;
    interactive: boolean;
    completion: AgentCompletionContract;
    todoId?: string;
    sessionFile?: string;
  }
  const trackedAgents = new Map<string, TrackedAgent>();
  const agentWatchers = new Map<TrackedAgent, AbortController>();
  let agentPanelCtx: any;
  let agentPanelTimer: ReturnType<typeof setInterval> | undefined;
  let refreshingAgentMetrics = false;

  function normalizedAgentTarget(target: string): string {
    return target.replace(/^(?:label:|id:)/, "");
  }

  function findTrackedAgent(target: string): TrackedAgent | undefined {
    const normalized = normalizedAgentTarget(target);
    return Array.from(trackedAgents.values()).find((agent) => agent.aliases.has(normalized));
  }

  async function refreshAgentMetrics(): Promise<void> {
    if (refreshingAgentMetrics) return;
    refreshingAgentMetrics = true;
    try {
      await Promise.all(
        Array.from(trackedAgents.values()).map(async (agent) => {
          if (!agent.metricsReader) return;
          try {
            const previousTurns = agent.metrics?.turns ?? 0;
            await agent.metricsReader.refresh();
            agent.metrics = { ...agent.metricsReader.metrics };
            if (agent.status === "waiting" && agent.metrics.turns > previousTurns) {
              markAgentRunning(agent);
            }
          } catch {
            // Progress metrics are optional; agent monitoring remains authoritative.
          }
        }),
      );
    } finally {
      refreshingAgentMetrics = false;
      updateAgentPanel();
    }
  }

  function updateAgentPanel(ctx = agentPanelCtx): void {
    if (!ctx?.hasUI) return;
    agentPanelCtx = ctx;
    if (trackedAgents.size === 0) {
      ctx.ui.setWidget("workbench-agents", undefined);
      if (agentPanelTimer) clearInterval(agentPanelTimer);
      agentPanelTimer = undefined;
      return;
    }
    ctx.ui.setWidget(
      "workbench-agents",
      (_tui: any, theme: any) => ({
        render: (width: number) =>
          renderAgentPanelLines(Array.from(trackedAgents.values()), width, theme),
        invalidate() {},
      }),
      { placement: "aboveEditor" },
    );
    if (!agentPanelTimer) {
      agentPanelTimer = setInterval(() => {
        updateAgentPanel();
        void refreshAgentMetrics();
      }, 1_000);
      agentPanelTimer.unref();
      void refreshAgentMetrics();
    }
  }

  function trackAgent(
    target: string,
    aliases: Array<string | undefined> = [],
    sessionFile?: string,
  ): TrackedAgent {
    const existing = findTrackedAgent(target);
    if (existing) {
      for (const alias of aliases) {
        if (alias) existing.aliases.add(normalizedAgentTarget(alias));
      }
      if (
        !existing.metricsReader &&
        sessionFile &&
        path.isAbsolute(sessionFile) &&
        sessionFile.endsWith(".jsonl")
      ) {
        existing.metricsReader = new SessionMetricsReader(sessionFile);
      }
      return existing;
    }
    const normalized = normalizedAgentTarget(target);
    const startedAt = Date.now();
    const tracked: TrackedAgent = {
      target,
      startedAt,
      status: "launched",
      activeElapsedMs: 0,
      activeSince: startedAt,
      aliases: new Set([normalized]),
      ...(sessionFile && path.isAbsolute(sessionFile) && sessionFile.endsWith(".jsonl")
        ? { metricsReader: new SessionMetricsReader(sessionFile) }
        : {}),
    };
    for (const alias of aliases) {
      if (alias) tracked.aliases.add(normalizedAgentTarget(alias));
    }
    trackedAgents.set(normalized, tracked);
    return tracked;
  }

  function removeTrackedAgent(agent: TrackedAgent): void {
    for (const [key, candidate] of trackedAgents) {
      if (candidate === agent) trackedAgents.delete(key);
    }
  }

  function persistAgentMonitor(record: PersistedAgentMonitor): void {
    pi.appendEntry("workbench-agent-monitor", record);
  }

  function stopPersistedAgentMonitor(agent: TrackedAgent): void {
    if (!agent.monitorRecord) return;
    persistAgentMonitor({ ...agent.monitorRecord, action: "stop" });
  }

  function agentElapsedText(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function attachAgentSessionMetrics(
    agent: TrackedAgent,
    target: string,
    cwd: string,
    signal?: AbortSignal,
  ): void {
    if (agent.metricsReader || agent.resolvingSession) return;
    agent.resolvingSession = true;
    void resolveAgentSessionFile(scExec, { target }, cwd, signal)
      .then((sessionFile) => {
        if (!sessionFile) return;
        agent.metricsReader = new SessionMetricsReader(sessionFile);
        void refreshAgentMetrics();
      })
      .catch(() => undefined)
      .finally(() => {
        agent.resolvingSession = false;
      });
  }

  async function readAssignedTodo(assignment?: {
    root: string;
    todoId: string;
  }): Promise<Awaited<ReturnType<typeof getTodo>> | undefined> {
    if (!assignment) return undefined;
    try {
      return await getTodo(assignment.root, assignment.todoId);
    } catch (error) {
      throw new AgentWaitError(
        "monitoring_unavailable",
        `Workbench could not verify ${assignment.todoId}: ${error instanceof Error ? error.message : String(error)}. Do not treat the task as completed.`,
        true,
      );
    }
  }

  function watcherDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new AgentWaitError("cancelled", "Agent monitoring was cancelled.", true));
        return;
      }
      const done = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(done, milliseconds);
      const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        reject(new AgentWaitError("cancelled", "Agent monitoring was cancelled.", true));
      };
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  function sendAgentMessage(
    agent: TrackedAgent,
    target: string,
    status: "completed" | "needs_input" | "failed",
    content: string,
    summary?: string,
    extra: Record<string, unknown> = {},
  ): void {
    pi.sendMessage(
      {
        customType: "workbench_agent_result",
        content,
        display: true,
        details: {
          status,
          name: agentPanelName(agent.target),
          target,
          elapsedMs: Date.now() - agent.startedAt,
          summary,
          sessionFile: agent.metricsReader?.path,
          ...extra,
        },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
  }

  function completeTrackedAgent(
    agent: TrackedAgent,
    target: string,
    summary: string,
    extra: Record<string, unknown> = {},
  ): void {
    stopPersistedAgentMonitor(agent);
    removeTrackedAgent(agent);
    updateAgentPanel();
    sendAgentMessage(
      agent,
      target,
      "completed",
      `Delegated agent "${agentPanelName(agent.target)}" completed with durable evidence.\n\n${summary}`,
      summary,
      extra,
    );
  }

  function markAgentWaiting(agent: TrackedAgent): void {
    const now = Date.now();
    if (agent.activeSince !== undefined) {
      agent.activeElapsedMs = (agent.activeElapsedMs ?? 0) + (now - agent.activeSince);
      agent.activeSince = undefined;
    }
    agent.status = "waiting";
    agent.idleSince ??= now;
    updateAgentPanel();
  }

  function markAgentRunning(agent: TrackedAgent): void {
    agent.activeElapsedMs ??= Math.max(0, Date.now() - agent.startedAt);
    agent.activeSince ??= Date.now();
    agent.status = "running";
    agent.idleSince = undefined;
    updateAgentPanel();
  }

  function maybeNotifyMissingCompletion(agent: TrackedAgent, target: string): void {
    if (
      !shouldNotifyMissingCompletion(
        {
          interactive: agent.interactive ?? false,
          idleNoticeSent: agent.idleNoticeSent ?? false,
          idleSince: agent.idleSince,
        },
        Date.now(),
      )
    )
      return;
    agent.idleNoticeSent = true;
    const summary =
      "The agent is idle but has not produced its required durable completion signal. It is still being monitored and has not been marked failed.";
    sendAgentMessage(
      agent,
      target,
      "needs_input",
      `${summary}\n\nInspect or steer the existing agent; do not launch a replacement solely because it is idle.`,
      summary,
    );
  }

  function sendParentReport(agent: TrackedAgent, target: string, report: ParentReport): void {
    const content =
      report.status === "done"
        ? report.summary
        : `Delegated agent "${agentPanelName(agent.target)}" needs parent input:\n\n${report.summary}\n\nThe agent remains open at ${target}.`;
    if (report.status === "done") {
      completeTrackedAgent(agent, target, content, { reportId: report.id });
      return;
    }
    markAgentWaiting(agent);
    sendAgentMessage(agent, target, "needs_input", content, report.summary, {
      reportId: report.id,
    });
  }

  function reviewArtifactContent(
    label: string,
    provider: string,
    verdict: "APPROVED" | "NEEDS CHANGES",
    comments: ScReviewComment[],
  ): string {
    const lines = [
      "# External Code Review",
      "",
      `**Reviewer:** ${label}`,
      `**Provider:** ${provider}`,
      `**Verdict:** ${verdict}`,
      "",
      "## SC Review Comments",
    ];
    for (const comment of comments) {
      const location = comment.file
        ? `${comment.file}${comment.startLine ? `:${comment.startLine}` : ""}`
        : "worktree";
      lines.push(
        "",
        `### ${comment.id} (${comment.status ?? "unknown"})`,
        `**Location:** \`${location}\``,
        "",
        comment.body,
      );
    }
    return `${lines.join("\n")}\n`;
  }

  function handleAgentWatcherFailure(
    agent: TrackedAgent,
    target: string,
    error: unknown,
    controller: AbortController,
  ): void {
    if (
      controller.signal.aborted ||
      (error instanceof AgentWaitError && error.kind === "cancelled")
    ) {
      return;
    }
    const failure =
      error instanceof AgentWaitError
        ? error
        : new AgentWaitError(
            "monitoring_unavailable",
            error instanceof Error ? error.message : String(error),
            true,
          );
    agent.status = failure.kind === "agent_failed" ? "failed" : "monitoring_failed";
    stopPersistedAgentMonitor(agent);
    updateAgentPanel();
    sendAgentMessage(agent, target, "failed", failure.message, undefined, {
      error: failure.message,
      agentMayStillBeRunning: failure.agentMayStillBeRunning,
    });
  }

  async function watchParentReportedAgent(
    agent: TrackedAgent,
    target: string,
    cwd: string,
    runRoot: string,
    assignment: { root: string; todoId: string } | undefined,
    signal: AbortSignal,
    restored: boolean,
  ): Promise<void> {
    if (!restored) {
      await waitForAgentActivity(scExec, { target, startupTimeoutMs: 30_000 }, cwd, signal);
    }
    markAgentRunning(agent);
    while (true) {
      const report = await readParentReport(runRoot, normalizedAgentTarget(agent.target));
      const todoState = await readAssignedTodo(assignment);
      const handoff = classifyDurableHandoff(todoState?.status, report?.status);
      if (handoff === "completed") {
        completeTrackedAgent(
          agent,
          target,
          report?.status === "done"
            ? report.summary
            : `${todoState?.id ?? assignment?.todoId} is durably done with verification and an artifact.`,
          { reportId: report?.id, todoId: todoState?.id },
        );
        return;
      }
      if (report && report.id !== agent.lastReportId) {
        agent.lastReportId = report.id;
        if (report.status === "needs_input") {
          sendParentReport(agent, target, report);
        } else if (assignment && todoState?.status !== "done") {
          markAgentWaiting(agent);
          const summary = `The agent reported done before ${assignment.todoId} was durably complete; its current status is ${todoState?.status ?? "unknown"}. The pane remains open for inspection and recovery.`;
          sendAgentMessage(agent, target, "needs_input", summary, summary, {
            reportId: report.id,
            todoId: assignment.todoId,
          });
        }
      }
      if (todoState && handoff === "needs_input" && report?.status !== "needs_input") {
        const notice = `${todoState.id}:${todoState.status}`;
        if (agent.lastTodoNotice !== notice) {
          agent.lastTodoNotice = notice;
          const summary = `${todoState.id} is durably ${todoState.status}; inspect its blocker and artifact before deciding whether to retry.`;
          sendAgentMessage(agent, target, "needs_input", summary, summary, {
            todoId: todoState.id,
          });
        }
      }
      const runtime = await getAgentRuntimeState(scExec, { target }, cwd, signal);
      if (runtime.state === "working" || runtime.phase === "running") {
        markAgentRunning(agent);
      } else {
        markAgentWaiting(agent);
        maybeNotifyMissingCompletion(agent, target);
      }
      await watcherDelay(1_000, signal);
    }
  }

  async function watchScReviewAgent(
    agent: TrackedAgent,
    target: string,
    cwd: string,
    runRoot: string,
    contract: Extract<AgentCompletionContract, { kind: "sc_review" }>,
    signal: AbortSignal,
    restored: boolean,
  ): Promise<void> {
    if (!restored) {
      await waitForAgentActivity(scExec, { target, startupTimeoutMs: 30_000 }, cwd, signal);
    }
    markAgentRunning(agent);
    const reviewerTag = `[REVIEWER:${agent.monitorRecord?.label ?? normalizedAgentTarget(agent.target)}]`;
    while (true) {
      const runtime = await getAgentRuntimeState(scExec, { target }, cwd, signal);
      if (runtime.state === "working" || runtime.phase === "running") {
        markAgentRunning(agent);
      } else {
        const reviewComments = await listReviewComments(scExec, cwd, signal);
        const completion = findReviewCompletion(
          reviewComments,
          contract.token,
          reviewerTag,
          contract.provider,
        );
        if (completion) {
          const ownedComments = reviewComments.filter(
            (comment) => comment.body.includes(reviewerTag) || comment.id === completion.comment.id,
          );
          await writeArtifact(
            runRoot,
            contract.artifactPath,
            reviewArtifactContent(
              agent.monitorRecord?.label ?? normalizedAgentTarget(agent.target),
              contract.provider,
              completion.verdict,
              ownedComments,
            ),
            "write",
          );
          completeTrackedAgent(
            agent,
            target,
            `SC review completion ${completion.comment.id} was verified. Review artifact: ${contract.artifactPath}.`,
            {
              provider: contract.provider,
              reviewCommentIds: ownedComments.map(({ id }) => id),
              reviewArtifactPath: contract.artifactPath,
            },
          );
          return;
        }
        markAgentWaiting(agent);
        maybeNotifyMissingCompletion(agent, target);
      }
      await watcherDelay(1_000, signal);
    }
  }

  function startAgentWatcher(
    agent: TrackedAgent,
    target: string,
    cwd: string,
    runRoot: string,
    assignment?: { root: string; todoId: string },
    restored = false,
  ): void {
    if (agentWatchers.has(agent)) return;
    const controller = new AbortController();
    agentWatchers.set(agent, controller);
    attachAgentSessionMetrics(agent, target, cwd, controller.signal);
    const completion = agent.completion;
    const watcher =
      completion?.kind === "sc_review"
        ? watchScReviewAgent(agent, target, cwd, runRoot, completion, controller.signal, restored)
        : watchParentReportedAgent(
            agent,
            target,
            cwd,
            runRoot,
            assignment,
            controller.signal,
            restored,
          );
    void watcher
      .catch((error) => handleAgentWatcherFailure(agent, target, error, controller))
      .finally(() => agentWatchers.delete(agent));
  }

  async function withClaimLease<T>(ctx: any, operation: () => Promise<T>): Promise<T> {
    const active = membership;
    if (!active?.todoId) return operation();
    return withActiveTodoClaim(
      active.root,
      active.todoId,
      ctx.sessionManager.getSessionId(),
      operation,
    );
  }

  const bashTool = createBashTool(process.cwd());
  pi.registerTool({
    ...bashTool,
    async execute(id, params, signal, onUpdate, ctx) {
      return withClaimLease(ctx, () =>
        createBashTool(ctx.cwd).execute(id, params, signal, onUpdate),
      );
    },
  });

  const editTool = createEditTool(process.cwd());
  pi.registerTool({
    ...editTool,
    async execute(id, params, signal, onUpdate, ctx) {
      return withClaimLease(ctx, () =>
        createEditTool(ctx.cwd).execute(id, params, signal, onUpdate),
      );
    },
  });

  const writeTool = createWriteTool(process.cwd());
  pi.registerTool({
    ...writeTool,
    async execute(id, params, signal, onUpdate, ctx) {
      return withClaimLease(ctx, () =>
        createWriteTool(ctx.cwd).execute(id, params, signal, onUpdate),
      );
    },
  });

  function refreshMembershipStatus(ctx: any): void {
    ctx.ui.setStatus("workbench", workbenchStatusText(membership));
  }

  function saveMembership(next: RunMembership | undefined, ctx: any): void {
    membership = next;
    pi.appendEntry("workbench-run", next ?? null);
    refreshMembershipStatus(ctx);
  }

  async function restoreMembership(ctx: any): Promise<void> {
    const entries = ctx.sessionManager.getEntries();
    const entry = [...entries]
      .reverse()
      .find((item: any) => item.type === "custom" && item.customType === "workbench-run");
    const stored = entry?.data as RunMembership | null | undefined;
    if (!stored) {
      membership = undefined;
    } else {
      try {
        const run = await getRun(stored.projectPath, stored.runId);
        membership = {
          ...stored,
          projectPath: run.manifest.repository.root,
          root: run.root,
          scope: run.manifest.scope,
        };
      } catch {
        membership = undefined;
      }
    }
    refreshMembershipStatus(ctx);
  }

  function requireMembership(): RunMembership {
    if (!membership) {
      throw new Error(
        "No active workbench run. Call run_workspace with action=create or action=join first.",
      );
    }
    return membership;
  }

  async function join(
    ctx: any,
    runId: string,
    role: string,
    label?: string,
    targetId?: string,
    todoId?: string,
    projectPath = ctx.cwd,
  ): Promise<RunMembership> {
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const resolvedTargetId = targetId ?? detectSuperconductorWorkspace()?.targetId;
    const joined = await joinRun(projectPath, runId, {
      sessionId: ctx.sessionManager.getSessionId(),
      role,
      label,
      targetId: resolvedTargetId,
      todoId,
      model,
      reasoning: ctx.thinkingLevel,
    });
    saveMembership(joined.membership, ctx);
    return joined.membership;
  }

  async function updateMembershipTodo(ctx: any, todoId?: string): Promise<void> {
    const current = requireMembership();
    await join(
      ctx,
      current.runId,
      current.role,
      current.label,
      current.targetId,
      todoId,
      current.projectPath,
    );
  }

  function restoreAgentMonitors(ctx: any): void {
    if (!membership) return;
    const active = new Map<string, PersistedAgentMonitor>();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom" || entry.customType !== "workbench-agent-monitor") continue;
      const record = entry.data as PersistedAgentMonitor | undefined;
      if (
        !record ||
        record.schema !== 2 ||
        record.runId !== membership.runId ||
        typeof record.target !== "string"
      )
        continue;
      if (record.action === "stop") active.delete(record.target);
      else if (record.action === "start") active.set(record.target, record);
    }
    for (const record of active.values()) {
      const tracked = trackAgent(record.label, [], record.sessionFile);
      tracked.startedAt = record.startedAt;
      tracked.activeElapsedMs = Math.max(0, Date.now() - record.startedAt);
      tracked.activeSince = undefined;
      tracked.interactive = record.interactive;
      tracked.completion = record.completion;
      tracked.monitorRecord = record;
      updateAgentPanel(ctx);
      startAgentWatcher(
        tracked,
        record.target,
        record.cwd,
        membership.root,
        record.todoId ? { root: membership.root, todoId: record.todoId } : undefined,
        true,
      );
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    agentPanelCtx = ctx;
    await restoreMembership(ctx);
    restoreAgentMonitors(ctx);
    if (membership || !isCleanSession(ctx.sessionManager.getEntries())) return;

    const workspace = detectSuperconductorWorkspace();
    if (!workspace) return;
    try {
      const run = await ensureWorkspaceRun(workspace.scope);
      await join(
        ctx,
        run.manifest.id,
        "workspace",
        undefined,
        workspace.targetId,
        undefined,
        workspace.scope.path,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Workbench workspace initialization failed: ${detail}`, "error");
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (agentPanelTimer) clearInterval(agentPanelTimer);
    agentPanelTimer = undefined;
    for (const controller of agentWatchers.values()) controller.abort();
    agentWatchers.clear();
    trackedAgents.clear();
    ctx.ui.setWidget("workbench-agents", undefined);
    agentPanelCtx = undefined;
  });

  pi.on("before_agent_start", async (event) => {
    if (!membership) return;
    const workspaceContext =
      membership.scope?.type === "workspace"
        ? `\nWorkspace: ${membership.scope.name} (${membership.scope.provider})`
        : "";
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Active Workbench Run\nRun ID: ${membership.runId}\nRun root: ${membership.root}\nRole: ${membership.role}${workspaceContext}\nLabel: ${membership.label ?? "unlabeled"}\nTodo: ${membership.todoId ?? "none"}\n\nThis session is already joined to Workbench; do not create or join a run merely to initialize it. Use write_artifact/read_artifact for run documents and todo for durable task state. Keep all run working files beneath the run root. SC labels and coordination state are runtime controls; workbench files are the durable source of truth.`,
    };
  });

  pi.registerMessageRenderer("workbench_agent_result", (message, options, theme) => {
    const details = message.details as Record<string, unknown> | undefined;
    if (!details) return undefined;
    const failed = details.status === "failed";
    const needsInput = details.status === "needs_input";
    const name = typeof details.name === "string" ? details.name : "Agent";
    const elapsedMs = typeof details.elapsedMs === "number" ? details.elapsedMs : 0;
    const icon = failed ? "✗" : needsInput ? "!" : "✓";
    const iconColor = failed ? "error" : needsInput ? "warning" : "success";
    const status = failed ? "failed" : needsInput ? "needs input" : "completed";
    const header =
      `${theme.fg(iconColor, icon)} ` +
      theme.fg("toolTitle", theme.bold(name)) +
      theme.fg("dim", ` — ${status} (${agentElapsedText(elapsedMs)})`);
    const lines = [header];
    if (options.expanded) {
      const content = typeof message.content === "string" ? message.content : "";
      if (content) lines.push("", content);
      if (typeof details.sessionFile === "string") {
        lines.push("", theme.fg("dim", `Session: ${details.sessionFile}`));
      }
    } else {
      const summary = typeof details.summary === "string" ? details.summary : "";
      lines.push(
        theme.fg(
          "muted",
          failed
            ? "Monitoring stopped; the coordinator needs your decision."
            : needsInput
              ? summary
              : "Runtime result delivered; verifying durable Workbench evidence.",
        ),
        theme.fg("muted", keyHint("app.tools.expand", "to expand")),
      );
    }
    const box = new Box(1, 1, (text: string) =>
      theme.bg(failed ? "toolErrorBg" : needsInput ? "toolPendingBg" : "toolSuccessBg", text),
    );
    box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  pi.registerTool({
    name: "report_to_parent",
    label: "Report to Parent",
    description:
      "Write a durable completion or input-needed report from any labeled delegated Pi agent to its parent coordinator. Runtime idle is never completion. A done report is accepted only when the assigned todo is durably done; otherwise it is downgraded to needs_input. Valid completion ends the turn but leaves the agent pane open for inspection.",
    promptSnippet: "Durably report delegated completion or a blocker to the parent coordinator",
    promptGuidelines: [
      "Every labeled delegated Pi agent launched by launch_agent must finish by calling report_to_parent; terminal text or runtime idle is not a handoff.",
      "Call report_to_parent with status=needs_input when the parent coordinator must answer or act; remain available for further guidance.",
      "Call report_to_parent with status=done only after the assigned todo, verification, and artifact requirements are durably complete; the pane remains open after handoff.",
    ],
    parameters: Type.Object({
      status: StringEnum(["done", "needs_input"] as const),
      summary: Type.String({
        minLength: 1,
        description: "Concise progress, question, or final summary for the parent coordinator",
      }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const active = requireMembership();
      if (!active.label || active.role === "coordinator" || active.role === "workspace") {
        throw new Error(
          "report_to_parent is available only inside a labeled delegated agent session.",
        );
      }
      const summary = params.summary.trim();
      if (!summary) throw new Error("summary must not be empty");
      let status = params.status;
      let reportSummary = summary;
      if (status === "done" && active.todoId) {
        const todoState = await getTodo(active.root, active.todoId);
        if (todoState.status !== "done") {
          status = "needs_input";
          reportSummary = `Cannot report done: ${active.todoId} is durably ${todoState.status}. ${summary}`;
        }
      }
      const report = await writeParentReport(active.root, active.label, status, reportSummary);
      return {
        content: [
          {
            type: "text" as const,
            text:
              status === "done"
                ? "Final durable report delivered. This agent turn is complete; the pane remains open for inspection."
                : "Input request delivered to the parent coordinator. Continue waiting for user or parent guidance.",
          },
        ],
        details: { requestedStatus: params.status, status, report },
        ...(status === "done" ? { terminate: true } : {}),
      };
    },
    renderCall(args, theme) {
      const status = (args as Record<string, unknown> | undefined)?.status;
      return renderToolCall("Report to parent", typeof status === "string" ? status : "", theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "launch_agent",
    label: "Launch Agent",
    description:
      "Launch one labeled Pi terminal in the current worktree and monitor it asynchronously through durable parent reports and Workbench todo state. Runtime idle is treated only as waiting, never as completion or failure. The tool returns immediately after dispatch; live progress stays in the Agents panel and durable completion, blockers, or real monitoring failures wake the coordinator. Worker launches reserve their todo atomically.",
    promptSnippet:
      "Start one delegated Pi agent; progress and completion are delivered automatically",
    promptGuidelines: [
      "Use launch_agent only after joining or creating the active Workbench run, with an explicit deterministic label, role, and complete prompt.",
      "Pass launch_agent todoId for every worker launch; labels containing TODO-NNN are also linked automatically. A recovered worker retry must use a new label.",
      "Every launch_agent worker prompt must require the worker to read the commit skill, create one focused verified commit, record its SHA, and not push.",
      "Use launch_agent model and reasoning only when those values have been verified against live SC capabilities.",
      "Every launch_agent child must call report_to_parent for a durable handoff; interactive=true additionally marks ordinary idle as an expected user-driven pause.",
      "After launch_agent returns, do not call wait_for_agent, poll, sleep, or inspect the child session. Background monitoring updates the Agents panel and automatically delivers durable completion, needs-input, or failure messages.",
      "Treat launch_agent success as dispatch only. When its completion message arrives, verify the assigned Workbench todo and artifact before advancing.",
    ],
    parameters: Type.Object({
      label: Type.String({ description: "Explicit SC label for the launched agent" }),
      role: Type.String({
        description:
          "Workbench role for the child, such as worker, scout, reviewer, or interactive",
      }),
      prompt: Type.String({
        description: "Complete prompt sent to the launched Pi terminal as one argv value",
      }),
      todoId: Type.Optional(
        Type.String({ description: "Workbench todo reserved for this worker launch" }),
      ),
      model: Type.Optional(Type.String({ description: "Verified Pi model ID" })),
      reasoning: Type.Optional(Type.String({ description: "Verified Pi reasoning level" })),
      interactive: Type.Optional(
        Type.Boolean({
          description:
            "Keep the agent alive across idle periods until it explicitly calls report_to_parent with status=done",
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const active = requireMembership();
      const todoId = params.todoId ?? inferTodoIdFromAgentLabel(params.label);
      const sessionId = ctx.sessionManager.getSessionId();
      if (todoId) {
        await reserveTodoLaunch(active.root, todoId, active, sessionId, params.label);
      }
      try {
        await clearParentReport(active.root, params.label);
        const completionContract = `\n\n## Durable parent reporting (required)\nBefore doing any work, join the parent Workbench run with run_workspace using action=join, runId=${JSON.stringify(active.runId)}, projectPath=${JSON.stringify(active.projectPath)}, role=${JSON.stringify(params.role)}, label=${JSON.stringify(params.label)}${todoId ? `, todoId=${JSON.stringify(todoId)}` : ""}. This exact handshake is mandatory.\n\nRuntime idle and a final terminal response are not completion signals. If you need parent input or are blocked, call report_to_parent with status=needs_input and remain available. When and only when the assigned work is durably complete${todoId ? `, ${todoId} is done with its required verification and artifact,` : ""} call report_to_parent with status=done and a concise final summary. Make that tool call before your final response. The completed agent pane remains open for inspection. ${params.interactive ? "This is a long-lived user-driven session, so ordinary idle periods only mean you are waiting." : "Do not finish without the report_to_parent tool call."}`;
        const launched = await launchAgent(
          scExec,
          { ...params, provider: "pi", prompt: `${params.prompt}${completionContract}` },
          ctx.cwd,
          signal,
        );
        const tracked = trackAgent(
          params.label,
          [launched.identifiers.selector, launched.identifiers.stableTargetId],
          launched.identifiers.sessionId,
        );
        tracked.interactive = params.interactive ?? false;
        tracked.completion = { kind: "parent_report" };
        const monitorTarget = `label:${params.label}`;
        const monitorRecord: PersistedAgentMonitor = {
          schema: 2,
          action: "start",
          runId: active.runId,
          label: params.label,
          target: monitorTarget,
          cwd: ctx.cwd,
          startedAt: tracked.startedAt,
          interactive: params.interactive ?? false,
          completion: { kind: "parent_report" },
          todoId,
          sessionFile: launched.identifiers.sessionId,
        };
        tracked.monitorRecord = monitorRecord;
        persistAgentMonitor(monitorRecord);
        updateAgentPanel(ctx);
        startAgentWatcher(
          tracked,
          monitorTarget,
          ctx.cwd,
          active.root,
          todoId ? { root: active.root, todoId } : undefined,
        );
        const toolResult = launchAgentToolResult(launched, ScResultLimits);
        return {
          ...toolResult,
          content: [
            {
              type: "text" as const,
              text: `Started delegated agent "${agentPanelName(params.label)}". Background monitoring now waits for durable parent-report or todo evidence; transient idle will remain waiting instead of being marked failed. Do not inspect results or launch dependent work until a durable message arrives.`,
            },
          ],
          terminate: true,
        };
      } catch (error) {
        if (todoId) {
          await cancelTodoLaunchReservation(active.root, todoId, sessionId, params.label).catch(
            () => undefined,
          );
        }
        throw error;
      }
    },
    renderCall(args, theme) {
      return renderAgentCall("launch", args as Record<string, unknown>, theme);
    },
    renderResult(result, { expanded, isPartial, isError }, theme, context) {
      const label = (context.args as Record<string, unknown> | undefined)?.label;
      const summary =
        !expanded && !isError && result.details?.status === "launched"
          ? `${agentPanelName(typeof label === "string" ? label : "agent")} — started`
          : launchAgentResultText(result, expanded, isError);
      return renderAgentResult(summary, isPartial, isError, theme);
    },
  });

  pi.registerTool({
    name: "launch_review_agent",
    label: "Launch Review Agent",
    description:
      "Launch a labeled app-managed reviewer with a verified external provider such as Claude Code. The reviewer is tracked in the Workbench Agents panel. Its terminal output and idle state are not the handoff: it must publish findings or approval as SC worktree review comments plus a unique final review marker. Workbench verifies that marker and writes a durable review artifact before waking the coordinator.",
    promptSnippet:
      "Launch and durably monitor an external-provider reviewer through SC review comments",
    promptGuidelines: [
      "Use launch_review_agent when the human requests an app-managed reviewer from Claude Code or another verified external provider.",
      "Before launch_review_agent, verify the provider, model, reasoning level, structured-read support, and SC review commands from live capabilities/help.",
      "Treat launch_review_agent as dispatch only. Do not poll or read the reviewer; Workbench waits for its verified SC review completion marker and writes the review artifact automatically.",
      "A launch_review_agent reviewer is read-only: its prompt may not ask it to edit, commit, or push.",
    ],
    parameters: Type.Object({
      label: Type.String({ description: "Deterministic SC reviewer label" }),
      provider: Type.String({ description: "Verified SC provider key, such as claude" }),
      prompt: Type.String({ description: "Complete review task and scope" }),
      model: Type.Optional(Type.String({ description: "Verified provider model ID" })),
      reasoning: Type.Optional(Type.String({ description: "Verified provider reasoning level" })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const active = requireMembership();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(params.label)) {
        throw new Error(
          "Reviewer label must be one safe path segment (letters, numbers, dot, underscore, or hyphen).",
        );
      }
      if (params.provider === "pi") {
        throw new Error(
          "Use launch_agent with role=reviewer for Pi reviewers; launch_review_agent is for external providers.",
        );
      }
      const token = randomUUID();
      const marker = reviewCompletionMarker(token);
      const reviewerTag = `[REVIEWER:${params.label}]`;
      const artifactPath = `artifacts/${params.label}/review.md`;
      const reviewContract = `\n\n## Durable SC review handoff (required)\nYou are the read-only reviewer for Workbench run ${JSON.stringify(active.runId)} with label ${JSON.stringify(params.label)}. Do not edit implementation files, commit, push, or launch other agents.\n\nRun \`sc instructions review\` first. Inspect \`sc worktree review-checklist --json\`, \`sc worktree diff-summary --json\`, and every open review thread via review-list plus review-get. Review the actual diff and run targeted verification. Publish every actionable finding with \`sc worktree review-add\` at the relevant file/line. Every finding body must contain ${JSON.stringify(reviewerTag)}, a P0-P3 priority, the Workbench run ID, impact, and a concrete fix. Do not leave the findings only in terminal output.\n\nAfter all findings are published and verified with review-list/review-get, publish exactly one final file-anchored review comment. If approved, its body must begin \`[APPROVED] ${marker} ${reviewerTag}\` and include the run ID plus verification. If changes are needed, its body must begin \`${marker} ${reviewerTag} [NEEDS CHANGES]\` and list the finding comment IDs. Verify the final comment with review-get. The unique marker ${JSON.stringify(marker)} is the only completion signal Workbench accepts; terminal idle or a prose answer is not completion. End with a concise terminal summary only after the comments are verified.`;
      const launched = await launchAgent(
        scExec,
        { ...params, prompt: `${params.prompt}${reviewContract}` },
        ctx.cwd,
        signal,
      );
      const tracked = trackAgent(
        params.label,
        [launched.identifiers.selector, launched.identifiers.stableTargetId],
        launched.identifiers.sessionId,
      );
      tracked.completion = {
        kind: "sc_review",
        provider: params.provider,
        token,
        artifactPath,
      };
      const monitorTarget = `label:${params.label}`;
      const monitorRecord: PersistedAgentMonitor = {
        schema: 2,
        action: "start",
        runId: active.runId,
        label: params.label,
        target: monitorTarget,
        cwd: ctx.cwd,
        startedAt: tracked.startedAt,
        interactive: false,
        completion: tracked.completion,
        sessionFile: launched.identifiers.sessionId,
      };
      tracked.monitorRecord = monitorRecord;
      persistAgentMonitor(monitorRecord);
      updateAgentPanel(ctx);
      startAgentWatcher(tracked, monitorTarget, ctx.cwd, active.root);
      const toolResult = launchAgentToolResult(launched, ScResultLimits);
      return {
        ...toolResult,
        content: [
          {
            type: "text" as const,
            text: `Started ${params.provider} reviewer "${agentPanelName(params.label)}". Workbench is tracking it in the Agents panel and will complete only after verifying the unique SC review marker and writing ${artifactPath}.`,
          },
        ],
        terminate: true,
      };
    },
    renderCall(args, theme) {
      return renderAgentCall("launch", args as Record<string, unknown>, theme);
    },
    renderResult(result, { expanded, isPartial, isError }, theme, context) {
      const label = (context.args as Record<string, unknown> | undefined)?.label;
      const summary =
        !expanded && !isError && result.details?.status === "launched"
          ? `${agentPanelName(typeof label === "string" ? label : "reviewer")} — started`
          : launchAgentResultText(result, expanded, isError);
      return renderAgentResult(summary, isPartial, isError, theme);
    },
  });

  pi.registerTool({
    name: "wait_for_agent",
    label: "Retry Agent Monitoring",
    description:
      "Explicitly retry monitoring an existing exact agent target after automatic background monitoring failed or was interrupted. Do not call this after launch_agent during the normal lifecycle: launch_agent already monitors in the background and delivers completion automatically. A retry remains active until completion, cancellation, delegated-agent failure, or monitoring failure.",
    promptSnippet: "Retry failed or interrupted monitoring for an existing delegated agent",
    promptGuidelines: [
      "Do not call wait_for_agent after launch_agent during normal orchestration; launch_agent already owns background monitoring and automatic result delivery.",
      "Use wait_for_agent only when automatic monitoring failed or was interrupted and the user explicitly chose to retry monitoring.",
      "If wait_for_agent reports another delegated-agent or monitoring failure, stop orchestration, explain whether the worker may still be running, and ask the user whether to inspect, retry, or stop. Do not relaunch automatically.",
    ],
    parameters: Type.Object({
      target: Type.String({
        description: "Exact SC target, such as label:worker or id:terminal:UUID",
      }),
      last: Type.Optional(
        Type.Integer({ minimum: 1, description: "Number of transcript entries to read" }),
      ),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      requireMembership();
      const tracked = trackAgent(params.target);
      if (agentWatchers.has(tracked)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent "${agentPanelName(params.target)}" is already monitored in the background. Wait for its automatic completion message; do not inspect durable results yet.`,
            },
          ],
          details: { status: "monitoring", target: params.target },
        };
      }
      tracked.status = "running";
      attachAgentSessionMetrics(tracked, params.target, ctx.cwd, signal);
      updateAgentPanel(ctx);
      const startedAt = Date.now();
      let attempts = 1;
      const pollIntervalMs = 120_000;
      const publishWaitingState = () => {
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for ${params.target} to become idle` }],
          details: {
            status: "waiting",
            target: params.target,
            attempts,
            elapsedMs: Date.now() - startedAt,
            pollIntervalMs,
          },
        });
      };
      publishWaitingState();
      const progressTimer = onUpdate ? setInterval(publishWaitingState, 1_000) : undefined;
      progressTimer?.unref();
      try {
        const result = await waitForAgent(scExec, params, ctx.cwd, signal, (progress) => {
          attempts = progress.attempts;
          publishWaitingState();
        });
        removeTrackedAgent(tracked);
        updateAgentPanel(ctx);
        return waitForAgentToolResult(params.target, result, ScResultLimits);
      } catch (error) {
        if (error instanceof AgentWaitError && error.kind !== "cancelled") {
          tracked.status = error.kind === "agent_failed" ? "failed" : "monitoring_failed";
          updateAgentPanel(ctx);
        }
        throw error;
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }
    },
    renderCall(args, theme) {
      return renderAgentCall("wait", args as Record<string, unknown>, theme);
    },
    renderResult(result, { expanded, isPartial, isError }, theme) {
      return renderAgentResult(
        waitForAgentResultText(result, expanded, isError),
        isPartial,
        isError,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "run_workspace",
    label: "Run Workspace",
    description:
      "Create, join, inspect, list, or update a durable Workbench run. Clean Superconductor-managed Pi sessions start in an automatic workspace run; explicit orchestration roles join their supplied task run.",
    promptSnippet:
      "Create or join a durable SC run workspace for plans, todos, and agent artifacts",
    promptGuidelines: [
      "Use run_workspace current to inspect the automatic workspace membership when no task run was supplied.",
      "Use run_workspace to join the task run ID supplied in an SC agent launch prompt before doing delegated work.",
      "Use run_workspace create only in the coordinating Pi session, not in scouts, workers, or reviewers.",
      "Pass run_workspace projectPath when the coordinated repository differs from the Pi session's current directory.",
    ],
    parameters: Type.Object({
      action: StringEnum(["create", "join", "current", "list", "update"] as const),
      runId: Type.Optional(
        Type.String({ description: "Existing run ID; defaults to the active run for update" }),
      ),
      projectPath: Type.Optional(
        Type.String({
          description: "Repository path; defaults to the Pi session's current directory",
        }),
      ),
      title: Type.Optional(Type.String({ description: "Run title for create or update" })),
      role: Type.Optional(
        Type.String({
          description: "Role in this run, such as coordinator, scout, worker, or reviewer",
        }),
      ),
      label: Type.Optional(
        Type.String({ description: "SC agent label assigned by the coordinator" }),
      ),
      targetId: Type.Optional(Type.String({ description: "Stable SC target ID when known" })),
      todoId: Type.Optional(Type.String({ description: "Todo assigned to this session" })),
      status: Type.Optional(RunStatusSchema),
      phase: Type.Optional(Type.String({ description: "Current workflow phase" })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      if (params.action === "create") {
        if (!params.title) throw new Error("title is required for create");
        const projectPath = params.projectPath ?? ctx.cwd;
        const created = await createRun(projectPath, params.title);
        const active = await join(
          ctx,
          created.manifest.id,
          params.role ?? "coordinator",
          params.label,
          params.targetId,
          params.todoId,
          projectPath,
        );
        return {
          content: [{ type: "text", text: `Created run ${active.runId}\nRoot: ${active.root}` }],
          details: { action: params.action, membership: active, manifest: created.manifest },
        };
      }
      if (params.action === "join") {
        if (!params.runId) throw new Error("runId is required for join");
        const active = await join(
          ctx,
          params.runId,
          params.role ?? "worker",
          params.label,
          params.targetId,
          params.todoId,
          params.projectPath ?? ctx.cwd,
        );
        return {
          content: [{ type: "text", text: `Joined run ${active.runId}\nRoot: ${active.root}` }],
          details: { action: params.action, membership: active },
        };
      }
      if (params.action === "current") {
        const active = requireMembership();
        const run = await getRun(active.projectPath, active.runId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ membership: active, manifest: run.manifest }, null, 2),
            },
          ],
          details: { action: params.action, membership: active, manifest: run.manifest },
        };
      }
      if (params.action === "list") {
        const runs = await listRuns(params.projectPath ?? ctx.cwd);
        const summary = runs.map(({ manifest, root }) => ({
          id: manifest.id,
          title: manifest.title,
          status: manifest.status,
          phase: manifest.phase,
          updatedAt: manifest.updatedAt,
          root,
        }));
        return {
          content: [
            { type: "text", text: summary.length ? JSON.stringify(summary, null, 2) : "No runs" },
          ],
          details: { action: params.action, runs: summary },
        };
      }

      const active = membership;
      const runId = params.runId ?? requireMembership().runId;
      const projectPath = params.projectPath ?? active?.projectPath ?? ctx.cwd;
      const manifest = await updateRun(projectPath, runId, {
        title: params.title,
        status: params.status as RunStatus | undefined,
        phase: params.phase,
      });
      return {
        content: [
          {
            type: "text",
            text: `Updated run ${manifest.id}: ${manifest.status}/${manifest.phase}`,
          },
        ],
        details: { action: params.action, manifest },
      };
    },
    renderCall(args, theme) {
      return renderToolCall("run_workspace", args.action, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderRunWorkspaceResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "write_artifact",
    label: "Write Artifact",
    description:
      "Write or append a file beneath the active run root. Paths are relative to the run root. run.json, todos/, and .locks/ are reserved.",
    promptSnippet:
      "Write a plan, scout report, worker result, review, or other file in the active run workspace",
    promptGuidelines: [
      "Use write_artifact with path plan.md for the selected plan.",
      "Use write_artifact with paths under artifacts/<role-or-label>/ for delegated agent results.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description:
          "Path relative to the active run root, such as plan.md or artifacts/scout-api/report.md",
      }),
      content: Type.String({ description: "Complete file content, or content to append" }),
      mode: Type.Optional(StringEnum(["write", "append"] as const, { default: "write" })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const active = requireMembership();
      return withClaimLease(ctx, async () => {
        const target = resolveArtifactPath(active.root, params.path);
        const artifact = await withFileMutationQueue(target, () =>
          writeArtifact(active.root, params.path, params.content, params.mode ?? "write"),
        );
        return {
          content: [{ type: "text", text: `Wrote ${artifact.path} (${artifact.bytes} bytes)` }],
          details: { artifact, runId: active.runId, root: active.root },
        };
      });
    },
    renderCall(args, theme) {
      return renderToolCall("write_artifact", `${args.mode ?? "write"} ${args.path}`, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "read_artifact",
    label: "Read Artifact",
    description:
      "Read a file beneath the active run root by relative path. Output is limited to 50 KB or 2,000 lines; use offset and limit for large files.",
    promptSnippet: "Read a plan or agent artifact from the active run workspace",
    promptGuidelines: [
      "Use read_artifact for workbench run files instead of guessing paths or searching unrelated Pi sessions.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to the active run root" }),
      offset: Type.Optional(
        Type.Integer({ minimum: 1, description: "First line to return, starting at 1" }),
      ),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum lines to return" })),
    }),
    async execute(_id, params) {
      const active = requireMembership();
      const artifact = await readArtifact(
        active.root,
        params.path,
        params.offset ?? 1,
        params.limit,
      );
      const truncated = truncateHead(artifact.content, {
        maxBytes: DEFAULT_MAX_BYTES,
        maxLines: DEFAULT_MAX_LINES,
      });
      const suffix = truncated.truncated
        ? `\n\n[Output truncated. Continue reading ${artifact.path} with offset/limit.]`
        : "";
      return {
        content: [{ type: "text", text: `${truncated.content}${suffix}` }],
        details: { ...artifact, truncated: truncated.truncated, runId: active.runId },
      };
    },
    renderCall(args, theme) {
      return renderToolCall("read_artifact", args.path, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "list_artifacts",
    label: "List Artifacts",
    description:
      "List plan and artifact files beneath the active run root, excluding todo and internal state files.",
    promptSnippet: "List files produced in the active run workspace",
    parameters: Type.Object({}),
    async execute() {
      const active = requireMembership();
      const artifacts = await listArtifacts(active.root);
      return {
        content: [
          {
            type: "text",
            text: artifacts.length ? JSON.stringify(artifacts, null, 2) : "No artifacts",
          },
        ],
        details: { artifacts, runId: active.runId },
      };
    },
    renderCall(_args, theme) {
      return renderToolCall("list_artifacts", "", theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage durable todos in the active run. Actions: list, get, create, update, append, claim, release, force_release, block, complete, delete. Completion requires the current claim, completed dependencies, verification, and an artifact. Force release is an audited coordinator recovery action.",
    promptSnippet: "Create, inspect, claim, update, block, complete, or delete durable run todos",
    promptGuidelines: [
      "Use todo claim before starting implementation and todo complete only after recording verification evidence.",
      "Use todo force_release only as a coordinator recovering a claim from a disappeared worker, with an explicit reason.",
      "Use todo bodies for self-contained worker instructions with constraints, references, and acceptance criteria.",
    ],
    parameters: Type.Object({
      action: StringEnum([
        "list",
        "get",
        "create",
        "update",
        "append",
        "claim",
        "release",
        "force_release",
        "block",
        "complete",
        "delete",
      ] as const),
      id: Type.Optional(Type.String({ description: "Todo ID such as TODO-001" })),
      title: Type.Optional(Type.String()),
      body: Type.Optional(Type.String()),
      content: Type.Optional(Type.String({ description: "Markdown to append" })),
      status: Type.Optional(TodoStatusSchema),
      priority: Type.Optional(TodoPrioritySchema),
      tags: Type.Optional(Type.Array(Type.String())),
      dependsOn: Type.Optional(Type.Array(Type.String())),
      reason: Type.Optional(
        Type.String({ description: "Block or coordinator force-release reason" }),
      ),
      verification: Type.Optional(Type.String({ description: "Verification command and result" })),
      artifactRefs: Type.Optional(
        Type.Array(Type.String({ description: "Paths relative to the run root" })),
      ),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const active = requireMembership();
      if (params.action === "list") {
        const todos = await listTodos(active.root);
        return {
          content: [
            {
              type: "text",
              text: todos.length ? JSON.stringify(summarizedTodos(todos), null, 2) : "No todos",
            },
          ],
          details: { action: params.action, todos: summarizedTodos(todos), runId: active.runId },
        };
      }
      if (params.action === "get") {
        if (!params.id) throw new Error("id is required for get");
        const todo = await getTodo(active.root, params.id);
        return {
          content: [{ type: "text", text: JSON.stringify(todo, null, 2) }],
          details: { action: params.action, todo, runId: active.runId },
        };
      }
      if (params.action === "create") {
        if (!params.title) throw new Error("title is required for create");
        const todo = await withFileMutationQueue(
          path.join(active.root, ".locks", "todos.lock"),
          () =>
            createTodo(active.root, {
              title: params.title!,
              body: params.body,
              priority: params.priority as TodoPriority | undefined,
              tags: params.tags,
              dependsOn: params.dependsOn,
            }),
        );
        return {
          content: [{ type: "text", text: `Created ${todo.id}: ${todo.title}` }],
          details: { action: params.action, todo, runId: active.runId },
        };
      }
      if (!params.id) throw new Error(`id is required for ${params.action}`);
      const target = getTodoPath(active.root, params.id);
      let todo;
      if (params.action === "update") {
        todo = await withFileMutationQueue(target, () =>
          updateTodo(active.root, params.id!, {
            title: params.title,
            body: params.body,
            status: params.status as TodoStatus | undefined,
            priority: params.priority as TodoPriority | undefined,
            tags: params.tags,
            dependsOn: params.dependsOn,
          }),
        );
      } else if (params.action === "append") {
        if (!params.content) throw new Error("content is required for append");
        todo = await withFileMutationQueue(target, () =>
          appendTodo(active.root, params.id!, params.content!),
        );
      } else if (params.action === "claim") {
        todo = await withFileMutationQueue(target, () =>
          claimTodo(active.root, params.id!, active, ctx.sessionManager.getSessionId()),
        );
        await updateMembershipTodo(ctx, params.id);
      } else if (params.action === "release") {
        todo = await withFileMutationQueue(target, () =>
          releaseTodo(active.root, params.id!, ctx.sessionManager.getSessionId()),
        );
        if (active.todoId === params.id) await updateMembershipTodo(ctx, undefined);
      } else if (params.action === "force_release") {
        if (!params.reason) throw new Error("reason is required for force_release");
        todo = await withFileMutationQueue(target, () =>
          forceReleaseTodo(
            active.root,
            params.id!,
            active,
            ctx.sessionManager.getSessionId(),
            params.reason!,
          ),
        );
        if (active.todoId === params.id) await updateMembershipTodo(ctx, undefined);
      } else if (params.action === "block") {
        if (!params.reason) throw new Error("reason is required for block");
        todo = await withFileMutationQueue(target, () =>
          blockTodo(active.root, params.id!, ctx.sessionManager.getSessionId(), params.reason!),
        );
        if (active.todoId === params.id) await updateMembershipTodo(ctx, undefined);
      } else if (params.action === "complete") {
        todo = await withFileMutationQueue(target, () =>
          completeTodo(active.root, params.id!, ctx.sessionManager.getSessionId(), {
            verification: params.verification,
            artifactRefs: params.artifactRefs,
          }),
        );
        if (active.todoId === params.id) await updateMembershipTodo(ctx, undefined);
      } else {
        await withFileMutationQueue(target, () => deleteTodo(active.root, params.id!));
        return {
          content: [{ type: "text", text: `Deleted ${params.id}` }],
          details: { action: params.action, id: params.id, runId: active.runId },
        };
      }
      return {
        content: [
          { type: "text", text: `${params.action} ${todo.id}: ${todo.title} (${todo.status})` },
        ],
        details: { action: params.action, todo, runId: active.runId },
      };
    },
    renderCall(args, theme) {
      return renderToolCall("todo", `${args.action}${args.id ? ` ${args.id}` : ""}`, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderTodoResult(result, expanded, theme);
    },
  });

  function handoffMessageText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .filter((block): block is { type: "text"; text: string } =>
        Boolean(
          block &&
          typeof block === "object" &&
          (block as any).type === "text" &&
          typeof (block as any).text === "string",
        ),
      )
      .map((block) => block.text)
      .join("\n");
  }

  async function selectHandoffMessage(
    sourceSession: SessionManager,
    ctx: any,
  ): Promise<{ entryId: string; text: string } | undefined> {
    const messages = sourceSession.getEntries().flatMap((entry) => {
      if (entry.type !== "message" || entry.message.role !== "user") return [];
      const text = handoffMessageText(entry.message.content);
      return text ? [{ entryId: entry.id, text }] : [];
    });
    if (messages.length === 0) throw new Error("No user messages are available to fork from.");

    const selectedId = await ctx.ui.custom<string | undefined>(
      (tui: any, _theme: any, _kb: any, done: any) => {
        const selector = new UserMessageSelectorComponent(
          messages.map((message) => ({ id: message.entryId, text: message.text })),
          (entryId: string) => done(entryId),
          () => done(undefined),
          messages[messages.length - 1].entryId,
        );
        return {
          render: (width: number) => selector.render(width),
          invalidate: () => selector.invalidate(),
          handleInput: (data: string) => {
            selector.getMessageList().handleInput(data);
            tui.requestRender();
          },
        };
      },
    );
    return messages.find((message) => message.entryId === selectedId);
  }

  async function resumeHandoff(
    resume: { descriptorPath: string; token: string },
    ctx: any,
  ): Promise<void> {
    const claim = await claimHandoffDescriptor(resume.descriptorPath, resume.token);
    let childSessionFile: string | undefined;
    try {
      const descriptor = claim.descriptor;
      const workspace = detectSuperconductorWorkspace();
      if (!workspace) throw new Error("Handoff requires a Superconductor-managed Pi tab.");
      if (path.resolve(workspace.scope.path) !== path.resolve(descriptor.worktreePath)) {
        throw new Error("Handoff opened in a different Superconductor worktree.");
      }
      if (path.resolve(ctx.cwd) !== path.resolve(descriptor.worktreePath)) {
        throw new Error("Handoff Pi session started in the wrong working directory.");
      }

      const run = await getRun(descriptor.projectPath, descriptor.runId);
      if (
        path.resolve(path.dirname(claim.originalPath)) !==
        path.resolve(path.join(run.root, ".handoffs"))
      ) {
        throw new Error("Handoff descriptor does not belong to its recorded Workbench run.");
      }

      const sourceSession = SessionManager.open(descriptor.sourceSessionFile);
      if (
        sourceSession.getSessionId() !== descriptor.sourceSessionId ||
        path.resolve(sourceSession.getCwd()) !== path.resolve(descriptor.worktreePath)
      ) {
        throw new Error("Handoff source session does not match its descriptor.");
      }

      const selected = await selectHandoffMessage(sourceSession, ctx);
      if (!selected) {
        await claim.complete();
        ctx.ui.notify("Handoff cancelled.", "info");
        return;
      }

      const child = await createHandoffSession(
        sourceSession,
        { leafId: selected.entryId, position: "before" },
        new Date(),
      );
      childSessionFile = child.file;
      const childSession = SessionManager.open(child.file);
      const childContext = childSession.buildSessionContext();
      const joined = await joinRun(descriptor.projectPath, descriptor.runId, {
        sessionId: childSession.getSessionId(),
        role: descriptor.role,
        label: descriptor.label,
        targetId: workspace.targetId,
        model: childContext.model
          ? `${childContext.model.provider}/${childContext.model.modelId}`
          : undefined,
        reasoning: childContext.thinkingLevel,
      });
      childSession.appendCustomEntry("workbench-run", joined.membership);

      const switched = await ctx.switchSession(child.file, {
        withSession: async (replacementCtx: any) => {
          replacementCtx.ui.setEditorText(selected.text);
          const assignmentNote = descriptor.parentHadTodo
            ? " The parent retains its todo assignment; this fork joined the run without claiming it."
            : "";
          replacementCtx.ui.notify(`Fork ready in ${descriptor.runId}.${assignmentNote}`, "info");
        },
      });
      if (switched.cancelled) throw new Error("Handoff session switch was cancelled.");
      await claim.complete();
    } catch (error) {
      await claim.release();
      await removePendingHandoff(undefined, childSessionFile);
      throw error;
    }
  }

  async function startHandoff(ctx: any): Promise<void> {
    if (ctx.mode !== "tui") throw new Error("Handoff requires interactive TUI mode.");
    const active = requireMembership();
    const workspace = detectSuperconductorWorkspace();
    if (!workspace) throw new Error("Handoff requires a Superconductor-managed Pi session.");
    if (isCleanSession(ctx.sessionManager.getEntries())) {
      throw new Error("There is no conversation to hand off.");
    }
    await ctx.waitForIdle();

    const sourceSessionFile = ctx.sessionManager.getSessionFile();
    const sourceSessionId = ctx.sessionManager.getSessionId();
    if (!sourceSessionFile || !ctx.sessionManager.getLeafId()) {
      throw new Error("Handoff requires a persisted Pi conversation.");
    }

    let descriptorPath: string | undefined;
    try {
      const label = `handoff-${randomUUID().slice(0, 8)}`;
      const pending = await createHandoffDescriptor(active.root, {
        sourceSessionFile,
        sourceSessionId,
        runId: active.runId,
        projectPath: active.projectPath,
        worktreePath: workspace.scope.path,
        role: active.role,
        label,
        parentHadTodo: Boolean(active.todoId),
      });
      descriptorPath = pending.path;
      const launched = await launchAgent(
        scExec,
        {
          label,
          provider: "pi",
          prompt: buildHandoffResumePrompt(pending.path, pending.descriptor.token),
        },
        workspace.scope.path,
      );
      const target =
        launched.identifiers.stableTargetId ?? launched.identifiers.selector ?? `label:${label}`;
      ctx.ui.notify(`Opened Fork in a new tab (${target}).`, "info");
    } catch (error) {
      await removePendingHandoff(descriptorPath, undefined);
      throw error;
    }
  }

  pi.registerCommand("handoff", {
    description: "Fork this session into a new SC tab and keep the parent open",
    handler: async (args, ctx) => {
      const resume = parseHandoffResumeArgs(args);
      if (resume) {
        await resumeHandoff(resume, ctx);
        return;
      }
      if (args.trim()) throw new Error("Usage: /handoff");
      await startHandoff(ctx);
    },
  });

  pi.registerCommand("runs", {
    description: "Browse and join durable workbench runs for this repository",
    handler: async (_args, ctx) => {
      const runs = await listRuns(ctx.cwd);
      if (runs.length === 0) {
        ctx.ui.notify("No workbench runs for this repository", "info");
        return;
      }
      const choices = runs.map(
        ({ manifest }) =>
          `${manifest.id} · ${manifest.status}/${manifest.phase} · ${manifest.title}`,
      );
      const selected = await ctx.ui.select("Join workbench run", choices);
      if (!selected) return;
      const runId = selected.split(" · ")[0];
      const active = await join(ctx, runId, "coordinator");
      ctx.ui.notify(`Joined ${active.runId}`, "info");
    },
  });

  pi.registerCommand("todos", {
    description: "Browse and manage todos in the active workbench run",
    handler: async (_args, ctx) => {
      const active = requireMembership();
      const todos = await listTodos(active.root);
      if (todos.length === 0) {
        ctx.ui.notify(`No todos in ${active.runId}`, "info");
        return;
      }
      const choices = todos.map((todo) => {
        const assignment = todo.assignedTo?.label ?? todo.assignedTo?.sessionId;
        return `${todo.id} · ${todo.status}${assignment ? ` · ${assignment}` : ""} · ${todo.title}`;
      });
      const selected = await ctx.ui.select(`Todos · ${active.runId}`, choices);
      if (!selected) return;
      const todoId = selected.split(" · ")[0];
      const todo = await getTodo(active.root, todoId);
      const sessionId = ctx.sessionManager.getSessionId();
      const actions = [
        "View or edit body",
        ...(todo.status === "done" ? ["Reopen"] : ["Claim", "Complete", "Block"]),
        ...(todo.assignedTo?.sessionId === sessionId ? ["Release"] : []),
        ...(todo.assignedTo && active.role === "coordinator" ? ["Force release"] : []),
        "Delete",
      ];
      const action = await ctx.ui.select(`${todo.id} · ${todo.title}`, actions);
      if (!action) return;
      if (action === "View or edit body") {
        const edited = await ctx.ui.editor(`${todo.id} body`, todo.body);
        if (edited !== undefined && edited !== todo.body) {
          const save = await ctx.ui.confirm("Save todo body?", todo.title);
          if (save) await updateTodo(active.root, todo.id, { body: edited });
        }
      } else if (action === "Claim") {
        await claimTodo(active.root, todo.id, active, ctx.sessionManager.getSessionId());
        await updateMembershipTodo(ctx, todo.id);
      } else if (action === "Complete") {
        const verification = await ctx.ui.input("Verification evidence", "command and result");
        if (!verification) return;
        const artifactRef = await ctx.ui.input(
          "Completion artifact",
          "artifacts/<label>/result.md",
        );
        if (!artifactRef) return;
        await completeTodo(active.root, todo.id, sessionId, {
          verification,
          artifactRefs: [artifactRef],
        });
        if (active.todoId === todo.id) await updateMembershipTodo(ctx, undefined);
      } else if (action === "Block") {
        const reason = await ctx.ui.input("Why is this blocked?", "missing input or dependency");
        if (reason) {
          await blockTodo(active.root, todo.id, sessionId, reason);
          if (active.todoId === todo.id) await updateMembershipTodo(ctx, undefined);
        }
      } else if (action === "Release") {
        await releaseTodo(active.root, todo.id, sessionId);
        if (active.todoId === todo.id) await updateMembershipTodo(ctx, undefined);
      } else if (action === "Force release") {
        const reason = await ctx.ui.input(
          "Why is this claim being force-released?",
          "worker session disappeared",
        );
        if (!reason) return;
        await forceReleaseTodo(active.root, todo.id, active, sessionId, reason);
        if (active.todoId === todo.id) await updateMembershipTodo(ctx, undefined);
      } else if (action === "Reopen") {
        await updateTodo(active.root, todo.id, { status: "open" });
      } else if (await ctx.ui.confirm(`Delete ${todo.id}?`, "This cannot be undone")) {
        await deleteTodo(active.root, todo.id);
      }
      ctx.ui.notify(`${action}: ${todo.id}`, "info");
    },
  });
}
