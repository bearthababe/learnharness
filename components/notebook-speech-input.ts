import type { NotebookSpeechInput } from "./notebook-speech";

/** Resolve the existing activity field, including an explicitly focused reading
 * field. A transcript never uses this lookup at cleanup: its reference is fixed. */
function resolveTutorField(root: HTMLElement, target?: HTMLElement) {
	const explicit = target?.closest<HTMLElement>('[data-notebook-question], [data-problem], [data-testid="composer"]');
	const scope = explicit ?? root.querySelector<HTMLElement>('[data-reading-claim="true"]')
		?? root.querySelector<HTMLElement>('[data-testid="question-dock"]')
		?? root.querySelector<HTMLElement>('[data-problem]')
		?? root.querySelector<HTMLElement>('[data-testid="composer"]') ?? root;
	const field = target?.matches("textarea") ? target as HTMLTextAreaElement : scope.querySelector<HTMLTextAreaElement>('textarea:not([aria-label="Earlier explanation"])');
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
	return { kind: "tutor", owner, text: field?.value ?? "", partId: target?.dataset.notebookPart };
}
