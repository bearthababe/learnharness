"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisIcon, EyeIcon, InfoIcon, Loader2Icon, Maximize2Icon, Minimize2Icon, Undo2Icon, XIcon } from "lucide-react";
import type { NotebookSession } from "./notebook-session";
import { NotebookWorking } from "./notebook-working";
import { DEFAULT_NOTEBOOK_CANDIDATE, NOTEBOOK_CANDIDATES, NOTEBOOK_PICKER_MODELS, notebookCandidateFor, notebookPickerModel, type NotebookPickerModel, type TutorDraftOwner } from "@/src/core";
import { CompactLearningInput, useMicSlot } from "./compact-learning-input";
import type { Dictation } from "./dictation";
import type { NotebookViewControls } from "./notebook-layout";
import { MenuShell } from "./menu-shell";
import { NotebookDraftReview } from "./learner-explanation";
import { notebookActivityDrafts } from "./notebook-activity-draft";
import { useOneMenu } from "./one-menu";
import { BigMic, KeyboardToggle, PaneBar, PeekReturn, settleDocumentScroll } from "./pane-kit";
import { NotebookPeekSheet } from "./notebook-peek-sheet";
import { useTryout } from "./device-prefs";
import { useBugPress } from "./bug-capture";

/** B8 / P6 (round 20): the phone pane's command row holds Undo too, so below
 *  360px the field's example is the short form (the whole hint must fit). */
const NARROW_PHONE = "(max-width: 359px)";
function useNarrowPhone() {
	return useSyncExternalStore((change) => {
		const media = window.matchMedia?.(NARROW_PHONE);
		media?.addEventListener("change", change);
		return () => media?.removeEventListener("change", change);
	}, () => window.matchMedia?.(NARROW_PHONE).matches ?? false, () => false);
}

export function NotebookPanel({ session, dictation, viewControls, activity = { kind: "ordinary" }, workspaceId, pane, sessionTitle }: { session: NotebookSession; dictation?: Dictation; viewControls?: NotebookViewControls; activity?: TutorDraftOwner; workspaceId?: string;
	/** P5 (round 17, phones): the notebook takes over the screen like the
	 *  thinking pane — "‹ Lesson", the big mic bar, the keyboard button and
	 *  Peek (the lesson, with the working in a pull-up sheet). */
	pane?: { peeking: boolean; peek: () => void; unpeek: () => void };
	/** B7 (round 18): the session's title, shown in the phone pane so a session
	 *  reopened in its notebook says which session it is. */
	sessionTitle?: string }) {
	const { view, draftText, saving, editing, inputLocked, error, cursorLineId, expressionSelection } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	const speech = useSyncExternalStore(session.speech.subscribe, session.speech.getSnapshot, session.speech.getSnapshot);
	const drafts = useSyncExternalStore(session.tutor.subscribe, session.tutor.getSnapshot, session.tutor.getSnapshot);
	const attached = notebookActivityDrafts(drafts.drafts, activity);
	const hasWorking = attached.some(draft => draft.parts.some(part => part.kind === "working"));
	const [menu, setMenu] = useState<"options" | "model" | "history" | "usage" | "review" | "help" | null>(null);
	const bugPress = useBugPress(() => setMenu(null));
	const askTutor = useTryout("askTutor") === "on";
	const [micSlot, setMicSlot] = useMicSlot();
	const card = useTryout("cardLayout") === "card" && !!pane;
	const narrowPhone = useNarrowPhone();
	useOneMenu("notebook-options", menu !== null, () => setMenu(null));
	// After an instruction lands, the lines it added or changed glow briefly
	// (never on first load), so the learner sees what moved.
	const previousLines = useRef<Map<string, string> | null>(null);
	const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set());
	useEffect(() => {
		const lines = view?.lines;
		if (!lines) return;
		const prior = previousLines.current;
		previousLines.current = new Map(lines.map(line => [line.id, line.latex]));
		if (!prior) return;
		const ids = new Set(lines.filter(line => prior.get(line.id) !== line.latex).map(line => line.id));
		if (ids.size === 0) return;
		// L6 (round 19): the lines Apply changed keep a quiet marker until the
		// next change (they glow first), so they are easy to find afterwards.
		setChanged(ids);
	}, [view?.lines]);
	const trigger = useRef<HTMLButtonElement>(null);
	const helpTrigger = useRef<HTMLButtonElement>(null);
	const applyWaiting = editing || inputLocked;
	const modelLocked = !view || saving || applyWaiting || !!view.pending || speech.active;
	const candidate = view?.candidate ?? DEFAULT_NOTEBOOK_CANDIDATE;
	const model = notebookPickerModel(candidate);
	const reasoningLabels = { off: "Off", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
	useEffect(() => {
		if (!menu) return;
		const outside = (event: PointerEvent) => {
			const target = event.target as Element;
			if (target.closest?.('[data-testid="notebook-options"], [data-testid="notebook-help-card"]') || trigger.current?.contains(target) || helpTrigger.current?.contains(target)) return;
			setMenu(null);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [menu]);
	useEffect(() => { if (!view?.visible) setMenu(null); }, [view?.visible]);
	const closeMenu = () => { setMenu(null); trigger.current?.focus(); };
	const command = (type: "undo" | "start-fresh") => {
		setMenu(null);
		void session.speech.choose({ kind: "notebook" }).then(() => session.dispatch({ type })).catch(() => {});
	};
	const apply = () => {
		if (applyWaiting) return;
		if (session.speech.apply()) return;
		if (!draftText.trim()) return;
		void session.dispatch({ type: "apply", cursorLineId }).catch(() => {});
	};
	// The picked line or term shows in the header (round 11), where the
	// title was: no extra row between the working and the instruction.
	const scopedLine = cursorLineId && view?.lines.some(line => line.id === cursorLineId) ? view.lines.findIndex(line => line.id === cursorLineId) + 1 : null;
	const scopeText = scopedLine === null || !view ? null : expressionSelection
		? `Term ${expressionSelection.number} · line ${view.lines.findIndex(line => line.id === expressionSelection.lineId) + 1}`
		: `Line ${scopedLine}`;
	const instruction = <>
		<form className="notebook-instruction-form" onSubmit={(event) => { event.preventDefault(); apply(); }}>
			<div className="notebook-input-row">
			<CompactLearningInput dictation={!dictation?.active || speech.destination === "notebook" ? dictation : undefined} speech={!pane} micSlot={pane ? undefined : micSlot}>
			<textarea id="notebook-instruction" aria-label="Notebook instruction" placeholder={scopeText ? (expressionSelection ? "Instruction for this term" : "Instruction for this line") : pane && narrowPhone ? "e.g. Write p = F/A" : "e.g. Write p = F/A, put in F = 600 N"} value={draftText} rows={1}
				className="lh-input w-full resize-none bg-transparent text-base"
				onChange={(event) => { void session.dispatch({ type: "draft", text: event.target.value }).catch(() => {}); }}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); apply(); }
					if (event.key === "Tab") event.stopPropagation();
				}} />
			</CompactLearningInput>
			{/* S1 (round 17): the mic, right before Apply (the pane's is in its bar). */}
			{!pane && <span ref={setMicSlot} className="lh-mic-slot" />}
			{/* P6 (round 20): in the phone pane the correction loop stays under the
			    hand — Undo right before Apply, by the command field (not at the
			    header's far edge). */}
			{pane && <button type="button" className="notebook-undo-inline" data-testid="notebook-undo" aria-label="Undo" title="Undo the last change" disabled={applyWaiting || !!view?.pending || !view?.canUndo} onClick={() => command("undo")}><Undo2Icon /></button>}
			<button type="submit" aria-label="Apply changes" disabled={!speech.active && !draftText.trim() || applyWaiting} className="notebook-apply">{editing ? <Loader2Icon className="animate-spin" /> : "Apply"}</button>
			</div>
			{(saving || editing) && <span className="sr-only" role="status">{editing ? view?.pending?.status === "awaiting-transcript" ? "Working pending…" : "Applying changes…" : "Saving…"}</span>}
			{(error || view?.problem) && <details key={error ?? view?.problem?.operationId} className="notebook-notice" data-notebook-view-control="">
				<summary role="status">{error ? "Not saved" : "Waiting for correction"}</summary>
				{error && <p>{error}</p>}
				{view?.problem && <p>{view.problem.message}</p>}
				{error && <button type="button" onClick={() => { void session.refresh(); }}>Refresh</button>}
			</details>}
		</form>
	</>;
	return <section aria-label="Notebook" data-input-owner="notebook" data-learning-surface="" data-pane={pane ? (card ? "card" : "plain") : undefined} data-testid="notebook-panel" className="notebook-panel flex min-h-0 min-w-0 flex-col border-border bg-background">
		<div className="notebook-surface">
		<header className="notebook-frame-header" data-notebook-view-control=""><h2 className={scopeText || pane ? "sr-only" : undefined}>Notebook</h2>
			{/* L6 (round 19): the pane's header names it at the left (no empty corner). */}
			{pane && !scopeText && <p className="notebook-pane-kicker" data-testid="notebook-pane-kicker" aria-hidden="true">Equation notebook</p>}
			{scopeText && <p className="notebook-scope" data-testid="notebook-scope">
				<span><span className="sr-only">Apply changes to </span>{scopeText}</span>
				<button type="button" aria-label="Clear selection" onClick={() => session.clearSelection()}><XIcon /></button>
			</p>}
			{/* P5 (round 17): the help sits behind an info icon instead of over
			    the working. */}
			<button type="button" aria-label="How the notebook works" title="How the notebook works" data-testid="notebook-help" aria-expanded={menu === "help"} onClick={() => setMenu(menu === "help" ? null : "help")} ref={helpTrigger}><InfoIcon /></button>
			{!pane && <button type="button" aria-label="Undo" title="Undo" disabled={applyWaiting || !!view?.pending || !view?.canUndo} onClick={() => command("undo")}><Undo2Icon /></button>}
			{viewControls && !pane && (viewControls.expanded
				? <button type="button" className="notebook-back-lesson" data-testid="notebook-back-lesson" aria-label="Back to the lesson" title="Back to the lesson" onClick={viewControls.toggleExpanded}>
					<Minimize2Icon /><span>Lesson</span>
				</button>
				: <button type="button" aria-label="Expand notebook" title="Expand notebook" onClick={viewControls.toggleExpanded}><Maximize2Icon /></button>)}
			<div className="contents" onKeyDown={event => {
				if (!menu) return;
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(); }
				// Portal keys bubble through their React owner. Enter activates a
				// choice, never the underlying Tutor or Notebook submission.
				if (event.key === "Enter") { event.stopPropagation(); if (!(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLTextAreaElement)) event.preventDefault(); }
			}}>
				<button ref={trigger} type="button" aria-label="Notebook options" title="Notebook options" aria-expanded={menu !== null} aria-haspopup="menu" onClick={() => setMenu(menu ? null : "options")}><EllipsisIcon /></button>
				{menu === "help" && <MenuShell key="help" anchorRef={helpTrigger} testid="notebook-help-card" preferredSide="down" menuClass="notebook-options notebook-help" onClose={() => setMenu(null)}>
					<div className="notebook-menu-content" data-testid="notebook-help-text">
						<p>Say or type what to write, then <strong>Apply</strong>.</p>
						<p>To aim an instruction, tap a line <span className="notebook-hint-line" aria-hidden>1</span> or a term <span className="notebook-hint-term" aria-hidden>1</span> first.</p>
						<p>Your working goes with your next message or answer.</p>
					</div>
				</MenuShell>}
				{menu && menu !== "help" && <MenuShell key={menu} anchorRef={trigger} testid="notebook-options" preferredSide="down" menuClass="notebook-options" fitVisualViewport={menu === "review" || menu === "model"}>
					{menu !== "options" && <div className="notebook-options-heading"><button type="button" aria-label="Back to Notebook options" onClick={() => setMenu("options")}><ArrowLeftIcon /></button><h3>{menu === "model" ? "Notebook model" : menu === "history" ? "History" : menu === "review" ? "Review attached working" : "Usage"}</h3></div>}
					{menu === "options" && <div role="menu" aria-label="Notebook options">
						<button type="button" role="menuitem" onClick={() => setMenu("model")}>Model<span>{NOTEBOOK_CANDIDATES[candidate].label}</span></button>
						<button type="button" role="menuitem" onClick={() => setMenu("review")}>Review attached working</button>
						<button type="button" role="menuitem" onClick={() => setMenu("history")}>History</button>
						<button type="button" role="menuitem" disabled={applyWaiting || !!view?.pending || !!view?.problem || !view?.contextId} onClick={() => command("start-fresh")}>Start fresh</button>
						<button type="button" role="menuitem" onClick={() => setMenu("usage")}>Usage</button>
						{viewControls && <button type="button" role="menuitem" onClick={() => { setMenu(null); viewControls.close(); }}>Close notebook</button>}
						{/* §0 (round 19): the pane reaches 🐞 through its own ⋯ (tap: menu closed; hold: kept). */}
						<button type="button" role="menuitem" className="notebook-report" data-testid="notebook-options-report" {...bugPress}>🐞 Report a problem</button>
					</div>}
					{menu === "review" && <div data-notebook-workspace={workspaceId} inert={inputLocked} className="notebook-menu-content">
						{hasWorking ? attached.map(draft => <NotebookDraftReview key={draft.id} draft={draft} onTextChange={(id, text) => session.tutor.updateText(draft.owner, text, id)} />) : <p>No working attached yet.</p>}
						{drafts.error && <p role="alert">{drafts.error}</p>}
					</div>}
					{menu === "model" && <div role="menu" aria-label="Notebook model">
						<div role="group" aria-label="Model">{(Object.keys(NOTEBOOK_PICKER_MODELS) as NotebookPickerModel[]).map(id => <button type="button" key={id} role="menuitemradio" aria-checked={model === id} disabled={modelLocked} data-notebook-model={id}
							onClick={() => { void session.dispatch({ type: "candidate", candidate: notebookCandidateFor(id, candidate) }).catch(() => {}); }}>
							{NOTEBOOK_PICKER_MODELS[id].label}{model === id && <CheckIcon />}
						</button>)}</div>
						<h4 className="px-3 pt-3 pb-1 text-xs text-muted-foreground">Reasoning</h4>
						<div role="group" aria-label="Reasoning">{NOTEBOOK_PICKER_MODELS[model].candidates.map(id => <button type="button" key={id} role="menuitemradio" aria-checked={candidate === id} disabled={modelLocked} data-notebook-candidate={id}
							onClick={() => { void session.dispatch({ type: "candidate", candidate: id }).then(closeMenu).catch(() => {}); }}>
							{reasoningLabels[NOTEBOOK_CANDIDATES[id].thinkingLevel]}{candidate === id && <CheckIcon />}
						</button>)}</div>
					</div>}
					{menu === "history" && <section aria-label="Notebook history" className="notebook-menu-content">
						{!view?.history.length && <p>No earlier working yet.</p>}
						{view?.history.map((entry, index) => <article key={entry.id} aria-label={`Entry ${index + 1}`}>
							<h4>Entry {index + 1} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></h4>
							<NotebookWorking lines={entry.lines} />
						</article>)}
					</section>}
					{menu === "usage" && <div className="notebook-menu-content">
						<p>Reported tokens: {view?.usage.tokens ?? 0}</p><p>Unknown calls: {view?.usage.unknownCalls ?? 0}</p>
						<p>Subscription calls: {view?.usage.subscriptionCalls ?? 0}</p>
						<p>API-dollar subtotal: ${(view?.usage.apiSubtotal ?? 0).toFixed(4)} ({view?.usage.unpricedCalls ?? 0} unpriced calls)</p>
					</div>}
				</MenuShell>}
			</div>
			{viewControls && !pane && <button type="button" aria-label="Hide notebook" title="Hide notebook" data-testid="notebook-close" onClick={viewControls.close}><XIcon /></button>}
		</header>
		{/* B7 (round 18): the phone pane says what it is and whose it is — the
		    session's name above a readable title — so a session reopened in
		    its notebook is oriented at once. */}
		{pane && <div className="lh-pane-head notebook-card-head" data-testid="notebook-pane-head">
			{sessionTitle && <p className="lh-pane-session" data-testid="notebook-pane-session">{sessionTitle}</p>}
			<h2 className="lh-pane-title" data-testid="notebook-pane-title">Your working</h2>
		</div>}
		{instruction}
		<div data-notebook-scroll="" className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
			<NotebookWorking lines={view?.lines ?? []} selectedLineId={cursorLineId} expressionSelection={expressionSelection} onSelect={session.selectLine} onSelectExpression={session.selectExpression} changedIds={changed} />
			{/* P5 (round 17): one quiet line when empty; the how-to is behind ⓘ. */}
			{view?.lines.length === 0 && <p className="notebook-empty" data-testid="notebook-empty">No working yet. Say or type what to write.</p>}
		</div>
		{pane && card && <div className="lh-pane-actions notebook-card-actions" data-testid="notebook-pane-actions">
			<button type="button" className="lh-pane-main" data-testid="notebook-card-apply" disabled={!speech.active && !draftText.trim() || applyWaiting} onClick={apply}>Apply</button>
			<div className="lh-pane-quiet-row">
				<button type="button" className="lh-pane-quiet" data-testid="notebook-pane-back" onClick={() => { viewControls?.close(); settleDocumentScroll(); }}>Back to lesson</button>
				{askTutor && viewControls?.askTutor && <button type="button" className="lh-pane-quiet" data-testid="notebook-ask-tutor" onClick={() => { viewControls.askTutor!(); settleDocumentScroll(); }}>Ask tutor</button>}
			</div>
		</div>}
		</div>
		{pane && !card && <nav className="lh-pane-nav" aria-label="Leave the notebook">
			<button type="button" className="lh-pane-back" data-testid="notebook-pane-back" aria-label="Back to lesson" onClick={() => { viewControls?.close(); settleDocumentScroll(); }}>
				<ChevronLeftIcon aria-hidden />Lesson
			</button>
			{/* P2 (round 19, a try-out): the lesson's own chat box, with this working attached. */}
			{askTutor && viewControls?.askTutor && <button type="button" className="lh-pane-shortcut" data-testid="notebook-ask-tutor" onClick={() => { viewControls.askTutor!(); settleDocumentScroll(); }}>
				Ask tutor<ChevronRightIcon aria-hidden />
			</button>}
		</nav>}
		{pane && <PaneBar testid="notebook-pane-bar"
			start={<button type="button" className="lh-pane-peek" data-testid="notebook-pane-peek" aria-label="Peek at the lesson" onClick={() => { pane.peek(); settleDocumentScroll(); }}>
				<EyeIcon aria-hidden /><span aria-hidden="true">Peek</span>
			</button>}
			mic={<BigMic dictation={speech.destination === "notebook" || !dictation?.active ? dictation : undefined} testid="notebook-pane-mic" />}
			end={<KeyboardToggle testid="notebook-pane-keyboard" />} />}
		{pane?.peeking && <>
			<NotebookPeekSheet lines={view?.lines ?? []} changedIds={changed} />
			<PeekReturn label="Return to notebook" testid="notebook-pane-return" dictation={speech.destination === "notebook" ? dictation : undefined} onReturn={pane.unpeek} />
		</>}
	</section>;
}
