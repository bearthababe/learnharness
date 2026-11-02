import type { ChatRecord } from "../core/contracts/chat.ts";
import type { NotebookInputFields } from "../core/input-events.ts";
import type { LhMessage } from "../core/native-messages.ts";
import type { ChatStore } from "../core/ports.ts";
import { sameDraftOwner, sameLearnerExplanation, questionChannelContent } from "../core/notebook-content.ts";
import type { QuestionAnswerData } from "../core/question-core.ts";
import { NotebookDraftConflict, verifyNotebookExplanation } from "./notebook-drafts.ts";

/** Reconcile logical submission before model gates and again after their awaits. */
type SubmissionInput = NotebookInputFields & { answer?: QuestionAnswerData };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const explanationOf = (input: SubmissionInput) => input.answer ? questionChannelContent(input.answer, input.submission!.owner) : input.explanation;
export function notebookSubmissionAccepted(record: ChatRecord, input: SubmissionInput): boolean {
	if (!input.submission) return false;
	const receipt = record.notebook?.submissions?.find((item) => item.submission.id === input.submission!.id);
	if (!receipt) return false;
	const explanation = explanationOf(input);
	if (receipt.submission.draftId !== input.submission.draftId || receipt.submission.draftRevision !== input.submission.draftRevision || !sameDraftOwner(receipt.submission.owner, input.submission.owner) || !equal(receipt.submission.additionalDrafts, input.submission.additionalDrafts) || !equal(receipt.answer, input.answer) || !explanation || !sameLearnerExplanation(receipt.explanation, explanation)) throw new NotebookDraftConflict("Submission identity already used for different work");
	return true;
}
export function validateNotebookSubmission(record: ChatRecord, input: SubmissionInput) {
	if (!input.submission) return;
	const { submission } = input;
	if (record.messages.some((message) => message.id === submission.id)) throw new NotebookDraftConflict("Submission identity already belongs to a saved message");
	const notebook = record.notebook;
	for (const ref of [submission, ...(submission.additionalDrafts ?? [])]) {
		const explanation = input.answer ? questionChannelContent(input.answer, ref.owner) : input.explanation;
		const draft = notebook?.tutorDrafts?.find((draft) => draft.id === ref.draftId && sameDraftOwner(draft.owner, ref.owner));
		if (!notebook || !draft || draft.revision !== ref.draftRevision || !explanation || !sameLearnerExplanation(draft.parts, explanation)) throw new NotebookDraftConflict("Tutor draft changed; review the saved draft before sending");
		verifyNotebookExplanation(notebook, ref.owner, ref.draftId, explanation);
	}
}
export function commitNotebookInput(store: ChatStore, chatId: string, input: SubmissionInput, appends: LhMessage[], pending = false) {
	const record = store.getChat(chatId);
	if (!record) throw new NotebookDraftConflict("Session not found");
	if (notebookSubmissionAccepted(record, input)) return;
	validateNotebookSubmission(record, input);
	const notebook = record.notebook!;
	const message = input.answer ? appends.find(item => item.role === "toolResult" && input.submission!.owner.kind === "question" && item.toolCallId === input.submission!.owner.toolCallId) : appends.find((item) => item.id === input.submission!.id);
	if (!message) throw new NotebookDraftConflict("Submission message identity mismatch");
	(notebook.submissions ??= []).push({ submission: structuredClone(input.submission!), explanation: structuredClone(explanationOf(input)!), ...(input.answer ? { answer: structuredClone(input.answer) } : {}), message: structuredClone(message), status: pending ? "pending" : "delivered" });
	const refs = [input.submission!, ...(input.submission!.additionalDrafts ?? [])];
	notebook.tutorDrafts = notebook.tutorDrafts!.filter((draft) => !refs.some(ref => draft.id === ref.draftId && draft.revision === ref.draftRevision));
	store.commitNotebookSubmission(chatId, notebook.revision, notebook, pending ? [] : appends);
}

/** Restored only onto the existing foreground learner-steer rail. Native saved
 * identities are authoritative even if settlement bookkeeping was interrupted. */
export function pendingNotebookSteers(store: ChatStore, chatId: string): LhMessage[] {
	const record = store.getChat(chatId);
	if (!record?.notebook?.submissions) return [];
	const ids = new Set(record.messages.map((message) => message.id));
	return record.notebook.submissions.filter((receipt) => receipt.status === "pending" && !ids.has(receipt.message.id)).map((receipt) => receipt.message);
}
