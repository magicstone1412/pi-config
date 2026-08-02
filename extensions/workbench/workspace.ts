import path from "node:path";
import type { WorkspaceScope } from "./types.ts";

export interface SuperconductorWorkspace {
	scope: WorkspaceScope;
	targetId?: string;
}

export function detectSuperconductorWorkspace(
	environment: NodeJS.ProcessEnv = process.env,
): SuperconductorWorkspace | undefined {
	if (environment.SUPERCONDUCTOR_MANAGED_AGENT !== "1") return undefined;
	const workspacePath =
		environment.SUPERCONDUCTOR_WORKTREE_PATH ?? environment.SUPERCONDUCTOR_WORKSPACE_PATH;
	if (!workspacePath) return undefined;

	const resolvedPath = path.resolve(workspacePath);
	const configuredName = environment.SUPERCONDUCTOR_WORKSPACE_NAME?.trim();
	const terminalId = environment.SUPERCONDUCTOR_TERMINAL_ID?.trim();
	return {
		scope: {
			type: "workspace",
			provider: "superconductor",
			name: configuredName || path.basename(resolvedPath),
			path: resolvedPath,
		},
		targetId: terminalId ? `terminal:${terminalId}` : undefined,
	};
}

export function isCleanSession(entries: ReadonlyArray<{ type: string }>): boolean {
	return !entries.some((entry) =>
		["message", "custom_message", "compaction", "branch_summary"].includes(entry.type),
	);
}
