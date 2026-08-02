import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, pathExists, resolveInside, withFileLock } from "./storage.ts";
import type { ArtifactInfo } from "./types.ts";

const RESERVED_ROOT_NAMES = new Set(["run.json", "todos", ".locks"]);

export function resolveArtifactPath(runRoot: string, relativePath: string): string {
	const target = resolveInside(runRoot, relativePath);
	const relative = path.relative(runRoot, target);
	const firstSegment = relative.split(path.sep)[0].toLowerCase();
	if (RESERVED_ROOT_NAMES.has(firstSegment)) {
		throw new Error(`Artifact path is reserved: ${relativePath}`);
	}
	return target;
}

export async function writeArtifact(
	runRoot: string,
	relativePath: string,
	content: string,
	mode: "write" | "append" = "write",
): Promise<ArtifactInfo> {
	const target = resolveArtifactPath(runRoot, relativePath);
	const lockName = createHash("sha256")
		.update(path.relative(runRoot, target))
		.digest("hex")
		.slice(0, 24);
	await mkdir(path.dirname(target), { recursive: true });
	resolveArtifactPath(runRoot, relativePath);

	await withFileLock(path.join(runRoot, ".locks", `artifact-${lockName}.lock`), async () => {
		resolveArtifactPath(runRoot, relativePath);
		let nextContent = content;
		if (mode === "append" && (await pathExists(target))) {
			const existing = await readFile(target, "utf8");
			const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
			nextContent = `${existing}${separator}${content}`;
		}
		await atomicWrite(target, nextContent);
	});

	const fileStat = await stat(target);
	return {
		path: path.relative(runRoot, target).split(path.sep).join("/"),
		bytes: fileStat.size,
		updatedAt: fileStat.mtime.toISOString(),
	};
}

export async function readArtifact(
	runRoot: string,
	relativePath: string,
	offset = 1,
	limit?: number,
): Promise<{ content: string; path: string; totalLines: number; startLine: number; endLine: number }> {
	if (!Number.isInteger(offset) || offset < 1) throw new Error("Offset must be at least 1");
	if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
		throw new Error("Limit must be at least 1");
	}
	const target = resolveArtifactPath(runRoot, relativePath);
	const content = await readFile(target, "utf8");
	const lines = content.split("\n");
	const startIndex = Math.min(offset - 1, lines.length);
	const endIndex = limit === undefined ? lines.length : Math.min(lines.length, startIndex + limit);
	return {
		content: lines.slice(startIndex, endIndex).join("\n"),
		path: path.relative(runRoot, target).split(path.sep).join("/"),
		totalLines: lines.length,
		startLine: startIndex + 1,
		endLine: endIndex,
	};
}

async function collectFiles(runRoot: string, directory: string, files: ArtifactInfo[]): Promise<void> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (RESERVED_ROOT_NAMES.has(entry.name.toLowerCase())) continue;
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await collectFiles(runRoot, absolutePath, files);
			continue;
		}
		if (!entry.isFile()) continue;
		const fileStat = await stat(absolutePath);
		files.push({
			path: path.relative(runRoot, absolutePath).split(path.sep).join("/"),
			bytes: fileStat.size,
			updatedAt: fileStat.mtime.toISOString(),
		});
	}
}

export async function listArtifacts(runRoot: string): Promise<ArtifactInfo[]> {
	const files: ArtifactInfo[] = [];
	await collectFiles(runRoot, runRoot, files);
	return files.sort((a, b) => a.path.localeCompare(b.path));
}
