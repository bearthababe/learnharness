import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { NotebookView } from "../src/core/contracts/notebook.ts";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-queue-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function held() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

for (const phase of ["queued", "running", "result-ready", "applied"] as const) test(`a fresh runtime recovers an ordered queue and cutoff snapshot after ${phase}`, async () => {
	const chat = chatStore.createChat(`Queue crash ${phase}`);
	const child = spawnSync(process.execPath, ["--import", "tsx", "tests/helpers/notebook-queue-crash-worker.ts", chat.id, phase], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
	assert.equal(child.status, 0, child.stderr);
	const faux = createFauxCore({}); let calls = 0;
	faux.setResponses(Array.from({ length: 3 }, () => context => {
		calls++; const prompt = JSON.stringify(context.messages);
		return fauxAssistantMessage(prompt.includes("Double the area") ? '{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}' : prompt.includes("Use F/A") ? '{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/A"}]}' : '{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}');
	}));
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	service.initialize(); await service.settled(chat.id);
	const view = service.view(chat.id);
	if (phase === "running") {
		assert.equal(calls, 0); assert.equal(view.usage.unknownCalls, 1);
		assert.equal(view.draft.text, "Write p=\n\nUse F/A\n\nDouble the area");
		assert.match(JSON.stringify(view.tutorDrafts), /Some notebook edits failed/);
	} else {
		assert.equal(calls, phase === "queued" ? 3 : 2);
		assert.deepEqual(view.lines, [{ id: "L1", latex: "p=F/(2A)" }]);
		assert.deepEqual(view.snapshots![0]!.lines, [{ id: "L1", latex: "p=F/A" }]);
		service.initialize(); await service.settled(chat.id); assert.equal(service.view(chat.id).workingRevision, 3);
	}
});

test("spoken Apply queues A/B, reserves return through B, and keeps C and later reasoning separate", async () => {
	const chat = chatStore.createChat("Continuous spoken Apply"); const provider = held();
	const faux = createFauxCore({}); const instructions: string[] = [];
	faux.setResponses([
		async context => { instructions.push(JSON.stringify(context.messages)); await provider.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); },
		context => { instructions.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); },
		context => { instructions.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(3A)"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "spoken", now: () => 0 });
	capture.final({ id: "silence", text: "", start: 0, end: 1, words: [], speechFinal: true });
	const say = (text: string, start: number) => capture.final({ id: String(start), text, start, end: start + 1, words: text.split(" ").map((text, index) => ({ text, start: start + index / 10, end: start + (index + 1) / 10 })), speechFinal: true });
	try {
		say("Write pressure.", 1); say("Apply changes.", 2);
		say("Double the area.", 3); say("Apply changes!", 4);
		say("Switch to tutor.", 5); say("Larger area lowers pressure.", 6);
		say("Switch to notebook.", 7); say("Triple the area.", 8); say("Apply changes.", 9);
		await session.speech.idle();
		assert.equal(service.view(chat.id).pending?.kind, "edit");
		assert.equal(session.speech.isActive(), true);
		assert.equal(session.getSnapshot().draftText, "");
		assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.pending ? "pending" : "working"), ["Before.", "pending", ""]);
	} finally { provider.resolve(); await service.settled(chat.id); }
	await session.refresh(); await capture.end("stop");
	assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=F/(2A)", "Larger area lowers pressure."]);
	assert.deepEqual(service.view(chat.id).lines, [{ id: "L1", latex: "p=F/(3A)" }]);
	assert.equal(service.view(chat.id).draft.text, "");
	assert.equal(service.view(chat.id).usage.calls, 3);
	assert.doesNotMatch(instructions.join("\n"), /Apply changes/);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("a lost spoken Apply acknowledgment survives reload without applying or revealing its instruction twice", async () => {
	const chat = chatStore.createChat("Spoken receipt");
	const faux = createFauxCore({}); faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
	let offline = false;
	const fetcher: typeof fetch = async (_url, init) => {
		if (offline) throw new Error("offline");
		const result = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (init?.body && JSON.parse(String(init.body)).type === "apply") { offline = true; throw new Error("Lost acknowledgment"); }
		return result;
	};
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "lost", now: () => 0 });
	capture.final({ id: "words", start: 0, end: 1, text: "Write p=", words: [{ text: "Write p=", start: 0, end: 1 }], speechFinal: true });
	capture.final({ id: "command", start: 1, end: 2, text: "Apply changes", words: [{ text: "Apply changes", start: 1, end: 2 }], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id);
	const reopened = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id), storage);
	await reopened.refresh(); await reopened.speech.idle(); await reopened.idle();
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.equal(reopened.getSnapshot().draftText, "");
});

test("a late earlier final holds spoken Apply and its return snapshot until the instruction is complete", async () => {
	const chat = chatStore.createChat("Late prefix");
	const faux = createFauxCore({}); const inputs: string[] = [];
	faux.setResponses([context => { inputs.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "late", now: () => 0 });
	capture.final({ id: "tail", start: 1, end: 2, text: "pressure.", words: [{ text: "pressure.", start: 1, end: 1.5 }], speechFinal: true });
	capture.final({ id: "apply", start: 2, end: 3, text: "Apply changes.", words: [{ text: "Apply changes.", start: 2, end: 2.5 }], speechFinal: true });
	capture.final({ id: "return", start: 3, end: 4, text: "Switch to tutor.", words: [{ text: "Switch to tutor.", start: 3, end: 3.5 }], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id);
	assert.equal(service.view(chat.id).usage.calls, 0, "an omitted earlier final cannot authorize a truncated edit");
	assert.equal(service.view(chat.id).pending?.status, "awaiting-transcript");
	capture.final({ id: "earlier", start: 0, end: 1, text: "Write the", words: [{ text: "Write the", start: 0, end: 0.8 }], speechFinal: true });
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await session.refresh();
	assert.match(inputs[0]!, /Write the pressure/);
	await capture.end("stop");
	assert.equal(service.view(chat.id).draft.text, "");
	assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /p=F\/A/);
});

test("completing an earlier transcript cannot move a return cutoff behind a later requested Apply", async () => {
	const chat = chatStore.createChat("Completion order"); const faux = createFauxCore({}); const heldAck = held(); const ackReached = held();
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/A"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (init?.body) { const command = JSON.parse(String(init.body)); if (command.type === "apply" && command.speech.ready) { ackReached.resolve(); await heldAck.promise; } }
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "completion-order", now: () => 0 });
	const say = (text: string, start: number) => capture.final({ id: String(start), text, start, end: start + 1, words: text ? [{ text, start, end: start + 0.5 }] : [], speechFinal: true });
	try {
		say("Write p=", 1); say("Apply changes", 2); say("Apply changes", 4);
		await session.idle(); await session.speech.idle();
		const cutoff = service.view(chat.id).lastOperationId;
		say("", 0); await ackReached.promise; say("Switch to tutor", 5);
		heldAck.resolve(); say("Use F/A", 3); await session.idle(); await session.speech.idle(); await service.settled(chat.id);
		assert.equal(service.view(chat.id).snapshots![0]!.throughOperationId, cutoff);
	} finally { heldAck.resolve(); await session.idle(); await session.speech.idle(); await service.settled(chat.id); }
});

test("reload of an incomplete spoken Apply retains known instructions and resolves its snapshot as failed without a model call", async () => {
	const chat = chatStore.createChat("Interrupted prefix");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	const fetcher: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, fetcher);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Keep this typed instruction." });
	session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "incomplete", now: () => 0 });
	capture.final({ id: "words", start: 1, end: 2, text: "Known spoken words.", words: [{ text: "Known spoken words.", start: 1, end: 1.5 }], speechFinal: true });
	capture.final({ id: "apply", start: 2, end: 3, text: "Apply changes.", words: [{ text: "Apply changes.", start: 2, end: 2.5 }], speechFinal: true });
	capture.final({ id: "later", start: 3, end: 4, text: "Later draft.", words: [{ text: "Later draft.", start: 3, end: 3.5 }], speechFinal: true });
	capture.final({ id: "return", start: 4, end: 5, text: "Switch to tutor.", words: [{ text: "Switch to tutor.", start: 4, end: 4.5 }], speechFinal: true });
	await session.idle(); await session.speech.idle();
	const reopened = createNotebookSession(chat.id, fetcher);
	await reopened.refresh(); await reopened.speech.idle(); await reopened.idle();
	const view = service.view(chat.id);
	assert.equal(view.pending, null);
	assert.equal(view.usage.calls, 0);
	assert.equal(view.draft.text, "Keep this typed instruction. Known spoken words. Later draft.");
	assert.match(JSON.stringify(view.tutorDrafts), /Some notebook edits failed/);
	assert.doesNotMatch(JSON.stringify(view.tutorDrafts), /"pending":true/);
});

test("empty and duplicate Apply commands do not call the editor; split Apply stays out of Tutor reasoning", async () => {
	const chat = chatStore.createChat("Command boundaries"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "commands", now: () => 0 });
	const say = (id: string, text: string, start: number, speechFinal = true) => capture.final({ id, text, start, end: start + 1, words: [{ text, start, end: start + 0.5 }], speechFinal });
	say("empty", "Apply changes.", 0); await session.idle(); await service.settled(chat.id);
	assert.equal(service.view(chat.id).usage.calls, 0);
	say("instruction", "Write p=", 1);
	say("first", "Apply", 2, false); say("second", "changes!", 3);
	say("second", "changes!", 3);
	say("return", "Switch to tutor", 4);
	say("tutor", "Apply changes.", 5);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "");
	assert.equal(session.tutor.draft({ kind: "ordinary" })!.parts.at(-1)!.kind === "text" && (session.tutor.draft({ kind: "ordinary" })!.parts.at(-1) as { text: string }).text, "Apply changes.");
});

test("a requested spoken Apply saved offline resumes once after reload and later speech remains in the next draft", async () => {
	const chat = chatStore.createChat("Offline spoken request"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
	let offline = false;
	const fetcher: typeof fetch = async (_url, init) => { if (offline) throw new Error("offline"); return service.handle(new Request("http://test/notebook", init), chat.id); };
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "offline", now: () => 0 });
	offline = true;
	const say = (id: string, text: string, start: number) => capture.final({ id, text, start, end: start + 1, words: [{ text, start, end: start + 0.5 }], speechFinal: true });
	say("instruction", "Write p=", 0); say("apply", "Apply changes", 1); say("later", "Keep later words.", 2);
	await session.idle(); await session.speech.idle();
	offline = false;
	const reopened = createNotebookSession(chat.id, fetcher, storage);
	await reopened.refresh(); await reopened.idle(); await reopened.speech.idle(); await service.settled(chat.id); await reopened.refresh();
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "Keep later words.", JSON.stringify({ view: service.view(chat.id), client: reopened.getSnapshot(), recovery: [...data] }));
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.deepEqual(service.view(chat.id).lines, [{ id: "L1", latex: "p=" }]);
});

test("a queued spoken request arriving after an earlier failure is retained rather than treated as a correction", async () => {
	const chat = chatStore.createChat("Failure before intake"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"question","question":"Which line?"}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let applyCalls = 0;
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (init?.body && JSON.parse(String(init.body)).type === "apply" && ++applyCalls === 2) await service.settled(chat.id);
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "failure", now: () => 0 });
	const say = (text: string, start: number) => capture.final({ id: String(start), text, start, end: start + 1, words: [{ text, start, end: start + 0.5 }], speechFinal: true });
	say("Change that line.", 0); say("Apply changes.", 1); say("Then keep p=", 2); say("Apply changes.", 3); say("Later words.", 4);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "Change that line.\n\nThen keep p= Later words.");
	assert.equal(service.view(chat.id).pending, null);
});

test("late words for an incomplete dependent edit join the retained correction after the earlier edit fails", async () => {
	const chat = chatStore.createChat("Late recovery words"); const faux = createFauxCore({}); const provider = held();
	faux.setResponses([async () => { await provider.promise; return fauxAssistantMessage('{"action":"question","question":"Which line?"}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "late-recovery", now: () => 0 });
	const say = (text: string, start: number) => capture.final({ id: String(start), text, start, end: start + 1, words: [{ text, start, end: start + 0.5 }], speechFinal: true });
	try { say("Change that line.", 0); say("Apply changes.", 1); say("Apply changes.", 3); await session.idle(); await session.speech.idle(); }
	finally { provider.resolve(); await service.settled(chat.id); }
	say("Keep the unfinished p=", 2); say("Later words.", 4);
	await session.idle(); await session.speech.idle(); await capture.end("stop");
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "Change that line.\n\nKeep the unfinished p= Later words.");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
});

test("return after a completed failure includes its notice even when working has not changed", async () => {
	process.env.OPENROUTER_API_KEY = "test-key";
	const chat = chatStore.createChat("Failed return"); const faux = createFauxCore({});
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	faux.setResponses([() => fauxAssistantMessage('{"action":"question","question":"Which denominator?"}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "I need help."); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "Double that denominator" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	await session.tutor.returnToTutor(owner);
	const input = await session.tutor.prepareSubmission(owner);
	assert.match(JSON.stringify(input.explanation), /Some notebook edits failed/);
	const { serializeLearnerExplanation } = await import("../src/core/notebook-content.ts");
	assert.match(serializeLearnerExplanation(input.explanation!), /I need help.[\s\S]*Some notebook edits failed/);
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	const { sessionMarkdown } = await import("../src/core/session-markdown.ts");
	const tutor = createFauxCore({}); let seen = ""; let calls = 0;
	tutor.setResponses([context => { calls++; seen = JSON.stringify(context.messages.filter(message => message.role === "user")); return fauxAssistantMessage("Let's clarify your intended working."); }]);
	const factory: Parameters<typeof handleChatRequest>[1] = options => createTeacherAgent(undefined, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: options.messages });
	const send = () => handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", ...input } }) }), factory);
	const response = await send(); assert.equal(response.status, 200, await response.clone().text());
	const running = runningTurn(chat.id); if (running) await new Response(running.subscribe()).text();
	assert.equal((await send()).status, 200);
	assert.equal(calls, 1);
	assert.match(seen, /I need help.[\s\S]*Some notebook edits failed/);
	assert.doesNotMatch(seen, /Double that denominator|Which denominator|"pending":true/);
	assert.match(sessionMarkdown(chatStore.getChat(chat.id)!.messages), /Some notebook edits failed/);
});

test("return reserves a continuation immediately while the requested edit is still running", async () => {
	const chat = chatStore.createChat("Client pending return");
	const gate = held(); const started = held();
	const faux = createFauxCore({});
	faux.setResponses([async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const };
	session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	try {
		await session.dispatch({ type: "draft", text: "Write pressure" }); await session.dispatch({ type: "apply" }); await started.promise;
		const returned = session.tutor.returnToTutor(owner);
		assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.pending ? "pending" : "working"), ["Before.", "pending", ""]);
		session.tutor.updateText(owner, "After."); await returned; await session.tutor.idle();
	} finally { gate.resolve(); await service.settled(chat.id); }
	await session.refresh();
	const draft = session.tutor.draft(owner)!;
	assert.deepEqual(draft.parts.map(part => part.kind === "text" ? part.text : part.pending ? "pending" : part.lines[0]?.latex), ["Before.", "p=F/A", "After."]);
	assert.equal(session.tutor.getSnapshot().recovery.length, 0);
});

test("two rapid returns reserve distinct snapshot positions while the first snapshot save is delayed", async () => {
	const chat = chatStore.createChat("Two returns"); const delivery = held(); const requested = held(); const provider = held();
	const faux = createFauxCore({}); faux.setResponses([
		async () => { await provider.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); },
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/A"}]}'),
	]);
	let delayed = false;
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (init?.body && JSON.parse(String(init.body)).type === "snapshot" && !delayed) { delayed = true; requested.resolve(); await delivery.promise; }
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before A."); await session.tutor.idle();
	try {
		await session.dispatch({ type: "draft", text: "Write p=" }); await session.dispatch({ type: "apply" });
		void session.tutor.returnToTutor(owner); await requested.promise;
		session.tutor.updateText(owner, "Between A and B.");
		void session.dispatch({ type: "draft", text: "Use F/A" }); void session.dispatch({ type: "apply" });
		void session.tutor.returnToTutor(owner);
		session.tutor.updateText(owner, "After B.");
		assert.equal(session.tutor.draft(owner)!.parts.length, 5);
	} finally { delivery.resolve(); provider.resolve(); await session.idle(); await session.tutor.idle(); await service.settled(chat.id); await session.refresh(); }
	assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before A.", "p=", "Between A and B.", "p=F/A", "After B."]);
});

test("return immediately after Apply binds to that request before its acknowledgment arrives", async () => {
	const chat = chatStore.createChat("Unacknowledged cutoff"); const acknowledgment = held(); const accepted = held(); const provider = held();
	const faux = createFauxCore({}); faux.setResponses([async () => { await provider.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		const response = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (init?.body && JSON.parse(String(init.body)).type === "apply") { accepted.resolve(); await acknowledgment.promise; }
		return response;
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "Write p=" });
	let returned!: Promise<void>;
	try {
		const apply = session.dispatch({ type: "apply" }); await accepted.promise;
		returned = session.tutor.returnToTutor(owner);
		assert.equal(session.tutor.draft(owner)!.parts.length, 3, "return must reserve before an HTTP acknowledgment");
		acknowledgment.resolve(); await apply; await returned;
	} finally { acknowledgment.resolve(); provider.resolve(); await service.settled(chat.id); }
	await session.refresh();
	assert.match(JSON.stringify(session.tutor.draft(owner)!.parts), /p=/);
});

test("working resolving during an in-flight prose save preserves the prose without a false draft conflict", async () => {
	const chat = chatStore.createChat("Snapshot save race"); const provider = held(); const saving = held(); const deliver = held();
	const faux = createFauxCore({}); faux.setResponses([async () => { await provider.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let delay = false;
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (delay && init?.body && JSON.parse(String(init.body)).type === "tutor-draft") { delay = false; saving.resolve(); await deliver.promise; }
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	try {
		await session.dispatch({ type: "draft", text: "Write p=" }); await session.dispatch({ type: "apply" }); await session.tutor.returnToTutor(owner);
		delay = true; session.tutor.updateText(owner, "New words."); await saving.promise;
		provider.resolve(); await service.settled(chat.id); await session.refresh();
	} finally { provider.resolve(); deliver.resolve(); await service.settled(chat.id); await session.tutor.idle(); }
	assert.equal(session.tutor.getSnapshot().recovery.length, 0);
	assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=", "New words."]);
});

test("explicit Send waits for its reserved working and never freezes a pending placeholder", async () => {
	const chat = chatStore.createChat("Send barrier");
	const gate = held(); const started = held();
	const faux = createFauxCore({});
	faux.setResponses([async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	let prepared: Awaited<ReturnType<typeof session.tutor.prepareSubmission>> | undefined;
	let send!: Promise<void>;
	try {
		await session.dispatch({ type: "draft", text: "Write pressure" }); await session.dispatch({ type: "apply" }); await started.promise;
		await session.tutor.returnToTutor(owner);
		session.tutor.updateText(owner, "After."); await session.tutor.idle();
		send = session.tutor.prepareSubmission(owner).then(input => { prepared = input; });
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.equal(prepared, undefined, "Send must not package a pending working part");
		session.tutor.updateText(owner, "Newer words stay unsent.");
	} finally { gate.resolve(); await service.settled(chat.id); await session.refresh(); }
	await send;
	assert.deepEqual(prepared!.explanation!.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=F/A", "After."]);
	assert.equal(prepared!.explanation!.some(part => part.kind === "working" && part.pending), false);
	assert.equal(session.tutor.draft(owner)!.parts.at(-1)!.kind === "text" && (session.tutor.draft(owner)!.parts.at(-1) as { text: string }).text, "Newer words stay unsent.");
	assert.equal(session.tutor.getSnapshot().recovery.length, 0);
});

test("a failed pending edit stops a waiting written answer; a later explicit Send carries the failure note", async () => {
	const chat = chatStore.createChat("Failed Send barrier"); const gate = held(); const started = held();
	const faux = createFauxCore({});
	faux.setResponses([async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"question","question":"Which denominator?"}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "question" as const, toolCallId: "question", channel: "text" as const };
	session.tutor.updateText(owner, "My answer."); await session.tutor.idle();
	const answer = { kind: "explain" as const, questionText: "Pressure?", answers: [], dontKnow: false, answeredAt: "now" };
	let sent = false; let refused!: Promise<unknown>;
	try {
		await session.dispatch({ type: "draft", text: "Double the denominator" }); await session.dispatch({ type: "apply" }); await started.promise;
		await session.tutor.returnToTutor(owner);
		const pending = session.tutor.prepareAnswer(owner, answer).then(value => { sent = true; return value; });
		refused = assert.rejects(pending, /Review the retained draft/);
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.equal(sent, false);
	} finally { gate.resolve(); await service.settled(chat.id); await session.refresh(); }
	await refused;
	assert.equal(session.tutor.getSnapshot().recovery.length, 0);
	const retry = await session.tutor.prepareAnswer(owner, answer);
	assert.equal(retry.answer.text, "My answer.");
	assert.match(JSON.stringify(retry.answer.textContent), /Some notebook edits failed/);
	assert.equal(service.view(chat.id).draft.text, "Double the denominator");
});

test("leaving while Send waits cancels that Send and keeps the draft for reopening", { timeout: 3000 }, async () => {
	const chat = chatStore.createChat("Leave pending Send"); const provider = held();
	const faux = createFauxCore({}); faux.setResponses([async () => { await provider.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Keep my explanation."); await session.tutor.idle();
	try {
		await session.dispatch({ type: "draft", text: "Write p=" }); await session.dispatch({ type: "apply" }); await session.tutor.returnToTutor(owner);
		const sent = session.tutor.prepareSubmission(owner);
		await new Promise<void>(resolve => setImmediate(resolve));
		const rejected = assert.rejects(sent, /Send cancelled/);
		session.dispose();
		await rejected;
	} finally { provider.resolve(); await service.settled(chat.id); }
	assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Keep my explanation/);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("successive accepted edits run in order against the latest working while their page is absent", async () => {
	const chat = chatStore.createChat("Ordered pressure");
	const gate = held(); const started = held(); const inputs: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses([
		async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); },
		context => { inputs.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	async function post(command: unknown) {
		const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(command) }), chat.id);
		assert.ok(response.ok, await response.clone().text());
		return (await response.json()).view as NotebookView;
	}
	let view = await post({ type: "visibility", visible: true });
	try {
		view = await post({ type: "draft", expectedRevision: view.draft.revision, text: "Write pressure" });
		view = await post({ type: "apply", id: "A", contextId: view.contextId, draftRevision: view.draft.revision, instruction: view.draft.text });
		await started.promise;
		view = await post({ type: "draft", expectedRevision: view.draft.revision, text: "Double the area" });
		const second = { type: "apply", id: "B", contextId: view.contextId, draftRevision: view.draft.revision, instruction: view.draft.text };
		view = await post(second); await post(second);
		await post({ type: "draft", expectedRevision: view.draft.revision, text: "Later unsent instruction" });
	} finally { gate.resolve(); await service.settled(chat.id); }
	const reopened = createNotebookService({ chatStore, engine: async () => { throw new Error("No repeat calls"); } }).view(chat.id);
	assert.deepEqual(reopened.lines, [{ id: "L1", latex: "p=F/(2A)" }]);
	assert.equal(reopened.workingRevision, 2);
	assert.equal(reopened.draft.text, "Later unsent instruction");
	assert.match(inputs[0]!, /p=F\/A/);
	assert.equal(reopened.usage.calls, 2);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("a reserved return snapshot includes A and B but never the later C, even after reopening", async () => {
	const chat = chatStore.createChat("Snapshot cutoff");
	const gate = held(); const started = held();
	const faux = createFauxCore({});
	faux.setResponses([
		async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'); },
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(3A)"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	async function post(command: unknown) {
		const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(command) }), chat.id);
		assert.ok(response.ok, await response.clone().text()); return (await response.json()).view as NotebookView;
	}
	const owner = { kind: "ordinary" as const };
	await post({ type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", revision: 1, owner, parts: [{ kind: "text", id: "before", text: "First explanation." }] } });
	async function apply(id: string, text: string) {
		let view = service.view(chat.id);
		view = await post({ type: "draft", expectedRevision: view.draft.revision, text });
		return post({ type: "apply", id, contextId: view.contextId, draftRevision: view.draft.revision, instruction: text });
	}
	try {
		await apply("A", "Write pressure"); await started.promise;
		const view = await apply("B", "Double the area");
		const pending = await post({ type: "snapshot", id: "through-B", owner, draftId: "draft", expectedRevision: 1, continuationId: "after", contextId: view.contextId, throughOperationId: "B" });
		assert.deepEqual(pending.tutorDrafts![0]!.parts.map(part => part.kind), ["text", "working", "text"]);
		assert.equal((pending.tutorDrafts![0]!.parts[1] as { pending?: boolean }).pending, true);
		await apply("C", "Triple the area");
	} finally { gate.resolve(); await service.settled(chat.id); }
	const reopened = createNotebookService({ chatStore, engine: async () => { throw new Error("No repeat calls"); } }).view(chat.id);
	assert.deepEqual(reopened.lines, [{ id: "L1", latex: "p=F/(3A)" }]);
	const snapshot = reopened.tutorDrafts![0]!.parts[1]!;
	assert.deepEqual(snapshot, { id: "through-B", kind: "working", snapshotId: "through-B", contextId: reopened.contextId, revision: 2, lines: [{ id: "L1", latex: "p=F/(2A)" }] });
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
});

test("a clarification returns every dependent instruction before later words and only explicit correction resumes", async () => {
	const chat = chatStore.createChat("Queued clarification");
	const gate = held(); const started = held(); const inputs: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
		async () => { started.resolve(); await gate.promise; return fauxAssistantMessage('{"action":"question","question":"Which denominator?"}'); },
		context => { inputs.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", revision: 1, owner, parts: [{ kind: "text", id: "explanation", text: "My reasoning." }] } });
	function apply(id: string, text: string) {
		let view = service.view(chat.id);
		service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text });
		view = service.view(chat.id);
		return service.dispatch(chat.id, { type: "apply", id, contextId: view.contextId!, draftRevision: view.draft.revision, instruction: text }).view;
	}
	apply("A", "Write p="); await service.settled(chat.id);
	try {
		apply("B", "Double the denominator"); await started.promise;
		const view = apply("C", "Then retain the unfinished line");
		service.dispatch(chat.id, { type: "snapshot", id: "failed-cutoff", owner, draftId: "draft", expectedRevision: 1, continuationId: "after", contextId: view.contextId!, throughOperationId: "C" });
		service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text: "Later words" });
	} finally { gate.resolve(); await service.settled(chat.id); }
	const failed = service.view(chat.id);
	assert.equal(failed.draft.text, "Double the denominator\n\nThen retain the unfinished line\n\nLater words");
	assert.equal(failed.problem?.instruction, "Double the denominator\n\nThen retain the unfinished line");
	assert.equal(failed.pending, null, "dependent edits are returned, not silently resumed after correction");
	assert.equal(failed.usage.calls, 2);
	const snapshot = failed.tutorDrafts![0]!.parts[1]!;
	assert.equal(snapshot.kind, "working");
	if (snapshot.kind !== "working") throw new Error("Expected working");
	assert.equal(snapshot.pending, undefined);
	assert.deepEqual(snapshot.lines, [{ id: "L1", latex: "p=" }]);
	assert.equal(snapshot.failure, "Some notebook edits failed. Showing the last completed working.");
	const { serializeLearnerExplanation } = await import("../src/core/notebook-content.ts");
	assert.match(serializeLearnerExplanation([snapshot]), /Some notebook edits failed/);
	assert.equal(service.view(chat.id).draft.text, failed.draft.text, "repeated reads cannot restore twice");
	apply("correction", "Use F/A with twice A; retain p="); await service.settled(chat.id);
	assert.match(inputs[0]!, /Which denominator/);
	assert.equal(service.view(chat.id).usage.calls, 3);
	assert.equal(service.view(chat.id).problem, null);
	assert.deepEqual(service.view(chat.id).lines, [{ id: "L1", latex: "p=F/(2A)" }]);
	assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts[1], snapshot, "correction cannot rewrite the earlier failed snapshot");
});
