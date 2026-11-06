"use client";

/**
 * Tab past the end of the page (whole-app redesign). "Tab from nowhere
 * enters the main field" is a convenience for a page that has no focus yet;
 * it must not turn a learner's walk off the end of the page back into the
 * live question. A Tab whose default action leaves focus on <body> marks the
 * walk as wrapped, and the next Tab from nowhere stays native (the browser
 * continues from the start: sidebar, header…). A pointer press clears it.
 */

let wrapped = false;

/** Record a Tab pressed from a focused element; checked after its default. */
export function noteTabFromElement(): void {
	setTimeout(() => {
		const active = document.activeElement;
		wrapped = !active || active === document.body;
	}, 0);
}

export function tabbedOffEnd(): boolean {
	return wrapped;
}

export function clearTabWrap(): void {
	wrapped = false;
}
