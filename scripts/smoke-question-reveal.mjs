/** Browser regression against the disposable teaching fixture from --all.
 * Durable recording requires explicitly opted-in fixture-only Notebook writes.
 * Optional: LH_SMOKE_URL, CHROMIUM_PATH. Tutor sends remain blocked.
 */
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const chatId = process.env.LH_SMOKE_CHAT_ID;
assert.ok(chatId && /^[A-Za-z0-9_-]+$/.test(chatId), "Set LH_SMOKE_CHAT_ID to a teaching session with a waiting check.");
const origin = process.env.LH_SMOKE_URL ?? "http://127.0.0.1:3000";
assert.ok(process.env.LH_SMOKE_NOTEBOOK_FIXTURE === "1" && chatId === "mobile_reveal_regression" && new URL(origin).hostname === "127.0.0.1" && !["3000", "3001", "3002"].includes(new URL(origin).port), "Run through smoke-mobile-inputs.mjs --all with its disposable fixture; preview writes are prohibited.");
const browser = await puppeteer.launch({
	executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
	headless: true,
	args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
try {
	const page = await browser.newPage();
	page.setDefaultNavigationTimeout(120_000);
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.setRequestInterception(true);
	page.on("request", request => {
		const path = new URL(request.url()).pathname;
		if (path === "/api/stt/token") {
			void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "browser-smoke-token" }) });
		} else if (path === `/api/chats/${chatId}/notebook`) {
			void request.continue();
		} else if (path.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
			void request.respond({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Writes disabled by browser regression" }) });
		} else void request.continue();
	});
	await page.evaluateOnNewDocument(() => {
		if (window !== window.top) return; // Saved lessons can contain sandboxed artifacts.
		localStorage.setItem("lh:sidebar-open", "0");
		const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getUserMedia = async constraints => {
			const stream = await getUserMedia(constraints);
			window.__revealTracks = stream.getTracks();
			return stream;
		};
		const NativeSocket = window.WebSocket;
		window.WebSocket = class extends EventTarget {
			static OPEN = 1;
			static CONNECTING = 0;
			readyState = 0;
			closeRequested = false;
			audioSeconds = 0;
			cursor = 0;
			pendingFinals = [];
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				window.__revealSpeech = this;
				queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
			}
			send(value) {
				if (typeof value !== "string") { window.__revealFrames = (window.__revealFrames ?? 0) + 1; this.audioSeconds += value.byteLength / 32000; this.flushFinals(); return; }
				if (JSON.parse(value).type === "CloseStream") this.closeRequested = true;
			}
			final(text) {
				this.pendingFinals.push(text); this.flushFinals();
			}
			flushFinals() {
				while (this.pendingFinals.length && this.audioSeconds >= this.cursor + .001) {
					const text = this.pendingFinals.shift(), start = this.cursor, end = start + .001; this.cursor = end;
					this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start, duration: .001, channel: { alternatives: [{ transcript: text, words: [{ word: text, start, end }] }] } }) }));
				}
			}
			close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code: 1000 })); }
		};
	});
	const reading = '[data-testid="reading-thinking-field"] [data-file-path-input]';
	const reveal = '[data-testid="teach-check-reveal"]';
	await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "networkidle2" });
	await page.waitForSelector(reveal, { visible: true });
	// Round 15 (F6): phones keep the reading note in a slide-in pane, opened
	// from a labelled button.
	const paneOpener = await page.$('[data-testid="reading-pane-open"]');
	const paned = !!paneOpener && await paneOpener.isVisible();
	if (paned) { await paneOpener.tap(); await page.waitForSelector('[data-testid="reading-pane"][data-open]'); }
	await page.locator(reading).fill("Existing reading thoughts.");
	await page.click('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]');
	await page.waitForFunction(() => window.__revealFrames > 0);
	await page.evaluate(() => window.__revealSpeech.final("First spoken thought."));
	assert.equal(await page.$eval(reading, e => e.textContent), "Existing reading thoughts.", "Speech stays buffered until recording finishes");
	// Round 16 (F4): the pane has no Show question; back to the lesson (the
	// recording carries on into the note), then the lesson's Show question.
	if (paned) { await page.tap('[data-testid="reading-pane-close"]'); await page.waitForSelector('[data-testid="reading-pane"]:not([data-open])'); }
	await page.tap(paned ? '.lh-reading-entry [data-testid="teach-check-reveal"]' : reveal);
	// Allow the tap's React update to paint, but hold the recognizer's final response.
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const stopping = await page.evaluate(() => ({
		closeRequested: window.__revealSpeech.closeRequested,
		captureStopped: window.__revealTracks.every(track => track.readyState === "ended"),
		stillClosed: !!document.querySelector('[data-testid="teach-check-reveal"]'),
	}));
	assert.equal(stopping.closeRequested, true, "Tapping Reveal must request speech finalization");
	assert.equal(stopping.captureStopped, true, "Tapping Reveal must stop microphone capture");
	assert.equal(stopping.stillClosed, true, "The question must stay closed until final transcription arrives");
	await page.evaluate(() => {
		window.__revealSpeech.final("Last spoken thought.");
		window.__revealSpeech.close();
	});
	await page.waitForSelector(reveal, { hidden: true });
	assert.equal(await page.$eval(reading, e => e.textContent), "Existing reading thoughts. First spoken thought. Last spoken thought.", "All spoken words append once to existing reading thoughts before reveal");
	const questionText = await page.$$eval('[data-testid="question-dock"] [data-file-path-input]', fields => fields.map(e => e.textContent));
	assert.ok(questionText.length > 0, "The revealed question has an answer/thinking field");
	assert.ok(questionText.every(value => value === ""), "Reading thoughts must not spill into the question answer");
	assert.deepEqual(errors, [], "No browser runtime errors");
	console.log("PASS: tapping Reveal stops capture, finishes into reading thoughts, then opens the question with an empty answer.");
} finally {
	await browser.close();
}
