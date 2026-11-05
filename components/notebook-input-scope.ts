/** A portaled review is still an input surface of its owning workspace. */
export function notebookInputBelongsTo(root: HTMLElement, target: HTMLElement) {
	return root.contains(target) || !!root.id && target.closest<HTMLElement>("[data-notebook-workspace]")?.dataset.notebookWorkspace === root.id;
}
