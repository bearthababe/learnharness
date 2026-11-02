import { z } from "zod";
import { tutorDraftOwnerSchema, sameDraftOwner } from "./notebook-content.ts";
import type { NotebookCommand, NotebookRecord, NotebookSpeechRun } from "./contracts/notebook.ts";
import { NotebookDraftConflict } from "./notebook-drafts.ts";
import { restoreNotebookOperation } from "./notebook-operations.ts";

const id = z.string().min(1);
export const notebookSpeechApplySchema = z.object({ runId: id, draftId: id, nextDraftId: id, fragmentIds: z.array(id), text: z.string(), prefix: z.string(), commandIds: z.array(id), cutoff: z.number().nonnegative(), ready: z.boolean(), resolves: id.optional() }).strict();
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

/** Hidden speech is draft data, never a message or an editor operation. */
export function changeNotebookSpeech(record: NotebookRecord, command: Extract<NotebookCommand, { type: "speech-run" | "discard-speech" }>) {
	const runs = record.speechRuns ??= [];
	if (command.type === "discard-speech") {
		const run = runs.find(run => run.id === command.runId);
		if (!run || run.status === "recording" || !run.unplaced?.includes(command.fragmentId)) throw new NotebookDraftConflict("Retained dictation was not found");
		if (!run.discarded?.includes(command.fragmentId)) (run.discarded ??= []).push(command.fragmentId);
		run.fragments = run.fragments.filter(fragment => fragment.id !== command.fragmentId);
		return;
	}
	const prior = runs.find(run => run.id === command.run.id);
	const { unplaced: _unplaced, ...input } = command.run;
	const same = (value: typeof input) => JSON.stringify({ ...value, unplaced: undefined });
	if (prior && same(prior) === same(input)) return;
	if ((prior?.revision ?? 0) !== command.expectedRevision || input.revision !== command.expectedRevision + 1 || prior && prior.status !== "recording") throw new NotebookDraftConflict("Saved dictation changed; refresh before restoring it");
	if (command.run.status !== "recording") {
		const awaiting = record.operations.filter(op => op.status === "awaiting-transcript" && op.speech?.runId === command.run.id);
		for (const op of awaiting) {
			const speech = op.speech!;
			const known = command.run.fragments.filter(fragment => fragment.target?.kind === "notebook" && fragment.target.draftId === speech.draftId).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
			speech.fragmentIds = known.map(fragment => fragment.id);
			speech.text = command.run.status === "cancelled" ? "" : known.map(fragment => fragment.text).join(" ");
			op.instruction = [speech.prefix.trimEnd(), speech.text].filter(Boolean).join(" ");
		}
		if (awaiting.length) restoreNotebookOperation(record, awaiting[0]!, "failed", "Recording interrupted. Review the retained instructions and explicitly Apply to retry.");
	}
	const run: NotebookSpeechRun = structuredClone(input);
	if (run.status === "revealed" || run.status === "interrupted") {
		const changed = new Set<string>();
		run.unplaced = [];
		for (const fragment of [...run.fragments].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))) {
			if (!fragment.text.trim()) continue;
			if (record.operations.some(op => op.speech?.runId === run.id && (op.speech.fragmentIds.includes(fragment.id) || op.speech.commandIds.some(id => fragment.id === id || fragment.id.startsWith(`${id}:`))))) continue;
			const target = fragment.target;
			const join = (text: string) => text ? `${text.trimEnd()} ${fragment.text}` : fragment.text;
			if (target?.kind === "notebook" && record.notebookDraft.id === target.draftId) {
				record.notebookDraft.text = join(record.notebookDraft.text);
				record.notebookDraft.revision++;
			} else if (target?.kind === "tutor") {
				const draft = record.tutorDrafts?.find(draft => draft.id === target.draftId && sameDraftOwner(draft.owner, target.owner));
				const part = draft?.parts.find(part => part.id === target.partId);
				if (draft && part?.kind === "text") {
					part.text = join(part.text); changed.add(draft.id);
					if (draft.form && draft.parts.at(-1) === part && target.owner.kind === "question") {
						if (target.owner.channel === "text") draft.form.text = part.text;
						else if (target.owner.channel === "thinking") draft.form.thinking = part.text;
					}
				} else run.unplaced.push(fragment.id);
			} else run.unplaced.push(fragment.id);
		}
		for (const draft of record.tutorDrafts ?? []) if (changed.has(draft.id)) draft.revision++;
	}
	if (prior) runs[runs.indexOf(prior)] = run; else runs.push(run);
}
