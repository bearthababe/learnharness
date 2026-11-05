import assert from "node:assert/strict";
import { it, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createHandwritingStore } from "../src/store/handwriting.ts";
import { appendHandwriting, copyHandwriting, normalizeHandwriting, replayHandwriting, restoreHandwriting, type HandwritingStroke } from "../src/core/handwriting.ts";

const root = mkdtempSync(`${process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode"}/pages-test-`);
after(() => rmSync(root, { recursive: true, force: true }));
const stroke: HandwritingStroke = { tool: "pen", colour: "#2563eb", penScale: 1, width: 38, points: [{ x: 100, y: 200, pressure: 0.6 }] };
const original = appendHandwriting({ version: 1, operations: [] }, { id: "first", kind: "stroke", stroke });
const copyId = "page_11111111-1111-4111-8111-111111111111";

it("independent page creation retries retain later working and reload Undo/Redo without changing the original", () => {
	const store = createHandwritingStore(root);
	store.save("session", original);
	const page = { version: 1 as const, id: copyId, origin: { kind: "duplicate" as const, from: { kind: "working" as const, pageId: "page_initial" }, seedFingerprint: "a".repeat(64) }, createdAt: "2026-11-05T12:00:00.000Z", journal: copyHandwriting(original, copyId) };
	const creation = { id: "copy-action", kind: "duplicate" as const, seedFingerprint: "a".repeat(64), from: { kind: "working" as const, pageId: "page_initial" } };
	assert.equal(store.createPageIfAbsent("session", page, creation).existing, false);
	const changed = { ...page, journal: appendHandwriting(page.journal, { id: "clear-copy", kind: "clear" }) };
	store.savePage("session", changed);
	assert.deepEqual(store.createPageIfAbsent("session", page, creation), { page: changed, existing: true });
	assert.deepEqual(store.readPage("session", "page_initial")?.journal, original);
	const reopened = createHandwritingStore(root).readPage("session", copyId)!;
	assert.equal(replayHandwriting(reopened.journal).strokes.length, 0);
	store.savePage("session", { ...reopened, journal: appendHandwriting(reopened.journal, { id: "undo-copy", kind: "undo" }) });
	assert.equal(replayHandwriting(store.readPage("session", copyId)!.journal).canRedo, true);
	assert.equal(store.listPages("session").length, 2);
	assert.ok(!JSON.stringify(store.listPages("session")).includes("events"));
	assert.equal(store.readPage("absent", "page_initial"), null, "Absence is distinct from the old virtual blank read");
	assert.deepEqual(normalizeHandwriting(store.read("absent")), normalizeHandwriting({ version: 1, operations: [] }));
});

it("Restore survives page save/reopen as one destination Undo boundary and retries never overwrite a concurrent original", () => {
	const store = createHandwritingStore(root), chat = "restore-session";
	const displaced = appendHandwriting(original, { id: "displaced", kind: "stroke", stroke: { ...stroke, colour: "#dc2626" } });
	store.save(chat, displaced);
	const before = store.readPage(chat, "page_initial")!;
	const restored = { ...before, journal: restoreHandwriting(before.journal, original, "restore-one") };
	store.savePage(chat, restored);
	const later = appendHandwriting(restored.journal, { id: "after", kind: "stroke", stroke: { ...stroke, colour: "#15803d" } });
	const undo = appendHandwriting(appendHandwriting(later, { id: "undo-after", kind: "undo" }), { id: "undo-restore", kind: "undo" });
	store.savePage(chat, { ...restored, journal: undo });
	const reopened = createHandwritingStore(root).readPage(chat, "page_initial")!;
	assert.deepEqual(replayHandwriting(reopened.journal).strokes.map(s => s.colour), ["#2563eb", "#dc2626"]);
	const redo = appendHandwriting(appendHandwriting(reopened.journal, { id: "redo-restore", kind: "redo" }), { id: "redo-after", kind: "redo" });
	assert.deepEqual(replayHandwriting(redo).strokes.map(s => s.colour), ["#2563eb", "#15803d"]);
	assert.deepEqual(store.createPageIfAbsent(chat, { ...before, journal: original }, { id: "recover", kind: "recover", seedFingerprint: "b".repeat(64), from: { kind: "snapshot", writingId: "writing_saved" } }).page, reopened);
	assert.throws(() => store.savePage(chat, { ...before, journal: appendHandwriting(original, { id: "divergent", kind: "clear" }) }));
	store.deleteChat(chat); assert.deepEqual(store.listPages(chat), []);
});
