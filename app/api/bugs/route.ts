import { createReport, listReports } from "@/src/server";

export const dynamic = "force-dynamic";

/** The saved 🐞 reports, newest first. */
export function GET() {
	return Response.json({ reports: listReports() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Save a report under the client's own id ({ id, report }). Idempotent, so a
 * retry after a lost response or a reload returns the same report; a
 * discarded id answers 410 and is never recreated.
 */
export async function POST(req: Request) {
	let body: { id?: unknown; report?: unknown };
	try { body = await req.json(); } catch { return new Response("Bad report", { status: 400 }); }
	const id = String(body.id ?? "");
	const page = body.report && typeof body.report === "object" ? body.report as Record<string, unknown> : {};
	const saved = createReport(id, page);
	if (saved === "discarded") return new Response("Discarded", { status: 410 });
	if (!saved) return new Response("Bad report id", { status: 400 });
	return Response.json({ id: saved.id, url: `/bugs/${saved.id}`, noteSeq: saved.noteSeq ?? 0 });
}
