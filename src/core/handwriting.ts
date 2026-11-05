import { z } from "zod";

/** Browser-safe drawing values shared by editable rendering and format guards.
 * Display labels belong to the UI, not the persisted handwriting contract. */
export const HANDWRITING_PAGE = { width: 1400, height: 1800 } as const;
/** Shared byte-shape guard. Import/upload own decoding, canonical base64,
 * asset hashes and their error responses; this does not claim PNG decoding. */
export function isFullPageHandwritingPng(bytes: Uint8Array): boolean {
	if (bytes.length < 33 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => bytes[index] !== value)) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getUint32(8) === 13 && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" && view.getUint32(16) === HANDWRITING_PAGE.width && view.getUint32(20) === HANDWRITING_PAGE.height;
}
export const HANDWRITING_PEN_COLOURS = ["#171717", "#2563eb", "#dc2626", "#15803d"] as const;
export const HANDWRITING_HIGHLIGHT_COLOUR = "#facc15";
export const HANDWRITING_PEN_SCALES = [0.5, 1, 2] as const;
export const HANDWRITING_BROAD_WIDTHS = [19, 38, 76] as const;

/** Editable handwriting is separate from submitted images and the equation
 * notebook. An append-only action journal stores each stroke exactly once,
 * including strokes hidden by Clear/Undo. No persisted page-per-undo snapshots. */
const point = z.object({
	x: z.number().min(0).max(HANDWRITING_PAGE.width), y: z.number().min(0).max(HANDWRITING_PAGE.height), pressure: z.number().min(0).max(1),
}).strict();
const stroke = z.object({
	tool: z.enum(["pen", "highlighter", "eraser"]),
	colour: z.enum([...HANDWRITING_PEN_COLOURS, HANDWRITING_HIGHLIGHT_COLOUR]),
	penScale: z.union([z.literal(HANDWRITING_PEN_SCALES[0]), z.literal(HANDWRITING_PEN_SCALES[1]), z.literal(HANDWRITING_PEN_SCALES[2])]),
	width: z.union([z.literal(HANDWRITING_BROAD_WIDTHS[0]), z.literal(HANDWRITING_BROAD_WIDTHS[1]), z.literal(HANDWRITING_BROAD_WIDTHS[2])]),
	points: z.array(point).min(1),
}).strict();
const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const operation = z.discriminatedUnion("kind", [
	z.object({ id, kind: z.literal("stroke"), stroke }).strict(),
	z.object({ id, kind: z.literal("clear") }).strict(),
	z.object({ id, kind: z.literal("undo") }).strict(),
]);
const handwritingV1Schema = z.object({ version: z.literal(1), operations: z.array(operation) }).strict()
	.refine((value) => new Set(value.operations.map((op) => op.id)).size === value.operations.length, "Duplicate action identity");
export type HandwritingV1 = z.infer<typeof handwritingV1Schema>;
export const notebookPageIdSchema = z.string().regex(/^page_(?:initial|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
export type NotebookPageId = z.infer<typeof notebookPageIdSchema>;
const common = { id, parent: id.nullable() };
const historyEvent = z.discriminatedUnion("kind", [
	z.object({ ...common, kind: z.literal("stroke"), stroke }).strict(),
	z.object({ ...common, kind: z.literal("clear") }).strict(),
	z.object({ ...common, kind: z.literal("undo") }).strict(),
	z.object({ ...common, kind: z.literal("redo") }).strict(),
	z.object({ ...common, kind: z.literal("import-background"), backgroundId: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
	z.object({ ...common, kind: z.literal("restore"), sourceHead: id.nullable() }).strict(),
]);
const backgroundPixelsSchema = z.object({ mediaType: z.literal("image/png"), width: z.literal(1400), height: z.literal(1800), data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(data => data.length % 4 === 0, "Invalid base64 length") }).strict();
export type BackgroundPixels = z.infer<typeof backgroundPixelsSchema>;
export type HistoryEvent = z.infer<typeof historyEvent>;
const graphSchema = z.object({ version: z.literal(2), pageId: notebookPageIdSchema, head: id.nullable(), events: z.record(id, historyEvent), backgrounds: z.record(z.string().regex(/^[0-9a-f]{64}$/), backgroundPixelsSchema) }).strict();
export type HandwritingV2 = z.infer<typeof graphSchema>;

/** Iterative postorder visits each record once, including restore edges. Reject
 * unreachable records too: source packages are precisely their head closure. */
function historyOrder(graph: HandwritingV2): HistoryEvent[] {
	const visiting = new Set<string>(), done = new Set<string>(), assets = new Set<string>(), order: HistoryEvent[] = [];
	const stack: { id: string; exit: boolean }[] = graph.head === null ? [] : [{ id: graph.head, exit: false }];
	while (stack.length) {
		const item = stack.pop()!;
		if (done.has(item.id)) continue;
		const event = graph.events[item.id];
		if (!event || event.id !== item.id) throw new Error("Missing or conflicting event identity");
		if (item.exit) { visiting.delete(item.id); done.add(item.id); order.push(event); continue; }
		if (visiting.has(item.id)) throw new Error("Cyclic handwriting history");
		visiting.add(item.id); stack.push({ id: item.id, exit: true });
		if (event.kind === "import-background") {
			if (!graph.backgrounds[event.backgroundId]) throw new Error("Missing background");
			assets.add(event.backgroundId);
		}
		if (event.kind === "restore" && event.sourceHead !== null) stack.push({ id: event.sourceHead, exit: false });
		if (event.parent !== null) stack.push({ id: event.parent, exit: false });
	}
	if (done.size !== Object.keys(graph.events).length || assets.size !== Object.keys(graph.backgrounds).length) throw new Error("Unreachable handwriting records");
	return order;
}
export const handwritingV2Schema = graphSchema.superRefine((graph, context) => {
	try { replayGraph(graph); } catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid history" }); }
});
export const handwritingSchema = z.union([handwritingV1Schema, handwritingV2Schema]);
export type Handwriting = z.infer<typeof handwritingSchema>;
export type HandwritingStroke = z.infer<typeof stroke>;
export type HandwritingOperation = HistoryEvent extends infer Event ? Event extends HistoryEvent ? Omit<Event, "parent"> : never : never;
export const emptyHandwriting = (): Handwriting => ({ version: 1, operations: [] });

export function normalizeHandwriting(working: Handwriting): HandwritingV2 {
	if (working.version === 2) return working;
	const events: HandwritingV2["events"] = {};
	let head: string | null = null;
	for (const op of working.operations) { events[op.id] = { ...op, parent: head }; head = op.id; }
	return { version: 2, pageId: "page_initial", head, events, backgrounds: {} };
}

/** Canonical structural bytes, independent of object insertion/key order. */
export function canonicalHandwriting(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalHandwriting).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalHandwriting(entry)}`).join(",")}}`;
	return JSON.stringify(value);
}
function compatibleRecords(a: HandwritingV2, b: HandwritingV2): boolean {
	return (["events", "backgrounds"] as const).every(table => Object.entries(a[table]).every(([key, value]) => !Object.hasOwn(b[table], key) || canonicalHandwriting(value) === canonicalHandwriting(b[table][key])));
}

/** Full causal prefix + stable action identities are the version check. The
 * server can recognize an arbitrarily delayed retry without a receipt window. */
export function handwritingPrefix(prefix: Handwriting, journal: Handwriting): boolean {
	const a = normalizeHandwriting(prefix), b = normalizeHandwriting(journal);
	if (a.pageId !== b.pageId || !compatibleRecords(a, b)) return false;
	let head = b.head;
	const seen = new Set<string>();
	while (head !== a.head && head !== null) {
		if (seen.has(head) || !b.events[head]) return false;
		seen.add(head); head = b.events[head]!.parent;
	}
	return head === a.head;
}
export class HandwritingConflict extends Error {}

/** Reconcile causal journals without truncating or choosing between divergent
 * histories. Adapters call this pure policy inside their synchronous boundary. */
export function reconcileHandwriting(current: Handwriting, incoming: Handwriting): Handwriting {
	if (handwritingPrefix(incoming, current)) return current;
	if (handwritingPrefix(current, incoming)) return incoming;
	throw new HandwritingConflict("Divergent handwriting history");
}

type Ink = { stroke: HandwritingStroke; previous: Ink | null };
type Drawing = { ink: Ink | null; background: BackgroundPixels | null };
type Frame = { before: Drawing; after: Drawing };
type Stack = { frame: Frame; previous: Stack | null };
type HistoryState = { drawing: Drawing; undo: Stack | null; redo: Stack | null };
function replayGraph(graph: HandwritingV2): HistoryState {
	const blank: HistoryState = { drawing: { ink: null, background: null }, undo: null, redo: null };
	const states = new Map<string, HistoryState>();
	for (const event of historyOrder(graph)) {
		const previous = event.parent === null ? blank : states.get(event.parent)!;
		let next: HistoryState;
		if (event.kind === "undo") next = previous.undo ? { drawing: previous.undo.frame.before, undo: previous.undo.previous, redo: { frame: previous.undo.frame, previous: previous.redo } } : previous;
		else if (event.kind === "redo") next = previous.redo ? { drawing: previous.redo.frame.after, redo: previous.redo.previous, undo: { frame: previous.redo.frame, previous: previous.undo } } : previous;
		else {
			let drawing: Drawing;
			if (event.kind === "stroke") drawing = { ...previous.drawing, ink: { stroke: event.stroke, previous: previous.drawing.ink } };
			else if (event.kind === "clear") drawing = blank.drawing;
			else if (event.kind === "restore") drawing = event.sourceHead === null ? blank.drawing : states.get(event.sourceHead)!.drawing;
			else {
				if (previous.drawing.ink || previous.drawing.background) throw new Error("Import requires empty working");
				drawing = { ink: null, background: graph.backgrounds[event.backgroundId]! };
			}
			next = { drawing, undo: { frame: { before: previous.drawing, after: drawing }, previous: previous.undo }, redo: null };
		}
		states.set(event.id, next);
	}
	return graph.head === null ? blank : states.get(graph.head)!;
}
export function replayHandwriting(working: Handwriting): { strokes: HandwritingStroke[]; background: BackgroundPixels | null; canUndo: boolean; canRedo: boolean } {
	const state = replayGraph(normalizeHandwriting(working)), strokes: HandwritingStroke[] = [];
	for (let item = state.drawing.ink; item; item = item.previous) strokes.push(item.stroke);
	return { strokes: strokes.reverse(), background: state.drawing.background, canUndo: state.undo !== null, canRedo: state.redo !== null };
}
export function appendHandwriting(working: Handwriting, operation: HandwritingOperation): HandwritingV2 {
	const graph = normalizeHandwriting(working);
	if (Object.hasOwn(graph.events, operation.id)) throw new HandwritingConflict("Action identity already exists");
	return handwritingV2Schema.parse({ ...graph, head: operation.id, events: { ...graph.events, [operation.id]: { ...operation, parent: graph.head } } });
}
export function restoreHandwriting(working: Handwriting, source: Handwriting, eventId: string): HandwritingV2 {
	const destination = normalizeHandwriting(handwritingSchema.parse(working)), captured = normalizeHandwriting(handwritingSchema.parse(source));
	if (!compatibleRecords(destination, captured)) throw new HandwritingConflict("Conflicting source history");
	return appendHandwriting({ ...destination, events: { ...destination.events, ...captured.events }, backgrounds: { ...destination.backgrounds, ...captured.backgrounds } }, { id: eventId, kind: "restore", sourceHead: captured.head });
}
export const notebookSourceSchema = z.object({ version: z.literal(1), page: z.object({ width: z.literal(1400), height: z.literal(1800) }).strict(), journal: handwritingV2Schema }).strict();
export type NotebookSource = z.infer<typeof notebookSourceSchema>;
export function notebookSource(working: Handwriting): NotebookSource { return { version: 1, page: HANDWRITING_PAGE, journal: normalizeHandwriting(handwritingSchema.parse(working)) }; }
export function handwritingContent(working: Handwriting): string {
	const { strokes, background } = replayHandwriting(working);
	return canonicalHandwriting({ strokes, background });
}
export async function handwritingSha256(bytes: Uint8Array): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
	return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function handwritingFingerprints(source: NotebookSource): Promise<{ sourceFingerprint: string; contentFingerprint: string }> {
	const encode = (value: string) => new TextEncoder().encode(value);
	const [sourceFingerprint, contentFingerprint] = await Promise.all([handwritingSha256(encode(canonicalHandwriting(source))), handwritingSha256(encode(handwritingContent(source.journal)))]);
	return { sourceFingerprint, contentFingerprint };
}
export function copyHandwriting(working: Handwriting, pageId: NotebookPageId): HandwritingV2 {
	return handwritingV2Schema.parse({ ...normalizeHandwriting(working), pageId });
}
export async function importHandwritingBackground(working: Handwriting, background: BackgroundPixels, eventId: string): Promise<HandwritingV2> {
	const graph = normalizeHandwriting(handwritingSchema.parse(working));
	const pixels = backgroundPixelsSchema.parse(background), raw = atob(pixels.data);
	const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
	if (btoa(raw) !== pixels.data || !isFullPageHandwritingPng(bytes)) throw new Error("Invalid background PNG");
	const backgroundId = await handwritingSha256(bytes);
	return appendHandwriting({ ...graph, backgrounds: { ...graph.backgrounds, [backgroundId]: pixels } }, { id: eventId, kind: "import-background", backgroundId });
}
