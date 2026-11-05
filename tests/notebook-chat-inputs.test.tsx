import React, { act } from "react";
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { parseHTML } from "linkedom";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-chat-inputs-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
process.env.OPENROUTER_API_KEY = "test-key";
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { createPracticeAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { createTeacherTools } = await import("../src/agent/tools.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { GET: getChat } = await import("../app/api/chats/[id]/route.ts");
const { POST: steer } = await import("../app/api/chats/[id]/steer/route.ts");
const { toLlmMessages } = await import("../src/core/native-messages.ts");

// DOM transport only: application controls, callbacks, parsers and stores are real.
const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
	React, window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver,
	CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
	ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
	requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16).unref(),
	cancelAnimationFrame: clearTimeout,
	getComputedStyle: () => ({ overflow: "auto", overflowY: "auto", overflowX: "auto", paddingTop: "0", paddingBottom: "0", getPropertyValue: () => "0" }),
});
Object.defineProperty(document, "oninput", { value: null, configurable: true });
Object.defineProperty(document, "compatMode", { value: "CSS1Compat", configurable: true });
const local = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value), removeItem: (key: string) => local.delete(key) } });
Object.assign(window, { location: new URL("http://test/"), innerWidth: 1200, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
Object.assign(window.HTMLElement.prototype, { getAnimations: () => [], scrollTo() {}, scrollIntoView() {} });
for (const name of ["offsetWidth", "clientWidth", "offsetHeight", "clientHeight", "scrollWidth", "scrollHeight"]) Object.defineProperty(window.HTMLElement.prototype, name, { configurable: true, get: () => 0 });
const { createRoot } = await import("react-dom/client");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });

for (const activity of ["practice", "drill", "ordinary", "answer", "steer"] as const) test(`mounted Chat ${activity} Send preserves its native action and reaches Tutor with working`, async () => {
	const practice = activity === "practice" || activity === "drill";
	const mode = activity === "drill" ? "drill" : undefined;
	const chat = chatStore.createChat("Pressure", practice ? "practice" : undefined, mode);
	if (activity === "answer") chatStore.saveTree(chat.id, { nodes: [{ id: "pressure", title: "Pressure" }], edges: [], version: 1 });
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const tutor = createFauxCore({});
	let seen = "";
	let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
	let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
	tutor.setResponses([
		() => practice
			? fauxAssistantMessage([fauxToolCall("problem", { statement: "Find pressure.", mode: "recall", target: ["pressure"], modelSolution: "SECRET SOLUTION" }, { id: "problem-1" })], { stopReason: "toolUse" })
			: activity === "answer"
				? fauxAssistantMessage([fauxToolCall("explain", { question: "Define pressure.", correctAnswer: "SECRET COMMITMENT", type: "check", nodeId: "pressure" }, { id: "question-1" })], { stopReason: "toolUse" })
				: fauxAssistantMessage("Explain pressure."),
		...(activity === "steer" ? [async () => { entered(); await gate; return fauxAssistantMessage("An initial thought."); }] : []),
		context => { seen = JSON.stringify(context.messages); return fauxAssistantMessage("Check the units."); },
	]);
	const factory: Parameters<typeof handleChatRequest>[1] = opts => {
		const options = { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages };
		return practice ? createPracticeAgent({ chatId: chat.id, chatStore }, options) : createTeacherAgent(undefined, { ...options, ...(activity === "answer" ? { tools: createTeacherTools({ chatId: chat.id, chatStore, jobStore, spawn() {} }, { explain: true }) } : {}) });
	};
	const first = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Practice pressure" } }) }), factory);
	assert.equal(first.status, 200);
	if (runningTurn(chat.id)) await new Response(runningTurn(chat.id)!.subscribe()).text();
	const editor = createFauxCore({});
	editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const seed = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await seed.refresh(); await seed.dispatch({ type: "visibility", visible: true });
	const owner = practice ? { kind: "practice" as const, problemCallId: "problem-1" } : activity === "answer" ? { kind: "question" as const, toolCallId: "question-1", channel: "text" as const } : { kind: "ordinary" as const };
	seed.tutor.updateText(owner, ""); await seed.tutor.idle();
	await seed.dispatch({ type: "draft", text: "EDITOR ONLY" }); await seed.dispatch({ type: "apply" }); await service.settled(chat.id); await seed.refresh();
	if (activity === "answer") {
		const reading = { kind: "question" as const, toolCallId: "question-1", channel: "reading-thinking" as const };
		seed.tutor.updateText(reading, "My reading thought."); await seed.tutor.idle(); await seed.tutor.returnToTutor(reading);
	}
	await seed.tutor.returnToTutor(owner); seed.dispose();
	if (activity === "steer") {
		const response = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Continue explaining" } }) }), factory);
		assert.equal(response.status, 200); await started;
	}
	const requests: Array<{ input: unknown; status: number; body: string }> = [];
	globalThis.fetch = async (url, init) => {
		const path = String(url);
		if (path.endsWith("/notebook")) return service.handle(new Request(`http://test${path}`, init), chat.id);
		if (path.endsWith("/steer")) {
			const response = await steer(new Request(`http://test${path}`, init), { params: Promise.resolve({ id: chat.id }) });
			requests.push({ input: JSON.parse(String(init?.body)).input, status: response.status, body: await response.clone().text() });
			return response;
		}
		if (path === "/api/chat") {
			const response = await handleChatRequest(new Request("http://test/api/chat", init), factory);
			requests.push({ input: JSON.parse(String(init?.body)).input, status: response.status, body: await response.clone().text() });
			return response;
		}
		if (path.endsWith("/stream")) return new Response(runningTurn(chat.id)?.subscribe() ?? "");
		if (path === `/api/chats/${chat.id}`) return getChat(new Request(`http://test${path}`, init), { params: Promise.resolve({ id: chat.id }) });
		if (path.startsWith("/api/jobs")) return Response.json([]);
		return Response.json({ error: `Unused ancillary endpoint: ${path}` }, { status: 404 });
	};
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => root.render(
			<AppRouterContext.Provider value={{ back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: chat.id }}>
				<ServerEventsProvider connect={() => ({ onEvent() {}, onOpen() {}, close() {} })}>
					<Chat chatId={chat.id} title="Pressure" initialMessages={chatStore.getChat(chat.id)!.messages} initialConfigured={true} kind={practice ? "practice" : "teach"} practiceMode={mode} initiallyInFlight={activity === "steer"} />
				</ServerEventsProvider>
			</AppRouterContext.Provider>,
		));
		const send = host.querySelector<HTMLButtonElement>(practice ? '[data-testid="practice-send"]' : activity === "answer" ? '[data-testid="question-send"]' : '[data-testid="composer"] [aria-label="Send"]');
		assert.ok(send, host.textContent!); assert.equal(send.disabled, false);
		await act(async () => {
			if (practice) send.click();
			else send.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
		});
		for (let turn = 0; turn < 100 && !requests.length; turn++) await act(async () => { await new Promise<void>(resolve => setImmediate(resolve)); });
		assert.equal(requests.length, 1, host.textContent!);
		assert.equal(requests[0]!.status, 200, JSON.stringify(requests));
		await act(async () => { release(); const run = runningTurn(chat.id); if (run) await new Response(run.subscribe()).text(); });
		assert.match(seen, /Notebook-assisted working[\s\S]*p=F\/A/);
		if (practice) assert.match(seen, /Your thinking:/);
		if (activity === "answer") assert.match(seen, /thinkingWhileReading[\s\S]*My reading thought/);
		assert.doesNotMatch(seen, /EDITOR ONLY|snapshotId/);
		const saved = chatStore.getChat(chat.id)!;
		if (practice) assert.equal(saved.messages.filter(message => message.role === "custom" && message.customType === "practice-thinking").length, 1);
		if (activity === "answer") assert.equal(saved.messages.filter(message => message.role === "toolResult" && message.toolCallId === "question-1").length, 1);
		assert.equal(saved.notebook?.submissions?.length, 1);
		assert.match(JSON.stringify(toLlmMessages(saved.messages)), /p=F\/A/);
		assert.equal(saved.practiceMode, mode);
	} finally {
		release(); const run = runningTurn(chat.id); if (run) await new Response(run.subscribe()).text();
		await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch;
	}
});
