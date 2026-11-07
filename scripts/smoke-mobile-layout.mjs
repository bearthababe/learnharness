/** Browser layout regression against the disposable session from --all.
 * Drafts and recording recovery persist only in that fixture.
 * Optional: LH_SMOKE_URL, CHROMIUM_PATH. No tutor turns or uploads are submitted.
 */
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { checkSidebarSwipes } from "./sidebar-swipe-checks.mjs";

const chatId = process.env.LH_SMOKE_CHAT_ID;
assert.ok(chatId && /^[A-Za-z0-9_-]+$/.test(chatId), "Set LH_SMOKE_CHAT_ID to an existing teaching session.");
const origin = process.env.LH_SMOKE_URL ?? "http://127.0.0.1:3000";
assert.ok(process.env.LH_SMOKE_NOTEBOOK_FIXTURE === "1" && chatId === "mobile_panels" && new URL(origin).hostname === "127.0.0.1" && !["3000", "3001", "3002"].includes(new URL(origin).port), "Run through smoke-mobile-inputs.mjs --all with its disposable fixture.");
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const failures = [];
const check = (condition, message) => {
	console.log(`${condition ? "PASS" : "FAIL"}: ${message}`);
	if (!condition) failures.push(message);
};
try {
	const page = await browser.newPage();
	page.setDefaultNavigationTimeout(120_000);
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	// Exercise the real microphone/worklet UI with browser-generated audio and
	// controlled speech responses, without sending audio or paying a provider.
	await page.setRequestInterception(true);
	page.on("request", request => {
		if (new URL(request.url()).pathname === "/api/stt/token") void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "browser-smoke-token" }) });
		else void request.continue();
	});
	await page.evaluateOnNewDocument(() => {
		const NativeSocket = window.WebSocket;
		window.WebSocket = class extends EventTarget {
			static OPEN = 1;
			static CONNECTING = 0;
			readyState = 0;
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
			}
			send(value) {
				if (typeof value !== "string") { window.__lhSmokeAudioFrames = (window.__lhSmokeAudioFrames ?? 0) + 1; return; }
				if (JSON.parse(value).type !== "CloseStream") return;
				queueMicrotask(() => {
					this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start: 0, duration: .001, channel: { alternatives: [{ transcript: "Mobile dictation check", words: [{ word: "Mobile dictation check", start: 0, end: .001 }] }] } }) }));
					this.close();
				});
			}
			close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code: 1000 })); }
		};
	});
	// A desktop sidebar preference must not open the phone overlay on launch.
	await page.evaluateOnNewDocument(() => {
		// Tutor visuals use sandboxed child frames with no storage access.
		if (window === window.top) localStorage.setItem("lh:sidebar-open", "1");
	});
	await page.goto(origin, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="import-notes"]');
	for (const width of [320, 375, 430]) {
		await page.setViewport({ width, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		const controls = await page.evaluate(() => [...document.querySelectorAll('.lh-home-toolbar-actions button, .lh-graph-search input, .lh-home-navigation button[aria-label="Open sidebar"]')].map(e => {
			const r = e.getBoundingClientRect();
			const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
			return { label: e.getAttribute("aria-label") ?? e.textContent.trim(), x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width, height: r.height, reachable: hit === e || e.contains(hit) };
		}));
		check(controls.length >= 2 && controls.every(r => r.x >= 0 && r.right <= width && r.y >= 0 && r.bottom <= 667 && r.width >= 44 && r.height >= 44 && r.reachable), `Home toolbar controls fit and receive taps at ${width}px`);
	}
	await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await checkSidebarSwipes(page, check, origin, chatId);
	await page.click('.lh-home-navigation button[aria-label="Open sidebar"]');
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "false");
	await page.click('button[aria-label="Close sidebar"]');
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "true");
	check(true, "Home toolbar leaves session navigation reachable");
	if (await page.$('button[aria-label="Graph display settings"]')) {
		await page.click('button[aria-label="Graph display settings"]');
		check(await page.$eval('button[aria-label="Graph display settings"]', e => e.getAttribute("aria-expanded") === "true"), "Graph settings opens from the mobile action row");
		await page.click('button[aria-label="Graph display settings"]');
	}
	await page.click('[data-testid="import-notes"]');
	const [chooser] = await Promise.all([page.waitForFileChooser(), page.locator('[role="menuitem"]').filter(button => button.textContent === "Files").click()]);
	await chooser.cancel();
	check(true, "Import notes opens the native file chooser (cancelled without an upload)");
	await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "networkidle2" });
	await page.waitForSelector("[data-file-path-input]");
	const rect = async selector => page.$eval(selector, e => {
		const r = e.getBoundingClientRect();
		return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
	});
	const sidebar = "aside[aria-hidden]";
	const initiallyClosed = await page.$eval(sidebar, e => e.getAttribute("aria-hidden") === "true");
	check(initiallyClosed, "Phone sessions panel starts closed despite desktop preference");
	if (!initiallyClosed) await page.click('button[aria-label="Close sidebar"]');
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getBoundingClientRect().width === 0);
	const micSelector = await page.$('[data-testid="compact-dictation-toggle"]') ? '[data-testid="compact-dictation-toggle"]' : '[data-testid="dictation-toggle"]';
	const mic = await rect(micSelector);
	check(mic.width >= 44 && mic.height >= 44 && mic.x >= 0 && mic.right <= 375 && mic.y >= 0 && mic.bottom <= 667, "Dictation has a visible 44px touch target inside phone viewport");
	check(await page.evaluate(() => [...document.querySelectorAll("summary")].filter(e => e.textContent.includes("Concepts app")).every(e => e.getBoundingClientRect().height === 0)), "Concepts setup is absent from phone composer");
	check(await page.evaluate(() => [...document.querySelectorAll("nextjs-portal")].every(e => !e.shadowRoot?.querySelector('[data-nextjs-dev-tools-button]'))), "Next development indicator is disabled");
	const before = await rect("[data-file-path-input]");
	await page.click('button[aria-label="Open sidebar"]');
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "false");
	// Wait for the inherited desktop width transition if the regression is present.
	await page.evaluate(async () => { await Promise.all(document.querySelector('aside[aria-hidden]').getAnimations().map(a => a.finished.catch(() => {}))); });
	const panel = await rect(sidebar);
	const behind = await rect("[data-file-path-input]");
	check(Math.abs(panel.width - 375) < 1 && panel.x === 0, "Open phone sessions panel covers full width");
	check(Math.abs(before.width - behind.width) < 1, "Opening sessions does not squeeze chat");
	check(await page.$eval("main", e => e.inert), "Chat is inert beneath mobile navigation");
	check(await page.$eval(sidebar, e => e.contains(document.activeElement)), "Focus enters mobile navigation");
	check(await page.evaluate(() => {
		const list = document.querySelector('[data-testid="session-list"]');
		return list && getComputedStyle(list).overscrollBehaviorY !== "auto" && getComputedStyle(document.documentElement).overscrollBehaviorY === "none";
	}), "Session-list edges cannot chain scrolling to the page");
	assert.deepEqual(failures, [], "Mobile navigation and composer regressions");
	// Opening navigation fetches the session list asynchronously. Exercise
	// scrolling after the real rows arrive, rather than the loading placeholder.
	await page.waitForSelector('[data-testid="session-row"]');
	const gesture = (selector, position, delta) => page.evaluate(({ selector, position, delta }) => {
		const el = document.querySelector(selector);
		el.scrollTop = position === "bottom" ? el.scrollHeight : position === "middle" ? 80 : 0;
		const r = el.getBoundingClientRect();
		const x = r.left + r.width / 2, y = r.top + r.height / 2;
		const touch = offset => new Touch({ identifier: 1, target: el, clientX: x, clientY: y + offset });
		el.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(0)], bubbles: true }));
		const event = new TouchEvent("touchmove", { touches: [touch(delta)], bubbles: true, cancelable: true });
		el.dispatchEvent(event);
		el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
		return event.defaultPrevented;
	}, { selector, position, delta });
	check(await gesture('[data-testid="session-list"]', "top", 30), "Top-edge session-list gesture is contained");
	check(await gesture('[data-testid="session-list"]', "bottom", -30), "Bottom-edge session-list gesture is contained");
	check(!await gesture('[data-testid="session-list"]', "middle", -30), "Native scrolling remains enabled inside the session list");
	await page.locator('aside [aria-current="page"]').click();
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "true");
	check(true, "Selecting the current session also closes phone navigation");
	// A stable opener box can still be covered by the moving session title
	// during the closing animation. Wait until its centre actually receives taps.
	await page.waitForFunction(() => {
		const opener = document.querySelector('button[aria-label="Open sidebar"]');
		const r = opener.getBoundingClientRect();
		const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return hit === opener || opener.contains(hit);
	});
	await page.locator('button[aria-label="Open sidebar"]').click();
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "false");
	await page.click('button[aria-label="Close sidebar"]');
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getBoundingClientRect().width === 0);
	await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open sidebar");
	check(true, "Dismissing navigation restores focus to its opener");
	await page.type("[data-file-path-input]", "Mobile layout draft check");
	await page.waitForFunction(() => getComputedStyle(document.body).position === "fixed");
	check(await page.evaluate(() => {
		const root = document.querySelector('[role="log"]');
		const scroll = [...root.querySelectorAll("div")].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY));
		return scroll && getComputedStyle(scroll).overscrollBehaviorY !== "auto";
	}), "Native message-history scrolling contains edge gestures");
	await page.evaluate(() => {
		const root = document.querySelector('[role="log"]');
		[...root.querySelectorAll("div")].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY)).dataset.smokeHistory = "true";
	});
	check(await gesture('[data-smoke-history]', "top", 30), "Focused history top edge cannot move the page");
	check(await gesture('[data-smoke-history]', "bottom", -30), "Focused history bottom edge cannot move the page");
	check(!await gesture('[data-smoke-history]', "middle", -30), "Focused history keeps native scrolling within its content");
	check(await gesture('button[aria-label="Open sidebar"]', "top", 30), "Header gesture is contained while composing");
	await page.locator("[data-file-path-input]").fill("Mobile layout draft check\n" + "A line of working\n".repeat(25));
	check(await gesture("[data-file-path-input]", "top", 30), "Composer top-edge gesture cannot move the page");
	check(await gesture("[data-file-path-input]", "bottom", -30), "Composer bottom-edge gesture cannot move the page");
	check(!await gesture("[data-file-path-input]", "middle", -30), "Multiline composer keeps native internal scrolling");
	check(await page.evaluate(() => {
		const el = document.querySelector("[data-file-path-input]");
		const touches = [1, 2].map(identifier => new Touch({ identifier, target: el, clientX: 100 + identifier * 20, clientY: 300 }));
		el.dispatchEvent(new TouchEvent("touchstart", { touches, bubbles: true }));
		const event = new TouchEvent("touchmove", { touches, bubbles: true, cancelable: true });
		el.dispatchEvent(event);
		el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
		return !event.defaultPrevented;
	}), "Two-finger gestures are not intercepted by scroll locking");
	await page.locator("[data-file-path-input]").fill("Mobile layout draft check");
	await page.evaluate(() => {
		Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 367 });
		window.visualViewport.dispatchEvent(new Event("resize"));
	});
	await page.waitForFunction(selector => document.querySelector(selector).getBoundingClientRect().bottom <= 367, {}, micSelector);
	check((await rect("[data-file-path-input]")).bottom <= 367, "Composer and dictation stay above a simulated keyboard");
	await page.evaluate(() => {
		delete window.visualViewport.height;
		window.visualViewport.dispatchEvent(new Event("resize"));
	});
	await page.evaluate(() => document.activeElement.blur());
	await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
	check(await page.$eval("[data-file-path-input]", e => e.textContent.includes("Mobile layout draft check")), "Blur releases focus lock and preserves draft");
	check(!await gesture('[data-smoke-history]', "middle", -30), "History remains scrollable after composer dismissal");
	await page.click(micSelector);
	await page.waitForSelector(micSelector.includes("compact") ? '.lh-compact-recording' : '[data-testid="dictation-bar"]');
	await page.waitForFunction(() => window.__lhSmokeAudioFrames > 0);
	const stop = await rect('button[aria-label="Stop dictation"]');
	check(stop.width >= 44 && stop.height >= 44 && stop.bottom <= 667, "Recording keeps a visible touch-sized Stop control");
	await page.click('button[aria-label="Stop dictation"]');
	await page.waitForFunction(() => [...document.querySelectorAll("[data-file-path-input]")].some(e => e.textContent.includes("Mobile dictation check")));
	check(true, "Stopping dictation delivers final words to the existing answer input");
	await page.evaluate(() => document.activeElement.blur());
	check(await page.evaluate(() => !/user-scalable=no|maximum-scale=1(?:,|$)/.test(document.querySelector('meta[name="viewport"]').content)), "Viewport preserves pinch zoom");
	await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
	await page.waitForFunction(() => document.querySelector('aside[aria-hidden]')?.getAttribute("aria-hidden") === "false");
	// aria-hidden changes when opening starts, before the inherited width
	// transition finishes. Assert its final width, as for phone opening above.
	await page.evaluate(async () => { await Promise.all(document.querySelector('aside[aria-hidden]').getAnimations().map(a => a.finished.catch(() => {}))); });
	check((await rect(sidebar)).width === 288, "Wide layout restores the inline desktop sidebar preference");
	check(await page.evaluate(() => getComputedStyle(document.querySelector("main")).position !== "fixed" && !document.querySelector("main").inert), "Desktop content is interactive after mobile transition");
	check(errors.length === 0, `No browser runtime errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
	assert.deepEqual(failures, []);
} finally {
	await browser.close();
}
