import { createHash } from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
	atomicWriteJson,
	getHistoryRoot,
	getRepositoryDir,
	pathExists,
	readJson,
	resolveRepository,
	slugify,
	withFileLock,
} from "./storage.ts";
import type {
	RepositoryIdentity,
	RunManifest,
	RunMembership,
	RunParticipant,
	RunStatus,
	WorkspaceScope,
} from "./types.ts";

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,95}$/;

function compactTimestamp(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace("T", "-")
		.slice(0, 15);
}

function assertRunId(runId: string): void {
	if (!RUN_ID_PATTERN.test(runId)) {
		throw new Error(`Invalid run id: ${runId}`);
	}
}

async function repositoryPaths(cwd: string, historyRoot = getHistoryRoot()) {
	const repository = await resolveRepository(cwd);
	const repositoryDir = getRepositoryDir(historyRoot, repository);
	return {
		repository,
		repositoryDir,
		runsDir: path.join(repositoryDir, "runs"),
	};
}

async function writeRepositoryMetadata(repositoryDir: string, repository: RepositoryIdentity): Promise<void> {
	const metadataPath = path.join(repositoryDir, "repository.json");
	if (await pathExists(metadataPath)) return;
	await atomicWriteJson(metadataPath, { schema: 1, ...repository });
}

async function nextRunId(runsDir: string, title: string, now: Date): Promise<string> {
	const base = `${compactTimestamp(now)}-${slugify(title)}`;
	let candidate = base;
	let suffix = 2;
	while (await pathExists(path.join(runsDir, candidate))) {
		candidate = `${base}-${suffix}`;
		suffix += 1;
	}
	return candidate;
}

export async function createRun(
	cwd: string,
	title: string,
	historyRoot = getHistoryRoot(),
	now = new Date(),
): Promise<{ manifest: RunManifest; root: string }> {
	if (!title.trim()) throw new Error("Run title is required");
	const { repository, repositoryDir, runsDir } = await repositoryPaths(cwd, historyRoot);
	await mkdir(runsDir, { recursive: true });
	await writeRepositoryMetadata(repositoryDir, repository);

	return withFileLock(path.join(repositoryDir, ".locks", "runs.lock"), async () => {
		const id = await nextRunId(runsDir, title, now);
		const root = path.join(runsDir, id);
		const timestamp = now.toISOString();
		const manifest: RunManifest = {
			schema: 1,
			id,
			title: title.trim(),
			status: "planning",
			phase: "planning",
			createdAt: timestamp,
			updatedAt: timestamp,
			repository,
			participants: [],
		};

		await mkdir(path.join(root, "todos"), { recursive: true });
		await mkdir(path.join(root, "artifacts"), { recursive: true });
		await mkdir(path.join(root, ".locks"), { recursive: true });
		await atomicWriteJson(path.join(root, "run.json"), manifest);
		return { manifest, root };
	});
}

export async function ensureWorkspaceRun(
	workspace: WorkspaceScope,
	historyRoot = getHistoryRoot(),
	now = new Date(),
): Promise<{ manifest: RunManifest; root: string }> {
	const canonicalPath = await realpath(workspace.path).catch(() => path.resolve(workspace.path));
	const scope: WorkspaceScope = { ...workspace, path: canonicalPath };
	const digest = createHash("sha256").update(canonicalPath).digest("hex").slice(0, 12);
	const id = `workspace-${slugify(scope.name)}-${digest}`;
	const { repository, repositoryDir, runsDir } = await repositoryPaths(canonicalPath, historyRoot);
	await mkdir(runsDir, { recursive: true });
	await writeRepositoryMetadata(repositoryDir, repository);

	return withFileLock(path.join(repositoryDir, ".locks", "runs.lock"), async () => {
		const root = path.join(runsDir, id);
		const manifestPath = path.join(root, "run.json");
		if (await pathExists(manifestPath)) {
			const manifest = await readJson<RunManifest>(manifestPath);
			if (manifest.scope?.type !== "workspace" || manifest.scope.path !== canonicalPath) {
				throw new Error(`Run id collision for Superconductor workspace: ${id}`);
			}
			return { manifest, root };
		}

		const timestamp = now.toISOString();
		const manifest: RunManifest = {
			schema: 1,
			id,
			title: `Superconductor workspace: ${scope.name}`,
			status: "ready",
			phase: "workspace",
			createdAt: timestamp,
			updatedAt: timestamp,
			repository,
			participants: [],
			scope,
		};
		await mkdir(path.join(root, "todos"), { recursive: true });
		await mkdir(path.join(root, "artifacts"), { recursive: true });
		await mkdir(path.join(root, ".locks"), { recursive: true });
		await atomicWriteJson(manifestPath, manifest);
		return { manifest, root };
	});
}

export async function resolveRunRoot(
	cwd: string,
	runId: string,
	historyRoot = getHistoryRoot(),
): Promise<string> {
	assertRunId(runId);
	const { runsDir } = await repositoryPaths(cwd, historyRoot);
	const root = path.join(runsDir, runId);
	if (!(await pathExists(path.join(root, "run.json")))) {
		throw new Error(`Run not found for this repository: ${runId}`);
	}
	return root;
}

export async function getRun(
	cwd: string,
	runId: string,
	historyRoot = getHistoryRoot(),
): Promise<{ manifest: RunManifest; root: string }> {
	const root = await resolveRunRoot(cwd, runId, historyRoot);
	return { manifest: await readJson<RunManifest>(path.join(root, "run.json")), root };
}

export async function listRuns(
	cwd: string,
	historyRoot = getHistoryRoot(),
): Promise<Array<{ manifest: RunManifest; root: string }>> {
	const { runsDir } = await repositoryPaths(cwd, historyRoot);
	const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
	const runs: Array<{ manifest: RunManifest; root: string }> = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
		const root = path.join(runsDir, entry.name);
		try {
			runs.push({ manifest: await readJson<RunManifest>(path.join(root, "run.json")), root });
		} catch {
			// Ignore incomplete run directories.
		}
	}

	return runs.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
}

async function mutateRun(
	root: string,
	mutate: (manifest: RunManifest) => void,
): Promise<RunManifest> {
	const manifestPath = path.join(root, "run.json");
	return withFileLock(path.join(root, ".locks", "run.lock"), async () => {
		const manifest = await readJson<RunManifest>(manifestPath);
		mutate(manifest);
		manifest.updatedAt = new Date().toISOString();
		await atomicWriteJson(manifestPath, manifest);
		return manifest;
	});
}

export async function updateRun(
	cwd: string,
	runId: string,
	patch: { title?: string; status?: RunStatus; phase?: string },
	historyRoot = getHistoryRoot(),
): Promise<RunManifest> {
	const root = await resolveRunRoot(cwd, runId, historyRoot);
	return mutateRun(root, (manifest) => {
		if (patch.title !== undefined) {
			if (!patch.title.trim()) throw new Error("Run title cannot be empty");
			manifest.title = patch.title.trim();
		}
		if (patch.status !== undefined) manifest.status = patch.status;
		if (patch.phase !== undefined) manifest.phase = patch.phase.trim();
	});
}

export async function joinRun(
	cwd: string,
	runId: string,
	participant: Omit<RunParticipant, "joinedAt" | "updatedAt">,
	historyRoot = getHistoryRoot(),
): Promise<{ manifest: RunManifest; membership: RunMembership }> {
	if (!participant.role.trim()) throw new Error("Role is required");
	const root = await resolveRunRoot(cwd, runId, historyRoot);
	const now = new Date().toISOString();
	const manifest = await mutateRun(root, (current) => {
		const existing = current.participants.find((item) => item.sessionId === participant.sessionId);
		if (existing) {
			Object.assign(existing, participant, { updatedAt: now });
			return;
		}
		current.participants.push({ ...participant, joinedAt: now, updatedAt: now });
	});

	const joined = manifest.participants.find((item) => item.sessionId === participant.sessionId);
	if (!joined) throw new Error("Failed to record run membership");
	return {
		manifest,
		membership: {
			runId,
			projectPath: manifest.repository.root,
			root,
			role: joined.role,
			label: joined.label,
			targetId: joined.targetId,
			todoId: joined.todoId,
			joinedAt: joined.joinedAt,
			scope: manifest.scope,
		},
	};
}
