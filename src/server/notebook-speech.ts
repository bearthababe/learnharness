import type { NotebookCommand, NotebookRecord, NotebookSpeechRun } from "../core/contracts/notebook.ts";
import { sameDraftOwner } from "../core/notebook-content.ts";
import { NotebookDraftConflict } from "./notebook-drafts.ts";

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
