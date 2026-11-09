"use client";

import { useEffect, useRef } from "react";

/**
 * Escape and a tap outside close a card opened from ⋯ (round 14): the menu
 * itself, Tutor helpers, Graph display, Import and the Notebook chooser.
 * MenuShell only places a card; each site owns its dismissal, and these
 * portaled cards had none on tablets. `inside` lists the card and its
 * trigger(s): a press there is the card's own business (the trigger
 * toggles). One Escape closes one card (the ONE-ESC law): it is claimed.
 */
export function useCardDismiss(open: boolean, close: () => void, inside: readonly string[]) {
	const latest = useRef(close);
	latest.current = close;
	const selectors = inside.join(", ");
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
			event.preventDefault();
			event.stopPropagation();
			latest.current();
		};
		const onDown = (event: PointerEvent) => {
			if (event.target instanceof Element && event.target.closest(selectors)) return;
			latest.current();
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onDown);
		};
	}, [open, selectors]);
}
