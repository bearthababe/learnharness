import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export async function checkHandwritingPages({ page, origin, draw, ready, dir }) {
	await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/handwriting_pages`, { waitUntil: "networkidle2" });
	await page.click('[data-testid="open-notebook"]'); await ready();
	await page.waitForSelector('[aria-label="Pages"]', { timeout: 5000 });
	await draw(200, 300);
	const journal = async () => page.evaluate(() => { const id = document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId; return JSON.parse(localStorage.getItem(`lh:handwriting:pages:v1:handwriting_pages:${id}`)).journal; });
	const attach = async () => { const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/writing") && r.status() === 201); await page.click('[data-testid="notebook-attach"]'); return (await (await response).json()).writing; };
	const a = await attach(), snapshot = await (await fetch(`${origin}/api/chats/handwriting_pages/writing/${a.id}/source`)).text();
	const actions = async id => { await page.locator(`[data-writing-id="${id}"] [aria-label="Snapshot actions"]`).click(); await page.waitForSelector('[data-testid="snapshot-menu"]'); };
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="snapshot-action-status"]', { hidden: true }); await ready();
	const original = await journal();
	await draw(450, 400); const displaced = await journal();
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child');
	await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	assert.deepEqual(await page.$$eval('[data-testid="handwriting-page-decision"] button', buttons => buttons.map(button => button.textContent)), ["Open current working", "Restore snapshot", "Open snapshot as copy", "Cancel"]);
	await page.keyboard.press("Escape"); assert.equal((await journal()).head, displaced.head);
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child');
	await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	await page.click('[data-testid="handwriting-page-decision"] [data-choice="restore"]'); await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true }); await ready();
	const restored = await journal(); assert.equal(restored.events[restored.head].kind, "restore"); assert.equal(restored.pageId, "page_initial");
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	await page.click('[aria-label="Undo"]'); assert.equal((await journal()).events[(await journal()).head].kind, "undo");
	await page.click('[aria-label="Redo"]');
	await page.click('[aria-label="More page actions"]'); await page.click('[data-testid="notebook-options"] button:first-child'); await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId !== "page_initial"); await ready();
	const copy = await journal(); assert.notEqual(copy.pageId, "page_initial");
	await page.click('[aria-label="Pages"]'); await page.waitForSelector('[data-testid="notebook-pages"] img');
	assert.equal((await page.$$('[data-testid="notebook-pages"] [data-page-id]')).length, 2);
	await page.click('[data-testid="notebook-pages"] [data-page-id="page_initial"]'); await ready();
	assert.equal((await journal()).pageId, "page_initial");
	// Simulate a second device: the copied page exists only on the server. Its
	// mounted thumbnail must not poison the following actual navigation read.
	await page.waitForFunction(async id => {
		if (!(await fetch(`/api/chats/handwriting_pages/handwriting/pages/${id}`)).ok) return false;
		const db = await new Promise(resolve => { const request = indexedDB.open("lh-handwriting-working", 1); request.onsuccess = () => resolve(request.result); });
		const actions = await new Promise(resolve => { const request = db.transaction("pageActions").objectStore("pageActions").getAll(); request.onsuccess = () => resolve(request.result); }); db.close();
		return !actions.some(action => action.chatId === "handwriting_pages" && action.pageId === id);
	}, {}, copy.pageId);
	await page.evaluate(async id => {
		localStorage.removeItem(`lh:handwriting:pages:v1:handwriting_pages:${id}`);
		const db = await new Promise(resolve => { const request = indexedDB.open("lh-handwriting-working", 1); request.onsuccess = () => resolve(request.result); });
		await new Promise((resolve, reject) => { const tx = db.transaction("pages", "readwrite"); tx.objectStore("pages").delete(["handwriting_pages", id]); tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
	}, copy.pageId);
	await page.reload({ waitUntil: "networkidle2" }); await ready(); await page.click('[aria-label="Pages"]');
	await page.waitForSelector(`[data-testid="notebook-pages"] [data-page-id="${copy.pageId}"] img`);
	await page.click(`[data-testid="notebook-pages"] [data-page-id="${copy.pageId}"]`);
	await page.waitForFunction(id => document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId === id, {}, copy.pageId); await ready();
	await page.click('[aria-label="Pages"]'); await page.click('[data-testid="notebook-pages"] [data-page-id="page_initial"]'); await ready();
	assert.equal(await (await fetch(`${origin}/api/chats/handwriting_pages/writing/${a.id}/source`)).text(), snapshot);
	assert.deepEqual((await (await fetch(`${origin}/api/chats/handwriting_pages/writing`)).json()).pending.map(w => w.id), [a.id]);
	assert.ok(Object.keys((await journal()).events).length > Object.keys(original.events).length);
	console.log("PASS actual Pages, unified snapshot Open, four choices/Cancel, Restore reload Undo/Redo, independent header Duplicate and immutable attachment");

	// Snapshot Duplicate is exact even after current working diverges again.
	await draw(600, 450); const currentBeforeCopy = await journal();
	await page.$eval('[data-testid="notebook-paper-scroll"]', area => { area.scrollTop = 120; });
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:nth-child(2)');
	await page.waitForFunction(old => document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId !== old, {}, "page_initial"); await ready();
	const exactCopy = await journal(); assert.equal(exactCopy.head, JSON.parse(snapshot).journal.head); assert.deepEqual(exactCopy.events, JSON.parse(snapshot).journal.events);
	const b = await attach(); assert.notEqual(b.notebook.pageId, a.notebook.pageId);
	await page.click('[aria-label="More page actions"]'); await page.click('[data-testid="notebook-options"] button:first-child');
	await page.waitForFunction(old => document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId !== old, {}, b.notebook.pageId); await ready();
	const c = await attach(); await draw(750, 500); const d = await attach();
	assert.deepEqual(new Set((await (await fetch(`${origin}/api/chats/handwriting_pages/writing`)).json()).pending.map(w => w.id)), new Set([a.id, b.id, d.id]));
	assert.equal(c.notebook.pageId, d.notebook.pageId);
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	await page.click('[data-choice="current"]'); await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true }); await ready();
	assert.equal((await journal()).head, currentBeforeCopy.head);
	assert.ok(await page.$eval('[data-testid="notebook-paper-scroll"]', area => area.scrollTop > 0), "Open current returns to this page's reading position");
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	await page.click('[data-choice="copy"]'); await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true }); await ready();
	assert.equal((await journal()).head, JSON.parse(snapshot).journal.head); assert.notEqual((await journal()).pageId, "page_initial");
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	await page.click('[data-choice="restore"]'); await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true }); await ready();
	assert.equal(await page.$eval('[data-testid="notebook-paper-scroll"]', area => area.scrollTop), 0, "Restore starts at the top even when switching to a previously visited page");
	await draw(600, 450);
	console.log("PASS exact snapshot Duplicate/copy, current-working choice, independent stage Attach and same-page-only replacement");

	// Abort the actual native transaction before its pointer publication. There
	// must be no server create, page activation or accepted extra UUID.
	const beforeAbort = await journal(), countBeforeAbort = (await (await fetch(`${origin}/api/chats/handwriting_pages/handwriting/pages`)).json()).pages.length;
	await page.evaluate(() => { window.pagesPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { const result = window.pagesPut.apply(this, args); if (this.transaction.db.name === "lh-handwriting-working" && this.name === "sessions") this.transaction.abort(); return result; }; });
	await page.click('[aria-label="More page actions"]'); await page.click('[data-testid="notebook-options"] button:first-child');
	await page.waitForFunction(() => document.querySelector('.hw-notice')?.textContent.includes("It is still open"));
	assert.equal((await journal()).pageId, beforeAbort.pageId);
	assert.equal((await (await fetch(`${origin}/api/chats/handwriting_pages/handwriting/pages`)).json()).pages.length, countBeforeAbort);
	await page.evaluate(() => { IDBObjectStore.prototype.put = window.pagesPut; });

	// Remove only this isolated original's working records, retaining its exact
	// attachment. A reload removes the controller's in-memory cache too.
	await rm(path.join(dir, `data/handwriting/handwriting_pages/${b.notebook.pageId}.json`));
	await page.evaluate(async id => { localStorage.removeItem(`lh:handwriting:pages:v1:handwriting_pages:${id}`); const db = await new Promise(resolve => { const req = indexedDB.open("lh-handwriting-working", 1); req.onsuccess = () => resolve(req.result); }); await new Promise((resolve, reject) => { const tx = db.transaction("pages", "readwrite"); tx.objectStore("pages").delete(["handwriting_pages", id]); tx.oncomplete = resolve; tx.onabort = reject; }); db.close(); }, b.notebook.pageId);
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	await actions(b.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="snapshot-action-status"]', { hidden: true }); await ready();
	assert.equal((await journal()).pageId, b.notebook.pageId); assert.equal((await journal()).head, JSON.parse(snapshot).journal.head);
	console.log("PASS real local transaction abort and safe missing-original recovery under the original page identity");

	// Submitted snapshots take the very same Open flow. This fixture write is
	// isolated canonical history, never a tutor/provider request.
	const file = path.join(dir, "data/chats/handwriting_pages.json"), record = JSON.parse(await readFile(file, "utf8"));
	record.messages.unshift({ role: "user", id: "sent-stage", content: [{ type: "text", text: "Previously sent stage." }], sharedWriting: [a], timestamp: Date.now() }); await writeFile(file, JSON.stringify(record));
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	await page.click('[aria-label="Close page"]'); // the canvas's Close (visible "Close")
	await actions(a.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	assert.equal(await page.$eval('[data-testid="handwriting-page-decision"] h2', e => document.activeElement === e), true);
	await page.click('[data-choice="restore"]'); await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true }); await ready();
	assert.equal((await journal()).pageId, "page_initial"); assert.equal(await (await fetch(`${origin}/api/chats/handwriting_pages/writing/${a.id}/source`)).text(), snapshot);
	assert.equal(await page.$eval('[data-testid="notebook-paper-scroll"]', area => area.scrollTop), 0, "Restore starts at the top even when switching to a previously visited page");
	console.log("PASS sent snapshot uses original page/four choices with neutral focus and immutable stored source");
	await checkHandwritingImports({ page, origin, draw, ready });
}

export async function checkHandwritingImports({ page, origin, draw, ready }) {
	const actions = async id => { await page.locator(`[data-writing-id="${id}"] [aria-label="Snapshot actions"]`).click(); await page.waitForSelector('[data-testid="snapshot-menu"]'); };
	// Tutor SVG stays untouched; import is a full-page independent raster with
	// inherited placement, separate eraser layer, and reload-safe Undo/Redo.
	await page.goto(`${origin}/chat/handwriting_import`, { waitUntil: "networkidle2" });
	const figure = await page.$eval('[data-testid="visual-svg"] img', image => image.getAttribute("src"));
	await page.locator('[data-testid="visual-card"] button').filter(button => button.textContent === "Annotate in notebook").click(); await ready();
	await page.waitForFunction(() => document.querySelector('[data-testid="notebook-slot"]')?.hidden === false);
	const pixels = await page.$eval('[data-testid="notebook-background"]', canvas => [[79, 80], [81, 81], [1318, 698], [700, 702], [700, 1700]].map(([x, y]) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data]));
	assert.deepEqual(pixels, [[255,255,255,255], [255,0,0,255], [255,0,0,255], [255,255,255,255], [255,255,255,255]]);
	assert.equal(await page.$eval('[data-testid="visual-svg"] img', image => image.getAttribute("src")), figure);
	assert.ok(await page.evaluate(() => !localStorage.getItem("lh:handwriting:pages:v1:handwriting_import:page_initial").includes('"data":')));
	await draw(300, 300); await page.click('[aria-label="Eraser"]'); await draw(300, 300);
	assert.deepEqual(await page.$eval('[data-testid="notebook-background"]', canvas => [...canvas.getContext("2d").getImageData(300, 300, 1, 1).data]), [255,0,0,255]);
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	await page.click('[aria-label="Undo"]'); await page.click('[aria-label="Undo"]'); await page.click('[aria-label="Undo"]');
	assert.deepEqual(await page.$eval('[data-testid="notebook-background"]', canvas => [...canvas.getContext("2d").getImageData(300, 300, 1, 1).data]), [255,255,255,255]);
	await page.click('[aria-label="Redo"]'); await ready();
	await page.waitForFunction(() => document.querySelector('[data-testid="notebook-background"]').getContext("2d").getImageData(300, 300, 1, 1).data[1] === 0);
	await page.locator('[data-testid="visual-card"] button').filter(button => button.textContent === "Annotate in notebook").click();
	await page.waitForFunction(() => document.body.textContent.includes("Import needs an empty page."));
	console.log("PASS actual tutor SVG annotation geometry, independent lossless background/eraser, compact recovery, reload Undo/Redo and empty-only admission");

	await page.goto(`${origin}/chat/handwriting_external`, { waitUntil: "networkidle2" });
	const external = await page.evaluate(async () => { const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 2; const context = canvas.getContext("2d"); context.fillStyle = "red"; context.fillRect(0,0,4,2); const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png")); return (await (await fetch("/api/chats/handwriting_external/writing", { method: "POST", body: png })).json()).writing; });
	await page.waitForSelector(`[data-writing-id="${external.id}"]`); await actions(external.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="snapshot-action-status"]', { hidden: true }); await ready();
	await page.waitForFunction(() => document.body.textContent.includes("Flattened image · original marks cannot be erased"));
	const externalId = await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId);
	assert.deepEqual(await page.$eval('[data-testid="notebook-background"]', canvas => [[700,549], [700,551], [700,1248], [700,1251]].map(([x,y]) => [...canvas.getContext("2d").getImageData(x,y,1,1).data])), [[255,255,255,255],[255,0,0,255],[255,0,0,255],[255,255,255,255]]);
	await actions(external.id); await page.click('[data-testid="snapshot-menu"] button:first-child'); await page.waitForSelector('[data-testid="snapshot-action-status"]', { hidden: true }); await ready();
	assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId), externalId);
	const externalPages = (await (await fetch(`${origin}/api/chats/handwriting_external/handwriting/pages`)).json()).pages;
	assert.equal(externalPages.filter(p => p.origin.kind === "external").length, 1);
	assert.equal((await (await fetch(`${origin}/api/chats/handwriting_external/writing`)).json()).pending[0].id, external.id);
	console.log("PASS source-less PNG explicit flattening, whole-image centred containment, one-origin Open and untouched external attachment");

	// Freeze an Attach on the external original, then navigate while only its
	// transport is held. Settlement must not select/reveal or capture the copy.
	await draw(300, 300);
	await page.evaluate(() => { const fetch = window.fetch.bind(window); window.pageFetch = fetch; window.fetch = async (url, init) => { if (init?.method === "POST" && String(url).endsWith("/writing")) { window.heldPageUpload = true; await new Promise(resolve => { window.releasePageUpload = resolve; }); } return fetch(url, init); }; });
	const uploaded = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.click('[data-testid="notebook-attach"]'); await page.waitForFunction(() => window.heldPageUpload);
	await page.click('[aria-label="More page actions"]'); await page.click('[data-testid="notebook-options"] button:first-child');
	await page.waitForFunction(id => document.querySelector('[data-testid="handwriting-notebook"]').dataset.pageId !== id, {}, externalId); await ready();
	const selectedAfterFreeze = await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId);
	await page.evaluate(() => { window.releasePageUpload(); window.fetch = window.pageFetch; });
	const frozen = (await (await uploaded).json()).writing;
	assert.equal(frozen.notebook.pageId, externalId);
	assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId), selectedAfterFreeze);
	assert.equal((await (await fetch(`${origin}/api/chats/handwriting_external/writing/${frozen.id}/source`)).json()).journal.pageId, externalId);
	console.log("PASS frozen Attach identity and source survive page switch without late page selection or retargeting");

	await page.evaluate(() => { const drawImage = CanvasRenderingContext2D.prototype.drawImage; window.restorePagePainter = () => { CanvasRenderingContext2D.prototype.drawImage = drawImage; }; CanvasRenderingContext2D.prototype.drawImage = function(...args) { if (this.canvas.dataset.testid === "notebook-background") throw new Error("Injected postcommit paint failure"); return drawImage.apply(this, args); }; });
	await page.click('[aria-label="More page actions"]'); await page.click('[data-testid="notebook-options"] button:first-child');
	await page.waitForFunction(() => [...document.querySelectorAll('.hw-notice')].some(e => e.textContent.includes("Couldn’t")));
	assert.ok(await page.$$eval('.hw-notice', elements => elements.some(e => e.textContent.includes("Page saved on this device. Couldn’t finish opening it."))), "A failed postcommit paint must report the accepted page honestly");
	const acceptedAfterPaintFailure = await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId);
	assert.notEqual(acceptedAfterPaintFailure, selectedAfterFreeze);
	const failedHead = await page.evaluate(id => JSON.parse(localStorage.getItem(`lh:handwriting:pages:v1:handwriting_external:${id}`)).journal.head, acceptedAfterPaintFailure);
	await draw(300, 300);
	assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem(`lh:handwriting:pages:v1:handwriting_external:${id}`)).journal.head, acceptedAfterPaintFailure), failedHead, "Failed rendering must block drawing until the committed page can be shown");
	await page.evaluate(() => window.restorePagePainter());
	await page.click('.hw-notice button'); await ready();
	assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.pageId), acceptedAfterPaintFailure, "Retry opens the committed copy instead of minting another");
	assert.deepEqual(await page.$eval('[data-testid="notebook-background"]', canvas => [...canvas.getContext("2d").getImageData(700,900,1,1).data]), [255,0,0,255]);
	console.log("PASS accepted page survives postcommit paint failure and Retry opens that same durable identity");
}
