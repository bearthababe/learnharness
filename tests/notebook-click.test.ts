import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-click-");
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("one click absorbs all earlier spoken Apply commands before releasing its finalized instruction", async () => {
	const chat = chatStore.createChat("Combined command prefix"); const editor = createFauxCore({}); const instructions: string[] = [];
	editor.setResponses([context => { instructions.push(JSON.parse(JSON.stringify(context.messages))[0].content.split("CURRENT INSTRUCTION\n\n").at(-1)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "combined-prefix", now: () => time });
	const say = (id: string, text: string, start: number) => capture.final({ id, text, start, end: start + 1, words: text ? [{ text, start, end: start + 0.9 }] : [], speechFinal: true });
	time = 3.5; session.speech.apply();
	say("one", "Apply changes", 1); say("two", "Apply changes", 2); say("silence", "", 3); say("instruction", "Write p=", 0);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.deepEqual(instructions, ["Write p="]);
	assert.deepEqual(chatStore.getChat(chat.id)!.notebook!.operations[0]!.speech!.commandIds, ["one", "two"]);
	assert.equal(service.view(chat.id).draft.text, ""); session.dispose();
});

test("a direct snapshot cannot treat an Apply awaiting transcription as settled working", async () => {
	const chat = chatStore.createChat("Pending transcript snapshot");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("Transcript is not ready"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "My explanation"); await session.tutor.idle();
	await session.speech.choose({ kind: "notebook" }); let time = 0;
	await session.speech.begin({ id: "pending", now: () => time }); time = 2; session.speech.apply(); await session.idle();
	const view = service.view(chat.id); const draft = view.tutorDrafts![0]!;
	const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "snapshot", id: "snapshot", owner, draftId: draft.id, expectedRevision: draft.revision, continuationId: "after", contextId: view.contextId, workingRevision: view.workingRevision }) }), chat.id);
	assert.equal(response.status, 409); assert.match(await response.text(), /pending/);
	assert.deepEqual(service.view(chat.id).snapshots, []); session.dispose();
});

for (const complete of [false, true]) test(`reload of a ${complete ? "completed" : "gapped"} clicked prefix retains later words in Notebook without another editor call`, async () => {
	const chat = chatStore.createChat("Clicked recovery"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
	const fetcher: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "recovery", now: () => time });
	time = 2; session.speech.apply();
	capture.final({ id: "words", start: complete ? 0 : 1, end: 3, text: "Write p= Later. Reasoning.", words: [
		{ text: "Write", start: 1.1, end: 1.2 }, { text: "p=", start: 1.5, end: 1.8 },
		{ text: "Later.", start: 2.2, end: 2.3 }, { text: "Reasoning.", start: 2.6, end: 2.8 },
	], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); session.dispose();
	const reopened = createNotebookSession(chat.id, fetcher, storage);
	await reopened.refresh(); await reopened.idle(); await reopened.speech.idle(); await service.settled(chat.id);
	const view = service.view(chat.id);
	assert.equal(view.usage.calls, complete ? 1 : 0); assert.equal(view.pending, null);
	assert.equal(view.draft.text, complete ? "Later. Reasoning." : "Write p= Later. Reasoning.");
	assert.deepEqual(view.speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.deepEqual(view.snapshots, []); assert.deepEqual(chatStore.getChat(chat.id)!.messages, []); reopened.dispose();
});

test("a click absorbs an earlier split spoken Apply and includes the whole word crossing its cutoff", async () => {
	const chat = chatStore.createChat("Combined request"); const faux = createFauxCore({}); let prompt = "";
	faux.setResponses([context => { prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "combined", now: () => time });
	time = 4; assert.equal(session.speech.apply(), true);
	const say = (text: string, start: number, end: number, speechFinal = true) => capture.final({ id: String(start), text, start, end, words: [{ text, start, end: end - 0.1 }], speechFinal });
	say("Write p=", 0, 1); say("Apply", 1, 1.5, false); say("changes.", 1.5, 2); say("Use F/A", 2, 5);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.match(prompt, /Write p= Use F\/A/); assert.doesNotMatch(prompt, /Apply changes/);
	assert.equal(service.view(chat.id).draft.text, "");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.equal(service.view(chat.id).problem, null); session.dispose();
});

test("silent coverage must pass the click; neither time nor a later isolated final fills a gap", async () => {
	const chat = chatStore.createChat("Silent cutoff"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "silence", now: () => time });
	capture.final({ id: "words", start: 0, end: 1, text: "Write p=", words: [{ text: "Write p=", start: 0.1, end: 0.6 }], speechFinal: true });
	time = 2; session.speech.apply(); time = 300;
	capture.final({ id: "isolated", start: 10, end: 11, text: "", words: [], speechFinal: true });
	await session.idle(); assert.equal(service.view(chat.id).usage.calls, 0);
	capture.final({ id: "before", start: 1, end: 2, text: "", words: [], speechFinal: true });
	await session.idle(); assert.equal(service.view(chat.id).usage.calls, 0);
	capture.final({ id: "past", start: 2, end: 3, text: "", words: [], speechFinal: true });
	await session.idle(); await service.settled(chat.id); await session.refresh(); assert.equal(service.view(chat.id).usage.calls, 1);
	time = 301; session.speech.apply(); session.speech.apply();
	capture.final({ id: "long-silence", start: 3, end: 302, text: "", words: [], speechFinal: true });
	await session.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1, "empty repeated cuts do not call the editor");
	assert.equal(service.view(chat.id).draft.text, ""); session.dispose();
});

test("unattributable formatted words across a click stay recoverable rather than authorizing a partial edit", async () => {
	const chat = chatStore.createChat("Formatted cutoff");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "format", now: () => time });
	time = 2; session.speech.apply();
	capture.final({ id: "number", start: 0, end: 3, text: "25", words: [{ text: "twenty", start: 1.5, end: 1.8 }, { text: "five", start: 2.1, end: 2.5 }], speechFinal: true });
	await session.idle(); await assert.rejects(capture.end("stop"), /interrupted/);
	const view = service.view(chat.id); assert.equal(view.usage.calls, 0); assert.equal(view.pending, null);
	assert.equal(view.speechRuns![0]!.fragments[0]!.text, "25"); assert.equal(view.speechRuns![0]!.unplaced?.length, 1);
	assert.deepEqual(view.lines, []); session.dispose();
});

test("missing, duplicated or short flush responses never release a gap or request more than one follow-up", async () => {
	const chat = chatStore.createChat("Short flush coverage");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No complete instruction"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	const requests: number[] = []; let time = 0;
	const capture = await session.speech.begin({ id: "short", now: () => time, requestFinalization: cutoff => { requests.push(cutoff); } });
	time = 2; session.speech.apply(); await session.idle();
	assert.deepEqual(requests, [2]);
	const early = { id: "early", start: 0, end: 1, text: "Write pressure", words: [{ text: "Write pressure", start: 0.1, end: 0.9 }], speechFinal: true };
	capture.final(early); time = 300; await session.idle();
	assert.deepEqual(requests, [2], "no timer or natural final substitutes for a flush response");
	capture.final({ ...early, fromFinalize: true });
	assert.deepEqual(requests, [2, 2], "a duplicate result can carry the first flush signal without duplicate words");
	capture.final({ ...early, fromFinalize: true });
	capture.final({ id: "short", start: 1, end: 1.9, text: "", words: [], speechFinal: false, fromFinalize: true });
	await session.idle();
	assert.deepEqual(requests, [2, 2]); assert.equal(service.view(chat.id).usage.calls, 0);
	assert.equal(service.view(chat.id).pending?.status, "awaiting-transcript");
	await assert.rejects(capture.end("stop"), /interrupted/);
	assert.equal(service.view(chat.id).draft.text, "Write pressure"); session.dispose();
});
