import assert from "node:assert/strict";

export async function openNotebookMenu(page, section) {
	const trigger = '[aria-label="Notebook options"]';
	if (await page.$eval(trigger, e => e.getAttribute("aria-expanded") === "true")) await page.click(trigger);
	await page.click(trigger);
	await page.waitForSelector('[data-testid="notebook-options"]', { visible: true });
	if (section) {
		const button = await page.evaluateHandle(label => [...document.querySelectorAll('[data-testid="notebook-options"] [role="menuitem"]')].find(e => e.firstChild.textContent === label), section);
		await button.asElement().click();
		await button.dispose();
	}
}

/** Combined real mobile UI + Notebook service in the disposable smoke app.
 * Speech transport and editor/tutor responses are scripted; no live calls. */
export async function verifyNotebookMobile(browser, origin) {
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument(() => {
		if (window !== window.top) return;
		localStorage.setItem("lh:sidebar-open", "0");
		localStorage.setItem("lh:device-tool:writing", "on"); localStorage.setItem("lh:device-tool:notebook", "on"); // both working tools, whatever the emulated device
		const d = window.notebookSmoke = { time: 10, captures: 0, sockets: [], closes: 0, sends: [] };
		const fetch = window.fetch.bind(window);
		window.fetch = (url, init) => {
			if (String(url).endsWith("/api/stt/token")) return Promise.resolve(Response.json({ token: "scripted-test" }));
			if (String(url) === "/api/chat" && init?.method === "POST") d.sends.push(JSON.parse(init.body));
			return fetch(url, init);
		};
		const NativeSocket = window.WebSocket;
		window.WebSocket = class extends EventTarget {
			static OPEN = 1; static CONNECTING = 0; readyState = 0;
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				d.sockets.push(this);
				queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
			}
			send(value) { if (typeof value === "string" && JSON.parse(value).type === "CloseStream") d.closes++; }
			close() { this.readyState = 3; }
		};
		window.AudioContext = class {
			get currentTime() { return d.time; }
			state = "running"; destination = {}; audioWorklet = { addModule: async () => {} };
			createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
		};
		window.AudioWorkletNode = class {
			constructor() { d.worklet = this; this.port = { onmessage: null, postMessage: () => queueMicrotask(() => this.port.onmessage?.({ data: { type: "flushed" } })) }; }
			connect() {} disconnect() {}
		};
		navigator.mediaDevices.getUserMedia = async () => { d.captures++; return { getTracks: () => [{ stop() {} }] }; };
		d.audio = () => d.worklet.port.onmessage({ data: { type: "audio", buffer: new Int16Array(64000), contextStart: 10, sampleRate: 16000 } });
		d.final = text => d.sockets.at(-1).dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start: 0, duration: 4, channel: { alternatives: [{ transcript: text, words: [{ word: text, punctuated_word: text, start: 0, end: 3.9 }] }] } }) }));
		d.end = () => { const socket = d.sockets.at(-1); socket.readyState = 3; socket.dispatchEvent(new CloseEvent("close", { code: 1000 })); };
	});
	await page.goto(`${origin}/chat/mobile_other`, { waitUntil: "networkidle2", timeout: 240_000 });
	assert.equal(await page.$('[aria-label="Working attached"]'), null);
	const tutor = '[data-testid="composer"] [data-file-path-input]';
	// Unsent drafts are kept per session, so an earlier check's draft in this
	// session returns with the page; start this check from an empty composer.
	await page.waitForFunction(() => !document.querySelector("[data-tutor-draft-loading]"));
	await page.focus(tutor); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace");
	await page.waitForFunction(selector => document.querySelector(selector)?.textContent === "", {}, tutor);
	await page.type(tutor, "My explanation before working.");
	await page.locator('button[data-input-owner="notebook"][aria-expanded]').click();
	await page.waitForSelector("#notebook-instruction", { visible: true });
	await openNotebookMenu(page, "Model");
	await page.waitForFunction(() => !document.querySelector('[data-notebook-candidate="terra-off"]').disabled);
	await page.click('[data-notebook-candidate="terra-off"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="notebook-options"]'));
	await openNotebookMenu(page, "Model");
	await page.click('[data-notebook-model="sol"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-candidate="sol-medium"]')?.getAttribute('aria-checked') === 'true');
	assert.equal(await page.$('[data-notebook-candidate="sol-off"]'), null);
	await page.waitForFunction(() => !document.querySelector('[data-notebook-model="terra"]').disabled);
	await page.click('[data-notebook-model="terra"]');
	await page.waitForFunction(() => document.querySelector('[data-notebook-candidate="terra-medium"]')?.getAttribute('aria-checked') === 'true');
	await page.waitForFunction(() => !document.querySelector('[data-notebook-candidate="terra-off"]').disabled);
	await page.click('[data-notebook-candidate="terra-off"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="notebook-options"]'));
	const before = await (await fetch(`${origin}/api/chats/mobile_other/notebook`)).json();
	assert.equal(before.candidate, "terra-off", "Picker choice is saved before Apply");
	assert.equal(before.usage.calls, 0, "Changing candidates never applies");
	await page.type("#notebook-instruction", "Write pressure equals force over area.");
	await page.locator('.notebook-panel button[type="submit"]').click();
	await page.waitForSelector('[data-notebook-scroll] [aria-label="Select line 1"]');
	await page.waitForFunction(() => !document.querySelector('.session-workspace').inert);
	assert.deepEqual((await (await fetch(`${origin}/api/chats/mobile_other/notebook`)).json()).lines, [{ id: "L1", latex: "p=F/A" }]);
	await page.tap('[data-notebook-scroll] [aria-label="Select expression 2 on line 1"]');
	assert.equal(await page.$eval('[data-notebook-scroll] [aria-label="Select expression 2 on line 1"]', e => e.getAttribute('aria-pressed')), 'true');
	// Round 12 design pass: no secondary text under 13px on touch screens.
	assert.equal(await page.$eval('.notebook-expression-number', e => getComputedStyle(e).fontSize), '13px');
	await page.tap('[data-notebook-scroll] [aria-label="Select line 1"]');
	assert.equal(await page.$eval('[data-notebook-scroll] [aria-label="Select expression 2 on line 1"]', e => e.getAttribute('aria-pressed')), 'false');
	const mic = '.notebook-panel [aria-label="Start dictation"]';
	await page.click(mic);
	await page.waitForFunction(() => notebookSmoke.sockets.length === 1 && notebookSmoke.worklet);
	assert.equal(await page.$('[data-testid="composer"] [aria-label="Stop dictation"]'), null, "Tutor does not display another destination's recording controls");
	await openNotebookMenu(page, "Model");
	assert.equal(await page.$eval('[data-notebook-candidate="terra-off"]', e => e.disabled), true);
	await page.keyboard.press("Enter");
	await page.keyboard.press("Escape");
	assert.equal(await page.evaluate(() => notebookSmoke.closes), 0, "Browsing menus does not finalize the recording");
	assert.equal(await page.$eval('.session-workspace', e => e.dataset.sessionDestination), "notebook");
	await page.evaluate(() => { notebookSmoke.audio(); notebookSmoke.time = 14; notebookSmoke.final("Keep this unfinished instruction."); });
	await page.click('.notebook-panel [aria-label="Stop dictation"]');
	await page.waitForFunction(() => notebookSmoke.closes === 1);
	await page.evaluate(() => notebookSmoke.end());
	await page.waitForSelector(mic, { visible: true });
	assert.equal(await page.$eval("#notebook-instruction", e => e.value), "Keep this unfinished instruction.");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_other/notebook`)).json()).usage.calls, 1, "Stop does not Apply");
	await page.click(tutor);
	await page.waitForFunction(() => !document.querySelector(".session-workspace").inert && document.querySelector(".session-workspace").dataset.sessionDestination === "tutor");
	assert.equal(await page.evaluate(() => notebookSmoke.captures), 1, "Return never starts another recording");
	assert.deepEqual(await page.evaluate(() => notebookSmoke.sends), [], "Apply/Stop/return never Send");
	await page.type(tutor, " My explanation after working.");
	await page.waitForFunction(() => !document.querySelector(".session-workspace").inert);
	const savedDraft = await (await fetch(`${origin}/api/chats/mobile_other/notebook`)).json();
	assert.equal(savedDraft.snapshots.length, 1);
	// Round 13 (owner P2): the mark travels with the Notebook toggle — the page bar on phones, the row below the input elsewhere.
	assert.equal(await page.$eval('[aria-label="Working attached"]', e => e.getAttribute('role') === 'img' && !!e.closest(innerWidth < 768 ? '.lh-topbar' : '[data-testid="stats-bar"]') && !e.closest('button')), true);
	assert.equal(await page.$('[data-snapshot-id]'), null, 'No inline snapshot previews');
	await openNotebookMenu(page, "Review attached working");
	assert.equal(await page.$$eval('[data-snapshot-id]', nodes => nodes.length), 1);
	await page.focus('[aria-label="Earlier explanation"]');
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Reviewed earlier text.');
	await page.focus('[aria-label="Current explanation"]');
	await page.keyboard.press('End');
	await page.keyboard.type(' Reviewed continuation.');
	await page.keyboard.press('Escape');
	assert.deepEqual(await page.evaluate(() => notebookSmoke.sends), [], 'Editing review and Enter never send');
	await openNotebookMenu(page);
	await page.keyboard.press("Enter");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-notebook-candidate]');
	await page.keyboard.press("Escape");
	assert.equal(await page.$eval('.session-workspace', e => e.dataset.sessionDestination), "tutor", "Menu keyboard navigation preserves Tutor ownership");
	assert.deepEqual(await page.evaluate(() => notebookSmoke.sends), [], "Menu Enter never submits Tutor");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_other/notebook`)).json()).usage.calls, 1, "Menu Enter never Applies");
	await page.reload({ waitUntil: "networkidle2" });
	await page.waitForSelector("#notebook-instruction", { visible: true });
	assert.equal(await page.$eval("#notebook-instruction", e => e.value), "Keep this unfinished instruction.");
	await openNotebookMenu(page, "Model");
	assert.equal(await page.$eval('[data-notebook-candidate="terra-off"]', e => e.getAttribute("aria-checked")), "true");
	await page.keyboard.press("Escape");
	assert.ok(await page.$eval(tutor, e => e.textContent.includes("after working")), "Reload restores the independent Tutor continuation");
	await openNotebookMenu(page, "Review attached working");
	assert.ok(await page.$eval('[aria-label="Earlier explanation"]', e => e.value.includes('\nReviewed earlier text.')), 'Earlier edits and newlines survive reload');
	assert.ok(await page.$eval('[aria-label="Current explanation"]', e => e.value.includes('Reviewed continuation.')), 'Current continuation stays synchronized');
	await page.keyboard.press('Escape');
	// A recording switched into the portaled earlier-text field must finish in
	// its original Notebook draft, then focus the chosen Tutor prose part.
	await page.focus('#notebook-instruction');
	await page.click(mic);
	await page.waitForFunction(() => notebookSmoke.sockets.length === 1 && notebookSmoke.worklet);
	await page.evaluate(() => { notebookSmoke.audio(); notebookSmoke.time = 14; notebookSmoke.final('Retain this in the Notebook instruction.'); });
	await openNotebookMenu(page, 'Review attached working');
	assert.equal(await page.evaluate(() => notebookSmoke.closes), 0, 'Opening review leaves recording ownership alone');
	await page.click('[aria-label="Earlier explanation"]');
	await page.waitForFunction(() => notebookSmoke.closes === 1);
	await page.evaluate(() => notebookSmoke.end());
	await page.waitForFunction(() => !document.querySelector('.session-workspace').inert && document.activeElement?.getAttribute('aria-label') === 'Earlier explanation');
	assert.ok(await page.$eval('#notebook-instruction', e => e.value.includes('Retain this in the Notebook instruction.')));
	assert.equal(await page.$eval('[aria-label="Earlier explanation"]', e => e.value.includes('Retain this')), false);
	assert.equal(await page.evaluate(() => notebookSmoke.captures), 1, 'Selecting review text does not start another recording');
	assert.deepEqual(await page.evaluate(() => notebookSmoke.sends), []);
	await page.keyboard.press('Escape');
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const saved = await (await fetch(`${origin}/api/chats/mobile_other`)).json();
	const submitted = saved.messages.filter(m => m.role === "user");
	assert.equal(submitted.length, 1);
	assert.match(JSON.stringify(submitted), /before working[\s\S]*p=F\/A[\s\S]*after working/);
	assert.doesNotMatch(JSON.stringify(submitted), /unfinished instruction|Write pressure/);
	await page.waitForFunction(() => !document.querySelector('[aria-label="Working attached"]'));
	// Actual toolbar and menu close must both work with a retained clarification.
	await page.goto(`${origin}/chat/mobile_notebook_close`, { waitUntil: 'networkidle2' });
	await page.type(tutor, 'Keep my explanation.');
	await page.click('[aria-label="Open notebook"]');
	await page.waitForSelector('#notebook-instruction', { visible: true });
	await page.type('#notebook-instruction', 'Write pressure.');
	await page.click('.notebook-panel button[type="submit"]');
	await page.waitForSelector('[data-notebook-scroll] [aria-label="Select line 1"]');
	await page.waitForFunction(() => !document.querySelector('.notebook-panel button[type="submit"]').disabled || !document.querySelector('#notebook-instruction').value);
	await page.type('#notebook-instruction', 'Clarify fixture target');
	await page.click('.notebook-panel button[type="submit"]');
	await page.waitForSelector('.notebook-notice summary');
	await page.reload({ waitUntil: 'networkidle2' });
	await page.waitForSelector('.notebook-notice summary');
	// The phone split keeps its own close in the notebook toolbar (the
	// composer's tool row steps aside while the notebook is open).
	await page.click('[data-testid="notebook-close"]');
	await page.waitForFunction(() => document.querySelector('.notebook-slot').hidden);
	assert.ok(await page.$('[aria-label="Working attached"]'));
	const readClose = () => fetch(`${origin}/api/chats/mobile_notebook_close/notebook`).then(response => response.json());
	let closeView = await readClose();
	assert.equal(closeView.problem.status, 'clarification'); assert.equal(closeView.snapshots.length, 1);
	assert.deepEqual(closeView.snapshots[0].lines, [{ id: 'L1', latex: 'p=F/A' }]);
	assert.equal(closeView.snapshots[0].failure, undefined);
	await page.click('[aria-label="Open notebook"]');
	await page.waitForSelector('#notebook-instruction', { visible: true });
	await openNotebookMenu(page, 'Close notebook');
	await page.waitForFunction(() => document.querySelector('.notebook-slot').hidden);
	closeView = await readClose(); assert.equal(closeView.snapshots.length, 1, 'Menu close does not duplicate the completed snapshot');
	await page.reload({ waitUntil: 'networkidle2' });
	await page.waitForSelector('[aria-label="Open notebook"]');
	assert.ok(await page.$('[aria-label="Working attached"]'));
	await page.click('[aria-label="Open notebook"]');
	await page.waitForSelector('.notebook-notice summary');
	assert.equal(await page.$eval('#notebook-instruction', e => e.value), 'Clarify fixture target');
	assert.deepEqual(await page.evaluate(() => notebookSmoke.sends), []);
	await page.goto(`${origin}/chat/mobile_expressions`, { waitUntil: 'networkidle2' });
	await page.waitForSelector('[data-notebook-scroll] [aria-label="Select expression 4 on line 1"]');
	const expression = n => `[data-notebook-scroll] [aria-label="Select expression ${n} on line 1"]`;
	assert.match(await page.$eval(expression(4), e => e.textContent), /Empty expression/);
	await page.tap(expression(2));
	const applies = [];
	page.on('request', request => {
		if (new URL(request.url()).pathname === '/api/chats/mobile_expressions/notebook' && request.method() === 'POST') {
			const command = JSON.parse(request.postData()); if (command.type === 'apply') applies.push(command);
		}
	});
	await page.type('#notebook-instruction', 'Remove this expression fixture');
	await page.click('.notebook-panel button[type="submit"]');
	await page.waitForFunction(() => !document.querySelector('[data-notebook-scroll] [aria-label="Select expression 4 on line 1"]'));
	assert.deepEqual(applies[0].expressionSelection, { lineId: 'L1', number: 2, text: 'F/A', lineSource: 'p=F/A=2+2=' });
	assert.equal(await page.$eval(expression(2), e => e.getAttribute('aria-pressed')), 'false');
	assert.equal(await page.$eval('[data-notebook-scroll] [aria-label="Select line 1"]', e => e.getAttribute('aria-pressed')), 'true');
	assert.match(await page.$eval(expression(3), e => e.textContent), /Empty expression/);
	await page.reload({ waitUntil: 'networkidle2' });
	await page.waitForSelector(expression(3));
	assert.deepEqual((await (await fetch(`${origin}/api/chats/mobile_expressions/notebook`)).json()).lines, [{ id: 'L1', latex: 'p=2+2=' }, { id: 'L2', latex: '2+2=5' }]);
	assert.deepEqual(errors, []);
	console.log("PASS: combined phone Notebook picker, Apply, destination-owned microphone, Stop without Apply/Send, settled return, immutable snapshot, independent drafts, reload and explicit Tutor submission.");
	await page.close();
}
