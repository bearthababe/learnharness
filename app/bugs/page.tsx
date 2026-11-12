import Link from "next/link";
import { listReports, reportsRepo } from "@/src/server";
import { ReportsBar } from "@/components/reports-ui";

export const dynamic = "force-dynamic";

/** Round 19 (§0): the 🐞 reports saved on this instance — Bugs and Changes in two tabs. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
	const { kind: requested } = await searchParams;
	const kind = requested === "change" ? "change" : "bug";
	const all = listReports();
	const shown = all.filter(r => r.kind === kind);
	const count = (k: "bug" | "change") => all.filter(r => r.kind === k).length;
	const filedTo = reportsRepo();
	return (
		<div className="lh-reports-page" data-testid="reports-page">
			<ReportsBar />
			<main className="lh-reports-main">
				<h1>Problem reports</h1>
				<p className="lh-reports-intro">Captured with 🐞 Report a problem (in ⋯). Each keeps a screenshot (keys and passwords hidden) and what the app knew at that moment. {filedTo ? `They are kept on this computer and filed as GitHub issues in ${filedTo}.` : "They stay on this computer."}</p>
				<div className="lh-reports-tabs" role="tablist" aria-label="Kind of report">
					<Link role="tab" aria-selected={kind === "bug"} href="/bugs" data-testid="reports-tab-bug">🐞 Bugs <span>{count("bug")}</span></Link>
					<Link role="tab" aria-selected={kind === "change"} href="/bugs?kind=change" data-testid="reports-tab-change">💡 Changes <span>{count("change")}</span></Link>
				</div>
				<ul className="lh-reports-list" data-testid="reports-list">
					{shown.length === 0 && <li className="lh-reports-empty">No {kind === "change" ? "changes" : "bugs"} reported yet.</li>}
					{shown.map(r => (
						<li key={r.id}>
							<Link href={`/bugs/${r.id}`} data-testid="report-row" data-report-id={r.id}>
								<span className="lh-report-note">{r.note || r.path}</span>
								<span className="lh-report-meta">{new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}{r.note ? ` · ${r.path}` : ""}{r.hasScreenshot ? " · screenshot" : ""}</span>
							</Link>
						</li>
					))}
				</ul>
			</main>
		</div>
	);
}
