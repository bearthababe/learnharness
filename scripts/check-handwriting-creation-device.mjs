/** Native IDB + real page/source handlers and filesystem stores; no app server.
 * Run: NODE_ENV=test node --import tsx scripts/check-handwriting-creation-device.mjs */
import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const root = await mkdtemp(path.join(process.env.LH_HANDWRITING_TEST_ROOT ?? "/home/bjorn/.cache/opencode/issue4", "creation-device-"));
process.env.LH_DATA_DIR = path.join(root, "data");
const { stores } = await import("../src/server/stores.ts");
const { handwritingPagesResponse } = await import("../src/server/handwriting.ts");
const { sharedWritingSourceResponse } = await import("../src/server/shared-writing.ts");
const { handwritingFingerprints, notebookSource } = await import("../src/core/handwriting.ts");
const bundle = await build({ stdin: { contents: `import {IndexedPagesDevice} from './components/handwriting/pages-device.ts';import {HandwritingPages} from './components/handwriting/pages.ts';import {initialHandwritingPage} from './src/core/handwriting-pages.ts';import {appendHandwriting,copyHandwriting,importHandwritingBackground,notebookSource} from './src/core/handwriting.ts';Object.assign(window,{IndexedPagesDevice,HandwritingPages,initialHandwritingPage,appendHandwriting,copyHandwriting,importHandwritingBackground,notebookSource});`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "iife", platform: "browser", plugins: [{ name: "unused-node-imports", setup(build) { build.onResolve({ filter: /^node:/ }, args => ({ path: args.path, external: true, sideEffects: false })); } }] });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", userDataDir: path.join(root, "profile"), headless: true, args: ["--no-sandbox"] });
try {
	const tab = await browser.newPage(); await tab.setRequestInterception(true);
	tab.on("request", request => void request.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>Native creation lifecycle</title>" }));
	await tab.goto("http://localhost/__creation"); await tab.addScriptTag({ content: bundle.outputFiles[0].text });
	let scenario;
	await tab.exposeFunction("prepareCreation", async (base, advanced, png, kind) => {
		const chat = stores.chatStore.createChat("Isolated creation lifecycle"); let writingId = `writing_${crypto.randomUUID()}`;
		if (kind === "external") writingId = stores.sharedWritingStore.put(chat.id, Buffer.from(png, "base64")).id;
		else stores.sharedWritingStore.putNotebook(chat.id, { writingId, pageId: base.id, expectedPageRevision: 0, source: notebookSource(base.journal), image: Buffer.from(png, "base64") });
		scenario = { chat: chat.id, advanced, kind, writingId, source: stores.sharedWritingStore.readSource(chat.id, writingId), posts: [], puts: [] };
		return { chat: chat.id, writingId };
	});
	await tab.exposeFunction("creationRequest", async (url, init) => {
		const method = init?.method ?? "GET"; let response;
		if (url.endsWith("/source")) response = sharedWritingSourceResponse(scenario.chat, url.split("/").at(-2));
		else {
			if (method === "POST" && !scenario.posts.length && scenario.kind === "concurrent-recover") {
				const { sourceFingerprint } = await handwritingFingerprints(notebookSource(scenario.advanced.journal));
				stores.handwritingStore.createPageIfAbsent(scenario.chat, scenario.advanced, { id: "concurrent-original", kind: "recover", from: { kind: "working", pageId: scenario.advanced.id }, seedFingerprint: sourceFingerprint });
			}
			response = await handwritingPagesResponse(new Request(`http://fixture${url}`, { method, body: init?.body, headers: init?.headers }), scenario.chat, url.endsWith("/pages") ? undefined : url.split("/").at(-1));
		}
		const text = await response.text();
		if (method === "POST") scenario.posts.push({ body: init.body, status: response.status });
		if (method === "PUT") scenario.puts.push({ page: JSON.parse(init.body), status: response.status });
		return { status: response.status, text };
	});
	for (const kind of ["concurrent-recover", "missing-recover", "working-copy", "snapshot-copy", "external", "local-recover"]) for (const failure of kind === "concurrent-recover" ? ["adoption", "retirement", "lost-response"] : ["retirement", "lost-response"]) {
	const result = await tab.evaluate(async ({ kind, failure }) => {
		const { IndexedPagesDevice, HandwritingPages, initialHandwritingPage, appendHandwriting, copyHandwriting, importHandwritingBackground } = window;
		const ink = { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 20, pressure: .5 }] };
		const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800; canvas.getContext("2d").fillRect(0, 0, 1400, 1800);
		const pixels = { mediaType: "image/png", width: 1400, height: 1800, data: canvas.toDataURL("image/png").split(",")[1] };
		const id = `page_${crypto.randomUUID()}`, initial = initialHandwritingPage(appendHandwriting({ version: 1, operations: [] }, { id: "base", kind: "stroke", stroke: ink }));
		const base = { ...initial, id, createdAt: "2026-01-01T00:00:00.000Z", journal: copyHandwriting(initial.journal, id) };
		const advanced = { ...base, journal: await importHandwritingBackground(appendHandwriting(base.journal, { id: "clear", kind: "clear" }), pixels, "incoming") };
		const { chat, writingId } = await window.prepareCreation(base, advanced, pixels.data, kind), device = new IndexedPagesDevice();
		if (kind === "local-recover") { await device.open(chat); await device.commit(chat, 0, { pages: [base], expected: { [id]: null }, activePageId: id }); }
		let fault = true, aborts = 0, denyReads = false; const put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete;
		IDBObjectStore.prototype.put = function(...args) { const result = put.apply(this, args); if (fault && failure === "adoption" && this.name === "pages" && args[0]?.chatId === chat && args[0]?.page?.journal?.head === "incoming") { aborts++; this.transaction.abort(); } return result; };
		IDBObjectStore.prototype.delete = function(...args) { const result = remove.apply(this, args); if (fault && failure === "retirement" && this.name === "pageActions" && args[0]?.[0] === chat) { aborts++; this.transaction.abort(); } return result; };
		const deps = { device, storage: () => localStorage, prepare: async () => {}, flatten: async () => pixels, fetch: async (url, init) => { if (denyReads && !init?.method) throw Error("Repair must retain known incoming state"); const reply = await window.creationRequest(String(url), init); if (fault && failure === "lost-response" && init?.method === "POST") throw Error("Lost creation response after server acceptance"); return new Response(reply.text, { status: reply.status, headers: { "Content-Type": "application/json" } }); } };
		let model = new HandwritingPages(chat, deps);
		try {
			await model.open();
			if (kind === "working-copy") { model.draw(ink); await model.retry(); await model.duplicateWorking(); }
			else if (kind !== "local-recover") await model.openSnapshot({ id: writingId, ...(kind === "external" ? {} : { editableSource: { version: 1 } }) }, kind === "snapshot-copy");
			await model.retry();
			const targetId = model.getSnapshot().page.id, blocked = !model.getSnapshot().ready, before = await device.read(chat, 0);
			// Reconciled local-first pages may accumulate a tail while their exact
			// creation seed still awaits an ACK/retirement. It must never be recaptured.
			let queuedHead = null;
			if (kind !== "concurrent-recover") { model.draw(ink); queuedHead = model.getSnapshot().working.head; await model.retry(); }
			model.dispose(); model = new HandwritingPages(chat, deps); await model.open(); await model.retry();
			const beforeRepair = await device.read(chat, 0), remountedHead = model.getSnapshot().working.head;
			fault = false; denyReads = kind === "concurrent-recover" && failure !== "lost-response"; await model.retry();
			const adopted = model.getSnapshot(); model.draw(ink); const tail = model.getSnapshot().working;
			await model.retry(); await model.retry(); const actions = (await device.read(chat, 0)).actions.length;
			model.dispose(); denyReads = false; model = new HandwritingPages(chat, deps); await model.open(); await model.retry();
			return { id: targetId, aborts, blocked, beforeOrigin: before.pages.find(page => page.id === targetId).origin.kind, beforeActions: before.actions.length, beforeRepairActions: beforeRepair.actions.length, queuedHead, remountedHead, adoptedOrigin: adopted.page.origin.kind, adoptedHead: adopted.working.head, tailHead: tail.head, tailParent: tail.events[tail.head].parent, actions, reloadedHead: model.getSnapshot().working.head, reloadedActions: (await device.read(chat, 0)).actions.length, notice: model.getSnapshot().notice };
		} finally { model.dispose(); IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.delete = remove; }
	}, { kind, failure });
	assert.equal(result.beforeActions, 1); assert.equal(result.beforeRepairActions, 1);
	if (failure !== "lost-response") assert.ok(result.aborts > 0);
	assert.ok(scenario.posts.length >= 2, "Exercise actual retries through remount, not a vacuous one-request comparison");
	assert.equal(scenario.posts[0].status, kind === "concurrent-recover" ? 200 : 201);
	assert.ok(scenario.posts.slice(1).every(post => post.status === 200), JSON.stringify(scenario.posts.map(post => ({ status: post.status, origin: JSON.parse(post.body).page.origin }))));
	const original = JSON.parse(scenario.posts[0].body);
	for (const retry of scenario.posts.slice(1)) assert.deepEqual(JSON.parse(retry.body), original, "Full frozen seed, descriptive metadata, closure and creation identity survive retries/remount");
	if (kind === "concurrent-recover") {
		assert.equal(result.blocked, failure !== "lost-response"); assert.equal(result.beforeOrigin, "recovered");
		assert.equal(result.adoptedOrigin, "working"); assert.equal(result.adoptedHead, "incoming"); assert.equal(result.tailParent, "incoming");
	} else {
		assert.equal(result.blocked, false); assert.ok(result.queuedHead); assert.equal(result.remountedHead, result.queuedHead); assert.equal(result.adoptedHead, result.queuedHead);
		assert.equal(result.adoptedOrigin, original.page.origin.kind); assert.equal(result.tailParent, result.queuedHead);
	}
	assert.equal(result.actions, 0); assert.equal(result.reloadedActions, 0); assert.equal(result.reloadedHead, result.tailHead); assert.equal(result.notice, null);
	assert.equal(stores.handwritingStore.readPage(scenario.chat, result.id).journal.head, result.tailHead);
	assert.equal(stores.handwritingStore.listPages(scenario.chat).filter(page => page.id !== "page_initial").length, 1);
	assert.ok(scenario.puts.some(put => put.page.id === result.id && put.page.origin.kind === result.adoptedOrigin && put.page.journal.head === result.tailHead && put.status === 200));
	assert.equal(stores.chatStore.getChat(scenario.chat).messages.length, 0);
	assert.deepEqual(stores.sharedWritingStore.readSource(scenario.chat, scenario.writingId), scenario.source);
	console.log(`PASS R5 ${kind}/${failure}: real validation, full frozen request identity through remount, atomic retirement, queued tail PUT/reload, one page and immutable snapshot`);
	}
} finally { await browser.close(); await rm(root, { recursive: true, force: true }); }
