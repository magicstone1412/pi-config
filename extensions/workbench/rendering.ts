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
	const runSlug = membership.scope?.type === "workspace"
		? membership.scope.name
		: membership.runId.replace(/^\d{8}-\d{6}-/, "");
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

export type AgentPanelStatus = "launched" | "running" | "failed" | "monitoring_failed";

export interface AgentPanelItem {
	target: string;
	startedAt: number;
	status: AgentPanelStatus;
}

interface AgentPanelTheme {
	fg(color: string, text: string): string;
}

export function agentPanelName(target: string): string {
	const name = target.replace(/^(?:label:|id:)/, "");
	const role = name.match(/(?:^|-)(scout|worker|reviewer)(?:-(TODO-\d{3,}))?(?:-|$)/i);
	if (!role) return name;
	const roleName = `${role[1]![0]!.toUpperCase()}${role[1]!.slice(1).toLowerCase()}`;
	return role[2] ? `${roleName} · ${role[2].toUpperCase()}` : roleName;
}

function panelElapsedTime(startedAt: number, now: number): string {
	const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

function characterWidth(character: string): number {
	const codePoint = character.codePointAt(0) ?? 0;
	if (/\p{Mark}/u.test(character) || codePoint === 0x200d || codePoint === 0xfe0f) return 0;
	if (
		codePoint >= 0x1100 && (
			codePoint <= 0x115f ||
			codePoint === 0x2329 || codePoint === 0x232a ||
			(codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
			(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
			(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
			(codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
			(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
			(codePoint >= 0xff00 && codePoint <= 0xff60) ||
			(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
			(codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
			(codePoint >= 0x20000 && codePoint <= 0x3fffd)
		)
	) return 2;
	return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0) ? 0 : 1;
}

export function panelTextWidth(text: string): number {
	return Array.from(text).reduce((width, character) => width + characterWidth(character), 0);
}

function truncatePanelText(text: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (panelTextWidth(text) <= maxWidth) return text;
	if (maxWidth === 1) return "…";
	let output = "";
	let width = 0;
	for (const character of text) {
		const nextWidth = characterWidth(character);
		if (width + nextWidth > maxWidth - 1) break;
		output += character;
		width += nextWidth;
	}
	return `${output}…`;
}

function panelBorderLine(
	left: string,
	right: string,
	rightColor: string,
	width: number,
	theme: AgentPanelTheme,
): string {
	if (width <= 0) return "";
	if (width === 1) return theme.fg("accent", "│");
	const contentWidth = width - 2;
	const boundedRight = truncatePanelText(right, contentWidth);
	const rightWidth = panelTextWidth(boundedRight);
	const boundedLeft = truncatePanelText(left, Math.max(0, contentWidth - rightWidth));
	const padding = " ".repeat(
		Math.max(0, contentWidth - panelTextWidth(boundedLeft) - rightWidth),
	);
	return theme.fg("accent", "│") + theme.fg("muted", boundedLeft) + padding +
		theme.fg(rightColor, boundedRight) + theme.fg("accent", "│");
}

function panelTop(title: string, info: string, width: number, theme: AgentPanelTheme): string {
	if (width <= 0) return "";
	if (width === 1) return theme.fg("accent", "╭");
	const innerWidth = width - 2;
	const titlePart = `─ ${title} `;
	const infoPart = ` ${info} ─`;
	const content = truncatePanelText(
		`${titlePart}${"─".repeat(Math.max(0, innerWidth - titlePart.length - infoPart.length))}${infoPart}`,
		innerWidth,
	).padEnd(innerWidth, "─");
	return theme.fg("accent", `╭${content}╮`);
}

function panelBottom(width: number, theme: AgentPanelTheme): string {
	if (width <= 0) return "";
	if (width === 1) return theme.fg("accent", "╰");
	return theme.fg("accent", `╰${"─".repeat(width - 2)}╯`);
}

function panelStatus(item: AgentPanelItem): { text: string; color: string } {
	if (item.status === "failed") return { text: "failed", color: "error" };
	if (item.status === "monitoring_failed") {
		return { text: "monitoring failed", color: "error" };
	}
	if (item.status === "launched") return { text: "starting…", color: "warning" };
	return { text: "running…", color: "accent" };
}

export function renderAgentPanelLines(
	items: AgentPanelItem[],
	width: number,
	theme: AgentPanelTheme,
	now = Date.now(),
): string[] {
	const failed = items.filter(
		(item) => item.status === "failed" || item.status === "monitoring_failed",
	).length;
	const running = items.length - failed;
	const info = failed > 0
		? `${running > 0 ? `${running} running · ` : ""}${failed} failed`
		: `${running} running`;
	const lines = [panelTop("Agents", info, width, theme)];
	for (const item of items) {
		const left = ` ${panelElapsedTime(item.startedAt, now)}  ${agentPanelName(item.target)} `;
		const status = panelStatus(item);
		lines.push(panelBorderLine(left, ` ${status.text} `, status.color, width, theme));
	}
	lines.push(panelBottom(width, theme));
	return lines;
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

function elapsedTimeText(milliseconds: unknown): string {
	if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
		return "0:00";
	}
	const totalSeconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
}

export function waitForAgentResultText(
	result: ToolResult,
	expanded: boolean,
	isError = false,
): string {
	if (expanded || isError) return toolResultText(result, true);
	const details = result.details;
	if (details?.status === "waiting") {
		const attempts = typeof details.attempts === "number" && details.attempts > 1
			? ` · check ${details.attempts}`
			: "";
		return `waiting · ${elapsedTimeText(details.elapsedMs)} elapsed${attempts}`;
	}
	if (details?.status === "completed") {
		return `completed · ${elapsedTimeText(details.elapsedMs)} elapsed`;
	}
	return toolResultText(result, false);
}
