"use client";

import { useSyncExternalStore } from "react";
import { sameDraftOwner, type TutorDraftOwner, type OwnedTutorDraft } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import type { TutorDraftSnapshot } from "./notebook-tutor-drafts";

const empty: TutorDraftSnapshot = { drafts: [], recovery: [], saving: false, error: null };
const snapshot = () => empty;
const subscribe = () => () => {};
const noSession = () => null;
/** Review and its indicator share activity scope, including all question channels. */
export function notebookActivityDrafts(drafts: OwnedTutorDraft[], activity: TutorDraftOwner) {
	return drafts.filter(({ owner }) => activity.kind === "question" ? owner.kind === "question" && owner.toolCallId === activity.toolCallId
		: activity.kind === "practice" ? owner.kind === "practice" && owner.problemCallId === activity.problemCallId : owner.kind === "ordinary");
}
export function useNotebookActivityDraft(session: NotebookSession | undefined, owner: TutorDraftOwner) {
	const notebook = useSyncExternalStore(session?.subscribe ?? subscribe, session?.getSnapshot ?? noSession, session?.getSnapshot ?? noSession);
	const state = useSyncExternalStore(session?.tutor.subscribe ?? subscribe, session?.tutor.getSnapshot ?? snapshot, session?.tutor.getSnapshot ?? snapshot);
	const draft = state.drafts.find((draft) => sameDraftOwner(draft.owner, owner));
	const part = draft?.parts.at(-1);
	return { draft, text: part?.kind === "text" ? part.text : "", enabled: !!notebook?.view?.contextId, blocked: !!notebook?.sendBlocked, state };
}

/** D1 (round 20): whether the notebook already holds a plain-text copy of this
 *  owner's draft (one text part, no working). While the notebook is closed,
 *  edits keep such a copy current, so reopening it never shows older text. */
export function plainNotebookCopy(session: NotebookSession | undefined, owner: TutorDraftOwner): boolean {
	const draft = session?.tutor.getSnapshot().drafts.find((item) => sameDraftOwner(item.owner, owner));
	return !!draft && draft.parts.length === 1 && draft.parts[0]!.kind === "text";
}
