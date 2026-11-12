import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/src/server";
import { CopyReportLink, DeleteReport, ReportsBar } from "@/components/reports-ui";

export const dynamic = "force-dynamic";

type Log = { at: string; kind: string; text: string }[];

/** Round 19 (§0): one report — the note, the screenshot, and what the page and server knew. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const report = getReport(id);
	if (!report) notFound();
	const { dir, hasScreenshot, note, log, server, kind, id: _id, noteSeq: _seq, ...page } = report as typeof report & { log?: Log; server?: Record<string, unknown> };
	void _id; void _seq;
	return (
		<div className="lh-reports-page" data-testid="report-page" data-kind={kind}>
			<ReportsBar />
			<main className="lh-reports-main">
				<div className="lh-report-actions">
					<Link href={kind === "change" ? "/bugs?kind=change" : "/bugs"} className="lh-report-button" data-testid="report-back">‹ All reports</Link>
					<span className="flex-1" />
					<CopyReportLink id={id} />
					<DeleteReport id={id} />
				</div>
				<h1>{kind === "change" ? "💡 Change" : "🐞 Bug"} · <code>{String(page.path ?? "/")}</code></h1>
				<p className="lh-report-when">{new Date(String(report.at)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })}{typeof (server as { buildId?: unknown } | undefined)?.buildId === "string" ? ` · build ${(server as { buildId: string }).buildId}` : ""}</p>
				<p className="lh-report-text" data-testid="report-note">{note || <span className="lh-report-none">No note.</span>}</p>
				{typeof report.issue === "string" && <p><a href={report.issue} target="_blank" rel="noreferrer">GitHub issue ↗</a></p>}
				{hasScreenshot
					// eslint-disable-next-line @next/next/no-img-element -- the saved screenshot, served as-is
					? <a href={`/api/bugs/${id}/screenshot`} target="_blank" rel="noreferrer"><img src={`/api/bugs/${id}/screenshot`} alt="Screenshot of the screen when the report was made (keys and passwords hidden)" className="lh-report-shot" data-testid="report-shot" /></a>
					: <p className="lh-report-none">No screenshot.</p>}
				<p className="lh-report-dir">For an agent: <code>{dir}</code></p>
				{kind !== "change" && <details className="lh-report-details" open>
					<summary>Client log ({log?.length ?? 0})</summary>
					<pre>{(log ?? []).map(l => `${String(l.at).slice(11, 19)} ${l.kind.padEnd(5)} ${l.text}`).join("\n") || "–"}</pre>
				</details>}
				<details className="lh-report-details">
					<summary>Page and device</summary>
					<pre>{JSON.stringify(page, null, 2)}</pre>
				</details>
				{server && <details className="lh-report-details" data-testid="report-server">
					<summary>Server</summary>
					<pre>{JSON.stringify(server, null, 2)}</pre>
				</details>}
			</main>
		</div>
	);
}
