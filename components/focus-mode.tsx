"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";

/**
 * Focus mode (round 14, owner P2): an explicit choice, never hide-on-scroll
 * (learners scroll up and down to reread). It hides the session bar so the
 * lesson has the screen; "Exit focus" stays in sight (and Escape works).
 * The notebook keeps its pane if open, and its button is back on exit.
 * Questions open and close from their own controls, never from the bar.
 */
let on = false;
const listeners = new Set<() => void>();
function apply() {
	if (typeof document !== "undefined") {
		if (on) document.documentElement.dataset.focusMode = "true";
		else delete document.documentElement.dataset.focusMode;
	}
	for (const listener of listeners) listener();
}
export function setFocusMode(next: boolean) {
	if (on === next) return;
	on = next;
	apply();
}
export function useFocusMode(): boolean {
	return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => on, () => false);
}

/** Laptops (round 15, A1): focus mode from the bar's right-hand end, the
 *  place ⋯ takes on phones and tablets (where it is a ⋯ row instead). */
export function FocusModeButton() {
	return (
		<button type="button" className="lh-nav-chip lh-focus-enter lh-no-drag" data-testid="focus-enter" aria-label="Focus on the lesson" title="Focus on the lesson (hides this bar)" onClick={() => setFocusMode(true)}>
			<MaximizeIcon aria-hidden /><span className="lh-nav-chip-label">Focus</span>
		</button>
	);
}

/** The way out, always visible while focus mode is on. Leaving the session
 *  ends focus mode too. */
export function FocusModeExit() {
	const active = useFocusMode();
	useEffect(() => () => setFocusMode(false), []);
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) setFocusMode(false); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [active]);
	if (!active) return null;
	return (
		<button type="button" className="lh-focus-exit lh-glass" data-testid="focus-exit" onClick={() => setFocusMode(false)}>
			<MinimizeIcon aria-hidden />Exit focus
		</button>
	);
}
