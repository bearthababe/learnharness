import assert from "node:assert/strict";
import path from "node:path";
import { openNotebookMenu } from "./smoke-notebook-mobile.mjs";

/** Real presentation controls and persisted drafts; no external generation. */
export async function verifyNotebookLayout(browser, origin, artifacts) {
	const page = await browser.newPage();
	const errors = [], sends = [];
	page.on("pageerror", error => errors.push(error.message));
	page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") sends.push(request.postData()); });
	await page.evaluateOnNewDocument(origin => {
		if (window === window.top && location.origin === origin) { localStorage.setItem("lh:sidebar-open", "0"); localStorage.setItem("lh:device-tool:writing", "on"); localStorage.setItem("lh:device-tool:notebook", "on"); /* both working tools, whatever the emulated device */ }
		// Round 12 (O3): start from a first use — no saved size, hint not yet seen (once per tab).
		if (window === window.top && location.origin === origin && !sessionStorage.getItem("lh:layout-first-use")) { sessionStorage.setItem("lh:layout-first-use", "1"); localStorage.removeItem("lh:notebook-split"); localStorage.removeItem("lh:notebook-split-hint-seen"); }
	}, origin);
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/mobile_layout`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector("#notebook-instruction", { visible: true });
	const rects = () => page.evaluate(() => {
		const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
		return { workspace: rect(".session-workspace"), tutor: rect(".session-tutor"), slot: rect(".notebook-slot"), card: rect(".notebook-frame"), divider: rect(".notebook-split-divider"), direction: getComputedStyle(document.querySelector(".session-panes")).flexDirection };
	});
	const frame = r => {
		// Phones: an edge-to-edge bottom sheet; wider: a card inset 16px.
		const inset = r.workspace.width < 768 ? 0 : 16;
		assert.equal(Math.round(r.card.x - r.slot.x), inset);
		assert.equal(Math.round(r.card.y - r.slot.y), inset);
		assert.equal(Math.round(r.slot.right - r.card.right), inset);
		assert.equal(Math.round(r.slot.bottom - r.card.bottom), inset);
		assert.ok(r.card.height > 44 && r.card.bottom <= r.workspace.bottom, JSON.stringify(r));
	};
	let r = await rects();
	assert.equal(r.direction, "column"); frame(r);
	assert.ok(r.slot.y >= r.tutor.bottom);
	// Round 12 (owner O3): with no saved size the stacked notebook opens
	// about two lines of working tall (header, two lines, instruction).
	assert.ok(r.slot.height > 200 && r.slot.height < 290, `two-line notebook: ${JSON.stringify(r.slot)}`);
	const twoLines = await page.$eval('[role="separator"]', e => e.getAttribute("aria-valuenow"));
	assert.ok(await page.$('[data-testid="notebook-grip-hint"]'), "the grip explains itself on first use");
	assert.equal(await page.$('.notebook-panel select'), null);
	assert.equal(await page.$('[data-testid="notebook-options"]'), null);
	assert.equal(await page.$eval('#notebook-instruction', e => getComputedStyle(e).fontSize), '16px', 'Instruction uses the shared readable input type rung');
	// At the two-line opening size (O3) the header and instruction take a
	// fixed slice; the working is still the larger part of the card.
	assert.ok(await page.$eval('[data-notebook-scroll]', e => e.clientHeight > e.closest('.notebook-frame').clientHeight * .5), "Working occupies most of the phone card");
	assert.deepEqual(await page.$$eval('.notebook-frame-header button', buttons => buttons.map(e => e.getAttribute('aria-label'))), ['Undo', 'Expand notebook', 'Notebook options', 'Hide notebook']);
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
	assert.equal(await page.$eval('[role="separator"]', e => e.getAttribute("aria-valuenow")), twoLines, "Home returns to the two-line size");
	// A tap on the grip swaps the focus: working, then lesson, then working.
	const grip = (await rects()).divider;
	for (const share of ["40", "72", "40"]) {
		await page.mouse.click(grip.x + grip.width / 2, (await rects()).divider.y + 10);
		await page.waitForFunction(value => document.querySelector('[role="separator"]').getAttribute("aria-valuenow") === value, {}, share);
	}
	await page.focus('[aria-label="Resize Tutor and Notebook"]');
	await page.keyboard.press("Home");
	const tutor = '[data-testid="composer"] [data-file-path-input]';
	await page.type(tutor, "My independent Tutor draft.");
	await page.waitForFunction(() => !document.querySelector(".session-workspace").inert);
	await page.evaluate(() => { window.layoutTutor = document.querySelector('[data-testid="composer"] [data-file-path-input]'); window.layoutNotebook = document.querySelector('#notebook-instruction'); });
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
	await openNotebookMenu(page, "Close notebook");
	await page.waitForFunction(() => document.querySelector('.notebook-slot').hidden);
	await page.locator('button[data-input-owner="notebook"][aria-expanded]').click();
	await page.waitForFunction(() => !document.querySelector('.notebook-slot').hidden && !document.querySelector('.session-workspace').inert);
	assert.equal(await page.$eval('[data-notebook-scroll]', e => e.scrollTop), 300, "Close/reopen restores the last visible Notebook reading position");
	assert.ok(await page.evaluate(() => layoutTutor === document.querySelector('[data-testid="composer"] [data-file-path-input]') && layoutNotebook === document.querySelector('#notebook-instruction')), "View switches keep both editors mounted");
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), "Keep this equation instruction.");
	assert.equal(await page.$('[data-snapshot-id]'), null, "Snapshots are absent from the inline input");
	// Round 13 (owner P2): on phones the Notebook toggle is in the page bar's
	// toolbar (Sessions, Home, Notebook, Plan, More); wider screens keep it in
	// the row below the active input.
	assert.equal(await page.$eval('button[data-input-owner="notebook"][aria-expanded]', e => innerWidth < 768 ? !!e.closest('.lh-topbar') : !!e.closest('[data-testid="stats-bar"]')), true, "Notebook toggle: page bar on phones, below the active input otherwise");
	await openNotebookMenu(page, "Review attached working");
	assert.ok(await page.$eval('[aria-label="Earlier explanation"]', e => e.value.includes("My independent Tutor draft.")), "Tutor prose survives snapshot handoff and is available in review");
	await page.click('[aria-label="Earlier explanation"]');
	await page.waitForFunction(() => !document.querySelector('.session-workspace').inert);
	await page.focus('[aria-label="Earlier explanation"]');
	await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 500 }); visualViewport.dispatchEvent(new Event("resize")); });
	await page.waitForFunction(() => document.documentElement.hasAttribute('data-session-input-locked'));
	await page.waitForFunction(() => document.querySelector('[data-testid="notebook-options"]').getBoundingClientRect().bottom <= 500);
	const reviewPosition = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
	const reviewClient = await page.createCDPSession();
	for (const selector of ['[data-testid="notebook-options"]', '[aria-label="Earlier explanation"]', '.notebook-options-heading']) {
		const point = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(Math.max(10, Math.min(480, r.y + r.height / 2))) }; });
		for (const distance of [-120, 120]) await reviewClient.send('Input.synthesizeScrollGesture', { ...point, yDistance: distance, gestureSourceType: 'touch' });
	}
	assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), reviewPosition);
	await page.screenshot({ path: path.join(artifacts, 'notebook-phone-attachment-review.png') });
	await page.keyboard.press('Escape');
	await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
	await page.waitForFunction(() => !document.documentElement.hasAttribute('data-session-input-locked'));
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
	await page.click('[data-testid="open-sidebar"]');
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-panes')).flexDirection === "column");
	assert.ok((await rects()).workspace.width < 980, "Available space, including sidebar, controls the wide breakpoint");
	await page.click('[aria-label="Close sidebar"]');
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForSelector('#notebook-instruction', { visible: true });
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), "Keep this equation instruction.");
	// Clarification detail is deliberately collapsed. Native summary Enter must
	// expand it rather than triggering the page-wide Notebook Apply shortcut.
	const fixture = await (await fetch(`${origin}/api/chats/mobile_layout/notebook`)).json();
	const message = "Which pressure equation should change? Keep the unfinished working until you identify the line.";
	const commands = [];
	await page.setRequestInterception(true);
	page.on('request', request => {
		if (request.method() !== 'GET') { if (request.method() === 'POST') commands.push(request.url()); void request.abort(); return; }
		if (new URL(request.url()).pathname === '/api/chats/mobile_layout/notebook') {
			void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...fixture, problem: { operationId: 'notice-fixture', status: 'clarification', message } }) });
		} else void request.continue();
	});
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	await page.reload({ waitUntil: 'networkidle2' });
	await page.waitForSelector('.notebook-notice summary', { visible: true });
	assert.equal(await page.$eval('.notebook-notice', e => e.open), false);
	await page.focus('#notebook-instruction');
	await page.waitForFunction(() => document.querySelector('.session-workspace').dataset.sessionDestination === 'notebook');
	await page.focus('.notebook-notice summary');
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => document.querySelector('.notebook-notice').open);
	assert.equal(await page.$eval('.notebook-notice p', e => e.textContent), message);
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => !document.querySelector('.notebook-notice').open);
	await page.screenshot({ path: path.join(artifacts, 'notebook-phone-notice.png') });
	await openNotebookMenu(page);
	await page.screenshot({ path: path.join(artifacts, 'notebook-phone-options.png') });
	const menuRect = await page.$eval('[data-testid="notebook-options"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
	assert.ok(menuRect.left >= 0 && menuRect.right <= 390 && menuRect.top >= 0 && menuRect.bottom <= 844, JSON.stringify(menuRect));
	await page.keyboard.press('Escape');
	assert.deepEqual(commands, [], 'Notice/menu keyboard interaction never submits');
	assert.deepEqual(sends, []); assert.deepEqual(errors, []);
	console.log("PASS: iPad-style equation frame, phone/tablet below Tutor, available-width wide split, divider pointer/keys, full/split/close mounted identity and scroll retention, keyboard allocation/gestures, tablet lock and durable reload.");
	await page.close();
}
