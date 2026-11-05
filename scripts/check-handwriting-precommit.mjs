/** Reviewer-derived precommit repro: native WebCrypto + IndexedDB, controlled
 * transport only. No app server, preview slot or external request is used.
 * Run: LH_HANDWRITING_TEST_ROOT=... node scripts/check-handwriting-precommit.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const bundle = await build({
	stdin: { contents: `import {IndexedTransferDevice,CaptureRetiredError} from './components/handwriting/transfer-device.ts';import {HandwritingAttachment} from './components/handwriting/attachment.ts';import {notebookSource,emptyHandwriting,appendHandwriting} from './src/core/handwriting.ts';Object.assign(window,{IndexedTransferDevice,CaptureRetiredError,HandwritingAttachment,notebookSource,emptyHandwriting,appendHandwriting});`, resolveDir: process.cwd(), loader: "ts" },
	bundle: true, write: false, format: "iife", platform: "browser",
	// As in the independent repro, tree-shake unused server barrel reexports.
	// Runtime hashing remains native WebCrypto, with its completion gated below.
	plugins: [{ name: "unused-node-imports", setup(build) { build.onResolve({ filter: /^node:/ }, args => ({ path: args.path, external: true, sideEffects: false })); } }],
});
assert.ok(!bundle.outputFiles[0].text.includes("node:crypto"));
const profile = await mkdtemp(path.join(process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode", "precommit-browser-"));
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", userDataDir: profile, headless: true, args: ["--no-sandbox"] });
try {
	const page = await browser.newPage();
	await page.setRequestInterception(true);
	page.on("request", request => void request.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>Isolated precommit regression</title>" }));
	await page.goto("http://localhost/__isolated_device_regression");
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	for (const phase of ["hash", "first-commit", "encode", "png-save", "upload", "terminal-commit", "already-open"]) {
		for (const trigger of phase === "terminal-commit" ? ["settlement"] : ["online", "attach"]) {
			const result = await page.evaluate(async ({ phase, trigger }) => {
				const { IndexedTransferDevice, HandwritingAttachment, notebookSource, emptyHandwriting, appendHandwriting, CaptureRetiredError } = window;
				const device = new IndexedTransferDevice(), chat = `${phase}-${trigger}`, generation = await device.open(chat), source = notebookSource(emptyHandwriting());
				const newer = notebookSource(appendHandwriting(source.journal, { id: "newer", kind: "stroke", stroke: { tool: "pen", colour: "#171717", penScale: 1, width: 38, points: [{ x: 10, y: 10, pressure: .5 }] } }));
				const draft = { version: 1, chatId: chat, targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "A" } };
				const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
				const held = deferred(), entered = deferred(), readOnReopen = deferred();
				let gateUsed = false, reopening = false, online = phase === "terminal-commit", current, originalCapture, reveals = 0, active = 0, maximum = 0;
				const gate = async name => { if (phase === name && !gateUsed) { gateUsed = true; entered.resolve(); await held.promise; } };
				const digest = crypto.subtle.digest.bind(crypto.subtle), read = device.read.bind(device), save = device.saveCapture.bind(device), finish = device.finishCapture.bind(device);
				crypto.subtle.digest = async (...args) => { await gate("hash"); return digest(...args); };
				device.read = async (...args) => { const result = await read(...args); if (reopening) readOnReopen.resolve(result.captures.length); return result; };
				device.saveCapture = async (...args) => { await gate(args[2].state === "captured" ? "first-commit" : args[2].state === "ready" ? "png-save" : "other"); return save(...args); };
				device.finishCapture = async (...args) => { await gate("terminal-commit"); return finish(...args); };
				const requests = [];
				const deps = { device, encode: async () => { await gate("encode"); return new Blob(["exact original PNG"]); }, changed() {}, reveal() { reveals++; }, refresh: async () => ({ pending: current ? [current] : [], pageAttachments: current ? { page_initial: { revision: current.notebook.pageRevision, writingId: current.id, contentFingerprint: current.notebook.contentFingerprint } } : {} }), fetch: async (url, init) => {
					if (!url.endsWith("/writing")) throw Error("Unexpected tutor input");
					active++; maximum = Math.max(maximum, active);
					try {
						const form = init.body;
						requests.push({ id: form.get("writingId"), revision: form.get("expectedPageRevision"), source: await form.get("source").text(), png: await form.get("image").text() });
						await gate("upload");
						const capture = (await read(chat, generation)).captures[0];
						originalCapture ??= capture;
						if (!online) throw Error("offline");
						current = { id: capture.writingId, createdAt: new Date().toISOString(), notebook: { pageId: capture.pageId, pageRevision: capture.expectedPageRevision + 1, contentFingerprint: capture.contentFingerprint } };
						return Response.json({ writing: current });
					} finally { active--; }
				} };
				const prep = (value, revision = 1, forbidden = false) => ({ pageId: "page_initial", head: current ? { revision: current.notebook.pageRevision, writingId: current.id, contentFingerprint: current.notebook.contentFingerprint } : undefined, valid: () => true, finish: async () => { if (forbidden) throw Error("Recovery prepared newer B"); return true; }, freeze: () => ({ source: value, draft: { ...draft, revision, editor: { text: revision === 1 ? "A" : "Newer B" } }, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) } }) });
				const old = new HandwritingAttachment(chat, deps), next = new HandwritingAttachment(chat, deps);
				await old.open();
				let rowsAtReopen;
				if (phase === "already-open") { await next.open(); rowsAtReopen = (await read(chat, generation)).captures.length; }
				try {
					const original = old.attach(prep(source));
					if (phase === "already-open") { await original; old.dispose(); }
					else {
						await entered.promise; old.dispose(); reopening = true;
						// Unlike the defect-asserting reviewer script, don't await open
						// before releasing its dependency: a correct open joins that owner.
						const opened = next.open(); rowsAtReopen = await readOnReopen.promise;
						held.resolve(); await Promise.all([original, opened]);
					}
				} finally { held.resolve(); crypto.subtle.digest = digest; }
				const discoveredOnReopen = next.hasCapture("page_initial");
				online = true;
				await device.saveDraft(chat, generation, { ...draft, revision: 2, editor: { text: "Newer B" } });
				const unchangedWorking = JSON.stringify(newer);
				if (phase !== "terminal-commit") {
					if (trigger === "online") await next.recover();
					else await next.attach(prep(newer, 2, true));
				}
				const afterRecovery = await read(chat, generation), replayRequests = requests.slice();
				await next.attach(prep(newer, 2));
				next.dispose();
				let retiredWriteBlocked = false;
				try { await device.saveCapture(chat, generation, { ...originalCapture, state: "failed" }, { ...draft, revision: 99, editor: { text: "stale overwrite" } }); } catch (error) { retiredWriteBlocked = error instanceof CaptureRetiredError; }
				const afterB = await read(chat, generation);
				return { rowsAtReopen, discoveredOnReopen, recoveredWithoutRemount: afterRecovery.captures.length === 0 && afterRecovery.captureReceipts[0]?.writingId === requests[0]?.id, exactReplay: replayRequests.every(request => JSON.stringify(request) === JSON.stringify(replayRequests[0])), maximum, nextRevision: afterB.captureReceipts[0]?.pageRevision, remainingCaptures: afterB.captures.length, newerDraftPreserved: afterB.drafts[0]?.editor.text === "Newer B", workingPreserved: unchangedWorking === JSON.stringify(newer), retiredWriteBlocked, reviewed: reveals > 0 };
			}, { phase, trigger });
			console.log(JSON.stringify({ phase, trigger, ...result }));
			assert.equal(result.rowsAtReopen, ["hash", "first-commit", "already-open"].includes(phase) ? 0 : 1);
			assert.equal(result.discoveredOnReopen, !["terminal-commit", "already-open"].includes(phase), "Remount discovers recovery committed during the old preparation");
			assert.equal(result.recoveredWithoutRemount, true, "Reconnect/ordinary Attach recovers saved A without another remount or preparation of B");
			assert.equal(result.exactReplay, true);
			assert.equal(result.maximum, 1);
			assert.equal(result.nextRevision, 2);
			assert.equal(result.remainingCaptures, 0);
			assert.equal(result.newerDraftPreserved && result.workingPreserved && result.retiredWriteBlocked && result.reviewed, true);
		}
	}
	console.log("PASS native precommit/full-lifecycle discovery: reopen, reconnect and ordinary Attach preserve A before B");
} finally { await browser.close(); await rm(profile, { recursive: true, force: true }); }
