import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync(join(tmpdir(), "notebook-queue-"));
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Old accepted queues remain readable/recoverable. New controls use settled
// handoffs; their policy is exercised in notebook-handoffs and notebook-ui.
for (const control of ["undo", "start-fresh"] as const) test(`a reopened failed legacy queue permits explicit correction before its saved ${control}`, async () => {
	const chat = chatStore.createChat("Legacy paused control"); const faux = createFauxCore({});
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	faux.setResponses([
		async () => { await held; return fauxAssistantMessage('{"action":"question","question":"Which line?"}'); },
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let view = service.dispatch(chat.id, { type: "visibility", visible: true }).view;
	view = service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text: "Write p=" }).view;
	service.dispatch(chat.id, { type: "apply", id: "legacy-edit", contextId: view.contextId!, draftRevision: view.draft.revision, instruction: view.draft.text });
	service.dispatch(chat.id, { type: control, id: "legacy-control", contextId: view.contextId! });
	release(); await service.settled(chat.id);
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh();
	assert.equal(session.getSnapshot().view?.pending?.kind, control);
	assert.equal(session.getSnapshot().view?.problem?.status, "clarification");
	assert.equal(session.getSnapshot().editing, false, "a paused legacy queue must permit correction");
	assert.equal(session.getSnapshot().sendBlocked, true);
	await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	assert.equal(service.view(chat.id).problem, null); assert.equal(service.view(chat.id).pending, null);
	assert.deepEqual(service.view(chat.id).lines, []);
	if (control === "start-fresh") assert.deepEqual(service.view(chat.id).history[0]!.lines, [{ id: "L1", latex: "p=" }]);
	assert.equal(service.view(chat.id).usage.calls, 2); session.dispose();
});

for (const phase of ["queued", "running", "result-ready", "applied"] as const) test(`a fresh runtime recovers a legacy ordered queue and cutoff snapshot after ${phase}`, async () => {
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

for (const accepted of [false, true]) test(`a ${accepted ? "lost acknowledged" : "locally saved offline"} spoken Apply recovers once with later words in the next draft`, async () => {
	const chat = chatStore.createChat("Spoken request recovery"); const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
	let fail = false;
	const fetcher: typeof fetch = async (_url, init) => {
		if (fail && !accepted) throw new Error("Offline");
		const response = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (fail && init?.body && JSON.parse(String(init.body)).type === "apply") throw new Error("Lost acknowledgment");
		return response;
	};
	const session = createNotebookSession(chat.id, fetcher, storage);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "recovery", now: () => 0 }); fail = true;
	const say = (id: string, text: string, start: number) => capture.final({ id, text, start, end: start + 1, words: [{ text, start, end: start + 0.5 }], speechFinal: true });
	say("instruction", "Write p=", 0); say("apply", "Apply changes", 1); say("later", "Keep later words.", 2);
	await session.idle(); await session.speech.idle(); await service.settled(chat.id); session.dispose(); fail = false;
	const reopened = createNotebookSession(chat.id, fetcher, storage);
	await reopened.refresh(); await reopened.idle(); await reopened.speech.idle(); await service.settled(chat.id); await reopened.refresh();
	assert.equal(service.view(chat.id).usage.calls, 1);
	assert.equal(service.view(chat.id).draft.text, "Keep later words.");
	assert.deepEqual(service.view(chat.id).speechRuns?.flatMap(run => run.unplaced ?? []), []);
	assert.deepEqual(service.view(chat.id).lines, [{ id: "L1", latex: "p=" }]); reopened.dispose();
});

test("reload before command context is known retains words verbatim without executing commands", async () => {
	const chat = chatStore.createChat("Interrupted prefix");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	const fetcher: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, fetcher);
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Keep this typed instruction." }); await session.speech.choose({ kind: "notebook" });
	const capture = await session.speech.begin({ id: "incomplete", now: () => 0 });
	for (const [index, text] of ["Known spoken words.", "Apply changes.", "Later draft.", "Switch to tutor."].entries()) {
		const start = index + 1;
		capture.final({ id: String(index), start, end: start + 1, text, words: [{ text, start, end: start + 0.5 }], speechFinal: true });
	}
	await session.idle(); await session.speech.idle(); session.dispose();
	const reopened = createNotebookSession(chat.id, fetcher);
	await reopened.refresh(); await reopened.speech.idle(); await reopened.idle();
	const view = service.view(chat.id);
	assert.equal(view.pending, null); assert.equal(view.usage.calls, 0);
	assert.equal(view.draft.text, "Keep this typed instruction. Known spoken words. Apply changes. Later draft. Switch to tutor.");
	assert.equal(view.speechRuns![0]!.status, "interrupted"); assert.deepEqual(view.snapshots, []); reopened.dispose();
});

test("legacy dependent instructions recover on clarification and an explicit correction cannot rewrite their snapshot", async () => {
	const chat = chatStore.createChat("Queued clarification");
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	let started!: () => void; const running = new Promise<void>(resolve => { started = resolve; });
	const faux = createFauxCore({}); const inputs: string[] = [];
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
		async () => { started(); await held; return fauxAssistantMessage('{"action":"question","question":"Which denominator?"}'); },
		context => { inputs.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", revision: 1, owner, parts: [{ kind: "text", id: "explanation", text: "My reasoning." }] } });
	function apply(id: string, text: string) {
		let view = service.view(chat.id); service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text }); view = service.view(chat.id);
		return service.dispatch(chat.id, { type: "apply", id, contextId: view.contextId!, draftRevision: view.draft.revision, instruction: text }).view;
	}
	apply("A", "Write p="); await service.settled(chat.id);
	try {
		apply("B", "Double the denominator"); await running;
		const view = apply("C", "Then retain the unfinished line");
		service.dispatch(chat.id, { type: "snapshot", id: "failed-cutoff", owner, draftId: "draft", expectedRevision: 1, continuationId: "after", contextId: view.contextId!, throughOperationId: "C" });
		service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text: "Later words" });
	} finally { release(); await service.settled(chat.id); }
	const failed = service.view(chat.id);
	assert.equal(failed.draft.text, "Double the denominator\n\nThen retain the unfinished line\n\nLater words");
	assert.equal(failed.pending, null); assert.equal(failed.usage.calls, 2);
	const snapshot = failed.tutorDrafts![0]!.parts[1]!;
	assert.equal(snapshot.kind, "working"); if (snapshot.kind !== "working") throw new Error("Expected working");
	assert.equal(snapshot.pending, undefined); assert.deepEqual(snapshot.lines, [{ id: "L1", latex: "p=" }]);
	assert.equal(snapshot.failure, "Some notebook edits failed. Showing the last completed working.");
	const { serializeLearnerExplanation } = await import("../src/core/notebook-content.ts");
	assert.match(serializeLearnerExplanation([snapshot]), /Some notebook edits failed/);
	apply("correction", "Use F/A with twice A; retain p="); await service.settled(chat.id);
	assert.match(inputs[0]!, /Which denominator/); assert.equal(service.view(chat.id).usage.calls, 3);
	assert.equal(service.view(chat.id).problem, null); assert.deepEqual(service.view(chat.id).lines, [{ id: "L1", latex: "p=F/(2A)" }]);
	assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts[1], snapshot);
});
