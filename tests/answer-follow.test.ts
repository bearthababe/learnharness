import assert from "node:assert/strict";
import { it } from "node:test";
import { followAnsweredCard } from "../components/answer-follow.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A transcript scroller with one answered card at `cardAt` (content px). */
function fakeScroller(cardAt: number) {
	const listeners = new Map<string, () => void>();
	const view = {
		scrollTop: 0,
		clientHeight: 500,
		scrollHeight: 700,
		cards: 1,
		firstElementChild: null,
		getBoundingClientRect: () => ({ top: 0 }),
		addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type),
		querySelectorAll: () => Array.from({ length: view.cards }, () => card),
		fire: (type: string) => listeners.get(type)?.(),
	};
	const card = { isConnected: true, getBoundingClientRect: () => ({ top: cardAt - view.scrollTop, height: 220 }) };
	return view;
}

it("after an answer, the view follows the content until the card reaches the top, so the reply shows below it", async () => {
	const view = fakeScroller(400);
	let holds = 0;
	const stop = followAnsweredCard({ scroller: () => view as unknown as HTMLElement, holdAutoFollow: () => { holds++; }, before: 0 });
	// The reply has not started: the card can only come as far as the end allows.
	assert.equal(view.scrollTop, 200);
	assert.ok(holds > 0, "auto-follow is held so the stream cannot drag the card away");
	// The reply streams in: the view moves on toward card-at-top (16px gap).
	view.scrollHeight = 900; await sleep(150);
	assert.equal(view.scrollTop, 384);
	// More reply: the card stays at the top; the rest is below.
	view.scrollHeight = 2000; await sleep(150);
	assert.equal(view.scrollTop, 384);
	stop();
});

it("waits for the new answered card and stops at the learner's first scroll", async () => {
	const view = fakeScroller(600);
	view.cards = 1;
	const stop = followAnsweredCard({ scroller: () => view as unknown as HTMLElement, holdAutoFollow: () => {}, before: 1 });
	assert.equal(view.scrollTop, 0, "the earlier card is not the new answer");
	view.cards = 2; view.scrollHeight = 2000; await sleep(150);
	assert.equal(view.scrollTop, 584);
	view.fire("wheel");
	view.scrollTop = 100; await sleep(150);
	assert.equal(view.scrollTop, 100, "after the learner scrolls, the view is theirs");
	stop();
});

it("never scrolls while the question is pending, and hands the bottom back if a failed send brings it back", async () => {
	const view = fakeScroller(400);
	let pending = true, released = 0;
	const stop = followAnsweredCard({ scroller: () => view as unknown as HTMLElement, holdAutoFollow: () => {}, before: 0, pending: () => pending, release: () => { released++; } });
	view.scrollHeight = 2000; await sleep(150);
	assert.equal(view.scrollTop, 0, "the dock owns the bottom while the question is pending");
	pending = false; await sleep(150);
	assert.equal(view.scrollTop, 384);
	pending = true; await sleep(150);
	assert.equal(released, 1, "the question came back: the view returns to its dock");
	view.scrollTop = 0; pending = false; await sleep(150);
	assert.equal(view.scrollTop, 0, "and the follow has ended");
	stop();
});
