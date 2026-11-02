/** Notebook-owned draft/snapshot rules; existing input architecture only calls
 * these at the explicit save/return/submission boundaries. */
import type { NotebookCommand, NotebookRecord, LearnerExplanation, TutorDraftOwner, WorkingSnapshot } from "./contracts/notebook.ts";
import { sameDraftOwner, questionChannelContent, NOTEBOOK_FAILURE, snapshotPart } from "./notebook-content.ts";
import { notebookOperationPending } from "./notebook-operations.ts";

export class NotebookDraftConflict extends Error {}
export function verifyNotebookExplanation(record: NotebookRecord, owner: TutorDraftOwner, draftId: string, parts: LearnerExplanation) {
	for (const part of parts) {
		if (part.kind !== "working") continue;
		const snapshot = record.snapshots?.find((item) => item.id === part.snapshotId);
		if (!snapshot || snapshot.draftId !== draftId || !sameDraftOwner(snapshot.owner, owner) || JSON.stringify(snapshotPart(snapshot)) !== JSON.stringify(part)) throw new NotebookDraftConflict("Working snapshot does not belong to this draft");
	}
}
export function changeNotebookDraft(record: NotebookRecord, command: Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" | "discard-tutor-draft" }>) {
	const owner = command.type === "tutor-draft" ? command.draft.owner : command.owner;
	const drafts = record.tutorDrafts ??= [];
	const current = drafts.find((draft) => sameDraftOwner(draft.owner, owner));
	if (command.type === "discard-tutor-draft") {
		if (!current) return;
		if (current.id !== command.draftId || current.revision !== command.expectedRevision) throw new NotebookDraftConflict("Tutor draft changed; review it before discarding");
		record.tutorDrafts = drafts.filter(draft => draft !== current);
		return;
	}
	if (command.type === "tutor-draft") {
		if (current && JSON.stringify(current) === JSON.stringify(command.draft)) return;
		if ((current?.revision ?? 0) !== command.expectedRevision || command.draft.revision !== command.expectedRevision + 1 || (current && current.id !== command.draft.id)) throw new NotebookDraftConflict("Tutor draft changed; refresh before saving");
		verifyNotebookExplanation(record, owner, command.draft.id, command.draft.parts);
		// Newer local typing may arrive after its frozen revision was consumed.
		// Its already-submitted immutable working remains the allowed baseline.
		const accepted = !current ? record.submissions?.findLast(receipt => [receipt.submission, ...(receipt.submission.additionalDrafts ?? [])].some(ref => ref.draftId === command.draft.id && sameDraftOwner(ref.owner, owner))) : undefined;
		const prior = current?.parts ?? (accepted ? accepted.answer ? questionChannelContent(accepted.answer, owner) : accepted.explanation : []);
		const before = prior.filter((part) => part.kind === "working");
		const after = command.draft.parts.filter((part) => part.kind === "working");
		if (JSON.stringify(before) !== JSON.stringify(after)) throw new NotebookDraftConflict("Saved working cannot be reordered or removed");
		if (current && JSON.stringify(current.parts.map(({ id, kind }) => [id, kind])) !== JSON.stringify(command.draft.parts.map(({ id, kind }) => [id, kind]))) throw new NotebookDraftConflict("Explanation part identities and order must be retained");
		if (current) drafts[drafts.indexOf(current)] = structuredClone(command.draft); else drafts.push(structuredClone(command.draft));
		return;
	}
	const duplicate = record.snapshots?.find((snapshot) => snapshot.id === command.id);
	if (duplicate) {
		if (duplicate.draftId !== command.draftId || !sameDraftOwner(duplicate.owner, owner)) throw new NotebookDraftConflict("Snapshot identity already used");
		return;
	}
	if (!current || current.id !== command.draftId || current.revision !== command.expectedRevision) throw new NotebookDraftConflict("Tutor draft changed; refresh before returning");
	if (command.throughOperationId) {
		const op = record.operations.find(op => op.id === command.throughOperationId);
		if (!op || op.contextId !== command.contextId || op.kind === "start-fresh") throw new NotebookDraftConflict("Snapshot cutoff does not belong to this working context");
		if (current.parts.some(part => part.id === command.id || part.id === command.continuationId)) throw new NotebookDraftConflict("Part identity already used");
		const settled = op.completedWorking ?? (op.status === "applied" && op.result ? { revision: op.appliedRevision!, lines: op.result.state.lines } : undefined);
		const snapshot: WorkingSnapshot = { id: command.id, owner, draftId: current.id, contextId: op.contextId, throughOperationId: op.id,
			status: settled ? op.status === "applied" ? "resolved" : "failed" : "pending", revision: settled?.revision ?? record.current.revision, lines: structuredClone(settled?.lines ?? record.current.state.lines),
			...(settled && op.status !== "applied" ? { failure: NOTEBOOK_FAILURE } : {}) };
		(record.snapshots ??= []).push(snapshot);
		current.parts.push(snapshotPart(snapshot), { id: command.continuationId, kind: "text", text: "" }); current.revision++;
		return;
	}
	if ((command.contextId !== undefined && command.contextId !== record.current.id) || (command.workingRevision !== undefined && command.workingRevision !== record.current.revision)) throw new NotebookDraftConflict("Working changed before the snapshot could be saved; retain this draft for review");
	if (record.operations.some(notebookOperationPending)) throw new NotebookDraftConflict("Notebook edit is pending");
	const last = current.parts.filter((part) => part.kind === "working").at(-1);
	if (!record.current.state.lines.length || (last?.kind === "working" && last.contextId === record.current.id && last.revision === record.current.revision)) return;
	if (current.parts.some((part) => part.id === command.id || part.id === command.continuationId)) throw new NotebookDraftConflict("Part identity already used");
	const snapshot = { id: command.id, owner, draftId: current.id, contextId: record.current.id, revision: record.current.revision, lines: structuredClone(record.current.state.lines) };
	(record.snapshots ??= []).push(snapshot);
	current.parts.push({ id: command.id, kind: "working", snapshotId: snapshot.id, contextId: snapshot.contextId, revision: snapshot.revision, lines: structuredClone(snapshot.lines) }, { id: command.continuationId, kind: "text", text: "" });
	current.revision++;
}
