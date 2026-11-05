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
		await page.waitForFunction(id => [...document.querySelectorAll('.lh-shared-writing img')].some(image => image.getAttribute("src")?.endsWith(`/${id}`)), {}, receipt.writing.id);
		return receipt.writing;
	};
	const record = async id => (await fetch(`${origin}/api/chats/${id}`)).json();
	const review = async id => (await fetch(`${origin}/api/chats/${id}/writing`)).json();
	const source = async (id, writing) => (await fetch(`${origin}/api/chats/${id}/writing/${writing.id}/source`)).text();
	const device = (store, chatId) => page.evaluate(async (store, chatId) => {
		const db = await new Promise((resolve, reject) => { const request = indexedDB.open("lh-handwriting-transfer", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
		try {
			const rows = await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(IDBKeyRange.bound([chatId], [chatId, []])); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
			return await Promise.all(rows.map(async record => ({ ...record, png: record.png ? { size: record.png.size, sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", await record.png.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("") } : undefined, raster: record.raster ? { bytes: record.raster.rgba.byteLength } : undefined })));
		}
		finally { db.close(); }
	}, store, chatId);
	const composer = '[data-testid="composer"] textarea';
	const uncertain = () => page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Couldn’t confirm delivery."));

	// Ordinary Attach, session reopen and reconnect all recover the exact
	// durable upload, never the newer page, and never submit it to the tutor.
	for (const trigger of ["attach", "reopen", "online"]) {
	const captureId = `mobile_transfer_capture_${trigger}`;
	await page.goto(`${origin}/chat/${captureId}`, { waitUntil: "networkidle2" });
	await fill(composer, "Typed explanation.");
	await page.click('[data-testid="composer"] [aria-label="Start dictation"]'); await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("Middle speech."));
	await open(); await draw();
	let uploads = 0, tutorPosts = 0, failUpload = true;
	transferFaults.handle = request => {
		if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") tutorPosts++;
		if (request.method() === "POST" && request.url().endsWith("/writing")) { uploads++; if (failUpload) { void request.abort("failed"); return true; } }
		return false;
	};
	await page.click('[data-testid="notebook-attach"]'); await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Late Attach words."); window.speech.close(); });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Snapshot saved on this device"));
	assert.equal(tutorPosts, 0); assert.equal(uploads, 1);
	const [captured] = await device("captures", captureId); assert.ok(captured.png && !captured.raster);
	await open(); await draw(400, 400); await page.click('[data-testid="open-notebook-chat"]');
	const newerWorking = await page.evaluate(id => localStorage.getItem(`lh:handwriting:pages:v1:${id}:page_initial`), captureId);
	assert.ok(newerWorking, "Newer working has a real compact recovery record");
	if (trigger === "online") {
		await page.reload({ waitUntil: "networkidle2" });
		await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Snapshot saved on this device"));
		assert.equal(uploads, 2, "Reopen automatically tries the saved upload, even when still offline");
	}
	failUpload = false;
	const retried = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/writing") && response.status() === 201);
	if (trigger === "attach") { await open(); await page.locator('[data-testid="notebook-attach"]').click(); }
	else if (trigger === "reopen") await page.reload({ waitUntil: "networkidle2" });
	else await page.evaluate(() => window.dispatchEvent(new Event("online")));
	const receipt = await (await retried).json(); assert.equal(receipt.writing.id, captured.writingId);
	await page.waitForSelector('.lh-shared-writing img');
	assert.equal(await page.$eval(composer, element => element.value), "Typed explanation. Middle speech. Late Attach words.");
	assert.deepEqual(JSON.parse(await source(captureId, receipt.writing)), JSON.parse(captured.sourceJson), "Retry freezes the earlier page, not later working");
	const image = await (await fetch(`${origin}/api/chats/${captureId}/writing/${captured.writingId}`)).arrayBuffer();
	assert.equal([...new Uint8Array(await crypto.subtle.digest("SHA-256", image))].map(byte => byte.toString(16).padStart(2, "0")).join(""), captured.png.sha256);
	assert.equal(await page.evaluate(id => localStorage.getItem(`lh:handwriting:pages:v1:${id}:page_initial`), captureId), newerWorking);
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-testid="handwriting-delivery"] button')].some(button => button.textContent === "Retry")), false);
	assert.equal(tutorPosts, 0);
	assert.equal((await record(captureId)).messages.filter(message => message.role === "user").length, 0);
	console.log(`PASS ${trigger} recovers exact durable PNG/source/identity, preserves newer working and shows review without Send`);
	transferFaults.handle = null;
	}

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
		transferFaults.handle = request => { if (request.method() === "GET" && new URL(request.url()).pathname === `/api/chats/${id}`) { void request.respond({ status: 503, contentType: "application/json", body: '{}' }); return true; } return false; };
		if (accepted) { assert.equal((await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: delayed })).status, 200); }
		await open(); await draw(450, 550); const b = await attach();
		await page.waitForFunction(id => document.querySelector('.lh-shared-writing img')?.getAttribute("src")?.endsWith(`/${id}`), {}, b.id);
		assert.ok((await page.$eval('[data-testid="handwriting-attempt-review"] img', image => image.getAttribute("src"))).endsWith(`/${a.id}`), "Failed reconciliation keeps the original A preview");
		assert.ok((await page.$eval('.lh-shared-writing img', image => image.getAttribute("src"))).endsWith(`/${b.id}`), "Normal pending review independently shows B");
		await page.click('[data-testid="handwriting-attempt-review"] button');
		await page.waitForSelector('[data-testid="shared-writing-viewer"]');
		assert.ok((await page.$eval('[data-testid="shared-writing-viewer"] img', image => image.getAttribute("src"))).endsWith(`/${a.id}`));
		await page.keyboard.press("Escape");
		transferFaults.handle = null;
		await page.evaluate(() => window.dispatchEvent(new Event("online")));
		await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-attempt-review"]'));
		assert.equal(await page.$eval(composer, element => element.value), "Newer unsent explanation.");
		assert.deepEqual((await review(id)).pending.map(image => image.id), [b.id]);
		if (!accepted) { assert.equal((await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: delayed })).status, 400, "Delayed original cannot accept after page supersession"); }
		const saved = await record(id);
		assert.equal(saved.messages.filter(message => message.sharedWriting?.some(image => image.id === a.id)).length, accepted ? 1 : 0);
	}
	console.log("PASS both uncertain-A / Attach-B orderings preserve newer edits and B; delayed stale original refused");

	// Ordinary keyboard Send is the sole submission recovery action. The live
	// app's Tab trap/field cycle and Enter handler run, not synthetic clicks.
	const resendId = "mobile_transfer_resend";
	await page.goto(`${origin}/chat/${resendId}`, { waitUntil: "networkidle2" });
	await fill(composer, "Original keyboard answer."); await open(); await draw(); const originalImage = await attach();
	let originalRequest, replayRequest;
	transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") { originalRequest = JSON.parse(request.postData()); void request.abort("failed"); return true; } return false; };
	await page.evaluate(() => document.activeElement?.blur());
	await page.keyboard.press("Tab");
	assert.equal(await page.$eval(composer, field => document.activeElement === field), true);
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="handwriting-attempt-review"]');
	await uncertain();
	assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].some(button => /Check delivery|Retry saved answer/.test(button.textContent))), false);
	const originalThumbnail = await page.$eval('[data-testid="handwriting-attempt-review"] img', image => image.getAttribute("src"));
	assert.ok(originalThumbnail.endsWith(`/${originalImage.id}`));
	await page.click('[data-testid="handwriting-attempt-review"] button');
	await page.waitForSelector('[data-testid="shared-writing-viewer"]');
	assert.equal(await page.$eval('[data-testid="shared-writing-viewer"] img', image => image.getAttribute("src")), originalThumbnail);
	await page.keyboard.press("Escape");
	await fill(composer, "Later keyboard edits.");
	transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") replayRequest = JSON.parse(request.postData()); return false; };
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Your answer was sent."));
	assert.deepEqual(replayRequest, originalRequest, "Normal Send retries only the exact original payload and stable identity");
	assert.equal(await page.$eval(composer, field => field.value), "Later keyboard edits.");
	assert.equal((await record(resendId)).messages.filter(message => message.writingSubmission).length, 1);
	assert.equal((await device("submissions", resendId)).length, 0);
	console.log("PASS app keyboard Tab/Enter normal Send retries exact identity, displays original image/viewer and preserves later edits");

	// Acceptance arriving DURING this explicit Send's speech finalization must
	// end that recovery action, not turn its continuation into a new text POST.
	transferFaults.handle = null;
	const raceId = "mobile_transfer_race";
	await page.goto(`${origin}/chat/${raceId}`, { waitUntil: "networkidle2" });
	await fill(composer, "Original race answer."); await open(); await draw(); await attach();
	let raceRequest, racePosts = 0, hideReceipt = true;
	transferFaults.handle = request => {
		const url = new URL(request.url());
		if (hideReceipt && request.method() === "GET" && url.pathname === `/api/chats/${raceId}`) { void request.respond({ status: 503, contentType: "application/json", body: '{}' }); return true; }
		if (request.method() === "POST" && url.pathname === "/api/chat") { racePosts++; raceRequest = JSON.parse(request.postData()); void request.abort("failed"); return true; }
		return false;
	};
	await page.focus(composer); await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="handwriting-attempt-review"]');
	await uncertain();
	await fill(composer, "Newer unsent race draft.");
	const raceAccepted = await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(raceRequest) });
	assert.equal(raceAccepted.status, 200); await raceAccepted.text();
	await page.waitForFunction(() => !document.querySelector('.lh-shared-writing img'));
	await page.click('[data-testid="composer"] [aria-label="Start dictation"]'); await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.locator('[data-testid="composer"] [aria-label="Send"]').click(); await page.waitForFunction(() => window.speech.finishing);
	hideReceipt = false;
	await page.evaluate(() => window.dispatchEvent(new Event("online")));
	await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-attempt-review"]'));
	await page.evaluate(() => { window.speech.final("Final newer words."); window.speech.close(); });
	await page.waitForFunction(() => document.querySelector('[data-testid="composer"] textarea')?.value === "Newer unsent race draft. Final newer words.");
	assert.equal(racePosts, 1, "Recovery Send must not emit another POST after background acceptance");
	assert.equal((await record(raceId)).messages.filter(message => message.writingSubmission).length, 1);
	assert.equal((await device("drafts", raceId)).find(draft => draft.targetKey === "composer").editor.text, "Newer unsent race draft. Final newer words.");
	console.log("PASS actual Send/speech/background-acceptance race preserves newer draft without a second POST");

	// Empty newer selections do not invalidate the already-valid frozen
	// answer. Both ordinary button eligibility and the row's Enter path apply.
	transferFaults.handle = null;
	const choiceId = "mobile_transfer_choice";
	await page.goto(`${origin}/chat/${choiceId}`, { waitUntil: "networkidle2" });
	assert.equal(await page.$eval('[aria-label="Submit answer"]', button => button.disabled), true, "An empty NEW choice answer is not submittable");
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await open(); await draw(); await attach();
	let choiceRequest, choiceReplay;
	transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") { choiceRequest = JSON.parse(request.postData()); void request.abort("failed"); return true; } return false; };
	await page.click('[aria-label="Submit answer"]'); await page.waitForSelector('[data-testid="handwriting-attempt-review"]'); await uncertain();
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await page.waitForFunction(() => !document.querySelector('[role="checkbox"][aria-checked="true"]') && !document.querySelector('[aria-label="Submit answer"]').disabled);
	transferFaults.handle = request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") choiceReplay = JSON.parse(request.postData()); return false; };
	await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press("Tab");
	assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-kbdrow]')), true, "Use the app's row-entry path before keyboard Submit");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Your answer was sent."));
	assert.deepEqual(choiceReplay, choiceRequest);
	assert.deepEqual((await device("drafts", choiceId)).find(draft => draft.targetKey === "question:question").editor.selection.selected, []);
	assert.equal((await record(choiceId)).messages.filter(message => message.writingSubmission).length, 1);
	console.log("PASS ordinary choice button/keyboard recovery replays valid original while preserving empty newer selections");

	// An actual canonical parallel-question transition unmounts the original
	// field while Attach is waiting for final speech. The late tail must be
	// durably retained for first, never appended to second or the composer.
	transferFaults.handle = null;
	const speechId = "mobile_transfer_speech";
	await page.goto(`${origin}/chat/${speechId}`, { waitUntil: "networkidle2" });
	await fill('[data-testid="question-dock"] textarea', "Original first draft.");
	await page.click('[data-testid="question-dock"] [aria-label="Start dictation"]'); await page.waitForFunction(() => window.speech?.readyState === 1);
	await open(); await draw();
	await page.click('[data-testid="notebook-attach"]'); await page.waitForFunction(() => window.speech.finishing);
	const changed = await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: speechId, input: { type: "answer", toolCallId: "first", answer: { kind: "ask", questionText: "first speech owner", dontKnow: false, answers: [], text: "Answered on another client", answeredAt: new Date().toISOString() } } }) });
	assert.equal(changed.status, 200);
	await page.waitForFunction(() => document.querySelector('[data-testid="question-dock"]')?.textContent.includes("second speech owner"));
	await page.evaluate(() => { window.speech.final("Late words for first only."); window.speech.close(); });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Late words for first only."));
	assert.equal(await page.$eval('[data-testid="question-dock"] textarea', field => field.value), "");
	assert.equal((await device("captures", speechId)).length, 0, "Changed target aborts Attach without freezing the wrong question");
	const retained = (await device("drafts", speechId)).find(draft => draft.targetKey === "question:first");
	assert.equal(retained.editor.text, "Original first draft. Late words for first only.");
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForFunction(() => document.querySelector('[data-testid="handwriting-delivery"]')?.textContent.includes("Late words for first only."));
	assert.equal(await page.$eval('[data-testid="question-dock"] textarea', field => field.value), "");
	console.log("PASS actual target unmount during Attach finalization retains old speech durably and never retargets");
	transferFaults.handle = null;
}
