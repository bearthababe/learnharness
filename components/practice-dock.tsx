"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, ChevronRightIcon } from "lucide-react";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { finishDictation, dictationCheckpoint, isDictationActive, joinDictation, useDictationTarget, type Dictation } from "@/components/dictation";
import { explanationHasContent, type NotebookInputFields } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import { useNotebookActivityDraft } from "./notebook-activity-draft";
import { useHandwritingEditor } from "./handwriting/submission";
import type { SharedWriting } from "@/src/core";
import { CompactLearningInput } from "@/components/compact-learning-input";
import { useEnterSubmits } from "@/components/enter-submits";
import { PathInput } from "@/components/path-input";
import { cn } from "@/lib/utils";

/**
 * The practice dock (practice sessions, owner design 2026-10-04): an
 * ACTIVE problem replaces the chat composer — the persistent bottom blob
 * morphs into the problem. The agent's statement above; the learner's
 * half below — "Your thinking", a labeled field with ONE Send button
 * (owner round 2, 2026-10-05): Enter sends, Shift+Enter makes a newline.
 * There are no lanes — whether a submission claims an answer is apparent
 * from the thinking itself; the agent reads it. One problem may carry
 * many submissions; each starts a turn.
 *
 * Collapse is owned by DockOverlay. Keep the learner's field mounted so
 * scrolling cannot reset capture feedback or editor state. On phones only
 * the problem statement collapses; wide layouts retain their slim bar.
 *
 * The commitment (modelSolution, decisionPoints, …) rides the tool call's
 * arguments and is NOT rendered here — only the statement is the
 * learner's. Esc dismisses the problem (the layered-Esc chain; the
 * confirm dialog then the silent route) — claimed by the page, not here.
 */

export interface PracticeDockProps {
	dictation?: Dictation;
	hasSharedWriting?: boolean;
	/** The active problem's tool-call id (submissions target it). */
	problemCallId: string;
	/** The pose's arguments — only the statement is the learner's (the
	 *  mode badge would edge toward announcing the target; dropped). */
	input: { statement: string };
	/** Collapse state, owned by the DockOverlay. */
	expanded: boolean;
	onExpand: () => void;
	/** text — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string, problemCallId: string, fields?: NotebookInputFields, reviewed?: SharedWriting[]) => void | Promise<boolean>;
	notebook?: NotebookSession;
	/** Escape in the thinking field stops dictation (threaded from the page). */
	onEscape?: () => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
}

export function PracticeDock({ dictation, problemCallId, input, expanded, onExpand, onSubmit, onEscape, notebook, compactionRunning = false, hasSharedWriting = false }: PracticeDockProps) {
	const owner = { kind: "practice" as const, problemCallId };
	const owned = useNotebookActivityDraft(notebook, owner);
	const [thinking, setThinking] = useState("");
	// Ref MIRRORS the field ("nothing gets lost", the question-dock
	// discipline): a submit resuming after `await finishDictation()` reads
	// the tail, never a stale closure.
	const thinkingRef = useRef("");
	const sending = useRef(false);
	const activated = useRef<string | null>(null);
	useEffect(() => {
		if (!owned.enabled || activated.current === problemCallId) return;
		activated.current = problemCallId;
		if (!owned.draft && thinkingRef.current) notebook!.tutor.updateText({ kind: "practice", problemCallId }, thinkingRef.current);
	}, [notebook, problemCallId, owned.enabled, owned.draft]);
	const update = (text: string) => {
		thinkingRef.current = text; setThinking(text);
		if (owned.enabled) notebook!.tutor.updateText(owner, text);
	};
	const alive = useRef(true), current = useRef({ problemCallId, compactionRunning, hasSharedWriting }); current.current = { problemCallId, compactionRunning, hasSharedWriting };
	useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
	if (owned.enabled && owned.draft) thinkingRef.current = owned.text;
	const transfer = useHandwritingEditor(`problem:${problemCallId}`, () => ({ thinking: thinkingRef.current }), draft => update(draft.thinking ?? ""), true);

	useDictationTarget(
		useCallback(
			(t: string) => {
				const part = notebook?.tutor.draft({ kind: "practice", problemCallId })?.parts.at(-1);
				update(joinDictation(part?.kind === "text" ? part.text : thinkingRef.current, t));
			},
			[notebook, problemCallId, owned.enabled],
		),
		true,
		() => transfer?.retainSpeech(`problem:${problemCallId}`, "thinking"),
	);

	const submit = async () => {
		if (compactionRunning || sending.current || notebook?.getSnapshot().sendBlocked || transfer?.blocked()) return;
		const reviewed = transfer?.reviewed(), recovery = transfer?.recoveryAction(), valid = dictationCheckpoint(), target = problemCallId;
		sending.current = true;
		// Capture this problem and adapter before finalization can change activity.
		try {
			await finishDictation();
			if ((reviewed?.length || recovery) && (!alive.current || current.current.problemCallId !== target || current.current.compactionRunning || !valid() || transfer?.blocked())) return;
			if (recovery) { await recovery(); return; }
			if (notebook?.getSnapshot().view?.contextId && (!hasSharedWriting || explanationHasContent(notebook.tutor.draft(owner)?.parts ?? []))) {
				const prepared = await notebook!.tutor.prepareSubmission(owner);
				try { await onSubmit(prepared.text, problemCallId, prepared, reviewed); }
				finally { await notebook!.tutor.reconcile(prepared.submission.id); }
			} else {
				// An owned draft was already checked above. Image-only submission
				// must not revive the legacy field after that draft was consumed.
				const text = notebook?.getSnapshot().view?.contextId ? "" : thinkingRef.current.trim();
				if (!text && !hasSharedWriting) return;
				const accepted = await onSubmit(text, problemCallId, undefined, reviewed);
				if (accepted !== false && !reviewed?.length && !transfer?.hasAttempt() && thinkingRef.current.trim() === text) update("");
			}
		} catch { /* The shared draft model exposes recoverable save failures. */ }
		finally { sending.current = false; }
	};

	/* ENTER SUBMITS FROM ANYWHERE (owner round 6, 2026-10-05): dictation
	 * means the field is often never focused — the window-level Enter
	 * (typing surfaces and buttons excluded) submits the trace. Mounted
	 * while the dock is — collapsed bar included (the trace survives). */
	useEnterSubmits(submit);

	return (
		<div data-testid="practice-dock" data-input-owner="tutor" data-problem={problemCallId} data-tutor-owner={JSON.stringify(owner)}>
			{!expanded ? (
			<button
				type="button"
				data-testid="practice-dock-bar"
				data-input-owner="tutor" data-problem={problemCallId}
				onClick={onExpand}
				className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronRightIcon className="size-4 shrink-0 rotate-90" />
				<span className="font-medium">Problem</span>
				<span className="min-w-0 flex-1 truncate">{input.statement}</span>
			</button>
			) : (
			<div data-dock-scroll-area="" className="max-h-[var(--dock-max-h,40vh)] overflow-y-auto px-4 pt-3 pb-2">
				<div className="mb-1 text-[12.5px] font-semibold text-muted-foreground">Problem</div>
				<div className="lh-prose text-[15px]">
					<ToolContentResponse>{input.statement}</ToolContentResponse>
				</div>
			</div>
			)}

			{/* The learner's half: Enter SENDS (owner round 2, 2026-10-05);
			    Shift+Enter makes a newline — less to decide about. */}
			<div
				data-testid="practice-thinking-field"
				className={cn("lh-question-input m-1.5 rounded-[12px] border border-border/80 bg-background/60 transition-colors focus-within:border-muted-foreground/60", !expanded && "lh-practice-collapsed")}
			>
				<div className="lh-input-label px-2.5 pt-2 text-[12.5px] font-semibold text-muted-foreground">
					Your thinking
				</div>
				<CompactLearningInput dictation={dictation}><PathInput
					aria-label="Your thinking"
					value={owned.enabled ? owned.text : thinking}
					onValueChange={(value) => {
						update(value);
					}}
					onKeyDown={(e) => {
						// Esc ends dictation — stopPropagation claims it (the
						// keyboard machine) so the window chain doesn't also fire.
						if (e.key === "Escape" && onEscape) {
							e.preventDefault();
							e.stopPropagation();
							onEscape();
							return;
						}
						// Enter SENDS — the single lane (owner round 2, 2026-10-05);
						// Shift+Enter is the newline, ⌘/Ctrl+Enter the chord too.
						if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							submit();
						}
					}}
					placeholder="Work here, think out loud."
					className={cn(
						"field-sizing-content lh-input max-h-64 min-h-16 w-full resize-none bg-transparent px-2.5 pb-2 outline-none placeholder:text-muted-foreground",
					)}
				/></CompactLearningInput>
				{/* The submit row (owner round 4, 2026-10-05): IDENTICAL to the
				    question dock's — hint left, the SAME Button (h-9, px-3.5),
				    one p-1 row. Corner radii concentric: shell 18 − m-1.5 (6) =
				    field 12 − p-1 (4) = button 8. */}
				<div className="lh-question-submit flex items-center justify-between gap-2 p-1">
					<span aria-hidden data-keys-hint={!compactionRunning || undefined} className="lh-submit-hint pl-1.5 text-[12px] text-(--lh-faint)">
						{compactionRunning ? "compacting session…" : "↵ submits · ⇧↵ newline"}
					</span>
					<Button
						type="button"
						data-testid="practice-send"
						aria-label="Submit thinking"
						disabled={owned.blocked || (!(owned.enabled ? explanationHasContent(owned.draft?.parts ?? []) : thinking.trim().length > 0) && !isDictationActive() && !hasSharedWriting && !transfer?.hasAttempt()) || compactionRunning}
						onClick={() => submit()}
						className="ml-auto h-9 rounded-[8px] px-4 text-[14px] font-semibold"
					>
						<span className="lh-wide-submit-label">Submit thinking</span><ArrowUpIcon className="lh-phone-submit-icon" size={20} strokeWidth={2.25} />
					</Button>
				</div>
			</div>
		</div>
	);
}
