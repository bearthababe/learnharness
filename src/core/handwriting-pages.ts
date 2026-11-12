import { z } from "zod";
import { canonicalHandwriting, handwritingV2Schema, notebookPageIdSchema, normalizeHandwriting, reconcileHandwriting, HandwritingConflict, type Handwriting, type HandwritingV2 } from "./handwriting.ts";

const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const writingId = z.string().regex(/^writing_[A-Za-z0-9_-]+$/);
const from = z.discriminatedUnion("kind", [z.object({ kind: z.literal("working"), pageId: notebookPageIdSchema }).strict(), z.object({ kind: z.literal("snapshot"), writingId }).strict()]);
export const pageOriginSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("working") }).strict(),
	z.object({ kind: z.literal("recovered"), writingId }).strict(),
	z.object({ kind: z.literal("external"), writingId, seedHead: z.string(), seedFingerprint: fingerprint }).strict(),
	z.object({ kind: z.literal("duplicate"), from, seedFingerprint: fingerprint }).strict(),
	// Round 14 (T4): "Add page" starts an empty page of its own.
	z.object({ kind: z.literal("blank") }).strict(),
]);
export const pageSummarySchema = z.object({ id: notebookPageIdSchema, origin: pageOriginSchema, createdAt: z.iso.datetime().nullable() }).strict();
export const handwritingPageSchema = pageSummarySchema.extend({ version: z.literal(1), journal: handwritingV2Schema }).strict().superRefine((page, ctx) => {
	if (page.id !== page.journal.pageId || (page.id === "page_initial" ? page.origin.kind !== "working" || page.createdAt !== null : page.createdAt === null)) ctx.addIssue({ code: "custom", message: "Invalid page identity or metadata" });
	if (page.origin.kind === "external" && page.journal.events[page.origin.seedHead]?.kind !== "import-background") ctx.addIssue({ code: "custom", message: "Missing external seed" });
});
export const pageCreationSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), kind: z.enum(["duplicate", "recover", "external", "blank"]), seedFingerprint: fingerprint, from }).strict();
export type HandwritingPage = z.infer<typeof handwritingPageSchema>;
export type PageSummary = z.infer<typeof pageSummarySchema>;
export type PageCreation = z.infer<typeof pageCreationSchema>;
export const initialHandwritingPage = (journal: Handwriting): HandwritingPage => handwritingPageSchema.parse({ version: 1, id: "page_initial", origin: { kind: "working" }, createdAt: null, journal: normalizeHandwriting(journal) });
export function pageSummary({ id, origin, createdAt }: HandwritingPage): PageSummary { return { id, origin, createdAt }; }
export function reconcileHandwritingPage(current: HandwritingPage, incoming: HandwritingPage): HandwritingPage {
	if (canonicalHandwriting(pageSummary(current)) !== canonicalHandwriting(pageSummary(incoming))) throw new HandwritingConflict("Conflicting page metadata");
	return { ...current, journal: normalizeHandwriting(reconcileHandwriting(current.journal, incoming.journal)) };
}
/** An explicit create response may discover an existing original. Its immutable
 * descriptive metadata wins only after graph compatibility is established. */
export function adoptHandwritingPageMetadata(local: HandwritingPage, authoritative: HandwritingPage): HandwritingPage {
	return { ...authoritative, journal: normalizeHandwriting(reconcileHandwriting(local.journal, authoritative.journal)) };
}
export function validatePageCreation(page: HandwritingPage, creation: PageCreation) {
	const origin = page.origin;
	if (creation.kind === "recover") {
		if (creation.from.kind === "working") { if (creation.from.pageId !== page.id) throw new HandwritingConflict("Invalid local recovery identity"); }
		else if (page.id !== "page_initial" && (origin.kind !== "recovered" || origin.writingId !== creation.from.writingId)) throw new HandwritingConflict("Invalid recovery identity");
	} else if (creation.kind === "blank") {
		// A blank page names itself as its seed and starts with nothing on it.
		if (origin.kind !== "blank" || creation.from.kind !== "working" || creation.from.pageId !== page.id || page.journal.head !== null) throw new HandwritingConflict("Invalid blank page identity");
	} else if (origin.kind !== creation.kind || origin.seedFingerprint !== creation.seedFingerprint || (origin.kind === "duplicate" ? canonicalHandwriting(origin.from) !== canonicalHandwriting(creation.from) : creation.from.kind !== "snapshot" || origin.writingId !== creation.from.writingId)) throw new HandwritingConflict("Conflicting creation identity");
}
export function existingPageCreation(current: HandwritingPage, seed: HandwritingPage, creation: PageCreation): HandwritingPage {
	validatePageCreation(seed, creation);
	// Recovery returns a concurrent original intact so its caller can compare.
	if (creation.kind === "recover" || creation.kind === "external") return current;
	reconcileHandwritingPage(current, seed);
	return current;
}
/** Select an immutable seed's complete closure for a delayed creation retry.
 * Later edits stay on the page, never replace this action's frozen seed. */
export function handwritingAtHead(journal: HandwritingV2, head: string | null): HandwritingV2 {
	const events: HandwritingV2["events"] = {}, backgrounds: HandwritingV2["backgrounds"] = {}, pending = head === null ? [] : [head];
	while (pending.length) {
		const id = pending.pop()!; if (events[id]) continue;
		const event = journal.events[id]; if (!event) throw new Error("Missing seed history");
		events[id] = event;
		if (event.parent !== null) pending.push(event.parent);
		if (event.kind === "restore" && event.sourceHead !== null) pending.push(event.sourceHead);
		if (event.kind === "import-background") backgrounds[event.backgroundId] = journal.backgrounds[event.backgroundId]!;
	}
	return handwritingV2Schema.parse({ ...journal, head, events, backgrounds });
}
export function orderedPages(pages: readonly PageSummary[]) { return [...pages].sort((a, b) => a.id === "page_initial" ? -1 : b.id === "page_initial" ? 1 : (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id)); }
