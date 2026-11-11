import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { sourceEntries, sourceFingerprint } from "../mobile-browser-result.mjs";
import { processScope, captureOutput } from "../mobile-browser-runner.mjs";

const fixtureRoute = `
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { handleChatRequest, stores } from "@/src/server";
import { createProberAgent, createTeacherAgent } from "@/src/agent/teacher-agent";
import { probeDoneTool } from "@/src/agent/tools/probe";
import { planTools } from "@/src/agent/tools/plan";
export async function POST(req: Request) {
 const body = await req.clone().json();
 const input = JSON.stringify(body.input);
 const faux = createFauxCore({});
 let text = "zz-prove-it-probe: What can you already explain about the goal?";
 let tool;
 if (input.includes("zz-prove-it-floor")) {
  tool = fauxToolCall("probe_done", { assessment: { strands: [{ strand: "synthetic prerequisite", assessment: "Synthetic floor and uncertainty; not a subject-accuracy judgment." }], summary: "Synthetic goal ready for planning." } });
  text = "zz-prove-it-handoff: Your prerequisite evidence is saved.";
 } else if (input.includes("zz-prove-it-plan")) {
  tool = fauxToolCall("plan_init", { mermaid: "graph TD\\n prerequisite[Prerequisite] --> goal[Goal]" });
  text = "zz-prove-it-planned: Here is the route toward your goal.";
 } else if (input.includes("zz-prove-it-teach")) text = "zz-prove-it-teaching: Explain your reasoning in your own words.";
 else if (input.includes("zz-prove-it-uncertain")) text = "zz-prove-it-feedback: Let us revisit your assumption; try explaining the first step.";
 else if (input.includes("zz-prove-it-retry")) text = "zz-prove-it-retried: Your revised reasoning is recorded, not marked as mastery.";
 else if (input.includes("zz-prove-it-continue")) text = "zz-prove-it-continued: We can return to your earlier uncertainty.";
 faux.setResponses([...(tool ? [fauxAssistantMessage([tool], { stopReason: "toolUse" })] : []), fauxAssistantMessage([fauxText(text)])]);
 return handleChatRequest(req, opts => {
  const ctx = { chatId: body.chatId, chatStore: stores.chatStore, deliver: () => {} };
  const options = { ...opts, tools: { ...probeDoneTool(ctx), ...planTools(ctx) }, engine: { model: faux.getModel(), streamFn: faux.streamSimple } };
  return opts.teaching ? createTeacherAgent(undefined, options) : createProberAgent(ctx, options);
 });
}
`;

export async function learningBrowser(root, run) {
	const processes = processScope();
	let browser;
	let page;
	let chatId;
	const fixture = path.join(run, "fixture");
	const errors = [];
	const save = (name, value) => fs.writeFile(path.join(run, name), JSON.stringify(value, null, 2) + "\n");
	const snapshot = async name => {
		const response = await fetch(`${origin}/api/chats/${chatId}`);
		assert.equal(response.status, 200);
		const record = await response.json();
		const stored = JSON.parse(await fs.readFile(path.join(fixture, "data/chats", `${chatId}.json`), "utf8"));
		assert.deepEqual(record.messages, stored.messages, "HTTP history must match real stored history");
		await save(`${name}.json`, { record, stored });
		await page.screenshot({ path: path.join(run, `${name}.png`), fullPage: true });
		return record;
	};
	let origin;
	try {
		await fs.mkdir(fixture, { recursive: true });
		for (const entry of [...sourceEntries, "node_modules"]) {
			await fs.cp(path.join(root, entry), path.join(fixture, entry), { recursive: true, mode: constants.COPYFILE_FICLONE });
		}
		assert.equal(await sourceFingerprint(root), await sourceFingerprint(fixture), "Copied source identity differs");
		await fs.mkdir(path.join(fixture, "data/chats"), { recursive: true });
		await fs.writeFile(path.join(fixture, "auth.json"), "{}\n", { mode: 0o600 });
		await fs.writeFile(path.join(fixture, "data/settings.json"), JSON.stringify({ version: 1, models: { strong: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } }, cheap: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } } }));
		await fs.writeFile(path.join(fixture, "app/api/chat/route.ts"), fixtureRoute);
		const listener = net.createServer();
		await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
		const port = listener.address().port;
		await new Promise(resolve => listener.close(resolve));
		origin = `http://127.0.0.1:${port}`;
		const home = path.join(run, "home");
		await fs.mkdir(home, { recursive: true });
		const server = processes.spawn(process.execPath, [path.join(fixture, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
			cwd: fixture, env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), LH_DATA_DIR: path.join(fixture, "data"), LH_AUTH_FILE: path.join(fixture, "auth.json"), OPENROUTER_API_KEY: "scripted-test-only", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
		});
		captureOutput(server, path.join(run, "server.log"), false);
		const instance = { url: origin, pid: server.pid, identity: execFileSync("ps", ["-p", String(server.pid), "-o", "lstart="], { encoding: "utf8" }).trim(), fixture, provider: "faux", externalModelRequests: 0, injectedTools: ["probe_done", "plan_init"], handoff: "successful tool result; automatic wake deliberately not exercised" };
		await save("instance.json", instance);
		let ready = false;
		for (let attempt = 0; attempt < 120; attempt++) {
			assert.equal(server.exitCode, null, "Owned server exited");
			try { ready = (await fetch(origin, { signal: AbortSignal.timeout(2000) })).status === 200; } catch {}
			if (ready) break;
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		assert.ok(ready, "Owned application never became usable");
		browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", userDataDir: path.join(run, "chromium"), headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args: ["--no-sandbox"] });
		await save("browser.json", { version: await browser.version(), viewport: { width: 390, height: 844 }, type: "Chromium mobile viewport emulation, not physical iPhone/iPad or native Electron" });
		page = await browser.newPage();
		page.on("pageerror", error => errors.push(error.message));
		await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
		await page.evaluateOnNewDocument(() => localStorage.setItem("lh:sidebar-open", "0"));
		const creation = await fetch(`${origin}/api/chats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "zz-prove-it-learning-goal" }) });
		assert.equal(creation.status, 200);
		chatId = (await creation.json()).id;
		assert.ok(chatId);
		await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
		await snapshot("before-goal");
		const send = async (text, expected) => {
			const before = await snapshot(`before-${text}`);
			await page.waitForSelector('[data-testid="composer"] [data-file-path-input]', { timeout: 120_000 });
			await page.waitForSelector('[data-testid="composer"] [aria-label="Send"][disabled]', { timeout: 120_000 });
			await page.click('[data-testid="composer"] [data-file-path-input]');
			await page.keyboard.type(text);
			await page.waitForSelector('[data-testid="composer"] [aria-label="Send"]:not([disabled])', { timeout: 30_000 });
			await page.click('[data-testid="composer"] [aria-label="Send"]');
			for (let attempt = 0; attempt < 120; attempt++) {
				const record = await (await fetch(`${origin}/api/chats/${chatId}`)).json();
				if (!record.turnInFlight && JSON.stringify(record.messages).includes(expected)) break;
				if (attempt === 119) throw new Error("Turn did not persist/settle");
				await new Promise(resolve => setTimeout(resolve, 250));
			}
			if (expected === "zz-prove-it-handoff") await page.waitForFunction(() => document.querySelector('[data-testid="phase-chip"]')?.textContent?.toLowerCase().includes("planning"), { timeout: 120_000 });
			else await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 120_000 }, expected);
			await page.waitForSelector('[data-testid="composer"] [aria-label="Send"][disabled]', { timeout: 120_000 });
			const after = await snapshot(text);
			assert.ok(after.messages.length > before.messages.length, "Sending must change persisted history");
			assert.ok(JSON.stringify(after.messages).includes(text));
			assert.deepEqual(errors, [], "Client exceptions during learning journey");
			return after;
		};
		return {
			send, snapshot,
			async visibleHistory() {
				for (const text of ["zz-prove-it-goal", "zz-prove-it-feedback", "zz-prove-it-uncertain", "zz-prove-it-retried"]) {
					await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 30_000 }, text);
				}
				// Phones open the plan from ⋯ (the redesign moved Plan there in round 17);
				// wider screens keep the chip. The same plan popup and nodes are checked.
				const chip = await page.$('[data-testid="plan-chip"]');
				if (chip && await chip.isVisible()) await chip.click();
				else {
					await page.click('[data-testid="page-menu-button"]');
					await page.waitForSelector('[data-testid="page-menu-plan"]', { visible: true });
					await page.click('[data-testid="page-menu-plan"]');
				}
				for (const id of ["prerequisite", "goal"]) await page.waitForSelector(`[data-testid="plan-popup"] [data-testid="plan-node-${id}"]`, { visible: true });
				await page.screenshot({ path: path.join(run, "reopened-plan.png"), fullPage: true });
				await page.click('[data-testid="plan-popup-close"]');
			},
			async reopen() {
				await page.close();
				page = await browser.newPage();
				await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
				page.on("pageerror", error => errors.push(error.message));
				await page.goto(`${origin}/chat/${chatId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
				await page.waitForFunction(() => document.body.innerText.includes("zz-prove-it-retried"));
			},
			async close() {
				await browser.close().finally(() => processes.close());
				await save("cleanup.json", { stopped: true, pid: server.pid, port, evidenceRetained: true });
			},
		};
	} catch (error) {
		if (page) await page.screenshot({ path: path.join(run, "failure.png"), fullPage: true }).catch(() => {});
		if (browser) await browser.close().catch(() => {});
		await processes.close();
		throw error;
	}
}
