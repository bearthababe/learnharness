"use client";

import { useEffect, type RefObject } from "react";
import type { NotebookSession } from "./notebook-session";

/** Active destination follows explicit focus/click, not component mount order. */
export function useNotebookDestination(rootRef: RefObject<HTMLElement | null>, session: NotebookSession, visible: boolean, onReturn?: (target: HTMLElement) => void) {
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		if (!visible) root.dataset.sessionDestination = "tutor";
		const choose = (event: Event) => {
			const owner = (event.target as HTMLElement).closest?.("[data-input-owner]")?.getAttribute("data-input-owner");
			if (owner) {
				const returning = root.dataset.sessionDestination === "notebook" && owner === "tutor";
				root.dataset.sessionDestination = owner;
				if (returning) onReturn?.(event.target as HTMLElement);
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
		document.addEventListener("keydown", key, true);
		return () => { root.removeEventListener("focusin", choose); root.removeEventListener("pointerdown", choose); document.removeEventListener("keydown", key, true); };
	}, [rootRef, session, visible, onReturn]);
}
