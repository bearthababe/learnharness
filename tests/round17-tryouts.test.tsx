import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TRYOUTS, readTryout, setTryout, tryoutDefault } from "../components/device-prefs.ts";
import { TryoutsSection, tryoutIdsFor } from "../components/settings/tryouts-section.tsx";
import { HELPERS_DESCRIPTION } from "../components/activity-dock.tsx";
import { moveFocusByRegion } from "../components/keyboard-shortcuts.tsx";

describe("round 17 §0: try-out designs after the owner's picks", () => {
	it("the new try-outs default to their first option, remember a valid choice, and drop round 16's retired keys", () => {
		const store = new Map<string, string>([["lh:try:pane-peek", "strip"], ["lh:try:tablet-pane", "pane"]]);
		const g = globalThis as Record<string, unknown>;
		const before = g.window;
		g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }, addEventListener() {}, removeEventListener() {} };
		try {
			// Round 19: where Focus lives (toolbar first) and Ask tutor (on first) join them.
			assert.deepEqual(Object.keys(TRYOUTS).sort(), ["askTutor", "cardLayout", "focusPlace", "sessionsPage"]);
			assert.equal(tryoutDefault("cardLayout"), "plain");
			assert.equal(tryoutDefault("sessionsPage"), "toolbar");
			assert.equal(tryoutDefault("focusPlace"), "toolbar");
			assert.equal(tryoutDefault("askTutor"), "on");
			for (const name of Object.keys(TRYOUTS) as (keyof typeof TRYOUTS)[]) assert.equal(readTryout(name), tryoutDefault(name));
			assert.equal(store.has("lh:try:pane-peek"), false, "retired try-outs are cleared");
			assert.equal(store.has("lh:try:tablet-pane"), false);
			setTryout("cardLayout", "card");
			assert.equal(readTryout("cardLayout"), "card");
			store.set("lh:try:sessions-page", "nonsense");
			assert.equal(readTryout("sessionsPage"), "toolbar", "an unknown stored value falls back to the default");
		} finally { g.window = before; }
	});

	it("each device lists only its own options; a computer has none", () => {
		assert.deepEqual(tryoutIdsFor("phone"), ["header-look", "reveal-style", "card-layout", "sessions-page", "focus-place", "ask-tutor"]);
		assert.deepEqual(tryoutIdsFor("tablet"), ["writing-palette", "wheel-look", "focus-place-tablet"]);
		assert.deepEqual(tryoutIdsFor("laptop"), []);
	});

	it("before the device is known, Settings lists nothing it would have to take back", () => {
		const html = renderToStaticMarkup(<TryoutsSection />);
		assert.ok(html.includes('data-testid="tryouts"'));
		assert.equal(html.includes("lh-tryout-option"), false);
	});
});

describe("round 16: smaller pieces", () => {
	it("R12: Helpers says what it is in one line", () => {
		assert.equal(HELPERS_DESCRIPTION, "Background work the tutor started for your lessons");
	});
	it("R9: the region walk leaves the browser alone outside a page (no document)", () => {
		assert.equal(moveFocusByRegion(1), false);
	});
});
