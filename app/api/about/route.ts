import { listReports, reportsRepo } from "@/src/server";

export const dynamic = "force-dynamic";

/** Round 19 (L15, §0): what Settings → About this app shows — the build this
 *  instance runs (LH_BUILD_ID, set on previews and review instances) and how
 *  many 🐞 reports it holds, and where they are filed when filing is on. */
export function GET() {
	const reports = listReports();
	return Response.json({ buildId: process.env.LH_BUILD_ID || null, reports: { bugs: reports.filter(r => r.kind === "bug").length, changes: reports.filter(r => r.kind === "change").length }, reportsFiledTo: reportsRepo() }, { headers: { "Cache-Control": "no-store" } });
}
