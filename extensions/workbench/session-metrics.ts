import { open } from "node:fs/promises";

export interface SessionMetrics {
	turns: number;
	cost: number;
}

function usageCost(value: unknown): number {
	if (!value || typeof value !== "object") return 0;
	const cost = (value as Record<string, unknown>).cost;
	if (!cost || typeof cost !== "object") return 0;
	const total = (cost as Record<string, unknown>).total;
	return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

export function addSessionEntryMetrics(metrics: SessionMetrics, entry: unknown): void {
	if (!entry || typeof entry !== "object") return;
	const record = entry as Record<string, unknown>;
	if (record.type === "message" && record.message && typeof record.message === "object") {
		const message = record.message as Record<string, unknown>;
		if (message.role === "assistant") metrics.turns += 1;
		metrics.cost += usageCost(message.usage);
		return;
	}
	if (record.type === "compaction" || record.type === "branch_summary") {
		metrics.cost += usageCost(record.usage);
	}
}

export class SessionMetricsReader {
	readonly metrics: SessionMetrics = { turns: 0, cost: 0 };
	private offset = 0;
	private remainder = "";
	private refreshing?: Promise<void>;

	constructor(readonly path: string) {}

	refresh(): Promise<void> {
		if (!this.refreshing) {
			this.refreshing = this.readAppendedEntries().finally(() => {
				this.refreshing = undefined;
			});
		}
		return this.refreshing;
	}

	private async readAppendedEntries(): Promise<void> {
		let file;
		try {
			file = await open(this.path, "r");
			const stat = await file.stat();
			if (stat.size < this.offset) {
				this.offset = 0;
				this.remainder = "";
				this.metrics.turns = 0;
				this.metrics.cost = 0;
			}
			if (stat.size === this.offset) return;
			const bytesToRead = stat.size - this.offset;
			const buffer = Buffer.alloc(bytesToRead);
			const { bytesRead } = await file.read(buffer, 0, bytesToRead, this.offset);
			this.offset += bytesRead;
			const content = this.remainder + buffer.toString("utf8", 0, bytesRead);
			const lines = content.split("\n");
			this.remainder = lines.pop() ?? "";
			for (const line of lines) {
				if (!line) continue;
				try {
					addSessionEntryMetrics(this.metrics, JSON.parse(line));
				} catch {
					// A malformed complete entry contributes no trustworthy metrics.
				}
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") throw error;
		} finally {
			await file?.close();
		}
	}
}
