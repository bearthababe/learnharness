import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { bindSidebarSwipe, completesSidebarSwipe, moveSidebarSwipe, startSidebarSwipe } from "../components/sidebar-swipe.ts";

describe("Sessions swipe opening", () => {
	it("accepts only starts inside the approved inset band", () => {
		for (const clientX of [32, 48, 80]) assert.ok(startSidebarSwipe(clientX, 200, 375));
		for (const clientX of [0, 31.9, 80.1, 100, 374]) assert.equal(startSidebarSwipe(clientX, 200, 375), null);
		assert.equal(startSidebarSwipe(48, 200, 0), null);
	});
	it("does not recognize a tap, short motion or insufficiently horizontal diagonal", () => {
		const start = startSidebarSwipe(48, 200, 375)!;
		for (const [clientX, clientY] of [[48, 200], [57, 200], [60, 209]] as const) {
			const moved = moveSidebarSwipe(start, clientX, clientY);
			assert.equal(moved.phase, "candidate");
			assert.equal(moved.distance, 0);
			assert.equal(completesSidebarSwipe(moved), false);
		}
	});
	it("recognizes ten pixels and the approved horizontal dominance boundary", () => {
		const start = startSidebarSwipe(48, 200, 375)!;
		assert.equal(moveSidebarSwipe(start, 58, 200).phase, "dragging");
		assert.equal(moveSidebarSwipe(start, 63, 210).phase, "dragging");
	});
	it("never reclaims a gesture after vertical or leftward intent", () => {
		const start = startSidebarSwipe(48, 200, 375)!;
		for (const [clientX, clientY] of [[48, 211], [38, 200]] as const) {
			const rejected = moveSidebarSwipe(start, clientX, clientY);
			assert.equal(rejected.phase, "rejected");
			assert.equal(moveSidebarSwipe(rejected, 350, 211), rejected);
			assert.equal(completesSidebarSwipe(rejected), false);
		}
	});
	it("tracks displacement, clamps at the edges and allows reversal", () => {
		const dragging = moveSidebarSwipe(startSidebarSwipe(48, 200, 375)!, 250, 200);
		assert.equal(dragging.distance, 202);
		assert.equal(moveSidebarSwipe(dragging, 500, 200).distance, 375);
		assert.equal(moveSidebarSwipe(dragging, 20, 200).distance, 0);
		const reversed = moveSidebarSwipe(dragging, 100, 200);
		assert.equal(reversed.phase, "dragging");
		assert.equal(reversed.distance, 52);
		assert.equal(completesSidebarSwipe(reversed), false);
	});
	it("commits only on at least half-pane travel, without a short-fling shortcut", () => {
		const start = startSidebarSwipe(48, 200, 375)!;
		assert.equal(completesSidebarSwipe(moveSidebarSwipe(start, 235.4, 200)), false);
		assert.equal(completesSidebarSwipe(moveSidebarSwipe(start, 235.5, 200)), true);
		assert.equal(completesSidebarSwipe(moveSidebarSwipe(start, 70, 200)), false);
		assert.equal(completesSidebarSwipe(start), false);
	});
});

describe("Sessions swipe release binding", () => {
	for (const { moveX, releaseX, expected } of [
		{ moveX: 280, releaseX: 130, expected: 0 },
		{ moveX: 130, releaseX: 280, expected: 1 },
	]) {
		it(`uses release at ${releaseX}px rather than the last move at ${moveX}px`, context => {
			const dom = parseHTML('<html><body><div class="lh-app-shell"><main class="lh-app-main"></main><aside aria-hidden="true"></aside></div></body></html>');
			Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLCanvasElement: dom.window.HTMLCanvasElement });
			dom.window.getSelection = () => null;
			const root = dom.document.querySelector<HTMLElement>(".lh-app-shell")!;
			const surface = dom.document.querySelector<HTMLElement>("main")!;
			const panel = dom.document.querySelector<HTMLElement>("aside")!;
			Object.defineProperty(root, "clientWidth", { value: 375 });
			let opens = 0;
			context.after(bindSidebarSwipe(panel, () => { opens++; }));
			const dispatch = (type: string, properties: object) => surface.dispatchEvent(Object.assign(new dom.window.Event(type, { bubbles: true, cancelable: true }), properties));
			const touch = (clientX: number) => ({ identifier: 1, clientX, clientY: 200 });
			dispatch("pointerdown", { pointerType: "touch", isPrimary: true, pointerId: 1, clientX: 48, clientY: 200 });
			dispatch("touchstart", { touches: [touch(48)] });
			dispatch("touchmove", { touches: [touch(moveX)] });
			dispatch("touchend", { touches: [], changedTouches: [touch(releaseX)] });
			assert.equal(opens, expected);
		});
	}
});
