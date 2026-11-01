import { z } from "zod";
import type { LearnerExplanation, TutorDraftOwner } from "./contracts/notebook.ts";

const id = z.string().min(1);
export const tutorDraftOwnerSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("ordinary") }).strict(),
	z.object({ kind: z.literal("question"), toolCallId: id, channel: z.enum(["text", "thinking", "reading-thinking"]) }).strict(),
	z.object({ kind: z.literal("practice"), problemCallId: id }).strict(),
]);
export const learnerExplanationSchema = z.array(z.discriminatedUnion("kind", [
	z.object({ id, kind: z.literal("text"), text: z.string() }).strict(),
	z.object({ id, kind: z.literal("working"), snapshotId: id, contextId: id, revision: z.number().int().nonnegative(), lines: z.array(z.object({ id, latex: z.string() }).strict()) }).strict(),
])).refine((parts) => new Set(parts.map((part) => part.id)).size === parts.length, "Part identities must be unique");
export const ownedTutorDraftSchema = z.object({ id, owner: tutorDraftOwnerSchema, revision: z.number().int().nonnegative(), parts: learnerExplanationSchema }).strict();
export const notebookSubmissionSchema = z.object({ id, draftId: id, draftRevision: z.number().int().nonnegative(), owner: tutorDraftOwnerSchema }).strict();
/** Both fields travel together; text-only callers keep the original contract. */
export function parseNotebookInput(input: Record<string, unknown>) {
	if (input.explanation === undefined && input.submission === undefined) return {};
	const explanation = learnerExplanationSchema.parse(input.explanation);
	const submission = notebookSubmissionSchema.parse(input.submission);
	if (!explanationHasContent(explanation)) throw new Error("Enter an explanation or notebook working");
	if (submission.owner.kind !== "ordinary") throw new Error("Ordinary input requires an ordinary draft");
	return { explanation, submission };
}
export function sameDraftOwner(a: TutorDraftOwner, b: TutorDraftOwner): boolean {
	return a.kind === b.kind && (a.kind === "ordinary" || (a.kind === "question" && b.kind === "question" && a.toolCallId === b.toolCallId && a.channel === b.channel) || (a.kind === "practice" && b.kind === "practice" && a.problemCallId === b.problemCallId));
}
export const NOTEBOOK_ASSISTANCE = "This working was edited with assistance; it is not by itself evidence of independent reasoning.";
export function serializeLearnerExplanation(parts: LearnerExplanation): string {
	return parts.map((part) => part.kind === "text" ? part.text : `Notebook-assisted working\n${NOTEBOOK_ASSISTANCE}\n${part.lines.map((line, index) => `${index + 1}. ${line.latex}`).join("\n")}`).filter(Boolean).join("\n\n");
}
export function explanationHasContent(parts: LearnerExplanation): boolean {
	return parts.some((part) => part.kind === "text" ? !!part.text.trim() : part.lines.length > 0);
}
export function sameLearnerExplanation(a: LearnerExplanation, b: LearnerExplanation): boolean {
	return JSON.stringify(learnerExplanationSchema.parse(a)) === JSON.stringify(learnerExplanationSchema.parse(b));
}
