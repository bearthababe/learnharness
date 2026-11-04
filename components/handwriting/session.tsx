"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { HandwritingHandle } from "./notebook";
import { handwritingVisibilityKey } from "./device";

/** The only session state for this extension: visibility and layout. Canvas,
 * recovery, storage and tools stay outside the session/conversation model. */
export function useHandwritingSession(chatId: string) {
	const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [expanded, setExpanded] = useState(false);
	const ref = useRef<HandwritingHandle>(null);
	useEffect(() => {
		try { if (localStorage.getItem(handwritingVisibilityKey(chatId)) === "1") { setOpen(true); setMounted(true); } } catch { /* visibility is optional */ }
	}, [chatId]);
	function show(value: boolean) {
		if (ref.current && !ref.current.canResize()) return;
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		setOpen(value); setMounted(true); if (!value) setExpanded(false);
		try { localStorage.setItem(handwritingVisibilityKey(chatId), value ? "1" : "0"); } catch { /* ink recovery reports its own failures */ }
	}
	return { open, mounted, expanded, ref, show, toggleExpanded: () => setExpanded(value => !value) };
}

/** Accepted adjustable context/notebook split; phones retain Write/Chat. */
export function HandwritingSplit({ hidden, canResize }: { hidden: boolean; canResize: () => boolean }) {
	const [share, setShare] = useState(50), [wide, setWide] = useState(false), [max, setMax] = useState(65);
	const divider = useRef<HTMLDivElement>(null), value = useRef(50), drag = useRef<number | null>(null);
	function resize(element: HTMLElement, next: number) {
		const layout = element.parentElement!, wide = getComputedStyle(layout).flexDirection === "row";
		const extent = wide ? layout.clientWidth : layout.clientHeight;
		const limit = Math.max(30, Math.min(65, (extent - (wide ? 384 : 406) - 14) / extent * 100));
		const bounded = Math.max(30, Math.min(limit, next));
		layout.style.setProperty("--notebook-context-share", `${bounded}%`);
		value.current = bounded; setShare(Math.round(bounded)); setMax(Math.round(limit)); setWide(wide);
	}
	useEffect(() => {
		const element = divider.current!;
		const observer = new ResizeObserver(() => { if (element.getClientRects().length) resize(element, value.current); });
		observer.observe(element.parentElement!); return () => observer.disconnect();
	}, []);
	function move(event: PointerEvent<HTMLDivElement>) {
		if (drag.current !== event.pointerId || !canResize()) return;
		const layout = event.currentTarget.parentElement!, rect = layout.getBoundingClientRect(), wide = getComputedStyle(layout).flexDirection === "row";
		resize(event.currentTarget, 100 * (wide ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height));
	}
	return <div ref={divider} hidden={hidden} className="hw-splitDivider" role="separator" tabIndex={0} title="Drag to resize context and notebook; arrow keys also work" aria-label="Resize question and notebook" aria-orientation={wide ? "vertical" : "horizontal"} aria-valuemin={30} aria-valuemax={max} aria-valuenow={share} aria-valuetext={`${share}% context`} data-testid="notebook-split-divider"
		onPointerDown={event => { if (event.button !== 0 || !canResize()) return; event.preventDefault(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); }}
		onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
		onKeyDown={event => { if (!canResize() || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); resize(event.currentTarget, event.key === "Home" ? 50 : share + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -5 : 5)); }}><span aria-hidden="true" /></div>;
}
