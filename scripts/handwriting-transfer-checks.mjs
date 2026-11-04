import assert from "node:assert/strict";

/** Actual UI/IDB/HTTP adapters; only speech/provider and transport faults are
 * controlled. Called by the disposable mobile runner, never a public preview. */
export async function checkHandwritingTransfers({ page, origin, transferFaults }) {
	const fill = async (selector, text) => { await page.focus(selector); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.sendCharacter(text); };
	const ready = () => page.waitForFunction(() => document.querySelector('[data-testid="handwriting-notebook"]')?.dataset.ready === "true");
	const open = async () => { if (await page.$eval('[data-testid="notebook-slot"]', element => element.hidden).catch(() => true)) await page.click('[data-testid="open-notebook"]'); await ready(); };
	const cdp = await page.createCDPSession();
	const draw = async (x = 150, y = 300) => {
		const r = await page.$eval('[data-testid="notebook-canvas"]', element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 1400 }; });
		const at = (x, y) => ({ x: r.x + x * r.scale, y: r.y + y * r.scale });
		await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at(x, y), button: "left", buttons: 1, pointerType: "pen", force: 0.5 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at(x + 120, y + 80), buttons: 1, pointerType: "pen", force: 0.8 });
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at(x + 120, y + 80), button: "left", pointerType: "pen" });
	};
	const attach = async () => {
		const response = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
		await page.click('[data-testid="notebook-attach"]'); const receipt = await (await response).json();
		await page.waitForFunction(() => document.querySelector('[data-testid="notebook-slot"]').hidden);
		return receipt.writing;
	};
	const record = async id => (await fetch(`${origin}/api/chats/${id}`)).json();
	const review = async id => (await fetch(`${origin}/api/chats/${id}/writing`)).json();
	const source = async (id, writing) => (await fetch(`${origin}/api/chats/${id}/writing/${writing.id}/source`)).text();
	const device = (store, chatId) => page.evaluate(async (store, chatId) => {
		const db = await new Promise((resolve, reject) => { const request = indexedDB.open("lh-handwriting-transfer", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
		try { return await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(IDBKeyRange.bound([chatId], [chatId, []])); request.onsuccess = () => resolve(request.result.map(record => ({ ...record, png: record.png ? { size: record.png.size } : undefined, raster: record.raster ? { bytes: record.raster.rgba.byteLength } : undefined }))); request.onerror = () => reject(request.error); }); }
		finally { db.close(); }
	}, store, chatId);
	const composer = '[data-testid="composer"] textarea';

	// Failed upload survives a phone reload even though notebook is closed.
	const captureId = "mobile_transfer_capture";
	await page.goto(`${origin}/chat/${captureId}`, { waitUntil: "networkidle2" });
	await fill(composer, "Typed explanation.");
	await page.click('[data-testid="composer"] [aria-label="Start dictation"]'); await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("Middle speech."));
	await open(); await draw();
	let uploads = 0, tutorPosts = 0;
	transferFaults.handle = request => {
		if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") tutorPosts++;
		if (request.method() === "POST" && request.url().endsWith("/writing")) { uploads++; void request.abort("failed"); return true; }
		return false;
	};
	await page.click('[data-testid="notebook-attach"]'); await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Late Attach words."); window.speech.close(); });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Snapshot saved on this device"));
	assert.equal(tutorPosts, 0); assert.equal(uploads, 1);
	const [captured] = await device("captures", captureId); assert.ok(captured.png && !captured.raster);
	await open(); await draw(400, 400); await page.click('[data-testid="open-notebook-chat"]');
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Snapshot saved on this device"));
	assert.equal(uploads, 1, "Reload never silently retries upload");
	assert.equal(await page.$eval(composer, element => element.value), "Typed explanation. Middle speech. Late Attach words.");
	transferFaults.handle = null;
	const retried = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	await page.locator('[data-testid="handwriting-delivery"] button').filter(button => button.textContent === "Retry").click();
	const receipt = await (await retried).json(); assert.equal(receipt.writing.id, captured.writingId);
	assert.deepEqual(JSON.parse(await source(captureId, receipt.writing)), JSON.parse(captured.sourceJson), "Retry freezes the earlier page, not later working");
	assert.equal((await record(captureId)).messages.filter(message => message.role === "user").length, 0);
	console.log("PASS speech-first Attach, real durable failed capture, closed-notebook reload and exact Retry");

	// Definite refusal returns to the ordinary multi-select/Other form. Correct
	// the same page, preserve another image, reload, then use ordinary Submit.
	const rejectId = "mobile_transfer_reject";
	await page.goto(`${origin}/chat/${rejectId}`, { waitUntil: "networkidle2" });
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await fill('[data-testid="other-option"] input', "Compare both areas.");
	await fill('[data-testid="thinking-field"] textarea', "Initial reasoning.");
	await open(); await draw(); const a = await attach(), frozenA = await source(rejectId, a);
	const raw = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
	const external = await (await fetch(`${origin}/api/chats/${rejectId}/writing`, { method: "POST", body: raw })).json();
	await page.waitForFunction(() => document.querySelector('.lh-shared-writing')?.textContent.includes("2 shared images"));
	transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") { void request.respond({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Scripted pre-write refusal", inputDisposition: "not_accepted" }) }); return true; } return false; };
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("You can edit it and submit again"));
	assert.equal(await page.$eval('[data-testid="thinking-field"] textarea', element => element.value), "Initial reasoning.");
	assert.equal(await page.$eval('[data-testid="other-option"] input', element => element.value), "Compare both areas.");
	assert.equal(await page.$eval('[data-testid="question-dock"] button[type="submit"]', element => element.disabled), false);
	assert.equal((await device("submissions", rejectId)).length, 0);
	await fill('[data-testid="thinking-field"] textarea', "Corrected reasoning.");
	await open(); await draw(400, 500); const b = await attach();
	assert.deepEqual(new Set((await review(rejectId)).pending.map(image => image.id)), new Set([b.id, external.writing.id]));
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-testid="thinking-field"] textarea')?.value === "Corrected reasoning.");
	assert.equal(await page.$eval('[data-testid="other-option"] input', element => element.value), "Compare both areas.");
	transferFaults.handle = null;
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const answer = (await record(rejectId)).messages.find(message => message.writingSubmission);
	assert.deepEqual(new Set(answer.sharedWriting.map(image => image.id)), new Set([b.id, external.writing.id]));
	assert.match(JSON.stringify(answer), /Corrected reasoning.*|Compare both areas/);
	assert.equal(await source(rejectId, a), frozenA);
	console.log("PASS definite rejection → normal choices/Other editing → same-page replacement → reload → normal Submit");

	for (const accepted of [false, true]) {
		const id = accepted ? "mobile_transfer_accepted" : "mobile_transfer_unknown";
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		await fill(composer, "Original saved answer."); await open(); await draw(); const a = await attach();
		let delayed;
		transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") { delayed = request.postData(); void request.abort("failed"); return true; } return false; };
		await page.click('[data-testid="composer"] [aria-label="Send"]');
		await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Couldn’t confirm delivery"));
		await fill(composer, "Newer unsent explanation.");
		transferFaults.handle = null;
		if (accepted) { assert.equal((await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: delayed })).status, 200); }
		await open(); await draw(450, 550); const b = await attach();
		await page.locator('[data-testid="handwriting-delivery"] button').filter(button => button.textContent === "Check delivery").click();
		await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Saved answer"));
		assert.equal(await page.$eval(composer, element => element.value), "Newer unsent explanation.");
		assert.deepEqual((await review(id)).pending.map(image => image.id), [b.id]);
		if (!accepted) { assert.equal((await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: delayed })).status, 400, "Delayed original cannot accept after page supersession"); }
		const saved = await record(id);
		assert.equal(saved.messages.filter(message => message.sharedWriting?.some(image => image.id === a.id)).length, accepted ? 1 : 0);
	}
	console.log("PASS both uncertain-A / Attach-B orderings preserve newer edits and B; delayed stale original refused");
	transferFaults.handle = null;
}
