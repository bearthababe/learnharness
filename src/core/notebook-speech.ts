import { z } from "zod";
import { tutorDraftOwnerSchema } from "./notebook-content.ts";

const id = z.string().min(1);
export const notebookSpeechTargetSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("notebook"), draftId: id }).strict(),
	z.object({ kind: z.literal("tutor"), owner: tutorDraftOwnerSchema, draftId: id, partId: id }).strict(),
]);
export const notebookSpeechRunSchema = z.object({
	id, revision: z.number().int().positive(), status: z.enum(["recording", "revealed", "interrupted", "cancelled"]), incomplete: z.boolean(),
	fragments: z.array(z.object({ id, start: z.number().finite().nonnegative().nullable(), end: z.number().finite().nonnegative().nullable(), text: z.string(), target: notebookSpeechTargetSchema.nullable() }).strict())
		.refine(parts => new Set(parts.map(part => part.id)).size === parts.length, "Speech fragment identities must be unique"),
	unplaced: z.array(id).optional(), discarded: z.array(id).optional(),
}).strict();
