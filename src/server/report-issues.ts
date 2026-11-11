/**
 * Filing 🐞 reports as GitHub issues (ported from lego-notebook). OFF unless
 * LH_REPORTS_REPO ("owner/repo") is set: previews and review instances keep
 * reports in their own data dir, where the coordinator collects them. With it
 * set, leaving the report dialog files (or updates) one issue per report.
 */
import { execFile } from "node:child_process";
import { getReport, updateReport, type StoredReport } from "./bug-reports.ts";

export const reportsRepo = () => (process.env.LH_REPORTS_REPO || "").trim() || null;
const publicUrl = () => (process.env.LH_PUBLIC_URL || "").replace(/\/$/, "");

function gh(args: string[], input?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = execFile("gh", args, { timeout: 30_000 }, (error, stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim())));
		if (input !== undefined) { child.stdin?.write(input); child.stdin?.end(); }
	});
}

export function issueText(r: StoredReport): { title: string; body: string; labels: string[] } {
	const change = r.kind === "change";
	const first = String(r.note ?? "").trim().split("\n")[0]!.slice(0, 90);
	const title = first || `${change ? "Change" : "Bug"} on ${r.path || "/"}`;
	const log = Array.isArray(r.log) ? (r.log as { at: string; kind: string; text: string }[]) : [];
	const problems = log.filter(l => l.kind === "error" || l.kind === "fetch").slice(-10);
	const link = publicUrl() ? `${publicUrl()}/bugs/${r.id}` : `/bugs/${r.id} on the instance that captured it`;
	const body = [
		String(r.note ?? "").trim() || "_No note._",
		"",
		"| | |", "| --- | --- |",
		`| Kind | ${change ? "💡 Change" : "🐞 Bug"} |`,
		`| Page | \`${r.path || "?"}\` |`,
		`| When | ${r.at || "?"} |`,
		"",
		`Full report with screenshot: ${link}`,
		!change && problems.length ? ["", "Recent errors and failed requests:", "```", ...problems.map(l => `${String(l.at).slice(11, 19)} ${l.kind} ${l.text}`), "```"].join("\n") : "",
		"",
		"_Filed from the app's 🐞 Report a problem._",
	].filter(line => line !== "").join("\n");
	return { title, body, labels: [change ? "enhancement" : "bug", "needs-triage"] };
}

/** The dialog was left (Close, Open report, another page): file or update now. */
export async function fileReport(id: string): Promise<void> {
	const repo = reportsRepo();
	const report = getReport(id);
	if (!repo || !report) return;
	const { title, body, labels } = issueText(report);
	if (report.issue) { await gh(["issue", "edit", report.issue, "--title", title, "--body-file", "-"], body); return; }
	const url = await gh(["issue", "create", "--repo", repo, "--title", title, "--body-file", "-", ...labels.flatMap(l => ["--label", l])], body);
	updateReport(id, { issue: url.split("\n").pop()!.trim() });
}

/** A discarded report: close its issue if one was filed. */
export async function closeFiledIssue(issue: string | undefined): Promise<void> {
	if (!issue || !reportsRepo()) return;
	try { await gh(["issue", "close", issue, "--comment", "Discarded in the app."]); } catch { /* best effort */ }
}
