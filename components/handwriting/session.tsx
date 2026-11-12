"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandwritingHandle } from "./notebook";
import { handwritingVisibilityKey } from "./device";
import { HandwritingPages, type OpenChoice, type SnapshotWriting } from "./pages";
import { figureBackground } from "./pages-render";
import type { PageActionResult } from "./pages-context";

/** The only session state for this extension: visibility and layout. Canvas,
 * recovery, storage and tools stay outside the session/conversation model. */
export function useHandwritingSession(chatId: string) {
	const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [expanded, setExpanded] = useState(false);
	const ref = useRef<HandwritingHandle>(null);
	const actionEpoch = useRef(0);
	const controller = useRef<HandwritingPages | null>(null), waiters = useRef<((model: HandwritingPages | null) => void)[]>([]);
	const register = useCallback((model: HandwritingPages) => { controller.current = model; for (const resolve of waiters.current.splice(0)) resolve(model); return () => { if (controller.current === model) controller.current = null; }; }, []);
	useEffect(() => () => { actionEpoch.current++; for (const resolve of waiters.current.splice(0)) resolve(null); }, []);
	useEffect(() => {
		try { if (localStorage.getItem(handwritingVisibilityKey(chatId)) === "1") { setOpen(true); setMounted(true); } } catch { /* visibility is optional */ }
	}, [chatId]);
	// Round 20: a request to show or hide the notebook is never dropped. While a
	// stroke ends, a page operation or a capture finishes, it waits, then
	// happens (the latest request wins).
	const pendingShow = useRef<{ value: boolean } | null>(null);
	function show(value: boolean) {
		if (ref.current && !ref.current.canResize()) {
			const request = { value }; pendingShow.current = request;
			const started = Date.now();
			const tick = () => {
				if (pendingShow.current !== request) return;
				if (!ref.current || ref.current.canResize()) { pendingShow.current = null; show(value); return; }
				if (Date.now() - started < 15_000) window.setTimeout(tick, 100); else pendingShow.current = null;
			};
			window.setTimeout(tick, 100);
			return;
		}
		pendingShow.current = null;
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		setOpen(value); setMounted(true); if (!value) setExpanded(false);
		try { localStorage.setItem(handwritingVisibilityKey(chatId), value ? "1" : "0"); } catch { /* ink recovery reports its own failures */ }
	}
	async function ensure() {
		if (ref.current && !ref.current.canResize()) return null;
		setMounted(true);
		let model = controller.current ?? await new Promise<HandwritingPages | null>(resolve => waiters.current.push(resolve));
		while (model) {
			await model.open();
			if (controller.current === model) return ref.current?.canResize() ? model : null;
			// Effect remounts can replace the lazy notebook while open() yields.
			// Only the currently registered owner can accept this page action.
			model = controller.current;
		}
		return null;
	}
	function result(model: HandwritingPages, kind: PageActionResult["kind"]): PageActionResult {
		if (kind === "opened" && controller.current === model) { show(true); setExpanded(false); }
		return { kind, notice: model.getSnapshot().notice };
	}
	const actions = {
		async openSnapshot(writing: SnapshotWriting, duplicate = false): Promise<PageActionResult> {
			const epoch = ++actionEpoch.current, model = await ensure();
			if (epoch !== actionEpoch.current) return { kind: "cancelled", notice: null };
			return model ? result(model, await model.openSnapshot(writing, duplicate)) : { kind: "failed", notice: "Opening page…" };
		},
		async choose(choice: OpenChoice): Promise<PageActionResult> { const model = controller.current; return model ? result(model, await model.choose(choice)) : { kind: "failed", notice: null }; },
		cancel() { actionEpoch.current++; controller.current?.cancelDecision(); },
		async annotate(svg: string): Promise<PageActionResult> { const model = await ensure(); return model ? result(model, await model.importBackground(() => figureBackground(svg)) ? "opened" : "failed") : { kind: "failed", notice: "Opening page…" }; },
	};
	return { open, mounted, expanded, ref, show, register, actions, toggleExpanded: () => setExpanded(value => !value) };
}
