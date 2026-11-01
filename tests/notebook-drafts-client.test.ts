import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-draft-client-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = path.join(dir, "auth.json");
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const owner = { kind: "ordinary" as const };

test("per-change saves recover a lost draft ACK across remount without waking Tutor or overwriting newer typing", async () => {
	const chat = chatStore.createChat("Durable draft");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No model calls"); } });
	const memory = new Map<string, string>();
	const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
	let loseAck = true;
	const fetcher: typeof fetch = async (_url, init) => {
		const response = await service.handle(new Request("http://test/notebook", init), chat.id);
		if (init?.method === "POST" && JSON.parse(String(init.body)).type === "tutor-draft" && loseAck) {
			loseAck = false;
			throw new Error("Lost ACK");
		}
		return response;
	};
	const first = createNotebookSession(chat.id, fetcher, storage);
	await first.refresh();
	first.tutor.updateText(owner, "The force is constant.");
	assert.ok(memory.size, "local write-ahead precedes network completion");
	await first.tutor.idle();
	assert.match(first.tutor.getSnapshot().error!, /Lost ACK/);
	first.dispose();
	const reopened = createNotebookSession(chat.id, fetcher, storage);
	await reopened.refresh();
	assert.deepEqual(reopened.tutor.draft(owner)!.parts.map((part) => part.kind === "text" ? part.text : "working"), ["The force is constant."]);
	reopened.tutor.updateText(owner, "The force is constant; the area doubles.");
	await reopened.tutor.idle();
	assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts.map((part) => part.kind === "text" ? part.text : "working"), ["The force is constant; the area doubles."]);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	assert.equal(memory.size, 0, "acknowledged draft no longer needs local recovery");
});

test("return fixes the continuation position immediately while snapshot acknowledgment is delayed", async () => {
	const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
	const chat = chatStore.createChat("Return while typing");
	const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	const session = createNotebookSession(chat.id, async (_url, init) => {
		if (init?.method === "POST" && JSON.parse(String(init.body)).type === "snapshot") await held;
		return service.handle(new Request("http://test/notebook", init), chat.id);
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	session.tutor.updateText(owner, "Before working."); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "Write pressure" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	const returning = session.tutor.returnToTutor(owner);
	session.tutor.updateText(owner, "After working.");
	release(); await returning; await session.tutor.idle();
	assert.deepEqual(session.tutor.draft(owner)!.parts.map((part) => part.kind === "text" ? part.text : part.lines[0]!.latex), ["Before working.", "p=F/A", "After working."]);
	const reopened = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await reopened.refresh();
	assert.deepEqual(reopened.tutor.draft(owner)!.parts, session.tutor.draft(owner)!.parts);
});

test("failed notebook sends retain the complete draft; lost send ACK reconciles without resubmission and newer typing survives", async () => {
	process.env.OPENROUTER_API_KEY = "test-key";
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
	const { SessionModel } = await import("../components/session-core.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	const chat = chatStore.createChat("Submission recovery");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	session.tutor.updateText(owner, "Pressure is force per area."); await session.tutor.idle();
	const frozen = await session.tutor.prepareSubmission(owner);
	const faux = createFauxCore({});
	let calls = 0;
	faux.setResponses([() => { calls++; return fauxAssistantMessage("Consider the units."); }]);
	let fail = true;
	const model = new SessionModel({ chatId: chat.id, initialMessages: [], fetch: async (_url, init) => {
		if (fail) throw new Error("Offline before delivery");
		const response = await handleChatRequest(new Request("http://test/api/chat", init), (opts) => createTeacherAgent(undefined, { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, messages: opts.messages }));
		assert.equal(response.status, 200);
		throw new Error("Lost send ACK");
	} });
	assert.equal(await model.send(frozen), false);
	assert.deepEqual(session.tutor.draft(owner)!.parts, frozen.explanation);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	const retry = await session.tutor.prepareSubmission(owner);
	assert.deepEqual(retry, frozen);
	fail = false;
	assert.equal(await model.send(retry), false);
	const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	session.tutor.updateText(owner, "New words after Send.");
	await session.tutor.reconcile(); await session.tutor.idle();
	assert.match(JSON.stringify(session.tutor.draft(owner)), /New words after Send/);
	assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /New words after Send/, "acceptance consumes only the frozen revision, and autosaves newer typing");
	assert.equal(calls, 1);
	assert.equal(chatStore.getChat(chat.id)!.messages.filter((message) => message.role === "user").length, 1);
	await session.tutor.reconcile();
	assert.equal(calls, 1, "reopen/reconcile never wakes Tutor");
});

test("reopen resumes unsaved local changes, but retains an older conflicting copy for review", async () => {
	for (const conflict of [false, true]) {
		const chat = chatStore.createChat("Local recovery");
		const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
		const memory = new Map<string, string>();
		const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
		const first = createNotebookSession(chat.id, async (_url, init) => {
			if (init?.method === "POST") throw new Error("Offline save");
			return service.handle(new Request("http://test/notebook", init), chat.id);
		}, storage);
		await first.refresh(); first.tutor.updateText(owner, "Recover these words."); await first.tutor.idle();
		if (conflict) service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "other-device", owner, revision: 1, parts: [{ id: "other", kind: "text", text: "Newer saved words." }] } });
		first.dispose();
		const restored = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id), storage);
		await restored.refresh(); await restored.tutor.idle();
		if (conflict) {
			assert.match(JSON.stringify(restored.tutor.getSnapshot().recovery), /Recover these words/);
			assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Newer saved words/);
			assert.match(restored.tutor.getSnapshot().error!, /newer saved draft/i);
		} else {
			assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /Recover these words/);
			assert.equal(memory.size, 0);
		}
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	}
});

test("canonical notebook identity absorbs the optimistic message during an in-flight ACK", async () => {
	const { SessionModel } = await import("../components/session-core.ts");
	const { newUserMessage } = await import("../src/core/native-messages.ts");
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	const model = new SessionModel({ chatId: "view", initialMessages: [], fetch: async () => { await held; throw new Error("Lost ACK"); } });
	const input = { type: "text" as const, text: "reasoning", explanation: [{ id: "text", kind: "text" as const, text: "reasoning" }], submission: { id: "logical", draftId: "draft", draftRevision: 1, owner } };
	const sending = model.send(input);
	const canonical = newUserMessage(input.text, input.explanation, input.submission.id);
	model.adoptRecord([canonical]);
	assert.equal(model.getState().messages.length, 1, "one rendered explanation during canonical adoption");
	model.applyWireEvent({ type: "message_start", message: canonical });
	assert.equal(model.getState().messages.length, 1, "replayed steer cannot duplicate a canonical notebook message");
	release(); await sending;
	assert.equal(model.getState().messages.length, 1);
});
