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

/** The lesson's share of a stacked (portrait/phone) split, in percent. */
export const STACKED_SHARE = 56;

/** Same divider protocol as the iPad shell; equation panes use percentage bounds
 * rather than handwriting-tool pixel minima. Each orientation retains its share. */
export function NotebookSplit({ hidden }: { hidden: boolean }) {
	const divider = useRef<HTMLDivElement>(null);
	// Stacked (phones): the lesson keeps a little more than half — the
	// working card still shows several lines (whole-app redesign).
	const shares = useRef({ row: 60, column: STACKED_SHARE });
	const drag = useRef<number | null>(null);
	const [state, setState] = useState({ wide: false, share: STACKED_SHARE });
	function resize(element: HTMLElement, next?: number) {
		const layout = element.parentElement!;
		const wide = getComputedStyle(layout).flexDirection === "row";
		const direction = wide ? "row" : "column";
		const share = Math.max(30, Math.min(65, next ?? shares.current[direction]));
		shares.current[direction] = share;
		layout.style.setProperty(`--notebook-share-${direction}`, `${share}%`);
		setState(prior => prior.wide === wide && prior.share === Math.round(share) ? prior : { wide, share: Math.round(share) });
	}
	useEffect(() => {
		const element = divider.current!;
		const observer = new ResizeObserver(() => { if (element.getClientRects().length) resize(element); });
		observer.observe(element.parentElement!);
		return () => observer.disconnect();
	}, []);
	function move(event: PointerEvent<HTMLDivElement>) {
		if (drag.current !== event.pointerId) return;
		const layout = event.currentTarget.parentElement!, rect = layout.getBoundingClientRect();
		const wide = getComputedStyle(layout).flexDirection === "row";
		resize(event.currentTarget, 100 * (wide ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height));
	}
	return <div ref={divider} hidden={hidden} className="notebook-split-divider" role="separator" tabIndex={0}
		aria-label="Resize Tutor and Notebook" aria-orientation={state.wide ? "vertical" : "horizontal"}
		aria-valuemin={30} aria-valuemax={65} aria-valuenow={state.share} aria-valuetext={`${state.share}% Tutor`}
		onPointerDown={event => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
		}}
		onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
		onKeyDown={event => {
			if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
			event.preventDefault(); event.stopPropagation();
			resize(event.currentTarget, event.key === "Home" ? state.wide ? 60 : STACKED_SHARE : state.share + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -5 : 5));
		}}><span aria-hidden="true" /></div>;
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
	return <div ref={slot} hidden={hidden} className="notebook-slot" style={{ position: expanded ? "absolute" : "relative", inset: expanded ? 0 : undefined, flex: "1 1 0px", minWidth: 0, minHeight: 0, boxSizing: "border-box", padding: "var(--notebook-frame-inset, 16px)", overflow: "hidden" }}>
		<aside aria-label="Equation Notebook" className="notebook-frame rounded-2xl border bg-card shadow-lg"
			style={{ position: "absolute", inset: "var(--notebook-frame-inset, 16px)", margin: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
			{children({ expanded, toggleExpanded: () => changeView(expanded ? onBack : onExpand), close: () => changeView(onClose) })}
		</aside>
	</div>;
}
