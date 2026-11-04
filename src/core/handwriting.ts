import { z } from "zod";

/** Editable handwriting is separate from submitted images and the equation
 * notebook. An append-only action journal stores each stroke exactly once,
 * including strokes hidden by Clear/Undo. No persisted page-per-undo snapshots. */
const point = z.object({
	x: z.number().min(0).max(1400), y: z.number().min(0).max(1800), pressure: z.number().min(0).max(1),
}).strict();
const stroke = z.object({
	tool: z.enum(["pen", "highlighter", "eraser"]),
	colour: z.enum(["#171717", "#2563eb", "#dc2626", "#15803d", "#facc15"]),
	penScale: z.union([z.literal(0.5), z.literal(1), z.literal(2)]),
	width: z.union([z.literal(19), z.literal(38), z.literal(76)]),
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

/** Persistent linked page heads make replay/undo linear in journal size too. */
export function handwritingPage(working: Handwriting): HandwritingStroke[] {
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
	return strokes.reverse();
}
