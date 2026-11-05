import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { appendHandwriting, normalizeHandwriting, replayHandwriting, handwritingSchema, restoreHandwriting, handwritingPrefix, importHandwritingBackground, copyHandwriting, handwritingFingerprints, notebookSource, type HandwritingStroke } from "../src/core/handwriting.ts";
import { Resvg } from "@resvg/resvg-js";
import { mkdtempSync, rmSync } from "node:fs";
import { createHandwritingStore } from "../src/store/handwriting.ts";

const stroke: HandwritingStroke = { tool: "pen", colour: "#2563eb", penScale: 1, width: 38, points: [{ x: 100, y: 200, pressure: 0.6 }] };
const legacy = { version: 1 as const, operations: [{ id: "ink", kind: "stroke" as const, stroke }, { id: "undo", kind: "undo" as const }] };

it("migrates the shipped journal without losing editable ink or Redo, and new edits abandon Redo", () => {
	const working = normalizeHandwriting(legacy);
	assert.equal(working.pageId, "page_initial");
	assert.equal(working.head, "undo");
	assert.deepEqual(replayHandwriting(working), { strokes: [], background: null, canUndo: false, canRedo: true });
	const redone = appendHandwriting(working, { id: "redo", kind: "redo" });
	assert.deepEqual(replayHandwriting(handwritingSchema.parse(JSON.parse(JSON.stringify(redone)))).strokes, [stroke]);
	const edited = appendHandwriting(working, { id: "new", kind: "stroke", stroke });
	assert.equal(replayHandwriting(edited).canRedo, false);
});

it("large background base64 fields within the source cap validate without recursive regexp overflow", () => {
	const backgroundId = "a".repeat(64), data = Buffer.alloc(4 * 1024 * 1024).toString("base64");
	const graph = { version: 2, pageId: "page_initial", head: "import", events: { import: { id: "import", parent: null, kind: "import-background", backgroundId } }, backgrounds: { [backgroundId]: { mediaType: "image/png", width: 1400, height: 1800, data } } };
	// This is the structural graph guard. PNG bytes/hash are independently
	// verified at import/upload, before any such graph can become a capture.
	assert.equal(handwritingSchema.safeParse(graph).success, true);
});

it("independent PNG backgrounds survive Restore/Undo/Redo, repeated Restore stays linear, and copies keep their native Redo", async () => {
	const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800"><rect width="1400" height="1800" fill="red"/></svg>').render().asPng();
	const background = { mediaType: "image/png" as const, width: 1400 as const, height: 1800 as const, data: png.toString("base64") };
	const imported = await importHandwritingBackground(normalizeHandwriting({ version: 1, operations: [] }), background, "import");
	const undone = appendHandwriting(imported, { id: "undo-import", kind: "undo" });
	const copy = copyHandwriting(undone, `page_${crypto.randomUUID()}`);
	assert.equal(replayHandwriting(copy).canRedo, true);
	assert.equal(replayHandwriting(appendHandwriting(copy, { id: "redo-import", kind: "redo" })).background?.data, background.data);
	assert.equal(replayHandwriting(undone).background, null);
	const source = normalizeHandwriting(legacy);
	let working = restoreHandwriting(imported, source, "restore-first");
	working = appendHandwriting(working, { id: "undo-restore", kind: "undo" });
	assert.deepEqual(replayHandwriting(working).background, background);
	working = appendHandwriting(working, { id: "redo-restore", kind: "redo" });
	assert.equal(replayHandwriting(working).background, null);
	const before = Object.keys(working.events).length;
	for (let i = 0; i < 100; i++) working = restoreHandwriting(working, source, `restore-${i}`);
	assert.equal(Object.keys(working.events).length, before + 100);
	assert.equal(Object.keys(working.backgrounds).length, 1);
	assert.equal((await handwritingFingerprints(notebookSource(working))).contentFingerprint, (await handwritingFingerprints(notebookSource(source))).contentFingerprint);
	assert.notEqual((await handwritingFingerprints(notebookSource(working))).sourceFingerprint, (await handwritingFingerprints(notebookSource(source))).sourceFingerprint);
	await assert.rejects(importHandwritingBackground(imported, background, "bad-import"), /empty/);
});

it("corrupt graph references and conflicting immutable definitions cannot replace history", () => {
	const valid = normalizeHandwriting(legacy);
	for (const invalid of [
		{ ...valid, head: "missing" },
		{ ...valid, events: { ...valid.events, ink: { ...valid.events.ink, parent: "undo" } } },
		{ ...valid, events: { ...valid.events, undo: { id: "undo", parent: "ink", kind: "restore", sourceHead: "undo" } } },
	]) assert.equal(handwritingSchema.safeParse(invalid).success, false);
	const conflicting = normalizeHandwriting({ version: 1, operations: [{ id: "ink", kind: "stroke", stroke: { ...stroke, colour: "#dc2626" } }] });
	assert.throws(() => restoreHandwriting(valid, conflicting, "restore"), /Conflicting/);
});

it("Restore retains source history but Undo and Redo follow displaced destination chronology across serialization", () => {
	const source = appendHandwriting(normalizeHandwriting(legacy), { id: "source-redo", kind: "redo" });
	const displaced = appendHandwriting(normalizeHandwriting({ version: 1, operations: [] }), { id: "destination", kind: "stroke", stroke: { ...stroke, colour: "#dc2626" } });
	let working = restoreHandwriting(displaced, source, "restore");
	working = appendHandwriting(working, { id: "later", kind: "stroke", stroke });
	working = normalizeHandwriting(handwritingSchema.parse(JSON.parse(JSON.stringify(working))));
	working = appendHandwriting(working, { id: "undo-later", kind: "undo" });
	assert.deepEqual(replayHandwriting(working).strokes, [stroke]);
	working = appendHandwriting(working, { id: "undo-restore", kind: "undo" });
	assert.deepEqual(replayHandwriting(working).strokes, [{ ...stroke, colour: "#dc2626" }]);
	working = normalizeHandwriting(handwritingSchema.parse(JSON.parse(JSON.stringify(working))));
	working = appendHandwriting(working, { id: "redo-restore", kind: "redo" });
	working = appendHandwriting(working, { id: "redo-later", kind: "redo" });
	assert.deepEqual(replayHandwriting(working).strokes, [stroke, stroke]);
	assert.equal(handwritingPrefix(source, working), false, "A restore-source edge is not a causal parent");
	assert.equal(handwritingPrefix(displaced, working), true);
	assert.equal(Object.keys(working.events).length, 10);
});

it("actual working save/reopen preserves displaced background and both Restore history boundaries", async () => {
	const dir = mkdtempSync(join(tmpdir(), "46-history-store-"));
	try {
		const store = createHandwritingStore(dir);
		const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800"><rect width="1400" height="1800" fill="red"/></svg>').render().asPng();
		const displaced = await importHandwritingBackground({ version: 1, operations: [] }, { mediaType: "image/png", width: 1400, height: 1800, data: png.toString("base64") }, "background");
		const source = appendHandwriting(normalizeHandwriting(legacy), { id: "source-redo", kind: "redo" });
		store.save("chat", appendHandwriting(restoreHandwriting(displaced, source, "restore"), { id: "later", kind: "stroke", stroke }));
		let opened = createHandwritingStore(dir).read("chat");
		opened = store.save("chat", appendHandwriting(opened, { id: "undo-later", kind: "undo" }));
		assert.deepEqual(replayHandwriting(opened).strokes, [stroke]);
		store.save("chat", appendHandwriting(opened, { id: "undo-restore", kind: "undo" }));
		opened = createHandwritingStore(dir).read("chat");
		assert.deepEqual(replayHandwriting(opened).background, replayHandwriting(displaced).background);
		opened = store.save("chat", appendHandwriting(opened, { id: "redo-restore", kind: "redo" }));
		store.save("chat", appendHandwriting(opened, { id: "redo-later", kind: "redo" }));
		assert.deepEqual(replayHandwriting(createHandwritingStore(dir).read("chat")).strokes, [stroke, stroke]);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
