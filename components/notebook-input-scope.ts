/** A portaled review is still an input surface of its owning workspace. */
export function notebookInputBelongsTo(root: HTMLElement, target: HTMLElement) {
	return root.contains(target) || !!root.id && (target.closest<HTMLElement>("[data-notebook-workspace]")?.dataset.notebookWorkspace === root.id
		// Round 15 (F6): the phone's reading-note pane lives outside the session
		// (a full-screen layer) but is that session's field.
		|| target.closest<HTMLElement>("[data-reading-pane-for]")?.dataset.readingPaneFor === root.id);
}
