import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TRYOUTS, readTryout, setTryout, tryoutDefault } from "../components/device-prefs.ts";
import { TryoutsSection } from "../components/settings/tryouts-section.tsx";
import { HELPERS_DESCRIPTION } from "../components/activity-dock.tsx";
import { moveFocusByRegion } from "../components/keyboard-shortcuts.tsx";

describe("round 16 §0: try-out designs", () => {
	it("each try-out has a default (its first option) and remembers a valid choice on this device", () => {
		const store = new Map<string, string>();
		const g = globalThis as Record<string, unknown>;
		const before = g.window;
		g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } }, addEventListener() {}, removeEventListener() {} };
		try {
			assert.equal(tryoutDefault("paneControls"), "field-mic");
			assert.equal(tryoutDefault("panePeek"), "pill");
			assert.equal(tryoutDefault("tabletPane"), "inline");
			assert.equal(tryoutDefault("notebookInput"), "docked");
			for (const name of Object.keys(TRYOUTS) as (keyof typeof TRYOUTS)[]) assert.equal(readTryout(name), tryoutDefault(name));
			setTryout("panePeek", "strip");
			assert.equal(readTryout("panePeek"), "strip");
			store.set("lh:try:pane-peek", "nonsense");
			assert.equal(readTryout("panePeek"), "pill", "an unknown stored value falls back to the default");
		} finally { g.window = before; }
	});

	it("Settings shows every alternative as a card with its device, a description and its default marked", () => {
		const html = renderToStaticMarkup(<TryoutsSection />);
		for (const id of ["header-look", "reveal-style", "tablet-pane", "pane-controls", "pane-peek", "notebook-input", "writing-palette", "wheel-look"]) {
			assert.ok(html.includes(`data-testid="tryout-${id}"`), id);
		}
		for (const testid of ["header-look-solid", "header-look-glass", "reveal-style-quiet", "reveal-style-prominent", "pane-controls-field-mic", "pane-controls-big-mic",
			"pane-peek-pill", "pane-peek-strip", "pane-peek-peek", "tablet-pane-inline", "tablet-pane-pane", "notebook-input-docked", "notebook-input-follow",
			"writing-palette-wheel", "writing-palette-arc", "wheel-look-solid", "wheel-look-glass"]) {
			assert.ok(html.includes(`data-testid="${testid}"`), testid);
		}
		assert.equal((html.match(/lh-tryout-default">Default</g) ?? []).length, 8, "one default per card");
		assert.ok(html.includes('role="radiogroup"'));
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
