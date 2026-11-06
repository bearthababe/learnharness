// Device features (owner decision, 2026-11-06): the drawing canvas is a
// tablet surface and the equation notebook a phone surface by default; both
// are switchable per device, and switching only changes what is offered.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	DEVICE_FEATURE_DEFAULTS,
	deviceClass,
	deviceFeatureEnabled,
	deviceFeatureKey,
	setDeviceFeature,
	storedDeviceFeature,
} from "../components/device-features.ts";

const originalWindow = (globalThis as { window?: unknown }).window;

function fakeWindow(size: { width: number; coarse: boolean }) {
	const store = new Map<string, string>();
	const events: string[] = [];
	const matches = (query: string) => {
		if (query === "(max-width: 767px)") return size.width <= 767;
		if (query === "(min-width: 768px) and (pointer: coarse)") return size.width >= 768 && size.coarse;
		return false;
	};
	const window = {
		matchMedia: (query: string) => ({ matches: matches(query), addEventListener() {}, removeEventListener() {} }),
		localStorage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => { store.set(key, value); },
			removeItem: (key: string) => { store.delete(key); },
		},
		dispatchEvent: (event: { type: string }) => { events.push(event.type); return true; },
		addEventListener() {},
		removeEventListener() {},
	};
	(globalThis as { window?: unknown }).window = window;
	return { store, events };
}

afterEach(() => { (globalThis as { window?: unknown }).window = originalWindow; });

describe("device features", () => {
	it("classifies phones by width, tablets by a coarse pointer, everything else as a laptop", () => {
		fakeWindow({ width: 375, coarse: true }); assert.equal(deviceClass(), "phone");
		fakeWindow({ width: 820, coarse: true }); assert.equal(deviceClass(), "tablet");
		fakeWindow({ width: 1440, coarse: false }); assert.equal(deviceClass(), "laptop");
	});

	it("defaults: phone = equation notebook, tablet = drawing canvas, laptop = neither", () => {
		assert.deepEqual(DEVICE_FEATURE_DEFAULTS, {
			"drawing-canvas": { phone: false, tablet: true, laptop: false },
			"equation-notebook": { phone: true, tablet: false, laptop: false },
		});
		fakeWindow({ width: 375, coarse: true });
		assert.equal(deviceFeatureEnabled("equation-notebook"), true);
		assert.equal(deviceFeatureEnabled("drawing-canvas"), false);
		fakeWindow({ width: 820, coarse: true });
		assert.equal(deviceFeatureEnabled("equation-notebook"), false);
		assert.equal(deviceFeatureEnabled("drawing-canvas"), true);
		fakeWindow({ width: 1440, coarse: false });
		assert.equal(deviceFeatureEnabled("equation-notebook"), false);
		assert.equal(deviceFeatureEnabled("drawing-canvas"), false);
	});

	it("an explicit choice wins on this device and can be returned to the default", () => {
		const { store, events } = fakeWindow({ width: 1440, coarse: false });
		setDeviceFeature("drawing-canvas", true);
		assert.equal(store.get(deviceFeatureKey("drawing-canvas")), "on");
		assert.equal(deviceFeatureEnabled("drawing-canvas"), true);
		assert.equal(storedDeviceFeature("drawing-canvas"), true);
		setDeviceFeature("drawing-canvas", null);
		assert.equal(store.has(deviceFeatureKey("drawing-canvas")), false);
		assert.equal(deviceFeatureEnabled("drawing-canvas"), false);
		assert.deepEqual(events, ["lh:device-feature", "lh:device-feature"]);
	});

	it("switching a surface off touches only its own key — nothing saved is removed", () => {
		const { store } = fakeWindow({ width: 820, coarse: true });
		store.set("lh:composer-draft:chat_1", "my unsent words");
		store.set("lh:handwriting-visible:chat_1", "1");
		setDeviceFeature("drawing-canvas", false);
		assert.deepEqual([...store.entries()].sort(), [
			["lh:composer-draft:chat_1", "my unsent words"],
			["lh:feature:drawing-canvas", "off"],
			["lh:handwriting-visible:chat_1", "1"],
		]);
	});

	it("storage that throws falls back to the device default", () => {
		fakeWindow({ width: 820, coarse: true });
		(globalThis as { window: { localStorage: unknown } }).window.localStorage = { getItem() { throw new Error("blocked"); } };
		assert.equal(deviceFeatureEnabled("drawing-canvas"), true);
	});
});
