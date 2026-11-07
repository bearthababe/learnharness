import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultFor, featureEnabled } from "../components/device-features.ts";

describe("device working tools (owner decision, 2026-11-06)", () => {
	it("the drawing canvas is a tablet tool; the equation notebook a phone tool", () => {
		assert.equal(defaultFor("writing", "tablet"), true);
		assert.equal(defaultFor("writing", "phone"), false);
		assert.equal(defaultFor("writing", "laptop"), false);
		assert.equal(defaultFor("notebook", "phone"), true);
		assert.equal(defaultFor("notebook", "tablet"), false);
		assert.equal(defaultFor("notebook", "laptop"), false);
	});

	it("outside a browser every tool is offered (nothing hidden before the device is known)", () => {
		assert.equal(featureEnabled("writing"), true);
		assert.equal(featureEnabled("notebook"), true);
	});
});
