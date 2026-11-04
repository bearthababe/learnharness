"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, CheckIcon, EllipsisIcon, Loader2Icon, Maximize2Icon, Minimize2Icon, Undo2Icon } from "lucide-react";
import type { NotebookSession } from "./notebook-session";
import { NotebookWorking } from "./notebook-working";
import { DEFAULT_NOTEBOOK_CANDIDATE, NOTEBOOK_CANDIDATES, notebookCandidateSchema } from "@/src/core";
import { CompactLearningInput } from "./compact-learning-input";
import type { Dictation } from "./dictation";
import type { NotebookViewControls } from "./notebook-layout";
import { MenuShell } from "./menu-shell";

export function NotebookPanel({ session, dictation, viewControls }: { session: NotebookSession; dictation?: Dictation; viewControls?: NotebookViewControls }) {
	const { view, draftText, saving, editing, inputLocked, error, cursorLineId } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	const speech = useSyncExternalStore(session.speech.subscribe, session.speech.getSnapshot, session.speech.getSnapshot);
	const [menu, setMenu] = useState<"options" | "model" | "history" | "usage" | null>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const applyWaiting = editing || inputLocked;
	const modelLocked = !view || saving || applyWaiting || !!view.pending || speech.active;
	const candidate = view?.candidate ?? DEFAULT_NOTEBOOK_CANDIDATE;
	useEffect(() => {
		if (!menu) return;
		const outside = (event: PointerEvent) => {
			const target = event.target as Element;
			if (target.closest?.('[data-testid="notebook-options"]') || trigger.current?.contains(target)) return;
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
	return <section aria-label="Notebook" data-input-owner="notebook" className="notebook-panel flex min-h-0 min-w-0 flex-col border-border bg-background">
		<header className="notebook-frame-header" data-notebook-view-control=""><h2>Notebook</h2>
			<button type="button" aria-label="Undo" title="Undo" disabled={applyWaiting || !!view?.pending || !view?.canUndo} onClick={() => command("undo")}><Undo2Icon /></button>
			{viewControls && <button type="button" aria-label={viewControls.expanded ? "Back to split" : "Expand notebook"} title={viewControls.expanded ? "Back to split" : "Expand notebook"} onClick={viewControls.toggleExpanded}>
				{viewControls.expanded ? <Minimize2Icon /> : <Maximize2Icon />}
			</button>}
			<div className="contents" onKeyDown={event => {
				if (!menu) return;
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(); }
				// Portal keys bubble through their React owner. Enter activates a
				// choice, never the underlying Tutor or Notebook submission.
				if (event.key === "Enter") { event.stopPropagation(); if (!(event.target instanceof HTMLButtonElement)) event.preventDefault(); }
			}}>
				<button ref={trigger} type="button" aria-label="Notebook options" title="Notebook options" aria-expanded={menu !== null} aria-haspopup="menu" onClick={() => setMenu(menu ? null : "options")}><EllipsisIcon /></button>
				{menu && <MenuShell key={menu} anchorRef={trigger} testid="notebook-options" preferredSide="down" menuClass="notebook-options">
					{menu !== "options" && <div className="notebook-options-heading"><button type="button" aria-label="Back to Notebook options" onClick={() => setMenu("options")}><ArrowLeftIcon /></button><h3>{menu === "model" ? "Notebook model" : menu === "history" ? "History" : "Usage"}</h3></div>}
					{menu === "options" && <div role="menu" aria-label="Notebook options">
						<button type="button" role="menuitem" onClick={() => setMenu("model")}>Model<span>{NOTEBOOK_CANDIDATES[candidate].label}</span></button>
						<button type="button" role="menuitem" onClick={() => setMenu("history")}>History</button>
						<button type="button" role="menuitem" disabled={applyWaiting || !!view?.pending || !!view?.problem || !view?.contextId} onClick={() => command("start-fresh")}>Start fresh</button>
						<button type="button" role="menuitem" onClick={() => setMenu("usage")}>Usage</button>
						{viewControls && <button type="button" role="menuitem" onClick={() => { setMenu(null); viewControls.close(); }}>Close notebook</button>}
					</div>}
					{menu === "model" && <div role="menu" aria-label="Notebook model">{Object.entries(NOTEBOOK_CANDIDATES).map(([id, option]) => <button type="button" key={id} role="menuitemradio" aria-checked={candidate === id} disabled={modelLocked} data-notebook-candidate={id}
						onClick={() => { void session.dispatch({ type: "candidate", candidate: notebookCandidateSchema.parse(id) }).then(closeMenu).catch(() => {}); }}>
						{option.label}{candidate === id && <CheckIcon />}
					</button>)}</div>}
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
		</header>
		<form className="notebook-instruction-form" onSubmit={(event) => { event.preventDefault(); apply(); }}>
			<div className="notebook-input-row">
			<CompactLearningInput dictation={!dictation?.active || speech.destination === "notebook" ? dictation : undefined}>
			<textarea id="notebook-instruction" aria-label="Notebook instruction" placeholder="Notebook instruction" value={draftText} rows={1}
				className="lh-input w-full resize-none bg-transparent text-base"
				onChange={(event) => { void session.dispatch({ type: "draft", text: event.target.value }).catch(() => {}); }}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); apply(); }
					if (event.key === "Tab") event.stopPropagation();
				}} />
			</CompactLearningInput>
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
		<div data-notebook-scroll="" className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
			<NotebookWorking lines={view?.lines ?? []} selectedLineId={cursorLineId} onSelect={session.selectLine} />
			{view?.lines.length === 0 && <p className="text-sm text-muted-foreground">Your working appears here.</p>}
		</div>
	</section>;
}
