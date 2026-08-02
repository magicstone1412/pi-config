import { afterEach, describe, expect, test } from "bun:test";
import {
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
import { createRun, getRun, joinRun } from "./runs.ts";
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
	updateTodo,
} from "./todos.ts";
import type { RunMembership } from "./types.ts";

const projectRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoots: string[] = [];

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
		for (const reservedPath of ["RUN.JSON", "Todos/TODO-001.md", ".LOCKS/lock"]) {
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
		await claimTodo(root, todo.id, { ...worker, label: "worker-b" }, "session-b");
		expect((await getTodo(root, todo.id)).assignedTo?.sessionId).toBe("session-b");
	});
});

describe("file locks", () => {
	test("takes over stale locks and does not clean up a replacement owner", async () => {
		const root = await temporaryHistoryRoot();
		const lockPath = path.join(root, ".locks", "ownership.lock");
		await mkdir(lockPath, { recursive: true });
		await writeFile(
			path.join(lockPath, "stale"),
			`${JSON.stringify({ token: "stale", pid: 1, createdAt: "2020-01-01T00:00:00.000Z" })}\n`,
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
