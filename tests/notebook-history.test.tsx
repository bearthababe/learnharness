import React, { act } from "react";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { after, test } from "node:test";
import { parseHTML } from "linkedom";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createNotebookSession } from "../components/notebook-session.ts";

const dir = fs.mkdtempSync(join(tmpdir(), "notebook-history-"));
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { React, window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, { CustomEvent: dom.window.CustomEvent, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
Object.assign(window, { innerWidth: 390, innerHeight: 844 });
Object.defineProperty(document, "oninput", { value: null, configurable: true });
Object.defineProperty(document, "compatMode", { value: "CSS1Compat", configurable: true });
const { createRoot } = await import("react-dom/client");
const { NotebookPanel } = await import("../components/notebook-panel.tsx");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });

async function mounted(faux: ReturnType<typeof createFauxCore>) {
	const chat = chatStore.createChat("History controls");
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const fetcher: typeof fetch = async (url, init) => service.handle(new Request(`http://test${url}`, init), chat.id);
	const session = createNotebookSession(chat.id, fetcher);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<NotebookPanel session={session} />));
	async function click(label: string, settle = true) {
		if (["Start fresh", "History"].includes(label)) {
			if (document.querySelector('[data-testid="notebook-options"]')) await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Notebook options"]')!.click());
			await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Notebook options"]')!.click());
		}
		const button = [...document.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label || button.textContent === label);
		assert.ok(button, `Missing learner control: ${label}`);
		assert.equal(button.disabled, false, `${label} is available`);
		await act(async () => {
			if (button.getAttribute("type") === "submit") button.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
			else button.click();
			await session.speech.idle();
		});
		await act(async () => {
			await session.idle();
			if (settle) await service.settled(chat.id);
			await session.refresh();
		});
	}
	async function draft(text: string) { await act(async () => { await session.dispatch({ type: "draft", text }); }); }
	return { chat, service, session, fetcher, host, click, draft,
		async close() { await act(async () => root.unmount()); host.remove(); session.dispose(); } };
}

test("Start fresh archives exact source; browsing and reopening preserve working and unsent text", async () => {
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [
			{ op: "insert", after: null, id: "L1", latex: "2+2=5" },
			{ op: "insert", after: "L1", id: "L2", latex: "\\frac{a}{" },
		] })),
	]);
	const ui = await mounted(faux);
	try {
		await ui.draft("Write 2+2=5 and an unfinished fraction"); await ui.click("Apply changes");
		const originalContext = ui.session.getSnapshot().view!.contextId;
		await ui.draft("Keep this unsent");
		const tutor = newUserMessage("Move to another topic");
		chatStore.saveMessages(ui.chat.id, [tutor]);
		await act(async () => ui.session.refresh());
		assert.equal(ui.session.getSnapshot().view!.contextId, originalContext, "Tutor activity does not start fresh");
		await ui.click("Start fresh");
		const fresh = ui.session.getSnapshot().view!;
		assert.notEqual(fresh.contextId, originalContext);
		assert.deepEqual(fresh.lines, []);
		assert.equal(fresh.canUndo, false);
		assert.equal(fresh.draft.text, "Keep this unsent");
		assert.equal(fresh.history.length, 1);
		assert.equal(fresh.history[0]!.sourceContextId, originalContext);
		assert.equal(fresh.history[0]!.sourceRevision, 1);
		assert.ok(Number.isFinite(Date.parse(fresh.history[0]!.createdAt)));
		assert.deepEqual(fresh.history[0]!.lines, [{ id: "L1", latex: "2+2=5" }, { id: "L2", latex: "\\frac{a}{" }]);
		await ui.click("History");
		const history = document.querySelector('[aria-label="Notebook history"]')!;
		assert.ok(history);
		assert.match(history.textContent!, /Entry 1/);
		assert.match(history.querySelector("time")!.outerHTML, new RegExp(fresh.history[0]!.createdAt));
		assert.equal(history.querySelector("[data-notebook-source]")?.textContent, "\\frac{a}{");
		assert.equal(history.querySelector("button, textarea, input"), null, "historical source is read-only");
		await ui.click("Notebook options");
		assert.deepEqual(ui.session.getSnapshot().view, fresh, "browse toggles do not dispatch or change saved state");
		await ui.click("Start fresh");
		assert.equal(ui.session.getSnapshot().view!.history.length, 1, "empty working is not archived");
		const reopened = createNotebookSession(ui.chat.id, ui.fetcher); await reopened.refresh();
		assert.deepEqual(reopened.getSnapshot().view!.history, fresh.history);
		assert.equal(reopened.getSnapshot().draftText, "Keep this unsent");
		assert.deepEqual(chatStore.getChat(ui.chat.id)!.messages, [tutor]);
		reopened.dispose();
	} finally { await ui.close(); }
});

test("learner reuses supplied history across duplicate line numbers, clarifies, edits and undoes without changing archives", async () => {
	const faux = createFauxCore({});
	const prompts: string[] = [];
	const replies = [
		{ action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex: "x=1; y=2" }] },
		{ action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex: "x=9; y=" }] },
		{ action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex: "z=7" }] },
		{ action: "question", question: "Entry 1 or entry 2?" },
		{ action: "edit", operations: [{ op: "insert", after: "L1", id: "L2", latex: "x=1; y=2" }] },
		{ action: "edit", operations: [{ op: "replace", id: "L2", latex: "x=1; y=3" }] },
		{ action: "edit", operations: [{ op: "insert", after: "L1", id: "L2", latex: "y=" }] },
		{ action: "edit", operations: [{ op: "replace", id: "missing", latex: "invalid" }] },
		{ action: "edit", operations: [{ op: "replace", id: "missing", latex: "invalid" }] },
	];
	faux.setResponses(replies.map((reply) => (context) => {
		prompts.push(context.messages.map((message) => typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("")).join("\n"));
		return fauxAssistantMessage(JSON.stringify(reply));
	}));
	const ui = await mounted(faux);
	const apply = async (text: string) => { await ui.draft(text); await ui.click("Apply changes"); };
	try {
		await apply("Write x=1; y=2 on one line"); await ui.click("Start fresh");
		await apply("Write x=9; y= on one line"); await ui.click("Start fresh");
		const archives = ui.session.getSnapshot().view!.history;
		await apply("Write z=7");
		await ui.click("History");
		assert.equal(document.querySelectorAll('[aria-label="Notebook history"] article').length, 2);
		await apply("Copy line one from history to line two");
		assert.match(ui.host.textContent!, /Entry 1 or entry 2\?/);
		assert.deepEqual(ui.session.getSnapshot().view!.lines, [{ id: "L1", latex: "z=7" }]);
		const supplied = JSON.parse(prompts[3]!.split("\n\nNOTEBOOK HISTORY\n\n")[1]!.split("\n\nEARLIER CONVERSATION")[0]!);
		assert.deepEqual(supplied.map((entry: { label: string; lines: unknown }) => ({ label: entry.label, lines: entry.lines })), [
			{ label: "Entry 1", lines: [{ id: "L1", latex: "x=1; y=2" }] },
			{ label: "Entry 2", lines: [{ id: "L1", latex: "x=9; y=" }] },
		]);
		await apply("Use the entire first line from entry 1 after z=7");
		assert.match(prompts[4]!, /Entry 1 or entry 2\?/);
		assert.deepEqual(ui.session.getSnapshot().view!.lines, [{ id: "L1", latex: "z=7" }, { id: "L2", latex: "x=1; y=2" }]);
		await apply("Change equation two on current line two to y=3");
		assert.deepEqual(ui.session.getSnapshot().view!.lines, [{ id: "L1", latex: "z=7" }, { id: "L2", latex: "x=1; y=3" }]);
		await ui.click("Undo"); await ui.click("Undo");
		assert.deepEqual(ui.session.getSnapshot().view!.lines, [{ id: "L1", latex: "z=7" }]);
		await apply("Copy only equation two on line one of entry 2 to current line two");
		const beforeFailure = ui.session.getSnapshot().view!.lines;
		assert.deepEqual(beforeFailure, [{ id: "L1", latex: "z=7" }, { id: "L2", latex: "y=" }]);
		await apply("Copy missing historical source");
		assert.equal(ui.session.getSnapshot().view!.problem?.status, "failed");
		assert.deepEqual(ui.session.getSnapshot().view!.lines, beforeFailure);
		assert.equal(ui.session.getSnapshot().draftText, "Copy missing historical source");
		const reopened = createNotebookSession(ui.chat.id, ui.fetcher); await reopened.refresh();
		assert.deepEqual(reopened.getSnapshot().view!.history, archives);
		assert.deepEqual(reopened.getSnapshot().view!.lines, beforeFailure);
		reopened.dispose();
	} finally { await ui.close(); }
});

for (const outcome of ["failed", "clarification"] as const) test(`Start fresh is disabled during an edit and explicitly archives the corrected ${outcome} context`, async () => {
	const faux = createFauxCore({});
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	faux.setResponses([
		async () => { await held; return fauxAssistantMessage(outcome === "failed" ? "invalid output" : '{"action":"question","question":"Which pressure equation?"}'); },
		...(outcome === "failed" ? [() => fauxAssistantMessage("still invalid")] : []),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'),
	]);
	const ui = await mounted(faux);
	try {
		const context = ui.session.getSnapshot().view!.contextId;
		await ui.draft("Write pressure"); await ui.click("Apply changes", false);
		await ui.draft("Later unsent words");
		await ui.click("Notebook options", false);
		const startFresh = [...document.querySelectorAll("button")].find((button) => button.textContent === "Start fresh")!;
		assert.equal(startFresh.disabled, true);
		assert.deepEqual(ui.session.getSnapshot().view!.history, []);
		assert.equal(ui.session.getSnapshot().view!.contextId, context);
		const undo = ui.host.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!;
		assert.equal(undo.disabled, true, "a new control cannot overlap an edit");
		for (const type of ["undo", "start-fresh", "apply"] as const) {
			await act(async () => { await assert.rejects(ui.session.dispatch({ type }), /Still applying/); });
		}
		await act(async () => { release(); await ui.service.settled(ui.chat.id); await ui.session.refresh(); });
		assert.equal(ui.session.getSnapshot().view!.startFreshPending, false);
		assert.equal(ui.session.getSnapshot().draftText, "Write pressure\n\nLater unsent words");
		assert.equal(ui.session.getSnapshot().view!.contextId, context);
		assert.deepEqual(ui.session.getSnapshot().view!.history, []);
		assert.equal(ui.session.getSnapshot().view!.problem?.status, outcome);
		await ui.draft("Write p=F/A"); await ui.click("Apply changes");
		assert.equal(ui.session.getSnapshot().view!.contextId, context, "completion does not queue a new context");
		await ui.click("Start fresh");
		const fresh = ui.session.getSnapshot().view!;
		assert.notEqual(fresh.contextId, context);
		assert.deepEqual(fresh.lines, []);
		assert.equal(fresh.problem, null);
		assert.equal(fresh.startFreshPending, false);
		assert.deepEqual(fresh.history[0]!.lines, [{ id: "L1", latex: "p=F/A" }]);
		assert.equal(fresh.history[0]!.sourceContextId, context);
		assert.equal(fresh.history[0]!.sourceRevision, 1);
	} finally { release(); await ui.service.settled(ui.chat.id); await ui.close(); }
});

test("older records require the edit to settle before Start fresh; lost fresh acknowledgments cannot archive twice", async () => {
	const chat = chatStore.createChat("Older notebook");
	const faux = createFauxCore({});
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	faux.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const oldRecord = chatStore.getChat(chat.id)!.notebook!;
	delete oldRecord.history;
	chatStore.saveNotebook(chat.id, oldRecord.revision, oldRecord);
	let lost = false;
	let freshRequest: Record<string, unknown> | undefined;
	const fetcher: typeof fetch = async (url, init) => {
		const command = init?.body ? JSON.parse(String(init.body)) : null;
		const response = await service.handle(new Request(`http://test${url}`, init), chat.id);
		if (command?.type === "start-fresh" && !lost) { lost = true; freshRequest = command; throw new Error("Lost fresh acknowledgment"); }
		return response;
	};
	const session = createNotebookSession(chat.id, fetcher);
	try {
		await session.refresh();
		assert.deepEqual(session.getSnapshot().view!.history, []);
		const oldContext = session.getSnapshot().view!.contextId;
		await session.dispatch({ type: "draft", text: "Write x=" }); await session.dispatch({ type: "apply" });
		await assert.rejects(session.dispatch({ type: "start-fresh" }), /Still applying/);
		release(); await service.settled(chat.id); await session.refresh();
		await assert.rejects(session.dispatch({ type: "start-fresh" }), /Lost fresh acknowledgment/);
		await session.dispatch({ type: "draft", text: "Keep for later" });
		release(); await service.settled(chat.id);
		await session.dispatch({ type: "start-fresh" }); await session.refresh();
		const fresh = session.getSnapshot().view!;
		assert.notEqual(fresh.contextId, oldContext);
		assert.deepEqual(fresh.lines, []);
		assert.equal(fresh.canUndo, false);
		assert.equal(fresh.history.length, 1);
		assert.deepEqual(fresh.history[0]!.lines, [{ id: "L1", latex: "x=" }]);
		assert.equal(fresh.draft.text, "Keep for later");
		const response = await fetcher("/notebook", { method: "POST", body: JSON.stringify({ ...freshRequest, type: "undo" }) });
		assert.equal(response.status, 409, "identity cannot be reused for a different control");
		const restarted = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor needed on reopen"); } });
		restarted.initialize(); await restarted.settled(chat.id);
		assert.deepEqual(restarted.view(chat.id).history, fresh.history);
		assert.equal(restarted.view(chat.id).contextId, fresh.contextId);
	} finally { release(); await service.settled(chat.id); session.dispose(); }
});

test("Start fresh clears the old cursor and editor conversation even when the next context reuses line IDs", async () => {
	const faux = createFauxCore({});
	let nextPrompt = "";
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x=1"}]}'),
		(context) => {
			nextPrompt = context.messages.map((message) => typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("")).join("\n");
			return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"y=2"}]}');
		},
	]);
	const ui = await mounted(faux);
	try {
		await ui.draft("Write x=1"); await ui.click("Apply changes");
		await act(async () => ui.host.querySelector<HTMLButtonElement>('[aria-label="Select line 1"]')!.click());
		assert.equal(ui.host.querySelector('[aria-label="Select line 1"]')!.getAttribute("aria-pressed"), "true");
		await ui.click("Start fresh");
		await ui.draft("Write y=2"); await ui.click("Apply changes");
		assert.equal(ui.host.querySelector('[aria-label="Select line 1"]')!.getAttribute("aria-pressed"), "false");
		assert.match(nextPrompt, /"cursorLineId":null/);
		assert.equal(nextPrompt.split("\n\nEARLIER CONVERSATION\n\n")[1]!.split("\n\nCURRENT INSTRUCTION")[0], "[]");
	} finally { await ui.close(); }
});
