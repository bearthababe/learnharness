/** Real drawing controls and request/reopen boundaries; disposable data only.
 * Chromium pen/touch emulation is not physical iPad acceptance. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile, appendFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { checkHandwritingPages, checkHandwritingImports } from "./handwriting-pages-checks.mjs";
import { sourceEntries, sourceFingerprint } from "./mobile-browser-result.mjs";

const root = process.cwd(), dir = await mkdtemp(path.join(process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode", "handwriting-browser-"));
const fingerprint = await sourceFingerprint(root);
for (const name of sourceEntries) await cp(path.join(root, name), path.join(dir, name), { recursive: true });
assert.equal(await sourceFingerprint(dir), fingerprint, "Handwriting fixture uses the complete current application and lockfile");
console.log(`Handwriting source SHA-256: ${fingerprint}`);
await cp(await realpath(path.join(root, "node_modules")), path.join(dir, "node_modules"), { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
await mkdir(path.join(dir, "data/chats"), { recursive: true });
const now = new Date().toISOString();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = content => ({ role: "assistant", content, id: "question", api: "openai-completions", provider: "openrouter", model: "test", usage, stopReason: "stop", timestamp: Date.now() });
for (const id of ["handwriting_teach", "handwriting_practice", "handwriting_drill", "handwriting_ack_0", "handwriting_ack_1", "handwriting_ack_2", "handwriting_read_race", "handwriting_background", "handwriting_pages", "handwriting_import", "handwriting_external"]) {
	const practice = id === "handwriting_practice" || id === "handwriting_drill";
	const messages = [assistant([{ type: "text", text: "Work out pressure = force / area.\n\n".repeat(35) }, { type: "toolCall", name: practice ? "problem" : "ask_user_question", id: "problem-one", arguments: practice ? { statement: "Find the pressure for 100 N on 2 m².", mode: "apply", target: ["pressure"], modelSolution: "50 Pa" } : { question: "Explain how force and area affect pressure.", mode: "text" } }])];
	if (id === "handwriting_import") messages.unshift({ role: "custom", id: "figure", customType: "subagent-steer", content: "Scripted tutor figure", display: true, timestamp: Date.now(), details: { jobId: "scripted-figure", kind: "visual", result: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>' } } });
	if (practice) messages.push({ role: "toolResult", id: "result", toolName: "problem", toolCallId: "problem-one", content: [{ type: "text", text: "Ready" }], details: null, isError: false, timestamp: Date.now() });
	await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ id, title: id, createdAt: now, updatedAt: now, messages, ...(practice ? { kind: "practice" } : {}), ...(id.endsWith("drill") ? { practiceMode: "drill" } : {}) }));
}
// No test can accidentally start a live tutor or mint speech credentials.
await writeFile(path.join(dir, "app/api/chat/route.ts"), 'export async function POST() { return new Response("No model calls in handwriting checks", { status: 503 }); }');
await writeFile(path.join(dir, "app/api/stt/token/route.ts"), 'export async function GET() { return new Response(null, { status: 503 }); }');
const port = Number(process.env.LH_HANDWRITING_TEST_PORT ?? 3115);
	assert.ok(![3000, 3001, 3002].includes(port));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: dir, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, LH_DATA_DIR: path.join(dir, "data"), LH_AUTH_FILE: path.join(dir, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "", browser, page;
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { log += data; void appendFile(path.join(dir, "server.log"), data); });
console.log(`Disposable handwriting app: ${dir}`);
try {
	for (let i = 0; !log.includes("Ready in"); i++) { if (server.exitCode !== null || i > 120) throw new Error(log); await new Promise(resolve => setTimeout(resolve, 500)); }
	browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", userDataDir: `${dir}-chromium-profile`, headless: true, args: ["--no-sandbox", "--disable-features=BackForwardCache"] });
	page = await browser.newPage();
	const errors = [], turns = [];
	page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
	page.on("request", request => { if (new URL(request.url()).pathname === "/api/chat" && request.method() === "POST") turns.push(request.url()); });
	await page.evaluateOnNewDocument(() => { try { localStorage.setItem("lh:sidebar-open", "0"); localStorage.setItem("lh:device-tool:writing", "on"); localStorage.setItem("lh:device-tool:notebook", "on"); } catch { /* sandboxed generated-artifact frames have no storage */ } });
	let failWrites = false, failReads = false, holdNextWrite = false, heldWrite, holdNextRead = false, heldRead, failDelete = false;
	const handwritingWrites = [];
	const workingUrl = url => new URL(url).pathname.endsWith("/handwriting/pages/page_initial");
	await page.setRequestInterception(true);
	page.on("request", request => {
		if (request.method() === "PUT" && workingUrl(request.url())) handwritingWrites.push(request.url());
		if (holdNextRead && request.method() === "GET" && workingUrl(request.url())) { holdNextRead = false; heldRead = request; return; }
		if (failDelete && request.method() === "DELETE") { void request.respond({ status: 503, contentType: "application/json", body: '{"error":"Injected deletion failure","code":"unavailable"}' }); return; }
		if (holdNextWrite && request.method() === "PUT" && workingUrl(request.url())) { holdNextWrite = false; heldWrite = request; return; }
		if (workingUrl(request.url()) && ((failWrites && request.method() === "PUT") || (failReads && request.method() === "GET"))) void request.respond({ status: 503, contentType: "application/json", body: '{"error":"Injected storage outage"}' });
		else void request.continue();
	});
	await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/handwriting_teach`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector('[data-testid="open-notebook"]', { timeout: 10_000 });
	await page.click('[data-testid="open-notebook"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.getAttribute("data-ready") === "true");
	const canvas = '[data-testid="notebook-canvas"]';
	const cdp = await page.createCDPSession();
	async function draw(x = 100, y = 110) {
		const r = await page.$eval(canvas, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; });
		const point = (px, py) => ({ x: r.x + px * r.width / 1400, y: r.y + py * r.width / 1400 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point(x, y), button: "left", buttons: 1, pointerType: "pen", force: 0.4 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point(x + 120, y + 60), buttons: 1, pointerType: "pen", force: 0.8 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point(x + 120, y + 60), button: "left", pointerType: "pen" });
	}
	const bitmap = () => page.$eval(canvas, e => e.toDataURL());
	const ready = () => page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.getAttribute("data-ready") === "true");
	const action = label => page.click(`[aria-label="${label}"]`);
	const pencilTap = async (label, dragAway = false) => {
		const r = await page.$eval(`[aria-label="${label}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...r, button: "left", buttons: 1, pointerType: "pen", force: 0.5 });
		const end = dragAway ? { x: r.x - 180, y: r.y } : r;
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...end, buttons: 1, pointerType: "pen", force: 0.5 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...end, button: "left", pointerType: "pen" });
	};
	if (process.env.LH_HANDWRITING_IMPORT_ONLY) await checkHandwritingImports({ page, origin, draw, ready });
	else if (process.env.LH_HANDWRITING_PAGES_ONLY) await checkHandwritingPages({ page, origin, draw, ready, dir });
	else {
	// Review regression: a previous real save is acknowledged while the next
	// accepted Pencil stroke is active. Corrupt/newer/divergent device truth
	// blocks reconciliation, but must not discard the stroke on release/reopen.
	for (const [index, replacement] of ["{broken", '{"version":2,"operations":[]}', JSON.stringify({ version: 1, operations: [{ id: "another-history", kind: "clear" }] })].entries()) {
		const id = `handwriting_ack_${index}`, key = `lh:handwriting:v1:${id}`;
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		await page.click('[data-testid="open-notebook"]'); await ready();
		holdNextWrite = true;
		const saving = page.waitForRequest(request => request.method() === "PUT" && workingUrl(request.url()));
		await draw(200, 450); await saving;
		const firstInk = await bitmap();
		const ack = await fetch(heldWrite.url(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: heldWrite.postData() });
		assert.equal(ack.status, 200); const acknowledged = await ack.text();
		const r = await page.$eval(canvas, e => { const r = e.getBoundingClientRect(); return { x: r.x + 210, y: r.y + 270 }; });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...r, button: "left", buttons: 1, pointerType: "pen", force: 0.7 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + 45, y: r.y + 20, buttons: 1, pointerType: "pen", force: 0.7 });
		await page.evaluate((key, replacement) => {
			localStorage.setItem(key, replacement); window.hwReconcileRead = false;
			const get = Storage.prototype.getItem;
			Storage.prototype.getItem = function(name) { if (name === key) window.hwReconcileRead = true; return get.call(this, name); };
		}, key, replacement);
		await heldWrite.respond({ status: 200, contentType: "application/json", body: acknowledged });
		await page.waitForFunction(() => window.hwReconcileRead);
		assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.ready), "true", "Blocking ACK stays quiet until the accepted stroke finishes");
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x + 45, y: r.y + 20, button: "left", pointerType: "pen" });
		const completed = await bitmap(); assert.notEqual(completed, firstInk);
		await page.reload({ waitUntil: "networkidle2" });
		await page.waitForSelector('.hw-notice');
		await page.waitForFunction(() => !document.querySelector('.hw-notice')?.textContent.includes("Opening notebook"));
		assert.ok(await bitmap() === completed, "A completed accepted stroke remains recoverable after a blocking ACK and reload");
		assert.equal(await page.evaluate(key => localStorage.getItem(key), key), replacement, "Unrecognized/divergent device data is never replaced");
		assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.ready), "false");
		// Repair only the injected record; Retry must now recover and sync the
		// retained stroke through the real endpoint, with editable Undo intact.
		await page.evaluate((key, value) => localStorage.setItem(key, JSON.stringify(JSON.parse(value).journal)), key, acknowledged);
		const recoveredSave = page.waitForResponse(response => response.request().method() === "PUT" && workingUrl(response.url()) && response.status() === 200);
		await page.click('.hw-notice button'); await ready();
		await recoveredSave;
		assert.equal(Object.keys((await (await fetch(`${origin}/api/chats/${id}/handwriting`)).json()).events).length, 2);
		await pencilTap("Undo"); assert.ok(await bitmap() === firstInk, "Recovered stroke remains individually undoable");
	}
	console.log("PASS blocking ACK during accepted stroke, device preservation, reload and Retry");
	{
		const id = "handwriting_read_race", key = `lh:handwriting:v1:${id}`;
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		holdNextRead = true;
		const reading = page.waitForRequest(request => request.method() === "GET" && workingUrl(request.url()));
		await page.click('[data-testid="open-notebook"]'); await reading;
		const response = await fetch(heldRead.url()); assert.equal(response.status, 404);
		const empty = await response.text();
		const newer = await (await fetch(`${origin}/api/chats/handwriting_ack_0/handwriting`)).text();
		await page.evaluate((key, newer) => {
			localStorage.setItem(key, newer); window.hwReadNative = Storage.prototype.getItem;
			Storage.prototype.getItem = function(name) { if (name === key) throw new DOMException("Unreadable reconciliation", "SecurityError"); return window.hwReadNative.call(this, name); };
		}, key, newer);
		await heldRead.respond({ status: response.status, contentType: "application/json", body: empty });
		await page.waitForFunction(() => document.querySelector('.hw-notice')?.textContent.includes("Retry before editing"));
		assert.equal(await page.$eval('[data-testid="handwriting-notebook"]', e => e.dataset.ready), "false");
		const blank = await bitmap(); await draw(200, 450);
		assert.ok(await bitmap() === blank, "Unreadable reconciliation never enables drawing");
		assert.equal(handwritingWrites.filter(url => url.includes(id)).length, 0, "No blind PUT while device truth is unreadable");
		assert.equal(await page.evaluate(key => window.hwReadNative.call(localStorage, key), key), newer);
		await page.evaluate(() => { Storage.prototype.getItem = window.hwReadNative; });
		const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes(id) && response.status() === 200);
		await page.click('.hw-notice button'); await ready(); await saved;
		assert.ok(await bitmap() !== blank, "Retry discovers and restores the newer device working");
	}
	console.log("PASS unreadable reconciliation blocks actual drawing and PUT until Retry");
	await page.goto(`${origin}/chat/handwriting_teach`, { waitUntil: "networkidle2" }); await ready();
	await draw(200, 450);
	const ink = await bitmap();
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.getAttribute("data-ready") === "true");
	assert.equal(await bitmap(), ink, "Completed editable ink is restored on reload");
	await page.click('[aria-label="Page options"]'); await page.click('[aria-label="Clear"]');
	const cleared = await bitmap(); assert.notEqual(cleared, ink);
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.getAttribute("data-ready") === "true");
	await page.click('[aria-label="Undo"]');
	assert.equal(await bitmap(), ink, "Undo after reload restores Clear's editable working");
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	await pencilTap("Redo"); assert.equal(await bitmap(), cleared, "Actual Pencil Redo reapplies Clear after reload");
	await pencilTap("Undo"); assert.equal(await bitmap(), ink);
	console.log("PASS real drawing + reload + persistent Clear/Undo");

	// All tool activations go through actual pointer/click controls. A Pencil
	// release plus its compatibility click must undo exactly one action.
	await pencilTap("Eraser", true);
	assert.equal(await page.$eval('[aria-label="Pen"]', e => e.getAttribute("aria-pressed")), "true", "Dragging away cancels Pencil tool activation");
	for (const colour of ["Blue", "Red", "Green", "Black"]) {
		await pencilTap("Pen"); await pencilTap(`${colour} pen`);
		await draw(210, 460);
		const working = await page.evaluate(() => JSON.parse(localStorage.getItem("lh:handwriting:pages:v1:handwriting_teach:page_initial")).journal);
		assert.equal(working.events[working.head].stroke.colour, { Blue: "#2563eb", Red: "#dc2626", Green: "#15803d", Black: "#171717" }[colour]);
		await pencilTap("Undo");
		assert.equal(await bitmap(), ink, "Pencil Undo runs once, including a compatibility click");
	}
	await pencilTap("Pen"); await pencilTap("Thick pen");
	await pencilTap("Eraser"); await pencilTap("Small eraser");
	await draw(200, 450); assert.notEqual(await bitmap(), ink);
	await pencilTap("Undo"); assert.equal(await bitmap(), ink, "Eraser is an editable operation");
	await pencilTap("Highlighter"); await pencilTap("Large highlighter");
	for (const [label, size] of [["Pen", "Thick pen"], ["Eraser", "Small eraser"], ["Highlighter", "Large highlighter"]]) {
		await pencilTap(label);
		assert.equal(await page.$eval(`[aria-label="${size}"]`, e => e.getAttribute("aria-pressed")), "true", "Each tool remembers its own size during use");
		await action("Close tool settings");
	}
	await draw(200, 450);
	const highlighted = await bitmap(); assert.notEqual(highlighted, ink);
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), highlighted, "Highlighter replay matches the live completed stroke");
	await pencilTap("Undo"); assert.equal(await bitmap(), ink);
	// Finger contact never draws, and only stylus TouchEvents are claimed.
	const guarded = await page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="notebook-canvas"]'), before = canvas.toDataURL();
		const r = canvas.getBoundingClientRect();
		for (const type of ["pointerdown", "pointermove", "pointerup"]) canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 32, button: 0, buttons: 1, clientX: r.x + 100, clientY: r.y + 180 }));
		const claim = (target, type, stylus) => {
			const touch = new Touch({ identifier: 1, target, clientX: r.x + 100, clientY: r.y + 180 });
			Object.defineProperty(touch, "touchType", { value: stylus ? "stylus" : "direct" });
			const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch] }); target.dispatchEvent(event); return event.defaultPrevented;
		};
		const pen = document.querySelector('[aria-label="Pen"]');
		return { unchanged: before === canvas.toDataURL(), canvas: [claim(canvas, "touchstart", true), claim(canvas, "touchmove", true)], tools: ["touchstart", "touchmove", "touchend"].map(type => claim(pen, type, true)), fingers: [claim(canvas, "touchstart", false), claim(canvas, "touchmove", false), claim(pen, "touchend", false)], policy: getComputedStyle(canvas).touchAction };
	});
	assert.deepEqual(guarded, { unchanged: true, canvas: [true, true], tools: [true, true, true], fingers: [false, false, false], policy: "pan-y pinch-zoom" });
	console.log("PASS Pencil activation, colours, erasing, highlighting, touch guards");

	// No persistence, image copies, status/control changes on movement. Fail a
	// prior save while the next stroke is active to include asynchronous UI.
	failWrites = true;
	holdNextWrite = true;
	const nextSave = page.waitForRequest(request => request.method() === "PUT" && workingUrl(request.url()));
	await draw(220, 470);
	await nextSave;
	assert.ok(heldWrite, "Hold a real save request until the next stroke");
	await pencilTap("Highlighter"); await pencilTap("Medium highlighter");
	await page.evaluate(() => {
		window.hwMetrics = { writes: 0, copies: 0, mutations: 0 };
		const set = Storage.prototype.setItem, copy = CanvasRenderingContext2D.prototype.drawImage;
		Storage.prototype.setItem = function(...args) { window.hwMetrics.writes++; return set.apply(this, args); };
		CanvasRenderingContext2D.prototype.drawImage = function(...args) { window.hwMetrics.copies++; return copy.apply(this, args); };
		window.hwObserver = new MutationObserver(records => { window.hwMetrics.mutations += records.length; });
		window.hwObserver.observe(document.querySelector('[data-testid="handwriting-notebook"]'), { subtree: true, attributes: true, childList: true, characterData: true });
	});
	const r = await page.$eval(canvas, e => { const r = e.getBoundingClientRect(); return { x: r.x + 140, y: r.y + 230 }; });
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...r, button: "left", buttons: 1, pointerType: "pen", force: 0.6 });
	await heldWrite.respond({ status: 503, contentType: "application/json", body: '{"error":"Failure during the next stroke"}' });
	for (let i = 1; i <= 20; i++) await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + i * 2, y: r.y + i, buttons: 1, pointerType: "pen", force: 0.6 });
	assert.deepEqual(await page.evaluate(() => window.hwMetrics), { writes: 0, copies: 0, mutations: 0 }, "Only ink changes during an active stroke");
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x + 40, y: r.y + 20, button: "left", pointerType: "pen" });
	assert.equal(await page.evaluate(() => window.hwMetrics.copies), 1, "Highlighter merges once on completion");
	await page.evaluate(() => window.hwObserver.disconnect());
	const pendingInk = await bitmap();
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), pendingInk, "Failed server save recovers the completed local working");
	await action("Page options"); await action("Clear");
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), cleared, "Immediate reload after Clear uses the device journal");
	await pencilTap("Undo"); assert.equal(await bitmap(), pendingInk);
	failWrites = false;
	await page.waitForFunction(() => !document.body.textContent.includes("couldn’t save to LearnHarness"), { timeout: 12_000 });
	console.log("PASS quiet writing, automatic retry, rapid reload and local recovery");

	// #47 permits previously accepted device working during network outage.
	// Cold/unreadable truth still blocks, as the read-race test above verifies.
	failReads = true;
	await page.reload({ waitUntil: "networkidle2" });
	await ready();
	assert.equal(await bitmap(), pendingInk);
	failReads = false;
	await page.evaluate(async () => {
		localStorage.removeItem("lh:handwriting:pages:v1:handwriting_teach:page_initial");
		const db = await new Promise(resolve => { const request = indexedDB.open("lh-handwriting-working", 1); request.onsuccess = () => resolve(request.result); });
		await new Promise((resolve, reject) => { const tx = db.transaction("pages", "readwrite"); tx.objectStore("pages").delete(["handwriting_teach", "page_initial"]); tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
	});
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), pendingInk, "Server truth reopens editable working without the browser copy");
	failWrites = true;
	await page.evaluate(() => {
		window.restoreDeviceWrites = Storage.prototype.setItem;
		Storage.prototype.setItem = function(key, value) { if (key.startsWith("lh:handwriting:pages:")) throw new DOMException("Injected full storage", "QuotaExceededError"); return window.restoreDeviceWrites.call(this, key, value); };
		window.restoreWorkingPuts = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function(...args) { if (this.transaction.db.name === "lh-handwriting-working" && this.name === "pages") throw new DOMException("Injected checkpoint quota", "QuotaExceededError"); return window.restoreWorkingPuts.apply(this, args); };
	});
	await draw(230, 480);
	await page.waitForFunction(() => document.body.textContent.includes("this device or to LearnHarness"));
	failWrites = false; await page.click('.hw-notice button');
	await page.waitForFunction(() => document.body.textContent.includes("Saved to LearnHarness; device recovery is unavailable"));
	await page.evaluate(() => { Storage.prototype.setItem = window.restoreDeviceWrites; IDBObjectStore.prototype.put = window.restoreWorkingPuts; });
	await page.click('.hw-notice button');
	await page.waitForFunction(() => !document.querySelector('.hw-notice'));
	await pencilTap("Undo"); assert.equal(await bitmap(), pendingInk, "Working remains editable after both storage paths recover");

	// Persisted ink must not depend on a question identity. Advance only the
	// disposable fixture via the existing session refresh boundary, never Tutor.
	const fixture = path.join(dir, "data/chats/handwriting_teach.json");
	const session = JSON.parse(await readFile(fixture, "utf8"));
	session.messages[0].content.at(-1).id = "problem-two";
	session.messages[0].content.at(-1).arguments.question = "Now explain the next problem.";
	await writeFile(fixture, JSON.stringify(session));
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), pendingInk, "The continuing notebook is independent of the question");

	// Accepted card fills its pane; split/expand/close preserve paper, editor
	// draft and reading positions. Browser geometry is distinct from iPad feel.
	const field = '[data-file-path-input]';
	await page.$eval(field, e => e.focus()); await page.keyboard.sendCharacter("My unsent explanation");
	await page.$eval(field, e => e.blur());
	await page.focus('[data-testid="notebook-split-divider"]'); await page.keyboard.press("ArrowUp");
	const dividerShare = await page.$eval('[data-testid="notebook-split-divider"]', e => e.getAttribute("aria-valuenow"));
	await page.$eval('[data-testid="notebook-paper-scroll"]', e => { e.scrollTop = 180; });
	const beforeExpand = await page.$eval('[data-testid="notebook-paper-scroll"]', e => e.scrollTop);
	await action("Expand notebook");
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]').dataset.expanded === "true");
	await action("Back to question");
	await page.waitForFunction(expected => Math.abs(document.querySelector('[data-testid="notebook-paper-scroll"]').scrollTop - expected) <= 1, {}, beforeExpand);
	assert.equal(await page.$eval(field, e => e.textContent), "My unsent explanation");
	await page.click('[aria-label="Close notebook"]');
	await page.click('[data-testid="open-notebook"]');
	assert.equal(await bitmap(), pendingInk);
	assert.equal(await page.$eval('[data-testid="notebook-split-divider"]', e => e.getAttribute("aria-valuenow")), dividerShare, "Closing/reopening retains the during-use split choice");
	const layout = await page.evaluate(() => {
		const card = document.querySelector('[data-testid="handwriting-notebook"]'), slot = document.querySelector('[data-testid="notebook-slot"]'), paper = document.querySelector('[data-testid="notebook-paper-scroll"]');
		const c = card.getBoundingClientRect(), s = slot.getBoundingClientRect(), p = paper.getBoundingClientRect();
		return { insets: [c.left - s.left, c.top - s.top, s.right - c.right, s.bottom - c.bottom], paperHeight: p.height, radius: getComputedStyle(card).borderRadius, bottom: c.bottom, viewport: innerHeight };
	});
	assert.deepEqual(layout.insets, [16, 16, 16, 16]); assert.ok(layout.paperHeight > 300 && layout.bottom <= layout.viewport - 16); assert.equal(layout.radius, "16px");
	await page.screenshot({ path: path.join(dir, "tablet.png") });
	await page.setViewport({ width: 1400, height: 900, isMobile: true, hasTouch: true });
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.hw-splitLayout')).flexDirection === "row");
	await page.screenshot({ path: path.join(dir, "wide.png") });
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	await page.waitForFunction(() => document.querySelector('[data-testid="open-notebook-chat"]').getBoundingClientRect().width > 0);
	await page.click('[data-testid="open-notebook-chat"]');
	assert.equal(await page.$eval(field, e => e.textContent), "My unsent explanation");
	await page.focus(field);
	await page.waitForFunction(() => document.body.style.position === "fixed");
	await page.click('[data-testid="open-notebook"]');
	await page.waitForFunction(() => document.body.style.position !== "fixed");
	assert.equal(await bitmap(), pendingInk);
	await page.screenshot({ path: path.join(dir, "phone.png") });
	console.log("PASS continuing page, accepted layout, expand/back, phone switching and draft retention");

	for (const id of ["handwriting_practice", "handwriting_drill"]) {
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		await page.click('[data-testid="open-notebook"]'); await ready();
		assert.equal(await bitmap(), cleared, "Another session starts independently");
		await draw(200, 450); const ownInk = await bitmap();
		await page.reload({ waitUntil: "networkidle2" }); await ready(); assert.equal(await bitmap(), ownInk);
	}
	await page.goto(`${origin}/chat/handwriting_teach`, { waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), pendingInk);
	await page.click('[aria-label="Notebook options"]'); await page.click('[data-testid="notebook-tools-toggle"]');
	await page.waitForSelector('#handwriting-tools');
	assert.ok(await page.$eval('#handwriting-tools', e => e.textContent.includes("explanation saved at Attach")));
	await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('#handwriting-tools button.underline')]); await ready();
	assert.equal(await bitmap(), pendingInk, "Tools → Reload preview exercises recovery");
	assert.ok(await page.$('[data-testid="notebook-attach"]'));
	assert.equal(await page.$('[data-testid="notebook-circuit-example"]'), null);
	// The real IndexedDB adapter, canvas encoder, multipart route and file store.
	await page.click('[data-testid="open-notebook-chat"]');
	await page.$eval(field, e => e.focus()); await page.keyboard.sendCharacter("Durable explanation at Attach");
	await page.click('[data-testid="open-notebook"]');
	const frozen = await page.evaluate(() => { const journal = JSON.parse(localStorage.getItem("lh:handwriting:pages:v1:handwriting_teach:page_initial")).journal; return { ...journal, backgrounds: {} }; });
	const attached = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.click('[data-testid="notebook-attach"]'); const receipt = await (await attached).json();
	await page.waitForFunction(() => document.querySelector('[data-testid="notebook-slot"]').hidden);
	assert.equal(await page.$eval(field, e => e.textContent), "Durable explanation at Attach");
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-file-path-input]')?.textContent === "Durable explanation at Attach");
	assert.deepEqual((await (await fetch(`${origin}/api/chats/handwriting_teach/writing/${receipt.writing.id}/source`)).json()).journal, frozen);
	const pngSize = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, `${origin}/api/chats/handwriting_teach/writing/${receipt.writing.id}`);
	assert.deepEqual(pngSize, [1400, 1800]);
	await page.click('[data-testid="open-notebook"]'); await ready();
	await draw(250, 550);
	const updated = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.click('[data-testid="notebook-attach"]'); const replacement = await (await updated).json();
	const pending = await (await fetch(`${origin}/api/chats/handwriting_teach/writing`)).json();
	assert.deepEqual(pending.pending.map(image => image.id), [replacement.writing.id]);
	assert.deepEqual((await (await fetch(`${origin}/api/chats/handwriting_teach/writing/${receipt.writing.id}/source`)).json()).journal, frozen);
	console.log("PASS real IndexedDB Attach explanation reload, exact full source and same-page supersession without tutor input");
	await page.setViewport({ width: 1400, height: 900, isMobile: true, hasTouch: true });
	await page.locator('[aria-label="Open sidebar"]').click();
	await page.locator('[data-testid="kind-filter-all"]').click();
	const kept = await page.evaluate(() => ({ ink: localStorage.getItem("lh:handwriting:pages:v1:handwriting_teach:page_initial"), visibility: localStorage.getItem("lh:handwriting:open:handwriting_teach") }));
	for (const id of ["handwriting_practice", "handwriting_drill"]) {
		await page.evaluate(id => { localStorage.setItem(`lh:handwriting:pages:recovery:v1:${id}:page_initial`, localStorage.getItem(`lh:handwriting:pages:v1:${id}:page_initial`)); }, id);
		await page.waitForFunction(id => [...document.querySelectorAll('[data-testid="session-row"]')].some(e => e.textContent.includes(id)), {}, id);
		const rows = await page.$$('[data-testid="session-row"]');
		let target;
		for (const row of rows) if (await row.evaluate((e, id) => e.textContent.includes(id), id)) target = row;
		assert.ok(target, "Previously visited session is in the sidebar");
		await target.scrollIntoView(); await target.click({ button: "right" });
		await page.click('[data-testid="ctx-delete"]');
		await page.waitForSelector('[data-testid="delete-session-dialog"]');
		if (id.endsWith("drill")) await page.click('[data-testid="delete-traces-checkbox"]');
		failDelete = true;
		await page.click('[data-testid="delete-confirm"]'); await page.waitForSelector('[data-testid="delete-failure"]');
		assert.ok(await page.evaluate(id => localStorage.getItem(`lh:handwriting:pages:v1:${id}:page_initial`) !== null, id), "Failed deletion keeps device recovery");
		failDelete = false;
		const deleted = page.waitForResponse(response => response.request().method() === "DELETE" && response.url().includes(id) && response.status() === 200);
		await page.click('[data-testid="delete-retry"]'); await deleted;
		await page.waitForSelector('[data-testid="delete-session-dialog"]', { hidden: true });
		assert.deepEqual(await page.evaluate(id => [localStorage.getItem(`lh:handwriting:pages:v1:${id}:page_initial`), localStorage.getItem(`lh:handwriting:open:${id}`), localStorage.getItem(`lh:handwriting:pages:recovery:v1:${id}:page_initial`)], id), [null, null, null], "Successful deletion cleans a previously visited session without a controller 404");
		assert.deepEqual(await page.evaluate(() => ({ ink: localStorage.getItem("lh:handwriting:pages:v1:handwriting_teach:page_initial"), visibility: localStorage.getItem("lh:handwriting:open:handwriting_teach") })), kept);
	}
	console.log("PASS real sidebar deletion/retry cleans only deleted-session device journals and visibility");
	const background = await page.evaluate(async () => {
		const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800;
		const context = canvas.getContext("2d"); context.fillStyle = "#ff0000"; context.fillRect(0, 0, 1400, 1800);
		const data = canvas.toDataURL("image/png").split(",")[1], bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
		const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
		const journal = { version: 2, pageId: "page_initial", head: "import", events: { import: { id: "import", parent: null, kind: "import-background", backgroundId: hash } }, backgrounds: { [hash]: { mediaType: "image/png", width: 1400, height: 1800, data } } };
		const response = await fetch("/api/chats/handwriting_background/handwriting", { method: "PUT", body: JSON.stringify(journal) });
		if (!response.ok) throw new Error(`Background fixture refused: ${response.status}`);
		return journal.backgrounds;
	});
	await page.goto(`${origin}/chat/handwriting_background`, { waitUntil: "networkidle2" });
	await page.click('[data-testid="open-notebook"]'); await ready();
	// Notebook readiness covers data/background decoding. Wait for stable
	// layout and an enabled tool before dispatching coordinate-based input.
	await page.locator('[data-testid="notebook-paper-scroll"]').hover();
	await draw(400, 450); await page.locator('[aria-label="Eraser"]').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="Eraser"]')?.getAttribute("aria-pressed") === "true");
	await draw(400, 450);
	const backgroundCapture = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.click('[data-testid="notebook-attach"]');
	const imageId = (await (await backgroundCapture).json()).writing.id;
	const pixels = await page.evaluate(async imageId => {
		const image = new Image(); image.src = `/api/chats/handwriting_background/writing/${imageId}`; await image.decode();
		const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800;
		const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
		return [[400, 450], [1300, 1700]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
	}, imageId);
	assert.deepEqual(pixels, [[255, 0, 0, 255], [255, 0, 0, 255]], "Eraser affects ink only; exported PNG contains the offscreen background");
	const editable = await (await fetch(`${origin}/api/chats/handwriting_background/writing/${imageId}/source`)).json();
	assert.deepEqual(Object.values(editable.journal.events).filter(event => event.kind === "stroke").map(event => event.stroke.tool).sort(), ["eraser", "pen"], "The export check exercised actual foreground drawing and erasing");
	assert.deepEqual(editable.journal.backgrounds, background);
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	console.log("PASS independent background decode/reopen, erasable foreground and full-page offscreen PNG export");
	await checkHandwritingPages({ page, origin, draw, ready, dir });
	}
	assert.deepEqual(turns, []); assert.deepEqual(errors, []);
	console.log("PASS teaching/practice/drill isolation, Tools reload, no tutor calls or submission actions");
} catch (error) {
	if (page) {
		await page.screenshot({ path: path.join(dir, "failure.png") });
		console.log(JSON.stringify(await page.evaluate(() => ({ url: location.href, width: innerWidth, viewport: document.querySelector('meta[name="viewport"]')?.content, notebook: [...document.querySelectorAll('.hw-splitLayout, .hw-notebookSlot, .hw-mobileSwitch, .hw-chat')].map(e => ({ cls: e.className, testid: e.getAttribute("data-testid"), hidden: e.hidden, rect: e.getBoundingClientRect().toJSON(), display: getComputedStyle(e).display })), text: document.body.innerText.slice(-1000) })), null, 2));
	}
	throw error;
} finally {
	await browser?.close();
	server.kill("SIGTERM");
}
