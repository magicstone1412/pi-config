import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { resolveArtifactPath } from "./artifacts.ts";
import { atomicWrite, pathExists, resolveInside, withFileLock } from "./storage.ts";
import type {
	RunMembership,
	TodoAssignment,
	TodoMetadata,
	TodoPriority,
	TodoRecord,
	TodoStatus,
} from "./types.ts";

const TODO_ID_PATTERN = /^TODO-\d{3,}$/;

function assertTodoId(todoId: string): void {
	if (!TODO_ID_PATTERN.test(todoId)) throw new Error(`Invalid todo id: ${todoId}`);
}

export function getTodoPath(runRoot: string, todoId: string): string {
	assertTodoId(todoId);
	return resolveInside(path.join(runRoot, "todos"), `${todoId}.md`);
}

function parseJsonObjectEnd(content: string): number {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < content.length; index += 1) {
		const character = content[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		else if (character === "{") depth += 1;
		else if (character === "}") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

export function parseTodo(content: string): TodoRecord {
	const metadataEnd = parseJsonObjectEnd(content);
	if (metadataEnd < 0) throw new Error("Todo file has invalid metadata");
	const metadata = JSON.parse(content.slice(0, metadataEnd + 1)) as TodoMetadata;
	if (metadata.schema !== 1 || !TODO_ID_PATTERN.test(metadata.id)) {
		throw new Error("Todo file has an unsupported schema or id");
	}
	return {
		...metadata,
		body: content.slice(metadataEnd + 1).replace(/^\s*\n/, "").replace(/\s+$/, ""),
	};
}

export function serializeTodo(todo: TodoRecord): string {
	const { body, ...metadata } = todo;
	const header = JSON.stringify(metadata, null, 2);
	return body.trim() ? `${header}\n\n${body.trim()}\n` : `${header}\n`;
}

export async function listTodos(runRoot: string): Promise<TodoRecord[]> {
	const todosDir = path.join(runRoot, "todos");
	const entries = await readdir(todosDir, { withFileTypes: true }).catch(() => []);
	const todos: TodoRecord[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		try {
			todos.push(parseTodo(await readFile(path.join(todosDir, entry.name), "utf8")));
		} catch {
			// Ignore incomplete files; individual get calls still report their error.
		}
	}
	return todos.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getTodo(runRoot: string, todoId: string): Promise<TodoRecord> {
	return parseTodo(await readFile(getTodoPath(runRoot, todoId), "utf8"));
}

function nextTodoId(todos: TodoRecord[]): string {
	const largest = todos.reduce((current, todo) => {
		const value = Number.parseInt(todo.id.slice("TODO-".length), 10);
		return Number.isFinite(value) ? Math.max(current, value) : current;
	}, 0);
	return `TODO-${String(largest + 1).padStart(3, "0")}`;
}

function normalizeTodoIds(todoIds: string[] | undefined): string[] {
	const unique = [...new Set(todoIds ?? [])];
	for (const todoId of unique) assertTodoId(todoId);
	return unique;
}

function normalizeArtifactRefs(runRoot: string, artifactRefs: string[] | undefined): string[] {
	return [
		...new Set(
			(artifactRefs ?? []).map((artifactRef) =>
				path.relative(runRoot, resolveArtifactPath(runRoot, artifactRef)).split(path.sep).join("/"),
			),
		),
	];
}

async function validateCompletionArtifactRefs(
	runRoot: string,
	artifactRefs: string[] | undefined,
): Promise<string[]> {
	const normalized = normalizeArtifactRefs(runRoot, artifactRefs);
	if (normalized.length === 0) {
		throw new Error("At least one artifact reference is required for completion");
	}
	for (const artifactRef of normalized) {
		const target = resolveArtifactPath(runRoot, artifactRef);
		const artifactStat = await stat(target).catch(() => undefined);
		if (!artifactStat?.isFile()) {
			throw new Error(`Completion artifact does not exist: ${artifactRef}`);
		}
	}
	return normalized;
}

export async function createTodo(
	runRoot: string,
	input: {
		title: string;
		body?: string;
		priority?: TodoPriority;
		tags?: string[];
		dependsOn?: string[];
	},
): Promise<TodoRecord> {
	if (!input.title.trim()) throw new Error("Todo title is required");
	return withFileLock(path.join(runRoot, ".locks", "todos.lock"), async () => {
		const todos = await listTodos(runRoot);
		const id = nextTodoId(todos);
		const dependsOn = normalizeTodoIds(input.dependsOn);
		const knownIds = new Set(todos.map((todo) => todo.id));
		const unknownDependency = dependsOn.find((todoId) => !knownIds.has(todoId));
		if (unknownDependency) throw new Error(`Unknown dependency: ${unknownDependency}`);
		const timestamp = new Date().toISOString();
		const todo: TodoRecord = {
			schema: 1,
			id,
			title: input.title.trim(),
			status: "open",
			priority: input.priority ?? "medium",
			tags: [...new Set(input.tags ?? [])],
			dependsOn,
			artifactRefs: [],
			createdAt: timestamp,
			updatedAt: timestamp,
			body: input.body?.trim() ?? "",
		};
		await atomicWrite(getTodoPath(runRoot, id), serializeTodo(todo));
		return todo;
	});
}

async function mutateTodo(
	runRoot: string,
	todoId: string,
	mutate: (todo: TodoRecord) => Promise<void> | void,
): Promise<TodoRecord> {
	const todoPath = getTodoPath(runRoot, todoId);
	return withFileLock(path.join(runRoot, ".locks", `${todoId}.lock`), async () => {
		const todo = await getTodo(runRoot, todoId);
		await mutate(todo);
		todo.updatedAt = new Date().toISOString();
		await atomicWrite(todoPath, serializeTodo(todo));
		return todo;
	});
}

export async function updateTodo(
	runRoot: string,
	todoId: string,
	patch: {
		title?: string;
		body?: string;
		status?: TodoStatus;
		priority?: TodoPriority;
		tags?: string[];
		dependsOn?: string[];
	},
): Promise<TodoRecord> {
	return mutateTodo(runRoot, todoId, async (todo) => {
		if (patch.title !== undefined) {
			if (!patch.title.trim()) throw new Error("Todo title cannot be empty");
			todo.title = patch.title.trim();
		}
		if (patch.body !== undefined) todo.body = patch.body.trim();
		if (patch.status !== undefined) {
			if (patch.status === "done") {
				throw new Error("Use the complete action to mark a todo done");
			}
			if (patch.status === "in_progress") {
				throw new Error("Use the claim action to mark a todo in progress");
			}
			if (patch.status === "open" && todo.assignedTo) {
				throw new Error("Release the existing claim before reopening the todo");
			}
			const wasDone = todo.status === "done";
			todo.status = patch.status;
			if (patch.status !== "blocked") todo.blockedReason = undefined;
			if (wasDone) {
				todo.completedAt = undefined;
				todo.verification = undefined;
				todo.artifactRefs = [];
			}
		}
		if (patch.priority !== undefined) todo.priority = patch.priority;
		if (patch.tags !== undefined) todo.tags = [...new Set(patch.tags)];
		if (patch.dependsOn !== undefined) {
			const dependsOn = normalizeTodoIds(patch.dependsOn);
			if (dependsOn.includes(todoId)) throw new Error("A todo cannot depend on itself");
			const knownIds = new Set((await listTodos(runRoot)).map((item) => item.id));
			const unknownDependency = dependsOn.find((dependency) => !knownIds.has(dependency));
			if (unknownDependency) throw new Error(`Unknown dependency: ${unknownDependency}`);
			todo.dependsOn = dependsOn;
		}
	});
}

export async function appendTodo(runRoot: string, todoId: string, content: string): Promise<TodoRecord> {
	if (!content.trim()) throw new Error("Append content is required");
	return mutateTodo(runRoot, todoId, (todo) => {
		todo.body = todo.body.trim() ? `${todo.body.trim()}\n\n${content.trim()}` : content.trim();
	});
}

function assignmentFor(membership: RunMembership, sessionId: string): TodoAssignment {
	return {
		sessionId,
		role: membership.role,
		label: membership.label,
		targetId: membership.targetId,
		claimedAt: new Date().toISOString(),
	};
}

export async function claimTodo(
	runRoot: string,
	todoId: string,
	membership: RunMembership,
	sessionId: string,
): Promise<TodoRecord> {
	return mutateTodo(runRoot, todoId, async (todo) => {
		if (["done", "failed"].includes(todo.status)) {
			throw new Error(`Cannot claim ${todo.id} because it is ${todo.status}`);
		}
		if (todo.assignedTo && todo.assignedTo.sessionId !== sessionId) {
			throw new Error(
				`${todo.id} is assigned to ${todo.assignedTo.label ?? todo.assignedTo.sessionId}`,
			);
		}
		const todos = await listTodos(runRoot);
		const byId = new Map(todos.map((item) => [item.id, item]));
		const incomplete = todo.dependsOn.filter((dependency) => byId.get(dependency)?.status !== "done");
		if (incomplete.length > 0) {
			throw new Error(`${todo.id} has incomplete dependencies: ${incomplete.join(", ")}`);
		}
		todo.status = "in_progress";
		todo.blockedReason = undefined;
		todo.assignedTo = assignmentFor(membership, sessionId);
	});
}

export async function releaseTodo(
	runRoot: string,
	todoId: string,
	sessionId: string,
): Promise<TodoRecord> {
	return mutateTodo(runRoot, todoId, (todo) => {
		if (todo.assignedTo && todo.assignedTo.sessionId !== sessionId) {
			throw new Error(`${todo.id} is assigned to another session`);
		}
		todo.assignedTo = undefined;
		if (todo.status === "in_progress") todo.status = "open";
	});
}

export async function forceReleaseTodo(
	runRoot: string,
	todoId: string,
	membership: RunMembership,
	sessionId: string,
	reason: string,
): Promise<TodoRecord> {
	if (membership.role !== "coordinator") {
		throw new Error("Only a coordinator may force-release a todo claim");
	}
	if (!reason.trim()) throw new Error("Force-release reason is required");
	return mutateTodo(runRoot, todoId, (todo) => {
		if (!todo.assignedTo) throw new Error(`${todo.id} has no claim to force-release`);
		const releasedAt = new Date().toISOString();
		todo.claimRecoveries = [
			...(todo.claimRecoveries ?? []),
			{
				releasedAssignment: todo.assignedTo,
				releasedBy: {
					sessionId,
					role: membership.role,
					label: membership.label,
					targetId: membership.targetId,
				},
				reason: reason.trim(),
				releasedAt,
			},
		];
		todo.assignedTo = undefined;
		if (todo.status === "in_progress") todo.status = "open";
	});
}

export async function blockTodo(
	runRoot: string,
	todoId: string,
	reason: string,
): Promise<TodoRecord> {
	if (!reason.trim()) throw new Error("Block reason is required");
	return mutateTodo(runRoot, todoId, (todo) => {
		todo.status = "blocked";
		todo.blockedReason = reason.trim();
	});
}

export async function completeTodo(
	runRoot: string,
	todoId: string,
	sessionId: string,
	input: { verification?: string; artifactRefs?: string[] },
): Promise<TodoRecord> {
	const verification = input.verification?.trim();
	if (!verification) throw new Error("Verification evidence is required for completion");
	const artifactRefs = await validateCompletionArtifactRefs(runRoot, input.artifactRefs);
	return mutateTodo(runRoot, todoId, async (todo) => {
		if (todo.status !== "in_progress" || !todo.assignedTo) {
			throw new Error(`${todo.id} must be claimed and in progress before completion`);
		}
		if (todo.assignedTo.sessionId !== sessionId) {
			throw new Error(`${todo.id} is assigned to another session`);
		}
		const todos = await listTodos(runRoot);
		const byId = new Map(todos.map((item) => [item.id, item]));
		const incomplete = todo.dependsOn.filter((dependency) => byId.get(dependency)?.status !== "done");
		if (incomplete.length > 0) {
			throw new Error(`${todo.id} has incomplete dependencies: ${incomplete.join(", ")}`);
		}
		todo.status = "done";
		todo.assignedTo = undefined;
		todo.blockedReason = undefined;
		todo.verification = verification;
		todo.artifactRefs = artifactRefs;
		todo.completedAt = new Date().toISOString();
	});
}

export async function deleteTodo(runRoot: string, todoId: string): Promise<void> {
	const todoPath = getTodoPath(runRoot, todoId);
	await withFileLock(path.join(runRoot, ".locks", `${todoId}.lock`), async () => {
		if (!(await pathExists(todoPath))) throw new Error(`Todo not found: ${todoId}`);
		const dependents = (await listTodos(runRoot)).filter((todo) => todo.dependsOn.includes(todoId));
		if (dependents.length > 0) {
			throw new Error(`${todoId} is required by: ${dependents.map((todo) => todo.id).join(", ")}`);
		}
		await rm(todoPath);
	});
}

export function isTodoReady(todo: TodoRecord, allTodos: TodoRecord[]): boolean {
	if (todo.status !== "open") return false;
	const byId = new Map(allTodos.map((item) => [item.id, item]));
	return todo.dependsOn.every((dependency) => byId.get(dependency)?.status === "done");
}
