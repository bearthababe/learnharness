import { HandwritingConflict, handwritingSchema, notebookPageIdSchema, canonicalHandwriting, copyHandwriting, handwritingFingerprints, handwritingSha256, notebookSource, isFullPageHandwritingPng } from "../core/handwriting.ts";
import { handwritingPageSchema, pageCreationSchema, validatePageCreation, type HandwritingPage, type PageCreation } from "../core/handwriting-pages.ts";
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

async function validateAssets(page: HandwritingPage) {
	for (const [id, asset] of Object.entries(page.journal.backgrounds)) {
		const bytes = Buffer.from(asset.data, "base64");
		if (bytes.toString("base64") !== asset.data || !isFullPageHandwritingPng(bytes) || await handwritingSha256(bytes) !== id) throw new Error("Invalid background");
	}
}
/** Read-only source preparation and ordinary causal saves share the working
 * store. No Open/Restore endpoint and no network gate on device acceptance. */
export async function handwritingPagesResponse(request: Request, chatId: string, pageId?: string): Promise<Response> {
	const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
	const missing = () => json({ code: "not_found", error: "This session is unavailable. Your device recovery has been kept." }, 404);
	if (!/^[A-Za-z0-9_-]+$/.test(chatId) || !stores.chatStore.getChat(chatId)) return missing();
	if (pageId !== undefined && !notebookPageIdSchema.safeParse(pageId).success) return json({ code: "invalid" }, 400);
	if (!(request.method === "GET" || (pageId ? request.method === "PUT" : request.method === "POST"))) return new Response(null, { status: 405 });
	let page: HandwritingPage | undefined, creation: PageCreation | undefined;
	if (request.method !== "GET") {
		try {
			const body = await request.json();
			page = handwritingPageSchema.parse(request.method === "POST" ? body.page : body);
			if (pageId && page.id !== pageId) throw new Error("Wrong page");
			await validateAssets(page);
			if (request.method === "POST") {
				creation = pageCreationSchema.parse(body.creation); validatePageCreation(page, creation);
				if (creation.from.kind === "working") {
					if (creation.kind === "external" || (creation.kind === "duplicate" ? creation.from.pageId === page.id : creation.from.pageId !== page.id)) throw new Error("Invalid working seed");
					const source = notebookSource(page.journal);
					if ((await handwritingFingerprints(source)).sourceFingerprint !== creation.seedFingerprint) throw new Error("Wrong seed");
				}
			}
		} catch { return json({ code: "invalid", error: "Unsupported or invalid handwriting page" }, 400); }
	}
	// No await from authoritative session/source reads through synchronous commit.
	if (!stores.chatStore.getChat(chatId)) return missing();
	try {
		if (creation?.from.kind === "snapshot" && page) {
			const source = stores.sharedWritingStore.readSource(chatId, creation.from.writingId);
			if (source) {
				if (creation.kind === "external" || (creation.kind === "recover" && source.journal.pageId !== page.id) || canonicalHandwriting(copyHandwriting(source.journal, page.id)) !== canonicalHandwriting(page.journal)) return json({ code: "invalid", error: "Snapshot seed differs" }, 400);
				// Synchronous hash at the source read/commit boundary, same canonical bytes.
				if (createHash("sha256").update(canonicalHandwriting(notebookSource(page.journal))).digest("hex") !== creation.seedFingerprint) return json({ code: "invalid" }, 400);
			} else {
				const events = Object.values(page.journal.events);
				if (creation.kind === "recover" || events.length !== 1 || events[0]?.kind !== "import-background" || events[0].parent !== null || page.journal.head !== events[0].id) return json({ code: "invalid", error: "Invalid flattened seed" }, 400);
				stores.sharedWritingStore.read(chatId, creation.from.writingId);
				if (createHash("sha256").update(canonicalHandwriting(notebookSource(page.journal))).digest("hex") !== creation.seedFingerprint) return json({ code: "invalid" }, 400);
			}
		}
		if (creation && page) { const result = stores.handwritingStore.createPageIfAbsent(chatId, page, creation); return json(result, result.existing ? 200 : 201); }
		if (!pageId) return json({ pages: stores.handwritingStore.listPages(chatId) });
		const current = stores.handwritingStore.readPage(chatId, pageId);
		if (!current && (!page || pageId !== "page_initial")) return json({ code: "page_not_found" }, 404);
		return json(page ? stores.handwritingStore.savePage(chatId, page) : current);
	} catch (error) {
		if (error instanceof HandwritingConflict) return json({ code: "conflict", error: "Handwriting histories differ; both copies retained" }, 409);
		return json({ code: "unavailable", error: "Could not read or save handwriting pages" }, 503);
	}
}
import { createHash } from "node:crypto";
