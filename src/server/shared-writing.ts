import { ChatInputError, type TurnInput } from "../core/input-events.ts";
import { emit } from "../core/events.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { CaptureConflict, pendingSharedWriting, pageAttachments, type SharedWritingReference } from "../core/shared-writing.ts";
import { notebookSourceSchema, handwritingSha256 } from "../core/handwriting.ts";
import { stores } from "./stores.ts";

/** Same file-size ceiling as the inherited PDF reader. Stream before
 * buffering so a Shortcut's raw-file upload is bounded too. */
export const MAX_WRITING_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function resolveSharedWriting(chatId: string, input: TurnInput, messages: readonly LhMessage[]): SharedWritingReference[] {
	if (!("writingIds" in input) || !input.writingIds?.length) return [];
	const available = new Map(pendingSharedWriting(stores.sharedWritingStore.readSnapshot(chatId), messages).map((w) => [w.id, w]));
	return input.writingIds.map((id) => {
		const item = available.get(id);
		if (!item) throw new ChatInputError("Shared writing is missing, superseded or was already submitted. Refresh the session before sending.");
		return { ...item, path: stores.sharedWritingStore.filePath(chatId, id) };
	});
}

export async function sharedWritingResponse(request: Request, chatId: string, imageId?: string): Promise<Response> {
	if (!/^[A-Za-z0-9_-]+$/.test(chatId)) return Response.json({ error: "Unknown chat" }, { status: 404 });
	const chat = stores.chatStore.getChat(chatId);
	if (!chat) return Response.json({ error: "Unknown chat" }, { status: 404 });
	if (request.method === "GET") {
		if (imageId) {
			try {
				const bytes = stores.sharedWritingStore.read(chatId, imageId);
				return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
			} catch { return Response.json({ error: "Image not found" }, { status: 404 }); }
		}
		try {
			const snapshot = stores.sharedWritingStore.readSnapshot(chatId);
			return Response.json({ pending: pendingSharedWriting(snapshot, chat.messages), pageAttachments: pageAttachments(snapshot) }, { headers: { "Cache-Control": "no-store" } });
		} catch { return captureError(503, "capture_unavailable", "Couldn’t read saved snapshots."); }
	}
	if (request.method !== "POST" || imageId) return new Response(null, { status: 405 });
	const multipart = request.headers.get("Content-Type")?.startsWith("multipart/form-data;") ?? false;
	const reader = request.body?.getReader();
	if (!reader) return Response.json({ error: "Share a PNG file as the request body" }, { status: 400 });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > (multipart ? 2 * MAX_WRITING_BYTES + 64 * 1024 : MAX_WRITING_BYTES)) {
				await reader.cancel();
				return captureError(413, "capture_too_large", "Image and source must each be 25 MiB or smaller.");
			}
			chunks.push(value);
		}
	} catch { return Response.json({ error: "Upload interrupted; share the PNG again" }, { status: 400 }); }
	const bytes = Buffer.concat(chunks);
	if (multipart) return uploadNotebook(request, chatId, bytes);
	if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b) || bytes.toString("ascii", 12, 16) !== "IHDR") {
		return Response.json({ error: "This trial accepts PNG images. Export as PNG in Concepts." }, { status: 415 });
	}
	// Upload never creates a chat or starts a model turn. Recheck after IO.
	if (!stores.chatStore.getChat(chatId)) return Response.json({ error: "Unknown chat" }, { status: 404 });
	const writing = stores.sharedWritingStore.put(chatId, bytes);
	emit("writing-changed", { chatId });
	return Response.json({ ok: true, writing, message: "Writing received. Review it in LearnHarness before sending.", sessionPath: `/chat/${chatId}` }, { status: 201 });
}

function captureError(status: number, code: string, error: string, extra = {}) { return Response.json({ code, error, ...extra }, { status }); }
function fullPagePng(bytes: Uint8Array): boolean {
	if (bytes.length < 33 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getUint32(8) === 13 && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" && view.getUint32(16) === 1400 && view.getUint32(20) === 1800;
}
async function uploadNotebook(request: Request, chatId: string, bytes: Uint8Array): Promise<Response> {
	let form: FormData;
	try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": request.headers.get("Content-Type")! } }).formData(); }
	catch { return captureError(400, "invalid_capture", "Invalid snapshot form."); }
	const keys = [...form.keys()].sort();
	if (keys.join(",") !== "expectedPageRevision,image,pageId,source,writingId") return captureError(400, "invalid_capture", "Invalid snapshot fields.");
	const image = form.get("image"), sourceFile = form.get("source"), writingId = form.get("writingId"), pageId = form.get("pageId"), expected = form.get("expectedPageRevision");
	if (!(image instanceof File) || !(sourceFile instanceof File) || typeof writingId !== "string" || !/^writing_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(writingId) || typeof pageId !== "string" || typeof expected !== "string" || !/^(0|[1-9][0-9]*)$/.test(expected) || !Number.isSafeInteger(Number(expected))) return captureError(400, "invalid_capture", "Invalid snapshot identity.");
	if (image.size > MAX_WRITING_BYTES || sourceFile.size > MAX_WRITING_BYTES) return captureError(413, "capture_too_large", "Image and source must each be 25 MiB or smaller.");
	const imageBytes = new Uint8Array(await image.arrayBuffer());
	if (image.type !== "image/png" || !fullPagePng(imageBytes)) return captureError(415, "unsupported_image", "Snapshot must be a 1400×1800 PNG.");
	let source;
	try {
		source = notebookSourceSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await sourceFile.arrayBuffer())));
		if (source.journal.pageId !== pageId) throw new Error("Page mismatch");
		for (const [id, background] of Object.entries(source.journal.backgrounds)) {
			const backgroundBytes = Buffer.from(background.data, "base64");
			if (backgroundBytes.toString("base64") !== background.data || !fullPagePng(backgroundBytes) || await handwritingSha256(backgroundBytes) !== id) throw new Error("Invalid background");
		}
	} catch { return captureError(400, "invalid_capture", "Invalid editable snapshot source."); }
	// No await through the authoritative session/index read and publication.
	const chat = stores.chatStore.getChat(chatId);
	if (!chat) return captureError(404, "not_found", "This session is unavailable.");
	try {
		const receipt = stores.sharedWritingStore.putNotebook(chatId, { writingId, pageId, expectedPageRevision: Number(expected), image: imageBytes, source });
		const pending = pendingSharedWriting(stores.sharedWritingStore.readSnapshot(chatId), chat.messages).some(writing => writing.id === writingId);
		if (receipt.committed) emit("writing-changed", { chatId });
		return Response.json({ ok: true, writing: receipt.writing, pending, currentPageRevision: receipt.currentPageRevision, message: "Snapshot attached. Review it before sending.", sessionPath: `/chat/${chatId}` }, { status: receipt.committed ? 201 : 200 });
	} catch (error) {
		if (error instanceof CaptureConflict) return captureError(409, error.code, error.message, error.currentPageRevision === undefined ? {} : { currentPageRevision: error.currentPageRevision });
		return captureError(503, "capture_unavailable", "Couldn’t save this snapshot. Retry the saved capture.");
	}
}

export function sharedWritingSourceResponse(chatId: string, imageId: string): Response {
	if (!/^[A-Za-z0-9_-]+$/.test(chatId) || !/^writing_[A-Za-z0-9_-]+$/.test(imageId) || !stores.chatStore.getChat(chatId)) return captureError(404, "not_found", "Snapshot not found.");
	try {
		const source = stores.sharedWritingStore.readSource(chatId, imageId);
		if (!source) return captureError(404, "no_editable_source", "This image has no editable source.");
		return Response.json(source, { headers: { "Cache-Control": "private, no-store" } });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return captureError(404, "not_found", "Snapshot not found.");
		return captureError(503, "source_unavailable", "Couldn’t load this snapshot’s editable source. The saved image is unchanged.");
	}
}
