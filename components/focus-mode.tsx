"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";
import { useTryout } from "@/components/device-prefs";
import { useDeviceClass } from "@/components/device-features";

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
	// P2 (round 17): the way out is the Focus button's own spot (one place
	// opens and closes); the reading line stays the top line across the
	// switch, though the bar goes.
	if (next && typeof document !== "undefined") {
		// B9 (round 18): the button is labelled now (icon over "Focus"), so the
		// bare exit icon is centred exactly on the button's icon — a 44px target.
		// Round 19 (P1): whichever Focus control this device shows (toolbar,
		// bottom row or right-edge tab) gives the spot.
		const corner = [...document.querySelectorAll<HTMLElement>("[data-focus-control]")].find(el => el.checkVisibility?.());
		const icon = corner ? corner.querySelector("svg") ?? corner : null;
		const box = icon?.getBoundingClientRect() ?? null;
		const style = document.documentElement.style;
		if (box && box.width) {
			const size = 44, x = box.left + box.width / 2, y = box.top + box.height / 2;
			style.setProperty("--lh-focus-spot-top", `${Math.round(y - size / 2)}px`);
			style.setProperty("--lh-focus-spot-right", `${Math.round(window.innerWidth - x - size / 2)}px`);
			style.setProperty("--lh-focus-spot-width", `${size}px`);
			style.setProperty("--lh-focus-spot-height", `${size}px`);
		}
	}
	keepReadingPlace(() => { on = next; apply(); });
}

/** Keep the lesson's top visible line in place while the page around it
 *  changes (the bar hiding, the column re-wrapping). */
function keepReadingPlace(change: () => void) {
	if (typeof document === "undefined") { change(); return; }
	const content = [...document.querySelectorAll<HTMLElement>("[data-session-find-root]")].find((el) => !el.hasAttribute("data-dock-scroll-area"));
	let scroller = content?.parentElement ?? null;
	while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
	if (!content || !scroller) { change(); return; }
	const top = scroller.getBoundingClientRect().top;
	let anchor: Element | null = null;
	let offset = 0;
	for (const block of content.querySelectorAll("p, li, h1, h2, h3, h4, pre, table, blockquote, .katex-display, [data-testid='user-message']")) {
		const box = block.getBoundingClientRect();
		if (box.height && box.bottom > top + 1) { anchor = block; offset = box.top - top; break; }
	}
	change();
	if (!anchor) return;
	const target = anchor, el = scroller;
	requestAnimationFrame(() => {
		const now = el.getBoundingClientRect().top;
		el.scrollTop += target.getBoundingClientRect().top - now - offset;
	});
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

/** Phones (round 17, P2): Focus in the toolbar's top-right corner, framed
 *  like the bar's other buttons. In focus mode the same spot holds the bare
 *  icon that leaves it (FocusModeExit). */
export function FocusCornerButton() {
	return (
		<button type="button" className="lh-nav-chip lh-focus-corner lh-no-drag" data-focus-control="" data-testid="focus-corner" aria-label="Focus on the lesson" title="Focus on the lesson" onClick={() => setFocusMode(true)}>
			<MaximizeIcon aria-hidden /><span className="lh-focus-corner-label" aria-hidden="true">Focus</span>
		</button>
	);
}

/** The way out, always visible while focus mode is on. Leaving the session
 *  ends focus mode too. */
export function FocusModeExit() {
	const active = useFocusMode();
	const place = useFocusPlace();
	useEffect(() => () => setFocusMode(false), []);
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) setFocusMode(false); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [active]);
	// The bottom row and the right-edge tab are their own way back (P1).
	if (!active || place === "bottom" || place === "tabs") return null;
	return (
		<button type="button" className="lh-focus-exit lh-glass" data-testid="focus-exit" aria-label="Exit focus" title="Exit focus" onClick={() => setFocusMode(false)}>
			<MinimizeIcon aria-hidden /><span className="lh-focus-exit-label">Exit<span className="lh-focus-exit-more"> focus</span></span>
		</button>
	);
}

/** Round 19 (P1): where Focus lives on this phone or tablet (a try-out);
 *  laptops keep their own Focus button (null). */
export type FocusPlace = "toolbar" | "bottom" | "tabs";
export function useFocusPlace(): FocusPlace | null {
	const device = useDeviceClass();
	const place = useTryout("focusPlace");
	return device === "phone" || device === "tablet" ? place : null;
}
/** Mirrors the placement on <html data-focus-place> for the CSS (bar slots, the reading lane). */
export function FocusPlaceSync() {
	const place = useFocusPlace();
	useEffect(() => {
		const html = document.documentElement;
		if (place) html.dataset.focusPlace = place; else delete html.dataset.focusPlace;
		return () => { delete html.dataset.focusPlace; };
	}, [place]);
	return null;
}

/** P1 (b): Focus in the bottom row, by the chat box — and, in focus mode,
 *  the bare icon that leaves it in the very same spot. */
export function FocusDockButton() {
	const active = useFocusMode();
	return (
		<button type="button" className="lh-focus-dock pointer-events-auto" data-focus-control="" data-active={active || undefined} data-testid="focus-dock"
			aria-label={active ? "Exit focus" : "Focus on the lesson"} title={active ? "Exit focus" : "Focus on the lesson (hides the page bar)"}
			onClick={() => setFocusMode(!active)}>
			{/* The label keeps its room in focus mode, so the bare icon stays on the very spot. */}
			{active ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}<span aria-hidden="true">Focus</span>
		</button>
	);
}

/**
 * P1 (c), the owner's idea: small, quiet tabs on the right edge, like the
 * sticky markers in a book. Focus near the top (in focus mode it is the way
 * back); at the bottom, by the chat box, the notebook and the keyboard
 * switch, moved in from the bar and ⋯. The lesson keeps a lane free for them.
 */
export function FocusEdgeTabs({ bottom }: { bottom: ReactNode }) {
	const active = useFocusMode();
	return (
		<>
			<nav className="lh-edge-tabs lh-edge-tabs-top" aria-label="Quick actions">
				<button type="button" className="lh-edge-tab lh-edge-tab-focus" data-focus-control="" data-active={active || undefined} data-testid="focus-tab"
					aria-label={active ? "Exit focus" : "Focus on the lesson"} title={active ? "Exit focus" : "Focus on the lesson (hides the page bar)"}
					onClick={() => setFocusMode(!active)}>
					{active ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}
				</button>
			</nav>
			<nav className="lh-edge-tabs lh-edge-tabs-bottom pointer-events-auto" aria-label="Notebook and keyboard" data-testid="edge-tabs-bottom">{bottom}</nav>
		</>
	);
}

