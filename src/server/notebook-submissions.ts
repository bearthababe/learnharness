import type { ChatRecord } from "../core/contracts/chat.ts";
import type { NotebookInputFields } from "../core/input-events.ts";
import type { LhMessage } from "../core/native-messages.ts";
import type { ChatStore } from "../core/ports.ts";
import { sameDraftOwner, sameLearnerExplanation } from "../core/notebook-content.ts";
import { NotebookDraftConflict, verifyNotebookExplanation } from "./notebook-drafts.ts";

/** Reconcile logical submission before model gates and again after their awaits. */
export function notebookSubmissionAccepted(record: ChatRecord, input: NotebookInputFields): boolean {
	if (!input.submission) return false;
	const receipt = record.notebook?.submissions?.find((item) => item.submission.id === input.submission!.id);
	if (!receipt) return false;
	if (receipt.submission.draftId !== input.submission.draftId || receipt.submission.draftRevision !== input.submission.draftRevision || !sameDraftOwner(receipt.submission.owner, input.submission.owner) || !input.explanation || !sameLearnerExplanation(receipt.explanation, input.explanation)) throw new NotebookDraftConflict("Submission identity already used for different work");
	return true;
}
export function validateNotebookSubmission(record: ChatRecord, input: NotebookInputFields) {
	if (!input.submission) return;
	const { submission, explanation } = input;
	if (record.messages.some((message) => message.id === submission.id)) throw new NotebookDraftConflict("Submission identity already belongs to a saved message");
	const notebook = record.notebook;
	const draft = notebook?.tutorDrafts?.find((draft) => draft.id === submission.draftId && sameDraftOwner(draft.owner, submission.owner));
	if (!notebook || !draft || draft.revision !== submission.draftRevision || !explanation || !sameLearnerExplanation(draft.parts, explanation)) throw new NotebookDraftConflict("Tutor draft changed; review the saved draft before sending");
	verifyNotebookExplanation(notebook, submission.owner, submission.draftId, explanation!);
}
export function commitNotebookInput(store: ChatStore, chatId: string, input: NotebookInputFields, appends: LhMessage[], pending = false) {
	const record = store.getChat(chatId);
	if (!record) throw new NotebookDraftConflict("Session not found");
	if (notebookSubmissionAccepted(record, input)) return;
	validateNotebookSubmission(record, input);
	const notebook = record.notebook!;
	const message = appends.find((item) => item.id === input.submission!.id);
	if (!message) throw new NotebookDraftConflict("Submission message identity mismatch");
	(notebook.submissions ??= []).push({ submission: structuredClone(input.submission!), explanation: structuredClone(input.explanation!), message: structuredClone(message), status: pending ? "pending" : "delivered" });
	notebook.tutorDrafts = notebook.tutorDrafts!.filter((draft) => draft.id !== input.submission!.draftId);
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
