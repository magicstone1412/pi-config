import type { LaunchAgentResponse, WaitForAgentResponse } from "./sc.ts";
import type { RunMembership } from "./types.ts";

interface ToolResult {
	content?: Array<{ type?: string; text?: string }>;
	details?: any;
}

export function toolResultText(result: ToolResult, expanded: boolean): string {
	const first = result.content?.[0];
	const text = first?.type === "text" ? (first.text ?? "") : "Done";
	return expanded ? text : text.split("\n")[0];
}

interface BoundedScResultOptions {
	retrievalGuidance: string;
}

interface ScResultLimits {
	maxBytes: number;
	maxLines: number;
	truncateHead: (
		content: string,
		options: { maxBytes: number; maxLines: number },
	) => { content: string; truncated: boolean };
}

export function boundedScResultText(
	value: object,
	options: BoundedScResultOptions,
	limits: ScResultLimits,
): string {
	const serialized = JSON.stringify(value, null, 2);
	const initial = limits.truncateHead(serialized, {
		maxBytes: limits.maxBytes,
		maxLines: limits.maxLines,
	});
	if (!initial.truncated) return serialized;

	const suffix = `\n[Output truncated at Pi's ${limits.maxBytes / 1024} KB / ${limits.maxLines}-line custom-tool limits. ${options.retrievalGuidance}]`;
	const suffixBytes = new TextEncoder().encode(suffix).byteLength;
	const body = limits.truncateHead(serialized, {
		maxBytes: limits.maxBytes - suffixBytes,
		maxLines: limits.maxLines - 1,
	});
	return `${body.content}${suffix}`;
}

export function launchAgentToolResult(
	launched: LaunchAgentResponse,
	limits: ScResultLimits,
) {
	return {
		content: [{
			type: "text" as const,
			text: boundedScResultText(launched, {
				retrievalGuidance: "Full structured launch data remains in tool details.",
			}, limits),
		}],
		details: { status: "launched" as const, ...launched },
	};
}

export function waitForAgentToolResult(
	target: string,
	result: WaitForAgentResponse,
	limits: ScResultLimits,
) {
	return {
		content: [{
			type: "text" as const,
			text: boundedScResultText(result, {
				retrievalGuidance: "Call wait_for_agent again with a smaller last value to retrieve a bounded transcript. Full structured wait/read data remains in tool details.",
			}, limits),
		}],
		details: { status: "completed" as const, target, ...result },
	};
}

export function runWorkspaceResultText(result: ToolResult, expanded: boolean): string {
	if (expanded) return toolResultText(result, true);
	const details = result.details;
	if (details?.action === "current" && details.membership && details.manifest) {
		return `${details.membership.runId}: ${details.manifest.title} (${details.manifest.status}/${details.manifest.phase})`;
	}
	if (details?.action === "list" && Array.isArray(details.runs)) {
		return `${details.runs.length} runs`;
	}
	return toolResultText(result, false);
}

export function todoResultText(result: ToolResult, expanded: boolean): string {
	if (expanded) return toolResultText(result, true);
	const details = result.details;
	if (details?.action === "get" && details.todo) {
		return `${details.todo.id}: ${details.todo.title} (${details.todo.status})`;
	}
	if (details?.action === "list" && Array.isArray(details.todos)) {
		return `${details.todos.length} todos`;
	}
	return toolResultText(result, false);
}

const MAX_STATUS_PART_LENGTH = 24;

function boundedStatusPart(value: string): string {
	return value.length > MAX_STATUS_PART_LENGTH
		? `${value.slice(0, MAX_STATUS_PART_LENGTH - 1)}…`
		: value;
}

function compactMembershipLabel(membership: RunMembership): string | undefined {
	if (!membership.label) return undefined;
	let label = membership.label;
	if (label.startsWith(`${membership.runId}-`)) label = label.slice(membership.runId.length + 1);
	if (label === membership.role) return undefined;
	if (label.startsWith(`${membership.role}-`)) label = label.slice(membership.role.length + 1);
	if (label === membership.todoId) return undefined;
	if (membership.todoId && label.startsWith(`${membership.todoId}-`)) {
		label = label.slice(membership.todoId.length + 1);
	}
	return label ? boundedStatusPart(label) : undefined;
}

export function workbenchStatusText(membership?: RunMembership): string | undefined {
	if (!membership) return undefined;
	const runSlug = membership.runId.replace(/^\d{8}-\d{6}-/, "");
	return [
		`WB ${boundedStatusPart(runSlug)}`,
		membership.role,
		membership.todoId,
		compactMembershipLabel(membership),
	].filter((part): part is string => Boolean(part)).join(" · ");
}

export function agentName(value: unknown): string {
	return typeof value === "string" && value.trim() ? value : "(unlabeled)";
}

export function taskPreview(value: unknown, maxLength = 100): string {
	if (typeof value !== "string") return "";
	const firstLine = value.split("\n").find((line) => line.trim())?.trim() ?? "";
	return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength)}…` : firstLine;
}

export function taskLineCount(value: unknown): number {
	return typeof value === "string" && value ? value.split("\n").length : 0;
}

export function launchAgentResultText(
	result: ToolResult,
	expanded: boolean,
	isError = false,
): string {
	if (expanded || isError) return toolResultText(result, true);
	const details = result.details;
	if (details?.status === "launched") {
		const identifiers = details.identifiers ?? {};
		const name = identifiers.label ?? identifiers.stableTargetId ?? identifiers.selector;
		return `${agentName(name)} — launched`;
	}
	return toolResultText(result, false);
}

export function waitForAgentResultText(
	result: ToolResult,
	expanded: boolean,
	isError = false,
): string {
	if (expanded || isError) return toolResultText(result, true);
	const details = result.details;
	if (details?.status === "waiting") return `${agentName(details.target)} — waiting`;
	if (details?.status === "completed") return `${agentName(details.target)} — completed`;
	return toolResultText(result, false);
}
