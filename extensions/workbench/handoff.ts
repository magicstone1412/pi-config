import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getHistoryRoot } from "./storage.ts";

const HANDOFF_TTL_MS = 5 * 60_000;
const INTERNAL_WORKBENCH_ENTRIES = new Set(["workbench-run", "workbench-agent-monitor"]);

export interface HandoffDescriptor {
  schema: 1;
  token: string;
  sourceSessionFile: string;
  sourceSessionId: string;
  runId: string;
  projectPath: string;
  worktreePath: string;
  role: string;
  label: string;
  parentHadTodo: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface HandoffSessionManager {
  getSessionFile(): string | undefined;
  getLeafId(): string | null;
  isPersisted(): boolean;
  getBranch(fromId?: string): SessionEntry[];
  getSessionDir(): string;
  getHeader(): { version?: number } | null;
  getCwd(): string;
}

export interface HandoffClaim {
  descriptor: HandoffDescriptor;
  originalPath: string;
  complete(): Promise<void>;
  release(): Promise<void>;
}

function filteredBranch(branch: SessionEntry[]): SessionEntry[] {
  const removedIds = new Set(
    branch
      .filter(
        (entry) => entry.type === "custom" && INTERNAL_WORKBENCH_ENTRIES.has(entry.customType),
      )
      .map((entry) => entry.id),
  );

  for (const entry of branch) {
    if (entry.type === "label" && removedIds.has(entry.targetId)) removedIds.add(entry.id);
  }

  const retained = branch.filter((entry) => !removedIds.has(entry.id));
  return retained.map((entry, index) => {
    const clone = structuredClone(entry);
    clone.parentId = index === 0 ? null : retained[index - 1].id;
    if (clone.type === "compaction" && removedIds.has(clone.firstKeptEntryId)) {
      const firstKeptIndex = branch.findIndex(
        (candidate) => candidate.id === clone.firstKeptEntryId,
      );
      const compactionIndex = branch.findIndex((candidate) => candidate.id === clone.id);
      const replacement = branch
        .slice(Math.max(0, firstKeptIndex), compactionIndex)
        .find((candidate) => !removedIds.has(candidate.id));
      if (replacement) clone.firstKeptEntryId = replacement.id;
    }
    return clone;
  });
}

export async function createHandoffSession(
  sessionManager: HandoffSessionManager,
  options: { leafId?: string; position?: "before" | "at" } = {},
  now = new Date(),
): Promise<{ file: string; id: string }> {
  const sourceSessionFile = sessionManager.getSessionFile();
  const sourceLeafId = options.leafId ?? sessionManager.getLeafId();
  if (!sourceSessionFile || !sessionManager.isPersisted()) {
    throw new Error("Handoff requires a persisted Pi session.");
  }
  if (!sourceLeafId) throw new Error("Handoff requires an active conversation.");

  const sourceBranch = sessionManager.getBranch(sourceLeafId);
  if (!sourceBranch.some((entry) => entry.id === sourceLeafId)) {
    throw new Error(`Handoff entry not found: ${sourceLeafId}`);
  }
  const selectedBranch = options.position === "before" ? sourceBranch.slice(0, -1) : sourceBranch;
  const branch = filteredBranch(selectedBranch);
  const childSessionId = randomUUID();
  const timestamp = now.toISOString();
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");
  const childSessionFile = path.join(
    sessionManager.getSessionDir(),
    `${fileTimestamp}_${childSessionId}.jsonl`,
  );
  const sourceHeader = sessionManager.getHeader();
  const header = {
    type: "session",
    version: sourceHeader?.version ?? 3,
    id: childSessionId,
    timestamp,
    cwd: sessionManager.getCwd(),
    parentSession: sourceSessionFile,
  };
  const content = [header, ...branch].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await mkdir(path.dirname(childSessionFile), { recursive: true });
  await writeFile(childSessionFile, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { file: childSessionFile, id: childSessionId };
}

export async function createHandoffDescriptor(
  runRoot: string,
  input: Omit<HandoffDescriptor, "schema" | "token" | "createdAt" | "expiresAt">,
  now = new Date(),
): Promise<{ descriptor: HandoffDescriptor; path: string }> {
  const token = randomUUID();
  const descriptor: HandoffDescriptor = {
    schema: 1,
    token,
    ...input,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS).toISOString(),
  };
  const directory = path.join(runRoot, ".handoffs");
  const descriptorPath = path.join(directory, `${token}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return { descriptor, path: descriptorPath };
}

function isDescriptor(value: unknown): value is HandoffDescriptor {
  if (!value || typeof value !== "object") return false;
  const descriptor = value as Partial<HandoffDescriptor>;
  return (
    descriptor.schema === 1 &&
    typeof descriptor.token === "string" &&
    typeof descriptor.sourceSessionFile === "string" &&
    typeof descriptor.sourceSessionId === "string" &&
    typeof descriptor.runId === "string" &&
    typeof descriptor.projectPath === "string" &&
    typeof descriptor.worktreePath === "string" &&
    typeof descriptor.role === "string" &&
    typeof descriptor.label === "string" &&
    typeof descriptor.parentHadTodo === "boolean" &&
    typeof descriptor.createdAt === "string" &&
    typeof descriptor.expiresAt === "string"
  );
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function claimHandoffDescriptor(
  descriptorPath: string,
  token: string,
  options: { historyRoot?: string; now?: Date } = {},
): Promise<HandoffClaim> {
  if (
    !path.isAbsolute(descriptorPath) ||
    path.basename(path.dirname(descriptorPath)) !== ".handoffs"
  ) {
    throw new Error("Invalid Workbench handoff descriptor path.");
  }
  if (path.basename(descriptorPath) !== `${token}.json`) {
    throw new Error("Workbench handoff token does not match its descriptor path.");
  }

  const descriptorStat = await lstat(descriptorPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT")
      throw new Error("Workbench handoff was already consumed or expired.");
    throw error;
  });
  if (!descriptorStat.isFile() || descriptorStat.isSymbolicLink()) {
    throw new Error("Workbench handoff descriptor must be a regular file.");
  }
  const canonicalHistoryRoot = await realpath(options.historyRoot ?? getHistoryRoot());
  const canonicalDirectory = await realpath(path.dirname(descriptorPath));
  if (!isInside(canonicalHistoryRoot, canonicalDirectory)) {
    throw new Error("Workbench handoff descriptor is outside Workbench history.");
  }

  const claimPath = `${descriptorPath}.${process.pid}.${randomUUID()}.claim`;
  await rename(descriptorPath, claimPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT")
      throw new Error("Workbench handoff was already consumed or expired.");
    throw error;
  });

  let descriptor: HandoffDescriptor;
  try {
    const parsed = JSON.parse(await readFile(claimPath, "utf8")) as unknown;
    if (!isDescriptor(parsed) || parsed.token !== token) {
      throw new Error("Invalid Workbench handoff descriptor.");
    }
    const expiry = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(expiry) || expiry < (options.now ?? new Date()).getTime()) {
      throw new Error("Workbench handoff descriptor has expired.");
    }
    descriptor = parsed;
  } catch (error) {
    await rm(claimPath, { force: true }).catch(() => undefined);
    throw error;
  }

  let settled = false;
  return {
    descriptor,
    originalPath: descriptorPath,
    async complete() {
      if (settled) return;
      settled = true;
      await rm(claimPath, { force: true });
    },
    async release() {
      if (settled) return;
      settled = true;
      try {
        await rename(claimPath, descriptorPath);
      } catch {
        await rm(claimPath, { force: true });
      }
    },
  };
}

export function buildHandoffResumePrompt(descriptorPath: string, token: string): string {
  const payload = Buffer.from(JSON.stringify({ descriptorPath, token }), "utf8").toString(
    "base64url",
  );
  return `/handoff --resume ${payload}`;
}

export function parseHandoffResumeArgs(
  args: string,
): { descriptorPath: string; token: string } | undefined {
  const match = args.trim().match(/^--resume ([A-Za-z0-9_-]+)$/);
  if (!match) return undefined;
  try {
    const value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof value.descriptorPath !== "string" || typeof value.token !== "string") {
      return undefined;
    }
    return { descriptorPath: value.descriptorPath, token: value.token };
  } catch {
    return undefined;
  }
}

export async function removePendingHandoff(
  descriptorPath: string | undefined,
  childSessionFile: string | undefined,
): Promise<void> {
  await Promise.all([
    descriptorPath ? rm(descriptorPath, { force: true }) : Promise.resolve(),
    childSessionFile ? rm(childSessionFile, { force: true }) : Promise.resolve(),
  ]);
}
