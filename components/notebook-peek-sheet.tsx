"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { NotebookLine } from "@/src/core";
import { NotebookWorking } from "./notebook-working";

const HEIGHT_KEY = "lh:notebook-peek-height";
/** The sheet's grab band, a 44px target. */
const HANDLE_PX = 44;
/** One line of working (a rendered line with its padding). */
const ONE_LINE_PX = 60;

function storedHeight(): number | null {
	try {
		const value = Number(window.localStorage.getItem(HEIGHT_KEY));
		return Number.isFinite(value) && value > 0 ? value : null;
	} catch { return null; }
}

/**
 * P5 (round 17, phones): while the learner peeks at the lesson from the
 * notebook, the working stays in a sheet pulled up from below — the
 * working only, no notebook header. It opens at one line (the latest);
 * pull it up for more lines, down to one again. Only the sheet moves: the
 * lesson, its question and its chat box stay where they are beneath it.
 * The size is remembered on this device.
 */
export function NotebookPeekSheet({ lines, changedIds }: { lines: readonly NotebookLine[]; changedIds?: ReadonlySet<string> }) {
	const [height, setHeight] = useState<number>(() => (typeof window === "undefined" ? HANDLE_PX + ONE_LINE_PX : storedHeight() ?? HANDLE_PX + ONE_LINE_PX));
	const scroll = useRef<HTMLDivElement>(null);
	const drag = useRef<{ id: number; y: number; start: number } | null>(null);
	const max = () => Math.max(HANDLE_PX + ONE_LINE_PX, Math.round((window.visualViewport?.height ?? window.innerHeight) * 0.7));
	const clamp = (value: number) => Math.max(HANDLE_PX + ONE_LINE_PX, Math.min(max(), value));
	// The latest line is the one in view when the sheet is small.
	useLayoutEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);
	useEffect(() => {
		const refit = () => setHeight((value) => clamp(value));
		window.visualViewport?.addEventListener("resize", refit);
		return () => window.visualViewport?.removeEventListener("resize", refit);
	}, []);
	const save = (value: number) => { try { window.localStorage.setItem(HEIGHT_KEY, String(Math.round(value))); } catch { /* this view only */ } };
	const down = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { id: event.pointerId, y: event.clientY, start: height };
	};
	const move = (event: ReactPointerEvent<HTMLDivElement>) => {
		const d = drag.current; if (!d || d.id !== event.pointerId) return;
		setHeight(clamp(d.start + (d.y - event.clientY)));
	};
	const up = (event: ReactPointerEvent<HTMLDivElement>) => {
		const d = drag.current; if (!d || d.id !== event.pointerId) return;
		drag.current = null;
		const next = clamp(d.start + (d.y - event.clientY));
		setHeight(next); save(next);
	};
	if (typeof document === "undefined") return null;
	return createPortal(
		<section className="lh-peek-sheet" aria-label="Your working" data-testid="notebook-peek-sheet" style={{ height }}>
			<div className="lh-peek-sheet-handle" role="separator" aria-orientation="horizontal" aria-label="Resize the working" tabIndex={0} data-testid="notebook-peek-handle"
				aria-valuemin={HANDLE_PX + ONE_LINE_PX} aria-valuenow={Math.round(height)}
				onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
				onKeyDown={(event) => {
					if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
					event.preventDefault();
					const next = clamp(height + (event.key === "ArrowUp" ? ONE_LINE_PX : -ONE_LINE_PX));
					setHeight(next); save(next);
				}}>
				<span aria-hidden="true" />
			</div>
			<div ref={scroll} className="lh-peek-sheet-working" data-testid="notebook-peek-working">
				{lines.length ? <NotebookWorking lines={lines} changedIds={changedIds} /> : <p className="notebook-empty">No working yet.</p>}
			</div>
		</section>,
		document.body,
	);
}
