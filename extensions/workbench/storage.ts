import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, lstatSync } from "node:fs";
import {
	access,
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	rmdir,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { RepositoryIdentity } from "./types.ts";

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 5 * 60_000;

export function getHistoryRoot(): string {
	return path.join(homedir(), ".pi", "history");
}

function runGit(cwd: string, args: string[]): string | undefined {
	try {
		const output = execFileSync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 2_000,
		}).trim();
		return output || undefined;
	} catch {
		return undefined;
	}
}

export function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return slug || "run";
}

export function repositoryId(name: string, commonDir: string): string {
	const digest = createHash("sha256").update(commonDir).digest("hex").slice(0, 12);
	return `${slugify(name)}-${digest}`;
}

export async function resolveRepository(cwd: string): Promise<RepositoryIdentity> {
	const gitRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]);
	const gitCommonDir = runGit(cwd, ["rev-parse", "--git-common-dir"]);

	if (gitRoot && gitCommonDir) {
		const commonPath = path.isAbsolute(gitCommonDir)
			? gitCommonDir
			: path.resolve(cwd, gitCommonDir);
		const canonicalRoot = await realpath(gitRoot).catch(() => path.resolve(gitRoot));
		const canonicalCommonDir = await realpath(commonPath).catch(() => path.resolve(commonPath));
		return {
			id: repositoryId(path.basename(canonicalRoot), canonicalCommonDir),
			root: canonicalRoot,
			commonDir: canonicalCommonDir,
			remote: runGit(cwd, ["config", "--get", "remote.origin.url"]),
		};
	}

	const canonicalRoot = await realpath(cwd).catch(() => path.resolve(cwd));
	return {
		id: repositoryId(path.basename(canonicalRoot), canonicalRoot),
		root: canonicalRoot,
		commonDir: canonicalRoot,
	};
}

export function getRepositoryDir(historyRoot: string, repository: RepositoryIdentity): string {
	return path.join(historyRoot, repository.id);
}

export function resolveInside(root: string, relativePath: string): string {
	const normalizedInput = relativePath.trim().replace(/^@/, "");
	if (!normalizedInput || path.isAbsolute(normalizedInput)) {
		throw new Error("Path must be a non-empty path relative to the run root");
	}

	const resolved = path.resolve(root, normalizedInput);
	const relative = path.relative(root, resolved);
	if (!relative || relative === ".") {
		throw new Error("Path must name a file beneath the run root");
	}
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Path escapes the run root: ${relativePath}`);
	}

	let current = root;
	for (const segment of relative.split(path.sep)) {
		current = path.join(current, segment);
		try {
			if (lstatSync(current).isSymbolicLink()) {
				throw new Error(`Path traverses a symbolic link: ${relativePath}`);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
			throw error;
		}
	}
	return resolved;
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function readJson<T>(filePath: string): Promise<T> {
	return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const temporaryPath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
	);

	try {
		await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
		await rename(temporaryPath, filePath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

interface LockOwner {
	token: string;
	pid: number;
	createdAt: string;
}

async function readLockOwner(lockPath: string): Promise<LockOwner | undefined> {
	try {
		const entries = await readdir(lockPath, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const owner = JSON.parse(
				await readFile(path.join(lockPath, entry.name), "utf8"),
			) as Partial<LockOwner>;
			if (
				owner.token === entry.name &&
				typeof owner.pid === "number" &&
				typeof owner.createdAt === "string"
			) {
				return owner as LockOwner;
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function removeLockIfOwned(lockPath: string, token: string): Promise<boolean> {
	try {
		await rm(path.join(lockPath, token));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
	await rmdir(lockPath).catch((error: NodeJS.ErrnoException) => {
		if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code ?? "")) throw error;
	});
	return true;
}

export async function withFileLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
	await mkdir(path.dirname(lockPath), { recursive: true });
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	const owner: LockOwner = {
		token: randomBytes(16).toString("hex"),
		pid: process.pid,
		createdAt: new Date().toISOString(),
	};
	const pendingPath = `${lockPath}.${owner.token}.tmp`;
	await mkdir(pendingPath, { mode: 0o700 });
	await writeFile(path.join(pendingPath, owner.token), `${JSON.stringify(owner, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	let acquired = false;

	try {
		while (!acquired) {
			try {
				await rename(pendingPath, lockPath);
				acquired = true;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;

				const observedOwner = await readLockOwner(lockPath);
				const observedCreatedAt = observedOwner
					? Date.parse(observedOwner.createdAt)
					: Number.NaN;
				if (
					observedOwner &&
					Number.isFinite(observedCreatedAt) &&
					Date.now() - observedCreatedAt > LOCK_STALE_MS &&
					!isProcessAlive(observedOwner.pid) &&
					(await removeLockIfOwned(lockPath, observedOwner.token))
				) {
					continue;
				}
				if (Date.now() >= deadline) {
					throw new Error(`Timed out waiting for lock: ${lockPath}`);
				}
				await sleep(50);
			}
		}
		return await operation();
	} finally {
		if (acquired) await removeLockIfOwned(lockPath, owner.token).catch(() => false);
		else await rm(pendingPath, { recursive: true, force: true }).catch(() => undefined);
	}
}
