import { ChatInputError, type TurnInput } from "../core/input-events.ts";
import { emit } from "../core/events.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { submittedWritingIds, type SharedWritingReference } from "../core/shared-writing.ts";
import { stores } from "./stores.ts";

/** Same file-size ceiling as the inherited PDF reader. Stream before
 * buffering so a Shortcut's raw-file upload is bounded too. */
export const MAX_WRITING_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function resolveSharedWriting(chatId: string, input: TurnInput, messages: readonly LhMessage[]): SharedWritingReference[] {
	if (!("writingIds" in input) || !input.writingIds?.length) return [];
	const sent = submittedWritingIds(messages);
	const available = new Map(stores.sharedWritingStore.list(chatId).map((w) => [w.id, w]));
	return input.writingIds.map((id) => {
		const item = available.get(id);
		if (!item || sent.has(id)) throw new ChatInputError("Shared writing is missing or was already submitted. Refresh the session before sending.");
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
		const sent = submittedWritingIds(chat.messages);
		return Response.json({ pending: stores.sharedWritingStore.list(chatId).filter((w) => !sent.has(w.id)) }, { headers: { "Cache-Control": "no-store" } });
	}
	if (request.method !== "POST" || imageId) return new Response(null, { status: 405 });
	const reader = request.body?.getReader();
	if (!reader) return Response.json({ error: "Share a PNG file as the request body" }, { status: 400 });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_WRITING_BYTES) {
				await reader.cancel();
				return Response.json({ error: "PNG must be 25 MiB or smaller" }, { status: 413 });
			}
			chunks.push(value);
		}
	} catch { return Response.json({ error: "Upload interrupted; share the PNG again" }, { status: 400 }); }
	const bytes = Buffer.concat(chunks);
	if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b) || bytes.toString("ascii", 12, 16) !== "IHDR") {
		return Response.json({ error: "This trial accepts PNG images. Export as PNG in Concepts." }, { status: 415 });
	}
	// Upload never creates a chat or starts a model turn. Recheck after IO.
	if (!stores.chatStore.getChat(chatId)) return Response.json({ error: "Unknown chat" }, { status: 404 });
	const writing = stores.sharedWritingStore.put(chatId, bytes);
	emit("writing-changed", { chatId });
	return Response.json({ ok: true, writing, message: "Writing received. Review it in LearnHarness before sending.", sessionPath: `/chat/${chatId}` }, { status: 201 });
}
