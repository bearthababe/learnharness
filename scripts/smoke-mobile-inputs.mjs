/** Real UI, disposable storage, scripted tutor/speech. Physical iOS is separate.
 * Run: node scripts/smoke-mobile-inputs.mjs (no learner data or preview slots used).
 */
import assert from "node:assert/strict";
import { cp, mkdir, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import puppeteer, { PUPPETEER_REVISIONS } from "puppeteer-core";
import { createRunDirectory, processScope, captureOutput, completed } from "./mobile-browser-runner.mjs";
import { sourceEntries, sourceFingerprint, reportBrowserEvent } from "./mobile-browser-result.mjs";
import { verifyNotebookMobile } from "./smoke-notebook-mobile.mjs";
import { verifyNotebookLayout } from "./smoke-notebook-layout.mjs";
import { checkHandwritingTransfers } from "./handwriting-transfer-checks.mjs";
import { checkTransferDevice } from "./handwriting-device-checks.mjs";
import { checkHandwritingMenus } from "./handwriting-menu-checks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await createRunDirectory();
console.log(`Disposable browser app: ${dir}`);
const executablePath = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";
console.log(`Browser: ${executablePath}\n${execFileSync(executablePath, ["--version"], { encoding: "utf8" }).trim()}\nPuppeteer-supported Chrome: ${PUPPETEER_REVISIONS.chrome}`);
for (const name of [...sourceEntries, "node_modules"]) {
	const source = name === "node_modules" ? await realpath(path.join(root, name)) : path.join(root, name);
	await cp(source, path.join(dir, name), { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
}
await reportBrowserEvent({ type: "fixture", directory: dir, sha256: await sourceFingerprint(dir) });
await mkdir(path.join(dir, "data/chats"), { recursive: true });
await writeFile(path.join(dir, "auth.json"), "{}\n", { mode: 0o600 });
const now = new Date().toISOString();
await mkdir(path.join(dir, "data/graph"), { recursive: true });
await writeFile(path.join(dir, "data/graph/nodes.jsonl"), ["pressure", "force", "area"].map(id => JSON.stringify({ id, name: id, statement: `Disposable ${id} graph node.`, aliases: [], createdAt: now, provenance: [] })).join("\n") + "\n");
await writeFile(path.join(dir, "data/graph/positions.json"), JSON.stringify({ positions: { pressure: { x: 0, y: 0 }, force: { x: 150, y: 120 }, area: { x: -150, y: 120 } } }));
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content, id = "assistant") => ({ role: "assistant", content, id, api: "openai-completions", provider: "openrouter", model: "z-ai/glm-5.3-flash", usage, stopReason: "stop", timestamp: Date.now() });
const conversation = { id: "mobile_conversation", title: "Mobile browser conversation", createdAt: now, updatedAt: now, messages: [assistant([{ type: "text", text: "Explain how pressure changes with area." }])] };
await writeFile(path.join(dir, "data/chats/mobile_conversation.json"), JSON.stringify(conversation));
await writeFile(path.join(dir, "data/chats/mobile_other.json"), JSON.stringify({ ...conversation, id: "mobile_other", title: "Other isolated session" }));
await writeFile(path.join(dir, "data/chats/mobile_notebook_close.json"), JSON.stringify({ ...conversation, id: "mobile_notebook_close", title: "Notebook close fixture" }));
await writeFile(path.join(dir, "data/chats/mobile_expressions.json"), JSON.stringify({ ...conversation, id: "mobile_expressions", title: "Expression references fixture",
	notebook: { revision: 1, visible: true, current: { id: "expressions-context", revision: 1, state: { lines: [{ id: "L1", latex: "p=F/A=2+2=" }, { id: "L2", latex: "2+2=5" }], undo: [] }, exchanges: [] }, notebookDraft: { id: "expressions-draft", revision: 0, text: "" }, nextSequence: 1, operations: [] },
}));
await writeFile(path.join(dir, "data/chats/mobile_layout.json"), JSON.stringify({ ...conversation, id: "mobile_layout", title: "Notebook layout fixture",
	messages: [assistant([{ type: "text", text: Array(35).fill("Explain how pressure changes with area. Keep your reasoning alongside your working.").join("\n\n") }])],
	notebook: { revision: 1, visible: true, current: { id: "layout-context", revision: 1, state: { lines: Array.from({ length: 40 }, (_, i) => ({ id: `L${i + 1}`, latex: `p_{${i + 1}}=F/A` })), undo: [] }, exchanges: [] }, notebookDraft: { id: "layout-draft", revision: 0, text: "Keep this equation instruction." }, nextSequence: 1, operations: [] },
}));
for (const id of ["mobile_notebook_menus", "mobile_remount_success", "mobile_remount_failure", "mobile_remount_lost-ack", "mobile_transfer_capture_attach", "mobile_transfer_capture_reopen", "mobile_transfer_capture_online", "mobile_transfer_unknown", "mobile_transfer_accepted", "mobile_transfer_resend", "mobile_transfer_race"]) await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id }));
const call = (name, args, id) => assistant([{ type: "toolCall", name, arguments: args, id }], `assistant_${id}`);
const result = (name, details, id) => ({ role: "toolResult", toolName: name, toolCallId: id, id: `result_${id}`, content: [{ type: "text", text: "Ready." }], details, isError: false, timestamp: Date.now() });
await writeFile(path.join(dir, "data/chats/mobile_transfer_speech.json"), JSON.stringify({ ...conversation, id: "mobile_transfer_speech", messages: [assistant([...["first", "second"].map(id => ({ type: "toolCall", name: "ask_user_question", id, arguments: { question: `${id} speech owner`, mode: "text" } }))])] }));
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
await writeFile(path.join(dir, "data/chats/mobile_reveal_regression.json"), JSON.stringify({ ...conversation, id: "mobile_reveal_regression", title: "Isolated reveal regression", messages: [...teaching, call("explain", { question: "Explain pressure and area.", correctAnswer: "Pressure is force divided by area.", nodeId: "pressure", type: "check" }, "question")] }));
for (let index = 0; index < 20; index++) {
	const id = `mobile_navigation_${index}`;
	await writeFile(path.join(dir, `data/chats/${id}.json`), JSON.stringify({ ...conversation, id, title: `Disposable navigation fixture ${index}`, messages: [] }));
}
await writeFile(path.join(dir, "data/chats/mobile_other_answer.json"), JSON.stringify({ ...conversation, id: "mobile_other_answer", title: "Other answer fixture", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
await writeFile(path.join(dir, "data/chats/mobile_transfer_reject.json"), JSON.stringify({ ...conversation, id: "mobile_transfer_reject", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
await writeFile(path.join(dir, "data/chats/mobile_transfer_choice.json"), JSON.stringify({ ...conversation, id: "mobile_transfer_choice", messages: [call("ask_user_question", { question: "Which approach would you use?", options: [{ label: "Start with force", value: "force" }, { label: "Start with area", value: "area" }], multiSelect: true }, "question")] }));
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
// The combined check uses the real Notebook service with only its external
// editor replaced. No saved account or live provider is available to this app.
await writeFile(path.join(dir, "app/api/chats/[id]/notebook/route.ts"), `
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createNotebookService } from "@/src/server/notebook";
import { chatStore } from "@/src/store/chats";
const service = createNotebookService({ chatStore, engine: async () => {
 const faux = createFauxCore({});
   faux.setResponses([context => fauxAssistantMessage(JSON.stringify(String(context.messages[0].content).endsWith("CURRENT INSTRUCTION\\n\\nRemove this expression fixture")
    ? { action: "edit", operations: [{ op: "replace", id: "L1", latex: "p=2+2=" }] }
    : String(context.messages[0].content).endsWith("CURRENT INSTRUCTION\\n\\nClarify fixture target")
   ? { action: "question", question: "Which occurrence should change?" }
   : { action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex: "p=F/A" }] }))]);
 return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" };
} });
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) { return service.handle(req, (await params).id); }
export const POST = GET;
`);
await mkdir(path.join(dir, "app/transfer-fixture"), { recursive: true });
await writeFile(path.join(dir, "app/transfer-fixture/page.tsx"), `"use client";
import { useEffect } from "react";
import { IndexedTransferDevice } from "@/components/handwriting/transfer-device";
import { HandwritingAttachment } from "@/components/handwriting/attachment";
import { emptyHandwriting, notebookSource, appendHandwriting } from "@/src/core/handwriting";
export default function Fixture() {
  useEffect(() => { Object.assign(window, { transferDevice: new IndexedTransferDevice(), HandwritingAttachment, emptyHandwriting, notebookSource, appendHandwriting }); }, []);
 return <p>Isolated native IndexedDB adapter fixture</p>;
}`);
const port = Number(process.env.LH_MOBILE_TEST_PORT ?? 3109);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535 && ![3000, 3001, 3002].includes(port), "Use a dedicated non-preview port (default 3109)");
const origin = `http://127.0.0.1:${port}`;
const processes = processScope();
const server = processes.spawn(process.execPath, [path.join(dir, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
	cwd: dir, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, LH_DATA_DIR: path.join(dir, "data"), LH_AUTH_FILE: path.join(dir, "auth.json"), OPENROUTER_API_KEY: "scripted-test-only", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
let serverError;
server.once("error", error => { serverError = error; });
server.once("exit", (code, signal) => console.log(`Disposable mobile server exited: code=${code}, signal=${signal}`));
captureOutput(server, path.join(dir, "server.log"), false);
server.stdout.on("data", data => { log += data; });
server.stderr.on("data", data => { log += data; });
let browser;
try {
	for (let i = 0; ; i++) {
		if (serverError) throw serverError;
		if (server.exitCode !== null || server.signalCode !== null) throw new Error(log);
		if (log.includes("Ready in")) break;
		if (i > 120) throw new Error(`Server did not start: ${log}`);
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	browser = await puppeteer.launch({ executablePath, userDataDir: `${dir}-chromium-profile`, headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, args: ["--no-sandbox", "--disable-features=BackForwardCache", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
	processes.own(browser.process());
	if (process.argv.includes("--layout-only")) {
		await verifyNotebookLayout(browser, origin, dir);
	} else if (process.argv.includes("--notebook-only")) {
		await verifyNotebookMobile(browser, origin);
		await verifyNotebookLayout(browser, origin, dir);
	} else {
	await reportBrowserEvent({ type: "start", suite: "inputs-notebook" });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	page.on("requestfailed", request => console.log(`Browser request failed: ${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
	await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	await page.setRequestInterception(true);
	let missingSpeechKey = false;
	const transferFaults = { handle: null };
	page.on("request", request => {
		if (transferFaults.handle?.(request)) return;
		if (new URL(request.url()).pathname === "/api/stt/token") void request.respond({ status: missingSpeechKey ? 503 : 200, contentType: "application/json", body: JSON.stringify(missingSpeechKey ? { error: "Missing Deepgram key" } : { token: "browser-test-token" }) });
		else void request.continue();
	});
	await page.evaluateOnNewDocument(() => {
		if (window !== window.top) return;
		localStorage.setItem("lh:sidebar-open", "0");
		localStorage.setItem("lh:device-tool:writing", "on"); localStorage.setItem("lh:device-tool:notebook", "on"); // both working tools, whatever the emulated device
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
			audioSeconds = 0;
			cursor = 0;
			pendingFinals = [];
			constructor(url, protocols) {
				super();
				if (new URL(url).hostname !== "api.deepgram.com") return new NativeSocket(url, protocols);
				window.speech = this;
				queueMicrotask(() => { if (!window.holdConnection) this.open(); });
			}
			open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
			send(value) {
				if (typeof value !== "string") { this.frames++; this.audioSeconds += value.byteLength / 32000; this.flushFinals(); return; }
				if (JSON.parse(value).type === "CloseStream") this.finishing = true;
			}
			final(text) { this.pendingFinals.push(text); this.flushFinals(); }
			flushFinals() {
				// Timestamped results reference audio already sent by the real worklet,
				// just like the production transport; they also exercise Notebook routing.
				while (this.pendingFinals.length && this.audioSeconds >= this.cursor + .001) {
					const text = this.pendingFinals.shift(), start = this.cursor, end = start + .001;
					this.cursor = end;
					this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start, duration: .001, channel: { alternatives: [{ transcript: text, words: [{ word: text, punctuated_word: text, start, end }] }] } }) }));
				}
			}
			close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code: 1000 })); }
		};
	});
	if (process.env.LH_NOTEBOOK_MENUS_ONLY) await checkHandwritingMenus({ page, origin });
	else {
	await page.goto(`${origin}/chat/mobile_conversation`, { waitUntil: "networkidle2", timeout: 240_000 });
	await page.waitForSelector('[data-testid="composer"] [data-file-path-input]');
	const assertMicSpace = async selector => {
		const separate = await page.$eval(selector, e => {
			const editor = e.getBoundingClientRect();
			const mic = e.parentElement.querySelector('[aria-label="Start dictation"]').getBoundingClientRect();
			return editor.right <= mic.left;
		});
		assert.ok(separate, "Empty placeholder and typed text have their own space before the microphone target");
	};
	await assertMicSpace('[data-testid="composer"] [data-file-path-input]');
	const database = await page.evaluate(() => new Promise(resolve => { const request = indexedDB.open("lh-handwriting-transfer", 1); request.onsuccess = () => { request.result.close(); resolve("opened"); }; request.onerror = () => resolve(`${request.error?.name}: ${request.error?.message}`); }));
	assert.equal(database, "opened", "Native device recovery opens before exercising image-bearing inputs");
	const fill = async (selector, text) => {
		await page.waitForSelector(selector, { visible: true });
		await page.waitForFunction(selector => !document.querySelector(selector)?.closest('[inert]'), {}, selector);
		await page.focus(selector);
		await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
		await page.keyboard.sendCharacter(text);
		assert.equal(await page.$eval(selector, field => field.value ?? field.textContent), text, "Typing reaches the visible editor before recording or submission");
	};
	const checkPhoneInput = async fieldSelector => {
		const selector = `${fieldSelector} [data-file-path-input]`;
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
	await fill('[data-testid="composer"] [data-file-path-input]', "My typed explanation.");
	const geometry = await page.evaluate(() => {
		const field = document.querySelector('[data-testid="composer"] [data-file-path-input]').getBoundingClientRect();
		const mic = [...document.querySelectorAll('[aria-label="Start dictation"]')].find(e => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
		const send = document.querySelector('[data-testid="composer"] [aria-label="Send"]').getBoundingClientRect();
		return { field: field.toJSON(), mic: mic?.toJSON(), send: send.toJSON() };
	});
	assert.ok(geometry.mic && geometry.mic.y >= geometry.field.y - 2 && geometry.mic.bottom <= geometry.field.bottom + 2, "Microphone sits inside the draft row rather than consuming a second row");
	assert.ok(geometry.mic.width >= 44 && geometry.mic.height >= 44 && geometry.send.width >= 44 && geometry.send.height >= 44, "Phone actions have 44px targets");
	const input = '[data-testid="composer"] [data-file-path-input]';
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
		const textStyle = await page.addStyleTag({ content: enlarged ? 'html { font-size: 125% !important; } [data-testid="composer"] [data-file-path-input] { font-size: 24px !important; }' : '/* normal text */' });
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
		assert.equal(await page.$eval(input, e => e.textContent), longDraft, `Draft retained ${label}`);
		await textStyle.evaluate(e => e.remove());
		await textStyle.dispose();
		console.log(`PASS: conversation geometry ${label}`);
	}
	await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
	await fill(input, longDraft);
	const beforeCapture = await page.$eval(input, field => {
		const range = document.createRange(); range.setStart(field.firstChild, 8); range.setEnd(field.firstChild, 20);
		getSelection().removeAllRanges(); getSelection().addRange(range); field.scrollTop = 70;
		return { height: field.getBoundingClientRect().height, scroll: field.scrollTop };
	});
	await page.locator(mic).click();
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
	assert.deepEqual(await page.$eval(input, e => ({ value: e.textContent, start: getSelection().anchorOffset, end: getSelection().focusOffset, scroll: e.scrollTop })), { value: longDraft, start: 8, end: 20, scroll: beforeCapture.scroll }, "Cancel during finalization restores earlier draft, selection and internal scroll");
	await fill(input, "Review before sending.");
	await page.click(mic);
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.evaluate(() => window.speech.final("Spoken working."));
	await page.click('[aria-label="Stop dictation"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Final reviewed words."); window.speech.close(); });
	await page.waitForSelector(mic);
	assert.equal(await page.$eval(input, e => e.textContent), "Review before sending. Spoken working. Final reviewed words.", "Stop appends early and late finals once into the editable conversation draft");
	await page.evaluate(() => { window.speech.final("After close."); window.speech.close(); });
	assert.equal(await page.$eval(input, e => e.textContent), "Review before sending. Spoken working. Final reviewed words.");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 0, "Dictation Stop does not submit or start a tutor turn");
	await fill(input, "Typed first.");
	await page.locator(mic).click();
	await page.waitForFunction(() => window.speech.readyState === 1);
	await page.evaluate(() => window.speech.final("Spoken middle."));
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.$eval('[data-testid="composer"]', form => form.requestSubmit());
	await page.evaluate(() => { window.speech.final("Spoken end."); window.speech.close(); });
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const saved = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(saved.messages.filter(m => m.role === "user" && JSON.stringify(m.content).includes("Typed first. Spoken middle. Spoken end.")).length, 1, "Send finishes and persists typed/spoken work once through the actual handler");
	await page.reload({ waitUntil: "networkidle2" });
	assert.ok(await page.evaluate(() => document.body.textContent.includes("Typed first. Spoken middle. Spoken end.")), "Submitted working survives reopening");
	await page.evaluate(() => { window.holdConnection = true; });
	await page.locator(mic).click();
	await page.waitForFunction(() => window.speech && window.speech.readyState === 0);
	assert.ok(await page.evaluate(() => document.querySelector('.lh-compact-field').textContent.includes("Connecting")), "Pending connection is shown inside the input");
	await page.click('[aria-label="Cancel dictation"]');
	await page.evaluate(() => { window.speech.open(); window.speech.final("Cancelled connection."); window.denyMicrophone = true; });
	await page.locator(mic).click();
	await page.waitForSelector('.lh-compact-error');
	assert.match(await page.$eval('.lh-compact-error', e => e.textContent), /Microphone permission denied.*Retry/);
	await page.evaluate(() => { window.denyMicrophone = false; window.holdConnection = false; window.cancelledSpeech = window.speech; });
	await page.click('.lh-compact-error button');
	await page.waitForFunction(() => window.speech !== window.cancelledSpeech && window.speech.readyState === 1);
	await page.click('[aria-label="Cancel dictation"]');
	// Empty conversation drafts retain the inherited active-dictation Send gate.
	await fill(input, "");
	assert.equal(await page.$eval(send, e => e.disabled), true);
	await page.evaluate(() => { window.cancelledSpeech = window.speech; });
	await page.click(mic);
	await page.waitForFunction(() => window.speech !== window.cancelledSpeech && window.speech.readyState === 1);
	assert.equal(await page.$eval(send, e => e.disabled), false, "Active speech enables Send before any text is flushed");
	await page.evaluate(() => window.speech.final("Speech only."));
	await page.click(send);
	await page.waitForFunction(() => window.speech.finishing);
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 1, "Send waits for speech finalization before submitting");
	await page.evaluate(() => { window.speech.final("Final words."); window.speech.close(); });
	await page.waitForFunction(() => document.body.textContent.includes("Speech only. Final words."));
	await page.waitForSelector('[data-testid="composer"] [aria-label="Send"]');
	// Restored speech and the optimistic user row precede the durable send.
	await page.waitForFunction(async () => (await (await fetch('/api/chats/mobile_conversation')).json()).messages.some(m => m.role === "user" && JSON.stringify(m.content).includes("Speech only. Final words.")));
	const spoken = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	assert.equal(spoken.messages.filter(m => m.role === "user" && JSON.stringify(m.content).includes("Speech only. Final words.")).length, 1);
	console.log("PASS: empty-draft active-dictation finish-before-send persists once");
	missingSpeechKey = true;
	await page.reload({ waitUntil: "networkidle2" }); // also discards the previous document's warm speech token
	await fill(input, "Settings recovery retains my draft.");
	await page.click(mic);
	await page.waitForSelector('.lh-compact-error');
	await page.waitForSelector('[data-testid="composer"] [aria-label="Start dictation"]');
	assert.match(await page.$eval('.lh-compact-error', e => e.textContent), /add a Deepgram speech key.*Settings/);
	await page.click('.lh-compact-error button');
	await page.waitForSelector('[data-testid="settings-dialog"]');
	await page.waitForSelector('[data-testid="key-deepgram_api_key-input"]');
	await fill('[data-testid="key-deepgram_api_key-input"]', "scripted-speech-key-not-real");
	await page.click('[data-testid="key-deepgram_api_key-save"]');
	await page.waitForSelector('[data-testid="key-deepgram_api_key-input"]', { hidden: true });
	missingSpeechKey = false;
	await page.click('[data-testid="settings-close"]');
	assert.equal(await page.$eval(input, e => e.textContent), "Settings recovery retains my draft.");
	await page.click(mic);
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.click('[aria-label="Cancel dictation"]');
	console.log("PASS: missing-key Settings round trip and subsequent capture");
	const navigateSession = async title => {
		const previousInput = await page.$(input);
		await page.click('button[data-testid="open-sidebar"]');
		await page.waitForSelector('[data-testid="session-search"]', { visible: true });
		await fill('[data-testid="session-search"]', title);
		const row = await page.waitForFunction(title => [...document.querySelectorAll('[data-testid="session-list"] button')].find(e => e.textContent.includes(title)), {}, title);
		await row.asElement().click();
		await row.dispose();
		// App Router can publish the URL while the previous Chat is still
		// mounted. Wait for its keyed editor to retire before typing in the
		// destination; visibility alone can still match the previous editor.
		await page.waitForFunction(element => !element.isConnected, {}, previousInput);
		await previousInput.dispose();
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
		assert.equal(await page.$eval(input, e => e.textContent), "Destination draft.", `Late ${phase} result cannot enter the new session`);
		assert.equal((await (await fetch(`${origin}/api/chats/mobile_other`)).json()).messages.filter(m => m.role === "user").length, 0);
		await page.evaluate(() => { window.holdPermission = false; window.holdConnection = false; });
		await navigateSession("Mobile browser conversation");
		await page.waitForFunction(() => location.pathname.endsWith("mobile_conversation"));
		console.log(`PASS: navigation cancels ${phase} without cross-session leakage`);
	}
	// Round 12 (owner O1): on phones Model, Reasoning and Usage open from
	// the page menu ("More" in the bar); their cards are unchanged.
	const openPhoneCard = async (row) => {
		await page.click('[data-testid="page-menu-button"]');
		await page.waitForSelector(`[data-testid="page-menu-${row}"]`, { visible: true });
		await page.click(`[data-testid="page-menu-${row}"]`);
	};
	for (const width of [320, 375, 430]) {
		await page.setViewport({ width, height: 550, isMobile: true, hasTouch: true });
		await fill(input, "Panel round trip keeps this draft.");
		await openPhoneCard("model");
		await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
		assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement), false, "Phone Model opens without search focus");
		await page.$eval('[data-testid="model-menu"]', async e => { await Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))); });
		const menu = await page.$eval('[data-testid="model-menu"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
		assert.ok(menu.left >= 0 && menu.right <= width && menu.top >= 0 && menu.bottom <= 550, `Real model options fit ${width}px`);
		await page.keyboard.press("Escape");
		await page.waitForSelector('[data-testid="model-menu"]', { hidden: true });
		await openPhoneCard("usage");
		await page.waitForSelector('[data-testid="stats-detail"]');
		await page.$eval('[data-testid="stats-detail"]', async e => { await Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))); });
		const usage = await page.$eval('[data-testid="stats-detail"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; });
		assert.ok(usage.left >= 0 && usage.right <= width && usage.top >= 0, `Real usage content fits ${width}px`);
		await page.keyboard.press("Escape");
		await page.waitForSelector('[data-testid="stats-detail"]', { hidden: true });
		assert.equal(await page.$eval(input, e => e.textContent), "Panel round trip keeps this draft.");
	}
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
	const upload = id => fetch(`${origin}/api/chats/${id}/writing`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
	assert.equal((await upload("mobile_other")).status, 201);
	assert.equal(await page.$('[data-testid="shared-writing-images"]'), null, "Another session's uploaded image stays out of this draft");
	assert.equal((await upload("mobile_conversation")).status, 201);
	await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_conversation`)).json()).messages.filter(m => m.role === "user").length, 2, "Image arrival does not submit a tutor turn");
	const previews = '.lh-shared-writing [data-testid="shared-writing-images"] button[aria-label^="Open handwritten working "]';
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
	await page.click(mic); await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("With the reviewed image."));
	await page.click('[data-testid="composer"] [aria-label="Send"]');
	await page.waitForFunction(() => window.speech.finishing);
	await page.evaluate(() => { window.speech.final("Final image explanation."); window.speech.close(); });
	await page.waitForFunction(() => !document.querySelector('.lh-shared-writing [data-testid="shared-writing-images"]'));
	// The tray empties when the send starts, before the server has stored it:
	// wait for the stored message instead of racing it (round 12).
	let withImage = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	for (let tries = 0; tries < 60 && !withImage.messages.some(m => m.sharedWriting?.length); tries++) {
		await new Promise(resolve => setTimeout(resolve, 250));
		withImage = await (await fetch(`${origin}/api/chats/mobile_conversation`)).json();
	}
	assert.equal(withImage.messages.filter(m => m.sharedWriting?.length).length, 1, "Deliberate Send persists the reviewed image once");
	assert.equal(withImage.messages.find(m => m.sharedWriting?.length).sharedWriting.length, 3, "Deliberate Send includes all three recovered pending images");
	assert.ok(withImage.messages.some(m => m.writingSubmission && JSON.stringify(m.content).includes("Final image explanation.")), "Image-bearing conversation uses receipt and finalized speech");
	assert.ok(!await page.evaluate(() => [...document.querySelectorAll('button')].some(e => /Attach handwriting|Choose from app|Take photo/.test(e.textContent))), "Deferred image actions are not advertised");
	await page.goto(`${origin}/chat/mobile_panels`, { waitUntil: "networkidle2" });
	await page.waitForSelector(input);
	// The real channel's first open can wait for its 25s heartbeat. Its
	// subscription resync invalidates selectable models; finish that startup
	// before attributing list changes or missed picks to card/keyboard actions.
	await page.waitForFunction(() => window.notifications?.readyState === EventSource.OPEN, { timeout: 45000 });
	const catalog = await (await fetch(`${origin}/api/models`)).json();
	const longModel = catalog.models.filter(m => m.supportedLevels.length > 1).sort((a, b) => b.name.length - a.name.length)[0];
	assert.ok(longModel, "Installed catalog supplies a long-label model with thinking options");
	const fitPanel = async selector => {
		await page.$eval(selector, async e => { await Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))); });
		const bounds = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
		assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, `${selector} fits: ${JSON.stringify(bounds)}`);
	};
	const assertCardBackdrop = async () => {
		await page.waitForSelector('[data-testid="phone-menu-backdrop"]', { visible: true });
		assert.ok(await page.$eval('[data-testid="phone-menu-backdrop"]', e => {
			const css = getComputedStyle(e);
			return css.backdropFilter === "blur(4px)" && css.backgroundColor === "rgba(0, 0, 0, 0)" && css.clipPath.startsWith("polygon(evenodd,");
		}), "Phone card uses lighter 4px blur without dimming and leaves a clear opener aperture");
		assert.equal(await page.$eval('.lh-app-shell', e => e.inert), true, "Lesson is inactive under the card");
	};
	// Exercise actual opening animation and split native touch press/release.
	// A backdrop removed on pointerdown lets the release click the trigger below.
	const cardTouch = await page.createCDPSession();
	await page.evaluate(() => {
		window.__lhPhoneFrameSample = menu => {
			const r = menu.getBoundingClientRect(), css = getComputedStyle(menu);
			const clip = parseFloat(css.clipPath.match(/^inset\(([^p]+)px/)?.[1] ?? "0");
			// Sample the rendered contour, not just the declared radius (CSS can
			// shrink that radius silently). Synchronous hit tests also check clips.
			const inert = menu.inert; menu.inert = false;
			const hits = (x, y) => menu.contains(document.elementFromPoint(x, y));
			const baseline = [1, -1].map(sign => {
				for (let x = .5; x < parseFloat(css.borderBottomLeftRadius) + 2; x += .5) {
					if (hits(sign === 1 ? r.left + x : r.right - x, r.bottom - .5)) return x;
				}
				return null;
			});
			const above = hits(r.left + r.width / 2, r.top + clip - .5);
			menu.inert = inert;
			return { top: r.top + clip, bottom: r.bottom, height: r.height - clip, width: r.width,
				baseline, above, opacity: Number(css.opacity), fontSize: css.fontSize };
		};
	});
	// Round 11 (owner): phone cards open and close at once, like Settings and
	// Extract files — no fall-out motion. The functional checks stay: the
	// card opens and fits, the opener and outside taps close it without
	// reopening or reaching what lies beneath, Escape closes, focus returns.
	const captureCardExit = async () => {};
	const assertCardExit = async (trigger, card) => {
		await page.waitForSelector(`[data-testid="${card}"]`, { hidden: true, timeout: 3000 });
		assert.equal(await page.$('[data-testid="phone-menu-backdrop"]'), null, "The backdrop leaves with the card");
		assert.equal(await page.$eval('.lh-app-shell', e => e.inert), false, "The lesson unlocks as soon as the card closes");
		assert.ok(await page.$(`[data-testid="${trigger}"]`), "The opener stays in place");
	};
	// The opener on phones is the page menu's button (its aperture stays
	// sharp above the blur); an outside tap lands on Home and must not go there.
	const trigger = "page-menu-button", otherTrigger = "nav-home";
	for (const [row, card] of [
		["model", "model-menu"],
		["reasoning", "thinking-menu"],
		["usage", "stats-detail"],
	]) {
		await openPhoneCard(row);
		await page.waitForSelector(`[data-testid="${card}"]`, { visible: true });
		assert.equal(await page.$eval(`[data-testid="${card}"]`, e => e.getAnimations().length), 0, "The card opens at once, without a fall-out animation");
		assert.equal(await page.$eval('[data-testid="phone-menu-backdrop"]', e => e.getAnimations().length), 0, "The backdrop appears at once too");
		await fitPanel(`[data-testid="${card}"]`);
		await assertCardBackdrop();
		const foreground = await page.evaluate(trigger => {
			const original = document.querySelector(`[data-testid="${trigger}"]`), button = document.querySelector('[data-testid="phone-menu-trigger"]');
			const r = original.getBoundingClientRect(), hit = button.getBoundingClientRect();
			return { original: [r.left, r.top, r.width, r.height], foreground: [hit.left, hit.top, hit.width, hit.height], name: button.getAttribute("aria-label"), expectedName: original.getAttribute("aria-label") ?? original.textContent,
				reachable: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === button };
		}, trigger);
		assert.deepEqual(foreground.foreground, foreground.original, "Sharp opener keeps its original position and target size");
		assert.equal(foreground.name, foreground.expectedName);
		assert.ok(foreground.reachable);
		const tapAt = async (testid, cancel = false) => {
			const point = await page.$eval(`[data-testid="${testid}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
			await cardTouch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...point }] });
			await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			assert.ok(await page.$(`[data-testid="${card}"]`), "Press does not remove the card before release");
			if (!cancel) await captureCardExit();
			await cardTouch.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
		};
		await tapAt(trigger, true);
		assert.ok(await page.$(`[data-testid="${card}"]`), "Cancelled opener gesture leaves the card open");
		await tapAt(trigger);
		await assertCardExit(trigger, card);
		assert.equal(await page.$('[data-testid="phone-menu-backdrop"]'), null, "Opener closes without reopening");
		await openPhoneCard(row);
		await page.waitForSelector(`[data-testid="${card}"]`, { visible: true });
		await fitPanel(`[data-testid="${card}"]`);
		await tapAt(otherTrigger, true);
		assert.ok(await page.$(`[data-testid="${card}"]`), "Cancelled outside gesture leaves the card open");
		await tapAt(otherTrigger);
		await assertCardExit(trigger, card);
		assert.equal(await page.$('[data-testid="phone-menu-backdrop"]'), null, "Outside tap cannot activate another card underneath");
		assert.ok(new URL(page.url()).pathname.startsWith("/chat/"), "The outside tap did not go Home");
	}
	await cardTouch.detach();
	// Escape closes an open card at once and returns the lesson.
	await openPhoneCard("model");
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	await page.keyboard.press("Escape");
	await assertCardExit("page-menu-button", "model-menu");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await openPhoneCard("model");
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="model-menu"]', e => e.getAnimations().length), 0, "Reduced motion skips card entrance");
	assert.equal(await page.$eval('[data-testid="phone-menu-backdrop"]', e => e.getAnimations().length), 0, "Reduced motion skips blur entrance too");
	await assertCardBackdrop();
	await page.keyboard.press("Escape");
	assert.equal(await page.$('[data-testid="model-menu"]'), null, "Reduced motion closes immediately");
	await page.emulateMediaFeatures([]);
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
		await openPhoneCard("model");
		await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
		await fitPanel('[data-testid="model-menu"]');
		await assertCardBackdrop();
		await page.waitForFunction(count => document.querySelectorAll('[data-testid="model-list"] button').length === count, {}, catalog.models.length);
		await fill('[data-testid="model-search"]', longModel.id);
		const modelRow = `[data-testid="model-option-${longModel.id.replace(/[^a-z0-9-]/gi, "_")}"]`;
		await page.waitForSelector(modelRow);
		assert.ok((await page.$eval(modelRow, e => e.textContent)).includes(longModel.name), "Long model label and identity retained in the real menu");
		await page.$eval(modelRow, e => e.scrollIntoView({ block: "nearest" }));
		await fitPanel('[data-testid="model-menu"]');
		const pickedModel = page.waitForResponse(r => new URL(r.url()).pathname === "/api/chats/mobile_panels/settings" && r.request().method() === "PUT" && r.ok());
		await captureCardExit();
		await page.locator(modelRow).click();
		await pickedModel;
		await assertCardExit("page-menu-button", "model-menu");
		await assertReading("Model selection");
		await openPhoneCard("reasoning");
		await page.waitForSelector('[data-testid="thinking-menu"]', { visible: true });
		await fitPanel('[data-testid="thinking-menu"]');
		await assertCardBackdrop();
		assert.deepEqual(await page.$$eval('[data-testid="thinking-menu"] button', buttons => buttons.map(e => e.querySelector('span').textContent)), longModel.supportedLevels, "Every supported thinking level is retained");
		const level = longModel.supportedLevels.at(-1);
		const pickedLevel = page.waitForResponse(r => new URL(r.url()).pathname === "/api/chats/mobile_panels/settings" && r.request().method() === "PUT" && r.ok());
		await captureCardExit();
		await page.locator(`[data-testid="thinking-option-${level}"]`).click();
		await pickedLevel;
		const settings = (await (await fetch(`${origin}/api/chats/mobile_panels`)).json()).settings;
		assert.equal(settings.model.id, longModel.id);
		assert.equal(settings.thinkingLevel, level, "Real model/thinking choices persist through the session API");
		await assertCardExit("page-menu-button", "thinking-menu");
		await assertReading("Thinking selection");
		await page.focus(input);
		await openPhoneCard("usage");
		await page.waitForSelector('[data-testid="stats-detail"]');
		await fitPanel('[data-testid="stats-detail"]');
		await assertCardBackdrop();
		assert.equal((await page.$$('[data-testid="stats-detail"] li')).length, 24, "Usage retains every turn");
		await page.$eval('[data-testid="stats-detail"] li:last-child', e => e.scrollIntoView({ block: "nearest" }));
		const lastUsageVisible = await page.$eval('[data-testid="stats-detail"] li:last-child', e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e.contains(hit) && r.bottom <= innerHeight; });
		assert.ok(lastUsageVisible, "Usage's overflowed final turn is reachable and visible");
		await captureCardExit();
		await page.keyboard.press("Escape");
		await assertCardExit("page-menu-button", "stats-detail");
		assert.equal(await page.$eval('.lh-app-shell', e => e.inert), false, "Card dismissal restores lesson interaction");
		await assertReading("Usage dismissal");
		await page.focus(input);
		await page.click('[data-testid="plan-chip"]'); // phones open Plan from the header (the composer row no longer repeats it)
		await page.waitForSelector('[data-testid="plan-popup"]');
		await fitPanel('[data-testid="plan-popup"]');
		assert.match(await page.$eval('[data-testid="plan-popup"]', e => e.textContent), /Pressure and area/);
		await page.click('[data-testid="plan-popup-fit"]');
		await page.keyboard.press("Escape");
		assert.equal(await page.$eval(input, e => e.textContent), "Panel review keeps my draft and reading position.");
		await assertReading("Plan dismissal");
		await page.$eval(input, e => e.blur());
		await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
		console.log(`PASS: complete Model/Thinking/Usage/Plan capabilities and focus release at ${width}×350`);
	}
	// Regression: open Model with the composer's keyboard ALREADY visible.
	await page.setViewport({ width: 375, height: 700, isMobile: true, hasTouch: true });
	await fill(input, "Already-open keyboard preserves this draft.");
	await page.evaluate(async () => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 350 });
		Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 });
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	const keyboardEntryShell = await page.$eval('.lh-app-shell', e => { const r = e.getBoundingClientRect(); return { top: r.top, height: r.height }; });
	assert.equal(keyboardEntryShell.height, 350, "Composer keyboard shrinks the lesson before opening Model");
	await openPhoneCard("model");
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement), false, "Keyboard-open entry still leaves search unfocused");
	// Round 13 (R2): the phone's Model card hangs below More, the opener in
	// the page bar, never from the hidden chip under the composer. Keyboard
	// motion never moves it off More; the visible area only shortens it.
	const underMore = () => page.evaluate(() => {
		const card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
		const more = document.querySelector('[data-testid="page-menu-button"]').getBoundingClientRect();
		const shell = document.querySelector('.lh-app-shell').getBoundingClientRect();
		const top = visualViewport.offsetTop, bottom = visualViewport.offsetTop + visualViewport.height;
		return { top: card.top, bottom: card.bottom, moreBottom: more.bottom, moreTop: more.top, visibleTop: top, visibleBottom: bottom, shellTop: shell.top, shellHeight: shell.height };
	});
	const hangsUnderMore = (frame, label) => {
		assert.ok(frame.top >= Math.max(frame.moreBottom, frame.visibleTop) - 1 && frame.top <= Math.max(frame.moreBottom, frame.visibleTop) + 12, `${label}: the card hangs just below More: ${JSON.stringify(frame)}`);
		assert.ok(frame.bottom <= frame.visibleBottom + 1, `${label}: the whole card is in the visible area: ${JSON.stringify(frame)}`);
	};
	const keyboardEntryFrames = await page.evaluate(async () => {
		const frames = [];
		for (const height of [350, 400, 475, 550, 625, 700]) {
			Object.defineProperty(visualViewport, "height", { configurable: true, get: () => height });
			Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 * (700 - height) / 350 });
			visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			const card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
			const more = document.querySelector('[data-testid="page-menu-button"]').getBoundingClientRect();
			const shell = document.querySelector('.lh-app-shell').getBoundingClientRect();
			frames.push({ top: card.top, bottom: card.bottom, moreBottom: more.bottom, visibleTop: visualViewport.offsetTop, visibleBottom: visualViewport.offsetTop + height, shellTop: shell.top, shellHeight: shell.height });
		}
		delete visualViewport.height; delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
		return frames;
	});
	for (const frame of keyboardEntryFrames) {
		hangsUnderMore(frame, "Keyboard-open entry");
		assert.equal(frame.shellTop, keyboardEntryShell.top);
		assert.equal(frame.shellHeight, keyboardEntryShell.height, "Keyboard-open entry keeps the lesson stationary");
	}
	await page.$eval('[data-testid="model-list"] button', e => e.scrollIntoView({ block: "nearest" }));
	assert.ok(await page.$eval('[data-testid="model-list"] button', e => {
		const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
	}), "An actual model result remains reachable instead of hitting the opener's close target");
	await page.click('[data-testid="model-search"]');
	await page.evaluate(async () => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 350 });
		Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 });
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	const entrySearch = await underMore();
	hangsUnderMore(entrySearch, "Search after keyboard-open entry");
	// The opener is "More" in the bar, above the card — never covered, so its
	// close target can never sit over the search results, and its clear
	// aperture stays.
	const noOverlap = () => page.evaluate(() => {
		const proxy = document.querySelector('[data-testid="phone-menu-trigger"]'), card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
		if (proxy.hidden) return true;
		const r = proxy.getBoundingClientRect();
		return r.bottom <= card.top || r.top >= card.bottom || r.right <= card.left || r.left >= card.right;
	});
	assert.ok(await noOverlap(), "The opener's close target cannot intercept search results");
	assert.ok(await page.$eval('[data-testid="phone-menu-backdrop"]', e => getComputedStyle(e).clipPath.startsWith("polygon(evenodd,")), "The uncovered opener keeps its clear aperture");
	await fill('[data-testid="model-search"]', "a");
	const entryResults = await page.$$eval('[data-testid="model-list"] button', buttons => buttons.map(e => e.dataset.testid));
	await page.click('[data-testid="model-hide-keyboard"]');
	const entryReturn = await page.evaluate(async () => {
		const frames = [];
		for (const height of [350, 400, 475, 550, 625, 700]) {
			Object.defineProperty(visualViewport, "height", { configurable: true, get: () => height });
			Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 * (700 - height) / 350 });
			visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			const card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
			const more = document.querySelector('[data-testid="page-menu-button"]').getBoundingClientRect();
			const proxy = document.querySelector('[data-testid="phone-menu-trigger"]').getBoundingClientRect();
			frames.push({ top: card.top, bottom: card.bottom, moreBottom: more.bottom, visibleTop: visualViewport.offsetTop, visibleBottom: visualViewport.offsetTop + height, clear: proxy.bottom <= card.top || proxy.top >= card.bottom });
		}
		delete visualViewport.height; delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
		return frames;
	});
	for (const frame of entryReturn) {
		hangsUnderMore(frame, "Keyboard dismissal");
		assert.ok(frame.clear, "The opener's close target stays clear of the card throughout");
	}
	assert.equal(await page.$eval('[data-testid="model-search"]', e => e.value), "a");
	assert.deepEqual(await page.$$eval('[data-testid="model-list"] button', buttons => buttons.map(e => e.dataset.testid)), entryResults, "Search dismissal retains results after keyboard-open entry");
	assert.ok(await page.evaluate(() => {
		const opener = document.querySelector('[data-testid="page-menu-button"]').getBoundingClientRect(), card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
		const covered = opener.left < card.right && opener.right > card.left && opener.top < card.bottom && opener.bottom > card.top;
		return getComputedStyle(document.querySelector('[data-testid="phone-menu-backdrop"]')).clipPath.startsWith("polygon(evenodd,") === !covered;
	}), "The opener's clear aperture follows whether the card covers it");
	await page.keyboard.press("Escape");
	await page.waitForSelector('[data-testid="model-menu"]', { hidden: true });
	assert.equal(await page.$eval(input, e => e.textContent), "Already-open keyboard preserves this draft.");
	assert.equal(await page.$eval('.lh-app-shell', e => e.inert), false);
	await page.evaluate(() => {
		delete visualViewport.height; delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
	});
	console.log("PASS: Model opened with the composer keyboard visible hangs under More through keyboard motion and dismissal");
	// End keyboard-open entry regression.
	// iOS keyboards shrink the VISUAL viewport without changing innerHeight.
	// Whole-viewport resizing above cannot catch a menu positioned behind it.
	await page.setViewport({ width: 375, height: 700, isMobile: true, hasTouch: true });
	await fill(input, "Keyboard-aware panels preserve this draft.");
	const keyboardReading = await scrollHistoryBack();
	await openPhoneCard("model");
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement), false, "Opening Model does not request a keyboard");
	assert.equal(await page.evaluate(() => document.querySelectorAll(":modal").length), 0, "Model uses the compact floating menu");
	await fitPanel('[data-testid="model-menu"]');
	await page.click('[data-testid="model-search"]');
	assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement), true, "Explicit search tap receives focus");
	await page.evaluate(async () => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 350 });
		Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 });
		visualViewport.dispatchEvent(new Event("resize"));
		visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	assert.equal(await page.evaluate(() => innerHeight), 700, "Keyboard test retains the layout viewport");
	const visibleBounds = async selector => page.$eval(selector, e => {
		const r = e.getBoundingClientRect(), v = visualViewport;
		return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, visibleTop: v.offsetTop, visibleBottom: v.offsetTop + v.height };
	});
	for (const selector of ['[data-testid="model-menu"]', '[data-testid="model-search"]', '[data-testid="model-list"]']) {
		const r = await visibleBounds(selector);
		assert.ok(r.top >= r.visibleTop && r.bottom <= r.visibleBottom, `${selector} clears keyboard: ${JSON.stringify(r)}`);
	}
	const compactModel = await visibleBounds('[data-testid="model-menu"]');
	assert.ok(compactModel.height <= 350 * .6 && compactModel.width < 375, "Model keeps the compact menu cap and edge spacing");
	hangsUnderMore(await underMore(), "Focused search"); // round 13: no docking at the keyboard — the card stays under More
	assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement), true, "Viewport movement does not steal deliberate search focus");
	assert.ok(await page.$eval('[data-testid="model-search"]', e => parseFloat(getComputedStyle(e).fontSize) >= 16), "Search avoids iOS focus autozoom");
	await page.$eval('[data-testid="model-list"]', e => { e.scrollTop = e.scrollHeight; });
	assert.ok(await page.$eval('[data-testid="model-list"] li:last-child button', e => {
		const r = e.getBoundingClientRect();
		return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
	}), "Final model remains reachable above the keyboard");
	// Hide the keyboard without picking a model or throwing away the search.
	await fill('[data-testid="model-search"]', "a");
	const filteredModels = await page.$$eval('[data-testid="model-list"] button', buttons => buttons.map(e => e.dataset.testid));
	let dismissWrites = 0;
	const countDismissWrites = request => { if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/settings")) dismissWrites++; };
	page.on("request", countDismissWrites);
	for (let cycle = 0; cycle < 2; cycle++) {
		const hideKeyboard = '[data-testid="model-hide-keyboard"]';
		await page.waitForSelector(hideKeyboard, { visible: true });
		const target = await visibleBounds(hideKeyboard);
		assert.ok(target.width >= 44 && target.height >= 44 && target.top >= target.visibleTop && target.bottom <= target.visibleBottom, "Keyboard-dismiss icon has a reachable phone-sized target");
		const typingHeight = (await visibleBounds('[data-testid="model-list"]')).height;
		const typingCard = await visibleBounds('[data-testid="model-menu"]');
		const background = await page.$eval('.lh-app-shell', e => { const r = e.getBoundingClientRect(); return { top: r.top, height: r.height }; });
		await page.click(hideKeyboard);
		assert.equal(await page.$eval('[data-testid="model-menu"]', e => e === document.activeElement), true, "Keyboard dismissal leaves non-input focus in the open picker");
		const waitingCard = await visibleBounds('[data-testid="model-menu"]');
		assert.ok(Math.abs(waitingCard.bottom - typingCard.bottom) <= 1 && Math.abs(waitingCard.height - typingCard.height) <= 1, "Blur does not jump the card before keyboard geometry changes");
		assert.equal(await page.$eval('[data-testid="model-search"]', e => e.value), "a", "Keyboard dismissal preserves query");
		assert.deepEqual(await page.$$eval('[data-testid="model-list"] button', buttons => buttons.map(e => e.dataset.testid)), filteredModels, "Keyboard dismissal preserves filtered results");
		const closingFrames = await page.evaluate(async () => {
			const frames = [];
			for (const height of [400, 475, 550, 625, 700]) {
				const offset = 36 * (700 - height) / 350;
				Object.defineProperty(visualViewport, "height", { configurable: true, get: () => height });
				Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => offset });
				visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
				const measure = () => {
					const card = document.querySelector('[data-testid="model-menu"]').getBoundingClientRect();
					const shell = document.querySelector('.lh-app-shell').getBoundingClientRect();
					return { top: card.top, bottom: card.bottom, height: card.height, shellTop: shell.top, shellHeight: shell.height };
				};
				const immediate = measure();
				await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
				frames.push({ visibleTop: offset, visibleBottom: offset + height, immediate, settled: measure() });
			}
			delete visualViewport.height; delete visualViewport.offsetTop;
			visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
			return frames;
		});
		for (const frame of closingFrames) {
			assert.ok(Math.abs(frame.immediate.bottom - frame.settled.bottom) <= 1 && Math.abs(frame.immediate.height - frame.settled.height) <= 1, `Card does not trail viewport geometry by a separate render: ${JSON.stringify(frame)}`);
			assert.ok(frame.immediate.top >= frame.visibleTop && frame.immediate.bottom <= frame.visibleBottom + 1, "Whole card fits every intermediate visible area");
			assert.equal(frame.settled.shellTop, background.top);
			assert.equal(frame.settled.shellHeight, background.height, "Lesson stays stationary during keyboard motion");
		}
		await page.waitForSelector(hideKeyboard, { hidden: true });
		assert.ok((await visibleBounds('[data-testid="model-list"]')).height > typingHeight, "Keyboard dismissal expands the browsing area");
		await page.$eval('[data-testid="model-list"]', e => { e.scrollTop = e.scrollHeight; });
		assert.ok(await page.$eval('[data-testid="model-list"] li:last-child button', e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), "Expanded filtered list remains scrollable to its final result");
		await page.click('[data-testid="model-search"]');
		assert.equal(await page.$eval('[data-testid="model-search"]', e => e === document.activeElement && e.value === "a"), true, "Tapping search resumes typing with the same query");
		await page.evaluate(async () => {
			Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 350 });
			Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 36 });
			visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		});
		const redocked = await visibleBounds('[data-testid="model-menu"]');
		assert.ok(redocked.bottom <= redocked.visibleBottom + 1, "Resumed search keeps the card above the keyboard");
		hangsUnderMore(await underMore(), "Resumed search");
	}
	page.off("request", countDismissWrites);
	assert.equal(dismissWrites, 0, "Keyboard-dismiss/reopen never changes settings");
	// Native Done can blur search while leaving the picker open. Restore its
	// compact trigger anchor, then re-enter search without changing the query.
	await page.$eval('[data-testid="model-search"]', e => e.blur());
	await page.evaluate(async () => {
		delete visualViewport.height; delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	await page.waitForFunction(() => !document.querySelector('[data-testid="model-menu"]').hasAttribute("data-search-docked"));
	const unfocusedModel = await visibleBounds('[data-testid="model-menu"]');
	assert.ok(unfocusedModel.bottom < unfocusedModel.visibleBottom - 1, "Blur restores trigger-anchored positioning");
	assert.notEqual(await page.$eval('[data-model-menu-footer]', e => getComputedStyle(e).display), "none");
	await page.click('[data-testid="model-search"]');
	// More native chrome leaves less room: the whole card follows that boundary,
	// with its results shrinking inside it instead of extending underneath.
	await page.evaluate(async () => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 250 });
		Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 56 });
		visualViewport.dispatchEvent(new Event("resize"));
		visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	const smallerModel = await visibleBounds('[data-testid="model-menu"]');
	assert.ok(smallerModel.bottom <= smallerModel.visibleBottom + 1 && smallerModel.top >= smallerModel.visibleTop);
	hangsUnderMore(await underMore(), "Less room");
	assert.ok(smallerModel.height <= 250 * .6, "Card shrinks when iPhone controls reduce available space");
	await fill('[data-testid="model-search"]', "no-model-can-match-this-fixture-query");
	await page.waitForFunction(() => document.querySelector('[data-testid="model-menu"]').textContent.includes("No models match."));
	const emptyModel = await visibleBounds('[data-testid="model-menu"]');
	hangsUnderMore(await underMore(), "Filtering to no results");
	await fill('[data-testid="model-search"]', longModel.id);
	const visibleModel = `[data-testid="model-option-${longModel.id.replace(/[^a-z0-9-]/gi, "_")}"]`;
	const keyboardPick = page.waitForResponse(r => new URL(r.url()).pathname === "/api/chats/mobile_panels/settings" && r.request().method() === "PUT" && r.ok());
	await page.waitForSelector(visibleModel);
	// Safari may blur search without focusing a tapped button. Keep its target
	// stationary through pointerdown/blur until click commits the model.
	const pickTarget = await page.$eval(visibleModel, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
	await page.mouse.move(pickTarget.x, pickTarget.y);
	await page.mouse.down();
	await page.evaluate(async () => {
		document.activeElement?.blur();
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	assert.ok(await page.$eval(visibleModel, (e, point) => e.contains(document.elementFromPoint(point.x, point.y)), pickTarget), "Result stays under the tap after search blur");
	await page.mouse.up();
	await keyboardPick;
	await page.waitForSelector('[data-testid="model-menu"]', { hidden: true });
	assert.equal(await page.$eval(input, e => e.textContent), "Keyboard-aware panels preserve this draft.");
	assert.ok(Math.abs(await page.$eval(history, e => e.scrollTop) - keyboardReading) <= 1, "Keyboard model selection preserves reading position");
	await page.evaluate(async () => {
		delete visualViewport.height;
		delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize"));
		visualViewport.dispatchEvent(new Event("scroll"));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	await openPhoneCard("usage");
	await page.waitForSelector('[data-testid="stats-detail"]');
	await fitPanel('[data-testid="stats-detail"]');
	const usagePopup = await visibleBounds('[data-testid="stats-detail"]');
	assert.ok(usagePopup.height <= 700 * .6 && usagePopup.bottom < usagePopup.visibleBottom, "Usage restores its smaller anchored popup");
	assert.equal(await page.evaluate(() => document.querySelectorAll(":modal").length), 0);
	await page.click('[data-testid="phone-menu-backdrop"]', { offset: { x: 4, y: 4 } });
	await page.waitForSelector('[data-testid="stats-detail"]', { hidden: true });
	assert.equal(await page.$eval('.lh-app-shell', e => e.inert), false);
	// A browser can expose new viewport geometry before notifying listeners.
	await openPhoneCard("model");
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	await fitPanel('[data-testid="model-menu"]');
	await page.click('[data-testid="model-search"]');
	await page.evaluate(() => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 350 });
		visualViewport.dispatchEvent(new Event("resize"));
	});
	await page.click('[data-testid="model-hide-keyboard"]');
	await page.evaluate(async () => {
		Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 600 });
		Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 10 });
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	const silentModel = await visibleBounds('[data-testid="model-menu"]');
	assert.ok(silentModel.height > 210 && silentModel.bottom <= 610, "Open card follows geometry without a resize notification");
	assert.equal(await page.$eval('.lh-app-shell', e => e.getBoundingClientRect().height), 700, "Unnotified geometry keeps the lesson frozen");
	await page.keyboard.press("Escape");
	await page.waitForSelector('[data-testid="model-menu"]', { hidden: true });
	assert.deepEqual(await page.$eval('.lh-app-shell', e => { const r = e.getBoundingClientRect(); return { height: r.height, top: r.top, inert: e.inert }; }),
		{ height: 600, top: 10, inert: false }, "Dismissal restores current geometry, not the last notified viewport");
	await page.evaluate(() => {
		delete visualViewport.height; delete visualViewport.offsetTop;
		visualViewport.dispatchEvent(new Event("resize"));
	});
	await page.click('[data-testid="plan-chip"]'); // phones open Plan from the header (the composer row no longer repeats it)
	await page.waitForSelector('[data-testid="plan-popup-dialog"]');
	const fullPlan = await visibleBounds('[data-testid="plan-popup"]');
	assert.equal(fullPlan.top, 0);
	assert.equal(fullPlan.bottom, fullPlan.visibleBottom, "Plan fills the phone's visible area");
	const graph = '[data-testid="plan-viewport"]';
	const transform = () => page.$eval(`${graph} > div`, e => new DOMMatrix(getComputedStyle(e).transform).toFloat64Array().slice(0, 16));
	await page.waitForFunction(selector => {
		const el = document.querySelector(`${selector} > div`), css = getComputedStyle(el);
		const actual = new DOMMatrix(css.transform), target = new DOMMatrix(el.style.transform);
		return css.opacity === "1" && Math.abs(actual.a - target.a) < .0001 && Math.abs(actual.e - target.e) < .0001 && Math.abs(actual.f - target.f) < .0001;
	}, {}, graph);
	const initialTransform = await transform();
	const point = await page.$eval(graph, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
	const touchSession = await page.createCDPSession();
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: point.x, y: point.y }] });
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: point.x + 20, y: point.y + 10 }] });
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
	assert.equal((await transform())[12], initialTransform[12], "Pan is locked at the fit floor");
	await page.setViewport({ width: 430, height: 700, isMobile: true, hasTouch: true });
	await page.waitForFunction(selector => {
		const graph = document.querySelector(selector).getBoundingClientRect();
		const svg = document.querySelector(`${selector} svg`).getBoundingClientRect();
		return Math.abs((svg.left + svg.right - graph.left - graph.right) / 2) < 1;
	}, {}, graph);
	await page.setViewport({ width: 375, height: 700, isMobile: true, hasTouch: true });
	await page.waitForFunction((selector, expected) => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector(`${selector} > div`)).transform).e - expected) < .001, {}, graph, initialTransform[12]);
	const pinch = async (type, distance) => touchSession.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ id: 1, x: point.x - distance, y: point.y }, { id: 2, x: point.x + distance, y: point.y }] });
	await pinch("touchStart", 24);
	for (const distance of [36, 48, 60, 80]) await pinch("touchMove", distance);
	await pinch("touchEnd", 0);
	assert.ok((await transform())[0] > initialTransform[0] * 1.5, "Two-finger pinch zooms the plan from fit");
	const zoomed = await transform();
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: point.x, y: point.y }] });
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: point.x + 40, y: point.y + 20 }] });
	await touchSession.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
	assert.notEqual((await transform())[12], zoomed[12], "One-finger drag pans the zoomed plan");
	await page.click('[data-testid="plan-popup-fit"]');
	await page.waitForFunction((selector, expected) => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector(`${selector} > div`)).transform).a - expected) < .001, {}, graph, initialTransform[0]);
	await page.click('[data-testid="plan-popup-close"]');
	assert.equal(await page.$eval(input, e => e.textContent), "Keyboard-aware panels preserve this draft.");
	assert.equal(await page.evaluate(() => document.querySelectorAll(":modal").length), 0, "Closing panels releases native modal ownership");
	// Compact menus retain the inherited desktop placement across the breakpoint.
	await openPhoneCard("model");
	await page.setViewport({ width: 1100, height: 800, isMobile: true, hasTouch: true });
	await page.waitForSelector('[data-testid="model-menu"]', { visible: true });
	await fitPanel('[data-testid="model-menu"]');
	await page.waitForSelector('[data-testid="phone-menu-backdrop"]', { hidden: true });
	assert.equal(await page.$eval('.lh-app-shell', e => e.inert), false, "Wide layout releases the frozen phone background");
	assert.equal(await page.evaluate(() => document.querySelectorAll(":modal").length), 0);
	await page.keyboard.press("Escape");
	assert.equal(await page.evaluate(() => document.body.style.overflow), "", "Phone modal releases its background lock on desktop");
	// A fresh desktop open retains the inherited search-focus behavior.
	await page.click('[data-testid="stats-model"]');
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "model-search");
	await page.keyboard.press("Escape");
	console.log("PASS: linear fixed-edge 400ms opening/closing and blur with no separate line phase, normal-sized text, selection exits, quick-close continuity, repeated-close guards, viewport interruption/reduced motion, safe taps, stationary lesson, keyboard/query/results, Plan pinch/pan and drafts");
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
	assert.equal(await page.$eval(input, e => e.textContent), "Image review retains this unsent draft.");
	assert.ok(Math.abs(await page.$eval(history, e => e.scrollTop) - imageReadingPosition) <= 1, "Image modal dismissal retains reading position");
	assert.equal((await (await fetch(`${origin}/api/chats/mobile_panels`)).json()).messages.filter(m => m.role === "user").length, 0, "Reviewing panels/images never submits a tutor turn");
	console.log("PASS: focused composer → native image modal → dismissal preserves draft/reading and lock ownership");
	await page.goto(`${origin}/chat/mobile_teaching`, { waitUntil: "networkidle2" });
	const reading = '[data-testid="reading-thinking-field"] [data-file-path-input]';
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
	assert.equal(await page.$eval(reading, e => e.textContent), "Capture 1. Capture 2.", "Restart after interrupted audio captures and appends a second recording once");
	await fill(reading, "Reading thought.");
	await page.click('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]');
	await page.waitForFunction(() => window.speech?.readyState === 1);
	await page.evaluate(() => window.speech.final("Before reveal."));
	await page.click('[data-testid="teach-check-reveal"]');
	await page.waitForFunction(() => window.speech.finishing);
	assert.ok(await page.$('[data-testid="teach-check-reveal"]'), "Reveal waits for final speech");
	await page.evaluate(() => { window.speech.final("Late reading thought."); window.speech.close(); });
	await page.waitForSelector('[data-testid="teach-check-reveal"]', { hidden: true });
	assert.equal(await page.$eval(reading, e => e.textContent), "Reading thought. Before reveal. Late reading thought.");
	const answer = '[data-testid="answer-field"] [data-file-path-input]';
	assert.equal(await page.$eval(answer, e => e.textContent), "", "Reading speech is separate from the newly revealed answer");
	assert.equal(await page.$eval('[data-testid="question-dock"] button[type="submit"]', e => e.disabled), true, "Empty text questions keep their existing submit gate");
	assert.equal(await page.$('[data-testid="reading-thinking-field"] [aria-label="Start dictation"]'), null, "Secondary reading input must not imply that it owns speech after reveal");
	await checkPhoneInput('[data-testid="answer-field"]');
	await fill(answer, "Answer draft.");
	// Round 13 (owner P7): on phones an open question owns the screen, so the
	// lesson is not scrolled behind it; "Back to lesson" folds it to its bar.
	assert.equal(await page.$eval('.lh-dock-overlay', e => {
		const area = e.offsetParent?.getBoundingClientRect(), r = e.getBoundingClientRect();
		return e.hasAttribute("data-question-open") && getComputedStyle(e).overflowY === "auto" && !!area && Math.abs(r.top - area.top) < 1 && Math.abs(r.height - area.height) < 1;
	}), true, "The open question owns the lesson area below the page bar");
	await page.click('[data-testid="question-back"]');
	await page.waitForSelector('[data-testid="question-dock-bar"]', { visible: true });
	assert.ok(await page.$eval(answer, e => e.checkVisibility()), "A revealed question keeps its answer input visible when Back to lesson folds the question");
	assert.equal(await page.$eval(answer, e => e.textContent), "Answer draft.");
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
	await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-attempt-review"]'));
	await page.goto(`${origin}/chat/mobile_selection`, { waitUntil: "networkidle2" });
	await page.click('[data-testid="reading-thinking-field"] [data-testid="teach-check-reveal"]');
	// Phones take a check in two steps (owner ruling 3): pick first, then
	// confidence and "why" open beneath the choices.
	await page.waitForSelector('[data-testid="question-pick-hint"]', { visible: true });
	assert.equal(await page.$('[data-testid="thinking-field"] [data-file-path-input]').then(e => e?.isVisible()), false, "Before a choice, the why field waits");
	await page.locator('[role="radio"]').filter(button => button.textContent.includes("Halve the area")).click();
	await page.waitForSelector('[data-testid="thinking-field"] [data-file-path-input]', { visible: true });
	await fill('[data-testid="thinking-field"] [data-file-path-input]', "The force stays the same.");
	assert.ok(await page.$('[data-testid="confidence-slider"]'), "Selection questions retain confidence");
	await page.click('[data-testid="plan-chip"]'); // phones open Plan from the header (the composer row no longer repeats it)
	await page.waitForSelector('[data-testid="plan-popup"]');
	await page.keyboard.press("Escape");
	assert.equal(await page.$eval('[data-testid="thinking-field"] [data-file-path-input]', e => e.textContent), "The force stays the same.", "Real Plan dismissal preserves the question draft");
	await upload("mobile_selection"); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const selected = await (await fetch(`${origin}/api/chats/mobile_selection`)).json();
	const selectionRecord = selected.messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(selectionRecord).includes("The force stays the same."));
	assert.equal(selectionRecord.details.confidence, 50, "Untouched confidence retains its existing meaning");
	assert.ok(selectionRecord.writingSubmission && selectionRecord.sharedWriting.length === 1);
	await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-attempt-review"]'));
	await page.goto(`${origin}/chat/mobile_other_answer`, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="other-option"] [data-file-path-input]');
	await page.locator('[role="checkbox"]').filter(button => button.textContent.includes("Start with force")).click();
	await fill('[data-testid="other-option"] [data-file-path-input]', "Compare both areas.");
	await fill('[data-testid="thinking-field"] [data-file-path-input]', "My custom reasoning.");
	await upload("mobile_other_answer"); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
	await page.click('[data-testid="question-dock"] button[type="submit"]');
	await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
	const otherRecord = (await (await fetch(`${origin}/api/chats/mobile_other_answer`)).json()).messages.find(m => m.role === "toolResult" && m.toolCallId === "question");
	assert.ok(JSON.stringify(otherRecord).includes("Compare both areas.") && JSON.stringify(otherRecord).includes("Start with force") && JSON.stringify(otherRecord).includes("My custom reasoning."), "Multi-select, Other and thinking survive the real answer contract together");
	assert.ok(otherRecord.writingSubmission && otherRecord.sharedWriting.length === 1);
	await page.waitForFunction(() => !document.querySelector('[data-testid="handwriting-attempt-review"]'));
	for (const id of ["mobile_practice", "mobile_drill"]) {
		await page.goto(`${origin}/chat/${id}`, { waitUntil: "networkidle2" });
		const thinking = '[data-testid="practice-thinking-field"] [data-file-path-input]';
		await page.waitForSelector(thinking, { visible: true });
		assert.ok(await page.$('[data-testid="practice-thinking-field"] [aria-label="Start dictation"]'), "Practice/drill thinking owns the same in-field microphone");
		await checkPhoneInput('[data-testid="practice-thinking-field"]');
		await fill(thinking, "100 divided by 2.");
		await upload(id); await page.waitForSelector('[aria-label="Open handwritten working 1"]');
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
		assert.equal(await page.$eval(thinking, e => e.textContent), "100 divided by 2.", "Cancel while collapsed retains the earlier practice draft");
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
		if (id === "mobile_drill") {
			await page.click('[data-testid="practice-send"]');
			await page.click('[data-testid="practice-send"]');
		} else await page.click('[aria-label="Stop dictation"]');
		await page.waitForFunction(() => window.speech.finishing);
		await page.evaluate(() => { window.speech.final("Late reasoning."); window.speech.close(); });
		await page.waitForFunction(() => !document.querySelector('.lh-compact-recording'));
		if (id !== "mobile_drill") {
			assert.equal(await page.$eval(thinking, e => e.textContent), "100 divided by 2. So pressure is 50 Pa. Late reasoning.");
			await page.click('[data-testid="practice-send"]');
		}
		await page.waitForFunction(() => document.body.textContent.includes("Scripted tutor received your working."));
		const record = await (await fetch(`${origin}/api/chats/${id}`)).json();
		assert.equal(record.messages.filter(message => message.role === "custom" && message.customType === "practice-thinking").length, 1, "Repeated Submit during finalization accepts the reasoning once");
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
	assert.equal(await gesture('button[data-testid="open-sidebar"]', "top", 30), true, "Header gestures do not move the surrounding page");
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
	assert.equal(await page.$eval(input, e => e.textContent), longDraft, "Wide-layout transition releases the focus lock without losing the draft");
	assert.ok(await page.$eval('[data-testid="dictation-toggle"]', e => e.checkVisibility()), "Wide layouts retain their original dictation strip");
	assert.equal(await page.$eval(mic, e => e.checkVisibility()), false, "Compact microphone stays phone-only");
	await checkHandwritingMenus({ page, origin });
	}
	assert.deepEqual(errors, [], "No browser runtime errors");
	console.log("PASS: conversation, reading/reveal, free-text/selection/Other answers, practice/drills, real persisted submissions, speech recovery, image review, panels, phone geometry and focus/gesture containment.");
	await page.close();
	await verifyNotebookMobile(browser, origin);
	await verifyNotebookLayout(browser, origin, dir);
	await browser.close();
	browser = undefined;
	await reportBrowserEvent({ type: "pass", suite: "inputs-notebook" });
	if (process.argv.includes("--all")) {
		for (const [suite, name, chat] of [["reveal", "smoke-question-reveal", "mobile_reveal_regression"], ["layout", "smoke-mobile-layout", "mobile_panels"]]) {
			console.log(`RUN: ${name}`);
			await reportBrowserEvent({ type: "start", suite });
			const test = processes.spawn(process.execPath, [`scripts/${name}.mjs`], {
				cwd: dir, env: { ...process.env, LH_SMOKE_URL: origin, LH_SMOKE_CHAT_ID: chat, LH_SMOKE_NOTEBOOK_FIXTURE: "1" }, stdio: ["ignore", "pipe", "pipe"],
			});
			captureOutput(test, path.join(dir, `${name}.log`));
			await completed(test);
			await reportBrowserEvent({ type: "pass", suite });
		}
		console.log("PASS: all three mobile browser suites");
	}
	}
} catch (error) {
	if (browser) {
		try {
			const page = (await browser.pages()).at(-1);
			await page.screenshot({ path: path.join(dir, "failure.png") });
			await writeFile(path.join(dir, "failure.txt"), await page.evaluate(() => document.body.innerText));
		} catch (captureError) { console.error("Failure capture:", captureError); }
	}
	console.error(`Browser artifacts: ${dir}`);
	throw error;
} finally {
	await processes.close();
}
