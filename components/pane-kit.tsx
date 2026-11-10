"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { KeyboardIcon, KeyboardOffIcon, MicIcon, SquareIcon } from "lucide-react";
import { sampleDictationMeter, useDictationRecovery, type Dictation } from "@/components/dictation";
import { setKeyboardOff, useKeyboardOff } from "@/components/device-prefs";

/**
 * Round 17: the parts the phone's full-screen panes share (the thinking
 * pane, P1, and the notebook pane, P5), built once so they match:
 * - S1: the big mic bar's mic — muted, prominent by its size, with the
 *   recording state always visible (a ring that follows the voice, Stop);
 * - the keyboard button (the global "Keep keyboard closed" setting, S3);
 * - S2: Peek — the lesson with only a quiet Return button and, while
 *   dictation runs, a dictation indicator;
 * - fitting a pane to the visible viewport, so its bottom bar sits above
 *   the on-screen keyboard.
 */

/** The big mic in a pane's bottom bar. A second tap stops dictation. */
export function BigMic({ dictation, testid }: { dictation?: Dictation; testid: string }) {
	const recover = useDictationRecovery(dictation);
	const active = !!dictation?.active;
	const phase = dictation?.phase;
	const level = useDictationLevel(dictation);
	const status = phase === "connecting" ? "Connecting…" : phase === "stopping" ? "Finishing…" : active ? "Recording" : "";
	return (
		<span className="lh-big-mic-wrap">
			<button type="button" className="lh-big-mic" data-testid={testid} data-recording={active || undefined}
				aria-label={active ? "Stop dictation" : "Start dictation"} aria-pressed={active} disabled={!dictation || phase === "stopping"}
				onClick={() => { if (active) dictation?.stop(); else recover(); }}>
				<span className="lh-big-mic-ring" aria-hidden="true" style={{ transform: `scale(${1 + Math.min(1, level) * 0.3})` }} />
				{active ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
			</button>
			<span className="lh-big-mic-status" role="status" aria-live="polite">{status}</span>
		</span>
	);
}

/** The latest voice level, 0..1, while recording. */
export function useDictationLevel(dictation?: Dictation): number {
	const [level, setLevel] = useState(0);
	const phase = dictation?.phase;
	useEffect(() => {
		if (!dictation || phase !== "recording") { setLevel(0); return; }
		return sampleDictationMeter(dictation.levelRef, (update) => setLevel((previous) => {
			const next = typeof update === "function" ? update([previous]) : update;
			return next.at(-1) ?? 0;
		}));
	}, [dictation, phase]);
	return level;
}

/** The keyboard button: the same setting as ⋯'s "Keep keyboard closed". */
export function KeyboardToggle({ testid }: { testid: string }) {
	const off = useKeyboardOff();
	return (
		<button type="button" className="lh-pane-keyboard" data-testid={testid} aria-pressed={!off}
			aria-label={off ? "Keyboard off: tap to type" : "Keyboard on: tap to keep it closed"} onClick={() => setKeyboardOff(!off)}>
			{off ? <KeyboardOffIcon aria-hidden /> : <KeyboardIcon aria-hidden />}
			<span aria-hidden="true">{off ? "Keys off" : "Keys on"}</span>
		</button>
	);
}

/** S2: while peeking, the lesson shows only a quiet Return button and, if
 *  dictation runs, a small indicator — nothing else from the pane. */
export function PeekReturn({ label, onReturn, dictation, testid }: { label: string; onReturn: () => void; dictation?: Dictation; testid: string }) {
	if (typeof document === "undefined") return null;
	const active = !!dictation?.active;
	return createPortal(
		<div className="lh-peek-return-bar" data-testid={`${testid}-bar`}>
			{active && <DictationIndicator dictation={dictation!} />}
			<button type="button" className="lh-peek-return" data-testid={testid} onClick={onReturn}>{label}</button>
		</div>,
		document.body,
	);
}

/** "Recording" with a live level dot and a Stop, shown on the lesson while
 *  a pane's dictation keeps running during a peek. */
function DictationIndicator({ dictation }: { dictation: Dictation }) {
	const level = useDictationLevel(dictation);
	const finishing = dictation.phase === "stopping";
	return (
		<span className="lh-peek-dictation" data-testid="peek-dictation" role="status">
			<span className="lh-peek-dictation-dot" aria-hidden="true" style={{ transform: `scale(${1 + Math.min(1, level) * 0.6})` }} />
			<span>{finishing ? "Finishing…" : dictation.phase === "connecting" ? "Connecting…" : "Recording"}</span>
			<button type="button" aria-label="Stop dictation" onClick={dictation.stop} disabled={finishing}><SquareIcon aria-hidden /></button>
		</span>
	);
}

/** Fit a full-screen pane to the visible viewport (above the keyboard). */
export function usePaneViewport(ref: RefObject<HTMLElement | null>, open: boolean) {
	useEffect(() => {
		if (!open) return;
		const view = window.visualViewport;
		const fit = () => {
			const el = ref.current;
			if (!el || (view && view.scale !== 1)) return;
			el.style.setProperty("--lh-pane-top", `${view?.offsetTop ?? 0}px`);
			el.style.setProperty("--lh-pane-height", `${view?.height ?? window.innerHeight}px`);
		};
		fit();
		view?.addEventListener("resize", fit);
		view?.addEventListener("scroll", fit);
		window.addEventListener("resize", fit);
		return () => { view?.removeEventListener("resize", fit); view?.removeEventListener("scroll", fit); window.removeEventListener("resize", fit); };
	}, [ref, open]);
}

/**
 * P6 (round 17): the app never scrolls as a document. On iPhone, the
 * keyboard raised for a pane's field can leave the page scrolled after the
 * pane closes or peeks, which pushes the lesson's bottom row (the chat box)
 * out of view. When a pane closes or peeks, put the document back once the
 * keyboard has gone.
 */
export function settleDocumentScroll() {
	if (typeof window === "undefined") return;
	const settle = () => {
		const scroller = document.scrollingElement;
		if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
		if (scroller && (scroller.scrollTop || scroller.scrollLeft)) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
	};
	settle();
	// The keyboard closes over a few frames; settle again once it has.
	const view = window.visualViewport;
	const once = () => { settle(); view?.removeEventListener("resize", once); };
	view?.addEventListener("resize", once);
	window.setTimeout(() => { view?.removeEventListener("resize", once); settle(); }, 450);
}

/** A pane's bottom bar: Back (and shortcuts) on the left, the big mic in the
 *  centre, the pane's own controls on the right. */
export function PaneBar({ start, mic, end, testid }: { start: ReactNode; mic: ReactNode; end: ReactNode; testid: string }) {
	return (
		<div className="lh-pane-bar" data-testid={testid}>
			<span className="lh-pane-bar-start">{start}</span>
			{mic}
			<span className="lh-pane-bar-end">{end}</span>
		</div>
	);
}
