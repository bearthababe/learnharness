import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { sourceEntries, sourceFingerprint } from "../mobile-browser-result.mjs";
import { processScope, captureOutput } from "../mobile-browser-runner.mjs";
import { LIVE_ROUTE_FILE, liveSettings } from "./learning-live.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * An owned copy of the app whose tutor is the real Claude Code route, restricted to D-8 tools.
 * Data, auth and config directories are isolated; HOME stays the owner's so the Claude Code CLI can
 * use its own login (nothing is copied). No API key reaches the server: its environment is built
 * from an explicit allowlist, so there is no API-billing route.
 */
export async function liveApp({ root, run, tutorModel }) {
	const processes = processScope();
	const fixture = path.join(run, "fixture");
	const save = (name, value) => fs.writeFile(path.join(run, name), JSON.stringify(value, null, 2) + "\n");
	let browser, page, chatId, origin, server, sequence = 0;
	const errors = [];
	try {
		await fs.mkdir(fixture, { recursive: true });
		for (const entry of [...sourceEntries, "node_modules"]) await fs.cp(path.join(root, entry), path.join(fixture, entry), { recursive: true, mode: constants.COPYFILE_FICLONE });
		assert.equal(await sourceFingerprint(root), await sourceFingerprint(fixture), "Copied source identity differs");
		await fs.access(path.join(fixture, "verification")).then(() => assert.fail("The answer key must not be in the tutor's app copy"), () => {});
		await fs.mkdir(path.join(fixture, "data/chats"), { recursive: true });
		await fs.writeFile(path.join(fixture, "auth.json"), "{}\n", { mode: 0o600 });
		await fs.writeFile(path.join(fixture, "data/settings.json"), JSON.stringify(liveSettings(tutorModel)));
		await fs.copyFile(path.join(root, LIVE_ROUTE_FILE), path.join(fixture, "app/api/chat/route.ts"));
		const listener = net.createServer();
		await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
		const port = listener.address().port;
		await new Promise(resolve => listener.close(resolve));
		origin = `http://127.0.0.1:${port}`;
		const config = path.join(run, "xdg-config");
		await fs.mkdir(config, { recursive: true });
		server = processes.spawn(process.execPath, [path.join(fixture, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
			cwd: fixture,
			env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: process.env.HOME, XDG_CONFIG_HOME: config, LH_DATA_DIR: path.join(fixture, "data"), LH_AUTH_FILE: path.join(fixture, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		captureOutput(server, path.join(run, "server.log"), false);
		await save("instance.json", { url: origin, pid: server.pid, identity: execFileSync("ps", ["-p", String(server.pid), "-o", "lstart="], { encoding: "utf8" }).trim(), fixture, tutor: { provider: "claude-code", model: tutorModel, tools: "D-8 allowlist enforced in the fixture route" }, environment: "explicit allowlist: PATH, LANG, HOME (Claude Code login), isolated XDG/data/auth; no API keys" });
		let ready = false;
		for (let attempt = 0; attempt < 240 && !ready; attempt++) {
			assert.equal(server.exitCode, null, "Owned server exited");
			try { ready = (await fetch(origin, { signal: AbortSignal.timeout(2000) })).status === 200; } catch {}
			if (!ready) await sleep(500);
		}
		assert.ok(ready, "Owned application never became usable");
		browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", userDataDir: path.join(run, "chromium"), headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args: ["--no-sandbox"] });
		page = await browser.newPage();
		page.on("pageerror", error => errors.push(error.message));
		await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
		await page.evaluateOnNewDocument(() => localStorage.setItem("lh:sidebar-open", "0"));
	} catch (error) {
		if (browser) await browser.close().catch(() => {});
		await processes.close();
		throw error;
	}

	const record = async () => {
		const response = await fetch(`${origin}/api/chats/${chatId}`);
		assert.equal(response.status, 200);
		return response.json();
	};
	const snapshot = async label => {
		const name = `${String(++sequence).padStart(3, "0")}-${label.replace(/[^\w.-]+/g, "-").slice(0, 60)}`;
		const current = await record();
		await save(`${name}.json`, current);
		await page.screenshot({ path: path.join(run, `${name}.png`), fullPage: true }).catch(() => {});
		return current;
	};
	/** Settled: no turn in flight, the page idle, and either the composer or a question owns input, stable for 15 seconds (covers the automatic probe-to-teacher handoff). */
	const settle = async (timeoutMs = 15 * 60_000) => {
		const deadline = Date.now() + timeoutMs;
		let stableSince = 0;
		while (Date.now() < deadline) {
			assert.equal(server.exitCode, null, "Owned server exited");
			const log = await fs.readFile(path.join(run, "server.log"), "utf8").catch(() => "");
			const refusal = /D-8 tool boundary violated: [^\n]*/.exec(log);
			if (refusal) throw new Error(refusal[0]);
			const current = await record();
			const idle = await page.evaluate(() => !document.body.innerText.includes("THINKING…") && !document.body.innerText.includes("COMPACTING CONTEXT…")
				&& Boolean(document.querySelector('[data-testid="question-dock"], [data-testid="teach-check-reveal"], [data-testid="question-dock-bar"]') || document.querySelector('[data-testid="composer"] [aria-label="Send"][disabled]'))).catch(() => false);
			if (!current.turnInFlight && idle) { stableSince ||= Date.now(); if (Date.now() - stableSince >= 15_000) return current; }
			else stableSince = 0;
			await sleep(1000);
		}
		throw new Error("Tutor turn did not settle in time");
	};
	const type = async (selector, value) => {
		await page.waitForSelector(selector, { visible: true, timeout: 60_000 });
		await page.click(selector);
		await page.keyboard.type(value);
	};

	return {
		origin, record, snapshot, settle, errors,
		async start(title) {
			const creation = await fetch(`${origin}/api/chats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
			assert.equal(creation.status, 200);
			chatId = (await creation.json()).id;
			await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
			await page.waitForSelector('[data-testid="composer"] [data-file-path-input]', { timeout: 120_000 });
			return chatId;
		},
		async sendMessage(text) {
			await type('[data-testid="composer"] [data-file-path-input]', text);
			await page.waitForSelector('[data-testid="composer"] [aria-label="Send"]:not([disabled])', { timeout: 30_000 });
			await page.click('[data-testid="composer"] [aria-label="Send"]');
		},
		/** Answer the open question through the question dock, as a learner would. */
		async answer({ indices, dontKnow, text, thinking }) {
			const reveal = await page.$('[data-testid="teach-check-reveal"]');
			if (reveal) await reveal.click();
			const bar = await page.$('[data-testid="question-dock-bar"]');
			if (bar) await bar.click();
			await page.waitForSelector('[data-testid="question-dock"]', { visible: true, timeout: 60_000 });
			if (dontKnow) {
				const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('[data-testid="question-dock"] button')].find(element => /I don.t know/.test(element.textContent ?? "")); button?.click(); return Boolean(button); });
				assert.ok(clicked, "No \"I don't know\" choice on this question");
			} else if (indices?.length) {
				// Options can be typeset math, so rows are chosen by position, matching the question's option order.
				for (const index of indices) {
					const clicked = await page.evaluate(position => {
						const rows = [...document.querySelectorAll('[data-testid="question-dock"] [role="radio"], [data-testid="question-dock"] [role="checkbox"]')].filter(element => element.getAttribute("data-testid") !== "other-option");
						rows[position]?.click();
						return Boolean(rows[position]);
					}, index);
					assert.ok(clicked, `No option row at position ${index + 1}`);
				}
			}
			if (text) await type('[data-testid="answer-field"] [data-file-path-input]', text);
			if (thinking && await page.$('[data-testid="thinking-field"] [data-file-path-input]')) await type('[data-testid="thinking-field"] [data-file-path-input]', thinking);
			await page.waitForSelector('[data-testid="question-dock"] button[type="submit"]:not([disabled])', { timeout: 30_000 });
			await page.click('[data-testid="question-dock"] button[type="submit"]');
		},
		async close() {
			await browser.close().catch(() => {});
			await processes.close();
			await save("cleanup.json", { stopped: true, pid: server.pid, evidenceRetained: true });
		},
	};
}
