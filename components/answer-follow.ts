"use client";

/**
 * After a check is answered: bring the answered card to the top of the
 * transcript and let the tutor's reply come into view beneath it.
 *
 * The card cannot reach the top until there is enough content below it, so
 * a single scroll at submit time clamps short and (with auto-follow held off
 * so the reply doesn't push the card away) the reply would stream in under
 * the composer. Instead this follows the content for a short window: every
 * time it grows, the view moves on toward "card at the top", so the reply
 * appears below the card as it streams; once the card is at the top it
 * stays there. The first scroll, wheel, touch or key from the learner ends
 * it, so it never fights them.
 */
export type AnswerFollowDeps = {
	/** The transcript scroller (null while it is not mounted). */
	scroller: () => HTMLElement | null;
	/** Hold the stick-to-bottom auto-follow (it would drag the card away). */
	holdAutoFollow: () => void;
	/** How many answered cards were on screen when the answer was sent. */
	before: number;
	/** True while the question is still pending (not yet accepted, or back
	 *  after a failed send): the dock owns the bottom, so no scrolling. */
	pending?: () => boolean;
	/** Hand the view back to the bottom (the question returned). */
	release?: () => void;
	/** Gap kept above the card. */
	margin?: number;
	/** How long to keep following. */
	windowMs?: number;
};

const CARD = '[data-testid="answered-card"]';

export function followAnsweredCard({ scroller, holdAutoFollow, before, pending, release, margin = 16, windowMs = 25_000 }: AnswerFollowDeps): () => void {
	const started = Date.now();
	let done = false;
	let element: HTMLElement | null = null;
	let observed: Element | null = null;
	let moved = false;
	const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => tick()) : null;
	const interval = setInterval(() => tick(), 100);
	const stopOnUser = () => stop();
	const stopOnKey = (event: KeyboardEvent) => {
		if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) && !(event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable='true']"))) stop();
	};
	function attach(next: HTMLElement) {
		element = next;
		next.addEventListener("wheel", stopOnUser, { passive: true });
		next.addEventListener("touchstart", stopOnUser, { passive: true });
		if (typeof window !== "undefined") window.addEventListener("keydown", stopOnKey, true);
	}
	function stop() {
		if (done) return;
		done = true;
		clearInterval(interval);
		resize?.disconnect();
		element?.removeEventListener("wheel", stopOnUser);
		element?.removeEventListener("touchstart", stopOnUser);
		if (typeof window !== "undefined") window.removeEventListener("keydown", stopOnKey, true);
	}
	function tick() {
		if (done) return;
		if (Date.now() - started > windowMs) { stop(); return; }
		const view = scroller();
		if (!view) return;
		if (view !== element) {
			if (element) { element.removeEventListener("wheel", stopOnUser); element.removeEventListener("touchstart", stopOnUser); }
			attach(view);
		}
		const content = view.firstElementChild;
		if (content && content !== observed) { resize?.disconnect(); resize?.observe(content); observed = content; }
		if (pending?.()) {
			// The question is back (the send failed or is unconfirmed): give the
			// bottom back to its dock and stop following.
			if (moved) { stop(); release?.(); }
			return;
		}
		const cards = view.querySelectorAll<HTMLElement>(CARD);
		if (cards.length <= before) return; // the new card has not rendered yet
		const card = cards[cards.length - 1]!;
		const box = card.getBoundingClientRect();
		if (!card.isConnected || box.height === 0) return;
		const top = view.getBoundingClientRect().top;
		const desired = view.scrollTop + (box.top - top) - margin;
		const target = Math.max(0, Math.min(desired, view.scrollHeight - view.clientHeight));
		if (Math.abs(view.scrollTop - target) > 2) {
			view.scrollTop = target;
			moved = true;
			// A downward programmatic scroll reads as "heading for the end" to
			// stick-to-bottom; hold it now and once the scroll event has run.
			holdAutoFollow();
			const later = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 16);
			later(() => { if (!done) holdAutoFollow(); });
		}
	}
	tick();
	return stop;
}

/** Count of answered cards currently rendered in `scope`. */
export function answeredCardCount(scope: ParentNode | null | undefined): number {
	return scope ? scope.querySelectorAll(CARD).length : 0;
}
