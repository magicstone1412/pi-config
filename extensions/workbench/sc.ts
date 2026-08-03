export interface ScExecOptions {
	signal?: AbortSignal;
}

export interface ScExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export type ScExecutor = (
	command: string,
	args: string[],
	options?: ScExecOptions,
) => Promise<ScExecResult>;

export interface LaunchAgentInput {
	label: string;
	prompt: string;
	todoId?: string;
	model?: string;
	reasoning?: string;
}

export interface WaitForAgentInput {
	target: string;
	timeoutMs?: number;
	last?: number;
}

export interface ScLaunchIdentifiers {
	label?: string;
	selector?: string;
	stableTargetId?: string;
	sessionId?: string;
	conversationId?: string;
}

export interface LaunchAgentResponse {
	identifiers: ScLaunchIdentifiers;
	response: unknown;
}

export interface WaitForAgentResponse {
	wait: unknown;
	read: unknown;
	attempts: number;
	elapsedMs: number;
}

export type ScCommandFailureKind =
	| "timeout"
	| "target"
	| "control_plane"
	| "malformed_response"
	| "cancelled";

export class ScCommandError extends Error {
	constructor(
		readonly kind: ScCommandFailureKind,
		message: string,
		readonly detail: string,
		readonly exitCode?: number,
	) {
		super(message);
		this.name = "ScCommandError";
	}
}

export type AgentWaitFailureKind = "agent_failed" | "monitoring_unavailable" | "cancelled";

export class AgentWaitError extends Error {
	constructor(
		readonly kind: AgentWaitFailureKind,
		message: string,
		readonly agentMayStillBeRunning: boolean,
	) {
		super(message);
		this.name = "AgentWaitError";
	}
}

export interface WaitForAgentProgress {
	attempts: number;
	elapsedMs: number;
	pollIntervalMs: number;
}

export function inferTodoIdFromAgentLabel(label: string): string | undefined {
	return label.match(/(?:^|[^A-Za-z0-9])(TODO-\d{3,})(?:$|[^A-Za-z0-9])/i)?.[1]?.toUpperCase();
}

export function buildLaunchAgentArgs(input: LaunchAgentInput, worktree: string): string[] {
	const args = [
		"layout",
		"run",
		"tabs",
		"--provider",
		"pi",
		"--ui",
		"terminal",
		"--label",
		input.label,
		"--prompt",
		input.prompt,
	];
	if (input.model) args.push("--model", input.model);
	if (input.reasoning) args.push("--reasoning", input.reasoning);
	args.push("--worktree", worktree, "--active", "keep", "--output", "json");
	return args;
}

export function buildWaitForAgentArgs(input: WaitForAgentInput, worktree: string): string[] {
	const args = ["agent", "wait", "--to", input.target, "--idle"];
	if (input.timeoutMs !== undefined) args.push("--timeout-ms", String(input.timeoutMs));
	args.push("--worktree", worktree, "--output", "json");
	return args;
}

export function buildReadAgentArgs(input: WaitForAgentInput, worktree: string): string[] {
	const args = ["agent", "read", "--to", input.target];
	if (input.last !== undefined) args.push("--last", String(input.last));
	args.push("--worktree", worktree, "--output", "json");
	return args;
}

function commandName(args: string[]): string {
	return ["sc", ...args.slice(0, 3)].join(" ");
}

function findNamedValue(value: unknown, key: string): unknown {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findNamedValue(item, key);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	if (key in record && record[key] !== null && record[key] !== undefined) return record[key];
	for (const nested of Object.values(record)) {
		const found = findNamedValue(nested, key);
		if (found !== undefined) return found;
	}
	return undefined;
}

function findString(value: unknown, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const found = findNamedValue(value, key);
		if (typeof found === "string" && found.length > 0) return found;
	}
	return undefined;
}

function errorDescription(error: unknown): string {
	if (typeof error === "string") return error;
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		if (typeof record.message === "string") return record.message;
		if (record.error !== undefined) return errorDescription(record.error);
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function processFailure(result: ScExecResult): string {
	return result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
}

export async function executeScJson(
	exec: ScExecutor,
	args: string[],
	signal?: AbortSignal,
): Promise<unknown> {
	const name = commandName(args);
	let result: ScExecResult;
	try {
		result = await exec("sc", args, { signal });
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const cancelled = Boolean(signal?.aborted);
		throw new ScCommandError(
			cancelled ? "cancelled" : "control_plane",
			cancelled ? `${name} was cancelled` : `${name} could not connect: ${detail}`,
			detail,
		);
	}
	if (result.killed) {
		const cancelled = Boolean(signal?.aborted);
		throw new ScCommandError(
			cancelled ? "cancelled" : "control_plane",
			cancelled ? `${name} was cancelled` : `${name} was terminated`,
			cancelled ? "cancelled" : "terminated",
			result.code,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		const detail = processFailure(result);
		if (result.code !== 0) {
			throw new ScCommandError(
				"control_plane",
				`${name} failed (exit ${result.code}): ${detail}`,
				detail,
				result.code,
			);
		}
		throw new ScCommandError(
			"malformed_response",
			`${name} returned malformed JSON`,
			"malformed JSON",
		);
	}

	const targetError = findNamedValue(parsed, "target_error");
	if (targetError !== undefined) {
		const detail = errorDescription(targetError);
		throw new ScCommandError(
			"target",
			`${name} target error: ${detail}`,
			detail,
			result.code,
		);
	}
	if (result.code !== 0) {
		const nestedError = findNamedValue(parsed, "error");
		const detail = nestedError === undefined ? processFailure(result) : errorDescription(nestedError);
		const idleTimeout = args[0] === "agent" && args[1] === "wait" &&
			/timed out before all targets became idle/i.test(detail);
		throw new ScCommandError(
			idleTimeout ? "timeout" : "control_plane",
			`${name} failed (exit ${result.code}): ${detail}`,
			detail,
			result.code,
		);
	}
	return parsed;
}

export function extractAgentSessionFile(response: unknown): string | undefined {
	const conversationId = findString(response, "conversation_id");
	if (conversationId?.startsWith("conv:pi:")) {
		const sessionFile = conversationId.slice("conv:pi:".length);
		if (sessionFile.startsWith("/") && sessionFile.endsWith(".jsonl")) return sessionFile;
	}
	const sessionId = findString(response, "session_id");
	return sessionId?.startsWith("/") && sessionId.endsWith(".jsonl") ? sessionId : undefined;
}

export function extractLaunchIdentifiers(response: unknown): ScLaunchIdentifiers {
	const identifiers: ScLaunchIdentifiers = {};
	const label = findString(response, "label");
	const selector = findString(response, "selector", "current_selector");
	const stableTargetId = findString(response, "stable_target_id");
	const sessionId = findString(response, "session_id");
	const conversationId = findString(response, "conversation_id");
	if (label) identifiers.label = label;
	if (selector) identifiers.selector = selector;
	if (stableTargetId) identifiers.stableTargetId = stableTargetId;
	if (sessionId) identifiers.sessionId = sessionId;
	if (conversationId) identifiers.conversationId = conversationId;
	return identifiers;
}

export async function launchAgent(
	exec: ScExecutor,
	input: LaunchAgentInput,
	worktree: string,
	signal?: AbortSignal,
): Promise<LaunchAgentResponse> {
	const response = await executeScJson(exec, buildLaunchAgentArgs(input, worktree), signal);
	return { identifiers: extractLaunchIdentifiers(response), response };
}

export async function resolveAgentSessionFile(
	exec: ScExecutor,
	input: WaitForAgentInput,
	worktree: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const response = await executeScJson(
		exec,
		buildReadAgentArgs({ ...input, last: 1 }, worktree),
		signal,
	);
	return extractAgentSessionFile(response);
}

function agentWaitFailure(error: unknown, phase: "wait" | "read"): AgentWaitError {
	if (!(error instanceof ScCommandError)) {
		const detail = error instanceof Error ? error.message : String(error);
		return new AgentWaitError(
			"monitoring_unavailable",
			`Agent monitoring failed unexpectedly: ${detail}. The delegated agent may still be running. Ask the user whether to retry monitoring, inspect the agent tab, or stop it; do not relaunch automatically.`,
			true,
		);
	}
	if (error.kind === "cancelled") {
		return new AgentWaitError("cancelled", "Waiting for the delegated agent was cancelled.", true);
	}
	if (error.kind === "target") {
		return new AgentWaitError(
			"agent_failed",
			`The delegated agent failed or became unavailable: ${error.detail}. Ask the user whether to inspect the agent, retry the task, or stop it; do not relaunch automatically.`,
			false,
		);
	}
	const context = phase === "read"
		? "The agent became idle, but its transcript could not be retrieved"
		: "The connection used to monitor the delegated agent failed";
	return new AgentWaitError(
		"monitoring_unavailable",
		`${context}: ${error.detail}. The delegated agent may still be running. Ask the user whether to retry monitoring, inspect the agent tab, or stop it; do not relaunch automatically.`,
		true,
	);
}

export async function waitForAgent(
	exec: ScExecutor,
	input: WaitForAgentInput,
	worktree: string,
	signal?: AbortSignal,
	onProgress?: (progress: WaitForAgentProgress) => void,
): Promise<WaitForAgentResponse> {
	const startedAt = Date.now();
	const pollIntervalMs = input.timeoutMs ?? 120_000;
	const waitInput = { ...input, timeoutMs: pollIntervalMs };
	let attempts = 0;
	let wait: unknown;

	while (true) {
		attempts += 1;
		onProgress?.({ attempts, elapsedMs: Date.now() - startedAt, pollIntervalMs });
		try {
			wait = await executeScJson(exec, buildWaitForAgentArgs(waitInput, worktree), signal);
			break;
		} catch (error) {
			if (error instanceof ScCommandError && error.kind === "timeout") continue;
			throw agentWaitFailure(error, "wait");
		}
	}

	try {
		const read = await executeScJson(exec, buildReadAgentArgs(input, worktree), signal);
		return { wait, read, attempts, elapsedMs: Date.now() - startedAt };
	} catch (error) {
		throw agentWaitFailure(error, "read");
	}
}
