import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createHandwritingStore } from "../src/store/handwriting.ts";
import { HandwritingPages } from "../components/handwriting/pages.ts";
import type { PagesDevice, PageCommit, WorkingSnapshot } from "../components/handwriting/pages-device.ts";
import { appendHandwriting, copyHandwriting, handwritingFingerprints, notebookSource, replayHandwriting, type HandwritingStroke } from "../src/core/handwriting.ts";
import type { HandwritingPage } from "../src/core/handwriting-pages.ts";
const root = mkdtempSync(`${process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode"}/pages-controller-`);
after(() => rmSync(root, { recursive: true, force: true }));
const ink: HandwritingStroke = { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 1, y: 2, pressure: .5 }] };
class MemoryDevice implements PagesDevice {
	value: WorkingSnapshot = { session: { version: 1, chatId: "test", generation: 0, deleted: false, activePageId: "page_initial" }, pages: [], actions: [] };
	fail = false;
	async open() { return structuredClone(this.value.session); }
	async read() { return structuredClone(this.value); }
	async commit(_chat: string, _generation: number, input: PageCommit) {
		if (this.fail || this.value.session.deleted || (input.valid && !input.valid())) throw new Error("Device aborted");
		const value = structuredClone(this.value);
		for (const page of input.pages) { value.pages = value.pages.filter(p => p.id !== page.id); value.pages.push(structuredClone(page)); }
		if (input.activePageId) value.session.activePageId = input.activePageId;
		if (input.action) { value.actions = value.actions.filter(a => a.actionId !== input.action!.actionId); value.actions.push(structuredClone(input.action)); }
		this.value = value;
	}
	async finishAction(_chat: string, _generation: number, id: string) { this.value.actions = this.value.actions.filter(a => a.actionId !== id); }
	async markAction(_chat: string, _generation: number, id: string, state: "local-committed" | "syncing" | "failed") { const action = this.value.actions.find(a => a.actionId === id); if (action) action.state = state; }
	async deleteChat() { this.value.session.deleted = true; this.value.pages = []; }
}
function fixture(id: string) {
	const store = createHandwritingStore(`${root}/${id}`), device = new MemoryDevice(), local = new Map<string, string>(), writes: string[] = [];
	const source = notebookSource(appendHandwriting({ version: 1, operations: [] }, { id: "snapshot", kind: "stroke", stroke: ink }));
	let offline = false;
	const deps = { device, storage: () => ({ getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value); }, removeItem: (key: string) => { local.delete(key); } }), prepare: async () => {}, flatten: async () => { throw new Error("No fallback expected"); }, fetch: async (url: string | URL | Request, init?: RequestInit) => {
		const path = String(url);
		if (path.endsWith("/source")) return Response.json(source);
		if (init?.method === "PUT" || init?.method === "POST") writes.push(path);
		if (offline) throw new Error("offline");
		if (path.endsWith("/pages")) {
			if (init?.method === "POST") { const body = JSON.parse(String(init.body)); return Response.json(store.createPageIfAbsent("test", body.page, body.creation)); }
			return Response.json({ pages: store.listPages("test") });
		}
		const pageId = path.split("/").at(-1)!;
		if (init?.method === "PUT") return Response.json(store.savePage("test", JSON.parse(String(init.body))));
		const page = store.readPage("test", pageId); return page ? Response.json(page) : Response.json({ code: "page_not_found" }, { status: 404 });
	} };
	return { device, local, writes, deps, source, store, offline: (value = true) => { offline = value; } };
}
it("failed local Duplicate never creates a page or sends a mutation; committed copy opens without awaiting server ACK", async () => {
	const f = fixture("copy"), model = new HandwritingPages("test", f.deps); await model.open();
	model.draw(ink); await model.retry();
	const before = model.getSnapshot().working, count = f.writes.length;
	f.device.fail = true; assert.equal(await model.duplicateWorking(), false);
	assert.equal(f.writes.length, count); assert.deepEqual(model.getSnapshot().working, before); assert.equal(f.device.value.pages.length, 1);
	f.device.fail = false; f.offline(); assert.equal(await model.duplicateWorking(), true);
	assert.notEqual(model.getSnapshot().working.pageId, "page_initial");
	assert.equal(f.device.value.pages.length, 2);
	model.dispose(); const reopened = new HandwritingPages("test", f.deps); await reopened.open();
	assert.equal(reopened.getSnapshot().working.pageId, f.device.value.session.activePageId);
	assert.equal(replayHandwriting(reopened.getSnapshot().working).strokes.length, 1);
	reopened.dispose();
});

it("Cancel and Open current preserve history; stale Restore decisions refresh instead of replacing newer local ink", async () => {
	const f = fixture("choices"), model = new HandwritingPages("test", f.deps); f.store.save("test", f.source.journal); await model.open();
	model.draw({ ...ink, colour: "#dc2626" }); await model.retry();
	await model.openSnapshot({ id: "writing_snapshot" }); const before = model.getSnapshot().working;
	assert.equal(await model.choose("cancel"), "cancelled"); assert.deepEqual(model.getSnapshot().working, before);
	await model.openSnapshot({ id: "writing_snapshot" }); assert.equal(await model.choose("current"), "opened"); assert.deepEqual(model.getSnapshot().working, before);
	await model.openSnapshot({ id: "writing_snapshot" }); model.draw({ ...ink, colour: "#15803d" });
	assert.equal(await model.choose("restore"), "choice"); assert.equal(replayHandwriting(model.getSnapshot().working).strokes.length, 3);
	assert.equal(await model.choose("copy"), "opened"); assert.equal(replayHandwriting(model.getSnapshot().working).strokes.length, 1);
	assert.equal(replayHandwriting(f.device.value.pages.find(p => p.id === "page_initial")!.journal).strokes.length, 3); model.dispose();
});

it("closing while a source is being read cancels before local acceptance, with no new page or server mutation", async () => {
	const f = fixture("cancel-preparation"), originalFetch = f.deps.fetch;
	let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
	f.deps.fetch = async (url, init) => { if (String(url).endsWith("/source")) await gate; return originalFetch(url, init); };
	const model = new HandwritingPages("test", f.deps); await model.open(); await model.retry(); const count = f.writes.length;
	const pending = model.openSnapshot({ id: "writing_snapshot" }, true); model.cancelDecision(); release();
	assert.equal(await pending, "failed"); assert.equal(f.writes.length, count); assert.equal(f.device.value.pages.length, 0); model.dispose();
});

it("promised source corruption never invokes flattened fallback and failed cold-page reads never become absence", async () => {
	const f = fixture("corrupt-source"), fetch = f.deps.fetch; let flattened = 0;
	f.deps.flatten = async () => { flattened++; throw new Error("Never flatten"); };
	f.deps.fetch = async (url, init) => String(url).endsWith("/source") ? Response.json({ code: "source_unavailable" }, { status: 503 }) : fetch(url, init);
	const model = new HandwritingPages("test", f.deps); await model.open();
	assert.equal(await model.openSnapshot({ id: "writing_snapshot", editableSource: { version: 1 } }), "failed"); assert.equal(flattened, 0); assert.equal(f.device.value.pages.length, 0);
	f.deps.fetch = async (url, init) => String(url).endsWith("/source") ? Response.json(f.source) : String(url).endsWith("/page_initial") ? Response.json({}, { status: 503 }) : fetch(url, init);
	const other = new HandwritingPages("test", f.deps); await other.open(); assert.equal(other.getSnapshot().ready, false); assert.equal(await other.openSnapshot({ id: "writing_snapshot" }), "failed");
	model.dispose(); other.dispose();
});

it("a lost creation ACK retries one frozen seed despite later ink and cannot mint another copy", async () => {
	const f = fixture("lost-create"), fetch = f.deps.fetch; let fail = true; const seeds: string[] = [];
	f.deps.fetch = async (url, init) => { const result = await fetch(url, init); if (init?.method === "POST") { seeds.push(String(init.body)); if (fail) throw new Error("Lost ACK"); } return result; };
	const model = new HandwritingPages("test", f.deps); await model.open(); model.draw(ink); await model.retry();
	await model.duplicateWorking(); const id = model.getSnapshot().working.pageId; await model.retry();
	model.draw({ ...ink, colour: "#dc2626" }); await model.retry(); fail = false; await model.retry();
	assert.equal(model.getSnapshot().working.pageId, id); assert.equal(model.getSnapshot().pages.length, 2); assert.ok(seeds.length > 1); assert.equal(new Set(seeds).size, 1);
	assert.equal(replayHandwriting(f.store.readPage("test", id)!.journal).strokes.length, 2); model.dispose();
});

it("postcommit compact mirror failure keeps the accepted copy and reload pointer rather than rolling back", async () => {
	const f = fixture("mirror-failure"), storage = f.deps.storage; let deny = false;
	f.deps.storage = () => ({ ...storage(), setItem: (key, value) => { if (deny) throw new Error("Quota"); storage().setItem(key, value); } });
	const model = new HandwritingPages("test", f.deps); await model.open(); model.draw(ink); await model.retry(); deny = true; f.offline();
	assert.equal(await model.duplicateWorking(), true); const id = model.getSnapshot().working.pageId; assert.notEqual(id, "page_initial"); model.dispose();
	const reopened = new HandwritingPages("test", f.deps); await reopened.open(); assert.equal(reopened.getSnapshot().working.pageId, id); assert.equal(replayHandwriting(reopened.getSnapshot().working).strokes.length, 1); reopened.dispose();
});

it("pending and sent Open share original identity, content matches preserve history, Restore is locally undoable after offline reload", async () => {
	const f = fixture("open"), model = new HandwritingPages("test", f.deps); f.store.save("test", f.source.journal); await model.open(); await model.retry();
	const writing = { id: "writing_snapshot", editableSource: { version: 1 as const }, notebook: { pageId: "page_initial", pageRevision: 1, contentFingerprint: (await handwritingFingerprints(f.source)).contentFingerprint } };
	model.clear(); model.undo(); await model.retry(); const before = model.getSnapshot().working;
	assert.equal(await model.openSnapshot(writing), "opened"); assert.deepEqual(model.getSnapshot().working, before); assert.equal(replayHandwriting(before).canRedo, true);
	model.draw({ ...ink, colour: "#dc2626" }); await model.retry();
	assert.equal(await model.openSnapshot(writing), "choice"); assert.equal(model.getSnapshot().decision?.target.id, "page_initial");
	f.offline(); assert.equal(await model.choose("restore"), "opened"); const restored = model.getSnapshot().working;
	assert.equal(restored.events[restored.head!]!.kind, "restore");
	model.dispose(); const reopened = new HandwritingPages("test", f.deps); await reopened.open();
	reopened.undo(); assert.deepEqual(replayHandwriting(reopened.getSnapshot().working).strokes.map(s => s.colour), ["#171717", "#dc2626"]);
	reopened.redo(); assert.deepEqual(replayHandwriting(reopened.getSnapshot().working).strokes.map(s => s.colour), ["#171717"]);
	assert.equal(await reopened.openSnapshot(writing), "opened"); assert.equal(reopened.getSnapshot().pages.length, 1); reopened.dispose();
});

it("safe source recovery does not treat a fresh virtual blank as the original, and snapshot Duplicate copies the exact seed", async () => {
	const f = fixture("missing"), model = new HandwritingPages("test", f.deps); await model.open();
	assert.equal(await model.openSnapshot({ id: "writing_snapshot" }), "opened");
	assert.equal(model.getSnapshot().working.head, "snapshot");
	model.draw({ ...ink, colour: "#dc2626" }); await model.retry();
	assert.equal(await model.openSnapshot({ id: "writing_snapshot" }, true), "opened");
	assert.notEqual(model.getSnapshot().working.pageId, "page_initial");
	assert.deepEqual(replayHandwriting(model.getSnapshot().working).strokes.map(s => s.colour), ["#171717"]);
	assert.equal(model.getSnapshot().pages.length, 2); model.dispose();
});

it("a retired controller cannot commit concurrent-original metadata after offscreen preparation", async () => {
	const f = fixture("retired-adoption"), fetch = f.deps.fetch;
	const id = `page_${crypto.randomUUID()}`, source = notebookSource(copyHandwriting(f.source.journal, id));
	const original: HandwritingPage = { version: 1, id, origin: { kind: "working" }, createdAt: "2026-01-01T00:00:00.000Z", journal: source.journal };
	let started!: () => void, release!: () => void;
	const preparing = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
	f.deps.fetch = async (url, init) => String(url).endsWith("/source") ? Response.json(source) : init?.method === "POST" ? Response.json({ existing: true, page: original }) : fetch(url, init);
	f.deps.prepare = async (page?: HandwritingPage) => { if (page?.id === id && page.origin.kind === "working") { started(); await gate; } };
	const model = new HandwritingPages("test", f.deps); await model.open();
	assert.equal(await model.openSnapshot({ id: "writing_snapshot" }), "opened");
	await preparing;
	const accepted = structuredClone(f.device.value); model.dispose(); release(); await model.retry();
	// Drain the already-started sync via an event-loop boundary.
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(f.device.value, accepted);
});

it("concurrent original creation adopts compatible history but blocks divergent recovery without overwriting either candidate", async () => {
	for (const divergent of [false, true]) {
		const f = fixture(`concurrent-${divergent}`), fetch = f.deps.fetch;
		const id = `page_${crypto.randomUUID()}`, source = notebookSource(copyHandwriting(f.source.journal, id));
		const journal = appendHandwriting(divergent ? copyHandwriting({ version: 1, operations: [] }, id) : source.journal, { id: "concurrent", kind: "stroke", stroke: { ...ink, colour: "#dc2626" } });
		const original: HandwritingPage = { version: 1, id, origin: { kind: "working" }, createdAt: "2026-01-01T00:00:00.000Z", journal };
		f.deps.fetch = async (url, init) => {
			if (String(url).endsWith("/source")) return Response.json(source);
			if (init?.method === "POST" && !f.store.readPage("test", id)) f.store.createPageIfAbsent("test", original, { id: "concurrent-create", kind: "recover", from: { kind: "working", pageId: id }, seedFingerprint: "a".repeat(64) });
			return fetch(url, init);
		};
		const model = new HandwritingPages("test", f.deps); await model.open();
		assert.equal(await model.openSnapshot({ id: "writing_snapshot" }), "opened"); await model.retry();
		assert.deepEqual(f.store.readPage("test", id), original);
		assert.equal(model.getSnapshot().ready, !divergent);
		assert.equal(model.getSnapshot().working.head, divergent ? "snapshot" : "concurrent");
		assert.equal(f.device.value.pages.find(page => page.id === id)!.origin.kind, divergent ? "recovered" : "working");
		assert.equal(await model.openSnapshot({ id: "writing_snapshot" }), divergent ? "failed" : "choice");
		model.dispose();
	}
});

it("a local-only original keeps newer working and recreates its own identity before its queued tail", async () => {
	const f = fixture("local-original"), fetch = f.deps.fetch;
	const id = `page_${crypto.randomUUID()}`, source = notebookSource(copyHandwriting(f.source.journal, id));
	const local: HandwritingPage = { version: 1, id, origin: { kind: "working" }, createdAt: "2026-01-01T00:00:00.000Z", journal: appendHandwriting(source.journal, { id: "local-newer", kind: "stroke", stroke: { ...ink, colour: "#dc2626" } }) };
	f.device.value.pages = [local]; f.device.value.session.activePageId = id;
	f.deps.fetch = async (url, init) => String(url).endsWith("/source") ? Response.json(source) : fetch(url, init);
	f.offline(); const model = new HandwritingPages("test", f.deps); await model.open();
	assert.equal(await model.openSnapshot({ id: "writing_snapshot" }), "choice");
	assert.equal(await model.choose("current"), "opened"); assert.equal(model.getSnapshot().working.head, "local-newer");
	f.offline(false); await model.retry();
	assert.deepEqual(f.store.readPage("test", id), local);
	assert.equal(f.device.value.pages.length, 1); assert.equal(f.device.value.actions.length, 0); model.dispose();
});
