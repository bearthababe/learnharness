import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-handoffs-");
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("Send is refused during recording and holds its draft fixed until the result is reconciled", async () => {
	const chat = chatStore.createChat("Explicit Send");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No edit requested"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
	const capture = await session.speech.begin({ id: "send-recording", now: () => 0 });
	await assert.rejects(session.tutor.prepareSubmission(owner), /Finish dictation/);
	await capture.end("stop");
	const prepared = await session.tutor.prepareSubmission(owner);
	assert.equal(session.tutor.getSnapshot().locked, true);
	await assert.rejects(session.speech.begin({ id: "locked-recording", now: () => 0 }), /Finish sending/);
	session.tutor.updateText(owner, "Change during Send");
	await assert.rejects(session.tutor.returnToTutor(owner), /Finish the current action/);
	const first = session.tutor.draft(owner)!.parts[0]!;
	assert.equal(first.kind === "text" && first.text, "Before.");
	await session.tutor.reconcile();
	assert.equal(session.tutor.getSnapshot().locked, false);
	assert.deepEqual(await session.tutor.prepareSubmission(owner), prepared, "uncertain delivery keeps its exact retry identity");
	session.dispose();
});

test("recording initialization rechecks Send ownership after its asynchronous saves", async () => {
	const chat = chatStore.createChat("Recording start race");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Fixed content."); await session.tutor.idle();
	const starting = session.speech.begin({ id: "starting", now: () => 0 });
	const rejected = assert.rejects(starting, /Finish sending/);
	const content = await session.tutor.prepareSubmission(owner);
	await rejected;
	assert.equal(session.speech.isActive(), false);
	assert.deepEqual(service.view(chat.id).speechRuns, []);
	assert.equal(content.text, "Fixed content."); session.dispose();
});

test("return stops the original recording, waits for the edit, then captures completed working", { timeout: 3000 }, async () => {
	const chat = chatStore.createChat("Settled return"); const editor = createFauxCore({});
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	editor.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	try {
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
		const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
		await session.speech.choose({ kind: "notebook" });
		const capture = await session.speech.begin({ id: "fixed-source", now: () => 0 });
		const say = (id: string, text: string, start: number) => capture.final({ id, text, start, end: start + 1, words: [{ text, start, end: start + 0.8 }], speechFinal: true });
		say("instruction", "Write p=", 0); say("apply", "Apply changes", 1);
		await session.idle(); await session.speech.idle();
		let stopped = 0;
		session.speech.configure({ tutor: () => ({ kind: "tutor", owner }), select() {}, finish: async () => {
			stopped++; say("tail", "Keep this next instruction.", 2); await capture.end("stop");
		} });
		const returning = session.speech.choose({ kind: "tutor", owner });
		for (let i = 0; i < 20 && session.speech.isActive(); i++) await new Promise<void>(resolve => setImmediate(resolve));
		assert.equal(stopped, 1); assert.equal(session.speech.getSnapshot().switching, true);
		assert.equal(session.speech.getSnapshot().destination, "notebook");
		assert.deepEqual(service.view(chat.id).snapshots, []);
		release(); await service.settled(chat.id); await session.refresh(); await returning;
		assert.equal(session.speech.getSnapshot().destination, "tutor"); assert.equal(session.speech.isActive(), false);
		assert.equal(service.view(chat.id).draft.text, "Keep this next instruction.");
		assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=", ""]);
		assert.doesNotMatch(JSON.stringify(session.tutor.draft(owner)), /pending|Keep this next/);
	} finally { release(); await service.settled(chat.id); session.dispose(); }
});

for (const clicked of [false, true]) test(`finalizing a return ${clicked ? "absorbs a delayed spoken command into the clicked Apply" : "honors delayed spoken Apply without queuing the repeated command"}`, { timeout: 3000 }, async () => {
	const chat = chatStore.createChat("Final words before return"); const editor = createFauxCore({});
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	const instructions: string[] = [];
	editor.setResponses([async context => {
		instructions.push(JSON.parse(JSON.stringify(context.messages))[0].content.split("CURRENT INSTRUCTION\n\n").at(-1));
		await held;
		return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}');
	}]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	let returning: Promise<void> | undefined;
	try {
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
		const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
		await session.speech.choose({ kind: "notebook" });
		let time = 0;
		const capture = await session.speech.begin({ id: "finalizing", now: () => time });
		const say = (id: string, text: string, start: number, end: number, speechFinal = true) => capture.final({ id, text, start, end, words: text ? [{ text, start, end: end - 0.1 }] : [], speechFinal });
		say("instruction", "Write p=", 0, 1);
		say("command-start", "Apply", 1, 1.5, false);
		if (clicked) { time = 2; session.speech.apply(); }
		let finalized!: () => void; const finished = new Promise<void>(resolve => { finalized = resolve; });
		session.speech.configure({ tutor: () => ({ kind: "tutor", owner }), select() {}, finish: async () => {
			try {
				say("command-end", "changes", 1.5, 2);
				say("coverage", "", 2, 3);
				say("next-instruction", "Keep the next instruction.", 3, 4);
				say("repeat", "Apply changes", 4, 5);
				await capture.end("stop");
			} finally { finalized(); }
		} });
		returning = session.speech.choose({ kind: "tutor", owner }); void returning.catch(() => {});
		await finished;
		assert.equal(session.speech.getSnapshot().switching, true);
		assert.equal(session.speech.getSnapshot().destination, "notebook");
		assert.match(session.speech.getSnapshot().error!, /Still applying/);
		assert.deepEqual(service.view(chat.id).snapshots, []);
		assert.deepEqual(instructions, ["Write p="]);
		release(); await service.settled(chat.id); await session.refresh(); await returning;
		assert.equal(service.view(chat.id).usage.calls, 1);
		assert.equal(service.view(chat.id).draft.text, "Keep the next instruction.");
		assert.equal(session.speech.getSnapshot().destination, "tutor");
		assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=", ""]);
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	} finally { release(); await service.settled(chat.id); await session.refresh(); await returning?.catch(() => {}); session.dispose(); }
});

for (const outcome of ["success", "clarification", "leave"] as const) test(`a handoff during an unacknowledged Apply ${outcome === "success" ? "waits for its completed snapshot" : `stops on ${outcome}`} and never queues Send`, { timeout: 3000 }, async () => {
	const chat = chatStore.createChat("Handoff after Apply"); const editor = createFauxCore({});
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	let acknowledge!: () => void; const acknowledgment = new Promise<void>(resolve => { acknowledge = resolve; });
	let accepted!: () => void; const receipt = new Promise<void>(resolve => { accepted = resolve; });
	editor.setResponses([async () => { await held; return fauxAssistantMessage(outcome === "clarification" ? '{"action":"question","question":"Which line?"}' : '{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		const response = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (init?.body && JSON.parse(String(init.body)).type === "apply") { accepted(); await acknowledgment; }
		return response;
	});
	let returning: Promise<void> | undefined;
	try {
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
		const owner = { kind: "ordinary" as const }; session.tutor.updateText(owner, "Before."); await session.tutor.idle();
		await session.speech.choose({ kind: "notebook" }); await session.dispatch({ type: "draft", text: "Write p=" });
		const applying = session.dispatch({ type: "apply" }); await receipt;
		returning = session.speech.choose({ kind: "tutor", owner }); void returning.catch(() => {});
		for (const channel of ["ordinary", "text", "reading-thinking"] as const) {
			const preparing = channel === "ordinary" ? session.tutor.prepareSubmission(owner) : session.tutor.prepareAnswer({ kind: "question", toolCallId: "q", channel }, { kind: "explain", questionText: "Pressure?", answers: [], dontKnow: false, answeredAt: "now" });
			await assert.rejects(preparing, /Finish dictation and Notebook edits/);
		}
		assert.deepEqual(service.view(chat.id).snapshots, []);
		if (outcome === "leave") session.dispose();
		acknowledge(); await applying; release(); await service.settled(chat.id); await session.refresh();
		if (outcome === "success") {
			await returning;
			assert.deepEqual(session.tutor.draft(owner)!.parts.map(part => part.kind === "text" ? part.text : part.lines[0]?.latex), ["Before.", "p=", ""]);
		} else {
			await assert.rejects(returning, outcome === "leave" ? /cancelled/ : /Which line/);
			assert.equal(session.speech.getSnapshot().destination, "notebook");
			assert.deepEqual(service.view(chat.id).snapshots, []);
		}
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	} finally { acknowledge(); release(); await service.settled(chat.id); await session.refresh(); await returning?.catch(() => {}); session.dispose(); }
});

for (const transport of ["lost", "refused"] as const) test(`a ${transport} Apply request fails the waiting handoff and retains its instruction for review`, async () => {
	const chat = chatStore.createChat("Failed Apply handoff");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (init?.body && JSON.parse(String(init.body)).type === "apply") {
			await held;
			if (transport === "lost") throw new Error("Offline");
			return Response.json({ error: "Review this request" }, { status: 409 });
		}
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	await session.dispatch({ type: "draft", text: "Write p=" });
	const applying = assert.rejects(session.dispatch({ type: "apply" }), /Offline|Review this request/);
	const returning = session.speech.choose({ kind: "tutor", owner: { kind: "ordinary" } });
	const rejected = assert.rejects(returning, /Offline|Review this request/);
	release(); await applying; await rejected;
	assert.equal(session.speech.getSnapshot().destination, "notebook");
	assert.equal(session.getSnapshot().inputLocked, false);
	assert.equal(service.view(chat.id).draft.text, "Write p=");
	assert.deepEqual(service.view(chat.id).snapshots, []); assert.equal(service.view(chat.id).usage.calls, 0); session.dispose();
});

test("a second Apply is refused while the accepted edit runs, retaining the next instruction", async () => {
	const chat = chatStore.createChat("One edit"); const editor = createFauxCore({});
	let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
	editor.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	try {
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
		await session.dispatch({ type: "draft", text: "Write p=" }); await session.dispatch({ type: "apply" });
		await session.dispatch({ type: "draft", text: "Complete it later" });
		await assert.rejects(session.dispatch({ type: "apply" }), /Still applying/);
		assert.equal(service.view(chat.id).draft.text, "Complete it later");
	} finally { release(); await service.settled(chat.id); session.dispose(); }
	assert.equal(service.view(chat.id).usage.calls, 1);
});
