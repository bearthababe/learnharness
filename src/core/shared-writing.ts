import type { LhMessage } from "./native-messages.ts";

/** Original PNGs shared into a session. Submission is derived from the
 * session record, so a failed send cannot consume pending work. */
export interface SharedWriting {
	id: string;
	createdAt: string;
}

export interface SharedWritingReference extends SharedWriting {
	/** Host path for the inherited read tool; never supplied by the client. */
	path: string;
}

export function submittedWritingIds(messages: readonly LhMessage[]): Set<string> {
	return new Set(messages.flatMap((m) => m.sharedWriting?.map((w) => w.id) ?? []));
}

export function sharedWritingImageUrl(chatId: string, id: string): string {
	return `/api/chats/${encodeURIComponent(chatId)}/writing/${encodeURIComponent(id)}`;
}

/** File references are application context, not invented learner speech. */
export function sharedWritingContext(writing: readonly SharedWritingReference[]): string {
	return `Shared handwritten working (PNG files):\n${writing.map((w) => w.path).join("\n")}`;
}
