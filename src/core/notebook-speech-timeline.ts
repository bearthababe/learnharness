import type { NotebookSpeechApply, NotebookSpeechTarget } from "./contracts/notebook.ts";

/** Notebook focus names the destination, not a copy of its mutable draft ID.
 * Tutor destinations remain tied to the exact question/draft/continuation. */
export type NotebookSpeechDestination = { kind: "notebook" } | Extract<NotebookSpeechTarget, { kind: "tutor" }>;
export interface NotebookSpeechFocus { at: number; target: NotebookSpeechDestination }

/** Resolve by source time, independently of when recognition arrived. Focus
 * and Apply are separate timelines: a later refocus cannot undo a draft cut.
 * Inputs retain capture order for ties; a word starting at a cut is later. */
export function notebookSpeechTargetAt(
	initialDraftId: string,
	focus: readonly NotebookSpeechFocus[],
	applies: readonly Pick<NotebookSpeechApply, "cutoff" | "nextDraftId">[],
	time: number,
): NotebookSpeechTarget | null {
	const destination = focus.findLast(event => event.at <= time)?.target;
	if (!destination) return null;
	if (destination.kind === "tutor") return destination;
	let draftId = initialDraftId;
	let cutoff = -Infinity;
	for (const apply of applies) if (apply.cutoff <= time && apply.cutoff >= cutoff) {
		draftId = apply.nextDraftId;
		cutoff = apply.cutoff;
	}
	return { kind: "notebook", draftId };
}
