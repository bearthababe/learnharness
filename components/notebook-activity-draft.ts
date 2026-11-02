"use client";

import { useSyncExternalStore } from "react";
import { sameDraftOwner, type TutorDraftOwner } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import type { TutorDraftSnapshot } from "./notebook-tutor-drafts";

const empty: TutorDraftSnapshot = { drafts: [], recovery: [], saving: false, error: null };
const snapshot = () => empty;
const subscribe = () => () => {};
const noSession = () => null;
export function useNotebookActivityDraft(session: NotebookSession | undefined, owner: TutorDraftOwner) {
	const notebook = useSyncExternalStore(session?.subscribe ?? subscribe, session?.getSnapshot ?? noSession, session?.getSnapshot ?? noSession);
	const state = useSyncExternalStore(session?.tutor.subscribe ?? subscribe, session?.tutor.getSnapshot ?? snapshot, session?.tutor.getSnapshot ?? snapshot);
	const draft = state.drafts.find((draft) => sameDraftOwner(draft.owner, owner));
	const part = draft?.parts.at(-1);
	return { draft, text: part?.kind === "text" ? part.text : "", enabled: !!notebook?.view?.contextId, blocked: !!notebook?.sendBlocked, state };
}
