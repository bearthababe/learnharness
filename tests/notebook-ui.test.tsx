import React, { act, useRef, useCallback, useSyncExternalStore } from "react";
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
const { NotebookSavedDrafts } = await import("../components/notebook-saved-drafts.tsx");
const { NotebookPanel } = await import("../components/notebook-panel.tsx");
const { Composer } = await import("../components/composer.tsx");
const { useEnterSubmits } = await import("../components/enter-submits.ts");
const { QuestionDock } = await import("../components/question-dock.tsx");
const { PracticeDock } = await import("../components/practice-dock.tsx");
const { useNotebookDestination } = await import("../components/notebook-destination.ts");
const { NotebookDraftReview, LearnerExplanation } = await import("../components/learner-explanation.tsx");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("Notebook notifications coalesce, reconnect refreshes immediately, and unmount cancels scheduled reads", async t => {
	const { useNotebookSession } = await import("../components/use-notebook-session.ts");
	const { ServerEventsProvider } = await import("../components/server-events.tsx");
	const chat = chatStore.createChat("Notification bursts");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const previous = globalThis.fetch; let reads = 0;
	globalThis.fetch = async (_url, init) => { reads++; return service.handle(new Request("http://test/notebook", init), chat.id); };
	const events = new Map<string, (data: string) => void>(); let open!: () => void;
	const connect = () => ({ onEvent(name: string, callback: (data: string) => void) { events.set(name, callback); }, onOpen(callback: () => void) { open = callback; }, close() {} });
	function View() { const state = useNotebookSession(chat.id); return <output>{String(state.view?.visible)}</output>; }
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const notify = () => events.get("notebook-changed")!(JSON.stringify({ chatId: chat.id }));
	try {
		await act(async () => root.render(<ServerEventsProvider connect={connect}><View /></ServerEventsProvider>));
		assert.equal(reads, 1);
		service.dispatch(chat.id, { type: "visibility", visible: true });
		await act(async () => { for (let i = 0; i < 20; i++) notify(); t.mock.timers.tick(249); });
		assert.equal(reads, 1);
		await act(async () => { t.mock.timers.tick(1); });
		assert.equal(reads, 2); assert.equal(host.textContent, "true");
		await act(async () => { notify(); open(); });
		assert.equal(reads, 3);
		await act(async () => { t.mock.timers.tick(250); });
		assert.equal(reads, 3, "reconnect absorbs the queued refresh");
		notify();
	} finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = previous; }
	t.mock.timers.tick(250);
	assert.equal(reads, 3);
});

test("spoken Apply captures the same selected whole line as the Notebook button", async () => {
	const chat = chatStore.createChat("Spoken selection"); const faux = createFauxCore({}); let prompt = "";
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="},{"op":"insert","after":"L1","id":"L2","latex":"F="}]}'),
		context => { prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L2","latex":"F=ma"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.dispatch({ type: "draft", text: "Write p= and F=" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => root.render(<NotebookPanel session={session} />));
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Select line 2"]')!.click());
		session.speech.choose({ kind: "notebook" });
		await act(async () => {
			const capture = await session.speech.begin({ id: "selection", now: () => 0 });
			capture.final({ id: "words", text: "Complete this line with mass times acceleration", start: 0, end: 1, words: [{ text: "Complete this line with mass times acceleration", start: 0, end: 0.8 }], speechFinal: true });
			capture.final({ id: "apply", text: "Apply changes", start: 1, end: 2, words: [{ text: "Apply changes", start: 1, end: 1.8 }], speechFinal: true });
			await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
		});
		assert.match(JSON.parse(prompt)[0].content, /"cursorLineId":"L2"/);
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("mounted practice Send waits visibly for pending working and submits only its completed snapshot", async () => {
	const chat = chatStore.createChat("Pending practice");
	let release!: () => void; const gate = new Promise<void>(done => { release = done; });
	const editor = createFauxCore({}); editor.setResponses([async () => { await gate; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "practice" as const, problemCallId: "p" }; session.tutor.updateText(owner, ""); await session.tutor.idle();
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	const sent: unknown[] = [];
	try {
		await act(async () => root.render(<PracticeDock notebook={session} problemCallId="p" input={{ statement: "Pressure?" }} expanded onExpand={() => {}} onSubmit={async (...args) => { sent.push(args); return false; }} />));
		await act(async () => { await session.dispatch({ type: "draft", text: "Write pressure" }); await session.dispatch({ type: "apply" }); await session.tutor.returnToTutor(owner); });
		assert.match(host.textContent!, /Working pending/);
		const send = host.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!;
		assert.equal(send.disabled, false);
		await act(async () => { send.click(); });
		assert.equal(sent.length, 0);
		assert.match(host.textContent!, /Waiting for notebook working/);
		await act(async () => { release(); await service.settled(chat.id); await session.refresh(); await session.tutor.idle(); });
		assert.equal(sent.length, 1);
		assert.match(JSON.stringify(sent), /p=F\/A/);
		assert.doesNotMatch(JSON.stringify(sent), /"pending":true/);
	} finally { release(); await service.settled(chat.id); await act(async () => root.unmount()); session.dispose(); host.remove(); }
});

test("old activity drafts are read-only, copy explicitly, and discard durably without changing the current question", async () => {
	const chat = chatStore.createChat("Saved drafts");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call expected"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const old = { kind: "question" as const, toolCallId: "old", channel: "text" as const };
	const current = { ...old, toolCallId: "current" };
	session.tutor.updateText(old, "Old unsent answer"); session.tutor.updateText(current, "Current answer"); await session.tutor.idle();
	let copied = "";
	const prior = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (text: string) => { copied = text; } } } });
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => root.render(<NotebookSavedDrafts session={session} questionId="current" />));
		assert.match(host.textContent!, /Old unsent answer/); assert.doesNotMatch(host.textContent!, /Current answer/);
		assert.equal(host.querySelectorAll("textarea,input").length, 0);
		await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(e => e.textContent === "Copy text")!.click());
		assert.equal(copied, "Old unsent answer");
		await act(async () => { [...host.querySelectorAll<HTMLButtonElement>("button")].find(e => e.textContent === "Discard")!.click(); await session.tutor.idle(); });
		assert.equal(host.querySelectorAll("[data-saved-draft]").length, 0);
		assert.equal(service.view(chat.id).tutorDrafts?.length, 1);
		assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Current answer/);
	} finally { await act(async () => root.unmount()); session.dispose(); host.remove(); if (prior) Object.defineProperty(globalThis, "navigator", prior); }
});

test("mounted written answer accepts working-only content, keeps commitment hidden, and retries its frozen answer", async () => {
	const chat = chatStore.createChat("Written answer");
	const editor = createFauxCore({}); editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	const sent: unknown[] = [];
	try {
		await act(async () => root.render(<QuestionDock notebook={session} toolName="recall" toolCallId="written" input={{ question: "Pressure?", correctAnswer: "SECRET COMMITMENT" }} expanded onExpand={() => {}} onSubmit={async (answer, _id, fields) => { sent.push({ answer, fields }); return false; }} />));
		await act(async () => { await session.dispatch({ type: "draft", text: "Make pressure" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh(); await session.tutor.returnToTutor({ kind: "question", toolCallId: "written", channel: "text" }); });
		assert.equal(host.querySelectorAll("[data-snapshot-id]").length, 1);
		assert.doesNotMatch(host.textContent!, /SECRET COMMITMENT/);
		const button = host.querySelector<HTMLButtonElement>('[data-testid="question-send"]')!;
		assert.equal(button.disabled, false);
		await act(async () => { button.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await session.tutor.idle(); });
		await act(async () => { button.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await session.tutor.idle(); });
		assert.equal(sent.length, 2, host.textContent!); assert.deepEqual(sent[0], sent[1]);
		assert.match(JSON.stringify(sent), /textContent[\s\S]*p=F\/A/);
		assert.ok(session.tutor.draft({ kind: "question", toolCallId: "written", channel: "text" }));
	} finally { await act(async () => root.unmount()); session.dispose(); host.remove(); }
});

test("question selections and confidence reopen with their own notebook thinking draft", async () => {
	const chat = chatStore.createChat("Question draft");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call expected"); } });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	let session = createNotebookSession(chat.id, transport); await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const host = document.createElement("div"); document.body.append(host); let root = createRoot(host);
	const render = () => <QuestionDock notebook={session} toolName="probe" toolCallId="q1" input={{ question: "Which unit?", options: [{ label: "Pascal", value: "Pa" }, { label: "Newton", value: "N" }], correctAnswer: "Pa", explanation: "Force per area." }} expanded onExpand={() => {}} onSubmit={() => { throw new Error("Reopen never submits"); }} />;
	try {
		await act(async () => root.render(render()));
		const choice = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(e => e.textContent?.includes("Pascal"))!;
		await act(async () => { choice.click(); await session.tutor.idle(); });
		const key = new window.Event("keydown", { bubbles: true, cancelable: true }); Object.assign(key, { key: "ArrowRight" });
		await act(async () => { document.dispatchEvent(key); await session.tutor.idle(); });
		assert.equal(host.querySelector('[data-testid="confidence-value"]')?.textContent, "70%", JSON.stringify(session.tutor.getSnapshot()));
		await act(async () => root.unmount()); session.dispose();
		session = createNotebookSession(chat.id, transport); await session.refresh(); root = createRoot(host);
		await act(async () => root.render(render()));
		assert.equal([...host.querySelectorAll('[role="radio"]')].find(e => e.textContent?.includes("Pascal"))?.getAttribute("aria-checked"), "true");
		assert.equal(host.querySelector('[data-testid="confidence-value"]')?.textContent, "70%");
		assert.equal(chatStore.getChat(chat.id)!.messages.length, 0);
	} finally { await act(async () => root.unmount()); session.dispose(); host.remove(); }
});

test("practice keeps its existing text draft when Notebook is first opened, without creating Notebook while typing", async () => {
	const chat = chatStore.createChat("Existing practice draft", "practice");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call expected"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh();
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => root.render(<PracticeDock problemCallId="p1" input={{ statement: "Pressure?" }} expanded onExpand={() => {}} notebook={session} onSubmit={async () => false} />));
		const field = host.querySelector<HTMLTextAreaElement>("textarea")!;
		await act(async () => {
			Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Pressure is force per area.");
			field.dispatchEvent(new window.Event("input", { bubbles: true }));
			await session.tutor.idle();
		});
		assert.equal(service.view(chat.id).contextId, null, "ordinary practice typing does not open a notebook aggregate");
		await act(async () => { await session.dispatch({ type: "visibility", visible: true }); await session.tutor.idle(); });
		assert.equal(field.value, "Pressure is force per area.");
		await session.tutor.idle();
		assert.equal(session.tutor.draft({ kind: "practice", problemCallId: "p1" })?.parts.at(-1)?.kind, "text");
		assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Pressure is force per area/);
	} finally { await act(async () => root.unmount()); session.dispose(); host.remove(); }
});

test("mounted practice adapter reopens its owned working-only draft and retains it when send is unconfirmed", async () => {
	const chat = chatStore.createChat("Practice draft", "practice");
	const editor = createFauxCore({});
	editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, transport);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "practice" as const, problemCallId: "p1" };
	session.tutor.updateText(owner, ""); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "Write pressure" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	await session.tutor.returnToTutor(owner); session.dispose();
	const reopened = createNotebookSession(chat.id, transport); await reopened.refresh();
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	let sent: unknown;
	try {
		await act(async () => root.render(<PracticeDock problemCallId="p1" input={{ statement: "Pressure?" }} expanded onExpand={() => {}} notebook={reopened} onSubmit={async (_text, _id, fields) => { sent = fields; return false; }} />));
		assert.equal(host.querySelectorAll("[data-snapshot-id]").length, 1);
		assert.equal(host.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!.disabled, false);
		await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!.click(); await reopened.tutor.idle(); });
		assert.match(JSON.stringify(sent), /p=F\/A/);
		assert.equal(reopened.tutor.draft(owner)?.parts.length, 3);
	} finally { await act(async () => root.unmount()); reopened.dispose(); host.remove(); }
});

test("mounted continuation reviews immutable snapshots, edits earlier prose, appends on return and sends working-only content explicitly", async () => {
	const chat = chatStore.createChat("Mounted explanation");
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (url, init) => service.handle(new Request(`http://test${url}`, init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	session.tutor.updateText({ kind: "ordinary" }, ""); await session.tutor.idle();
	let sent: import("../src/core/contracts/notebook.ts").LearnerExplanation | undefined;
	function Workspace() {
		const root = useRef<HTMLDivElement>(null);
		const state = useSyncExternalStore(session.tutor.subscribe, session.tutor.getSnapshot, session.tutor.getSnapshot);
		const draft = state.drafts[0];
		const part = draft?.parts.at(-1);
		const returning = useCallback(() => { void session.tutor.returnToTutor({ kind: "ordinary" }); }, []);
		useNotebookDestination(root, session, true, returning);
		return <div ref={root}>
			<div data-input-owner="tutor">
				<NotebookDraftReview draft={draft} onTextChange={(id, text) => session.tutor.updateText({ kind: "ordinary" }, text, id)} />
				<Composer value={part?.kind === "text" ? part.text : ""} onChange={(text) => session.tutor.updateText({ kind: "ordinary" }, text)} busy={false} canSend={!!draft?.parts.some((part) => part.kind === "working" || part.text.trim())} onStop={() => {}} onSend={() => { void session.tutor.prepareSubmission({ kind: "ordinary" }).then((input) => { sent = input.explanation; }); }} />
				{sent && <LearnerExplanation parts={sent} />}
			</div><NotebookPanel session={session} />
		</div>;
	}
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<Workspace />));
		async function apply(text: string) {
			await act(async () => session.dispatch({ type: "draft", text }));
			const instruction = host.querySelector('[aria-label="Notebook instruction"]')!;
			await act(async () => instruction.dispatchEvent(new window.Event("focusin", { bubbles: true })));
			await act(async () => {
				instruction.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
				await session.idle(); await service.settled(chat.id); await session.refresh();
			});
		}
		await apply("Write pressure");
		const composer = host.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')!;
		await act(async () => { composer.dispatchEvent(new window.Event("focusin", { bubbles: true })); await session.tutor.idle(); });
		assert.equal(sent, undefined, "focus return never submits");
		assert.equal(host.querySelectorAll('[data-snapshot-id]').length, 1);
		assert.equal(host.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.disabled, false, "working-only ordinary content is eligible");
		// Native input event on the actual earlier-text control.
		const earlier = host.querySelector<HTMLTextAreaElement>('[aria-label="Earlier explanation"]')!;
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
			setter!.call(earlier, "Same force, larger area.");
			earlier.dispatchEvent(new window.Event("input", { bubbles: true }));
			await session.tutor.idle();
		});
		assert.equal(session.tutor.draft({ kind: "ordinary" })!.parts[0]!.kind, "text");
		assert.match(JSON.stringify(session.tutor.draft({ kind: "ordinary" })), /Same force, larger area/);
		await apply("Double area");
		await act(async () => { earlier.dispatchEvent(new window.Event("focusin", { bubbles: true })); await session.tutor.idle(); });
		const draft = session.tutor.draft({ kind: "ordinary" })!;
		assert.deepEqual(draft.parts.filter((part) => part.kind === "working").map((part) => part.lines[0]!.latex), ["p=F/A", "p=F/(2A)"]);
		assert.equal(draft.parts.at(-1)?.kind, "text", "return from earlier editor still appends at continuation");
		assert.equal(sent, undefined);
		await act(async () => { host.querySelector('[data-testid="composer"]')!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await session.tutor.idle(); });
		assert.deepEqual(sent, draft.parts);
		assert.equal(service.view(chat.id).draft.text, "");
	} finally { await act(async () => root.unmount()); session.dispose(); host.remove(); }
});

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

test("clarification recovery stays ahead of typing whose autosaves were already queued", async () => {
	const chat = chatStore.createChat("Recovery while typing");
	const faux = createFauxCore({});
	let finish!: () => void, releaseSave!: () => void;
	const held = new Promise<void>((resolve) => { finish = resolve; });
	const saveHeld = new Promise<void>((resolve) => { releaseSave = resolve; });
	faux.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"question","question":"Which denominator?"}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (url, init) => {
		if (init?.body && JSON.parse(String(init.body)).text === "Later") await saveHeld;
		return service.handle(new Request(`http://test${url}`, init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Double it" }); await session.dispatch({ type: "apply" });
	const earlierSave = session.dispatch({ type: "draft", text: "Later" }).catch(() => {});
	const laterSave = session.dispatch({ type: "draft", text: "Later words" });
	await Promise.resolve(); finish(); await service.settled(chat.id); await session.refresh();
	releaseSave(); await earlierSave; await laterSave; await session.refresh();
	assert.equal(session.getSnapshot().draftText, "Double it\n\nLater words");
	assert.equal(service.view(chat.id).draft.text, "Double it\n\nLater words");
	assert.equal(session.getSnapshot().view?.problem?.message, "Which denominator?");
});
