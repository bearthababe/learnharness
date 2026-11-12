"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIDENCE_INDEX, emptyDockSelection, type QuestionFormDraft, type TutorDraftOwner } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import { plainNotebookCopy, useNotebookActivityDraft } from "./notebook-activity-draft";

/** The existing form keeps its selection machine; this adapter persists its
 * JSON-safe state alongside the channel's ordered explanation. */
export function useNotebookQuestionDraft(session: NotebookSession | undefined, owner: Extract<TutorDraftOwner, { kind: "question" }>, initial?: QuestionFormDraft) {
	const owned = useNotebookActivityDraft(session, owner);
	const [local, setLocal] = useState<QuestionFormDraft>(() => initial ?? { selection: emptyDockSelection(), text: "", thinking: "", other: "", confidenceIndex: DEFAULT_CONFIDENCE_INDEX });
	const saved = owned.enabled ? owned.draft?.form : undefined;
	const form = saved ? { ...saved, selection: { ...saved.selection, selected: new Set(saved.selection.selected) } } : { ...local };
	if (owned.enabled && owned.draft) {
		if (owner.channel === "text") form.text = owned.text; else form.thinking = owned.text;
	}
	const current = useRef(form); current.current = form;
	const activated = useRef(false);
	const persist = (next: QuestionFormDraft) => session!.tutor.updateForm(owner, { ...next, selection: { ...next.selection, selected: [...next.selection.selected] } });
	useEffect(() => {
		if (!owned.enabled || activated.current) return;
		activated.current = true;
		if (!owned.draft) persist(current.current);
	}, [owned.enabled, owned.draft, session]);
	function change<K extends keyof QuestionFormDraft>(key: K, value: QuestionFormDraft[K] | ((prior: QuestionFormDraft[K]) => QuestionFormDraft[K])) {
		const prior = current.current;
		const next = { ...prior, [key]: typeof value === "function" ? value(prior[key]) : value };
		current.current = next; setLocal(next);
		// D1 (round 20): the notebook's copy of this form must never go stale.
		// While the notebook is open it IS the form; while it is closed, edits
		// land in `local` and — when the copy is plain text — in that copy too.
		// Before, a closed-notebook edit stayed local only, so reopening the
		// notebook showed (and the answer recovery recorded, as a newer edit)
		// the older copy. A copy holding notebook working keeps its own text:
		// there the field edits only its continuation, while the notebook is open.
		if (session && (session.getSnapshot().view?.contextId || plainNotebookCopy(session, owner))) persist(next);
	}
	return { ...owned, form, current, change };
}
