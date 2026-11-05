import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-snapshots-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = path.join(dir, "auth.json");
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });

test("ordinary send combines Notebook snapshots and reviewed handwriting once, and retries a lost ACK idempotently", async () => {
	process.env.OPENROUTER_API_KEY = "test-key";
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	const { projectView } = await import("../src/core/view.ts");
	const chat = chatStore.createChat("Hydraulic reasoning");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const editor = createFauxCore({});
	editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	service.dispatch(chat.id, { type: "draft", expectedRevision: 0, text: "Write formula, not my reasoning" });
	service.dispatch(chat.id, { type: "apply", id: "edit", contextId: service.view(chat.id).contextId!, draftRevision: 1, instruction: "Write formula, not my reasoning" });
	await service.settled(chat.id);
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", owner: { kind: "ordinary" }, revision: 1, parts: [{ id: "t1", kind: "text", text: "Same force." }] } });
	service.dispatch(chat.id, { type: "snapshot", id: "snap", owner: { kind: "ordinary" }, draftId: "draft", expectedRevision: 1, continuationId: "t2" });
	const draft = service.view(chat.id).tutorDrafts![0]!;
	draft.revision++;
	const end = draft.parts[2]!;
	if (end.kind === "text") end.text = "Twice the area halves pressure.";
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 2, draft });
	const { sharedWritingResponse } = await import("../src/server/shared-writing.ts");
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
	const upload = await sharedWritingResponse(new Request("http://test/writing", { method: "POST", body: png }), chat.id);
	assert.equal(upload.status, 201);
	const { writing } = await upload.json();
	const input = { type: "text", text: "Same force.\n\nTwice the area halves pressure.", explanation: draft.parts, writingIds: [writing.id], submission: { id: "submission", draftId: draft.id, draftRevision: draft.revision, owner: draft.owner } };
	let calls = 0;
	let seen = "";
	const tutor = createFauxCore({});
	tutor.setResponses([(context) => {
		calls++;
		const wire = JSON.stringify(context.messages.filter((message) => message.role === "user"));
		seen = wire;
		assert.match(wire, /Same force\.[\s\S]*Notebook-assisted working[\s\S]*p=F\/A[\s\S]*Twice the area/);
		assert.match(wire, /not by itself evidence of independent reasoning/);
		assert.match(wire, /Shared handwritten working/);
		assert.doesNotMatch(wire, /Write formula|snapshotId|draftRevision|explanation/);
		return fauxAssistantMessage("Let's check that reasoning.");
	}]);
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages });
	const request = () => new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) });
	const response = await handleChatRequest(request(), factory);
	assert.equal(response.status, 200, await response.clone().text());
	const running = runningTurn(chat.id);
	if (running) await new Response(running.subscribe()).text();
	const duplicate = await handleChatRequest(request(), factory);
	assert.equal(duplicate.status, 200, await duplicate.clone().text());
	assert.equal(calls, 1);
	assert.match(seen, /Same force\.[\s\S]*Notebook-assisted working[\s\S]*p=F\/A[\s\S]*Twice the area/);
	assert.match(seen, /not by itself evidence of independent reasoning/);
	assert.doesNotMatch(seen, /Write formula|snapshotId|draftRevision|"explanation":/);
	const saved = chatStore.getChat(chat.id)!;
	assert.equal(saved.messages.filter((message) => message.role === "user").length, 1);
	assert.match(JSON.stringify(projectView(saved.messages)), /p=F\/A/);
	assert.equal(saved.messages.filter(message => message.sharedWriting?.length).length, 1);
	assert.ok(projectView(saved.messages).some(message => message.parts.some(part => part.type === "data-shared-writing")));
	assert.deepEqual((await (await sharedWritingResponse(new Request("http://test/writing"), chat.id)).json()).pending, []);
	assert.deepEqual(service.view(chat.id).tutorDrafts, [], "only accepted draft consumed");
});

test("real compaction sends full assisted working to its scripted summary model, retains exact history and excludes unsent work", async () => {
	const { ensureCompacted } = await import("../src/server/compaction.ts");
	const { newUserMessage, toLlmMessages } = await import("../src/core/native-messages.ts");
	const { projectView } = await import("../src/core/view.ts");
	const { sessionMarkdown } = await import("../src/core/session-markdown.ts");
	const chat = chatStore.createChat("Compact pressure");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor calls"); } });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	service.dispatch(chat.id, { type: "draft", expectedRevision: 0, text: "UNSENT notebook command" });
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft: { id: "unfinished", owner: { kind: "ordinary" }, revision: 1, parts: [{ kind: "text", id: "unsent", text: "UNSENT learner draft" }] } });
	const earlier = newUserMessage("compatibility", [
		{ kind: "text", id: "reasoning", text: "Pressure explanation " + "x".repeat(120_000) },
		{ kind: "working", id: "working", snapshotId: "old", contextId: "context", revision: 1, lines: [{ id: "L1", latex: "p=F/A" }] },
		{ kind: "text", id: "after", text: "I still need to check the units." },
	]);
	const kept = newUserMessage("", [{ kind: "working", id: "recent", snapshotId: "recent", contextId: "context", revision: 2, lines: [{ id: "L1", latex: "p=F/(2A)" }] }]);
	const messages = [earlier, newUserMessage("y".repeat(120_000)), kept];
	chatStore.saveMessages(chat.id, messages);
	const faux = createFauxCore({});
	let prompt = "";
	faux.setResponses([(context) => { prompt = JSON.stringify(context.messages); return fauxAssistantMessage("The learner used assisted p=F/A working and remains uncertain about units. Independent understanding is unverified."); }]);
	const env = process.env.NODE_ENV;
	try {
		Object.assign(process.env, { NODE_ENV: "development" });
		await ensureCompacted({ chatStore, engine: { model: faux.getModel(), streamFn: faux.streamSimple }, modelId: "faux:summary", kind: "teach", thresholdTokens: 40_000, systemPromptTokens: 100 }, chat.id);
	} finally { Object.assign(process.env, { NODE_ENV: env }); }
	assert.match(prompt, /p=F\/A/);
	assert.match(prompt, /I still need to check the units/);
	assert.match(prompt, /Preserve the distinction between learner explanations and notebook-assisted working; do not infer independent understanding from assisted edits alone\./);
	assert.doesNotMatch(prompt, /UNSENT/);
	const reopened = chatStore.getChat(chat.id)!;
	assert.deepEqual(reopened.messages.slice(0, -1), messages);
	assert.match(JSON.stringify(toLlmMessages(reopened.messages)), /p=F\/\(2A\)/);
	assert.match(JSON.stringify(projectView(reopened.messages)), /p=F\/A/);
	assert.match(sessionMarkdown(reopened.messages), /Notebook-assisted working[\s\S]*p=F\/A/);
	assert.equal(service.view(chat.id).draft.text, "UNSENT notebook command");
	assert.equal(service.view(chat.id).tutorDrafts!.length, 1);
});

test("return appends immutable hydraulic working to a durable explanation, without submitting or copying instructions", async () => {
	const chat = chatStore.createChat("Hydraulic pressure");
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	async function command(body: unknown) {
		const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(body) }), chat.id);
		assert.ok(response.ok, await response.clone().text());
		return (await response.json()).view;
	}
	await command({ type: "visibility", visible: true });
	const draft = { id: "explanation", owner: { kind: "ordinary" }, revision: 1, parts: [{ id: "before", kind: "text", text: "The same force acts over a larger area." }] };
	await command({ type: "tutor-draft", expectedRevision: 0, draft });
	async function apply(instruction: string) {
		const saved = await command({ type: "draft", expectedRevision: service.view(chat.id).draft.revision, text: instruction });
		await command({ type: "apply", id: crypto.randomUUID(), contextId: saved.contextId, draftRevision: saved.draft.revision, instruction });
		await service.settled(chat.id);
	}
	await apply("Write the pressure formula");
	const returned = await command({ type: "snapshot", id: "snapshot-1", owner: draft.owner, draftId: draft.id, expectedRevision: 1, continuationId: "after" });
	assert.equal(returned.tutorDrafts[0].parts[1].lines[0].latex, "p=F/A");
	const continued = structuredClone(returned.tutorDrafts[0]);
	continued.revision++;
	continued.parts[0].text = "For the same force, pressure falls when area grows.";
	continued.parts[2].text = "Doubling area should halve pressure.";
	await command({ type: "tutor-draft", expectedRevision: returned.tutorDrafts[0].revision, draft: continued });
	await apply("Double the denominator");
	const reopened = await (await service.handle(new Request("http://test/notebook"), chat.id)).json();
	assert.equal(reopened.lines[0].latex, "p=F/(2A)");
	assert.equal(reopened.tutorDrafts[0].parts[1].lines[0].latex, "p=F/A");
	assert.equal(reopened.tutorDrafts[0].parts[2].text, "Doubling area should halve pressure.");
	assert.equal(JSON.stringify(reopened.tutorDrafts).includes("Double the denominator"), false);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	const duplicate = await command({ type: "snapshot", id: "snapshot-1", owner: draft.owner, draftId: draft.id, expectedRevision: 1, continuationId: "after" });
	assert.equal(duplicate.tutorDrafts[0].parts.length, 3, "lost return ACK does not add another snapshot");
	const foreign = chatStore.createChat("Foreign snapshots");
	const imported = { ...continued, id: "foreign", revision: 1 };
	const foreignResponse = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "tutor-draft", expectedRevision: 0, draft: imported }) }), foreign.id);
	assert.equal(foreignResponse.status, 409, "another session's working cannot be submitted as this session's snapshot");
	const tampered = structuredClone(continued); tampered.revision++;
	tampered.parts[1].lines[0].latex = "p=wrong";
	const tamperedResponse = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "tutor-draft", expectedRevision: continued.revision, draft: tampered }) }), chat.id);
	assert.equal(tamperedResponse.status, 409);
	assert.equal(service.view(chat.id).tutorDrafts![0]!.parts.length, 3);
	service.dispatch(chat.id, { type: "start-fresh", id: "fresh", contextId: service.view(chat.id).contextId! });
	await service.settled(chat.id);
	assert.deepEqual(service.view(chat.id).tutorDrafts, reopened.tutorDrafts, "Start fresh retains the actual owned explanation and immutable snapshots");
	assert.equal(service.view(chat.id).history[0]!.lines[0]!.latex, "p=F/(2A)");
});

test("live notebook steer is accepted once, restored from its durable outbox, and reconciled against canonical native identity", async () => {
	const { submitNotebookSteer } = await import("../src/server/notebook-steer.ts");
	const { registerLiveAgent, unregisterLiveAgent, reconcileUserSteers, discardChatDeliveries: forgetChat } = await import("../src/server/jobs.ts");
	const { Agent } = await import("@earendil-works/pi-agent-core");
	const chat = chatStore.createChat("Steered working");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call"); } });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const draft = { id: "steer-draft", owner: { kind: "ordinary" as const }, revision: 1, parts: [{ id: "text", kind: "text" as const, text: "Please consider my reasoning." }] };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft });
	const input = { type: "steer" as const, id: "steer-submission", text: "Please consider my reasoning.", explanation: draft.parts, submission: { id: "steer-submission", draftId: draft.id, draftRevision: 1, owner: draft.owner } };
	assert.equal(submitNotebookSteer(chat.id, input).status, 409, "settle race keeps complete draft for ordinary fallback");
	const transport = createFauxCore({});
	const first = new Agent({ streamFn: transport.streamSimple });
	registerLiveAgent(chat.id, first);
	assert.equal(submitNotebookSteer(chat.id, input).status, 200);
	assert.equal(submitNotebookSteer(chat.id, input).status, 200, "lost ACK retry");
	assert.equal(first.peekQueuedMessages().length, 1);
	assert.equal(first.state.messages.length, 0, "pending steer never bypasses native turn ordering");
	unregisterLiveAgent(chat.id);
	forgetChat(chat.id);
	const next = new Agent({ streamFn: transport.streamSimple });
	registerLiveAgent(chat.id, next);
	const restored = next.peekQueuedMessages() as import("../src/core/native-messages.ts").LhMessage[];
	assert.equal(restored.length, 1);
	assert.equal(restored[0]!.id, input.id);
	chatStore.saveMessages(chat.id, restored);
	reconcileUserSteers(chat.id, restored);
	unregisterLiveAgent(chat.id);
	forgetChat(chat.id);
	const reopened = new Agent({ streamFn: transport.streamSimple });
	registerLiveAgent(chat.id, reopened);
	assert.equal(reopened.peekQueuedMessages().length, 0, "saved native identity wins over outbox recovery");
	unregisterLiveAgent(chat.id);
	forgetChat(chat.id);
});

test("an atomic submission write failure preserves the complete draft and cannot start a Tutor turn", async () => {
	process.env.OPENROUTER_API_KEY = "test-key";
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const chat = chatStore.createChat("Failed atomic submit");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor calls"); } });
	const draft = { id: "durable", owner: { kind: "ordinary" as const }, revision: 1, parts: [{ kind: "text" as const, id: "text", text: "Do not lose this explanation." }] };
	service.dispatch(chat.id, { type: "tutor-draft", expectedRevision: 0, draft });
	const before = chatStore.getChat(chat.id)!;
	const rename = fs.renameSync;
	let built = 0;
	try {
		fs.renameSync = () => { throw new Error("Disk replacement failed"); }; syncBuiltinESMExports();
		const response = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Do not lose this explanation.", explanation: draft.parts, submission: { id: "failed-submit", draftId: draft.id, draftRevision: 1, owner: draft.owner } } }) }), () => { built++; throw new Error("Unexpected Tutor construction"); });
		assert.equal(response.status, 500);
	} finally { fs.renameSync = rename; syncBuiltinESMExports(); }
	assert.equal(built, 0);
	assert.deepEqual(chatStore.getChat(chat.id), before);
});

test("working-only live steering reaches the scripted external model in its native user role, including settle-race fallback", async () => {
	const { POST: steer } = await import("../app/api/chats/[id]/steer/route.ts");
	process.env.OPENROUTER_API_KEY = "test-key";
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const { SessionModel } = await import("../components/session-core.ts");
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { submitNotebookSteer } = await import("../src/server/notebook-steer.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	for (const race of [false, true]) {
		const chat = chatStore.createChat(`Live snapshot ${race}`);
		chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
		const editor = createFauxCore({});
		editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
		const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
		const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
		await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
		session.tutor.updateText({ kind: "ordinary" }, ""); await session.tutor.idle();
		await session.dispatch({ type: "draft", text: "EDITOR WORDS ONLY" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
		await session.tutor.returnToTutor({ kind: "ordinary" });
		const input = await session.tutor.prepareSubmission({ kind: "ordinary" });
		let release!: () => void;
		const held = new Promise<void>((resolve) => { release = resolve; });
		let entered!: () => void;
		const started = new Promise<void>((resolve) => { entered = resolve; });
		const tutor = createFauxCore({});
		const contexts: string[] = [];
		tutor.setResponses([
			...(race ? [] : [async () => { entered(); await held; return fauxAssistantMessage("Initial thought."); }]),
			(context) => { contexts.push(JSON.stringify(context.messages.filter((message) => message.role === "user"))); return fauxAssistantMessage("I see the assisted pressure formula."); },
		]);
		const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages });
		if (!race) assert.equal((await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Discuss pressure" } }) }), factory)).status, 200);
		if (!race) await started;
		const responses: Array<{ status: number; body: string }> = [];
		const model = new SessionModel({ chatId: chat.id, initialMessages: [], fetch: async (url, init) => {
			if (String(url).endsWith("/steer")) {
				const response = await steer(new Request(`http://test${url}`, init), { params: Promise.resolve({ id: chat.id }) }).catch(error => {
					responses.push({ status: 0, body: String(error) }); throw error;
				});
				responses.push({ status: response.status, body: await response.clone().text() });
				return response;
			}
			if (init?.method === "POST") return handleChatRequest(new Request("http://test/api/chat", init), factory);
			if (String(url).endsWith("/stream")) return new Response(runningTurn(chat.id)?.subscribe() ?? "");
			return Response.json({ ...chatStore.getChat(chat.id), turnInFlight: !!runningTurn(chat.id) });
		} });
		let accepted: boolean;
		try { accepted = await model.steer(input.text, input); }
		finally { release(); }
		const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
		assert.equal(accepted, true, JSON.stringify(responses));
		assert.equal(contexts.length, 1);
		assert.match(contexts[0]!, /Notebook-assisted working[\s\S]*p=F\/A/);
		assert.doesNotMatch(contexts[0]!, /EDITOR WORDS|snapshotId|draftRevision|"explanation":/);
		const saved = chatStore.getChat(chat.id)!.messages.filter((message) => message.id === input.submission!.id);
		assert.equal(saved.length, 1);
		assert.equal(saved[0]!.role, "user");
		assert.deepEqual(saved[0]!.explanation, input.explanation);
		assert.equal(submitNotebookSteer(chat.id, { ...input, type: "steer", id: input.submission!.id }).status, 200);
		model.stop();
	}
});
