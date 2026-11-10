"use client";

import { useEffect } from "react";

/**
 * TAB CYCLES THE ACTIVE SURFACE'S TEXT FIELDS (owner, keyboard round
 * 2026-10-06): forward-only, wrapping; Tab from outside the chain
 * focuses the FIRST field — "navigate in". Shift+Tab is NOT ours (the
 * global thinking-level cycle owns it — owner ruling the same round),
 * so there is no reverse gear; the chain wraps.
 *
 * The event (not a prop bridge): the global Tab handler dispatches
 * `lh:kbd-cycle-fields` and each composer-bearing surface answers with
 * its own chain, gathered at event time from live DOM — the fields
 * mount/unmount with the docks, so a query beats stale refs. The quiz
 * dock's own Tab claim (rows ↔ thinking, while an option question is
 * expanded) stops propagation at the document level, so this hook only
 * ever hears Tab on surfaces WITHOUT an active claim — no double act.
 */
export function useFieldCycle(fields: () => readonly HTMLElement[]) {
	useEffect(() => {
		const onCycle = (event: Event) => {
			if (document.querySelector('[data-session-destination="notebook"]')) return;
			// B11 (round 18): only fields that can take focus join the cycle. A field
			// inside a question that is not open yet is in the DOM but hidden, and
			// "moving" to it left focus where it was (Tab was stuck in the reading note).
			const list = fields().filter(canTakeFocus);
			if (list.length === 0) return;
			const active = document.activeElement;
			const idx = active ? list.findIndex((el) => el === active || el.contains(active)) : -1;
			if (idx < 0) {
				// Navigate in only from nowhere; a focused control keeps the
				// browser's own Tab order.
				if (active && active !== document.body && active !== document.documentElement) return;
				event.preventDefault();
				list[0]!.focus();
				return;
			}
			// A lone field has nowhere to cycle: Tab moves on to its controls.
			if (list.length < 2) return;
			event.preventDefault();
			list[(idx + 1) % list.length]!.focus();
		};
		window.addEventListener("lh:kbd-cycle-fields", onCycle);
		return () => window.removeEventListener("lh:kbd-cycle-fields", onCycle);
	}, [fields]);
}

function canTakeFocus(el: HTMLElement): boolean {
	return el.isConnected && !el.closest("[inert], [aria-hidden='true']") && el.getClientRects().length > 0
		&& (typeof el.checkVisibility !== "function" || el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true } as CheckVisibilityOptions));
}
