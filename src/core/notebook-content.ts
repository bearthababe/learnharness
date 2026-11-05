import { z } from "zod";
import type { LearnerExplanation, TutorDraftOwner, WorkingSnapshot } from "./contracts/notebook.ts";
import type { QuestionAnswerData } from "./question-core.ts";

const id = z.string().min(1);
export function snapshotPart(snapshot: WorkingSnapshot): Extract<LearnerExplanation[number], { kind: "working" }> {
	return { id: snapshot.id, kind: "working", snapshotId: snapshot.id, contextId: snapshot.contextId, revision: snapshot.revision, lines: structuredClone(snapshot.lines),
		...(snapshot.status === "pending" ? { pending: true } : {}), ...(snapshot.failure ? { failure: snapshot.failure } : {}) };
}
export function hasNotebookAnswer(value: unknown): value is QuestionAnswerData {
	return !!value && typeof value === "object" && ["textContent", "thinkingContent", "readingThinkingContent"].some(key => Array.isArray((value as Record<string, unknown>)[key]));
}
export const tutorDraftOwnerSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("ordinary") }).strict(),
	z.object({ kind: z.literal("question"), toolCallId: id, channel: z.enum(["text", "thinking", "reading-thinking"]) }).strict(),
	z.object({ kind: z.literal("practice"), problemCallId: id }).strict(),
]);
const textPartSchema = z.object({ id, kind: z.literal("text"), text: z.string() }).strict();
const workingPartSchema = z.object({ id, kind: z.literal("working"), snapshotId: id, contextId: id, revision: z.number().int().nonnegative(), lines: z.array(z.object({ id, latex: z.string() }).strict()), failure: z.string().optional() }).strict();
export const learnerExplanationSchema = z.array(z.discriminatedUnion("kind", [
	textPartSchema, workingPartSchema,
])).refine((parts) => new Set(parts.map((part) => part.id)).size === parts.length, "Part identities must be unique");
const draftExplanationSchema = z.array(z.discriminatedUnion("kind", [textPartSchema, workingPartSchema.extend({ pending: z.literal(true).optional() })]))
	.refine(parts => new Set(parts.map(part => part.id)).size === parts.length, "Part identities must be unique");
export const ownedTutorDraftSchema = z.object({ id, owner: tutorDraftOwnerSchema, revision: z.number().int().nonnegative(), parts: draftExplanationSchema, form: z.object({
	selection: z.object({ selected: z.array(z.number().int().nonnegative()), otherSelected: z.boolean(), dontKnow: z.boolean() }).strict(),
	thinking: z.string(), other: z.string(), text: z.string(), confidenceIndex: z.number().int().min(0).max(5),
}).strict().optional() }).strict();
const draftReferenceSchema = z.object({ draftId: id, draftRevision: z.number().int().nonnegative(), owner: tutorDraftOwnerSchema }).strict();
export const notebookSubmissionSchema = draftReferenceSchema.extend({ id, additionalDrafts: z.array(draftReferenceSchema).max(1).optional() }).strict();
export function questionChannelContent(answer: QuestionAnswerData, owner: TutorDraftOwner): LearnerExplanation {
	if (owner.kind !== "question") throw new Error("Question draft required");
	return (owner.channel === "text" ? answer.textContent : owner.channel === "thinking" ? answer.thinkingContent : answer.readingThinkingContent) ?? [];
}
export function parseNotebookAnswer(answer: QuestionAnswerData, raw: unknown, toolCallId: string) {
	const channels = [answer.textContent, answer.thinkingContent, answer.readingThinkingContent];
	if (raw === undefined && channels.every(part => part === undefined)) return {};
	const submission = notebookSubmissionSchema.parse(raw);
	const refs = [submission, ...(submission.additionalDrafts ?? [])];
	if (refs.some(ref => ref.owner.kind !== "question" || ref.owner.toolCallId !== toolCallId) || new Set(refs.map(ref => ref.owner.kind === "question" ? ref.owner.channel : "")).size !== refs.length) throw new Error("Answer requires its own question channels");
	for (const ref of refs) learnerExplanationSchema.parse(questionChannelContent(answer, ref.owner));
	for (const channel of ["text", "thinking", "reading-thinking"] as const) {
		const content = questionChannelContent(answer, { kind: "question", toolCallId, channel });
		if (content.length && !refs.some(ref => ref.owner.kind === "question" && ref.owner.channel === channel)) throw new Error("Answer content requires its saved draft");
	}
	return { submission };
}
/** Both fields travel together; text-only callers keep the original contract. */
export function parseNotebookInput(input: Record<string, unknown>, owner: TutorDraftOwner = { kind: "ordinary" }) {
	if (input.explanation === undefined && input.submission === undefined) return {};
	const explanation = learnerExplanationSchema.parse(input.explanation);
	const submission = notebookSubmissionSchema.parse(input.submission);
	if (submission.additionalDrafts?.length) throw new Error("Additional channels belong to a question answer");
	if (!explanationHasContent(explanation)) throw new Error("Enter an explanation or notebook working");
	if (!sameDraftOwner(submission.owner, owner)) throw new Error("Input requires its own draft");
	return { explanation, submission };
}
export function sameDraftOwner(a: TutorDraftOwner, b: TutorDraftOwner): boolean {
	return a.kind === b.kind && (a.kind === "ordinary" || (a.kind === "question" && b.kind === "question" && a.toolCallId === b.toolCallId && a.channel === b.channel) || (a.kind === "practice" && b.kind === "practice" && a.problemCallId === b.problemCallId));
}
export const NOTEBOOK_ASSISTANCE = "This working was edited with assistance; it is not by itself evidence of independent reasoning.";
export const NOTEBOOK_FAILURE = "Some notebook edits failed. Showing the last completed working.";
export function serializeLearnerExplanation(parts: LearnerExplanation): string {
	if (parts.some(part => part.kind === "working" && part.pending)) throw new Error("Notebook working is still pending");
	return parts.map((part) => part.kind === "text" ? part.text : `Notebook-assisted working\n${NOTEBOOK_ASSISTANCE}\n${part.failure ? `${part.failure}\n` : ""}${part.lines.map((line, index) => `${index + 1}. ${line.latex}`).join("\n")}`).filter(Boolean).join("\n\n");
}
export function explanationHasContent(parts: LearnerExplanation): boolean {
	return parts.some((part) => part.kind === "text" ? !!part.text.trim() : part.pending || part.lines.length > 0);
}
export function sameLearnerExplanation(a: LearnerExplanation, b: LearnerExplanation): boolean {
	return JSON.stringify(learnerExplanationSchema.parse(a)) === JSON.stringify(learnerExplanationSchema.parse(b));
}
