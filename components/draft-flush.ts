"use client";

import { useEffect, useRef } from "react";

/**
 * Typed work is saved as it is typed; this is the last line (D1, round 13).
 * When the page is hidden, about to unload, or (iPhone Safari) discarded in
 * the background, every draft surface writes what its field shows right now:
 * text still inside an input method's composition, or typed in the moment
 * before a reload, reaches the device copy before the page goes.
 */
const flushers = new Set<() => void>();
let installed = false;

export function flushDrafts() {
	for (const flush of flushers) {
		try { flush(); } catch { /* one surface's failure never blocks the others */ }
	}
}

function install() {
	if (installed || typeof window === "undefined") return;
	installed = true;
	window.addEventListener("pagehide", flushDrafts);
	window.addEventListener("beforeunload", flushDrafts);
	document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushDrafts(); });
}

/** The same, outside React (a field's own controller). Returns the undo. */
export function registerDraftFlush(flush: () => void): () => void {
	install();
	flushers.add(flush);
	return () => { flushers.delete(flush); };
}

/** Register a synchronous "save what the field shows now" for this surface. */
export function useDraftFlush(flush: () => void) {
	const latest = useRef(flush);
	latest.current = flush;
	useEffect(() => {
		install();
		const run = () => latest.current();
		flushers.add(run);
		return () => { flushers.delete(run); };
	}, []);
}
