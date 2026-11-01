import React, { act, useRef } from "react";
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { parseHTML } from "linkedom";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createNotebookSession } from "../components/notebook-session.ts";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-ui-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { React, window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(document, "oninput", { value: null, configurable: true });
Object.defineProperty(document, "compatMode", { value: "CSS1Compat", configurable: true });
const { createRoot } = await import("react-dom/client");
const { NotebookPanel } = await import("../components/notebook-panel.tsx");
const { Composer } = await import("../components/composer.tsx");
const { useEnterSubmits } = await import("../components/enter-submits.ts");
const { QuestionDock } = await import("../components/question-dock.tsx");
const { useNotebookDestination } = await import("../components/notebook-destination.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("mounted Notebook applies, shows exact fallback, preserves Tutor draft, and reopens with Undo", async () => {
	const chat = chatStore.createChat("Mounted notebook");
	const faux = createFauxCore({});
	let calls = 0;
	faux.setResponses([() => { calls++; return fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [{ op: "insert", after: null, id: "L1", latex: "\\frac{a}{" }] })); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const fetcher: typeof fetch = async (url, init) => service.handle(new Request(`http://test${url}`, init), chat.id);
	const session = createNotebookSession(chat.id, fetcher);
	await session.refresh();
	await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Write an unfinished fraction" });
	assert.equal(session.getSnapshot().draftText, "Write an unfinished fraction");
	let tutorSends = 0;
	let questionSubmits = 0;
	function Tutor() {
		useEnterSubmits(() => tutorSends++);
		return <Composer value="My untouched reasoning" onChange={() => {}} onSend={() => tutorSends++} onStop={() => {}} busy={false} canSend />;
	}
	function Workspace() {
		const ref = useRef<HTMLDivElement>(null);
		useNotebookDestination(ref, session, true);
		return <div ref={ref}><div data-input-owner="tutor"><Tutor /><QuestionDock toolName="probe" toolCallId="pending-question" input={{ question: "Which?", options: [{ label: "one" }, { label: "two" }], correctAnswer: "one" }} expanded dictationClaim={false} onExpand={() => {}} onSubmit={() => questionSubmits++} /></div><NotebookPanel session={session} /></div>;
	}
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<Workspace />));
		const field = host.querySelector<HTMLTextAreaElement>('[aria-label="Notebook instruction"]')!;
		assert.equal(field.value || field.defaultValue, "Write an unfinished fraction", field.outerHTML);
		await act(async () => field.dispatchEvent(new window.Event("focusin", { bubbles: true })));
		await act(async () => {
			const key = new window.Event("keydown", { bubbles: true, cancelable: true });
			Object.assign(key, { key: "Enter", shiftKey: false });
			field.dispatchEvent(key);
			await session.idle(); await service.settled(chat.id); await session.refresh();
		});
		assert.equal(calls, 1);
		assert.equal(tutorSends, 0);
		assert.equal(questionSubmits, 0);
		const pageEnter = new window.Event("keydown", { bubbles: true, cancelable: true }); Object.assign(pageEnter, { key: "Enter" });
		await act(async () => document.body.dispatchEvent(pageEnter));
		assert.equal(tutorSends, 0, "page Enter follows the active Notebook destination");
		assert.equal(questionSubmits, 0);
		const tab = new window.Event("keydown", { bubbles: true, cancelable: true }); Object.assign(tab, { key: "Tab" });
		await act(async () => field.dispatchEvent(tab));
		assert.equal(tab.defaultPrevented, false, "Notebook Tab is not captured by the question rows");
		assert.equal(host.querySelector('[data-notebook-source]')?.textContent, "\\frac{a}{");
		const tutorField = host.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
		assert.equal(tutorField.value || tutorField.defaultValue, "My untouched reasoning");
		const undo = [...host.querySelectorAll("button")].find((b) => b.textContent === "Undo")!;
		const nativeEnter = new window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(nativeEnter, { key: "Enter" });
		await act(async () => undo.dispatchEvent(nativeEnter));
		assert.equal(tutorSends, 0, "pointer-focused notebook control cannot send Tutor");
		assert.equal(nativeEnter.defaultPrevented, false, "control keeps native activation");
		await act(async () => { await session.dispatch({ type: "draft", text: "Keep this unsent" }); });
		await act(async () => root.unmount()); session.dispose();
		const reopened = createNotebookSession(chat.id, fetcher);
		await reopened.refresh();
		assert.equal(reopened.getSnapshot().draftText, "Keep this unsent");
		assert.equal(reopened.getSnapshot().view?.visible, true);
		await reopened.dispatch({ type: "undo" }); await service.settled(chat.id); await reopened.refresh();
		assert.deepEqual(reopened.getSnapshot().view?.lines, []);
		reopened.dispose();
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("client retries a lost acknowledgment with the same identity", async () => {
	const chat = chatStore.createChat("Lost ack");
	const faux = createFauxCore({});
	let calls = 0;
	faux.setResponses([() => { calls++; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x=1"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let loseAck = true;
	const session = createNotebookSession(chat.id, async (url, init) => {
		const response = await service.handle(new Request(`http://test${url}`, init), chat.id);
		if (init?.body && JSON.parse(String(init.body)).type === "apply" && loseAck) { loseAck = false; throw new Error("Acknowledgment lost"); }
		return response;
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Write x=1" });
	await assert.rejects(session.dispatch({ type: "apply" }), /Acknowledgment lost/);
	assert.equal(session.getSnapshot().draftText, "Write x=1");
	await service.settled(chat.id);
	await session.dispatch({ type: "apply" });
	await service.settled(chat.id); await session.refresh();
	assert.equal(calls, 1);
	assert.deepEqual(session.getSnapshot().view?.lines, [{ id: "L1", latex: "x=1" }]);
	assert.equal(session.getSnapshot().draftText, "");
	assert.equal(session.getSnapshot().error, null, "successful reconciliation clears the save failure");
});

test("client saves later typing independently of a held accepted edit and detaches without cancelling it", async () => {
	const chat = chatStore.createChat("Keep typing");
	const faux = createFauxCore({});
	let finish!: () => void;
	const held = new Promise<void>((resolve) => { finish = resolve; });
	faux.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x=1"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const fetcher: typeof fetch = async (url, init) => service.handle(new Request(`http://test${url}`, init), chat.id);
	const session = createNotebookSession(chat.id, fetcher);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Write x=1" });
	const applying = session.dispatch({ type: "apply" });
	const typing = session.dispatch({ type: "draft", text: "Later words" });
	await applying; await typing; await session.refresh();
	assert.equal(session.getSnapshot().draftText, "Later words");
	session.dispose(); finish(); await service.settled(chat.id);
	const reopened = createNotebookSession(chat.id, fetcher); await reopened.refresh();
	assert.deepEqual(reopened.getSnapshot().view?.lines, [{ id: "L1", latex: "x=1" }]);
	assert.equal(reopened.getSnapshot().draftText, "Later words");
});

test("reconciling an earlier lost acknowledgment does not swallow an explicitly applied later instruction", async () => {
	const chat = chatStore.createChat("Later Apply");
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x=1"}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"x=2"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let lose = true;
	const session = createNotebookSession(chat.id, async (url, init) => {
		const response = await service.handle(new Request(`http://test${url}`, init), chat.id);
		if (init?.body && JSON.parse(String(init.body)).type === "apply" && lose) { lose = false; throw new Error("Lost ack"); }
		return response;
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Write x=1" });
	await assert.rejects(session.dispatch({ type: "apply" })); await service.settled(chat.id);
	await session.refresh();
	await session.dispatch({ type: "draft", text: "Change it to x=2" });
	await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	assert.deepEqual(session.getSnapshot().view?.lines, [{ id: "L1", latex: "x=2" }]);
	assert.equal(session.getSnapshot().draftText, "");
});
