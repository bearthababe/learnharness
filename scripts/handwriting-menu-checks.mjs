import assert from "node:assert/strict";

/** Actual focused-chat + Pencil menu + keyboard dispatcher, scripted speech. */
export async function checkHandwritingMenus({ page, origin }) {
	await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/mobile_notebook_menus`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.click('[data-testid="open-notebook"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.dataset.ready === "true");
	const field = '[data-testid="composer"] [data-file-path-input]', cdp = await page.createCDPSession();
	await page.focus(field); await page.keyboard.sendCharacter("Keep my typed explanation.");
	await page.evaluate(() => { window.menuCancellation = { speech: 0, turn: 0 }; window.addEventListener("lh:kbd-cancel-dictation", () => window.menuCancellation.speech++); window.addEventListener("lh:kbd-abort-turn", () => window.menuCancellation.turn++); });
	for (const [label, selector] of [["Pages", '[data-testid="notebook-pages"]'], ["Notebook options", '[data-testid="notebook-options"]']]) {
		await page.focus(field); await page.evaluate(() => window.dispatchEvent(new CustomEvent("lh:kbd-toggle-dictation")));
		await page.waitForFunction(() => window.speech?.readyState === 1);
		const before = await page.evaluate(() => ({ ...window.menuCancellation }));
		const point = await page.$eval(`[aria-label="${label}"]`, element => { const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, pointerType: "pen", force: .5 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", pointerType: "pen" });
		await page.waitForSelector(selector);
		assert.equal(await page.$eval(field, element => element === document.activeElement), true, "Pencil opening preserves typing focus");
		await page.keyboard.press("Escape");
		assert.equal(await page.$(selector), null, "One Escape dismisses the open notebook surface even with focus in chat");
		assert.equal(await page.$eval(`[aria-label="${label}"]`, element => element === document.activeElement), true, "Dismissal restores trigger focus");
		assert.equal(await page.evaluate(() => window.speech.readyState), 1, "Menu Escape must not cancel underlying dictation");
		assert.deepEqual(await page.evaluate(() => window.menuCancellation), before);
		assert.equal(await page.$eval(field, element => element.textContent), "Keep my typed explanation.");
		await page.keyboard.press("Escape"); await page.waitForFunction(() => window.speech.readyState === 3);
		assert.deepEqual(await page.evaluate(() => window.menuCancellation), { speech: before.speech + 1, turn: before.turn }, "After dismissal the existing Escape chain resumes");
	}
	console.log("PASS S2 focused chat + Pencil Pages/options Escape owns one dismissal, preserves speech/typing and restores trigger focus");
	// Produce a real attached snapshot; all subsequent menu operations use the
	// actual adjacent chat/notebook surfaces and the app's keyboard dispatcher.
	const draw = async () => {
		const point = await page.$eval('[data-testid="notebook-canvas"]', canvas => { const r = canvas.getBoundingClientRect(); return { x: r.x + r.width * .3, y: r.y + 80 }; });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, pointerType: "pen", force: .5 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 30, y: point.y + 20, buttons: 1, pointerType: "pen", force: .5 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + 30, y: point.y + 20, button: "left", pointerType: "pen" });
	};
	await draw();
	const attached = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.click('[data-testid="notebook-attach"]'); await attached;
	const snapshotTrigger = '[data-writing-id] [aria-label="Snapshot actions"]', snapshotMenu = '[data-testid="snapshot-menu"]';
	await page.waitForSelector(snapshotTrigger);
	const working = () => page.evaluate(() => localStorage.getItem("lh:handwriting:pages:v1:mobile_notebook_menus:page_initial"));
	const beforeWorking = await working(); let actionRequests = 0;
	const countAction = request => { if (request.url().endsWith("/source") || (request.method() === "POST" && request.url().endsWith("/handwriting/pages"))) actionRequests++; };
	page.on("request", countAction);
	for (const label of ["Pages", "Notebook options"]) for (const newest of ["snapshot", "notebook"]) for (const focus of ["menu", "chat"]) {
		const notebookTrigger = `[aria-label="${label}"]`, notebookMenu = label === "Pages" ? '[data-testid="notebook-pages"]' : '[data-testid="notebook-options"]';
		await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Start dictation"]')].some(button => button.checkVisibility()));
		await page.focus(field); await page.evaluate(() => window.dispatchEvent(new CustomEvent("lh:kbd-toggle-dictation")));
		await page.waitForFunction(() => window.speech?.readyState === 1);
		const before = await page.evaluate(() => ({ ...window.menuCancellation }));
		const order = newest === "snapshot" ? [notebookTrigger, snapshotTrigger] : [snapshotTrigger, notebookTrigger];
		for (const trigger of order) await page.locator(trigger).click();
		await page.waitForSelector(notebookMenu); await page.waitForSelector(snapshotMenu);
		if (focus === "chat") await page.focus(field);
		await page.keyboard.press("Escape");
		assert.equal(await page.$(newest === "snapshot" ? snapshotMenu : notebookMenu), null, `${label}/${newest}/${focus}: newest menu closes first`);
		assert.ok(await page.$(newest === "snapshot" ? notebookMenu : snapshotMenu), "Underlying menu stays open");
		assert.equal(await page.$eval(order[1], element => element === document.activeElement), true, "Top dismissal restores its trigger");
		assert.deepEqual(await page.evaluate(() => window.menuCancellation), before);
		await page.keyboard.press("Escape");
		assert.equal(await page.$(notebookMenu), null); assert.equal(await page.$(snapshotMenu), null);
		assert.equal(await page.$eval(order[0], element => element === document.activeElement), true, "Next Escape restores the underlying trigger");
		assert.equal(await page.evaluate(() => window.speech.readyState), 1); assert.deepEqual(await page.evaluate(() => window.menuCancellation), before);
		assert.equal(await working(), beforeWorking); assert.equal(actionRequests, 0, "Dismissal never opens or duplicates a snapshot");
		assert.equal(await page.$eval(field, element => element.textContent), "Keep my typed explanation.");
		await page.keyboard.press("Escape"); await page.waitForFunction(() => window.speech.readyState === 3);
	}
	page.off("request", countAction);
	console.log("PASS N1 actual overlapping notebook/snapshot menus dismiss newest-first in both opening orders, including chat focus, without speech/turn cancellation or page actions");
	await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Start dictation"]')].some(button => button.checkVisibility()));
	await page.focus(field); await page.evaluate(() => window.dispatchEvent(new CustomEvent("lh:kbd-toggle-dictation")));
	await page.waitForFunction(() => window.speech?.readyState === 1);
	const beforeModal = await page.evaluate(() => ({ ...window.menuCancellation }));
	await page.click('[aria-label="Pages"]'); await page.locator('[aria-label="Open handwritten working 1"]').click();
	const viewer = '[data-testid="shared-writing-viewer"]'; await page.waitForSelector(viewer);
	await page.click(`${viewer} [aria-label="Snapshot actions"]`); await page.waitForSelector(`${viewer} ${snapshotMenu}`);
	await page.keyboard.press("Escape");
	assert.equal(await page.$(snapshotMenu), null); assert.ok(await page.$(viewer)); assert.ok(await page.$('[data-testid="notebook-pages"]'));
	assert.equal(await page.$eval(`${viewer} [aria-label="Snapshot actions"]`, element => element === document.activeElement), true);
	await page.keyboard.press("Escape"); assert.equal(await page.$(viewer), null); assert.ok(await page.$('[data-testid="notebook-pages"]'));
	await page.keyboard.press("Escape"); assert.equal(await page.$('[data-testid="notebook-pages"]'), null);
	assert.equal(await page.$eval('[aria-label="Pages"]', element => element === document.activeElement), true);
	assert.deepEqual(await page.evaluate(() => window.menuCancellation), beforeModal); assert.equal(await working(), beforeWorking);
	// A changed original opens the actual four-choice decision modal. Escape
	// cancels that decision first, then the notebook, without restoring/copying.
	await draw(); const beforeDecision = await working();
	await page.click('[aria-label="Pages"]'); await page.locator(snapshotTrigger).click();
	await page.click(`${snapshotMenu} button:first-child`); await page.waitForSelector('[data-testid="handwriting-page-decision"]');
	await page.keyboard.press("Escape"); assert.equal(await page.$(viewer), null); assert.ok(await page.$('[data-testid="notebook-pages"]'));
	await page.keyboard.press("Escape"); assert.equal(await page.$('[data-testid="notebook-pages"]'), null);
	assert.equal(await working(), beforeDecision); assert.deepEqual(await page.evaluate(() => window.menuCancellation), beforeModal); assert.equal(await page.evaluate(() => window.speech.readyState), 1);
	await page.keyboard.press("Escape"); await page.waitForFunction(() => window.speech.readyState === 3);
	console.log("PASS N1 native viewer/menu and snapshot-decision modal retain Escape priority over notebook menus without mutation or underlying cancellation");
	await cdp.detach();
}
