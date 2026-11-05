import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { after, test } from "node:test";

const dir = fs.mkdtempSync(join(tmpdir(), "notebook-speech-"));
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("starting on an explicitly selected earlier text part preserves its position", async () => {
	const chat = chatStore.createChat("Earlier field");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const owner = { kind: "question" as const, toolCallId: "q", channel: "reading-thinking" as const };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", revision: 1, owner, parts: [{ kind: "text", id: "earlier", text: "Before." }, { kind: "text", id: "later", text: "After." }] } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh();
	session.speech.configure({ tutor: () => ({ kind: "tutor", owner: { ...owner, channel: "thinking" } }), select() {} });
	session.speech.choose({ kind: "tutor", owner, partId: "earlier" });
	const capture = await session.speech.begin({ id: "earlier-part", now: () => 0 });
	capture.final({ id: "words", text: "More before.", start: 1, end: 2, words: [{ text: "More before.", start: 1, end: 2 }], speechFinal: true });
	await capture.end("stop");
	assert.deepEqual(session.tutor.draft(owner)!.parts, [{ kind: "text", id: "earlier", text: "Before. More before." }, { kind: "text", id: "later", text: "After." }]);
});

test("hidden speech reveals once into its original drafts without submitting or applying", async () => {
	const chat = chatStore.createChat("Owned speech");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	const owner = { kind: "ordinary" as const };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "tutor", revision: 1, owner, parts: [{ kind: "text", id: "before", text: "Typed first." }] } });
	const notebook = service.view(chat.id).draft.id;
	const run = { id: "speech", revision: 1, status: "recording", incomplete: false, fragments: [
		{ id: "a", start: 1, end: 2, text: "Spoken reasoning.", target: { kind: "tutor", owner, draftId: "tutor", partId: "before" } },
		{ id: "b", start: 3, end: 4, text: "Write pressure.", target: { kind: "notebook", draftId: notebook } },
	] };
	async function post(value: unknown) {
		const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(value) }), chat.id);
		assert.equal(response.status, 200, await response.clone().text());
		return response.json();
	}
	await post({ type: "speech-run", expectedRevision: 0, run });
	assert.equal(service.view(chat.id).draft.text, "");
	assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts, [{ kind: "text", id: "before", text: "Typed first." }]);
	const reveal = { type: "speech-run", expectedRevision: 1, run: { ...run, revision: 2, status: "revealed" } };
	await post(reveal); await post(reveal);
	const view = service.view(chat.id);
	assert.equal(view.draft.text, "Write pressure.");
	assert.deepEqual(view.tutorDrafts![0]!.parts, [{ kind: "text", id: "before", text: "Typed first. Spoken reasoning." }]);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	assert.equal(view.pending, null);
});

test("untimed speech is retained separately, while cancellation preserves prefilled drafts", async () => {
	const chat = chatStore.createChat("Incomplete speech");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Typed instruction" });
	session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "untimed", now: () => 0 });
	capture.final({ id: "unknown", text: "Keep these words", start: null, end: null, words: [], speechFinal: true });
	await assert.rejects(capture.end("stop"), /interrupted/);
	assert.equal(session.getSnapshot().draftText, "Typed instruction");
	const recovered = service.view(chat.id).speechRuns![0]!;
	assert.equal(recovered.status, "interrupted");
	assert.deepEqual(recovered.unplaced, ["unknown"]);
	assert.equal(recovered.fragments[0]!.text, "Keep these words");
	const cancel = await session.speech.begin({ id: "cancel", now: () => 0 });
	cancel.final({ id: "discard", text: "Not accepted", start: 1, end: 2, words: [{ text: "Not accepted", start: 1, end: 2 }], speechFinal: true });
	await cancel.end("cancel");
	assert.equal(session.getSnapshot().draftText, "Typed instruction");
	assert.deepEqual(service.view(chat.id).speechRuns!.find(run => run.id === "cancel")!.fragments, []);
	const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "discard-speech", runId: "untimed", fragmentId: "unknown" }) }), chat.id);
	assert.equal(response.status, 200, await response.clone().text());
	assert.deepEqual(service.view(chat.id).speechRuns![0]!.discarded, ["unknown"]);
	assert.doesNotMatch(JSON.stringify(service.view(chat.id).speechRuns![0]), /Keep these words/);
});

test("lost reveal acknowledgment recovers without duplicating long prefilled text or replaying a switch", async () => {
	const chat = chatStore.createChat("Lost reveal");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const memory = new Map<string, string>();
	const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
	let fail = false;
	const fetcher: typeof fetch = async (_url, init) => {
		const response = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (fail && init?.body && JSON.parse(String(init.body)).run?.status === "revealed") throw new Error("Lost ACK");
		return response;
	};
	const session = createNotebookSession(chat.id, fetcher, storage); await session.refresh();
	const owner = { kind: "ordinary" as const }; const prefilled = "Long reasoning. ".repeat(1000);
	session.speech.configure({ tutor: () => ({ kind: "tutor", owner, text: prefilled }), select: () => { throw new Error("No command replay"); } });
	const capture = await session.speech.begin({ id: "lost", now: () => 0 });
	capture.final({ id: "word", text: "And the end.", start: 1, end: 2, words: [{ text: "And the end.", start: 1, end: 2 }], speechFinal: true });
	await session.speech.idle(); fail = true;
	await assert.rejects(capture.end("stop"), /Lost ACK/); assert.ok(memory.size);
	fail = false;
	const reopened = createNotebookSession(chat.id, fetcher, storage); await reopened.refresh(); await reopened.speech.idle();
	assert.equal(reopened.tutor.draft(owner)!.parts.filter(part => part.kind === "text").map(part => part.text).join(""), `${prefilled.trimEnd()} And the end.`);
	assert.equal(memory.size, 0);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("reopen delivers a locally retained Stop after offline speech saves", async () => {
	const chat = chatStore.createChat("Offline Stop");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const memory = new Map<string, string>();
	const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
	let offline = false;
	const fetcher: typeof fetch = async (_url, init) => {
		if (offline && init?.method === "POST") throw new Error("Offline");
		return service.handle(new Request("http://test/notebook", init), chat.id);
	};
	const session = createNotebookSession(chat.id, fetcher, storage); await session.refresh();
	const capture = await session.speech.begin({ id: "offline", now: () => 0 });
	offline = true;
	capture.final({ id: "text", text: "Retain this", start: 1, end: 2, words: [{ text: "Retain this", start: 1, end: 2 }], speechFinal: true });
	await assert.rejects(capture.end("stop"), /Offline/);
	offline = false;
	const reopened = createNotebookSession(chat.id, fetcher, storage); await reopened.refresh(); await reopened.speech.idle();
	assert.equal(service.view(chat.id).speechRuns![0]!.status, "revealed");
	assert.match(JSON.stringify(reopened.tutor.draft({ kind: "ordinary" })), /Retain this/);
	assert.equal(memory.size, 0);
});

test("a full local recovery store does not prevent known speech being saved on the server", async () => {
	const chat = chatStore.createChat("Local quota");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const storage = { getItem: () => null, setItem: () => { throw new Error("Local quota"); }, removeItem: () => {} };
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id), storage);
	await session.refresh();
	const capture = await session.speech.begin({ id: "quota", now: () => 0 });
	capture.final({ id: "text", text: "Server saved words", start: 1, end: 2, words: [{ text: "Server saved words", start: 1, end: 2 }], speechFinal: true });
	await capture.end("stop");
	assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Server saved words/);
	assert.match(session.speech.getSnapshot().error!, /Local dictation recovery/);
});

test("a refused recording start releases its run and can retry after saving becomes available", async () => {
	const chat = chatStore.createChat("Start failure");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	let fail = true;
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (fail && init?.body && JSON.parse(String(init.body)).type === "speech-run") throw new Error("Offline");
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh();
	await assert.rejects(session.speech.begin({ id: "failed-start", now: () => 0 }), /Offline/);
	assert.equal(session.speech.isActive(), false);
	fail = false;
	const next = await session.speech.begin({ id: "retry", now: () => 1 });
	await next.end("cancel");
	assert.equal(service.view(chat.id).speechRuns![0]!.status, "interrupted");
});

test("switch finalization keeps formatted speech whole in its original input", async () => {
	const chat = chatStore.createChat("Formatted words");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh();
	const capture = await session.speech.begin({ id: "formatted", now: () => 0 });
	session.speech.configure({ tutor: () => ({ kind: "tutor", owner: { kind: "ordinary" } }), select() {}, finish: async () => {
		capture.final({ id: "number", text: "24", start: 1, end: 3, words: [{ text: "twenty", start: 1.9, end: 2.1 }, { text: "four", start: 2.2, end: 2.4 }], speechFinal: true });
		await capture.end("stop");
	} });
	await session.speech.choose({ kind: "notebook" });
	const run = service.view(chat.id).speechRuns![0]!;
	assert.deepEqual(run.unplaced, []);
	assert.equal(run.fragments[0]!.text, "24");
	assert.equal(session.getSnapshot().draftText, "");
	assert.match(JSON.stringify(session.tutor.draft({ kind: "ordinary" })), /24/);
	assert.equal(session.speech.isActive(), false); session.dispose();
});

test("a spoken switch waits for earlier finals, finishes the original recording and needs a new recording in Notebook", async () => {
	const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
	const chat = chatStore.createChat("Speech switching");
	const faux = createFauxCore({}); faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "pressure" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	const owner = { kind: "ordinary" as const };
	session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	const choices: string[] = [];
	const capture = await session.speech.begin({ id: "switching", now: () => 0 });
	let finished!: () => void; const stopped = new Promise<void>(resolve => { finished = resolve; });
	session.speech.configure({ tutor: () => ({ kind: "tutor", owner }), select: input => choices.push(input.kind), finish: async () => { await capture.end("stop"); finished(); } });
	const result = (id: string, text: string, start: number, speechFinal = false) => ({ id, text, start, end: start + 1, speechFinal, words: text ? text.split(" ").map((text, index) => ({ text, start: start + index / 10, end: start + (index + 1) / 10 })) : [] });
	capture.final(result("silence", "", 0, true));
	capture.final(result("switch", "Switch to notebook!", 2));
	assert.deepEqual(choices, [], "earlier context must be known before acting");
	capture.final(result("edit", "Write force", 3));
	assert.deepEqual(choices, []);
	capture.final(result("late", "Earlier speech.", 1, true));
	await stopped; await session.speech.choose({ kind: "notebook" });
	assert.deepEqual(choices, ["notebook"]);
	assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : "working"), ["Before. Earlier speech. Write force"]);
	assert.equal(session.getSnapshot().draftText, ""); assert.equal(session.speech.isActive(), false);
	const next = await session.speech.begin({ id: "notebook", now: () => 0 });
	next.final(result("next-instruction", "Write force", 0, true)); await next.end("stop");
	assert.equal(session.getSnapshot().draftText, "Write force");
	await session.speech.choose({ kind: "tutor", owner });
	assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before. Earlier speech. Write force", "p=F/A", ""]);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	session.dispose();
});

test("session speech keeps delayed words with their old draft part and restores them on reload", async () => {
	const chat = chatStore.createChat("Speech recovery");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	const memory = new Map<string, string>();
	const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
	const fetcher: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh();
	const owner = { kind: "question" as const, toolCallId: "old", channel: "reading-thinking" as const };
	session.tutor.updateText(owner, "Prefilled."); await session.tutor.idle();
	session.speech.configure({ tutor: () => ({ kind: "tutor", owner }), select: () => {} });
	const capture = await session.speech.begin({ id: "capture", now: () => 0 });
	capture.final({ id: "late", text: "Earlier words.", start: 1, end: 1.8, words: [{ text: "Earlier", start: 1, end: 1.4 }, { text: "words.", start: 1.4, end: 1.8 }], speechFinal: true });
	capture.final({ id: "next", text: "Write force.", start: 3, end: 4, words: [{ text: "Write", start: 3, end: 3.4 }, { text: "force.", start: 3.4, end: 4 }], speechFinal: true });
	await session.speech.idle();
	assert.deepEqual(session.tutor.draft(owner)!.parts, [{ ...session.tutor.draft(owner)!.parts[0], text: "Prefilled." }]);
	assert.equal(session.getSnapshot().draftText, "");
	// A replacement page has no active microphone. Received speech is recovered
	// from the real endpoint, not inferred from whichever field is now mounted.
	const restored = createNotebookSession(chat.id, fetcher, storage);
	await restored.refresh(); await restored.speech.idle();
	assert.deepEqual(restored.tutor.draft(owner)!.parts, [{ ...restored.tutor.draft(owner)!.parts[0], text: "Prefilled. Earlier words. Write force." }]);
	assert.equal(restored.getSnapshot().draftText, "");
	assert.equal(restored.getSnapshot().view!.speechRuns![0]!.status, "interrupted");
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("split switches need an endpoint, embedded phrases remain text, and duplicate finals cannot restart recording", async () => {
	const chat = chatStore.createChat("Command boundaries");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; const input = { kind: "tutor" as const, owner };
	const choices: string[] = [];
	const capture = await session.speech.begin({ id: "commands", now: () => 0 });
	let finished!: () => void; const stopped = new Promise<void>(resolve => { finished = resolve; });
	session.speech.configure({ tutor: () => input, select: input => choices.push(input.kind), finish: async () => { await capture.end("stop"); finished(); } });
	const final = (id: string, text: string, start: number, speechFinal = false) => capture.final({ id, text, start, end: start + 1, speechFinal, words: text ? text.split(" ").map((text, index) => ({ text, start: start + index / 10, end: start + (index + 1) / 10 })) : [] });
	final("silence", "", 0, true);
	final("a", "Switch", 1); final("b", "to notebook", 1.2);
	assert.deepEqual(choices, []);
	final("endpoint", "", 2, true);
	final("embedded", "I could switch to tutor later.", 3, true);
	await stopped; await session.speech.choose({ kind: "notebook" });
	final("b", "to notebook", 1.2);
	assert.deepEqual(choices, ["notebook"]);
	assert.equal(session.speech.isActive(), false);
	assert.equal(session.getSnapshot().draftText, "");
	assert.match(JSON.stringify(session.tutor.draft(owner)), /I could switch to tutor later/);
	assert.doesNotMatch(JSON.stringify(session.tutor.draft(owner)), /SWITCH|Switch/);
	session.dispose();
});
