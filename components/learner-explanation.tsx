"use client";

import { NOTEBOOK_ASSISTANCE, type LearnerExplanation as Explanation, type OwnedTutorDraft } from "@/src/core";
import { NotebookWorking } from "./notebook-working";

export function LearnerExplanation({ parts }: { parts: Explanation }) {
	return <div className="space-y-2" data-learner-explanation="">{parts.map((part) => part.kind === "text"
		? <div key={part.id} className="whitespace-pre-wrap">{part.text}</div>
		: <section key={part.id} data-snapshot-id={part.snapshotId} className="rounded border border-border p-2">
			{part.pending ? <p role="status" className="text-sm">Working pending…</p> : <>
			<div className="text-xs font-medium">Notebook-assisted working</div>
			<p className="text-xs text-muted-foreground">{NOTEBOOK_ASSISTANCE}</p>
			{part.failure && <p className="text-xs">{part.failure}</p>}
			<NotebookWorking lines={part.lines} />
			</>}
		</section>)}</div>;
}

export function NotebookDraftReview({ draft, onTextChange }: { draft: OwnedTutorDraft; onTextChange: (id: string, text: string) => void }) {
	const label = draft.owner.kind !== "question" ? "Explanation" : draft.owner.channel === "text" ? "Answer" : draft.owner.channel === "thinking" ? "Thinking" : "Thinking while reading";
	return <section data-input-owner="tutor" data-notebook-question={draft.owner.kind === "question" ? draft.owner.toolCallId : undefined} data-notebook-channel={draft.owner.kind === "question" ? draft.owner.channel : undefined} data-problem={draft.owner.kind === "practice" ? draft.owner.problemCallId : undefined} aria-label={label} className="notebook-draft-review">
		<h4>{label}</h4>
		<div className="space-y-2">{draft.parts.map((part, index) => part.kind === "text"
			? <textarea key={part.id} data-notebook-part={part.id} aria-label={index === draft.parts.length - 1 ? "Current explanation" : "Earlier explanation"} value={part.text} rows={1} onChange={(event) => onTextChange(part.id, event.target.value)} className="field-sizing-content lh-input w-full resize-none bg-transparent text-base" />
			: <div key={part.id} data-snapshot-id={part.snapshotId}>
				{part.pending ? <p role="status">Working pending…</p> : <>{part.failure && <p>{part.failure}</p>}<NotebookWorking lines={part.lines} /></>}
			</div>)}</div>
	</section>;
}
