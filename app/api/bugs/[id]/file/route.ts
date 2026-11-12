import { getReport, fileReport, reportsRepo } from "@/src/server";

export const dynamic = "force-dynamic";

/** The dialog was left: file the report as a GitHub issue — only when LH_REPORTS_REPO is set. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
	const id = (await ctx.params).id;
	if (!getReport(id)) return new Response("Not found", { status: 404 });
	if (reportsRepo()) void fileReport(id).catch(error => console.error("[bugs] filing failed", id, error instanceof Error ? error.message : error));
	return new Response(null, { status: 204 });
}
