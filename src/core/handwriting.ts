import { z } from "zod";

/** Browser-safe drawing values shared by editable rendering and format guards.
 * Display labels belong to the UI, not the persisted handwriting contract. */
export const HANDWRITING_PAGE = { width: 1400, height: 1800 } as const;
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
export const handwritingSchema = z.object({ version: z.literal(1), operations: z.array(operation) }).strict()
	.refine((value) => new Set(value.operations.map((op) => op.id)).size === value.operations.length, "Duplicate action identity");
export type Handwriting = z.infer<typeof handwritingSchema>;
export type HandwritingStroke = z.infer<typeof stroke>;
export type HandwritingOperation = z.infer<typeof operation>;
export const emptyHandwriting = (): Handwriting => ({ version: 1, operations: [] });

/** Full causal prefix + stable action identities are the version check. The
 * server can recognize an arbitrarily delayed retry without a receipt window. */
export function handwritingPrefix(prefix: Handwriting, journal: Handwriting): boolean {
	return prefix.operations.length <= journal.operations.length && prefix.operations.every((op, i) => JSON.stringify(op) === JSON.stringify(journal.operations[i]));
}
export class HandwritingConflict extends Error {}

/** Reconcile causal journals without truncating or choosing between divergent
 * histories. Adapters call this pure policy inside their synchronous boundary. */
export function reconcileHandwriting(current: Handwriting, incoming: Handwriting): Handwriting {
	if (handwritingPrefix(incoming, current)) return current;
	if (handwritingPrefix(current, incoming)) return incoming;
	throw new HandwritingConflict("Divergent handwriting history");
}

/** Persistent linked page heads make replay/undo linear in journal size too. */
export function replayHandwriting(working: Handwriting): { strokes: HandwritingStroke[]; canUndo: boolean } {
	type Head = { stroke: HandwritingStroke; previous: Head | null };
	let head: Head | null = null;
	const undo: (Head | null)[] = [];
	for (const op of working.operations) {
		if (op.kind === "undo") { if (undo.length) head = undo.pop()!; }
		else {
			undo.push(head);
			head = op.kind === "clear" ? null : { stroke: op.stroke, previous: head };
		}
	}
	const strokes: HandwritingStroke[] = [];
	for (let item = head; item; item = item.previous) strokes.push(item.stroke);
	return { strokes: strokes.reverse(), canUndo: undo.length > 0 };
}
