interface ToolResult {
	content?: Array<{ type?: string; text?: string }>;
	details?: any;
}

export function toolResultText(result: ToolResult, expanded: boolean): string {
	const first = result.content?.[0];
	const text = first?.type === "text" ? (first.text ?? "") : "Done";
	return expanded ? text : text.split("\n")[0];
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
