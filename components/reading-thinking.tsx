"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PathInput } from "@/components/path-input";
import { useHandwritingEditor } from "./handwriting/submission";
import { joinDictation, useDictationTarget, type Dictation } from "@/components/dictation";
import type { NotebookSession } from "./notebook-session";
import { useNotebookActivityDraft } from "./notebook-activity-draft";
import { CompactLearningInput, useFocusWithin } from "@/components/compact-learning-input";
import { usePhoneLayout } from "@/components/use-phone-viewport";
import { ChevronRightIcon } from "lucide-react";
import { useRevealStyle } from "@/components/device-prefs";

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
		claim,
		() => transfer?.retainSpeech(targetKey, "readingThinking"),
	);
	return (
		<div
			data-input-owner="tutor"
			data-notebook-question={toolCallId}
			data-notebook-channel="reading-thinking"
			data-reading-claim={claim}
			data-testid="reading-thinking-field"
			data-folded={!claim && !unfolded ? "true" : undefined}
			data-focused={focused || undefined}
			{...focusHandlers}
			className="lh-reading-input pointer-events-auto mb-2 rounded-2xl border bg-card/60 px-3 py-2 transition-colors focus-within:border-primary/50"
		>
			{!claim && <button type="button" className="lh-reading-fold" aria-expanded={unfolded} data-testid="reading-thinking-fold" onClick={() => setUnfolded((open) => !open)}>
				<span className="lh-reading-fold-label">Thinking while reading</span>
				<span className="lh-reading-fold-preview">{text.trim() ? text.trim() : "Add a thought"}</span>
				<ChevronRightIcon aria-hidden className="lh-reading-fold-chevron" />
			</button>}
			<div className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Thinking while reading
			</div>
			{owned.state.error && <p role="alert" className="text-xs text-destructive">{owned.state.error}</p>}
			<div className="lh-compact-row"><CompactLearningInput dictation={claim ? dictation : undefined}><PathInput
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
				placeholder={phone && claim ? "Thinking while reading" : "Whatever comes to mind as you read."}
				className="field-sizing-content lh-input max-h-40 w-full resize-none bg-transparent py-0.5 outline-none placeholder:text-muted-foreground/70"
			/></CompactLearningInput>
			{claim && onOpen && <button type="button" className="lh-phone-reveal" data-style={revealStyle} aria-label="Show question" data-testid="teach-check-reveal" onClick={onOpen}><span className="lh-phone-reveal-label" aria-hidden="true">Show question</span><ChevronRightIcon size={18} /></button>}
			</div>
		</div>
	);
}
