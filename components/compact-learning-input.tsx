"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Loader2Icon, MicIcon, SquareIcon, XIcon } from "lucide-react";
import { DICTATION_KEYLESS, sampleDictationMeter, useDictationRecovery, type Dictation } from "@/components/dictation";
import { readPathInput, readPathSelection, restorePathSelection, type TextSelection } from "./path-input-dom";

/** Whether focus is inside an element (a composer), from focus events —
 *  never a guess about the on-screen keyboard (round 14, M6). */
export function useFocusWithin(): [boolean, { onFocus: () => void; onBlur: (event: FocusEvent<HTMLElement>) => void }] {
	const [focused, setFocused] = useState(false);
	const onFocus = useCallback(() => setFocused(true), []);
	const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
	}, []);
	return [focused, useMemo(() => ({ onFocus, onBlur }), [onFocus, onBlur])];
}

/** Presentation around the existing, always-mounted editor. Capture, ownership
 * and submission stay with the caller. The mic sits inside the field on every
 * device (round 15, F4/A2); the keyboard switch lives only in ⋯. */
export function CompactLearningInput({ children, dictation, enabled = true, speech = true }: {
	children: ReactNode;
	dictation?: Dictation;
	enabled?: boolean;
	/** Round 16 (P1-B): the thinking pane's big mic bar carries the mic and
	 *  its recording state instead, so the field shows neither. */
	speech?: boolean;
}) {
	const field = useRef<HTMLDivElement>(null);
	const saved = useRef<{ value: string; start: number; end: number; direction: "forward" | "backward" | "none"; scroll: number } | null>(null);
	const savedPath = useRef<{ value: string; selection: TextSelection | null; scroll: number } | null>(null);
	const wasActive = useRef(false);
	const active = !!dictation?.active;
	// The inherited short-window dock can scroll as a whole when both reading
	// thoughts and an answer are tall. Reveal the focused editor within that
	// viewport after keyboard/layout changes, without scrolling page or history.
	useEffect(() => {
		const element = field.current;
		if (!element || !enabled) return;
		const viewport = element.closest<HTMLElement>("[data-dock-viewport]");
		if (!viewport) return;
		let frame = 0;
		const reveal = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (!matchMedia("(max-width: 767px)").matches || (visualViewport?.scale ?? 1) !== 1 || !element.contains(document.activeElement)) return;
				if (getComputedStyle(viewport).overflowY !== "auto") return;
				const box = viewport.getBoundingClientRect(), input = element.getBoundingClientRect();
				if (input.bottom > box.bottom) viewport.scrollTop += input.bottom - box.bottom;
				else if (input.top < box.top) viewport.scrollTop -= box.top - input.top;
			});
		};
		const observer = new ResizeObserver(reveal);
		observer.observe(element);
		observer.observe(viewport);
		element.addEventListener("focusin", reveal);
		window.visualViewport?.addEventListener("resize", reveal);
		window.addEventListener("resize", reveal);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			element.removeEventListener("focusin", reveal);
			window.visualViewport?.removeEventListener("resize", reveal);
			window.removeEventListener("resize", reveal);
		};
	}, [enabled]);
	const remember = () => {
		const editor = field.current?.querySelector<HTMLElement>("[data-file-path-input]");
		if (editor) {
			savedPath.current = { value: readPathInput(editor), selection: readPathSelection(editor), scroll: editor.scrollTop };
			field.current?.style.setProperty("--lh-capture-height", `${editor.getBoundingClientRect().height}px`);
			return;
		}
		const input = field.current?.querySelector("textarea");
		if (input) {
			saved.current = { value: input.value, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection, scroll: input.scrollTop };
			field.current?.style.setProperty("--lh-capture-height", `${input.getBoundingClientRect().height}px`);
		}
	};
	useLayoutEffect(() => {
		if (active && !wasActive.current && !saved.current && !savedPath.current) remember();
		if (!active && wasActive.current) {
			const editor = field.current?.querySelector<HTMLElement>("[data-file-path-input]");
			const previousPath = savedPath.current;
			if (editor && previousPath && readPathInput(editor) === previousPath.value) {
				if (previousPath.selection) restorePathSelection(editor, previousPath.selection);
				editor.scrollTop = previousPath.scroll;
			}
			savedPath.current = null;
			const input = field.current?.querySelector("textarea");
			const previous = saved.current;
			if (input && previous && input.value === previous.value) {
				input.setSelectionRange(previous.start, previous.end, previous.direction);
				input.scrollTop = previous.scroll;
			}
			saved.current = null;
		}
		wasActive.current = active;
	}, [active]);
	const recover = useDictationRecovery(dictation, remember);
	return <>
		{enabled && dictation?.error && <div role={dictation.error === DICTATION_KEYLESS ? "status" : "alert"} className="lh-compact-error" data-setup={dictation.error === DICTATION_KEYLESS || undefined}>
			<span>{dictation.error}</span>
			<button type="button" onClick={recover}>{dictation.error === DICTATION_KEYLESS ? "Settings" : "Retry"}</button>
		</div>}
		<div ref={field} className={enabled ? "lh-compact-field" : "contents"} data-recording={(speech && active) || undefined} data-has-mic={(speech && !!dictation) || undefined}>
			{children}
			{enabled && speech && dictation && <div className="lh-compact-speech">
				{active ? <Recording dictation={dictation} /> : <button type="button" aria-label="Start dictation" data-testid="compact-dictation-toggle" onPointerDown={remember} onClick={recover}>
					<MicIcon size={20} />
				</button>}
			</div>}
		</div>
	</>;
}

function Recording({ dictation }: { dictation: Dictation }) {
	const { phase, levelRef, stop, cancel } = dictation;
	const [elapsed, setElapsed] = useState(0);
	const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
	useEffect(() => {
		if (phase !== "recording") return;
		const start = Date.now();
		return sampleDictationMeter(levelRef, setLevels, () => {
			setElapsed(Math.floor((Date.now() - start) / 1000));
		});
	}, [phase, levelRef]);
	const status = phase === "connecting" ? "Connecting…" : phase === "stopping" ? "Finishing…" : "Recording";
	return <div className="lh-compact-recording">
		<span className="sr-only" role="status">{status}</span>
		<div className="lh-compact-feedback" aria-hidden="true">
			{phase === "recording" ? <>
				<span className="lh-compact-timer">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
				<div className="lh-compact-meter">{levels.map((level, index) => <span key={index} style={{ height: `${2 + level * 20}px` }} />)}</div>
			</> : <span className="lh-compact-status"><Loader2Icon size={14} />{status}</span>}
		</div>
		<button type="button" aria-label="Cancel dictation" onClick={cancel}><XIcon size={18} /></button>
		<button type="button" aria-label="Stop dictation" onClick={stop} disabled={phase === "stopping"}><SquareIcon size={16} /></button>
	</div>;
}
