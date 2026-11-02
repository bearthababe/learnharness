"use client";

import { useState, useSyncExternalStore } from "react";
import type { NotebookSession } from "./notebook-session";

export function NotebookSpeechDestination({ session }: { session: NotebookSession }) {
	const speech = useSyncExternalStore(session.speech.subscribe, session.speech.getSnapshot, session.speech.getSnapshot);
	return speech.active ? <span role="status" data-notebook-speech-destination={speech.destination} className="text-xs text-muted-foreground">Dictating to {speech.destination === "notebook" ? "Notebook" : "Tutor"}</span> : null;
}

export function NotebookSpeechRecovery({ session }: { session: NotebookSession }) {
	const { view } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
	const speech = useSyncExternalStore(session.speech.subscribe, session.speech.getSnapshot, session.speech.getSnapshot);
	const [error, setError] = useState<string | null>(null);
	const runs = view?.speechRuns ?? [];
	const fragments = runs.flatMap(run => run.fragments.filter(fragment => run.unplaced?.includes(fragment.id) && !run.discarded?.includes(fragment.id)).map(fragment => ({ run, fragment })));
	const interrupted = runs.some(run => run.status === "interrupted");
	if (!interrupted && !fragments.length && !speech.error) return null;
	return <section aria-label="Dictation recovery" className="space-y-2 border-t border-border p-3 text-sm">
		{interrupted && <p role="status">Recording interrupted. Received words were restored; some speech may be missing.</p>}
		{fragments.length > 0 && <><h3 className="font-medium">Unplaced dictation</h3><p>Some dictation could not be placed. Review the retained text.</p></>}
		{fragments.map(({ run, fragment }) => <article key={`${run.id}:${fragment.id}`} className="space-y-2 rounded border border-border p-2">
			<p className="whitespace-pre-wrap">{fragment.text}</p>
			<div className="flex gap-3 text-xs">
				<button type="button" onClick={() => { void navigator.clipboard.writeText(fragment.text).catch(() => setError("Text could not be copied")); }}>Copy text</button>
				<button type="button" onClick={() => { void session.dispatch({ type: "discard-speech", runId: run.id, fragmentId: fragment.id }).catch(error => setError(error instanceof Error ? error.message : "Dictation could not be discarded")); }}>Discard</button>
			</div>
		</article>)}
		{error && <p role="alert">{error}</p>}
		{speech.error && <p role="alert">{speech.error}</p>}
	</section>;
}
