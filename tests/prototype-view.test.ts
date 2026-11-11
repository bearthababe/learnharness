import assert from "node:assert/strict";
import { beforeEach, it } from "node:test";

// The registry's setters write the device's own storage: a stand-in window.
const store = new Map<string, string>();
const localStorage = {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, String(value)),
	removeItem: (key: string) => void store.delete(key),
};
Object.assign(globalThis, { window: { localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } } });

const { TRYOUT_DEFS, TRYOUT_DEVICE, tryoutDef, tryoutIdsFor } = await import("../components/tryout-registry.ts");
const { TRYOUTS, readTryout, setPrototypeView } = await import("../components/device-prefs.ts");

beforeEach(() => store.clear());

it("B18 (round 18): every try-out is declared once, for the device it belongs to", () => {
	const ids = TRYOUT_DEFS.map((def) => def.id);
	assert.deepEqual([...ids].sort(), Object.keys(TRYOUT_DEVICE).sort());
	assert.equal(new Set(ids).size, ids.length);
	for (const def of TRYOUT_DEFS) {
		assert.equal(def.on, TRYOUT_DEVICE[def.id], def.id);
		assert.ok(def.title && def.short && def.description, def.id);
		assert.ok(def.variants.length >= 2, def.id);
		assert.equal(new Set(def.variants.map((v) => v.value)).size, def.variants.length, def.id);
		for (const v of def.variants) assert.ok(v.label && v.description, `${def.id} ${v.value}`);
		assert.equal(tryoutDef(def.id), def);
	}
	assert.deepEqual(tryoutIdsFor("phone"), ["header-look", "reveal-style", "card-layout", "sessions-page"]);
	assert.deepEqual(tryoutIdsFor("tablet"), ["writing-palette", "wheel-look"]);
	assert.deepEqual(tryoutIdsFor("laptop"), []);
});

it("B18: the layout and Sessions variants are the stored options, the first being the default", () => {
	assert.deepEqual(tryoutDef("card-layout").variants.map((v) => v.value), [...TRYOUTS.cardLayout.options]);
	assert.deepEqual(tryoutDef("sessions-page").variants.map((v) => v.value), [...TRYOUTS.sessionsPage.options]);
	assert.equal(readTryout("cardLayout"), "plain");
	assert.equal(readTryout("sessionsPage"), "toolbar");
});

it("B18: each switch's setter stores the variant where its design reads it", () => {
	const keys: Record<string, string> = {
		"header-look": "lh:header-look", "reveal-style": "lh:reveal-style", "card-layout": "lh:try:card-layout",
		"sessions-page": "lh:try:sessions-page", "writing-palette": "lh:writing-palette", "wheel-look": "lh:writing-wheel-look",
	};
	for (const def of TRYOUT_DEFS) {
		for (const v of [...def.variants].reverse()) {
			def.set(v.value);
			assert.equal(store.get(keys[def.id]!), v.value, `${def.id} → ${v.value}`);
		}
	}
	assert.equal(readTryout("cardLayout"), "plain");
	tryoutDef("card-layout").set("card");
	assert.equal(readTryout("cardLayout"), "card");
});

it("B18: Prototype view is off by default and kept on this device when turned on", () => {
	assert.equal(store.get("lh:prototype-view"), undefined);
	setPrototypeView(true);
	assert.equal(store.get("lh:prototype-view"), "on");
	setPrototypeView(false);
	assert.equal(store.has("lh:prototype-view"), false);
});
