import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createNotebookSession } from "../components/notebook-session.ts";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-close-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("close waits for a running edit and can finish when that edit returns a clarification", async () => {
	const chat = chatStore.createChat("Close pending edit");
	let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
	const faux = createFauxCore({});
	faux.setResponses([async () => { await gate; return fauxAssistantMessage('{"action":"question","question":"Which line?"}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	try {
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
		await session.dispatch({ type: "draft", text: "Change the symbol" }); await session.dispatch({ type: "apply" });
		const closing = session.speech.closeNotebook({ kind: "tutor", owner: { kind: "ordinary" } });
		assert.equal(session.getSnapshot().view!.visible, true);
		assert.equal(session.getSnapshot().inputLocked, true);
		release(); await service.settled(chat.id); await session.refresh(); await closing;
		assert.equal(session.getSnapshot().view!.visible, false);
		assert.equal(session.getSnapshot().view!.problem!.status, "clarification");
		assert.equal(session.getSnapshot().draftText, "Change the symbol");
		assert.equal(session.getSnapshot().view!.snapshots!.length, 0, "No working means nothing to attach");
	} finally { release(); session.dispose(); }
});

test("close during clarification finishes original speech, attaches completed working once and retains the unresolved edit on reload", async () => {
	const chat = chatStore.createChat("Close clarification");
	const faux = createFauxCore({}); let calls = 0;
	faux.setResponses([
		() => { calls++; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); },
		() => { calls++; return fauxAssistantMessage('{"action":"question","question":"Which occurrence?"}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, transport);
	const owner = { kind: "ordinary" as const }, input = { kind: "tutor" as const, owner };
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	session.tutor.updateText(owner, "Before working."); await session.tutor.idle();
	await session.speech.choose({ kind: "notebook" });
	for (const text of ["Write pressure", "Remove the multiplication sign"]) {
		await session.dispatch({ type: "draft", text }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	}
	const problem = structuredClone(session.getSnapshot().view!.problem);
	const capture = await session.speech.begin({ id: "retained-speech", now: () => 0 });
	let finished = 0;
	session.speech.configure({ tutor: () => input, select() {}, finish: async () => {
		finished++;
		capture.final({ id: "late", text: "Keep this correction", start: 0, end: 1, words: [{ text: "Keep this correction", start: 0, end: 0.9 }], speechFinal: true });
		await capture.end("stop");
	} });
	const close = () => session.speech.closeNotebook(input);
	try {
		await close();
		assert.equal(finished, 1); assert.equal(session.speech.isActive(), false);
		assert.equal(session.getSnapshot().view!.visible, false);
		assert.deepEqual(session.getSnapshot().view!.problem, problem);
		assert.match(session.getSnapshot().draftText, /Remove the multiplication sign[\s\S]*Keep this correction/);
		const draft = session.tutor.draft(owner)!;
		assert.deepEqual(draft.parts.map(part => part.kind === "text" ? part.text : part.lines), ["Before working.", [{ id: "L1", latex: "p=F/A" }], ""]);
		assert.equal(draft.parts.some(part => part.kind === "working" && (part.pending || part.failure)), false);
		await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" }); await close();
		assert.equal(session.getSnapshot().view!.snapshots!.length, 1, "Repeated close does not duplicate unchanged working");
		assert.equal(calls, 2, "Close never retries Apply");
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, [], "Close never sends Tutor");
		const reopened = createNotebookSession(chat.id, transport); await reopened.refresh();
		assert.equal(reopened.getSnapshot().view!.visible, false);
		assert.deepEqual(reopened.getSnapshot().view!.problem, problem);
		assert.deepEqual(reopened.tutor.draft(owner), session.tutor.draft(owner));
		assert.equal(reopened.getSnapshot().draftText, session.getSnapshot().draftText);
		reopened.dispose();
	} finally { session.dispose(); }
});
