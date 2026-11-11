import { deleteReport, getReport, updateReport, type ReportKind, closeFiledIssue } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
	const report = getReport((await ctx.params).id);
	if (!report) return new Response("Not found", { status: 404 });
	const { dir: _dir, ...shown } = report;
	void _dir;
	return Response.json(shown, { headers: { "Cache-Control": "no-store" } });
}

/** The note as it is typed (with its sequence number) and Bug or Change. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
	let body: { note?: unknown; kind?: unknown; seq?: unknown };
	try { body = await req.json(); } catch { return new Response("Bad edit", { status: 400 }); }
	const kind = body.kind === "bug" || body.kind === "change" ? body.kind as ReportKind : undefined;
	const saved = updateReport((await ctx.params).id, { ...(typeof body.note === "string" ? { note: body.note } : {}), ...(kind ? { kind } : {}), ...(typeof body.seq === "number" ? { seq: body.seq } : {}) });
	return saved ? Response.json({ noteSeq: saved.noteSeq ?? 0 }) : new Response("Not found", { status: 404 });
}

/** Discard: the report goes (a filed issue is closed, when filing is on). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
	const removed = deleteReport((await ctx.params).id);
	if (removed?.issue) await closeFiledIssue(removed.issue);
	return new Response(null, { status: 204 });
}
