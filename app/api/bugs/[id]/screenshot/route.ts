import { readScreenshot, saveScreenshot } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
	const shot = readScreenshot((await ctx.params).id);
	return shot ? new Response(new Uint8Array(shot.bytes), { headers: { "Content-Type": shot.type, "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 });
}

/** The masked screenshot arrives after the report, so the report exists at once. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
	const ok = saveScreenshot((await ctx.params).id, new Uint8Array(await req.arrayBuffer()), req.headers.get("content-type") ?? "image/jpeg");
	return ok ? new Response(null, { status: 204 }) : new Response("Not found", { status: 404 });
}
