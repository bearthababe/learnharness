"use client";

import { useEffect } from "react";

/**
 * TAB ENTERS THE ACTIVE SURFACE (whole-app redesign; was the 2026-10-06
 * field cycle): the global handler dispatches only when NOTHING is
 * focused, so this focuses the surface's first field — "navigate in".
 * Every Tab after that is the browser's native focus order.
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
		const onCycle = () => {
			if (document.querySelector('[data-session-destination="notebook"]')) return;
			const list = fields().filter((el) => el.isConnected);
			if (list.length === 0) return;
			const active = document.activeElement;
			const idx = active ? list.findIndex((el) => el === active || el.contains(active)) : -1;
			if (idx < 0) {
				list[0]!.focus();
				return;
			}
			list[(idx + 1) % list.length]!.focus();
		};
		window.addEventListener("lh:kbd-cycle-fields", onCycle);
		return () => window.removeEventListener("lh:kbd-cycle-fields", onCycle);
	}, [fields]);
}
