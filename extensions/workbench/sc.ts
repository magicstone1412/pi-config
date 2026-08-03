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
	const result = await exec("sc", args, { signal });
	const name = commandName(args);
	if (result.killed) {
		throw new Error(signal?.aborted ? `${name} was cancelled` : `${name} was terminated`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		if (result.code !== 0) {
			throw new Error(`${name} failed (exit ${result.code}): ${processFailure(result)}`);
		}
		throw new Error(`${name} returned malformed JSON`);
	}

	const targetError = findNamedValue(parsed, "target_error");
	if (targetError !== undefined) {
		throw new Error(`${name} target error: ${errorDescription(targetError)}`);
	}
	if (result.code !== 0) {
		const nestedError = findNamedValue(parsed, "error");
		const detail = nestedError === undefined ? processFailure(result) : errorDescription(nestedError);
		throw new Error(`${name} failed (exit ${result.code}): ${detail}`);
	}
	return parsed;
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

export async function waitForAgent(
	exec: ScExecutor,
	input: WaitForAgentInput,
	worktree: string,
	signal?: AbortSignal,
): Promise<WaitForAgentResponse> {
	const wait = await executeScJson(exec, buildWaitForAgentArgs(input, worktree), signal);
	const read = await executeScJson(exec, buildReadAgentArgs(input, worktree), signal);
	return { wait, read };
}
