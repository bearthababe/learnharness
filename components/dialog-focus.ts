"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** A modal's keyboard focus: moved inside when it opens, kept inside on
 *  Tab / Shift+Tab, and returned to where it was when it closes. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		const active = document.activeElement as HTMLElement | null;
		const previous = active && typeof active.focus === "function" ? active : null;
		const focusables = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => typeof element.getClientRects !== "function" || element.getClientRects().length > 0);
		if (!dialog.contains(document.activeElement)) {
			if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
			dialog.focus({ preventScroll: true });
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			const items = focusables();
			if (!items.length) { event.preventDefault(); dialog.focus(); return; }
			const first = items[0]!, last = items[items.length - 1]!;
			const active = document.activeElement;
			if (!dialog.contains(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
			if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
		};
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("keydown", onKey, true);
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, [ref]);
}
