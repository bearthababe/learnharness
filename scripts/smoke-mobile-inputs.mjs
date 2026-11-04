/** Real UI, disposable storage, scripted tutor/speech. Physical iOS is separate.
 * Run: node scripts/smoke-mobile-inputs.mjs (no learner data or preview slots used).
 */
import assert from "node:assert/strict";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { checkHandwritingTransfers } from "./handwriting-transfer-checks.mjs";
import { checkTransferDevice } from "./handwriting-device-checks.mjs";

const root = process.cwd();
const dir = process.env.LH_MOBILE_TEST_DIR ?? await mkdtemp("/tmp/opencode/mobile-input-browser-");
assert.ok(path.basename(dir).startsWith("mobile-input-browser-") && path.resolve(dir) !== root, "Use a dedicated mobile-input-browser-* fixture directory");
for (const name of ["app", "components", "src", "lib", "public", "electron", "config.ts", "package.json", "tsconfig.json", "postcss.config.mjs", "next.config.ts"]) {
	await cp(path.join(root, name), path.join(dir, name), { recursive: true });
}
await symlink(path.join(root, "node_modules"), path.join(dir, "node_modules")).catch(error => { if (error.code !== "EEXIST") throw error; });
// The installed packages are outside the disposable source root.
const configPath = path.join(dir, "next.config.ts");
await writeFile(configPath, (await readFile(configPath, "utf8")).replace("const nextConfig: NextConfig = {", 'const nextConfig: NextConfig = { turbopack: { root: "/" },'));
await rm(path.join(dir, "data"), { recursive: true, force: true });
await mkdir(path.join(dir, "data/chats"), { recursive: true });
const now = new Date().toISOString();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content, id = "assistant") => ({ role: "assistant", content, id, api: "openai-completions", provider: "openrouter", model: "z-ai/glm-5.3-flash", usage, stopReason: "stop", timestamp: Date.now() });
const conversation = { id: "mobile_conversation", title: "Mobile browser conversation", createdAt: now, updatedAt: now, messages: [assistant([{ type: "text", text: "Explain how pressure changes with area." }])] };
await writeFile(path.join(dir, "data/chats/mobile_conversation.json"), JSON.stringify(conversation));
await writeFile(path.join(dir, "data/chats/mobile_other.json"), JSON.stringify({ ...conversation, id: "mobile_other", title: "Other isolated session" }));
for (const id of ["mobile_transfer_capture", "mobile_transfer_unknown", "mobile_transfer_accepted"]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id }));
const call = (name, args, id) => assistant([{ type: "toolCall", name, arguments: args, id }], `assistant_${id}`);
const result = (name, details, id) => ({ role: "toolResult", toolName: name, toolCallId: id, id: `result_${id}`, content: [{ type: "text", text: "Ready." }], details, isError: false, timestamp: Date.now() });
const teaching = [
	call("probe_done", { summary: "Ready for pressure." }, "probe_done"), result("probe_done", { ok: true }, "probe_done"),
	call("plan_create", {}, "plan"), result("plan_create", { tree: { nodes: [{ id: "pressure", title: "Pressure and area", description: "Relate force, area and pressure." }], edges: [] } }, "plan"),
	assistant([{ type: "text", text: Array(25).fill("Pressure relates force to the area over which it acts. Consider the same force on two different areas.").join("\n\n") }], "lesson"),
];
for (const [id, tool, question] of [
	["mobile_teaching", "explain", { question: "Explain pressure and area.", correctAnswer: "Pressure is force divided by area.", nodeId: "pressure", type: "check" }],
	["mobile_selection", "quiz", { question: "Which change doubles pressure?", options: [{ label: "Halve the area", value: "half" }, { label: "Double the area", value: "double" }], correctAnswer: "half", explanation: "The same force over half the area doubles pressure.", nodeId: "pressure", type: "check" }],
]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id, messages: [...teaching, call(tool, question, "question")] }));
await writeFile(path.join(dir, "data/chats/mobile_other_answer.json"), JSON.stringify({ ...conversation, id: "mobile_other_answer", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
await writeFile(path.join(dir, "data/chats/mobile_transfer_reject.json"), JSON.stringify({ ...conversation, id: "mobile_transfer_reject", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
const problem = { statement: "Calculate pressure for a 100 N force on 2 square metres.", mode: "apply", target: ["pressure"], modelSolution: "50 Pa." };
for (const id of ["mobile_practice", "mobile_drill"]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id, kind: "practice", ...(id === "mobile_drill" ? { practiceMode: "drill" } : {}), messages: [call("problem", problem, "problem"), result("problem", null, "problem")] }));
await writeFile(path.join(dir, "data/settings.json"), JSON.stringify({ version: 1, models: { strong: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } }, cheap: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } } }));
// Only the disposable app substitutes the external model. The actual request
// handler, stores, submission validation and transcript projections still run.
await writeFile(path.join(dir, "app/api/chat/route.ts"), `
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { handleChatRequest } from "@/src/server";
import { createTeacherAgent } from "@/src/agent/teacher-agent";
export async function POST(req: Request) {
 const faux = createFauxCore({});
 faux.setResponses([fauxAssistantMessage([fauxText("Scripted tutor received your working.")])]);
 return handleChatRequest(req, opts => createTeacherAgent(undefined, { messages: opts.messages, engine: { model: faux.getModel(), streamFn: faux.streamSimple } }));
}
`);
await mkdir(path.join(dir, "app/transfer-fixture"), { recursive: true });
await writeFile(path.join(dir, "app/transfer-fixture/page.tsx"), `"use client";
import { useEffect } from "react";
import { IndexedTransferDevice } from "@/components/handwriting/transfer-device";
export default function Fixture() {
 useEffect(() => { Object.assign(window, { transferDevice: new IndexedTransferDevice() }); }, []);
 return <p>Isolated native IndexedDB adapter fixture</p>;
}`);
const port = Number(process.env.LH_MOBILE_TEST_PORT ?? 3109);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
	cwd: dir, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, LH_DATA_DIR: path.join(dir, "data"), LH_AUTH_FILE: path.join(dir, "auth.json"), OPENROUTER_API_KEY: "scripted-test-only", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
console.log(`Disposable browser app: ${dir}`);
server.stdout.on("data", data => { log += data; void appendFile(path.join(dir, "server.log"), data); });
server.stderr.on("data", data => { log += data; void appendFile(path.join(dir, "server.log"), data); });
let browser;
try {
	for (let i = 0; ; i++) {
		if (server.exitCode !== null) throw new Error(log);
		if (log.includes("Ready in")) break;
		if (i > 90) throw new Error(`Server did not start: ${log}`);
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-features=BackForwardCache", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	await page.setRequestInterception(true);
	const transferFaults = { handle: null };
	page.on("request", request => {
		if (transferFaults.handle?.(request)) return;
		if (new URL(request.url()).pathname === "/api/stt/token") void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "browser-test-token" }) });
		else void request.continue();
	});
	await page.evaluateOnNewDocument(() => {
		localStorage.setItem("lh:sidebar-open", "0");
		const NativeSocket = window.WebSocket;
		const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getUserMedia = async constraints => {
			if (window.denyMicrophone) throw new DOMException("Test permission denied", "NotAllowedError");
			const stream = await getUserMedia(constraints);
			window.captureTracks = stream.getTracks();
			return stream;
		};
		window.WebSocket = class extends EventTarget {
			static OPEN = 1;
			static CONNECTING = 0;
			readyState = 0;
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				window.speech = this;
				queueMicrotask(() => { if (!window.holdConnection) this.open(); });
			}
			open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
			send(value) { if (typeof value === "string" && JSON.parse(value).type === "CloseStream") this.finishing = true; }
			final(text) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript: text }] } }) })); }
			close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code: 1000 })); }
		};
	});
	await page.goto(`${origin}/chat/mobile_conversation`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector('[data-testid="composer"] textarea');
	const fill = async (selector, text) => {
		await page.focus(selector);
		await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
		await page.keyboard.sendCharacter(text);
	};
	const checkPhoneInput = async selector => {
		for (const width of [320, 375, 430]) {
			await page.setViewport({ width, height: 550, isMobile: true, hasTouch: true });
			await fill(selector, "A substantial explanation.\n".repeat(16));
			const targets = await page.$eval(selector, field => {
				const shell = field.closest('.lh-compact-field');
				return [...shell.querySelectorAll('button')].map(button => {
					const r = button.getBoundingClientRect();
					const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
					return { width: r.width, height: r.height, left: r.left, right: r.right, bottom: r.bottom, top: r.top, hit: button === hit || button.contains(hit) };
				});
			});
			assert.ok(targets.length && targets.every(r => r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= 550 && r.hit), `In-field controls fit and receive taps at ${width}px`);
		}
		await page.setViewport({ width: 375, height: 350, isMobile: true, hasTouch: true });
		await page.$eval(selector, e => e.focus());
		await page.waitForFunction(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= 0 && r.bottom <= 350; }, {}, selector);
		assert.ok(await page.$eval(selector, e => e.scrollHeight > e.clientHeight), "Long draft scrolls internally in a keyboard-sized viewport");
		await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	};
	await fill('[data-testid="composer"] textarea', "My typed explanation.");
	const geometry = await page.evaluate(() => {
		const field = document.querySelector('[data-testid="composer"] textarea').getBoundingClientRect();
		const mic = [...document.querySelectorAll('[aria-label="Start dictation"]')].find(e => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
		const send = document.querySelector('[data-testid="composer"] [aria-label="Send"]').getBoundingClientRect();
		return { field: field.toJSON(), mic: mic?.toJSON(), send: send.toJSON() };
	});
	assert.ok(geometry.mic && geometry.mic.y >= geometry.field.y - 2 && geometry.mic.bottom <= geometry.field.bottom + 2, "Microphone sits inside the draft row rather than consuming a second row");
	assert.ok(geometry.mic.width >= 44 && geometry.mic.height >= 44 && geometry.send.width >= 44 && geometry.send.height >= 44, "Phone actions have 44px targets");
	const input = '[data-testid="composer"] textarea';
	const mic = '[data-testid="compact-dictation-toggle"]';
	const longDraft = Array.from({ length: 20 }, (_, i) => `Line ${i}: my reasoning stays here.`).join("\n");
	await fill(input, longDraft);
	const beforeCapture = await page.$eval(input, field => {
		field.setSelectionRange(8, 20); field.scrollTop = 70;
		return { height: field.getBoundingClientRect().height, scroll: field.scrollTop };
	});
	await page.click(mic);
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.waitForSelector('[aria-label="Cancel dictation"]');
	assert.equal(await page.$eval(input, e => e.getBoundingClientRect().height), beforeCapture.height, "Recording preserves the grown editor height");
	await page.evaluate(() => window.speech.final("Discard this capture."));
	await page.click('[aria-label="Stop dictation"]');
	await page.waitForFunction(() => window.speech.finishing);
	assert.ok(await page.evaluate(() => window.captureTracks.every(track => track.readyState === "ended")), "Stop ends microphone capture before waiting for finals");
	await page.click('[aria-label="Cancel dictation"]');
	await page.evaluate(() => window.speech.final("Late cancelled words."));
	assert.deepEqual(await page.$eval(input, e => ({ value: e.value, start: e.selectionStart, end: e.selectionEnd, scroll: e.scrollTop })), { value: longDraft, start: 8, end: 20, scroll: beforeCapture.scroll }, "Cancel during finalization restores earlier draft, selection and internal scroll");
	await fill(input, "Typed first.");
	await page.click(mic);
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.evaluate(() => window.speech.final("Spoken middle."));
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Spoken end."); window.speech.close(); });
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const saved = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(saved.messages.filter(m => m.role === "user" && JSON.stringify(m.content).includes("Typed first. Spoken middle. Spoken end.")).length, 1, "Send finishes and persists typed/spoken work once through the actual handler");
	await page.reload({ waitUntil: "networkidle2" });
	assert.ok(await page.evaluate(() => document.body.textContent.includes("Typed first. Spoken middle. Spoken end.")), "Submitted working survives reopening");
	await page.evaluate(() => { window.holdConnection = true; });
	await page.click(mic);
	await page.waitForFunction(() => window.speech && window.speech.readyState === 0);
	assert.ok(await page.evaluate(() => document.querySelector('.lh-compact-field').textContent.includes("Connecting")), "Pending connection is shown inside the input");
	await page.click('[aria-label="Cancel dictation"]');
	await page.evaluate(() => { window.speech.open(); window.speech.final("Cancelled connection."); window.denyMicrophone = true; });
	await page.click(mic);
	await page.waitForSelector('.lh-compact-error');
	assert.match(await page.$eval('.lh-compact-error', e => e.textContent), /Microphone permission denied.*Retry/);
	await page.evaluate(() => { window.denyMicrophone = false; window.holdConnection = false; });
	await page.click('.lh-compact-error button');
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.click('[aria-label="Cancel dictation"]');
	for (const width of [320, 375, 430]) {
		await page.setViewport({ width, height: 550, isMobile: true, hasTouch: true });
		await fill(input, "Panel round trip keeps this draft.");
		await page.click('[data-testid="stats-model"]');
		await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
		const menu = await page.$eval('[data-testid="model-menu"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
		assert.ok(menu.left >= 0 && menu.right <= width && menu.top >= 0 && menu.bottom <= 550, `Real model options fit ${width}px`);
		await page.keyboard.press("Escape");
		await page.click('[data-testid="stats-summary"]');
		await page.waitForSelector('[data-testid="stats-detail"]');
		const usage = await page.$eval('[data-testid="stats-detail"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; });
		assert.ok(usage.left >= 0 && usage.right <= width && usage.top >= 0, `Real usage content fits ${width}px`);
		await page.keyboard.press("Escape");
		assert.equal(await page.$eval(input, e => e.value), "Panel round trip keeps this draft.");
	}
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
	const upload = id => fetch(`${origin}/api/chats/${id}/writing`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
	assert.equal((await upload("mobile_other")).status, 201);
	assert.equal(await page.$('[data-testid="shared-writing-images"]'), null, "Another session's uploaded image stays out of this draft");
	assert.equal((await upload("mobile_conversation")).status, 201);
	await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 1, "Image arrival does not submit a tutor turn");
	await page.click('[aria-label="Open handwritten working 1"]');
	await page.waitForSelector('[data-testid="shared-writing-viewer"]');
	await page.click('[aria-label="Close handwritten working"]');
	await page.click(mic); await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("With the reviewed image."));
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Final image explanation."); window.speech.close(); });
	await page.waitForFunction(() => !document.querySelector('.lh-shared-writing [data-testid="shared-writing-images"]'));
	const withImage = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(withImage.messages.filter(m => m.sharedWriting?.length).length, 1, "Deliberate Send persists the reviewed image once");
	assert.ok(withImage.messages.some(m => m.writingSubmission && JSON.stringify(m.content).includes("Final image explanation.")), "Image-bearing conversation uses receipt and finalized speech");
	assert.ok(!await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /Attach handwriting|Choose from app|Take photo/.test(e.textContent))), "Deferred image actions are not advertised");
	await page.goto(`${origin}/chat/mobile_teaching`, { waitUntil: "networkidle2" });
	const reading = '[data-testid="reading-thinking-field"] textarea';
	await page.waitForSelector('[data-testid="teach-check-reveal"]', { visible: true });
	assert.ok(await page.$('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]'), "Before reveal, the reading input owns the in-field microphone");
	await fill(reading, "Reading thought.");
	await page.click('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]');
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("Before reveal."));
	await page.click('[data-testid="teach-check-reveal"]');
	await page.waitForFunction(() => window.speech.finishing);
	assert.ok(await page.$('[data-testid="teach-check-reveal"]'), "Reveal waits for final speech");
	await page.evaluate(() => { window.speech.final("Late reading thought."); window.speech.close(); });
	await page.waitForSelector('[data-testid="teach-check-reveal"]', { hidden: true });
	assert.equal(await page.$eval(reading, e => e.value), "Reading thought. Before reveal. Late reading thought.");
	const answer = '[data-testid="answer-field"] textarea';
	assert.equal(await page.$eval(answer, e => e.value), "", "Reading speech is separate from the newly revealed answer");
	assert.equal(await page.$eval('[data-testid="question-dock"] button[type="submit"]', e => e.disabled), true, "Empty text questions keep their existing submit gate");
	assert.equal(await page.$('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]'), null, "Secondary reading input must not imply that it owns speech after reveal");
	await checkPhoneInput(answer);
	await fill(answer, "Answer draft.");
	// Wheel the actual history rather than invoking the dock's state machine.
	const historyPoint = await page.evaluate(() => {
		const log = document.querySelector('[role="log"]');
		const scroll = [...log.querySelectorAll('div')].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY));
		const r = scroll.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 };
	});
	await new Promise(resolve => setTimeout(resolve, 2100)); // inherited reveal-scroll suppression window
	await page.mouse.move(historyPoint.x, historyPoint.y);
	for (let step = 0; step < 4; step++) {
		await page.mouse.wheel({ deltaY: -180 });
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	await page.waitForSelector('[data-testid="question-dock-bar"]', { visible: true });
	assert.ok(await page.$eval(answer, e => e.checkVisibility()), "A revealed question keeps its answer input visible when history scrolling collapses the question");
	assert.equal(await page.$eval(answer, e => e.value), "Answer draft.");
	await page.click('[data-testid="question-dock-bar"]');
	await page.waitForSelector('[data-testid="question-dock-bar"]', { hidden: true });
	await upload("mobile_teaching"); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	await page.click('[data-testid="answer-field"] [aria-label="Start dictation"]');
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.evaluate(() => window.speech.final("Spoken answer."));
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => window.speech.close());
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const answered = await (await fetch(`${origin}/api/chats/mobile_teaching`)).json();
	const answerRecord = answered.messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(answerRecord).includes("Answer draft. Spoken answer."));
	assert.ok(JSON.stringify(answerRecord).includes("Reading thought. Before reveal. Late reading thought."));
	assert.ok(answerRecord.writingSubmission && answerRecord.sharedWriting.length === 1, "Actual free-text adapter carries receipt and image");
	await page.goto(`${origin}/chat/mobile_selection`, { waitUntil: "networkidle2" });
	await page.click('[data-testid="reading-thinking-field"] [data-testid="teach-check-reveal"]');
	await page.waitForSelector('[data-testid="thinking-field"] textarea', { visible: true });
	await page.locator('[role="radio"]').filter(button => button.textContent.includes("Halve the area")).click();
	await fill('[data-testid="thinking-field"] textarea', "The force stays the same.");
	assert.ok(await page.$('[data-testid="confidence-slider"]'), "Selection questions retain confidence");
	await page.click('.lh-phone-plan');
	await page.waitForSelector('[data-testid="plan-popup"]');
	await page.keyboard.press("Escape");
	assert.equal(await page.$eval('[data-testid="thinking-field"] textarea', e => e.value), "The force stays the same.", "Real Plan dismissal preserves the question draft");
	await upload("mobile_selection"); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const selected = await (await fetch(`${origin}/api/chats/mobile_selection`)).json();
	const selectionRecord = selected.messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(selectionRecord).includes("The force stays the same."));
	assert.equal(selectionRecord.details.confidence, 50, "Untouched confidence retains its existing meaning");
	assert.ok(selectionRecord.writingSubmission && selectionRecord.sharedWriting.length === 1);
	await page.goto(`${origin}/chat/mobile_other_answer`, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="other-option"] input');
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await fill('[data-testid="other-option"] input', "Compare both areas.");
	await fill('[data-testid="thinking-field"] textarea', "My custom reasoning.");
	await upload("mobile_other_answer"); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const otherRecord = (await (await fetch(`${origin}/api/chats/mobile_other_answer`)).json()).messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(otherRecord).includes("Compare both areas.") && JSON.stringify(otherRecord).includes("Start with force") && JSON.stringify(otherRecord).includes("My custom reasoning."), "Multi-select, Other and thinking survive the real answer contract together");
	assert.ok(otherRecord.writingSubmission && otherRecord.sharedWriting.length === 1);
	for (const id of ["mobile_practice", "mobile_drill"]) {
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		const thinking = '[data-testid="practice-thinking-field"] textarea';
		await page.waitForSelector(thinking, { visible: true });
		assert.ok(await page.$('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]'), "Practice/drill thinking owns the same in-field microphone");
		await checkPhoneInput(thinking);
		await fill(thinking, "100 divided by 2.");
		await upload(id); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
		await page.locator('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]').click();
		await page.waitForFunction(() => window.speech?.readyState === 1);
		await page.evaluate(() => window.speech.final("So pressure is 50 Pa."));
		await page.click('[data-testid="practice-send"]');
		await page.waitForFunction(() => window.speech.finishing);
		await page.evaluate(() => { window.speech.final("Late reasoning."); window.speech.close(); });
		await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
		const record = await (await fetch(`${origin}/api/chats/${id}`)).json();
		assert.ok(JSON.stringify(record.messages).includes("100 divided by 2. So pressure is 50 Pa. Late reasoning."), "Practice/drill Submit finishes late speech without needing Stop first");
		assert.ok(record.messages.some(message => message.writingSubmission && message.sharedWriting?.length === 1));
	}
	await checkHandwritingTransfers({ page, origin, transferFaults });
	await checkTransferDevice({ page, origin });
	await page.goto(`${origin}/chat/mobile_teaching`, { waitUntil: "networkidle2" });
	await fill(input, longDraft);
	await page.waitForFunction(() => getComputedStyle(document.body).position === "fixed");
	await page.evaluate(() => {
		const log = document.querySelector('[role="log"]');
		[...log.querySelectorAll('div')].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY)).dataset.smokeHistory = "true";
	});
	const gesture = (selector, position, delta, fingers = 1) => page.evaluate(({ selector, position, delta, fingers }) => {
		const element = document.querySelector(selector);
		element.scrollTop = position === "bottom" ? element.scrollHeight : position === "middle" ? 80 : 0;
		const r = element.getBoundingClientRect();
		const touches = offset => Array.from({ length: fingers }, (_, id) => new Touch({ identifier: id, target: element, clientX: r.left + 20 + id * 25, clientY: r.top + 20 + offset }));
		element.dispatchEvent(new TouchEvent("touchstart", { touches: touches(0), bubbles: true }));
		const event = new TouchEvent("touchmove", { touches: touches(delta), bubbles: true, cancelable: true });
		element.dispatchEvent(event);
		element.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
		return event.defaultPrevented;
	}, { selector, position, delta, fingers });
	for (const selector of [input, '[data-smoke-history="true"]']) {
		assert.equal(await gesture(selector, "top", 30), true, "Top-edge gestures stay contained");
		assert.equal(await gesture(selector, "bottom", -30), true, "Bottom-edge gestures stay contained");
		assert.equal(await gesture(selector, "middle", -30), false, "Interior gestures keep native scrolling");
	}
	assert.equal(await gesture('[data-testid="composer"]', "top", 30), true, "Composer gestures do not move the surrounding page");
	assert.equal(await gesture('button[aria-label="Open sidebar"]', "top", 30), true, "Header gestures do not move the surrounding page");
	assert.equal(await gesture(input, "middle", -30, 2), false, "Pinch gestures are not cancelled");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await page.locator(mic).click();
	await page.waitForFunction(() => window.speech?.readyState === 1);
	assert.match(await page.$eval('.lh-compact-recording [role="status"]', e => e.textContent), /Recording/, "Recording status is available without animation");
	await page.click('[aria-label="Cancel dictation"]');
	await page.focus(input);
	// Changing isMobile forces a Chromium reload; resize only to exercise the
	// actual responsive transition and preserve the same mounted page/draft.
	await page.setViewport({ width: 1100, height: 800, isMobile: true, hasTouch: true });
	await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
	assert.equal(await page.$eval(input, e => e.value), longDraft, "Wide-layout transition releases the focus lock without losing the draft");
	assert.ok(await page.$eval('[data-testid="dictation-toggle"]', e => e.checkVisibility()), "Wide layouts retain their original dictation strip");
	assert.equal(await page.$eval(mic, e => e.checkVisibility()), false, "Compact microphone stays phone-only");
	assert.deepEqual(errors, [], "No browser runtime errors");
	console.log("PASS: conversation, reading/reveal, free-text/selection/Other answers, practice/drills, real persisted submissions, speech recovery, image review, panels, phone geometry and focus/gesture containment.");
} catch (error) {
	if (browser) {
		const page = (await browser.pages()).at(-1);
		await page.screenshot({ path: path.join(dir, "failure.png") });
		await writeFile(path.join(dir, "failure.txt"), await page.evaluate(() => document.body.innerText));
	}
	await writeFile(path.join(dir, "server.log"), log);
	console.error(`Browser artifacts: ${dir}`);
	throw error;
} finally {
	await browser?.close();
	server.kill("SIGTERM");
	if (server.exitCode === null) await once(server, "exit");
}
