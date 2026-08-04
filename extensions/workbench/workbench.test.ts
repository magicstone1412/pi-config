import { afterEach, describe, expect, test } from "bun:test";
import {
	appendFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listArtifacts, readArtifact, resolveArtifactPath, writeArtifact } from "./artifacts.ts";
import {
	clearParentReport,
	readParentReport,
	writeParentReport,
} from "./agent-reports.ts";
import {
	agentName,
	agentPanelName,
	launchAgentResultText,
	launchAgentToolResult,
	panelTextWidth,
	renderAgentPanelLines,
	runWorkspaceResultText,
	taskLineCount,
	taskPreview,
	todoResultText,
	toolResultText,
	waitForAgentResultText,
	waitForAgentToolResult,
	workbenchStatusText,
} from "./rendering.ts";
import { createRun, ensureWorkspaceRun, getRun, joinRun } from "./runs.ts";
import { SessionMetricsReader } from "./session-metrics.ts";
import {
	buildGetAgentArgs,
	buildLaunchAgentArgs,
	buildReadAgentArgs,
	buildWaitForAgentArgs,
	executeScJson,
	extractAgentSessionFile,
	extractLaunchIdentifiers,
	inferTodoIdFromAgentLabel,
	waitForAgent,
	AgentWaitError,
	ScCommandError,
	type ScExecutor,
} from "./sc.ts";
import { resolveRepository, withFileLock } from "./storage.ts";
import {
	claimTodo,
	completeTodo,
	createTodo,
	forceReleaseTodo,
	getTodo,
	isTodoReady,
	listTodos,
	releaseTodo,
	reserveTodoLaunch,
	updateTodo,
	withActiveTodoClaim,
} from "./todos.ts";
import type { RunMembership, WorkspaceScope } from "./types.ts";
import { detectSuperconductorWorkspace, isCleanSession } from "./workspace.ts";

const projectRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoots: string[] = [];
const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_MAX_LINES = 2000;
const ScResultLimits = {
	maxBytes: DEFAULT_MAX_BYTES,
	maxLines: DEFAULT_MAX_LINES,
	truncateHead(content: string, options: { maxBytes: number; maxLines: number }) {
		const lines = content.split("\n");
		const output: string[] = [];
		let outputBytes = 0;
		for (const line of lines.slice(0, options.maxLines)) {
			const lineBytes = new TextEncoder().encode(`${output.length ? "\n" : ""}${line}`).byteLength;
			if (outputBytes + lineBytes > options.maxBytes) break;
			output.push(line);
			outputBytes += lineBytes;
		}
		return {
			content: output.join("\n"),
			truncated: output.length < lines.length,
		};
	},
};

async function temporaryHistoryRoot(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "pi-workbench-test-"));
	temporaryRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repository and run storage", () => {
	test("uses one repository identity from nested paths", async () => {
		const fromRoot = await resolveRepository(projectRoot);
		const fromNestedPath = await resolveRepository(path.join(projectRoot, "extensions", "workbench"));
		expect(fromNestedPath.id).toBe(fromRoot.id);
		expect(fromNestedPath.commonDir).toBe(fromRoot.commonDir);
	});

	test("creates, joins, and reloads a run", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const created = await createRun(
			projectRoot,
			"SC native migration",
			historyRoot,
			new Date("2026-07-18T14:53:01.000Z"),
		);
		expect(created.manifest.id).toBe("20260718-145301-sc-native-migration");
		expect(created.manifest.status).toBe("planning");

		const joined = await joinRun(
			projectRoot,
			created.manifest.id,
			{ sessionId: "session-a", role: "scout", label: "migration-scout" },
			historyRoot,
		);
		expect(joined.membership.root).toBe(created.root);

		const loaded = await getRun(projectRoot, created.manifest.id, historyRoot);
		expect(loaded.manifest.participants).toHaveLength(1);
		expect(loaded.manifest.participants[0].label).toBe("migration-scout");
	});
});

describe("automatic Superconductor workspace membership", () => {
	test("detects managed workspace context and ignores ordinary Pi sessions", () => {
		expect(detectSuperconductorWorkspace({})).toBeUndefined();
		expect(detectSuperconductorWorkspace({ SUPERCONDUCTOR_MANAGED_AGENT: "1" })).toBeUndefined();
		expect(detectSuperconductorWorkspace({
			SUPERCONDUCTOR_MANAGED_AGENT: "1",
			SUPERCONDUCTOR_WORKTREE_PATH: projectRoot,
			SUPERCONDUCTOR_WORKSPACE_NAME: " main ",
			SUPERCONDUCTOR_TERMINAL_ID: "terminal-123",
		})).toEqual({
			scope: {
				type: "workspace",
				provider: "superconductor",
				name: "main",
				path: projectRoot,
			},
			targetId: "terminal:terminal-123",
		});
		expect(detectSuperconductorWorkspace({
			SUPERCONDUCTOR_MANAGED_AGENT: "1",
			SUPERCONDUCTOR_WORKSPACE_PATH: projectRoot,
		})?.scope.name).toBe(path.basename(projectRoot));
	});

	test("recognizes sessions without conversational history as clean", () => {
		expect(isCleanSession([])).toBe(true);
		expect(isCleanSession([{ type: "model_change" }, { type: "session_info" }])).toBe(true);
		for (const type of ["message", "custom_message", "compaction", "branch_summary"]) {
			expect(isCleanSession([{ type }])).toBe(false);
		}
	});

	test("creates one deterministic workspace run and joins it with workspace identity", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const scope: WorkspaceScope = {
			type: "workspace",
			provider: "superconductor",
			name: "main",
			path: projectRoot,
		};
		const first = await ensureWorkspaceRun(
			scope,
			historyRoot,
			new Date("2026-08-02T18:00:00.000Z"),
		);
		const second = await ensureWorkspaceRun(
			scope,
			historyRoot,
			new Date("2026-08-03T18:00:00.000Z"),
		);

		expect(second.root).toBe(first.root);
		expect(second.manifest.createdAt).toBe("2026-08-02T18:00:00.000Z");
		expect(first.manifest.id).toMatch(/^workspace-main-[a-f0-9]{12}$/);
		expect(first.manifest.status).toBe("ready");
		expect(first.manifest.phase).toBe("workspace");
		expect(first.manifest.scope).toEqual(scope);

		const joined = await joinRun(
			projectRoot,
			first.manifest.id,
			{ sessionId: "session-workspace", role: "workspace", targetId: "terminal:abc" },
			historyRoot,
		);
		expect(joined.membership.scope).toEqual(scope);
		expect(joined.membership.targetId).toBe("terminal:abc");
	});
});

describe("artifacts", () => {
	test("writes, appends, reads, and lists files in one run root", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Artifacts", historyRoot);
		await writeArtifact(root, "plan.md", "# Plan\n");
		await writeArtifact(root, "artifacts/scout/report.md", "Finding one", "write");
		await writeArtifact(root, "artifacts/scout/report.md", "Finding two", "append");

		const report = await readArtifact(root, "artifacts/scout/report.md");
		expect(report.content).toContain("Finding one\nFinding two");
		expect((await listArtifacts(root)).map((artifact) => artifact.path)).toEqual([
			"artifacts/scout/report.md",
			"plan.md",
		]);
	});

	test("rejects traversal and reserved state paths regardless of case", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Path safety", historyRoot);
		expect(() => resolveArtifactPath(root, "../outside.md")).toThrow("escapes the run root");
		expect(() => resolveArtifactPath(root, "plan.md/..")).toThrow("beneath the run root");
		for (const reservedPath of [
			"RUN.JSON",
			"Todos/TODO-001.md",
			".LOCKS/lock",
			".agent-reports/report.json",
		]) {
			expect(() => resolveArtifactPath(root, reservedPath)).toThrow("reserved");
		}
	});

	test("rejects artifact reads and writes through symbolic links", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Symlink safety", historyRoot);
		const outside = path.join(historyRoot, "outside");
		await mkdir(path.join(root, "artifacts"), { recursive: true });
		await mkdir(outside);
		await writeFile(path.join(outside, "secret.md"), "outside");
		await symlink(outside, path.join(root, "artifacts", "linked"));

		await expect(
			writeArtifact(root, "artifacts/linked/escaped.md", "escape"),
		).rejects.toThrow("symbolic link");
		await expect(readArtifact(root, "artifacts/linked/secret.md")).rejects.toThrow(
			"symbolic link",
		);
	});
});

describe("interactive agent reports", () => {
	test("writes, replaces, reads, and clears durable parent reports", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Interactive reports", historyRoot);
		const first = await writeParentReport(root, "run-planner", "needs_input", "Choose A or B");
		expect(await readParentReport(root, "run-planner")).toEqual(first);
		const done = await writeParentReport(root, "run-planner", "done", "Design approved");
		expect(done.id).not.toBe(first.id);
		expect((await readParentReport(root, "run-planner"))?.summary).toBe("Design approved");
		expect((await listArtifacts(root)).some((artifact) => artifact.path.includes("agent-reports")))
			.toBe(false);
		await clearParentReport(root, "run-planner");
		expect(await readParentReport(root, "run-planner")).toBeUndefined();
	});
});

describe("todos", () => {
	test("enforces dependencies and cross-session claims", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Todo lifecycle", historyRoot);
		const first = await createTodo(root, { title: "Build foundation", body: "Implement it." });
		const second = await createTodo(root, {
			title: "Migrate workflow",
			dependsOn: [first.id],
		});
		const membership: RunMembership = {
			runId: "run",
			projectPath: projectRoot,
			root,
			role: "worker",
			label: "worker-001",
			joinedAt: new Date().toISOString(),
		};

		await expect(claimTodo(root, second.id, membership, "session-a")).rejects.toThrow(
			"incomplete dependencies",
		);
		await claimTodo(root, first.id, membership, "session-a");
		await expect(claimTodo(root, first.id, membership, "session-b")).rejects.toThrow("assigned to");
		await expect(
			completeTodo(root, first.id, "session-a", {
				verification: "bun test: pass",
				artifactRefs: ["../outside.md"],
			}),
		).rejects.toThrow("escapes the run root");
		await writeArtifact(root, "artifacts/worker-001/result.md", "done");
		await completeTodo(root, first.id, "session-a", {
			verification: "bun test: pass",
			artifactRefs: ["artifacts/worker-001/result.md"],
		});

		const allTodos = await listTodos(root);
		expect(isTodoReady(await getTodo(root, second.id), allTodos)).toBe(true);
		expect((await getTodo(root, first.id)).verification).toBe("bun test: pass");
	});

	test("requires claimed completion with dependencies and evidence", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Completion invariants", historyRoot);
		const dependency = await createTodo(root, { title: "Dependency" });
		const dependent = await createTodo(root, {
			title: "Dependent",
			dependsOn: [dependency.id],
		});
		const membership: RunMembership = {
			runId: "run",
			projectPath: projectRoot,
			root,
			role: "worker",
			label: "worker-a",
			joinedAt: new Date().toISOString(),
		};
		await writeArtifact(root, "artifacts/worker-a/result.md", "done");

		await expect(updateTodo(root, dependency.id, { status: "done" })).rejects.toThrow(
			"complete action",
		);
		await expect(
			completeTodo(root, dependency.id, "session-a", {
				verification: "tests passed",
				artifactRefs: ["artifacts/worker-a/result.md"],
			}),
		).rejects.toThrow("must be claimed");
		await claimTodo(root, dependency.id, membership, "session-a");
		await expect(
			completeTodo(root, dependency.id, "session-a", {
				artifactRefs: ["artifacts/worker-a/result.md"],
			}),
		).rejects.toThrow("Verification evidence");
		await expect(
			completeTodo(root, dependency.id, "session-a", {
				verification: "tests passed",
				artifactRefs: ["artifacts/worker-a/missing.md"],
			}),
		).rejects.toThrow("does not exist");
		await completeTodo(root, dependency.id, "session-a", {
			verification: "tests passed",
			artifactRefs: ["artifacts/worker-a/result.md"],
		});
		await claimTodo(root, dependent.id, membership, "session-a");
		await updateTodo(root, dependency.id, { status: "open" });
		await expect(
			completeTodo(root, dependent.id, "session-a", {
				verification: "tests passed",
				artifactRefs: ["artifacts/worker-a/result.md"],
			}),
		).rejects.toThrow("incomplete dependencies");
	});

	test("allows only an audited coordinator force release", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Claim recovery", historyRoot);
		const todo = await createTodo(root, { title: "Recover me" });
		const worker: RunMembership = {
			runId: "run",
			projectPath: projectRoot,
			root,
			role: "worker",
			label: "worker-a",
			joinedAt: new Date().toISOString(),
		};
		const coordinator: RunMembership = {
			...worker,
			role: "coordinator",
			label: "coordinator",
		};
		await claimTodo(root, todo.id, worker, "session-a");

		await expect(releaseTodo(root, todo.id, "session-b")).rejects.toThrow("another session");
		await expect(
			forceReleaseTodo(root, todo.id, worker, "session-b", "steal claim"),
		).rejects.toThrow("Only a coordinator");
		const released = await forceReleaseTodo(
			root,
			todo.id,
			coordinator,
			"coordinator-session",
			"worker session disappeared",
		);
		expect(released.status).toBe("open");
		expect(released.assignedTo).toBeUndefined();
		expect(released.claimRecoveries?.[0].releasedAssignment.sessionId).toBe("session-a");
		expect(released.claimRecoveries?.[0].releasedBy.sessionId).toBe("coordinator-session");
		expect(released.claimRecoveries?.[0].reason).toBe("worker session disappeared");
		await expect(claimTodo(root, todo.id, worker, "session-a")).rejects.toThrow(
			"cannot reclaim",
		);
		await claimTodo(root, todo.id, { ...worker, label: "worker-b" }, "session-b");
		expect((await getTodo(root, todo.id)).assignedTo?.sessionId).toBe("session-b");
	});

	test("fences a recovered worker before a replacement mutates the checkout", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Mutation fencing", historyRoot);
		const todo = await createTodo(root, { title: "Single writer" });
		const worker: RunMembership = {
			runId: "run",
			projectPath: projectRoot,
			root,
			role: "worker",
			label: "worker-a",
			joinedAt: new Date().toISOString(),
		};
		const coordinator: RunMembership = {
			...worker,
			role: "coordinator",
			label: "coordinator",
		};
		await claimTodo(root, todo.id, worker, "session-a");

		let finishMutation!: () => void;
		const mutationCanFinish = new Promise<void>((resolve) => {
			finishMutation = resolve;
		});
		let mutationStarted!: () => void;
		const mutationDidStart = new Promise<void>((resolve) => {
			mutationStarted = resolve;
		});
		const mutation = withActiveTodoClaim(root, todo.id, "session-a", async () => {
			mutationStarted();
			await mutationCanFinish;
			return "written";
		});
		await mutationDidStart;

		let recoveryFinished = false;
		const recovery = forceReleaseTodo(
			root,
			todo.id,
			coordinator,
			"coordinator-session",
			"replace interrupted worker",
		).then((result) => {
			recoveryFinished = true;
			return result;
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(recoveryFinished).toBe(false);

		finishMutation();
		expect(await mutation).toBe("written");
		await recovery;
		await expect(
			withActiveTodoClaim(root, todo.id, "session-a", async () => "stale write"),
		).rejects.toThrow("source mutation is fenced");

		await claimTodo(root, todo.id, { ...worker, label: "worker-b" }, "session-b");
		expect(
			await withActiveTodoClaim(root, todo.id, "session-b", async () => "replacement write"),
		).toBe("replacement write");
	});

	test("reserves one worker launch per todo and requires unique recovery labels", async () => {
		const historyRoot = await temporaryHistoryRoot();
		const { root } = await createRun(projectRoot, "Launch reservation", historyRoot);
		const todo = await createTodo(root, { title: "Launch once" });
		const coordinator: RunMembership = {
			runId: "run",
			projectPath: projectRoot,
			root,
			role: "coordinator",
			label: "coordinator",
			joinedAt: new Date().toISOString(),
		};
		const worker: RunMembership = {
			...coordinator,
			role: "worker",
			label: "run-worker-TODO-001",
		};

		await reserveTodoLaunch(root, todo.id, coordinator, "coordinator-session", worker.label!);
		await expect(
			reserveTodoLaunch(root, todo.id, coordinator, "coordinator-session", "duplicate-worker"),
		).rejects.toThrow("pending launch");
		await expect(
			claimTodo(root, todo.id, { ...worker, label: "wrong-worker" }, "wrong-session"),
		).rejects.toThrow("reserved for");
		await claimTodo(root, todo.id, worker, "session-a");
		await forceReleaseTodo(
			root,
			todo.id,
			coordinator,
			"coordinator-session",
			"worker disappeared",
		);
		await expect(
			reserveTodoLaunch(root, todo.id, coordinator, "coordinator-session", worker.label!),
		).rejects.toThrow("unique retry label");

		const retryLabel = "run-worker-TODO-001-retry-2";
		await reserveTodoLaunch(root, todo.id, coordinator, "coordinator-session", retryLabel);
		await claimTodo(root, todo.id, { ...worker, label: retryLabel }, "session-b");
		expect((await getTodo(root, todo.id)).assignedTo?.label).toBe(retryLabel);
	});
});

describe("SC command adapter", () => {
	test("infers worker todo ids from deterministic labels", () => {
		expect(inferTodoIdFromAgentLabel("run-worker-TODO-001")).toBe("TODO-001");
		expect(inferTodoIdFromAgentLabel("run-worker-TODO-001-retry-2")).toBe("TODO-001");
		expect(inferTodoIdFromAgentLabel("run-scout-api")).toBeUndefined();
	});

	test("builds a safe terminal launch argv with a multiline prompt", () => {
		const prompt = "First line\nSecond line with 'quotes' and $variables";
		const args = buildLaunchAgentArgs(
			{
				label: "run-worker-TODO-001",
				prompt,
				model: "openai-codex/gpt-5.6-sol",
				reasoning: "high",
			},
			projectRoot,
		);

		expect(args).toEqual([
			"layout",
			"run",
			"tabs",
			"--provider",
			"pi",
			"--ui",
			"terminal",
			"--label",
			"run-worker-TODO-001",
			"--prompt",
			prompt,
			"--model",
			"openai-codex/gpt-5.6-sol",
			"--reasoning",
			"high",
			"--worktree",
			projectRoot,
			"--active",
			"keep",
			"--output",
			"json",
		]);
		expect(args.filter((argument) => argument === prompt)).toHaveLength(1);
	});

	test("retries idle timeouts internally, then reads with one abort signal", async () => {
		const calls: Array<{ command: string; args: string[]; signal?: AbortSignal }> = [];
		const progress: number[] = [];
		const controller = new AbortController();
		const exec: ScExecutor = async (command, args, options) => {
			calls.push({ command, args, signal: options?.signal });
			if (calls.length === 1) {
				return {
					stdout: JSON.stringify({ error: "agent wait timed out before all targets became idle" }),
					stderr: "",
					code: 4,
					killed: false,
				};
			}
			return {
				stdout: JSON.stringify({ kind: args[1], response: { ok: true } }),
				stderr: "",
				code: 0,
				killed: false,
			};
		};
		const input = { target: "id:terminal:abc", timeoutMs: 120_000, last: 20 };

		const result = await waitForAgent(
			exec,
			input,
			projectRoot,
			controller.signal,
			(update) => progress.push(update.attempts),
		);

		expect(result.wait).toEqual({ kind: "wait", response: { ok: true } });
		expect(result.read).toEqual({ kind: "read", response: { ok: true } });
		expect(result.attempts).toBe(2);
		expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
		expect(progress).toEqual([1, 2]);
		expect(calls).toHaveLength(3);
		expect(calls[0]).toEqual({
			command: "sc",
			args: buildWaitForAgentArgs(input, projectRoot),
			signal: controller.signal,
		});
		expect(calls[1]).toEqual(calls[0]);
		expect(calls[2]).toEqual({
			command: "sc",
			args: buildReadAgentArgs(input, projectRoot),
			signal: controller.signal,
		});
	});

	test("does not accept the transient idle state before a launched agent starts", async () => {
		const calls: string[][] = [];
		const exec: ScExecutor = async (_command, args) => {
			calls.push(args);
			if (args[0] === "agents") {
				const state = calls.filter((call) => call[0] === "agents").length === 1
					? "idle"
					: "working";
				return {
					stdout: JSON.stringify({ response: { agent: { state, phase: state === "working" ? "running" : "idle" } } }),
					stderr: "",
					code: 0,
					killed: false,
				};
			}
			return {
				stdout: JSON.stringify({ kind: args[1], response: { ok: true } }),
				stderr: "",
				code: 0,
				killed: false,
			};
		};
		const input = {
			target: "label:worker",
			requireActivity: true,
			startupPollMs: 1,
		};
		const result = await waitForAgent(exec, input, projectRoot);
		expect(result.attempts).toBe(1);
		expect(calls.map((call) => call.slice(0, 2))).toEqual([
			["agents", "get"],
			["agents", "get"],
			["agent", "wait"],
			["agent", "read"],
		]);
		expect(calls[0]).toEqual(buildGetAgentArgs(input, projectRoot));
	});

	test("does not read after a failed wait", async () => {
		const calls: string[][] = [];
		const exec: ScExecutor = async (_command, args) => {
			calls.push(args);
			return {
				stdout: JSON.stringify({ response: { targets: [{ target_error: { message: "provider failed" } }] } }),
				stderr: "",
				code: 3,
				killed: false,
			};
		};

		await expect(
			waitForAgent(exec, { target: "label:worker" }, projectRoot),
		).rejects.toThrow("delegated agent failed or became unavailable: provider failed");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.slice(0, 2)).toEqual(["agent", "wait"]);
	});

	test("rejects malformed JSON, nonzero exits, termination, and nested target errors", async () => {
		const result = (overrides: Partial<Awaited<ReturnType<ScExecutor>>>) => ({
			stdout: "{}",
			stderr: "",
			code: 0,
			killed: false,
			...overrides,
		});
		await expect(
			executeScJson(async () => result({ stdout: "not-json" }), ["agent", "read"]),
		).rejects.toThrow("malformed JSON");
		await expect(
			executeScJson(
				async () => result({ stdout: "", stderr: "timed out", code: 3 }),
				["agent", "wait"],
			),
		).rejects.toThrow("failed (exit 3): timed out");
		await expect(
			executeScJson(async () => result({ killed: true }), ["layout", "run", "tabs"]),
		).rejects.toThrow("was terminated");
		await expect(
			executeScJson(
				async () => result({ stdout: JSON.stringify({ response: { target_error: "stalled" } }) }),
				["agent", "read"],
			),
		).rejects.toThrow("target error: stalled");
	});

	test("extracts launch identifiers and Pi session files from SC responses", () => {
		expect(
			extractLaunchIdentifiers({
				response: {
					sessions: [{
						label: "worker",
						current_selector: "view:1/tab:2/pane:1",
						stable_target_id: "terminal:abc",
						session_id: "session-123",
						conversation_id: "conversation-456",
					}],
				},
			}),
		).toEqual({
			label: "worker",
			selector: "view:1/tab:2/pane:1",
			stableTargetId: "terminal:abc",
			sessionId: "session-123",
			conversationId: "conversation-456",
		});
		expect(extractLaunchIdentifiers({ response: { sessions: [{}] } })).toEqual({});
		expect(extractAgentSessionFile({
			response: {
				targets: [{
					session_id: "019fc310-b01f-7ccb-b819-8c8802fc829f",
					conversation_id: "conv:pi:/tmp/worker-session.jsonl",
				}],
			},
		})).toBe("/tmp/worker-session.jsonl");
		expect(extractAgentSessionFile({ session_id: "/tmp/direct-session.jsonl" }))
			.toBe("/tmp/direct-session.jsonl");
		expect(extractAgentSessionFile({ session_id: "019fc310-b01f" })).toBeUndefined();
	});

	test("classifies command failures and escalates monitoring outages semantically", async () => {
		const timeout = executeScJson(
			async () => ({
				stdout: JSON.stringify({ error: "agent wait timed out before all targets became idle" }),
				stderr: "",
				code: 4,
				killed: false,
			}),
			["agent", "wait"],
		);
		await expect(timeout).rejects.toMatchObject({ kind: "timeout" });

		const unavailableExec: ScExecutor = async () => ({
			stdout: JSON.stringify({ error: "websocket connection unavailable" }),
			stderr: "",
			code: 5,
			killed: false,
		});
		try {
			await waitForAgent(unavailableExec, { target: "label:worker" }, projectRoot);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(AgentWaitError);
			expect(error).toMatchObject({
				kind: "monitoring_unavailable",
				agentMayStillBeRunning: true,
			});
			expect((error as Error).message).toContain("websocket connection unavailable");
			expect((error as Error).message).toContain("Ask the user whether to retry monitoring");
		}

		try {
			await executeScJson(async () => {
				throw new Error("API unavailable");
			}, ["agent", "wait"]);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ScCommandError);
			expect(error).toMatchObject({ kind: "control_plane", detail: "API unavailable" });
		}
	});
});

describe("session progress metrics", () => {
	test("incrementally counts assistant turns and all persisted usage costs", async () => {
		const root = await temporaryHistoryRoot();
		const sessionFile = path.join(root, "worker.jsonl");
		const usage = (total: number) => ({ cost: { total } });
		await writeFile(sessionFile, [
			JSON.stringify({ type: "session", version: 3 }),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", usage: usage(0.12) },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "toolResult", usage: usage(0.03) },
			}),
			JSON.stringify({ type: "compaction", usage: usage(0.05) }),
			"",
		].join("\n"));
		const reader = new SessionMetricsReader(sessionFile);
		await reader.refresh();
		expect(reader.metrics.turns).toBe(1);
		expect(reader.metrics.cost).toBeCloseTo(0.2);

		const nextTurn = JSON.stringify({
			type: "message",
			message: { role: "assistant", usage: usage(0.4) },
		});
		await appendFile(sessionFile, nextTurn.slice(0, 20));
		await reader.refresh();
		expect(reader.metrics.turns).toBe(1);
		await appendFile(sessionFile, `${nextTurn.slice(20)}\n`);
		await reader.refresh();
		expect(reader.metrics.turns).toBe(2);
		expect(reader.metrics.cost).toBeCloseTo(0.6);
	});
});

describe("SC model-facing results", () => {
	test("bounds a byte-heavy launch response while preserving identifiers and raw details", () => {
		const response = {
			response: {
				sessions: [{ stable_target_id: "terminal:abc" }],
				payload: "界".repeat(DEFAULT_MAX_BYTES),
			},
		};
		const launched = {
			identifiers: {
				label: "worker-TODO-003",
				stableTargetId: "terminal:abc",
			},
			response,
		};

		const result = launchAgentToolResult(launched, ScResultLimits);
		const text = result.content[0].text;

		expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
		expect(text.split("\n").length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
		expect(text).toContain('"stableTargetId": "terminal:abc"');
		expect(text).toContain("Output truncated");
		expect(text).toContain("Full structured launch data remains in tool details.");
		expect(result.details.response).toBe(response);
		expect(result.details.response.response.payload).toHaveLength(DEFAULT_MAX_BYTES);
	});

	test("bounds a line-heavy wait/read response with retrieval guidance and raw details", () => {
		const wait = { response: { idle: true } };
		const read = {
			response: {
				entries: Array.from({ length: DEFAULT_MAX_LINES + 100 }, (_, index) => `entry-${index}`),
			},
		};

		const result = waitForAgentToolResult(
			"label:worker-TODO-003",
			{ wait, read, attempts: 1, elapsedMs: 42_000 },
			ScResultLimits,
		);
		const text = result.content[0].text;

		expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
		expect(text.split("\n").length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
		expect(text).toContain("Output truncated");
		expect(text).toContain("Call wait_for_agent again with a smaller last value");
		expect(result.details.wait).toBe(wait);
		expect(result.details.read).toBe(read);
		expect(result.details.read.response.entries).toHaveLength(DEFAULT_MAX_LINES + 100);
	});
});

describe("tool rendering", () => {
	test("summarizes the current workspace when collapsed and shows its full result when expanded", () => {
		const membership = { runId: "20260802-inspect-binary", role: "coordinator" };
		const manifest = {
			title: "Inspect binary file format",
			status: "executing",
			phase: "workers",
		};
		const result = {
			content: [{ type: "text", text: JSON.stringify({ membership, manifest }, null, 2) }],
			details: { action: "current", membership, manifest },
		};

		expect(runWorkspaceResultText(result, false)).toBe(
			"20260802-inspect-binary: Inspect binary file format (executing/workers)",
		);
		expect(runWorkspaceResultText(result, true)).toContain('"role": "coordinator"');
	});

	test("summarizes todo records when collapsed and shows their full result when expanded", () => {
		const todo = {
			id: "TODO-001",
			title: "Inspect binary file format",
			status: "open",
			body: "Check the parser.",
		};
		const result = {
			content: [{ type: "text", text: JSON.stringify(todo, null, 2) }],
			details: { action: "get", todo },
		};

		expect(todoResultText(result, false)).toBe(
			"TODO-001: Inspect binary file format (open)",
		);
		expect(todoResultText(result, true)).toContain('"body": "Check the parser."');
	});

	test("shows complete multiline Workbench output when expanded", () => {
		const result = {
			content: [{ type: "text", text: "first line\nsecond line" }],
			details: {},
		};

		expect(toolResultText(result, false)).toBe("first line");
		expect(toolResultText(result, true)).toBe("first line\nsecond line");
	});

	test("formats compact coordinator and worker Workbench status", () => {
		const runId = "20260802-145955-native-sc-tools-for-workbench";
		const coordinator: RunMembership = {
			runId,
			projectPath: projectRoot,
			root: "/tmp/run",
			role: "coordinator",
			label: `${runId}-coordinator`,
			joinedAt: "2026-08-02T15:00:00.000Z",
		};
		expect(workbenchStatusText(coordinator)).toBe(
			"WB native-sc-tools-for-wor… · coordinator",
		);
		const worker = {
			...coordinator,
			role: "worker",
			label: `${runId}-worker-TODO-002`,
			todoId: "TODO-002",
		};
		expect(workbenchStatusText(worker)).toBe(
			"WB native-sc-tools-for-wor… · worker · TODO-002",
		);
		expect(workbenchStatusText({ ...worker, label: `${worker.label}-docs` })).toBe(
			"WB native-sc-tools-for-wor… · worker · TODO-002 · docs",
		);
	});

	test("uses the Superconductor workspace name for automatic membership status", () => {
		const membership: RunMembership = {
			runId: "workspace-main-0123456789ab",
			projectPath: projectRoot,
			root: "/tmp/run",
			role: "workspace",
			joinedAt: "2026-08-02T18:00:00.000Z",
			scope: {
				type: "workspace",
				provider: "superconductor",
				name: "main",
				path: projectRoot,
			},
		};
		expect(workbenchStatusText(membership)).toBe("WB main · workspace");
	});

	test("bounds status identity and preserves a nonredundant label suffix", () => {
		const runId = `20260802-145955-${"x".repeat(40)}`;
		const membership: RunMembership = {
			runId,
			projectPath: projectRoot,
			root: "/tmp/run",
			role: "scout",
			label: `${runId}-scout-${"y".repeat(40)}`,
			joinedAt: "2026-08-02T15:00:00.000Z",
		};
		expect(workbenchStatusText(membership)).toBe(
			`WB ${"x".repeat(23)}… · scout · ${"y".repeat(23)}…`,
		);
		expect(workbenchStatusText()).toBeUndefined();
	});

	test("bounds task previews and handles partial agent values", () => {
		const prompt = `\n${"x".repeat(120)}\nsecond task line`;
		expect(taskPreview(prompt)).toBe(`${"x".repeat(100)}…`);
		expect(taskLineCount(prompt)).toBe(3);
		expect(taskPreview(undefined)).toBe("");
		expect(taskLineCount(undefined)).toBe(0);
		expect(agentName(undefined)).toBe("(unlabeled)");
	});

	test("renders a bounded live agent panel with compact Workbench identities", () => {
		const theme = { fg: (_color: string, text: string) => text };
		const items = [
			{
				target: "label:20260803-193815-cloudflare-migration-worker-TODO-001",
				startedAt: 958_000,
				status: "running" as const,
				metrics: { turns: 12, cost: 0.84 },
			},
			{
				target: "label:20260803-193815-cloudflare-migration-reviewer",
				startedAt: 995_000,
				status: "launched" as const,
			},
		];
		expect(agentPanelName(items[0]!.target)).toBe("Worker · TODO-001");
		const lines = renderAgentPanelLines(items, 64, theme, 1_000_000);
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("Agents");
		expect(lines[0]).toContain("2 running");
		expect(lines[1]).toContain("00:42  Worker · TODO-001");
		expect(lines[1]).toContain("12 turns · $0.84");
		expect(lines[2]).toContain("starting…");
		expect(lines.every((line) => panelTextWidth(line) === 64)).toBe(true);

		const waiting = renderAgentPanelLines(
			[{ ...items[0]!, status: "waiting" }],
			48,
			theme,
			1_000_000,
		);
		expect(waiting[1]).toContain("waiting · 12 turns · $0.84");

		const failed = renderAgentPanelLines(
			[{ ...items[0]!, status: "monitoring_failed" }],
			32,
			theme,
			1_000_000,
		);
		expect(failed[0]).toContain("1 failed");
		expect(failed[1]).toContain("monitoring failed");
		for (const width of [0, 1, 2, 8]) {
			for (const line of renderAgentPanelLines(items, width, theme, 1_000_000)) {
				expect(panelTextWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("summarizes launch, pending wait, completion, and errors", () => {
		const launched = {
			content: [{ type: "text", text: "full launch response" }],
			details: { status: "launched", identifiers: { stableTargetId: "terminal:abc" } },
		};
		const waiting = {
			content: [{ type: "text", text: "waiting" }],
			details: { status: "waiting", target: "label:worker", elapsedMs: 42_000, attempts: 2 },
		};
		const completed = {
			content: [{ type: "text", text: "full wait/read response" }],
			details: { status: "completed", target: "label:worker", elapsedMs: 188_000 },
		};
		expect(launchAgentResultText(launched, false)).toBe("terminal:abc — launched");
		expect(launchAgentResultText(launched, true)).toBe("full launch response");
		expect(waitForAgentResultText(waiting, false)).toBe("waiting · 0:42 elapsed");
		expect(waitForAgentResultText(completed, false)).toBe("completed · 3:08 elapsed");
		expect(waitForAgentResultText(completed, false, true)).toBe("full wait/read response");
	});
});

describe("file locks", () => {
	test("takes over stale locks and does not clean up a replacement owner", async () => {
		const root = await temporaryHistoryRoot();
		const lockPath = path.join(root, ".locks", "ownership.lock");
		await mkdir(lockPath, { recursive: true });
		await writeFile(
			path.join(lockPath, "stale"),
			`${JSON.stringify({ token: "stale", pid: 2_147_483_647, createdAt: "2020-01-01T00:00:00.000Z" })}\n`,
		);

		await withFileLock(lockPath, async () => {
			await rm(lockPath, { recursive: true });
			await mkdir(lockPath);
			await writeFile(
				path.join(lockPath, "replacement"),
				`${JSON.stringify({ token: "replacement", pid: 2, createdAt: new Date().toISOString() })}\n`,
			);
		});

		expect(await readdir(lockPath)).toEqual(["replacement"]);
		const remaining = JSON.parse(
			await readFile(path.join(lockPath, "replacement"), "utf8"),
		) as { token: string };
		expect(remaining.token).toBe("replacement");
	});
});
