import type { LhMessage } from "./native-messages.ts";
import { z } from "zod";
import { type NotebookSource } from "./handwriting.ts";

/** B2 (round 18): an attachment's slot is the whole page (its page id) or one
 * area of it (the page id + "~area_" + 8 hex). Each slot has its own pending
 * head, so areas add up beside the page; the page's own slot keeps versioning
 * (a newer snapshot of the whole page replaces the older one, and says so). */
export const notebookSlotIdSchema = z.string().regex(/^page_(?:initial|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:~area_[0-9a-f]{8})?$/);
/** The page an attachment slot belongs to. */
export const slotPage = (slot: string): string => slot.split("~")[0]!;
export const isAreaSlot = (slot: string): boolean => slot.includes("~area_");

/** Original PNGs shared into a session. Submission is derived from the
 * session record, so a failed send cannot consume pending work. */
export interface SharedWriting {
	id: string;
	createdAt: string;
	editableSource?: { version: 1 };
	notebook?: { pageId: string; pageRevision: number; contentFingerprint: string };
}

const writingId = z.string().regex(/^writing_[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive();
export const writingIndexSchema = z.object({
	version: z.literal(1),
	pages: z.record(notebookSlotIdSchema, z.object({ revision, writingId }).strict()),
	committed: z.record(writingId, z.object({ pageId: notebookSlotIdSchema, pageRevision: revision }).strict()),
}).strict().superRefine((index, context) => {
	for (const [pageId, head] of Object.entries(index.pages)) {
		const receipt = index.committed[head.writingId];
		if (!receipt || receipt.pageId !== pageId || receipt.pageRevision !== head.revision) context.addIssue({ code: "custom", message: "Missing page-head receipt" });
	}
	const revisions = new Set<string>();
	for (const receipt of Object.values(index.committed)) {
		const key = `${receipt.pageId}:${receipt.pageRevision}`;
		if (!index.pages[receipt.pageId] || index.pages[receipt.pageId]!.revision < receipt.pageRevision || revisions.has(key)) context.addIssue({ code: "custom", message: "Invalid commit receipt" });
		revisions.add(key);
	}
});
export type WritingIndex = z.infer<typeof writingIndexSchema>;
export const emptyWritingIndex = (): WritingIndex => ({ version: 1, pages: {}, committed: {} });
export type NotebookCapture = { writingId: string; pageId: string; expectedPageRevision: number; image: Uint8Array; source: NotebookSource };
/** `dismissed`: snapshots the learner removed from their next message. The
 *  image and the editable page stay; they are only no longer pending. */
export type WritingSnapshot = { writing: SharedWriting[]; index: WritingIndex; dismissed?: readonly string[] };
export type NotebookCaptureReceipt = { writing: SharedWriting; committed: boolean; currentPageRevision: number };
export type PageAttachments = Record<string, { revision: number; writingId: string; contentFingerprint: string }>;
export class CaptureConflict extends Error {
	constructor(public code: "capture_conflict" | "page_changed", public currentPageRevision?: number) {
		super(code === "capture_conflict" ? "This snapshot identity already belongs to different working." : "A newer snapshot of this page is already attached.");
	}
}
/** Publication policy runs inside the adapter's single synchronous boundary. */
export function commitNotebookCapture(index: WritingIndex, capture: Pick<NotebookCapture, "writingId" | "pageId" | "expectedPageRevision">): WritingIndex {
	if (index.committed[capture.writingId]) return index;
	const current = index.pages[capture.pageId]?.revision ?? 0;
	if (current !== capture.expectedPageRevision) throw new CaptureConflict("page_changed", current);
	return { version: 1, pages: { ...index.pages, [capture.pageId]: { revision: current + 1, writingId: capture.writingId } }, committed: { ...index.committed, [capture.writingId]: { pageId: capture.pageId, pageRevision: current + 1 } } };
}
export function pendingSharedWriting(snapshot: WritingSnapshot, messages: readonly LhMessage[]): SharedWriting[] {
	const sent = submittedWritingIds(messages);
	const dismissed = new Set(snapshot.dismissed ?? []);
	return snapshot.writing.filter(writing => !sent.has(writing.id) && !dismissed.has(writing.id) && (!writing.notebook || snapshot.index.pages[writing.notebook.pageId]?.writingId === writing.id));
}
export function pageAttachments(snapshot: WritingSnapshot): PageAttachments {
	const byId = new Map(snapshot.writing.map(writing => [writing.id, writing]));
	const dismissed = new Set(snapshot.dismissed ?? []);
	return Object.fromEntries(Object.entries(snapshot.index.pages).map(([pageId, head]) => {
		const writing = byId.get(head.writingId);
		if (!writing?.notebook) throw new Error("Missing committed snapshot");
		// A removed attachment never reads as "already attached": attaching the
		// same page again makes a fresh snapshot at the next revision.
		return [pageId, { ...head, contentFingerprint: dismissed.has(head.writingId) ? "dismissed" : writing.notebook.contentFingerprint }];
	}));
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
