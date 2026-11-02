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

test("a direct snapshot cannot treat an Apply awaiting transcription as settled working", async () => {
	const chat = chatStore.createChat("Pending transcript snapshot");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("Transcript is not ready"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "My explanation"); await session.tutor.idle();
	session.speech.choose({ kind: "notebook" }); let time = 0;
	await session.speech.begin({ id: "pending", now: () => time }); time = 2; session.speech.apply(); await session.idle();
	const view = service.view(chat.id); const draft = view.tutorDrafts![0]!;
	const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "snapshot", id: "snapshot", owner, draftId: draft.id, expectedRevision: draft.revision, continuationId: "after", contextId: view.contextId, workingRevision: view.workingRevision }) }), chat.id);
	assert.equal(response.status, 409);
	assert.match(await response.text(), /pending/);
	assert.deepEqual(service.view(chat.id).snapshots, []); session.dispose();
});

for (const laterWordsFirst of [false, true]) test(`delayed spoken Apply after a focus roundtrip preserves the next draft (${laterWordsFirst ? "later words first" : "command first"})`, async () => {
	const chat = chatStore.createChat("Delayed ownership"); const editor = createFauxCore({});
	const instructions: string[] = [];
	editor.setResponses([context => {
		instructions.push(JSON.parse(JSON.stringify(context.messages))[0].content.split("CURRENT INSTRUCTION\n\n").at(-1));
		return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}');
	}]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, transport);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "late", now: () => time });
	const say = (id: string, text: string, start: number, end: number) => capture.final({ id, text, start, end, words: [{ text, start, end: end - 0.1 }], speechFinal: true });
	say("instruction", "Write p=", 0, 1);
	time = 2.5; session.speech.choose({ kind: "tutor", owner: { kind: "ordinary" } });
	time = 3; session.speech.choose({ kind: "notebook" });
	if (laterWordsFirst) say("later", "Keep these later words.", 3, 4);
	say("apply", "Apply changes", 1, 2);
	if (!laterWordsFirst) say("later", "Keep these later words.", 3, 4);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.deepEqual(instructions, ["Write p="]);
	assert.equal(service.view(chat.id).draft.text, "Keep these later words.");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	session.dispose(); const reopened = createNotebookSession(chat.id, transport); await reopened.refresh();
	assert.equal(reopened.getSnapshot().draftText, "Keep these later words.");
	assert.equal(service.view(chat.id).usage.calls, 1); reopened.dispose();
});

for (const complete of [false, true]) test(`reload of a ${complete ? "completed" : "gapped"} clicked prefix preserves later words without an extra editor call`, async () => {
	const chat = chatStore.createChat("Clicked recovery"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
	const fetcher: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "recovery", now: () => time });
	time = 2; session.speech.apply(); time = 2.5;
	session.speech.choose({ kind: "tutor", owner: { kind: "ordinary" } });
	capture.final({ id: "words", start: complete ? 0 : 1, end: 3, text: "Write p= Later. Reasoning.", words: [
		{ text: "Write", start: 1.1, end: 1.2 }, { text: "p=", start: 1.5, end: 1.8 },
		{ text: "Later.", start: 2.2, end: 2.3 }, { text: "Reasoning.", start: 2.6, end: 2.8 },
	], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id);
	const reopened = createNotebookSession(chat.id, fetcher, storage);
	await reopened.refresh(); await reopened.idle(); await reopened.speech.idle(); await service.settled(chat.id);
	const view = service.view(chat.id);
	assert.equal(view.usage.calls, complete ? 1 : 0);
	assert.equal(view.pending, null);
	assert.equal(view.draft.text, complete ? "Later." : "Write p= Later.");
	assert.deepEqual(view.speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.equal(view.snapshots![0]!.status, complete ? "resolved" : "failed");
	const last = view.tutorDrafts![0]!.parts.at(-1)!;
	assert.equal(last.kind === "text" && last.text, "Reasoning.");
});

test("a click covers an earlier spoken Apply recognized late, without applying command words or duplicating the edit", async () => {
	const chat = chatStore.createChat("Combined request"); const faux = createFauxCore({}); let prompt = "";
	faux.setResponses([context => { prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "combined", now: () => time });
	time = 4; assert.equal(session.speech.apply(), true);
	const say = (text: string, start: number, end: number, speechFinal = true) => capture.final({ id: String(start), text, start, end, words: [{ text, start, end: end - 0.1 }], speechFinal });
	say("Write p=", 0, 1); say("Apply", 1, 1.5, false); say("changes.", 1.5, 2); say("Use F/A", 2, 5);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.match(prompt, /Write p= Use F\/A/); assert.doesNotMatch(prompt, /Apply changes/);
	assert.equal(service.view(chat.id).draft.text, "");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.equal(service.view(chat.id).problem, null);
});

test("silent coverage must pass the click; neither time nor a later isolated final fills a gap", async () => {
	const chat = chatStore.createChat("Silent cutoff"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "silence", now: () => time });
	capture.final({ id: "words", start: 0, end: 1, text: "Write p=", words: [{ text: "Write p=", start: 0.1, end: 0.6 }], speechFinal: true });
	time = 2; session.speech.apply(); time = 300;
	capture.final({ id: "isolated", start: 10, end: 11, text: "", words: [], speechFinal: true });
	await session.idle(); assert.equal(service.view(chat.id).usage.calls, 0);
	capture.final({ id: "before", start: 1, end: 2, text: "", words: [], speechFinal: true });
	await session.idle(); assert.equal(service.view(chat.id).usage.calls, 0);
	capture.final({ id: "past", start: 2, end: 3, text: "", words: [], speechFinal: true });
	await session.idle(); await service.settled(chat.id); assert.equal(service.view(chat.id).usage.calls, 1);
	time = 301; session.speech.apply(); session.speech.apply();
	capture.final({ id: "long-silence", start: 3, end: 302, text: "", words: [], speechFinal: true });
	await session.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1, "empty repeated cuts do not call the editor");
	assert.equal(service.view(chat.id).draft.text, "");
});

test("unattributable formatted words across a click stay recoverable rather than authorizing a partial edit", async () => {
	const chat = chatStore.createChat("Formatted cutoff");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "format", now: () => time });
	time = 2; session.speech.apply();
	capture.final({ id: "number", start: 0, end: 3, text: "25", words: [{ text: "twenty", start: 1.5, end: 1.8 }, { text: "five", start: 2.1, end: 2.5 }], speechFinal: true });
	await session.idle(); await assert.rejects(capture.end("stop"), /interrupted/);
	const view = service.view(chat.id); assert.equal(view.usage.calls, 0); assert.equal(view.pending, null);
	assert.equal(view.speechRuns![0]!.fragments[0]!.text, "25"); assert.equal(view.speechRuns![0]!.unplaced?.length, 1);
	assert.deepEqual(view.lines, []);
});

test("repeated clicks and later spoken Apply share ordering while one delayed result crosses both click cutoffs", async () => {
	const chat = chatStore.createChat("Mixed cutoffs"); const faux = createFauxCore({}); const instructions: string[] = [];
	faux.setResponses(["p=", "p=F/A", "p=F/(2A)"].map((latex, index) => context => {
		instructions.push(JSON.parse(JSON.stringify(context.messages))[0].content.split("CURRENT INSTRUCTION\n\n").at(-1));
		return fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [index === 0 ? { op: "insert", after: null, id: "L1", latex } : { op: "replace", id: "L1", latex }] }));
	}));
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	let time = 0; const capture = await session.speech.begin({ id: "mixed", now: () => time });
	time = 2; session.speech.apply(); time = 3; session.speech.apply();
	time = 3.5; session.speech.choose({ kind: "tutor", owner: { kind: "ordinary" } });
	capture.final({ id: "spanning", start: 1, end: 4, text: "Write p= Use F/A Later notebook. Reasoning.", words: [
		{ text: "Write", start: 1.6, end: 1.8 }, { text: "p=", start: 1.9, end: 2.2 }, { text: "Use", start: 2.5, end: 2.6 }, { text: "F/A", start: 2.9, end: 3.2 },
		{ text: "Later", start: 3.3, end: 3.34 }, { text: "notebook.", start: 3.4, end: 3.45 }, { text: "Reasoning.", start: 3.6, end: 3.9 },
	], speechFinal: true });
	await session.idle(); await session.speech.idle(); assert.equal(service.view(chat.id).usage.calls, 0);
	capture.final({ id: "silence", start: 0, end: 1, text: "", words: [], speechFinal: false });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id);
	time = 4; session.speech.choose({ kind: "notebook" });
	capture.final({ id: "instruction", start: 4, end: 5, text: "Double the area.", words: [{ text: "Double the area.", start: 4.1, end: 4.7 }], speechFinal: true });
	capture.final({ id: "command", start: 5, end: 6, text: "Apply changes", words: [{ text: "Apply changes", start: 5.1, end: 5.8 }], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.deepEqual(instructions, ["Write p=", "Use F/A", "Later notebook. Double the area."]);
	assert.deepEqual(service.view(chat.id).snapshots![0]!.lines, [{ id: "L1", latex: "p=F/A" }]);
	assert.deepEqual(session.tutor.draft({ kind: "ordinary" })!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["", "p=F/A", "Reasoning."]);
	assert.equal(service.view(chat.id).draft.text, "");
});
