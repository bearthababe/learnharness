/** Real drawing controls and request/reopen boundaries; disposable data only.
 * Chromium pen/touch emulation is not physical iPad acceptance. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile, appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd(), dir = await mkdtemp(path.join(process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode", "handwriting-browser-"));
for (const name of ["app", "components", "src", "lib", "public", "electron", "config.ts", "package.json", "tsconfig.json", "postcss.config.mjs", "next.config.ts"]) await cp(path.join(root, name), path.join(dir, name), { recursive: true });
await symlink(path.join(root, "node_modules"), path.join(dir, "node_modules"));
const config = path.join(dir, "next.config.ts");
await writeFile(config, (await readFile(config, "utf8")).replace("const nextConfig: NextConfig = {", 'const nextConfig: NextConfig = { turbopack: { root: "/" },'));
await mkdir(path.join(dir, "data/chats"), { recursive: true });
const now = new Date().toISOString();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = content => ({ role: "assistant", content, id: "question", api: "openai-completions", provider: "openrouter", model: "test", usage, stopReason: "stop", timestamp: Date.now() });
for (const id of ["handwriting_teach", "handwriting_practice", "handwriting_drill"]) {
	const practice = id !== "handwriting_teach";
	const messages = [assistant([{ type: "text", text: "Work out pressure = force / area.\n\n".repeat(35) }, { type: "toolCall", name: practice ? "problem" : "ask_user_question", id: "problem-one", arguments: practice ? { statement: "Find the pressure for 100 N on 2 m².", mode: "apply", target: ["pressure"], modelSolution: "50 Pa" } : { question: "Explain how force and area affect pressure.", mode: "text" } }])];
	if (practice) messages.push({ role: "toolResult", id: "result", toolName: "problem", toolCallId: "problem-one", content: [{ type: "text", text: "Ready" }], details: null, isError: false, timestamp: Date.now() });
	await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ id, title: id, createdAt: now, updatedAt: now, messages, ...(practice ? { kind: "practice" } : {}), ...(id.endsWith("drill") ? { practiceMode: "drill" } : {}) }));
}
// No test can accidentally start a live tutor or mint speech credentials.
await writeFile(path.join(dir, "app/api/chat/route.ts"), 'export async function POST() { return new Response("No model calls in handwriting checks", { status: 503 }); }');
await writeFile(path.join(dir, "app/api/stt/token/route.ts"), 'export async function GET() { return new Response(null, { status: 503 }); }');
const port = Number(process.env.LH_HANDWRITING_TEST_PORT ?? 3115);
assert.ok(port !== 3000 && port !== 3001);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: dir, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, LH_DATA_DIR: path.join(dir, "data"), LH_AUTH_FILE: path.join(dir, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "", browser, page;
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { log += data; void appendFile(path.join(dir, "server.log"), data); });
console.log(`Disposable handwriting app: ${dir}`);
try {
	for (let i = 0; !log.includes("Ready in"); i++) { if (server.exitCode !== null || i > 120) throw new Error(log); await new Promise(resolve => setTimeout(resolve, 500)); }
	browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-features=BackForwardCache"] });
	page = await browser.newPage();
	const errors = [], turns = [];
	page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
	page.on("request", request => { if (new URL(request.url()).pathname === "/api/chat" && request.method() === "POST") turns.push(request.url()); });
	await page.evaluateOnNewDocument(() => { try { localStorage.setItem("lh:sidebar-open", "0"); } catch { /* sandboxed generated-artifact frames have no storage */ } });
	let failWrites = false, failReads = false, holdNextWrite = false, heldWrite;
	await page.setRequestInterception(true);
	page.on("request", request => {
		if (holdNextWrite && request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/handwriting")) { holdNextWrite = false; heldWrite = request; return; }
		if (new URL(request.url()).pathname.endsWith("/handwriting") && ((failWrites && request.method() === "PUT") || (failReads && request.method() === "GET"))) void request.respond({ status: 503, contentType: "application/json", body: '{"error":"Injected storage outage"}' });
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
	console.log("PASS real drawing + reload + persistent Clear/Undo");

	// All tool activations go through actual pointer/click controls. A Pencil
	// release plus its compatibility click must undo exactly one action.
	await pencilTap("Eraser", true);
	assert.equal(await page.$eval('[aria-label="Pen"]', e => e.getAttribute("aria-pressed")), "true", "Dragging away cancels Pencil tool activation");
	for (const colour of ["Blue", "Red", "Green", "Black"]) {
		await pencilTap("Pen"); await pencilTap(`${colour} pen`);
		await draw(210, 460);
		const working = await page.evaluate(() => JSON.parse(localStorage.getItem("lh:handwriting:v1:handwriting_teach")));
		assert.equal(working.operations.at(-1).stroke.colour, { Blue: "#2563eb", Red: "#dc2626", Green: "#15803d", Black: "#171717" }[colour]);
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
	const nextSave = page.waitForRequest(request => request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/handwriting"));
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

	// Successful server state is enough to reopen without a device copy. A read
	// outage instead retains the local ink and blocks new blank/stale writes.
	failReads = true;
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.body.textContent.includes("Retry before editing"));
	assert.equal(await bitmap(), pendingInk);
	await draw(200, 450); assert.equal(await bitmap(), pendingInk);
	failReads = false;
	await page.click('.hw-notice button'); await ready();
	await page.evaluate(() => localStorage.removeItem("lh:handwriting:v1:handwriting_teach"));
	await page.reload({ waitUntil: "networkidle2" }); await ready();
	assert.equal(await bitmap(), pendingInk, "Server truth reopens editable working without the browser copy");
	failWrites = true;
	await page.evaluate(() => {
		window.restoreDeviceWrites = Storage.prototype.setItem;
		Storage.prototype.setItem = function(key, value) { if (key.startsWith("lh:handwriting:v1:")) throw new DOMException("Injected full storage", "QuotaExceededError"); return window.restoreDeviceWrites.call(this, key, value); };
	});
	await draw(230, 480);
	await page.waitForFunction(() => document.body.textContent.includes("this device or to LearnHarness"));
	failWrites = false; await page.click('.hw-notice button');
	await page.waitForFunction(() => document.body.textContent.includes("Saved to LearnHarness; device recovery is unavailable"));
	await page.evaluate(() => { Storage.prototype.setItem = window.restoreDeviceWrites; });
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
	const field = 'textarea';
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
	assert.equal(await page.$eval(field, e => e.value), "My unsent explanation");
	await page.click('.hw-tabletControl:nth-of-type(2)');
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
	assert.equal(await page.$eval(field, e => e.value), "My unsent explanation");
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
	await page.click('[data-testid="notebook-tools-toggle"]');
	await page.waitForSelector('#handwriting-tools');
	assert.ok(await page.$eval('#handwriting-tools', e => e.textContent.includes("Unsent typed text resets")));
	await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('#handwriting-tools button.underline')]); await ready();
	assert.equal(await bitmap(), pendingInk, "Tools → Reload preview exercises recovery");
	assert.equal(await page.$('[data-testid="notebook-attach"]'), null);
	assert.equal(await page.$('[data-testid="notebook-circuit-example"]'), null);
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
