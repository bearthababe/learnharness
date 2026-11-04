"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { NotebookSession } from "./notebook-session";
import type { NotebookSpeechInput } from "./notebook-speech";
import { focusNotebookTutorInput, notebookTutorInput } from "./notebook-speech-input";
import { finishDictation } from "./dictation";

/** Active destination follows explicit focus/click, not component mount order. */
export function useNotebookDestination(rootRef: RefObject<HTMLElement | null>, session: NotebookSession, visible: boolean) {
	const tutorField = useRef<HTMLElement | null>(null);
	const [focusRequest, setFocusRequest] = useState<{ input: NotebookSpeechInput } | null>(null);
	// A settled handoff releases React's inert lock before restoring focus.
	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root || !focusRequest) return;
		const { input } = focusRequest;
		if (input.kind === "notebook") root.querySelector<HTMLTextAreaElement>("#notebook-instruction")?.focus();
		else {
			const target = tutorField.current && root.contains(tutorField.current) ? tutorField.current : undefined;
			// Return appends at this activity's continuation; explicit selection
			// within Tutor preserves an earlier prose field.
			focusNotebookTutorInput(root, input.partId ? target : target?.closest<HTMLElement>('[data-notebook-question], [data-problem], [data-testid="composer"]') ?? undefined);
		}
	}, [rootRef, focusRequest]);
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		session.speech.configure({ finish: finishDictation, tutor: () => notebookTutorInput(root, tutorField.current && root.contains(tutorField.current) ? tutorField.current : undefined), select: input => {
			root.dataset.sessionDestination = input.kind;
			if (input.kind === "notebook") {
				if (!session.getSnapshot().view?.visible) void session.dispatch({ type: "visibility", visible: true }).catch(() => {});
			}
			setFocusRequest({ input });
		} });
		if (!visible && root.dataset.sessionDestination === "notebook") void session.speech.choose(notebookTutorInput(root)).catch(() => {});
		const choose = (event: Event) => {
			// The shared microphone control belongs to neither text destination.
			if ((event.target as HTMLElement).closest?.('[data-testid="dictation-toggle"], [data-notebook-view-control]')) return;
			const owner = (event.target as HTMLElement).closest?.("[data-input-owner]")?.getAttribute("data-input-owner");
			if (owner) {
				if (session.getSnapshot().inputLocked) { event.preventDefault(); return; }
				if (owner === "tutor") tutorField.current = event.target as HTMLElement;
				if (owner !== root.dataset.sessionDestination && (session.speech.isActive() || session.getSnapshot().editing)) event.preventDefault();
				void session.speech.choose(owner === "notebook" ? { kind: "notebook" } : notebookTutorInput(root, event.target as HTMLElement)).catch(() => {});
			}
		};
		const key = (event: KeyboardEvent) => {
			if (!visible || root.dataset.sessionDestination !== "notebook" || event.defaultPrevented || event.isComposing) return;
			const target = event.target as HTMLElement;
			if (target.closest?.('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],[role="menu"]')) return;
			if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
			event.preventDefault(); event.stopPropagation();
			const state = session.getSnapshot();
			if (state.editing || state.inputLocked) return;
			if (session.speech.apply()) return;
			if (state.draftText.trim() && !state.view?.pending) void session.dispatch({ type: "apply" }).catch(() => {});
		};
		root.addEventListener("focusin", choose);
		root.addEventListener("pointerdown", choose);
		// Revealing a question/mounting a new problem changes future speech only.
		let applicable = JSON.stringify(notebookTutorInput(root).owner);
		const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
			const next = JSON.stringify(notebookTutorInput(root).owner);
			if (next === applicable) return;
			applicable = next; tutorField.current = null; session.speech.followTutor();
		});
		observer?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-reading-claim", "data-notebook-question", "data-notebook-channel", "data-problem"] });
		document.addEventListener("keydown", key, true);
		return () => { observer?.disconnect(); root.removeEventListener("focusin", choose); root.removeEventListener("pointerdown", choose); document.removeEventListener("keydown", key, true); };
	}, [rootRef, session, visible]);
	return useCallback(() => {
		const root = rootRef.current;
		if (!root) return;
		if (root.dataset.sessionDestination === "notebook") root.querySelector<HTMLTextAreaElement>("#notebook-instruction")?.focus();
		else focusNotebookTutorInput(root, tutorField.current && root.contains(tutorField.current) ? tutorField.current : undefined);
	}, [rootRef]);
}
