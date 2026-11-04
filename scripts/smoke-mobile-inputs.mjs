/** Real UI, disposable storage, scripted tutor/speech. Physical iOS is separate.
 * Run: node scripts/smoke-mobile-inputs.mjs (no learner data or preview slots used).
 */
import assert from "node:assert/strict";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import puppeteer from "puppeteer-core";

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
await writeFile(path.join(dir, "auth.json"), "{}\n", { mode: 0o600 });
const now = new Date().toISOString();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content, id = "assistant") => ({ role: "assistant", content, id, api: "openai-completions", provider: "openrouter", model: "z-ai/glm-5.3-flash", usage, stopReason: "stop", timestamp: Date.now() });
const conversation = { id: "mobile_conversation", title: "Mobile browser conversation", createdAt: now, updatedAt: now, messages: [assistant([{ type: "text", text: "Explain how pressure changes with area." }])] };
await writeFile(path.join(dir, "data/chats/mobile_conversation.json"), JSON.stringify(conversation));
await writeFile(path.join(dir, "data/chats/mobile_other.json"), JSON.stringify({ ...conversation, id: "mobile_other", title: "Other isolated session" }));
const call = (name, args, id) => assistant([{ type: "toolCall", name, arguments: args, id }], `assistant_${id}`);
const result = (name, details, id) => ({ role: "toolResult", toolName: name, toolCallId: id, id: `result_${id}`, content: [{ type: "text", text: "Ready." }], details, isError: false, timestamp: Date.now() });
const teaching = [
	call("probe_done", { summary: "Ready for pressure." }, "probe_done"), result("probe_done", { ok: true }, "probe_done"),
	call("plan_create", {}, "plan"), result("plan_create", { tree: { nodes: [{ id: "pressure", title: "Pressure and area", description: "Relate force, area and pressure." }], edges: [] } }, "plan"),
	assistant([{ type: "text", text: Array(25).fill("Pressure relates force to the area over which it acts. Consider the same force on two different areas.").join("\n\n") }], "lesson"),
];
await writeFile(path.join(dir, "data/chats/mobile_panels.json"), JSON.stringify({ ...conversation, id: "mobile_panels", title: "Conversation with plan and usage", messages: teaching, turns: Array.from({ length: 24 }, (_, i) => ({ id: `usage_${i}`, messageId: "lesson", at: now, model: "openrouter:z-ai/glm-5.3-flash", steps: [{ inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }] })) }));
for (const [id, tool, question] of [
	["mobile_teaching", "explain", { question: "Explain pressure and area.", correctAnswer: "Pressure is force divided by area.", nodeId: "pressure", type: "check" }],
	["mobile_selection", "quiz", { question: "Which change doubles pressure?", options: [{ label: "Halve the area", value: "half" }, { label: "Double the area", value: "double" }], correctAnswer: "half", explanation: "The same force over half the area doubles pressure.", nodeId: "pressure", type: "check" }],
]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id, title: id, messages: [...teaching, call(tool, question, "question")] }));
await writeFile(path.join(dir, "data/chats/mobile_other_answer.json"), JSON.stringify({ ...conversation, id: "mobile_other_answer", title: "Other answer fixture", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
const problem = { statement: "Calculate pressure for a 100 N force on 2 square metres.", mode: "apply", target: ["pressure"], modelSolution: "50 Pa." };
for (const id of ["mobile_practice", "mobile_drill"]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id, title: id, kind: "practice", ...(id === "mobile_drill" ? { practiceMode: "drill" } : {}), messages: [teaching[4], call("problem", problem, "problem"), result("problem", null, "problem")] }));
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
// Fault injection only in the disposable route: retain the real event handler
// and native browser EventSource, but let the second client cut the transport.
await writeFile(path.join(dir, "app/api/events/route.ts"), `
import { eventsResponse } from "@/src/server";
export const dynamic = "force-dynamic";
let blocked = false;
const connections = new Set<() => void>();
export async function POST(req: Request) {
 blocked = (await req.json()).blocked;
 if (blocked) for (const close of connections) close();
 return Response.json({ blocked });
}
export function GET() {
 if (blocked) return new Response("Test notification outage", { status: 503 });
 const response = eventsResponse();
 const reader = response.body!.getReader();
 let closed = false;
 let close: () => void;
 return new Response(new ReadableStream({
  start(controller) {
   close = () => { if (closed) return; closed = true; connections.delete(close); controller.close(); void reader.cancel(); };
   connections.add(close);
  },
  async pull(controller) {
   const chunk = await reader.read();
   if (closed) return;
   if (chunk.done) close(); else controller.enqueue(chunk.value);
  },
  cancel() { closed = true; connections.delete(close); return reader.cancel(); },
 }), { headers: response.headers });
}
`);
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
	let missingSpeechKey = false;
	page.on("request", request => {
		if (new URL(request.url()).pathname === "/api/stt/token") void request.respond({ status: missingSpeechKey ? 503 : 200, contentType: "application/json", body: JSON.stringify(missingSpeechKey ? { error: "Missing Deepgram key" } : { token: "browser-test-token" }) });
		else void request.continue();
	});
	await page.evaluateOnNewDocument(() => {
		if (window !== window.top) return;
		localStorage.setItem("lh:sidebar-open", "0");
		// Keep the real graph/worklet/audio. Only emulate Safari's paused state
		// between runs; a resumed graph must produce actual PCM again.
		const NativeAudioContext = window.AudioContext;
		window.AudioContext = class extends NativeAudioContext {
			constructor(options) { super(options); window.captureContext = this; }
			get state() { return this.interrupted ? "interrupted" : super.state; }
			async resume() { this.interrupted = false; return super.resume(); }
		};
		const NativeEventSource = window.EventSource;
		window.notificationOpens = 0;
		window.EventSource = class extends NativeEventSource {
			constructor(...args) {
				super(...args);
				window.notifications = this;
				this.addEventListener("open", () => window.notificationOpens++);
			}
		};
		const NativeSocket = window.WebSocket;
		const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getUserMedia = async constraints => {
			if (window.denyMicrophone) throw new DOMException("Test permission denied", "NotAllowedError");
			if (window.holdPermission) await new Promise(resolve => { window.releasePermission = resolve; });
			const stream = await getUserMedia(constraints);
			window.captureTracks = stream.getTracks();
			return stream;
		};
		window.WebSocket = class extends EventTarget {
			static OPEN = 1;
			static CONNECTING = 0;
			readyState = 0;
			frames = 0;
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				window.speech = this;
				queueMicrotask(() => { if (!window.holdConnection) this.open(); });
			}
			open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
			send(value) {
				if (typeof value !== "string") { this.frames++; return; }
				if (JSON.parse(value).type === "CloseStream") this.finishing = true;
			}
			final(text) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript: text }] } }) })); }
			close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code: 1000 })); }
		};
	});
	await page.goto(`${origin}/chat/mobile_conversation`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector('[data-testid="composer"] textarea');
	const assertMicSpace = async selector => {
		const separate = await page.$eval(selector, e => {
			const editor = e.getBoundingClientRect();
			const mic = e.parentElement.querySelector('[aria-label="Start dictation"]').getBoundingClientRect();
			return editor.right <= mic.left;
		});
		assert.ok(separate, "Empty placeholder and typed text have their own space before the microphone target");
	};
	await assertMicSpace('[data-testid="composer"] textarea');
	const fill = async (selector, text) => {
		await page.focus(selector);
		await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
		await page.keyboard.sendCharacter(text);
	};
	const checkPhoneInput = async fieldSelector => {
		const selector = `${fieldSelector} textarea`;
		for (const width of [320, 375, 430]) {
			await page.setViewport({ width, height: 550, isMobile: true, hasTouch: true });
			await fill(selector, "A substantial explanation.\n".repeat(16));
			await hitTargets([`${fieldSelector} .lh-compact-field button`], `In-field controls fit and receive taps at ${width}px`, true);
		}
		await page.setViewport({ width: 375, height: 350, isMobile: true, hasTouch: true });
		await page.$eval(selector, e => e.focus());
		await page.waitForFunction(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= 0 && r.bottom <= 350; }, {}, selector);
		assert.ok(await page.$eval(selector, e => e.scrollHeight > e.clientHeight), "Long draft scrolls internally in a keyboard-sized viewport");
		await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	};
	const scrollBack = async () => {
		const point = await page.evaluate(() => {
			const log = document.querySelector('[role="log"]');
			const scroll = [...log.querySelectorAll('div')].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY));
			const r = scroll.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 };
		});
		await new Promise(resolve => setTimeout(resolve, 2100)); // inherited reveal-scroll suppression
		await page.mouse.move(point.x, point.y);
		for (let step = 0; step < 4; step++) {
			await page.mouse.wheel({ deltaY: -180 });
			await new Promise(resolve => setTimeout(resolve, 100));
		}
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
	const hitTargets = async (selectors, label, allMatches = false) => {
		const targets = await page.evaluate(({ selectors, allMatches }) => selectors.flatMap(selector => {
			const buttons = allMatches ? [...document.querySelectorAll(selector)] : [document.querySelector(selector)].filter(Boolean);
			if (!buttons.length) return [{ selector, missing: true }];
			return buttons.map(button => {
				const r = button.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return { selector, width: r.width, height: r.height, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: button === hit || button.contains(hit) };
			});
		}), { selectors, allMatches });
		assert.ok(targets.length && targets.every(r => r.width >= 44 && r.height >= 44 && r.fits && r.hit), `${label}: ${JSON.stringify(targets)}`);
	};
	const send = '[data-testid="composer"] [aria-label="Send"]';
	for (const width of [320, 375, 430]) for (const height of [550, 350]) for (const enlarged of [false, true]) {
		await page.setViewport({ width, height, isMobile: true, hasTouch: true });
		const textStyle = await page.addStyleTag({ content: enlarged ? 'html { font-size: 125% !important; } [data-testid="composer"] textarea { font-size: 24px !important; }' : '/* normal text */' });
		await fill(input, longDraft);
		await page.waitForFunction(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, {}, input);
		assert.ok(await page.$eval(input, e => e.scrollHeight > e.clientHeight), "Long conversation draft scrolls internally");
		const label = `${width}×${height}, ${enlarged ? "enlarged" : "normal"} text`;
		await hitTargets([mic, send], `Idle ${label}`);
		const grown = await page.$eval(input, e => e.getBoundingClientRect().height);
		await page.click(mic);
		await page.waitForFunction(() => window.speech?.readyState === 1);
		await page.waitForSelector('[aria-label="Cancel dictation"]');
		await hitTargets(['[aria-label="Cancel dictation"]', '[aria-label="Stop dictation"]', send], `Recording ${label}`);
		assert.equal(await page.$eval(input, e => e.getBoundingClientRect().height), grown, `Stable grown field ${label}`);
		await page.click('[aria-label="Stop dictation"]');
		await page.waitForFunction(() => window.speech.finishing);
		await hitTargets(['[aria-label="Cancel dictation"]', '[aria-label="Stop dictation"]', send], `Finalizing ${label}`);
		assert.match(await page.$eval('.lh-compact-recording [role="status"]', e => e.textContent), /Finishing/);
		await page.click('[aria-label="Cancel dictation"]');
		assert.equal(await page.$eval(input, e => e.value), longDraft, `Draft retained ${label}`);
		await textStyle.evaluate(e => e.remove());
		await textStyle.dispose();
		console.log(`PASS: conversation geometry ${label}`);
	}
	await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	await fill(input, longDraft);
	const beforeCapture = await page.$eval(input, field => {
		field.setSelectionRange(8, 20); field.scrollTop = 70;
		return { height: field.getBoundingClientRect().height, scroll: field.scrollTop };
	});
	await page.click(mic);
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.waitForSelector('[aria-label="Cancel dictation"]');
	assert.equal(await page.$eval(input, e => e.getBoundingClientRect().height), beforeCapture.height, "Recording preserves the grown editor height");
	await page.waitForFunction(() => [...document.querySelectorAll('.lh-compact-meter > span')].some(e => e.getBoundingClientRect().height > 2));
	await page.waitForFunction(() => { const time = document.querySelector('.lh-compact-timer')?.textContent; return !!time && time !== "0:00"; });
	assert.match(await page.$eval('.lh-compact-recording [role="status"]', e => e.textContent), /Recording/);
	await page.evaluate(() => window.speech.final("Discard this capture."));
	await page.click('[aria-label="Stop dictation"]');
	await page.waitForFunction(() => window.speech.finishing);
	assert.ok(await page.evaluate(() => window.captureTracks.every(track => track.readyState === "ended")), "Stop ends microphone capture before waiting for finals");
	await page.click('[aria-label="Cancel dictation"]');
	await page.evaluate(() => window.speech.final("Late cancelled words."));
	assert.deepEqual(await page.$eval(input, e => ({ value: e.value, start: e.selectionStart, end: e.selectionEnd, scroll: e.scrollTop })), { value: longDraft, start: 8, end: 20, scroll: beforeCapture.scroll }, "Cancel during finalization restores earlier draft, selection and internal scroll");
	await fill(input, "Review before sending.");
	await page.click(mic);
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.evaluate(() => window.speech.final("Spoken working."));
	await page.click('[aria-label="Stop dictation"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Final reviewed words."); window.speech.close(); });
	await page.waitForSelector(mic);
	assert.equal(await page.$eval(input, e => e.value), "Review before sending. Spoken working. Final reviewed words.", "Stop appends early and late finals once into the editable conversation draft");
	await page.evaluate(() => { window.speech.final("After close."); window.speech.close(); });
	assert.equal(await page.$eval(input, e => e.value), "Review before sending. Spoken working. Final reviewed words.");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 0, "Dictation Stop does not submit or start a tutor turn");
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
	// Empty conversation drafts retain the inherited active-dictation Send gate.
	await fill(input, "");
	assert.equal(await page.$eval(send, e => e.disabled), true);
	await page.click(mic);
	await page.waitForFunction(() => window.speech.readyState === 1);
	assert.equal(await page.$eval(send, e => e.disabled), false, "Active speech enables Send before any text is flushed");
	await page.evaluate(() => window.speech.final("Speech only."));
	await page.click(send);
	await page.waitForFunction(() => window.speech.finishing);
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 1, "Send waits for speech finalization before submitting");
	await page.evaluate(() => { window.speech.final("Final words."); window.speech.close(); });
	await page.waitForFunction(() => document.body.textContent.includes("Speech only. Final words."));
	await page.waitForSelector('[data-testid="composer"] [aria-label="Send"]');
	const spoken = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(spoken.messages.filter(m => m.role === "user" && JSON.stringify(m.content).includes("Speech only. Final words.")).length, 1);
	console.log("PASS: empty-draft active-dictation finish-before-send persists once");
	missingSpeechKey = true;
	await page.reload({ waitUntil: "networkidle2" }); // also discards the previous document's warm speech token
	await fill(input, "Settings recovery retains my draft.");
	await page.click(mic);
	await page.waitForSelector('.lh-compact-error');
	assert.match(await page.$eval('.lh-compact-error', e => e.textContent), /Dictation needs a Deepgram key.*Settings/);
	await page.click('.lh-compact-error button');
	await page.waitForSelector('[data-testid="settings-dialog"]');
	await page.waitForSelector('[data-testid="key-deepgram_api_key-input"]');
	await fill('[data-testid="key-deepgram_api_key-input"]', "scripted-speech-key-not-real");
	await page.click('[data-testid="key-deepgram_api_key-save"]');
	await page.waitForSelector('[data-testid="key-deepgram_api_key-input"]', { hidden: true });
	missingSpeechKey = false;
	await page.click('[data-testid="settings-close"]');
	assert.equal(await page.$eval(input, e => e.value), "Settings recovery retains my draft.");
	await page.click(mic);
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.click('[aria-label="Cancel dictation"]');
	console.log("PASS: missing-key Settings round trip and subsequent capture");
	const navigateSession = async title => {
		await page.click('button[aria-label="Open sidebar"]');
		await page.waitForSelector('[data-testid="session-search"]', { visible: true });
		await fill('[data-testid="session-search"]', title);
		const row = await page.waitForFunction(title => [...document.querySelectorAll('[data-testid="session-list"] button')].find(e => e.textContent.includes(title)), {}, title);
		await row.asElement().click();
		await row.dispose();
		await page.waitForSelector(input, { visible: true });
	};
	for (const phase of ["permission", "connecting", "recording", "finishing"]) {
		console.log(`CHECK: navigation during ${phase}`);
		await fill(input, "Original session draft.");
		await page.evaluate(phase => { window.holdPermission = phase === "permission"; window.holdConnection = phase === "connecting"; window.speech = null; window.captureTracks = null; }, phase);
		await page.click(mic);
		if (phase === "permission") await page.waitForFunction(() => typeof window.releasePermission === "function");
		else {
			await page.waitForFunction(phase => window.speech?.readyState === (phase === "connecting" ? 0 : 1), {}, phase);
			if (phase !== "connecting") await page.evaluate(() => window.speech.final("Abandoned words."));
			if (phase === "finishing") {
				await page.click('[aria-label="Stop dictation"]');
				await page.waitForFunction(() => window.speech.finishing);
			}
		}
		await navigateSession("Other isolated session");
		await page.waitForFunction(() => location.pathname.endsWith("mobile_other"));
		await fill(input, "Destination draft.");
		if (phase === "permission") {
			await page.evaluate(() => window.releasePermission());
			await page.waitForFunction(() => window.captureTracks?.every(track => track.readyState === "ended"));
		} else {
			assert.ok(await page.evaluate(() => window.captureTracks.every(track => track.readyState === "ended")), `Navigation ends capture during ${phase}`);
			await page.evaluate(() => { window.speech.open(); window.speech.final("Late abandoned words."); window.speech.close(); });
		}
		assert.equal(await page.$eval(input, e => e.value), "Destination draft.", `Late ${phase} result cannot enter the new session`);
		assert.equal((await (await fetch(`${origin}/api/chats/mobile_other`)).json()).messages.filter(m => m.role === "user").length, 0);
		await page.evaluate(() => { window.holdPermission = false; window.holdConnection = false; });
		await navigateSession("Mobile browser conversation");
		await page.waitForFunction(() => location.pathname.endsWith("mobile_conversation"));
		console.log(`PASS: navigation cancels ${phase} without cross-session leakage`);
	}
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
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 2, "Image arrival does not submit a tutor turn");
	const previews = '.lh-shared-writing [data-testid="shared-writing-images"] button';
	const notifications = async blocked => assert.equal((await fetch(`${origin}/api/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked }) })).status, 200);
	const opens = await page.evaluate(() => window.notificationOpens);
	await notifications(true);
	await page.waitForFunction(() => window.notifications.readyState !== EventSource.OPEN, { polling: 100 });
	assert.equal((await upload("mobile_conversation")).status, 201);
	assert.equal((await page.$$(previews)).length, 1, "Disconnected browser genuinely missed the second arrival");
	await notifications(false);
	await page.waitForFunction(previous => window.notificationOpens > previous, {}, opens);
	await page.waitForFunction(selector => document.querySelectorAll(selector).length === 2, {}, previews);
	console.log("PASS: real EventSource reconnect recovers missed upload without manual refresh");
	// Keep notifications unavailable on return so this recovery must come from
	// the browser's actual foreground/focus events rather than an SSE reopen.
	const otherTab = await browser.newPage();
	await otherTab.bringToFront();
	await page.waitForFunction(() => document.hidden, { polling: 100 });
	await notifications(true);
	await page.waitForFunction(() => window.notifications.readyState !== EventSource.OPEN, { polling: 100 });
	assert.equal((await upload("mobile_conversation")).status, 201);
	assert.equal((await page.$$(previews)).length, 2, "Background browser missed the third arrival");
	const foregroundRefresh = page.waitForResponse(response => new URL(response.url()).pathname === "/api/chats/mobile_conversation/writing" && response.ok());
	await page.bringToFront();
	await foregroundRefresh;
	await page.waitForFunction(selector => document.querySelectorAll(selector).length === 3, {}, previews);
	assert.notEqual(await page.evaluate(() => window.notifications.readyState), 1, "Foreground recovery works while notifications are still unavailable");
	await notifications(false);
	await otherTab.close();
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 2, "Reconnect and foreground recovery do not submit tutor turns");
	console.log("PASS: real tab foreground recovers missed upload independently of notifications");
	await page.click('[aria-label="Open handwritten working 1"]');
	await page.waitForSelector('[data-testid="shared-writing-viewer"]');
	await page.click('[aria-label="Close handwritten working"]');
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => !document.querySelector('.lh-shared-writing [data-testid="shared-writing-images"]'));
	const withImage = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(withImage.messages.filter(m => m.sharedWriting?.length).length, 1, "Deliberate Send persists the reviewed image once");
	assert.equal(withImage.messages.find(m => m.sharedWriting?.length).sharedWriting.length, 3, "Deliberate Send includes all three recovered pending images");
	assert.ok(!await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /Attach handwriting|Choose from app|Take photo/.test(e.textContent))), "Deferred image actions are not advertised");
	await page.goto(`${origin}/chat/mobile_panels`, { waitUntil: "networkidle2" });
	await page.waitForSelector(input);
	const catalog = await (await fetch(`${origin}/api/models`)).json();
	const longModel = catalog.models.filter(m => m.supportedLevels.length > 1).sort((a, b) => b.name.length - a.name.length)[0];
	assert.ok(longModel, "Installed catalog supplies a long-label model with thinking options");
	const fitPanel = async selector => {
		const bounds = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
		assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, `${selector} fits: ${JSON.stringify(bounds)}`);
	};
	const history = '[data-smoke-panel-history="true"]';
	await page.evaluate(() => {
		const log = document.querySelector('[role="log"]');
		[...log.querySelectorAll('div')].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY)).dataset.smokePanelHistory = "true";
	});
	const scrollHistoryBack = async () => {
		const point = await page.$eval(history, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 30 }; });
		await page.mouse.move(point.x, point.y);
		await page.mouse.wheel({ deltaY: -300 });
		await page.waitForFunction(selector => { const e = document.querySelector(selector); return e.scrollTop < e.scrollHeight - e.clientHeight - 80; }, {}, history);
		return page.$eval(history, async e => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return e.scrollTop; });
	};
	for (const width of [320, 375, 430]) {
		await page.setViewport({ width, height: 350, isMobile: true, hasTouch: true });
		await fill(input, "Panel review keeps my draft and reading position.");
		await page.waitForFunction(() => getComputedStyle(document.body).position === "fixed");
		const readingPosition = await scrollHistoryBack();
		const assertReading = async label => assert.ok(Math.abs(await page.$eval(history, e => e.scrollTop) - readingPosition) <= 1, `${label}: reading position ${readingPosition} → ${await page.$eval(history, e => e.scrollTop)}`);
		assert.ok(readingPosition > 0, "Panel review starts partway through scrollable history");
		await page.click('[data-testid="stats-model"]');
		await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
		await fitPanel('[data-testid="model-menu"]');
		await page.waitForFunction(count => document.querySelectorAll('[data-testid="model-list"] button').length === count, {}, catalog.models.length);
		await fill('[data-testid="model-search"]', longModel.id);
		const modelRow = `[data-testid="model-option-${longModel.id.replace(/[^a-z0-9-]/gi, "_")}"]`;
		await page.waitForSelector(modelRow);
		assert.ok((await page.$eval(modelRow, e => e.textContent)).includes(longModel.name), "Long model label and identity retained in the real menu");
		await page.$eval(modelRow, e => e.scrollIntoView({ block: "nearest" }));
		await fitPanel('[data-testid="model-menu"]');
		const pickedModel = page.waitForResponse(r => new URL(r.url()).pathname === "/api/chats/mobile_panels/settings" && r.request().method() === "PUT" && r.ok());
		await page.click(modelRow);
		await pickedModel;
		await page.waitForSelector('[data-testid="model-menu"]', { hidden: true });
		await assertReading("Model selection");
		await page.click('[data-testid="stats-thinking"]');
		await page.waitForSelector('[data-testid="thinking-menu"]', { visible: true });
		await fitPanel('[data-testid="thinking-menu"]');
		assert.deepEqual(await page.$$eval('[data-testid="thinking-menu"] button', buttons => buttons.map(e => e.querySelector('span').textContent)), longModel.supportedLevels, "Every supported thinking level is retained");
		const level = longModel.supportedLevels.at(-1);
		const pickedLevel = page.waitForResponse(r => new URL(r.url()).pathname === "/api/chats/mobile_panels/settings" && r.request().method() === "PUT" && r.ok());
		await page.locator(`[data-testid="thinking-option-${level}"]`).click();
		await pickedLevel;
		const settings = (await (await fetch(`${origin}/api/chats/mobile_panels`)).json()).settings;
		assert.equal(settings.model.id, longModel.id);
		assert.equal(settings.thinkingLevel, level, "Real model/thinking choices persist through the session API");
		await assertReading("Thinking selection");
		await page.focus(input);
		await page.click('[data-testid="stats-summary"]');
		await page.waitForSelector('[data-testid="stats-detail"]');
		await fitPanel('[data-testid="stats-detail"]');
		assert.equal((await page.$$('[data-testid="stats-detail"] li')).length, 24, "Usage retains every turn");
		await page.$eval('[data-testid="stats-detail"] li:last-child', e => e.scrollIntoView({ block: "nearest" }));
		const lastUsageVisible = await page.$eval('[data-testid="stats-detail"] li:last-child', e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e.contains(hit) && r.bottom <= innerHeight; });
		assert.ok(lastUsageVisible, "Usage's overflowed final turn is reachable and visible");
		await page.keyboard.press("Escape");
		await assertReading("Usage dismissal");
		await page.focus(input);
		await page.click('.lh-phone-plan');
		await page.waitForSelector('[data-testid="plan-popup"]');
		await fitPanel('[data-testid="plan-popup"]');
		assert.match(await page.$eval('[data-testid="plan-popup"]', e => e.textContent), /Pressure and area/);
		await page.click('[data-testid="plan-popup-fit"]');
		await page.keyboard.press("Escape");
		assert.equal(await page.$eval(input, e => e.value), "Panel review keeps my draft and reading position.");
		await assertReading("Plan dismissal");
		await page.$eval(input, e => e.blur());
		await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
		console.log(`PASS: complete Model/Thinking/Usage/Plan capabilities and focus release at ${width}×350`);
	}
	// Native image modal must retain its own background lock after input blur.
	await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	assert.equal((await upload("mobile_panels")).status, 201);
	await page.waitForSelector('.lh-shared-writing [aria-label="Open handwritten working 1"]');
	await fill(input, "Image review retains this unsent draft.");
	const imageReadingPosition = await scrollHistoryBack();
	await page.click('.lh-shared-writing [aria-label="Open handwritten working 1"]');
	await page.waitForSelector('[data-testid="shared-writing-viewer"]');
	await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
	assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden", "Image modal keeps its background lock after the focus lock releases");
	assert.ok(await page.$eval('[data-testid="shared-writing-viewer"]', e => e.matches(':modal') && e.contains(document.activeElement)), "Native image modal owns focus and makes the background inert");
	await page.keyboard.press("Escape");
	await page.waitForSelector('[data-testid="shared-writing-viewer"]', { hidden: true });
	assert.equal(await page.evaluate(() => document.body.style.overflow), "", "Image modal releases its own lock on dismissal");
	assert.equal(await page.$eval(input, e => e.value), "Image review retains this unsent draft.");
	assert.ok(Math.abs(await page.$eval(history, e => e.scrollTop) - imageReadingPosition) <= 1, "Image modal dismissal retains reading position");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_panels`)).json()).messages.filter(m => m.role === "user").length, 0, "Reviewing panels/images never submits a tutor turn");
	console.log("PASS: focused composer → native image modal → dismissal preserves draft/reading and lock ownership");
	await page.goto(`${origin}/chat/mobile_teaching`, { waitUntil: "networkidle2" });
	const reading = '[data-testid="reading-thinking-field"] textarea';
	await page.waitForSelector('[data-testid="teach-check-reveal"]', { visible: true });
	assert.ok(await page.$('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]'), "Before reveal, the reading input owns the in-field microphone");
	await assertMicSpace(reading);
	for (let run = 1; run <= 2; run++) {
		await page.locator('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]').click();
		await page.waitForFunction(() => window.speech?.readyState === 1);
		await page.waitForFunction(() => window.speech.frames >= 3, { timeout: 5000 });
		assert.equal(await page.evaluate(() => window.captureContext.state), "running", `Reading capture ${run} must run the actual audio graph`);
		await page.evaluate(n => window.speech.final(`Capture ${n}.`), run);
		await page.locator('[aria-label="Stop dictation"]').click();
		await page.waitForFunction(() => window.speech.finishing);
		await page.evaluate(() => window.speech.close());
		await page.waitForSelector('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]');
		if (run === 1) await page.evaluate(async () => { await window.captureContext.suspend(); window.captureContext.interrupted = true; });
	}
	assert.equal(await page.$eval(reading, e => e.value), "Capture 1. Capture 2.", "Restart after interrupted audio captures and appends a second recording once");
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
	await checkPhoneInput('[data-testid="answer-field"]');
	await fill(answer, "Answer draft.");
	// Wheel the actual history rather than invoking the dock's state machine.
	await scrollBack();
	await page.waitForSelector('[data-testid="question-dock-bar"]', { visible: true });
	assert.ok(await page.$eval(answer, e => e.checkVisibility()), "A revealed question keeps its answer input visible when history scrolling collapses the question");
	assert.equal(await page.$eval(answer, e => e.value), "Answer draft.");
	await page.click('[data-testid="question-dock-bar"]');
	await page.waitForSelector('[data-testid="question-dock-bar"]', { hidden: true });
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
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const selected = await (await fetch(`${origin}/api/chats/mobile_selection`)).json();
	const selectionRecord = selected.messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(selectionRecord).includes("The force stays the same."));
	assert.equal(selectionRecord.details.confidence, 50, "Untouched confidence retains its existing meaning");
	await page.goto(`${origin}/chat/mobile_other_answer`, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="other-option"] input');
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await fill('[data-testid="other-option"] input', "Compare both areas.");
	await fill('[data-testid="thinking-field"] textarea', "My custom reasoning.");
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const otherRecord = (await (await fetch(`${origin}/api/chats/mobile_other_answer`)).json()).messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(otherRecord).includes("Compare both areas.") && JSON.stringify(otherRecord).includes("Start with force") && JSON.stringify(otherRecord).includes("My custom reasoning."), "Multi-select, Other and thinking survive the real answer contract together");
	for (const id of ["mobile_practice", "mobile_drill"]) {
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		const thinking = '[data-testid="practice-thinking-field"] textarea';
		await page.waitForSelector(thinking, { visible: true });
		assert.ok(await page.$('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]'), "Practice/drill thinking owns the same in-field microphone");
		await checkPhoneInput('[data-testid="practice-thinking-field"]');
		await fill(thinking, "100 divided by 2.");
		await page.locator('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]').click();
		await page.waitForFunction(() => window.speech?.readyState === 1);
		await scrollBack();
		await page.waitForSelector('[data-testid="practice-dock-bar"]', { visible: true });
		assert.ok(await page.$('[data-testid="practice-thinking-field"] [aria-label="Cancel dictation"]'), "Collapsed practice retains compact recording controls");
		await page.waitForSelector('[data-testid="practice-thinking-field"] [aria-label="Cancel dictation"]', { visible: true });
		const elapsed = await page.$eval('.lh-compact-timer', e => e.textContent);
		await page.locator('[data-testid="practice-dock-bar"]').click();
		await page.waitForSelector('[data-testid="practice-dock-bar"]', { hidden: true });
		assert.ok(await page.$eval('.lh-compact-timer', (e, earlier) => e.textContent >= earlier, elapsed), "Reopening practice does not reset elapsed capture time");
		await scrollBack();
		await page.waitForSelector('[data-testid="practice-dock-bar"]', { visible: true });
		await page.evaluate(() => window.speech.final("Cancelled practice capture."));
		await page.locator('[aria-label="Cancel dictation"]').click();
		assert.equal(await page.$eval(thinking, e => e.value), "100 divided by 2.", "Cancel while collapsed retains the earlier practice draft");
		await page.evaluate(() => { window.denyMicrophone = true; });
		await page.locator('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]').click();
		await page.waitForSelector('.lh-compact-error', { visible: true });
		assert.match(await page.$eval('.lh-compact-error', e => e.textContent), /Microphone permission denied.*Retry/);
		await page.evaluate(() => { window.denyMicrophone = false; window.holdConnection = true; });
		await page.locator('.lh-compact-error button').click();
		await page.waitForFunction(() => window.speech?.readyState === 0);
		assert.match(await page.$eval('.lh-compact-recording [role="status"]', e => e.textContent), /Connecting/);
		await page.evaluate(() => { window.holdConnection = false; window.speech.open(); });
		await page.evaluate(() => window.speech.final("So pressure is 50 Pa."));
		await page.click('[aria-label="Stop dictation"]');
		await page.waitForFunction(() => window.speech.finishing);
		await page.evaluate(() => window.speech.close());
		assert.equal(await page.$eval(thinking, e => e.value), "100 divided by 2. So pressure is 50 Pa.");
		await page.click('[data-testid="practice-send"]');
		await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
		const record = await (await fetch(`${origin}/api/chats/${id}`)).json();
		assert.ok(JSON.stringify(record.messages).includes("100 divided by 2. So pressure is 50 Pa."), "Practice/drill uses its actual persisted thinking submission");
	}
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
