/** Native working-page transaction tests. No app server or public preview. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
const bundle = await build({ stdin: { contents: `import {IndexedPagesDevice} from './components/handwriting/pages-device.ts';import {HandwritingPages} from './components/handwriting/pages.ts';import {initialHandwritingPage} from './src/core/handwriting-pages.ts';import {appendHandwriting,copyHandwriting,restoreHandwriting,replayHandwriting,importHandwritingBackground} from './src/core/handwriting.ts';Object.assign(window,{IndexedPagesDevice,HandwritingPages,initialHandwritingPage,appendHandwriting,copyHandwriting,restoreHandwriting,replayHandwriting,importHandwritingBackground});`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "iife", platform: "browser", plugins: [{ name: "unused-node-imports", setup(build) { build.onResolve({ filter: /^node:/ }, args => ({ path: args.path, external: true, sideEffects: false })); } }] });
const profile = await mkdtemp(path.join(process.env.LH_HANDWRITING_TEST_ROOT ?? "/home/bjorn/.cache/opencode/issue4", "pages-device-"));
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", userDataDir: profile, headless: true, args: ["--no-sandbox"] });
try {
	const page = await browser.newPage(); await page.setRequestInterception(true);
	page.on("request", request => void request.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>Isolated working-pages regression</title>" }));
	await page.goto("http://localhost/__isolated_pages"); await page.addScriptTag({ content: bundle.outputFiles[0].text });
	const result = await page.evaluate(async () => {
		const { IndexedPagesDevice, initialHandwritingPage, appendHandwriting, copyHandwriting, restoreHandwriting, replayHandwriting } = window;
		const device = new IndexedPagesDevice(), chat = "native-pages", session = await device.open(chat);
		const initial = initialHandwritingPage(appendHandwriting({ version: 1, operations: [] }, { id: "ink", kind: "stroke", stroke: { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 20, pressure: .5 }] } }));
		await device.commit(chat, session.generation, { pages: [initial], expected: { page_initial: null }, activePageId: "page_initial", expectedActivePageId: "page_initial" });
		const id = `page_${crypto.randomUUID()}`, copy = { ...initial, id, createdAt: new Date().toISOString(), origin: { kind: "duplicate", from: { kind: "working", pageId: "page_initial" }, seedFingerprint: "a".repeat(64) }, journal: copyHandwriting(initial.journal, id) };
		const commit = { pages: [initial, copy], expected: { page_initial: { head: "ink" }, [id]: null }, activePageId: id, expectedActivePageId: "page_initial", action: { version: 1, chatId: chat, actionId: "copy-once", kind: "duplicate", pageId: id, seedHead: "ink", seedFingerprint: "a".repeat(64), state: "local-committed" } };
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function(...args) { const result = put.apply(this, args); if (this.name === "sessions") this.transaction.abort(); return result; };
		let aborted = false; try { await device.commit(chat, session.generation, commit); } catch { aborted = true; } finally { IDBObjectStore.prototype.put = put; }
		const before = await device.read(chat, session.generation);
		await device.commit(chat, session.generation, commit);
		const reopened = await new IndexedPagesDevice().read(chat, session.generation);
		const displaced = { ...copy, journal: appendHandwriting(copy.journal, { id: "clear", kind: "clear" }) };
		await device.commit(chat, session.generation, { pages: [displaced], expected: { [id]: { head: "ink" } } });
		let stale = false; try { await device.commit(chat, session.generation, commit); } catch { stale = true; }
		const restored = { ...displaced, journal: restoreHandwriting(displaced.journal, copy.journal, "restore") };
		await device.commit(chat, session.generation, { pages: [restored], expected: { [id]: { head: "clear" } } });
		const savedRestore = (await new IndexedPagesDevice().read(chat, session.generation)).pages.find(page => page.id === id);
		const undone = appendHandwriting(savedRestore.journal, { id: "undo", kind: "undo" });
		const redone = appendHandwriting(undone, { id: "redo", kind: "redo" });
		await device.deleteChat(chat); let fenced = false;
		try { await device.commit(chat, session.generation, { pages: [restored], expected: { [id]: { head: "restore" } } }); } catch { fenced = true; }
		return { aborted, unchanged: before.pages.length === 1 && before.session.activePageId === "page_initial" && before.actions.length === 0, committed: reopened.pages.length === 2 && reopened.session.activePageId === id && reopened.actions.length === 1, stale, undo: replayHandwriting(undone).strokes.length, redo: replayHandwriting(redone).strokes.length, fenced };
	});
	assert.deepEqual(result, { aborted: true, unchanged: true, committed: true, stale: true, undo: 0, redo: 1, fenced: true });
	console.log("PASS native page transaction abort/commit, pointer/action atomicity, stale head, reload Restore Undo/Redo, deletion fence");
	const assets = await page.evaluate(async () => {
		const { IndexedPagesDevice, initialHandwritingPage, importHandwritingBackground, copyHandwriting } = window;
		const device = new IndexedPagesDevice(), chat = "asset-pages", session = await device.open(chat);
		const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800; canvas.getContext("2d").fillRect(0, 0, 1400, 1800);
		const pixels = { mediaType: "image/png", width: 1400, height: 1800, data: canvas.toDataURL("image/png").split(",")[1] };
		const original = initialHandwritingPage(await importHandwritingBackground({ version: 1, operations: [] }, pixels, "import"));
		await device.commit(chat, session.generation, { pages: [original], expected: { page_initial: null } });
		const saved = await new IndexedPagesDevice().read(chat, session.generation);
		const db = await new Promise(resolve => { const req = indexedDB.open("lh-handwriting-working", 1); req.onsuccess = () => resolve(req.result); });
		const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
		const row = await request(db.transaction("pages").objectStore("pages").get([chat, "page_initial"]));
		const id = `page_${crypto.randomUUID()}`, copy = { ...original, id, createdAt: new Date().toISOString(), origin: { kind: "duplicate", from: { kind: "working", pageId: "page_initial" }, seedFingerprint: "a".repeat(64) }, journal: copyHandwriting(original.journal, id) };
		let release, entered, valid = true; const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
		const digest = crypto.subtle.digest.bind(crypto.subtle); crypto.subtle.digest = async (...args) => { entered(); await gate; return digest(...args); };
		const cancelled = device.commit(chat, session.generation, { pages: [original, copy], expected: { page_initial: { head: "import" }, [id]: null }, activePageId: id, expectedActivePageId: "page_initial", valid: () => valid }).then(() => false, () => true);
		await started; valid = false; release(); const cancelledBeforeNativeCommit = await cancelled; crypto.subtle.digest = digest;
		const afterCancel = await device.read(chat, session.generation);
		const backgroundId = Object.keys(original.journal.backgrounds)[0];
		await new Promise((resolve, reject) => { const tx = db.transaction("backgrounds", "readwrite"); tx.objectStore("backgrounds").put({ version: 1, chatId: chat, backgroundId, width: 1400, height: 1800, png: new Blob(["corrupt"]) }); tx.oncomplete = resolve; tx.onabort = reject; });
		let corruptBlocked = false; try { await device.read(chat, session.generation); } catch { corruptBlocked = true; }
		const retained = await request(db.transaction("backgrounds").objectStore("backgrounds").get([chat, backgroundId])); db.close();
		return { exactAssets: Object.values(saved.pages[0].journal.backgrounds)[0].data === pixels.data, compact: !JSON.stringify(row).includes('"data":') && Array.isArray(row.page.journal.backgrounds), cancelledBeforeNativeCommit, noCandidate: afterCancel.pages.length === 1 && afterCancel.session.activePageId === "page_initial", corruptBlocked, corruptRetained: await retained.png.text() === "corrupt" };
	});
	assert.deepEqual(assets, { exactAssets: true, compact: true, cancelledBeforeNativeCommit: true, noCandidate: true, corruptBlocked: true, corruptRetained: true });
	console.log("PASS native independent asset hydration, pixel-free graph, precommit hash cancellation and retained corrupt asset refusal");
	const lifecycle = await page.evaluate(async () => {
		const { IndexedPagesDevice, HandwritingPages, replayHandwriting } = window;
		const chat = "controller-native", device = new IndexedPagesDevice(), ink = { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 20, pressure: .5 }] };
		const deps = { device, storage: () => localStorage, prepare: async () => {}, flatten: async () => { throw Error("No image expected"); }, fetch: async (url, init) => { if (init?.method) throw Error("Offline"); return String(url).endsWith("/pages") ? Response.json({ pages: [] }) : Response.json({ code: "page_not_found" }, { status: 404 }); } };
		const first = new HandwritingPages(chat, deps); await first.open(); first.draw(ink); first.dispose();
		const second = new HandwritingPages(chat, deps); await second.open();
		const immediate = replayHandwriting(second.getSnapshot().working).strokes.length;
		await second.duplicateWorking(); const copyId = second.getSnapshot().working.pageId; second.dispose();
		const third = new HandwritingPages(chat, deps); await third.open(); third.clear(); third.undo();
		const history = replayHandwriting(third.getSnapshot().working); await third.retry(); third.dispose();
		const fourth = new HandwritingPages(chat, deps); await fourth.open(); const reloaded = replayHandwriting(fourth.getSnapshot().working);
		fourth.sessionDeleted(); await device.deleteChat(chat); const before = localStorage.getItem(`lh:handwriting:pages:v1:${chat}:${copyId}`); fourth.draw(ink);
		const unchangedAfterDeletion = before === localStorage.getItem(`lh:handwriting:pages:v1:${chat}:${copyId}`);
		return { immediate, independent: copyId !== "page_initial", selection: fourth.getSnapshot().working.pageId === copyId, beforeReloadRedo: history.canRedo, afterReloadRedo: reloaded.canRedo, afterReloadInk: reloaded.strokes.length, unchangedAfterDeletion };
	});
	assert.deepEqual(lifecycle, { immediate: 1, independent: true, selection: true, beforeReloadRedo: true, afterReloadRedo: true, afterReloadInk: 1, unchangedAfterDeletion: true });
	console.log("PASS native controller immediate-stroke recovery, offline copy/pointer/history across remounts and deletion invalidation");
} finally { await browser.close(); await rm(profile, { recursive: true, force: true }); }
