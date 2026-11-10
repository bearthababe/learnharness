import assert from "node:assert/strict";
import path from "node:path";
import { openNotebookMenu, useTutor } from "./smoke-notebook-mobile.mjs";

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
	// P5 (round 17): on a phone the notebook takes over the screen, like the
	// thinking pane — "‹ Lesson", then Peek, the big mic and the keyboard
	// button in a bar above the keyboard. No split, no divider, no grip.
	const pane = () => page.evaluate(() => {
		const rect = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
		return { slot: rect(".notebook-slot"), bar: rect('[data-testid="notebook-pane-bar"]'), controls: ['[data-testid="notebook-pane-back"]', '[data-testid="notebook-pane-peek"]', '[data-testid="notebook-pane-mic"]', '[data-testid="notebook-pane-keyboard"]'].map(rect), vw: innerWidth, vh: visualViewport?.height ?? innerHeight };
	});
	let p = await pane();
	assert.ok(Math.round(p.slot.x) === 0 && Math.round(p.slot.width) === p.vw && p.slot.y <= 1 && Math.abs(p.slot.bottom - p.vh) < 2, `notebook pane fills the phone: ${JSON.stringify(p.slot)}`);
	assert.equal(await page.$eval(".notebook-split-divider", e => e.getClientRects().length === 0), true, "no divider on phones");
	for (const control of p.controls) assert.ok(control && control.width >= 44 && control.height >= 44 && control.bottom <= p.vh && control.right <= p.vw, `pane control 44px and in view: ${JSON.stringify(control)}`);
	assert.equal(await page.$('.notebook-panel select'), null);
	assert.equal(await page.$('[data-testid="notebook-options"]'), null);
	assert.equal(await page.$eval('#notebook-instruction', e => getComputedStyle(e).fontSize), '16px', 'Instruction uses the shared readable input type rung');
	assert.ok(await page.$eval('[data-notebook-scroll]', e => e.clientHeight > e.closest('.notebook-frame').clientHeight * .5), "Working occupies most of the pane");
	assert.deepEqual(await page.$$eval('.notebook-frame-header button', buttons => buttons.map(e => e.getAttribute('aria-label'))), ['How the notebook works', 'Undo', 'Notebook options']);
	// The help is behind ⓘ (never over the working).
	assert.equal(await page.$('[data-testid="notebook-help-card"]'), null);
	await page.click('[data-testid="notebook-help"]');
	await page.waitForSelector('[data-testid="notebook-help-text"]', { visible: true });
	assert.match(await page.$eval('[data-testid="notebook-help-text"]', e => e.textContent), /Apply/);
	await page.click('[data-testid="notebook-help"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="notebook-help-card"]'));
	await page.screenshot({ path: path.join(artifacts, "notebook-phone-pane.png") });
	// Peek: the lesson, a quiet Return and a sheet of the working only — one
	// line at first, pulled up for more, remembered.
	await page.click('[data-testid="notebook-pane-peek"]');
	await page.waitForSelector('[data-testid="notebook-peek-sheet"]', { visible: true });
	assert.equal(await page.$eval('.notebook-slot', e => getComputedStyle(e).visibility), "hidden", "the pane steps aside while peeking");
	const sheet = () => page.$eval('[data-testid="notebook-peek-sheet"]', e => { const r = e.getBoundingClientRect(); return { top: r.top, height: r.height }; });
	const first = await sheet();
	assert.ok(first.height <= 110, `one line at first: ${JSON.stringify(first)}`);
	assert.equal(await page.$('[data-testid="notebook-peek-sheet"] .notebook-frame-header'), null, "the sheet has no notebook header");
	const handle = await page.$eval('[data-testid="notebook-peek-handle"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height }; });
	assert.ok(handle.height >= 44, "the sheet's handle is a 44px target");
	await page.mouse.move(handle.x, handle.y); await page.mouse.down(); await page.mouse.move(handle.x, handle.y - 160, { steps: 6 }); await page.mouse.up();
	const pulled = await sheet();
	assert.ok(pulled.height > first.height + 120, `pulled up: ${JSON.stringify(pulled)}`);
	await page.screenshot({ path: path.join(artifacts, "notebook-phone-peek.png") });
	await page.click('[data-testid="notebook-pane-return"]');
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.notebook-slot')).visibility === "visible" && !document.querySelector('[data-testid="notebook-peek-sheet"]'));
	await page.click('[data-testid="notebook-pane-peek"]');
	await page.waitForSelector('[data-testid="notebook-peek-sheet"]', { visible: true });
	assert.ok(Math.abs((await sheet()).height - pulled.height) < 2, "the sheet's size is remembered");
	await page.click('[data-testid="notebook-pane-return"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="notebook-peek-sheet"]'));
	// The lesson's chat box is the tutor's again: back to the lesson, write there.
	const tutor = '[data-testid="composer"] [data-file-path-input]';
	await page.evaluate(() => { window.layoutTutor = document.querySelector('[data-testid="composer"] [data-file-path-input]'); window.layoutNotebook = document.querySelector('#notebook-instruction'); });
	await page.$eval('[data-notebook-scroll]', e => { e.scrollTop = 300; });
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 300);
	await useTutor(page);
	assert.equal(await page.$eval(tutor, e => e.checkVisibility()), true, "the chat box is there after the notebook");
	await page.type(tutor, "My independent Tutor draft.");
	await page.waitForFunction(() => !document.querySelector(".session-workspace").inert);
	await page.locator('button[data-input-owner="notebook"][aria-expanded]').click();
	await page.waitForFunction(() => !document.querySelector('.notebook-slot').hidden && !document.querySelector('.session-workspace').inert);
	assert.equal(await page.$eval('[data-notebook-scroll]', e => e.scrollTop), 300, "Close/reopen restores the last visible Notebook reading position");
	assert.ok(await page.evaluate(() => layoutTutor === document.querySelector('[data-testid="composer"] [data-file-path-input]') && layoutNotebook === document.querySelector('#notebook-instruction')), "View switches keep both editors mounted");
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), "Keep this equation instruction.");
	assert.equal(await page.$('[data-snapshot-id]'), null, "Snapshots are absent from the inline input");
	// Round 14 (T1/P1): the one Notebook button sits in the page bar on every device.
	assert.equal(await page.$eval('button[data-input-owner="notebook"][aria-expanded]', e => !!e.closest('.lh-topbar')), true, "Notebook button: in the page bar on every device");
	await openNotebookMenu(page, "Review attached working");
	// P5 (round 17): leaving the phone's notebook pane is itself the handoff that
	// files the working, so prose typed in the lesson afterwards is the draft's
	// continuation ("Current explanation"); with no new working it stays there
	// through the reopen. Either way it survives and is editable in review.
	const reviewed = await page.$$eval('[aria-label="Earlier explanation"], [aria-label="Current explanation"]', els => els.map(e => [e.getAttribute("aria-label"), e.value]));
	assert.ok(reviewed.some(([, value]) => value.includes("My independent Tutor draft.")), `Tutor prose survives the handoffs and is available in review: ${JSON.stringify(reviewed)}`);
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
	// The keyboard: the pane fits the visible area, its bar right above the keyboard.
	await page.focus('#notebook-instruction');
	await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 500 }); visualViewport.dispatchEvent(new Event("resize")); });
	await page.waitForFunction(() => document.querySelector('.session-workspace').dataset.keyboardOpen === "true");
	await page.waitForFunction(() => Math.abs(document.querySelector('.notebook-slot').getBoundingClientRect().bottom - 500) < 2);
	p = await pane();
	assert.ok(p.bar.bottom <= 501 && p.bar.y >= 0, `the pane's bar sits above the keyboard: ${JSON.stringify(p.bar)}`);
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
	let r = await rects(); assert.equal(r.direction, "column"); frame(r);
	await page.$eval('#notebook-instruction', e => e.blur());
	await page.waitForFunction(() => !document.documentElement.hasAttribute('data-session-input-locked'));
	await page.screenshot({ path: path.join(artifacts, "notebook-tablet-split.png") });
	// Wider screens keep the split with Expand (and "Lesson" back), each view
	// keeping its own reading position.
	assert.deepEqual(await page.$$eval('.notebook-frame-header button', buttons => buttons.map(e => e.getAttribute('aria-label'))), ['How the notebook works', 'Undo', 'Expand notebook', 'Notebook options', 'Hide notebook']);
	await page.click('[aria-label="Expand notebook"]');
	await page.waitForFunction(() => document.querySelector('.session-panes').dataset.notebookExpanded === "true");
	r = await rects(); frame(r);
	assert.ok(Math.abs(r.slot.height - r.workspace.height) < 2);
	assert.equal(await page.$eval('.session-tutor', e => e.inert && getComputedStyle(e).visibility === "hidden"), true);
	await page.$eval('[data-notebook-scroll]', e => { e.scrollTop = 150; });
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 150);
	await page.click('[aria-label="Back to the lesson"]');
	await page.waitForFunction(() => document.querySelector('.session-panes').dataset.notebookExpanded === "false");
	await page.$eval('[data-notebook-scroll]', e => { e.scrollTop = 300; });
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 300);
	await page.click('[aria-label="Expand notebook"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 150);
	await page.click('[aria-label="Back to the lesson"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-scroll]').scrollTop === 300);
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
	console.log("PASS: phone notebook pane (44px bar, help behind ⓘ, Peek with a remembered working sheet, the tutor's own chat box), tablet split with Expand and per-view scroll, wide split, mounted identity and scroll retention, keyboard fit/gestures, tablet lock and durable reload.");
	await page.close();
}
