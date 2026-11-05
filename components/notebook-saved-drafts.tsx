"use client";

import { useState, useSyncExternalStore } from "react";
import { CONFIDENCE_STOPS, explanationHasContent, type LhMessage } from "@/src/core";
import type { NotebookSession } from "./notebook-session";
import { LearnerExplanation } from "./learner-explanation";

/** Old activity inputs never attach themselves to the currently active input. */
export function NotebookSavedDrafts({ session, questionId, problemId, messages = [] }: { session: NotebookSession; questionId?: string; problemId?: string; messages?: readonly LhMessage[] }) {
	const state = useSyncExternalStore(session.tutor.subscribe, session.tutor.getSnapshot, session.tutor.getSnapshot);
	const [error, setError] = useState<string | null>(null);
	const drafts = state.drafts.filter(draft => draft.owner.kind !== "ordinary"
		&& (draft.owner.kind === "question" ? draft.owner.toolCallId !== questionId : draft.owner.problemCallId !== problemId)
		&& (explanationHasContent(draft.parts) || draft.form?.selection.selected.length || draft.form?.selection.otherSelected || draft.form?.selection.dontKnow));
	const recovery = state.recovery.filter(draft => draft.owner.kind !== "ordinary");
	if (!drafts.length && !recovery.length) return null;
	return <section aria-label="Saved drafts" className="space-y-3 border-t border-border p-3">
		<h3 className="text-sm font-medium">Saved drafts</h3>
		{drafts.map(draft => <article key={draft.id} className="space-y-2 rounded border border-border p-2" data-saved-draft={draft.id}>
			<p className="text-xs text-muted-foreground">{draft.owner.kind === "question" ? `Question ${draft.owner.toolCallId} · ${draft.owner.channel}` : draft.owner.kind === "practice" ? `Problem ${draft.owner.problemCallId}` : "Tutor"}</p>
			<LearnerExplanation parts={draft.parts} />
			{draft.form && <div className="text-xs text-muted-foreground">
				{draft.form.selection.selected.length > 0 && <p>Selected options: {draft.form.selection.selected.map(index => index + 1).join(", ")}</p>}
				{draft.form.selection.otherSelected && <p>Other: {draft.form.other}</p>}
				{draft.form.selection.dontKnow ? <p>I don’t know</p> : messages.some(message => message.role === "assistant" && message.content.some(part => part.type === "toolCall" && draft.owner.kind === "question" && part.id === draft.owner.toolCallId && (part.name === "quiz" || part.name === "probe"))) && <p>Confidence: {CONFIDENCE_STOPS[draft.form.confidenceIndex]}%</p>}
			</div>}
			<div className="flex gap-3 text-xs">
				<button type="button" onClick={() => { void navigator.clipboard.writeText([...draft.parts.filter(part => part.kind === "text").map(part => part.text), draft.form?.other ?? ""].filter(Boolean).join("\n\n")).catch(() => setError("Text could not be copied")); }}>Copy text</button>
				<button type="button" onClick={() => { void session.tutor.discard(draft.owner).catch(error => setError(error instanceof Error ? error.message : "Draft could not be discarded")); }}>Discard</button>
			</div>
		</article>)}
		{recovery.map(draft => <article key={`recovery:${draft.id}`} className="space-y-2 rounded border border-border p-2"><h4 className="text-xs">Local draft retained for review</h4><LearnerExplanation parts={draft.parts} /></article>)}
		{(error || state.error) && <p role="alert" className="text-xs text-destructive">{error || state.error}</p>}
	</section>;
}
