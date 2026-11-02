"use client";

import { useState, useSyncExternalStore } from "react";
import type { NotebookSession } from "./notebook-session";
import { NotebookWorking } from "./notebook-working";

export function NotebookPanel({ session }: { session: NotebookSession }) {
	const { view, draftText, saving, error, cursorLineId } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	const [historyOpen, setHistoryOpen] = useState(false);
	const applyWaiting = view?.pending?.kind === "edit" || !!view?.startFreshPending && !view.problem;
	const apply = () => {
		if (!draftText.trim() || applyWaiting) return;
		void session.dispatch({ type: "apply", cursorLineId }).catch(() => {});
	};
	return <section aria-label="Notebook" data-input-owner="notebook" className="notebook-panel flex min-h-0 min-w-0 flex-col border-border bg-background">
		<form className="max-h-full shrink-0 space-y-2 overflow-y-auto overscroll-contain border-b border-border p-3" onSubmit={(event) => { event.preventDefault(); apply(); }}>
			<label className="block text-sm font-medium" htmlFor="notebook-instruction">Notebook instruction</label>
			<textarea id="notebook-instruction" aria-label="Notebook instruction" value={draftText} rows={2}
				className="lh-input w-full resize-none rounded border border-border bg-transparent p-2 text-base" style={{ maxHeight: "min(8rem, 20dvh)", overflowY: "auto" }}
				onChange={(event) => { void session.dispatch({ type: "draft", text: event.target.value }).catch(() => {}); }}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); apply(); }
					if (event.key === "Tab") event.stopPropagation();
				}} />
			<div className="flex flex-wrap items-center gap-2">
				<button type="submit" disabled={!draftText.trim() || applyWaiting} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Apply changes</button>
				<button type="button" disabled={view?.startFreshPending || !view?.canUndo && !view?.pending} onClick={() => { void session.dispatch({ type: "undo" }).catch(() => {}); }} className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50">Undo</button>
				<button type="button" disabled={!view?.contextId || view.startFreshPending} onClick={() => { void session.dispatch({ type: "start-fresh" }).catch(() => {}); }} className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50">Start fresh</button>
				<button type="button" aria-expanded={historyOpen} aria-controls="notebook-history" onClick={() => setHistoryOpen(!historyOpen)} className="rounded border border-border px-3 py-1.5 text-sm">History</button>
				{saving && <span className="text-xs text-muted-foreground" role="status">Saving…</span>}
			</div>
			{view?.pending && view.pending.kind !== "start-fresh" && <p role="status" className="text-sm">{view.problem ? "Waiting for correction" : view.pending.status === "awaiting-transcript" ? "Working pending…" : view.pending.kind === "undo" ? "Undo waiting" : "Applying changes…"}</p>}
			{view?.startFreshPending && <p role="status" className="text-sm">{view.problem ? "Start fresh waiting for correction" : "Start fresh waiting for earlier operations"}</p>}
			{view?.problem && <p role="status" className="text-sm">{view.problem.message}</p>}
			{error && <p role="alert" className="text-sm text-destructive">Not saved: {error} <button type="button" className="underline" onClick={() => { void session.refresh(); }}>Refresh</button></p>}
		</form>
		<div data-notebook-scroll="" className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
			<NotebookWorking lines={view?.lines ?? []} selectedLineId={cursorLineId} onSelect={session.selectLine} />
			{view?.lines.length === 0 && <p className="text-sm text-muted-foreground">Your working appears here.</p>}
			{historyOpen && <section id="notebook-history" aria-label="Notebook history" className="mt-4 space-y-4 border-t border-border pt-3">
				<h3 className="text-sm font-medium">History</h3>
				{!view?.history.length && <p className="text-sm text-muted-foreground">No earlier working yet.</p>}
				{view?.history.map((entry, index) => <article key={entry.id} aria-label={`Entry ${index + 1}`}>
					<h4 className="text-sm font-medium">Entry {index + 1} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></h4>
					<NotebookWorking lines={entry.lines} />
				</article>)}
			</section>}
			<details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Usage</summary>
				<p>Reported tokens: {view?.usage.tokens ?? 0}</p>
				<p>Unknown calls: {view?.usage.unknownCalls ?? 0}</p>
				<p>Subscription calls: {view?.usage.subscriptionCalls ?? 0}</p>
				<p>API-dollar subtotal: ${(view?.usage.apiSubtotal ?? 0).toFixed(4)} ({view?.usage.unpricedCalls ?? 0} unpriced calls)</p>
			</details>
		</div>
	</section>;
}
