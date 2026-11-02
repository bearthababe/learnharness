"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { NotebookSession } from "./notebook-session";
import { focusNotebookTutorInput, notebookTutorInput } from "./notebook-speech-input";

/** Active destination follows explicit focus/click, not component mount order. */
export function useNotebookDestination(rootRef: RefObject<HTMLElement | null>, session: NotebookSession, visible: boolean, onReturn?: (target: HTMLElement) => void) {
	const tutorField = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		session.speech.configure({ tutor: () => notebookTutorInput(root, tutorField.current && root.contains(tutorField.current) ? tutorField.current : undefined), select: input => {
			root.dataset.sessionDestination = input.kind;
			if (input.kind === "tutor") tutorField.current = null;
			if (input.kind === "notebook") void session.dispatch({ type: "visibility", visible: true }).catch(() => {});
		} });
		if (!visible && root.dataset.sessionDestination === "notebook") { root.dataset.sessionDestination = "tutor"; session.speech.choose(notebookTutorInput(root)); }
		const choose = (event: Event) => {
			// The shared microphone control belongs to neither text destination.
			if ((event.target as HTMLElement).closest?.('[data-testid="dictation-toggle"]')) return;
			const owner = (event.target as HTMLElement).closest?.("[data-input-owner]")?.getAttribute("data-input-owner");
			if (owner) {
				if (owner === "tutor") tutorField.current = event.target as HTMLElement;
				const returning = root.dataset.sessionDestination === "notebook" && owner === "tutor";
				root.dataset.sessionDestination = owner;
				session.speech.choose(owner === "notebook" ? { kind: "notebook" } : notebookTutorInput(root, event.target as HTMLElement));
				if (returning && !session.speech.isActive()) onReturn?.(event.target as HTMLElement);
			}
		};
		const key = (event: KeyboardEvent) => {
			if (!visible || root.dataset.sessionDestination !== "notebook" || event.defaultPrevented || event.isComposing) return;
			const target = event.target as HTMLElement;
			if (target.closest?.('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],[role="menu"]')) return;
			if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
			event.preventDefault(); event.stopPropagation();
			const state = session.getSnapshot();
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
	}, [rootRef, session, visible, onReturn]);
	return useCallback(() => {
		const root = rootRef.current;
		if (!root) return;
		if (root.dataset.sessionDestination === "notebook") root.querySelector<HTMLTextAreaElement>("#notebook-instruction")?.focus();
		else focusNotebookTutorInput(root, tutorField.current && root.contains(tutorField.current) ? tutorField.current : undefined);
	}, [rootRef]);
}
