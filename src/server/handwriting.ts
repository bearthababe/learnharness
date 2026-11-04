import { HandwritingConflict, handwritingSchema } from "../core/handwriting.ts";
import { stores } from "./stores.ts";

/** Quiet UI persistence: no model, session write, sidebar event or attachment. */
export async function handwritingResponse(request: Request, chatId: string): Promise<Response> {
	const missing = () => Response.json({ error: "Session no longer available", code: "not_found" }, { status: 404 });
	if (!/^[A-Za-z0-9_-]+$/.test(chatId) || !stores.chatStore.getChat(chatId)) return missing();
	if (request.method !== "GET" && request.method !== "PUT") return new Response(null, { status: 405 });
	let input;
	if (request.method === "PUT") {
		try { input = handwritingSchema.parse(await request.json()); }
		catch { return Response.json({ error: "Unsupported or invalid handwriting", code: "invalid" }, { status: 400 }); }
	}
	// Parsing yields. Existence check and synchronous storage must stay adjacent.
	if (!stores.chatStore.getChat(chatId)) return missing();
	try {
		const working = input ? stores.handwritingStore.save(chatId, input) : stores.handwritingStore.read(chatId);
		return Response.json(working, { headers: { "Cache-Control": "private, no-store" } });
	} catch (error) {
		if (error instanceof HandwritingConflict) return Response.json({ error: "Handwriting histories differ; both copies retained", code: "conflict" }, { status: 409 });
		return Response.json({ error: "Could not read or save handwriting", code: "unavailable" }, { status: 503 });
	}
}
