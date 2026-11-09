import type { NotebookSpeechInput } from "./notebook-speech";
import { readPathInput } from "./path-input-dom";

/** Resolve the existing activity field, including an explicitly focused reading
 * field. A transcript never uses this lookup at cleanup: its reference is fixed. */
function resolveTutorField(root: HTMLElement, target?: HTMLElement) {
	const explicit = target?.closest<HTMLElement>('[data-notebook-question], [data-problem], [data-testid="composer"]');
	const scope = explicit ?? root.querySelector<HTMLElement>('[data-reading-claim="true"]')
		?? root.querySelector<HTMLElement>('[data-testid="question-dock"]')
		?? root.querySelector<HTMLElement>('[data-problem]')
		?? root.querySelector<HTMLElement>('[data-testid="composer"]') ?? root;
	const field = target?.closest<HTMLElement>('textarea,[data-file-path-input]') ?? scope.querySelector<HTMLElement>('textarea:not([aria-label="Earlier explanation"]),[data-file-path-input]')
		// Round 15 (F6): on phones the reading note's button stands in the lesson
		// and its one editor lives in the pane it opens.
		?? (scope.dataset.readingPaneId ? root.ownerDocument.getElementById(scope.dataset.readingPaneId)?.querySelector<HTMLElement>('textarea,[data-file-path-input]') ?? null : null);
	return { scope, field };
}

export function focusNotebookTutorInput(root: HTMLElement, target?: HTMLElement) {
	resolveTutorField(root, target).field?.focus();
}

export function notebookTutorInput(root: HTMLElement, target?: HTMLElement): Extract<NotebookSpeechInput, { kind: "tutor" }> {
	const { scope, field } = resolveTutorField(root, target);
	const channel = scope.dataset.notebookChannel;
	const owner = scope.dataset.notebookQuestion ? { kind: "question" as const, toolCallId: scope.dataset.notebookQuestion, channel: channel === "reading-thinking" ? "reading-thinking" as const : channel === "text" ? "text" as const : "thinking" as const }
		: scope.dataset.problem ? { kind: "practice" as const, problemCallId: scope.dataset.problem } : { kind: "ordinary" as const };
	return { kind: "tutor", owner, text: field ? field.matches("textarea") ? (field as HTMLTextAreaElement).value : readPathInput(field) : "", partId: target?.dataset.notebookPart };
}
