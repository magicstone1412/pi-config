import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, resolveInside, withFileLock } from "./storage.ts";

export type ParentReportStatus = "done" | "needs_input";

export interface ParentReport {
	schema: 1;
	id: string;
	label: string;
	status: ParentReportStatus;
	summary: string;
	createdAt: string;
}

function reportKey(label: string): string {
	return createHash("sha256").update(label).digest("hex").slice(0, 24);
}

export function parentReportPath(runRoot: string, label: string): string {
	return resolveInside(runRoot, `.agent-reports/${reportKey(label)}.json`);
}

export async function writeParentReport(
	runRoot: string,
	label: string,
	status: ParentReportStatus,
	summary: string,
): Promise<ParentReport> {
	const report: ParentReport = {
		schema: 1,
		id: randomUUID(),
		label,
		status,
		summary,
		createdAt: new Date().toISOString(),
	};
	const target = parentReportPath(runRoot, label);
	const lockPath = path.join(runRoot, ".locks", `agent-report-${reportKey(label)}.lock`);
	await withFileLock(lockPath, () => atomicWrite(target, `${JSON.stringify(report, null, 2)}\n`));
	return report;
}

export async function readParentReport(
	runRoot: string,
	label: string,
): Promise<ParentReport | undefined> {
	try {
		const value = JSON.parse(await readFile(parentReportPath(runRoot, label), "utf8")) as Partial<ParentReport>;
		if (
			value.schema !== 1 ||
			typeof value.id !== "string" ||
			value.label !== label ||
			(value.status !== "done" && value.status !== "needs_input") ||
			typeof value.summary !== "string" ||
			typeof value.createdAt !== "string"
		) return undefined;
		return value as ParentReport;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		return undefined;
	}
}

export async function clearParentReport(runRoot: string, label: string): Promise<void> {
	await rm(parentReportPath(runRoot, label), { force: true });
}
