/**
 * Round 19 (§0, owner): problem reports captured with 🐞 — a screenshot plus
 * what the page and the server knew at that moment, ported from the owner's
 * lego-notebook (with 3d-printers' durable drafts). Stored locally under
 * `<LH_DATA_DIR>/bugs/<id>/report.json` (+ `screenshot.jpg`); nothing leaves
 * the instance unless LH_REPORTS_REPO is set (see report-issues.ts).
 *
 * Privacy: the server context never reads auth.json, settings secrets or
 * environment keys; log lines are redacted before they are stored.
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { pendingQuestionOf } from "../core/native-messages.ts";
import { redactDeep, redactSecrets } from "../core/redact.ts";
import { stores } from "./stores.ts";

export type ReportKind = "bug" | "change";
export type ReportLogEntry = { at: string; kind: string; text: string };
export type StoredReport = Record<string, unknown> & { id: string; kind: ReportKind; at: string; path: string; note?: string; noteSeq?: number; issue?: string };

export const bugsDir = () => path.join(PATHS.data, "bugs");
const tombstones = () => path.join(bugsDir(), ".discarded");
/** A client-made id: `r-<time>-<random>` (letters, digits, dashes). */
export const safeReportId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9-]{5,80}$/.test(id);

/** Strip anything that looks like a credential from free text (log lines,
 *  notes): one definition, shared with the client's recorder (src/core). */
export { redactSecrets };

function tailLines(file: string, lines: number): string[] {
	try {
		const stat = fs.statSync(file);
		const size = Math.min(stat.size, 256 * 1024);
		const fd = fs.openSync(file, "r");
		try {
			const buffer = Buffer.alloc(size);
			fs.readSync(fd, buffer, 0, size, stat.size - size);
			return buffer.toString("utf8").split("\n").filter(Boolean).slice(-lines).map(line => redactSecrets(line).slice(0, 2000));
		} finally { fs.closeSync(fd); }
	} catch { return []; }
}

/** What the server knows about the screen the report came from. */
export function serverContext(pagePath: string) {
	const chatId = pagePath.match(/^\/chat\/([^/?#]+)/)?.[1] ?? null;
	let session: Record<string, unknown> | null = null, jobs: Record<string, unknown>[] = [];
	if (chatId) {
		try {
			const chat = stores.chatStore.getChat(decodeURIComponent(chatId));
			if (chat) {
				const pending = pendingQuestionOf(chat.messages);
				session = { id: chat.id, title: chat.title, mode: chat.practiceMode ?? chat.kind ?? "teach", messages: chat.messages.length, openQuestion: pending ? { tool: pending.tool, toolCallId: pending.toolCallId } : null };
				jobs = stores.jobStore.listJobs(chat.id).slice(-15).map(job => ({ kind: job.kind, status: job.status, activity: redactSecrets(String(job.activity ?? "")).slice(0, 300), updatedAt: job.updatedAt }));
			}
		} catch { /* the report still saves without it */ }
	}
	const log = process.env.LH_SERVER_LOG;
	return {
		buildId: process.env.LH_BUILD_ID || null,
		serverTime: new Date().toISOString(),
		session,
		jobs,
		serverLog: log ? tailLines(log, 120) : [],
	};
}

function reportDir(id: string) { return path.join(bugsDir(), id); }
function readReport(id: string): StoredReport | null {
	if (!safeReportId(id)) return null;
	try { return JSON.parse(fs.readFileSync(path.join(reportDir(id), "report.json"), "utf8")) as StoredReport; } catch { return null; }
}
function writeReport(report: StoredReport) {
	const dir = reportDir(report.id);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "report.json"), tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
	fs.renameSync(tmp, file);
}
const discarded = (id: string) => fs.existsSync(path.join(tombstones(), id));

/** A Change keeps the note, page and screenshot — not the error log or server details. */
function shaped(report: StoredReport): StoredReport {
	if (report.kind !== "change") return report;
	const { log: _log, server: _server, ...light } = report;
	void _log; void _server;
	return light as StoredReport;
}

/**
 * Create a report under the client's own id. Idempotent: the same id again
 * returns the saved report (a lost response, a retry after reload). A
 * discarded id never comes back.
 */
export function createReport(id: string, page: Record<string, unknown>): StoredReport | "discarded" | null {
	if (!safeReportId(id)) return null;
	if (discarded(id)) return "discarded";
	const existing = readReport(id);
	if (existing) return existing;
	const kind: ReportKind = page.kind === "change" ? "change" : "bug";
	const pagePath = redactSecrets(String(page.path ?? "/")).slice(0, 500);
	const { kind: _k, note: _n, ...given } = page;
	void _k; void _n;
	// Everything the page sent — its error log, URL, title, device details —
	// is cut of credentials before it is stored, whatever the client did
	// (round 19 §0: never put keys in a report; merge proof N1).
	const rest = redactDeep(given);
	const report = shaped({ ...rest, id, kind, at: String(page.at ?? new Date().toISOString()), path: pagePath, note: typeof page.note === "string" ? redactSecrets(page.note).slice(0, 4000) : "", noteSeq: 0, server: serverContext(pagePath) } as StoredReport);
	writeReport(report);
	return report;
}

/** Note and kind; an older edit (lower seq) never overwrites a newer one. */
export function updateReport(id: string, patch: { note?: string; kind?: ReportKind; seq?: number; issue?: string; screenshotMasked?: number }): StoredReport | null {
	const report = readReport(id);
	if (!report) return null;
	const seq = typeof patch.seq === "number" ? patch.seq : null;
	if (seq !== null && (report.noteSeq ?? 0) > seq) return report;
	let next: StoredReport = { ...report };
	if (patch.note !== undefined) next.note = redactSecrets(String(patch.note)).slice(0, 4000);
	if (seq !== null) next.noteSeq = seq;
	if (patch.issue) next.issue = patch.issue;
	if (typeof patch.screenshotMasked === "number") next.screenshotMasked = Math.max(0, Math.floor(patch.screenshotMasked));
	if (patch.kind === "change" || patch.kind === "bug") next = shaped({ ...next, kind: patch.kind });
	writeReport(next);
	return next;
}

/** Discard: the folder goes, and a tombstone keeps a late retry from recreating it. */
export function deleteReport(id: string): StoredReport | null {
	if (!safeReportId(id)) return null;
	const report = readReport(id);
	fs.mkdirSync(tombstones(), { recursive: true });
	fs.writeFileSync(path.join(tombstones(), id), new Date().toISOString());
	fs.rmSync(reportDir(id), { recursive: true, force: true });
	return report;
}

export function saveScreenshot(id: string, bytes: Uint8Array, type: string): boolean {
	if (!readReport(id) || bytes.byteLength > 8 * 1024 * 1024) return false;
	const name = type.includes("png") ? "screenshot.png" : "screenshot.jpg";
	fs.writeFileSync(path.join(reportDir(id), name), bytes);
	return true;
}

function screenshotFile(id: string): string | null {
	if (!safeReportId(id)) return null;
	for (const name of ["screenshot.jpg", "screenshot.png"]) { const file = path.join(reportDir(id), name); if (fs.existsSync(file)) return file; }
	return null;
}
export function readScreenshot(id: string): { bytes: Buffer; type: string } | null {
	const file = screenshotFile(id);
	return file ? { bytes: fs.readFileSync(file), type: file.endsWith(".png") ? "image/png" : "image/jpeg" } : null;
}

export function getReport(id: string): (StoredReport & { hasScreenshot: boolean; dir: string }) | null {
	const report = readReport(id);
	return report ? { ...report, hasScreenshot: screenshotFile(id) !== null, dir: reportDir(id) } : null;
}

export function listReports(): { id: string; at: string; path: string; note: string; kind: ReportKind; hasScreenshot: boolean }[] {
	let ids: string[] = [];
	try { ids = fs.readdirSync(bugsDir()).filter(safeReportId); } catch { return []; }
	return ids.map(id => readReport(id)).filter((r): r is StoredReport => !!r)
		.sort((a, b) => String(b.at).localeCompare(String(a.at)))
		.map(r => ({ id: r.id, at: String(r.at), path: String(r.path), note: String(r.note ?? ""), kind: r.kind === "change" ? "change" : "bug", hasScreenshot: screenshotFile(r.id) !== null }));
}
