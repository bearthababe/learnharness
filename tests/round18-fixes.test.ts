import assert from "node:assert/strict";
import { it } from "node:test";
import { isAreaSlot, notebookSlotIdSchema, slotPage } from "../src/core/shared-writing.ts";
import { attachedCount } from "../components/shared-writing.tsx";
import { KEYBOARD_ACTIONS } from "../src/core/keyboard.ts";

it("B2 (round 18): an attachment slot is a page or one area of it, and names its page", () => {
	const page = "page_initial", area = "page_initial~area_0000abcd", uuid = "page_0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";
	for (const slot of [page, area, uuid, `${uuid}~area_ffffffff`]) assert.ok(notebookSlotIdSchema.safeParse(slot).success, slot);
	for (const bad of ["page_initial~area_xyz", "page_initial~area_0000abcd~area_0000abcd", "area_0000abcd", "page_initial~", "../page_initial"]) assert.ok(!notebookSlotIdSchema.safeParse(bad).success, bad);
	assert.equal(slotPage(area), page); assert.equal(slotPage(page), page);
	assert.equal(isAreaSlot(area), true); assert.equal(isAreaSlot(page), false);
});

it("B2 (round 18): the tray counts pages and areas as they are", () => {
	const page = { notebook: { pageId: "page_initial", pageRevision: 1, contentFingerprint: "a" } };
	const area = { notebook: { pageId: "page_initial~area_0000abcd", pageRevision: 1, contentFingerprint: "b" } };
	const image = {};
	assert.equal(attachedCount([page]), "1 page");
	assert.equal(attachedCount([page, image]), "2 pages");
	assert.equal(attachedCount([area]), "1 area");
	assert.equal(attachedCount([page, area, area]), "1 page and 2 areas");
});

it("B11 (round 18): Settings describes Tab as it works", () => {
	const tab = KEYBOARD_ACTIONS.filter(def => def.binding === "tab").map(def => def.label);
	assert.ok(tab.some(label => /Next text field, then the page/.test(label)), JSON.stringify(tab));
	assert.ok(!tab.some(label => /thinking ↔ rows/.test(label)), JSON.stringify(tab));
});
