import assert from "node:assert/strict";

/** Actual focused-chat + Pencil menu + keyboard dispatcher, scripted speech. */
export async function checkHandwritingMenus({ page, origin }) {
	await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
	await page.goto(`${origin}/chat/mobile_notebook_menus`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.click('[data-testid="open-notebook"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.dataset.ready === "true");
	const field = '[data-testid="composer"] textarea', cdp = await page.createCDPSession();
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
		assert.equal(await page.$eval(field, element => element.value), "Keep my typed explanation.");
		await page.keyboard.press("Escape"); await page.waitForFunction(() => window.speech.readyState === 3);
		assert.deepEqual(await page.evaluate(() => window.menuCancellation), { speech: before.speech + 1, turn: before.turn }, "After dismissal the existing Escape chain resumes");
	}
	await cdp.detach();
	console.log("PASS S2 focused chat + Pencil Pages/options Escape owns one dismissal, preserves speech/typing and restores trigger focus");
}
