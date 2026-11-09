"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PathInput } from "@/components/path-input";
import { useHandwritingEditor } from "./handwriting/submission";
import { joinDictation, sampleDictationMeter, useDictationRecovery, useDictationTarget, type Dictation } from "@/components/dictation";
import type { NotebookSession } from "./notebook-session";
import { useNotebookActivityDraft } from "./notebook-activity-draft";
import { CompactLearningInput, useFocusWithin } from "@/components/compact-learning-input";
import { usePhoneLayout } from "@/components/use-phone-viewport";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, KeyboardIcon, KeyboardOffIcon, MicIcon, NotebookPenIcon, PenLineIcon, SquareIcon } from "lucide-react";
import { readPathSelection, restorePathSelection, type TextSelection } from "./path-input-dom";
import { setKeyboardOff, useKeyboardOff, useRevealStyle, useTryout } from "@/components/device-prefs";
import { useDeviceClass } from "@/components/device-features";
import { PageMenuButton } from "@/components/page-menu";

/**
 * The reading-thinking field (owner design 2026-10-03, "two questions per
 * teaching unit"): a quiet textarea for thinking WHILE READING the
 * teaching prose — the same transfer channel the question dock's "Your
 * thinking" gives the answer, opened one phase earlier. It mounts while a
 * teach-phase check waits behind its reveal (the same cue that collapses
 * the check), rides the check answer as the SEPARATE `readingThinking`
 * channel (never conflated with the quiz thinking), and disappears with
 * the question.
 *
 * Dictation: while the check sits UNREVEALED this field is the primary
 * target (the dock releases its claim — dictated reading-thoughts land
 * here, not in the hidden quiz field); once the learner reveals the
 * check, the dock reclaims and this field is plain typing.
 */
export function ReadingThinkingField({
	notebook,
	toolCallId = "",
	value,
	revision,
	onChange,
	onEscape,
	onOpen,
	claim,
	dictation,
	targetKey = "reading",
	questionOpen = false,
}: {
	notebook?: NotebookSession;
	toolCallId?: string;
	value: string;
	revision: number;
	onChange: (v: string) => void;
	/** Esc in the field stops dictation (threaded from the page's hook). */
	onEscape?: () => void;
	/** The check waits CLOSED — Enter opens it (owner, keyboard round
	 *  2026-10-06). The caller finishes any live dictation FIRST (the
	 *  flush lands here — the field is the live claim), then reveals.
	 *  Absent = the check is open: Enter keeps the dumping convention. */
	onOpen?: () => void;
	/** Primary dictation claim — true while the check is behind its reveal. */
	claim: boolean;
	dictation?: Dictation;
	targetKey?: string;
	/** The question is open (the learner came to the pane from it): the
	 *  pane's Back names it ("‹ Question"), else "‹ Lesson". */
	questionOpen?: boolean;
}) {
	const [draft, setDraft] = useState(value);
	// Phones fold the notes while the question is open (owner B12): the
	// step stays, the box steps back; one tap unfolds it to re-read or add.
	const [unfolded, setUnfolded] = useState(false);
	// P8: it grows while the learner is in it, and otherwise previews the
	// thought on one line — it never shrinks while they type.
	const [focused, focusHandlers] = useFocusWithin();
	const phone = usePhoneLayout();
	const revealStyle = useRevealStyle();
	// F6 (round 15): on phones the note lives in a full-screen pane that
	// slides in from the right; the lesson keeps only a labelled button.
	// Round 16 (F6): tablets offer the same pane as a try-out option.
	const device = useDeviceClass();
	const tabletPane = useTryout("tabletPane");
	const paneMode = phone || (device === "tablet" && tabletPane === "pane");
	// P1 (controls) and P2 (seeing the lesson) are independent try-outs.
	const controls = useTryout("paneControls");
	const peekStyle = useTryout("panePeek");
	const [paneOpen, setPaneOpen] = useState(false);
	const [peeking, setPeeking] = useState(false);
	const [strip, setStrip] = useState<{ from: "lesson" | "question"; first: string; more: string } | null>(null);
	const [stripOpen, setStripOpen] = useState(false);
	const paneRef = useRef<HTMLDivElement>(null);
	const place = useRef<{ selection: TextSelection | null; scroll: number } | null>(null);
	const placeKey = `lh:reading-pane:${toolCallId || "page"}`;
	const paneId = `lh-reading-pane-${toolCallId || "page"}`;
	// The session workspace this note belongs to: the pane lives outside it
	// (a full-screen layer) yet still counts as its field for focus and speech.
	const entryRef = useRef<HTMLDivElement>(null);
	const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
	useEffect(() => { setWorkspaceId(entryRef.current?.closest<HTMLElement>("[data-session-workspace]")?.id || undefined); }, [paneMode]);
	// F4 (round 15): the mic is in this field on every device. The field takes
	// the mic while the learner is in it (or dictating into it), and hands it
	// back to the question when they move on.
	const [engaged, setEngaged] = useState(false);
	const [heldMic, setHeldMic] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (dictation?.active && (engaged || paneOpen)) setHeldMic(true);
		if (!dictation?.active) setHeldMic(false);
	}, [dictation?.active, engaged, paneOpen]);
	useEffect(() => {
		if (!engaged) return;
		const away = (event: PointerEvent) => {
			const inside = event.target instanceof Node && (rootRef.current?.contains(event.target) || paneRef.current?.contains(event.target));
			if (!inside) setEngaged(false);
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [engaged]);
	const owns = claim || engaged || heldMic || (paneMode && paneOpen);
	useLayoutEffect(() => { setDraft(value); }, [revision, value]);
	const owner = { kind: "question" as const, toolCallId, channel: "reading-thinking" as const };
	const owned = useNotebookActivityDraft(notebook, owner);
	const text = owned.enabled && owned.draft ? owned.text : draft;
	const textRef = useRef(text); textRef.current = text;
	const mounted = useRef(true);
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const activated = useRef(false);
	useEffect(() => {
		if (!owned.enabled || activated.current) return;
		activated.current = true;
		if (!owned.draft) notebook!.tutor.updateText(owner, value);
	}, [owned.enabled, owned.draft, notebook, toolCallId, value]);
	const change = (value: string) => {
		textRef.current = value;
		if (notebook?.getSnapshot().view?.contextId) notebook.tutor.updateText(owner, value);
		if (mounted.current) { setDraft(value); onChange(value); }
	};
	const transfer = useHandwritingEditor(targetKey, () => ({ readingThinking: textRef.current }), draft => change(draft.readingThinking ?? ""), claim);
	useDictationTarget(
		useCallback(
			(t: string) => {
				change(joinDictation(textRef.current, t));
			},
			[notebook, toolCallId, onChange],
		),
		owns,
		() => transfer?.retainSpeech(targetKey, "readingThinking"),
	);
	const editor = () => paneRef.current?.querySelector<HTMLElement>('[aria-label="Thinking while reading"]') ?? null;
	const savePlace = () => {
		const field = editor();
		if (!field) return;
		const saved = { selection: field.contains(document.activeElement) || document.activeElement === field ? readPathSelection(field) : place.current?.selection ?? null, scroll: field.scrollTop };
		place.current = saved;
		try { window.localStorage.setItem(placeKey, JSON.stringify(saved)); } catch { /* this view only */ }
		field.blur();
	};
	const restorePlace = () => {
		// The cursor and scroll come back where they were (this visit, or the
		// last one, kept on this device like other drafts).
		requestAnimationFrame(() => {
			const field = editor();
			if (!field) return;
			let saved = place.current;
			if (!saved) { try { saved = JSON.parse(window.localStorage.getItem(placeKey) ?? "null"); } catch { saved = null; } }
			field.focus({ preventScroll: true });
			if (saved) {
				field.scrollTop = saved.scroll;
				if (saved.selection) { try { restorePathSelection(field, saved.selection); } catch { /* text changed: caret at the end */ } }
			}
		});
	};
	const openPane = () => {
		// P2-B: the paragraph in view when the pane opens (or the question).
		if (peekStyle === "strip") { setStrip(captureStrip(entryRef.current, questionOpen)); setStripOpen(false); }
		setPeeking(false);
		setPaneOpen(true);
		restorePlace();
	};
	const closePane = () => {
		savePlace();
		setPeeking(false);
		setPaneOpen(false);
	};
	// P2-C: a peek shows the lesson where the learner left it, the pane held
	// open behind "Return to writing"; nothing in the note changes.
	const peek = () => { savePlace(); setPeeking(true); };
	const unpeek = () => { setPeeking(false); restorePlace(); };
	useEffect(() => {
		if (!peeking) return;
		const root = document.documentElement;
		if (questionOpen) root.dataset.readingPeek = "true";
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); unpeek(); } };
		document.addEventListener("keydown", onKey);
		return () => { delete root.dataset.readingPeek; document.removeEventListener("keydown", onKey); };
	}, [peeking, questionOpen]);
	// The pane fits the visible viewport, so its bottom bar sits above the
	// on-screen keyboard, in thumb reach.
	useEffect(() => {
		if (!paneOpen) return;
		const view = window.visualViewport;
		const fit = () => {
			const el = paneRef.current;
			if (!el || (view && view.scale !== 1)) return;
			el.style.setProperty("--lh-pane-top", `${view?.offsetTop ?? 0}px`);
			el.style.setProperty("--lh-pane-height", `${view?.height ?? window.innerHeight}px`);
		};
		fit();
		view?.addEventListener("resize", fit);
		view?.addEventListener("scroll", fit);
		window.addEventListener("resize", fit);
		return () => { view?.removeEventListener("resize", fit); view?.removeEventListener("scroll", fit); window.removeEventListener("resize", fit); };
	}, [paneOpen]);
	// Swipe the pane back to the right to close it (a mostly sideways drag).
	const swipe = useRef<{ id: number; x: number; y: number; dx: number; on: boolean } | null>(null);
	const swipeDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== "touch" || !event.isPrimary) return;
		swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, on: false };
	};
	const swipeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const s = swipe.current; if (!s || s.id !== event.pointerId) return;
		const dx = event.clientX - s.x, dy = event.clientY - s.y;
		if (!s.on) { if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5 || dx < 0) { if (Math.abs(dy) > 12) swipe.current = null; return; } s.on = true; }
		s.dx = Math.max(0, dx);
		if (paneRef.current) paneRef.current.style.transform = `translateX(${s.dx}px)`;
	};
	const swipeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
		const s = swipe.current; if (!s || s.id !== event.pointerId) return;
		swipe.current = null;
		if (paneRef.current) paneRef.current.style.transform = "";
		if (s.on && s.dx > Math.min(120, window.innerWidth * 0.3)) closePane();
	};
	const preview = text.trim();
	const showQuestion = claim && onOpen ? <button type="button" className="lh-phone-reveal" data-style={revealStyle} aria-label="Show question" data-testid="teach-check-reveal" onClick={onOpen}><span className="lh-phone-reveal-label" aria-hidden="true">Show question</span><ChevronRightIcon size={18} /></button> : null;
	const bigMic = paneMode && controls === "big-mic";
	const field: ReactNode = <CompactLearningInput dictation={dictation} speech={!bigMic}><PathInput
				aria-label="Thinking while reading"
				value={text}
				onValueChange={change}
				/* py-0.5 (owner round, 2026-10-07): the scrollbar fix. Source
				   Sans 3's font box is 22px at 16px; lh-input's 1.25 leading
				   gives a 20px line box — the content area sticks 1px below the
				   line, Chromium counts it in scrollHeight, and a zero-padding
				   textarea turns that into a permanent 1px scroll (the bar shows
				   empty and at every size below max-h). 2px of vertical padding
				   absorbs it — the same absorption the composer and dock fields
				   get implicitly from their py-2. Line-height stays 1.25 (the
				   caret law, typography round 2). */
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						// Esc stops dictation (the strip's rule) — claimed so the
						// window chain doesn't also read it as abort-turn.
						e.preventDefault();
						e.stopPropagation();
						onEscape?.();
						return;
					}
					// ENTER OPENS THE WAITING CHECK (owner, keyboard round
					// 2026-10-06): while the check sits closed, plain Enter
					// (and the universal ⌘/Ctrl+Enter) opens it — the dictation
					// flush lands HERE first via the caller's finishDictation,
					// so spoken thoughts ride along. Shift+Enter stays a newline.
					if (e.key === "Enter" && onOpen !== undefined && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						e.stopPropagation();
						if (!transfer?.preparing) onOpen();
						return;
					}
					// The dock's dumping convention: plain Enter is a newline.
					// No submit button here — the check's own submit is this
					// field's carrier — so ⌘↵ just blurs.
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						e.currentTarget.blur();
					}
				}}
				// P8 (round 14): on phones the field is a one-line invitation whose
				// placeholder carries the step's name (the label row steps back).
				placeholder={bigMic ? "Write, or tap the mic below and speak" : paneMode ? "Write, or tap the mic and speak" : "Whatever comes to mind as you read."}
				className="field-sizing-content lh-input max-h-40 w-full resize-none bg-transparent py-0.5 outline-none placeholder:text-muted-foreground/70"
			/></CompactLearningInput>;
	const label = <div className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground lh-reading-label">Thinking while reading</div>;
	const error = owned.state.error && <p role="alert" className="text-xs text-destructive">{owned.state.error}</p>;
	const ownerProps = {
		"data-input-owner": "tutor",
		"data-notebook-question": toolCallId,
		"data-notebook-channel": "reading-thinking",
	} as const;
	const engage = () => setEngaged(true);
	if (paneMode) {
		// The lesson keeps a labelled button (with a preview of the thought);
		// the pane holds the one editor, mounted throughout so the draft,
		// cursor and scroll stay exactly where the learner left them.
		const back = questionOpen ? "Question" : "Lesson";
		const pane = (
			<div ref={paneRef} id={paneId} {...ownerProps} data-reading-pane-for={workspaceId} role="dialog" aria-modal="true" aria-label="Thinking while reading" data-testid="reading-pane"
				data-open={paneOpen || undefined} data-peeking={peeking || undefined} data-controls={controls} data-peek-style={peekStyle} inert={!paneOpen || peeking} className="lh-reading-pane"
				onPointerDown={swipeDown} onPointerMove={swipeMove} onPointerUp={swipeEnd} onPointerCancel={swipeEnd}
				onKeyDown={(event) => {
					// One Escape, one layer: a menu opened from the pane's bar closes first.
					if (event.key !== "Escape" || dictation?.active || event.defaultPrevented || (event.target as Element | null)?.closest?.('[role="menu"], [data-lh-menu], [data-testid="page-menu"], [data-testid="helpers-sheet"]')) return;
					event.preventDefault(); event.stopPropagation(); closePane();
				}}>
				{peekStyle === "strip" && strip ? (
					<div className="lh-reading-strip" data-testid="reading-pane-strip" data-expanded={stripOpen || undefined}>
						<button type="button" className="lh-reading-strip-toggle" data-testid="reading-pane-strip-toggle" aria-expanded={stripOpen} onClick={() => setStripOpen((open) => !open)}>
							<span className="lh-reading-strip-label">{strip.from === "question" ? "From the question" : "From the lesson"}</span>
							<span className="lh-reading-strip-action">{stripOpen ? "Less" : "More"}<ChevronDownIcon aria-hidden /></span>
						</button>
						{/* A copy of what the learner was reading: read-only, and it
						    scrolls on its own once opened. */}
						<div className="lh-reading-strip-text lh-prose" data-testid="reading-pane-strip-text" tabIndex={stripOpen ? 0 : -1}
							dangerouslySetInnerHTML={{ __html: stripOpen ? strip.more : strip.first }} />
					</div>
				) : (
					<header className="lh-reading-pane-head">
						<h2 className="lh-reading-pane-title">Thinking while reading</h2>
						<p className="lh-reading-pane-hint">Whatever comes to mind as you read. It goes with your answer.</p>
					</header>
				)}
				<div className="lh-reading-pane-body" data-testid="reading-thinking-field" data-reading-claim={claim} data-focused={focused || undefined} {...focusHandlers}>
					{error}
					<div className="lh-reading-pane-field">{field}</div>
				</div>
				{/* F4 (round 16): Back and the controls in a bar at the bottom of
				    the visible screen — above the keyboard, in thumb reach. */}
				<div className="lh-reading-pane-bar" data-testid="reading-pane-bar">
					<button type="button" className="lh-reading-pane-close" data-testid="reading-pane-close" aria-label={`Back to ${back.toLowerCase()}`} onClick={closePane}>
						<ChevronLeftIcon aria-hidden />{back}
					</button>
					{bigMic && <PaneMic dictation={dictation} />}
					<span className="lh-reading-pane-bar-end">
						{peekStyle === "peek" && <button type="button" className="lh-reading-pane-peek" data-testid="reading-pane-peek" aria-label="Peek at lesson" onClick={peek}>
							<EyeIcon aria-hidden /><span className="lh-reading-pane-peek-label">Peek at lesson</span>
						</button>}
						{bigMic ? <PaneKeyboardToggle /> : paneOpen && <PageMenuButton placement="pane" />}
					</span>
				</div>
			</div>
		);
		// P2-A: while the pane holds a note, the lesson offers one tap back to
		// it, in the dock band beside Show question (never over the text).
		const pill = peekStyle === "pill" && !!preview && !questionOpen;
		return (
			<div ref={entryRef} className="lh-reading-entry pointer-events-auto" data-testid="reading-entry" data-compact={pill || undefined} {...ownerProps} data-reading-claim={claim} data-reading-pane-id={paneId}>
				{pill ? (
					<button type="button" className="lh-reading-continue" data-testid="reading-pane-continue" aria-haspopup="dialog" aria-expanded={paneOpen} onClick={openPane}>
						<PenLineIcon aria-hidden />Continue writing
					</button>
				) : (
					<button type="button" className="lh-reading-open" data-testid="reading-pane-open" aria-haspopup="dialog" aria-expanded={paneOpen} onClick={openPane}>
						<NotebookPenIcon aria-hidden />
						<span className="lh-reading-open-text">
							<span className="lh-reading-open-label">Thinking while reading</span>
							<span className="lh-reading-open-preview">{preview || "Add a thought"}</span>
						</span>
						<ChevronRightIcon aria-hidden />
					</button>
				)}
				{showQuestion}
				{typeof document !== "undefined" && createPortal(pane, document.body)}
				{peeking && typeof document !== "undefined" && createPortal(
					<div className="lh-reading-return-bar" data-testid="reading-pane-return-bar">
						<button type="button" className="lh-reading-return" data-testid="reading-pane-return" onClick={unpeek}>
							<PenLineIcon aria-hidden />Return to writing
						</button>
					</div>,
					document.body,
				)}
			</div>
		);
	}
	return (
		<div
			ref={rootRef}
			{...ownerProps}
			data-reading-claim={claim}
			data-testid="reading-thinking-field"
			data-folded={!claim && !unfolded ? "true" : undefined}
			data-focused={focused || undefined}
			{...focusHandlers}
			onPointerDownCapture={engage}
			onFocusCapture={engage}
			className="lh-reading-input pointer-events-auto mb-2 rounded-2xl border bg-card/60 px-3 py-2 transition-colors focus-within:border-primary/50"
		>
			{!claim && <button type="button" className="lh-reading-fold" aria-expanded={unfolded} data-testid="reading-thinking-fold" onClick={() => setUnfolded((open) => !open)}>
				<span className="lh-reading-fold-label">Thinking while reading</span>
				{/* R12 (round 15): the preview shows only while folded — opened,
				    the text is right below, never twice. */}
				{!unfolded && <span className="lh-reading-fold-preview">{preview || "Add a thought"}</span>}
				<ChevronRightIcon aria-hidden className="lh-reading-fold-chevron" />
			</button>}
			{label}
			{error}
			<div className="lh-compact-row">{field}{showQuestion}</div>
		</div>
	);
}

/** P1-B: the big mic in the pane's bottom bar. It shows the recording
 *  state (a ring that follows the voice) and stops on a second tap. */
function PaneMic({ dictation }: { dictation?: Dictation }) {
	const recover = useDictationRecovery(dictation);
	const active = !!dictation?.active;
	const phase = dictation?.phase;
	const [level, setLevel] = useState(0);
	useEffect(() => {
		if (!dictation || phase !== "recording") { setLevel(0); return; }
		return sampleDictationMeter(dictation.levelRef, (update) => setLevel((previous) => {
			const next = typeof update === "function" ? update([previous]) : update;
			return next.at(-1) ?? 0;
		}));
	}, [dictation, phase]);
	const status = phase === "connecting" ? "Connecting…" : phase === "stopping" ? "Finishing…" : active ? "Recording" : "";
	return (
		<span className="lh-pane-mic-wrap">
			<button type="button" className="lh-pane-mic" data-testid="reading-pane-mic" data-recording={active || undefined}
				aria-label={active ? "Stop dictation" : "Start dictation"} aria-pressed={active} disabled={!dictation || phase === "stopping"}
				onClick={() => { if (active) dictation?.stop(); else recover(); }}>
				<span className="lh-pane-mic-ring" aria-hidden="true" style={{ transform: `scale(${1 + Math.min(1, level) * 0.35})` }} />
				{active ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
			</button>
			<span className="sr-only" role="status">{status}</span>
		</span>
	);
}

/** P1-B: the keyboard switch in the pane — the same setting as ⋯'s
 *  "Keep keyboard closed" (a deliberate exception for this try-out). */
function PaneKeyboardToggle() {
	const off = useKeyboardOff();
	return (
		<button type="button" className="lh-pane-keyboard" data-testid="reading-pane-keyboard" aria-pressed={!off}
			aria-label={off ? "Keyboard off: tap to type" : "Keyboard on: tap to keep it closed"} onClick={() => setKeyboardOff(!off)}>
			{off ? <KeyboardOffIcon aria-hidden /> : <KeyboardIcon aria-hidden />}
			<span aria-hidden="true">{off ? "Keys off" : "Keys on"}</span>
		</button>
	);
}

const STRIP_BLOCKS = "p, li, h1, h2, h3, h4, blockquote, pre, table, .katex-display";
/** P2-B: copy the paragraph in view (and a few after it) for the pane's
 *  "From the lesson" strip — or the question's text when it is open. */
function captureStrip(entry: HTMLElement | null, questionOpen: boolean): { from: "lesson" | "question"; first: string; more: string } | null {
	const root = entry?.closest<HTMLElement>("[data-session-workspace]") ?? document.body;
	const copy = (nodes: Element[]) => nodes.map((node) => {
		const clone = node.cloneNode(true) as Element;
		clone.querySelectorAll("button, input, textarea, select, [contenteditable], script, style").forEach((el) => el.remove());
		clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
		clone.removeAttribute("id");
		return clone.outerHTML;
	}).join("");
	if (questionOpen) {
		const question = root.querySelector('[data-testid="question-dock"] .lh-question-text');
		if (question) return { from: "question", first: copy([question]), more: copy([question]) };
	}
	const content = [...root.querySelectorAll<HTMLElement>("[data-session-find-root]")].find((el) => !el.hasAttribute("data-dock-scroll-area"));
	if (!content) return null;
	let scroller: HTMLElement | null = content.parentElement;
	while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
	const box = (scroller ?? content).getBoundingClientRect();
	const dock = root.querySelector(".lh-dock-block")?.getBoundingClientRect();
	const bottom = Math.min(box.bottom, dock && dock.height ? dock.top : box.bottom);
	const top = Math.max(box.top, 0);
	const reading = top + (bottom - top) * 0.3;
	const blocks = [...content.querySelectorAll(STRIP_BLOCKS)].filter((el) => !el.querySelector(STRIP_BLOCKS) && !el.closest(".lh-dock-overlay") && (el.textContent ?? "").trim());
	if (blocks.length === 0) return null;
	let index = blocks.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top <= reading && r.bottom >= reading; });
	if (index < 0) index = blocks.findIndex((el) => el.getBoundingClientRect().bottom > top);
	if (index < 0) index = blocks.length - 1;
	return { from: "lesson", first: copy([blocks[index]!]), more: copy(blocks.slice(index, index + 6)) };
}
