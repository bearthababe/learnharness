"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export interface NotebookViewControls {
	expanded: boolean;
	toggleExpanded: () => void;
	close: () => void;
}

/** Presentation only, following handwriting/session.tsx at 329677b. Content,
 * visibility persistence and settled input handoffs remain with the caller. */
export function useNotebookLayout(open: boolean) {
	const [mounted, setMounted] = useState(open);
	const [expanded, setExpanded] = useState(false);
	useEffect(() => { if (open) setMounted(true); else setExpanded(false); }, [open]);
	return { mounted: mounted || open, expanded: open && expanded, expand: () => setExpanded(true), back: () => setExpanded(false) };
}

const SPLIT_KEY = "lh:notebook-split";
const HINT_KEY = "lh:notebook-split-hint-seen";
// Side by side keeps its original bounds. Stacked (phones, owner O3): with
// no saved size the notebook opens tall enough for about two lines of
// working (header, two lines, the instruction field); once the learner
// resizes it, that size is remembered for every later opening.
const DEFAULT_ROW = 60;
const BOUNDS = { row: [30, 65], column: [25, 78] } as const;
/** Headroom above each working line for its term-address tags (R4, round
 *  13: tags above the maths, never mistaken for exponents). Kept in step
 *  with `.notebook-expression { padding-top }` in globals.css. */
const TERM_TAG_HEADROOM_PX = 20;
/** The notebook's height for two lines of working, plus the grip. */
const TWO_LINES_PX = 236 + 20 + 2 * TERM_TAG_HEADROOM_PX;
/** A tap on the stacked grip swaps between these two tutor shares. */
const FOCUS_SHARES = { lesson: 72, working: 40 } as const;
type Shares = { row: number; column: number | null };
function storedShares(): Shares {
	try {
		const value = JSON.parse(window.localStorage.getItem(SPLIT_KEY) ?? "null") as { row?: unknown; column?: unknown } | null;
		const fits = (n: unknown, direction: "row" | "column"): n is number => typeof n === "number" && n >= BOUNDS[direction][0] && n <= BOUNDS[direction][1];
		return { row: fits(value?.row, "row") ? value!.row as number : DEFAULT_ROW, column: fits(value?.column, "column") ? value!.column as number : null };
	} catch { return { row: DEFAULT_ROW, column: null }; }
}
/** The tutor's share that leaves the notebook about two lines tall. */
export function twoLineShare(layoutHeight: number): number {
	if (!(layoutHeight > 0)) return 58;
	return Math.max(BOUNDS.column[0], Math.min(BOUNDS.column[1], 100 * (layoutHeight - TWO_LINES_PX) / layoutHeight));
}
function saveShares(shares: Shares) {
	try { window.localStorage.setItem(SPLIT_KEY, JSON.stringify(shares.column === null ? { row: shares.row } : shares)); } catch { /* this view only */ }
}

/** Same divider protocol as the iPad shell; equation panes use percentage bounds
 * rather than handwriting-tool pixel minima. Each orientation retains its share,
 * and the split the learner chose is remembered on this device. */
export function NotebookSplit({ hidden }: { hidden: boolean }) {
	const divider = useRef<HTMLDivElement>(null);
	const shares = useRef<Shares | null>(null);
	const drag = useRef<number | null>(null);
	const press = useRef<{ x: number; y: number; at: number; moved: boolean } | null>(null);
	const [state, setState] = useState({ wide: false, share: 58 });
	// First use (owner O3): the grip says what it does, once.
	const [hint, setHint] = useState(false);
	const seenHint = () => { setHint(false); try { window.localStorage.setItem(HINT_KEY, "1"); } catch { /* this view only */ } };
	function resize(element: HTMLElement, next?: number | "default") {
		const layout = element.parentElement!;
		const wide = getComputedStyle(layout).flexDirection === "row";
		const direction = wide ? "row" : "column";
		shares.current ??= storedShares();
		const current = shares.current;
		let share: number;
		if (next === "default") {
			// Back to the two-line opening size; nothing chosen is kept.
			if (direction === "column") { current.column = null; saveShares(current); }
			else { current.row = DEFAULT_ROW; saveShares(current); }
			share = direction === "column" ? twoLineShare(layout.getBoundingClientRect().height) : DEFAULT_ROW;
		} else if (next === undefined) {
			share = direction === "row" ? current.row : current.column ?? twoLineShare(layout.getBoundingClientRect().height);
		} else {
			share = Math.max(BOUNDS[direction][0], Math.min(BOUNDS[direction][1], next));
			const before = direction === "row" ? current.row : current.column;
			if (before === null || Math.round(share) !== Math.round(before)) {
				if (direction === "row") current.row = share; else current.column = share;
				saveShares({ row: Math.round(current.row), column: current.column === null ? null : Math.round(current.column) });
			}
		}
		layout.style.setProperty(`--notebook-share-${direction}`, `${share}%`);
		setState(prior => prior.wide === wide && prior.share === Math.round(share) ? prior : { wide, share: Math.round(share) });
	}
	useEffect(() => {
		const element = divider.current!;
		const observer = new ResizeObserver(() => { if (element.getClientRects().length) resize(element); });
		observer.observe(element.parentElement!);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (hidden || state.wide) return;
		let seen = false;
		try { seen = window.localStorage.getItem(HINT_KEY) === "1"; } catch { /* show it */ }
		if (seen) return;
		setHint(true);
		const timer = window.setTimeout(seenHint, 8000);
		return () => window.clearTimeout(timer);
	}, [hidden, state.wide]);
	function move(event: PointerEvent<HTMLDivElement>) {
		if (drag.current !== event.pointerId) return;
		const start = press.current;
		if (start && !start.moved) {
			if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
			start.moved = true;
		}
		const layout = event.currentTarget.parentElement!, rect = layout.getBoundingClientRect();
		const wide = getComputedStyle(layout).flexDirection === "row";
		resize(event.currentTarget, 100 * (wide ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height));
	}
	return <div ref={divider} hidden={hidden} className="notebook-split-divider" role="separator" tabIndex={0} data-testid="notebook-grip"
		aria-label="Resize Tutor and Notebook" aria-orientation={state.wide ? "vertical" : "horizontal"}
		aria-describedby={hint ? "notebook-split-hint" : undefined}
		title={state.wide ? undefined : "Drag to resize · tap to switch between lesson and working"}
		aria-valuemin={BOUNDS[state.wide ? "row" : "column"][0]} aria-valuemax={BOUNDS[state.wide ? "row" : "column"][1]} aria-valuenow={state.share} aria-valuetext={`${state.share}% Tutor`}
		onPointerDown={event => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (hint) seenHint();
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
			press.current = { x: event.clientX, y: event.clientY, at: Date.now(), moved: false };
		}}
		onPointerMove={move} onPointerUp={event => {
			const start = press.current;
			drag.current = null; press.current = null;
			// A tap (no drag) on the stacked grip swaps the focus: lesson ↔ working.
			if (start && !start.moved && Date.now() - start.at < 500 && !state.wide) {
				resize(event.currentTarget, state.share >= (FOCUS_SHARES.lesson + FOCUS_SHARES.working) / 2 ? FOCUS_SHARES.working : FOCUS_SHARES.lesson);
			}
		}} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
		onKeyDown={event => {
			if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
			event.preventDefault(); event.stopPropagation();
			if (hint) seenHint();
			resize(event.currentTarget, event.key === "Home" ? "default" : state.share + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -5 : 5));
		}}><span aria-hidden="true" />{/* R3 (round 13): the hint sits inside the grip band, either side of the
		    bar — it covers neither the composer above nor the notebook below. */}
		{hint && <span id="notebook-split-hint" className="notebook-split-hint" data-testid="notebook-grip-hint"><span>Drag to resize</span><span>Tap to swap</span></span>}</div>;
}

/** The accepted four-corner frame and expanded overlay, independent of editor
 * implementation. Retained DOM keeps input state; each view has its own scroll. */
export function NotebookFrame({ hidden, expanded, onExpand, onBack, onClose, children }: {
	hidden: boolean; expanded: boolean; onExpand: () => void; onBack: () => void; onClose: () => void; children: (controls: NotebookViewControls) => ReactNode;
}) {
	const slot = useRef<HTMLDivElement>(null);
	const positions = useRef<{ split?: { top: number; left: number }; full?: { top: number; left: number } }>({});
	const previous = useRef({ hidden, expanded });
	useLayoutEffect(() => {
		const element = slot.current!;
		const scroll = element.querySelector<HTMLElement>("[data-notebook-scroll]");
		if (!scroll || hidden) return;
		const mode = expanded ? "full" : "split";
		const prior = previous.current.expanded ? "full" : "split";
		const position = positions.current[mode] ?? positions.current[prior];
		if (position) { scroll.scrollTop = position.top; scroll.scrollLeft = position.left; }
		previous.current = { hidden, expanded };
		const save = () => { if (!element.hidden) positions.current[mode] = { top: scroll.scrollTop, left: scroll.scrollLeft }; };
		save();
		scroll.addEventListener("scroll", save);
		// Hidden elements report zero; cleanup runs after geometry may change.
		return () => { scroll.removeEventListener("scroll", save); };
	}, [hidden, expanded]);
	useEffect(() => {
		const element = slot.current!;
		if (hidden) return;
		const fit = () => {
			const viewport = window.visualViewport;
			if ((viewport?.scale ?? 1) !== 1) return;
			const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
			const height = `${Math.max(0, bottom - element.getBoundingClientRect().top)}px`;
			if (element.style.maxHeight !== height) element.style.maxHeight = height;
		};
		const observer = new ResizeObserver(fit);
		for (const sibling of element.parentElement!.children) observer.observe(sibling);
		window.addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit); window.visualViewport?.addEventListener("scroll", fit);
		fit();
		return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("scroll", fit); element.style.removeProperty("max-height"); };
	}, [hidden, expanded]);
	const changeView = (action: () => void) => {
		const scroll = slot.current?.querySelector<HTMLElement>("[data-notebook-scroll]");
		if (scroll) positions.current[expanded ? "full" : "split"] = { top: scroll.scrollTop, left: scroll.scrollLeft };
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		action();
	};
	return <div ref={slot} hidden={hidden} className="notebook-slot" style={{ position: expanded ? "absolute" : "relative", inset: expanded ? 0 : undefined, flex: "1 1 0px", minWidth: 0, minHeight: 0, boxSizing: "border-box", padding: 16, overflow: "hidden" }}>
		<aside aria-label="Equation Notebook" className="notebook-frame rounded-2xl border bg-card shadow-lg"
			style={{ position: "absolute", inset: 16, margin: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
			{children({ expanded, toggleExpanded: () => changeView(expanded ? onBack : onExpand), close: () => changeView(onClose) })}
		</aside>
	</div>;
}
