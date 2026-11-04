import assert from "node:assert/strict";
import path from "node:path";

/** Real presentation controls and persisted drafts; no external generation. */
export async function verifyNotebookLayout(browser, origin, artifacts) {
	const page = await browser.newPage();
	const errors = [], sends = [];
	page.on("pageerror", error => errors.push(error.message));
	page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") sends.push(request.postData()); });
	await page.evaluateOnNewDocument(origin => {
		if (window === window.top && location.origin === origin) localStorage.setItem("lh:sidebar-open", "0");
	}, origin);
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/mobile_layout`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector("#notebook-instruction", { visible: true });
	const rects = () => page.evaluate(() => {
		const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
		return { workspace: rect(".session-workspace"), tutor: rect(".session-tutor"), slot: rect(".notebook-slot"), card: rect(".notebook-frame"), divider: rect(".notebook-split-divider"), direction: getComputedStyle(document.querySelector(".session-panes")).flexDirection };
	});
	const frame = r => {
		assert.equal(Math.round(r.card.x - r.slot.x), 16);
		assert.equal(Math.round(r.card.y - r.slot.y), 16);
		assert.equal(Math.round(r.slot.right - r.card.right), 16);
		assert.equal(Math.round(r.slot.bottom - r.card.bottom), 16);
		assert.ok(r.card.height > 52 && r.card.bottom <= r.workspace.bottom, JSON.stringify(r));
	};
	let r = await rects();
	assert.equal(r.direction, "column"); frame(r);
	assert.ok(r.slot.y >= r.tutor.bottom);
	assert.ok(Math.abs(r.tutor.height - (r.workspace.height / 2 - 14)) < 2);
	await page.screenshot({ path: path.join(artifacts, "notebook-phone-split.png") });
	// Drive the same divider by pointer and keyboard, retaining the chosen share.
	await page.mouse.move(r.divider.x + r.divider.width / 2, r.divider.y + r.divider.height / 2);
	await page.mouse.down();
	await page.mouse.move(195, r.workspace.y + r.workspace.height * .6, { steps: 5 });
	await page.mouse.up();
	await page.waitForFunction(() => document.querySelector('[role="separator"]').getAttribute("aria-valuenow") === "60");
	await page.focus('[aria-label="Resize Tutor and Notebook"]');
	await page.keyboard.press("ArrowUp");
	assert.equal(await page.$eval('[role="separator"]', e => e.getAttribute("aria-valuenow")), "55");
	await page.keyboard.press("Home");
	const tutor = '[data-testid="composer"] textarea';
	await page.type(tutor, "My independent Tutor draft.");
	await page.waitForFunction(() => !document.querySelector(".session-workspace").inert);
	await page.evaluate(() => { window.layoutTutor = document.querySelector('[data-testid="composer"] textarea'); window.layoutNotebook = document.querySelector('#notebook-instruction'); });
	await page.click('[aria-label="Expand notebook"]');
	await page.waitForFunction(() => document.querySelector('.session-panes').dataset.notebookExpanded === "true");
	r = await rects(); frame(r);
	assert.ok(Math.abs(r.slot.height - r.workspace.height) < 2);
	assert.equal(await page.$eval('.session-tutor', e => e.inert && getComputedStyle(e).visibility === "hidden"), true);
	await page.screenshot({ path: path.join(artifacts, "notebook-phone-full.png") });
	await page.$eval('[data-notebook-scroll]', e => { e.scrollTop = 150; });
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 150);
	await page.click('[aria-label="Back to split"]');
	await page.waitForFunction(() => document.querySelector('.session-panes').dataset.notebookExpanded === "false");
	await page.$eval('[data-notebook-scroll]', e => { e.scrollTop = 300; });
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 300);
	await page.click('[aria-label="Expand notebook"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 150);
	await page.click('[aria-label="Back to split"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 300);
	await page.locator('.notebook-frame-header button:last-of-type').click();
	await page.waitForFunction(() => document.querySelector('.notebook-slot').hidden);
	await page.locator('button[data-input-owner="notebook"][aria-expanded]').click();
	await page.waitForFunction(() => !document.querySelector('.notebook-slot').hidden && !document.querySelector('.session-workspace').inert);
	assert.equal(await page.$eval('[data-notebook-scroll]', e => e.scrollTop), 300, "Close/reopen restores the last visible Notebook reading position");
	assert.ok(await page.evaluate(() => layoutTutor === document.querySelector('[data-testid="composer"] textarea') && layoutNotebook === document.querySelector('#notebook-instruction')), "View switches keep both editors mounted");
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), "Keep this equation instruction.");
	assert.ok(await page.evaluate(() => document.body.textContent.includes("My independent Tutor draft.")), "Tutor prose survives snapshot handoff");
	// Phone keyboard allocation and gesture containment use real layout, emulated viewport.
	await page.focus('#notebook-instruction');
	await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 500 }); visualViewport.dispatchEvent(new Event("resize")); });
	await page.waitForFunction(() => document.querySelector('.session-workspace').dataset.keyboardOpen === "true");
	r = await rects(); frame(r);
	assert.ok(Math.abs(r.tutor.height - (r.workspace.height / 3 - 14)) < 2, JSON.stringify(r));
	const instruction = await page.$eval('#notebook-instruction', e => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom }));
	assert.ok(instruction.top >= 0 && instruction.bottom <= 500, JSON.stringify(instruction));
	const before = await page.evaluate(() => ({ y: scrollY, x: scrollX, top: document.querySelector('.notebook-frame-header').getBoundingClientRect().top }));
	const client = await page.createCDPSession();
	for (const selector of ['[data-notebook-scroll]', '#notebook-instruction', '.notebook-frame-header']) {
		const point = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
		for (const distance of [-150, 150]) await client.send('Input.synthesizeScrollGesture', { ...point, yDistance: distance, gestureSourceType: 'touch' });
	}
	assert.deepEqual(await page.evaluate(() => ({ y: scrollY, x: scrollX, top: document.querySelector('.notebook-frame-header').getBoundingClientRect().top })), before);
	await page.$eval('#notebook-instruction', e => e.blur());
	await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
	await page.waitForFunction(() => !document.documentElement.hasAttribute('data-session-input-locked'));
	// Tablet stays stacked; coarse touch focus remains protected above 768px.
	await page.setViewport({ width: 834, height: 1194, isMobile: true, hasTouch: true });
	await page.focus('#notebook-instruction');
	await page.waitForFunction(() => document.documentElement.hasAttribute('data-session-input-locked'));
	r = await rects(); assert.equal(r.direction, "column"); frame(r);
	await page.$eval('#notebook-instruction', e => e.blur());
	await page.screenshot({ path: path.join(artifacts, "notebook-tablet-split.png") });
	// Keep emulation flags stable: changing isMobile reloads Chromium's page.
	await page.setViewport({ width: 1100, height: 1000, isMobile: true, hasTouch: true });
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-panes')).flexDirection === "row");
	r = await rects(); frame(r);
	assert.ok(Math.abs(r.tutor.width - (r.workspace.width * .6 - 14)) < 2);
	await page.screenshot({ path: path.join(artifacts, "notebook-wide-split.png") });
	await page.click('[aria-label="Open sidebar"]');
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-panes')).flexDirection === "column");
	assert.ok((await rects()).workspace.width < 980, "Available space, including sidebar, controls the wide breakpoint");
	await page.click('[aria-label="Close sidebar"]');
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForSelector('#notebook-instruction', { visible: true });
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), "Keep this equation instruction.");
	assert.deepEqual(sends, []); assert.deepEqual(errors, []);
	console.log("PASS: iPad-style equation frame, phone/tablet below Tutor, available-width wide split, divider pointer/keys, full/split/close mounted identity and scroll retention, keyboard allocation/gestures, tablet lock and durable reload.");
	await page.close();
}
