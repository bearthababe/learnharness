"use client";

import { NOTEBOOK_ASSISTANCE, type LearnerExplanation as Explanation, type OwnedTutorDraft } from "@/src/core";
import { NotebookWorking } from "./notebook-working";

export function LearnerExplanation({ parts }: { parts: Explanation }) {
	return <div className="space-y-2" data-learner-explanation="">{parts.map((part) => part.kind === "text"
		? <div key={part.id} className="whitespace-pre-wrap">{part.text}</div>
		: <section key={part.id} data-snapshot-id={part.snapshotId} className="rounded border border-border p-2">
			<div className="text-xs font-medium">Notebook-assisted working</div>
			<p className="text-xs text-muted-foreground">{NOTEBOOK_ASSISTANCE}</p>
			<NotebookWorking lines={part.lines} />
		</section>)}</div>;
}

export function NotebookDraftReview({ draft, onTextChange }: { draft?: OwnedTutorDraft; onTextChange: (id: string, text: string) => void }) {
	if (!draft || draft.parts.length < 2) return null;
	return <section data-input-owner="tutor" data-notebook-question={draft.owner.kind === "question" ? draft.owner.toolCallId : undefined} data-notebook-channel={draft.owner.kind === "question" ? draft.owner.channel : undefined} data-problem={draft.owner.kind === "practice" ? draft.owner.problemCallId : undefined} aria-label="Earlier in this answer" className="max-h-56 overflow-auto overscroll-contain border-b border-border p-3">
		<h3 className="mb-2 text-xs font-medium text-muted-foreground">Earlier in this answer</h3>
		<div className="space-y-2">{draft.parts.slice(0, -1).map((part) => part.kind === "text"
			? <textarea key={part.id} data-notebook-part={part.id} aria-label="Earlier explanation" value={part.text} onChange={(event) => onTextChange(part.id, event.target.value)} className="field-sizing-content lh-input w-full resize-none bg-transparent text-sm" />
			: <LearnerExplanation key={part.id} parts={[part]} />)}</div>
	</section>;
}
