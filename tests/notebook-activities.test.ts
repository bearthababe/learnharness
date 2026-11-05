import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-activities-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
process.env.OPENROUTER_API_KEY = "test-key";
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { createPracticeAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { createTeacherTools } = await import("../src/agent/tools.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
const { SessionModel } = await import("../components/session-core.ts");
const { activeProblemOf, danglingQuestionOf, toLlmMessages } = await import("../src/core/native-messages.ts");
const { serializeForSummary } = await import("../src/core/compaction.ts");
const { sessionMarkdown } = await import("../src/core/session-markdown.ts");
const fetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
after(() => { globalThis.fetch = fetch; fs.rmSync(dir, { recursive: true, force: true }); });

for (const parked of [false, true]) test(`${parked ? "parked" : "silent"} dismissal carries reading working, consumes only reading, and preserves unsent answer without a Tutor call`, async () => {
	const { POST: dismiss } = await import("../app/api/chats/[id]/dismiss/route.ts");
	const chat = chatStore.createChat("Skipped question");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const tutor = createFauxCore({}); tutor.setResponses([() => fauxAssistantMessage([fauxToolCall("ask_user_question", { question: "Ready?" }, { id: "skip" })], { stopReason: "toolUse" })]);
	const response = await handleChatRequest(new Request("http://test/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Teach pressure" } }) }), opts => createTeacherAgent(undefined, { messages: opts.messages, engine: { model: tutor.getModel(), streamFn: tutor.streamSimple } }));
	assert.equal(response.status, 200); const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	assert.equal(danglingQuestionOf(chatStore.getChat(chat.id)!.messages)?.toolCallId, "skip");
	const editor = createFauxCore({}); editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const reading = { kind: "question" as const, toolCallId: "skip", channel: "reading-thinking" as const };
	const answer = { ...reading, channel: "text" as const };
	session.tutor.updateText(reading, "I do not understand yet"); session.tutor.updateText(answer, "UNSENT ANSWER"); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "EDITOR ONLY" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh(); await session.tutor.returnToTutor(reading);
	const prepared = await session.tutor.prepareAnswer(reading, { kind: "ask", questionText: "Ready?", answers: [], dontKnow: false, dismissed: true, answeredAt: "now" });
	const input = { ...prepared, type: "dismiss", toolCallId: "skip" };
	if (parked) {
		const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");
		const { applyParkedDismissal } = await import("../src/server/dismissal-park.ts");
		assert.equal(beginTurn(chat.id), true);
		try {
			const result = await dismiss(new Request("http://test/dismiss", { method: "POST", body: JSON.stringify({ input }) }), { params: Promise.resolve({ id: chat.id }) });
			assert.equal(result.status, 202);
			assert.ok(service.view(chat.id).tutorDrafts?.some(draft => draft.owner.kind === "question" && draft.owner.channel === "reading-thinking"));
			applyParkedDismissal(chatStore, chat.id);
		} finally { endTurn(chat.id); }
	}
	for (let i = 0; i < 2; i++) {
		const result = await dismiss(new Request("http://test/dismiss", { method: "POST", body: JSON.stringify({ input }) }), { params: Promise.resolve({ id: chat.id }) });
		assert.equal(result.status, 200, await result.text());
	}
	await session.tutor.reconcile();
	assert.equal(session.tutor.draft(reading), undefined);
	assert.match(JSON.stringify(session.tutor.draft(answer)), /UNSENT ANSWER/);
	const saved = chatStore.getChat(chat.id)!;
	assert.equal(saved.messages.filter(m => m.role === "assistant").length, 1);
	assert.match(JSON.stringify(toLlmMessages(saved.messages)), /thinkingWhileReading[\s\S]*Notebook-assisted working/);
	assert.doesNotMatch(JSON.stringify(toLlmMessages(saved.messages)), /UNSENT ANSWER|EDITOR ONLY/);
	assert.match(sessionMarkdown(saved.messages), /Thinking while reading:[\s\S]*Notebook-assisted working[\s\S]*skipped/);
	session.dispose();
});

test("teaching sends separate reading and written working atomically, retaining later typing on a lost acknowledgement", async () => {
	const chat = chatStore.createChat("Written pressure");
	chatStore.saveTree(chat.id, { nodes: [{ id: "pressure", title: "Pressure" }], edges: [], version: 1 });
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const tutor = createFauxCore({}); let seen = ""; let calls = 0;
	tutor.setResponses([
		() => fauxAssistantMessage([fauxToolCall("explain", { question: "Define pressure.", correctAnswer: "force per area", type: "check", nodeId: "pressure" }, { id: "q1" })], { stopReason: "toolUse" }),
		(context) => { calls++; seen = JSON.stringify(context.messages); return fauxAssistantMessage("Check the units."); },
	]);
	const tools = createTeacherTools({ chatId: chat.id, chatStore, jobStore, spawn: () => {} }, { explain: true });
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages, tools });
	async function post(input: unknown) {
		const response = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) }), factory);
		assert.equal(response.status, 200, await response.clone().text());
		const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	}
	await post({ type: "text", text: "Teach pressure" });
	assert.equal(danglingQuestionOf(chatStore.getChat(chat.id)!.messages)?.toolCallId, "q1", JSON.stringify(chatStore.getChat(chat.id)!.messages));
	const editor = createFauxCore({}); editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const savedLocal = new Map<string, string>();
	const storage = { getItem: (key: string) => savedLocal.get(key) ?? null, setItem: (key: string, value: string) => { savedLocal.set(key, value); }, removeItem: (key: string) => { savedLocal.delete(key); } };
	let session = createNotebookSession(chat.id, transport, storage); await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "question" as const, toolCallId: "q1", channel: "text" as const };
	const reading = { ...owner, channel: "reading-thinking" as const };
	session.tutor.updateText(reading, "My reading thought." + " Long reasoning.".repeat(180)); session.tutor.updateText(owner, ""); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "EDITOR ONLY" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	await session.tutor.returnToTutor(reading); await session.tutor.returnToTutor(owner);
	const input = { type: "answer", toolCallId: owner.toolCallId, ...await session.tutor.prepareAnswer(owner, { kind: "explain", questionText: "Define pressure.", answers: [], dontKnow: false, answeredAt: new Date().toISOString() }) };
	const beforeFailure = chatStore.getChat(chat.id);
	const rename = fs.renameSync;
	try {
		fs.renameSync = () => { throw new Error("Synthetic answer write failure"); }; syncBuiltinESMExports();
		const refused = await handleChatRequest(new Request("http://test/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) }), factory);
		assert.equal(refused.status, 500);
	} finally { fs.renameSync = rename; syncBuiltinESMExports(); }
	assert.deepEqual(chatStore.getChat(chat.id), beforeFailure, "failed atomic save preserves both channels and the pending question");
	assert.equal(calls, 0);
	await session.tutor.reconcile();
	session.tutor.updateText(reading, "Later unsent thought");
	await post(input); await post(input);
	session.dispose(); session = createNotebookSession(chat.id, transport, storage);
	await session.refresh(); await session.tutor.idle();
	assert.equal(calls, 1);
	assert.match(seen, /thinkingWhileReading[\s\S]*My reading thought/);
	assert.match(seen, /Notebook-assisted working/); assert.doesNotMatch(seen, /EDITOR ONLY|snapshotId|Later unsent/);
	const saved = chatStore.getChat(chat.id)!;
	const result = saved.messages.find(m => m.role === "toolResult" && m.toolCallId === "q1")!;
	assert.match(JSON.stringify(result), /readingThinkingContent/); assert.match(JSON.stringify(result), /textContent/);
	assert.equal(saved.messages.filter(m => m.role === "toolResult" && m.toolCallId === "q1").length, 1);
	assert.equal((serializeForSummary(saved.messages).match(/Notebook-assisted working/g) ?? []).length, 2, "compaction receives both full learner sequences past the generic tool-result cutoff");
	assert.equal((sessionMarkdown(saved.messages).match(/Notebook-assisted working/g) ?? []).length, 2, "export contains each sequence once");
	assert.equal(session.tutor.draft(owner), undefined);
	assert.match(JSON.stringify(session.tutor.draft(reading)), /Later unsent thought/);
	session.dispose(); const reopened = createNotebookSession(chat.id, transport); await reopened.refresh();
	assert.match(JSON.stringify(reopened.tutor.draft(reading)), /Later unsent thought/); reopened.dispose();
});

test("parallel selection answers keep native grading and confidence, save the first atomically, and wake once after the last", async () => {
	const { buildAnswer } = await import("../src/core/question-core.ts");
	const chat = chatStore.createChat("Two checks");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	chatStore.saveTree(chat.id, { nodes: [{ id: "pressure", title: "Pressure" }], edges: [], version: 1 });
	const tutor = createFauxCore({}); let reactions = 0; let seen = "";
	const question = { question: "Unit?", options: [{ label: "Pascal", value: "Pa" }, { label: "Newton", value: "N" }], correctAnswer: "Pa", explanation: "Force per area", nodeId: "pressure", type: "check" };
	tutor.setResponses([
		() => fauxAssistantMessage([fauxToolCall("quiz", question, { id: "q1" }), fauxToolCall("quiz", question, { id: "q2" })], { stopReason: "toolUse" }),
		context => { reactions++; seen = JSON.stringify(context.messages.filter(m => m.role === "toolResult").map(m => m.content)); return fauxAssistantMessage("Compare both answers"); },
	]);
	const tools = createTeacherTools({ chatId: chat.id, chatStore, jobStore, spawn: () => {} });
	const factory: Parameters<typeof handleChatRequest>[1] = opts => createTeacherAgent(undefined, { messages: opts.messages, tools, engine: { model: tutor.getModel(), streamFn: tutor.streamSimple } });
	async function post(input: unknown) {
		const response = await handleChatRequest(new Request("http://test/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) }), factory);
		const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
		return response;
	}
	assert.equal((await post({ type: "text", text: "Check units" })).status, 200);
	const editor = createFauxCore({}); editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "EDITOR ONLY" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	for (const toolCallId of ["q1", "q2"]) {
		const owner = { kind: "question" as const, toolCallId, channel: "thinking" as const };
		session.tutor.updateForm(owner, { selection: { selected: [0], otherSelected: false, dontKnow: false }, thinking: "I compare units", text: "", other: "", confidenceIndex: 3 });
		await session.tutor.idle(); await session.tutor.returnToTutor(owner);
		const answer = buildAnswer({ id: toolCallId, kind: "quiz", question: "Unit?", options: question.options, mode: "single-select", correctIndices: [1], createdAt: "now" }, { values: ["Pa"], confidence: 70 });
		const input = { type: "answer", toolCallId, ...await session.tutor.prepareAnswer(owner, answer) };
		if (toolCallId === "q1") {
			assert.equal((await post({ ...input, submission: { ...input.submission, draftRevision: 999 } })).status, 409);
			assert.equal(service.view(chat.id).tutorDrafts?.length, 1);
		}
		assert.equal((await post(input)).status, 200); assert.equal((await post(input)).status, 200);
		await session.tutor.reconcile(); assert.equal(session.tutor.draft(owner), undefined);
		assert.equal(reactions, toolCallId === "q1" ? 0 : 1);
	}
	assert.equal((seen.match(/Notebook-assisted working/g) ?? []).length, 2);
	assert.match(seen, /confidence\\":70/); assert.match(seen, /correct\\":true/); assert.match(seen, /Pascal/);
	assert.doesNotMatch(seen, /EDITOR ONLY|snapshotId/);
	session.dispose();
});

test("an answer remains fixed while Send persists its draft", async () => {
	const chat = chatStore.createChat("Draft save race");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor call expected"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "question" as const, toolCallId: "race", channel: "text" as const };
	session.tutor.updateText(owner, "First answer");
	const pending = session.tutor.prepareAnswer(owner, { kind: "explain", questionText: "Pressure?", answers: [], dontKnow: false, text: "First answer", answeredAt: "now" });
	session.tutor.updateText(owner, "Later answer");
	const input = await pending;
	assert.equal(input.answer.text, "First answer");
	assert.match(JSON.stringify(session.tutor.draft(owner)), /First answer/);
	assert.doesNotMatch(JSON.stringify(session.tutor.draft(owner)), /Later answer/);
	assert.equal(session.tutor.getSnapshot().locked, true);
	assert.match(JSON.stringify(service.view(chat.id).tutorDrafts), /First answer/);
	session.dispose();
});

for (const mode of [undefined, "drill"] as const) test(`${mode ?? "practice"} working-only thinking uses the native problem path, survives reopen and lost ACK without duplication`, async () => {
	const chat = chatStore.createChat("Assisted pressure", "practice", mode);
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const tutor = createFauxCore({});
	let seen = "";
	tutor.setResponses([
		() => fauxAssistantMessage([fauxToolCall("problem", { statement: "Find pressure.", mode: "recall", target: ["pressure"], modelSolution: "SECRET SOLUTION" }, { id: "problem-1" })], { stopReason: "toolUse" }),
		(context) => { seen = JSON.stringify(context.messages); return fauxAssistantMessage("Check the units."); },
		() => fauxAssistantMessage([fauxToolCall("conclude", { outcome: "solvedWithHints", verdict: "Correct with assisted working.", rung: "R4", missClass: "execution", retest: true }, { id: "conclude-1" })], { stopReason: "toolUse" }),
		() => fauxAssistantMessage("Ready for another?"),
		() => fauxAssistantMessage([fauxToolCall("problem", { statement: "Find force.", mode: "recall", modelSolution: "F=pA" }, { id: "problem-2" })], { stopReason: "toolUse" }),
	]);
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createPracticeAgent({ chatId: chat.id, chatStore }, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages });
	async function post(input: unknown) {
		const response = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) }), factory);
		assert.equal(response.status, 200, await response.clone().text());
		const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	}
	await post({ type: "text", text: "Practice pressure" });
	const editor = createFauxCore({});
	editor.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A"}]}')]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "practice" as const, problemCallId: "problem-1" };
	session.tutor.updateText(owner, ""); await session.tutor.idle();
	await session.dispatch({ type: "draft", text: "EDITOR ONLY" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	await session.tutor.returnToTutor(owner);
	const prepared = await session.tutor.prepareSubmission(owner);
	const input = { ...prepared, type: "thinking" as const, problemCallId: "problem-1" };
	let rejectPost!: (error: Error) => void;
	const failedPost = new Promise<Response>((_resolve, reject) => { rejectPost = reject; });
	const client = new SessionModel({ chatId: chat.id, initialMessages: chatStore.getChat(chat.id)!.messages, fetch: async () => failedPost });
	const sending = client.send(input);
	assert.match(JSON.stringify(client.getState().messages), /Notebook-assisted working|snapshotId/, "optimistic practice card contains the working before HTTP acknowledgement");
	rejectPost(new Error("Network unavailable")); assert.equal(await sending, false);
	assert.equal(client.getState().nativeMessages.filter(m => m.role === "custom" && m.customType === "practice-thinking").length, 0, "unconfirmed working does not masquerade as a saved learner message");
	await post(input);
	assert.match(seen, /Your thinking:[\s\S]*Notebook-assisted working[\s\S]*p=F\/A/);
	assert.doesNotMatch(seen, /EDITOR ONLY|snapshotId/);
	await post(input);
	await session.tutor.reconcile();
	assert.equal(session.tutor.draft(owner), undefined);
	const reopened = chatStore.getChat(chat.id)!;
	assert.equal(reopened.messages.filter((m) => m.role === "custom" && m.customType === "practice-thinking").length, 1);
	assert.match(JSON.stringify(toLlmMessages(reopened.messages)), /not by itself evidence of independent reasoning/);
	assert.equal(activeProblemOf(reopened.messages)?.toolCallId, "problem-1");
	assert.equal(reopened.practiceMode, mode);
	assert.equal(service.view(chat.id).lines[0]?.latex, "p=F/A");
	assert.match(serializeForSummary(reopened.messages), /\[LEARNER\] Your thinking:[\s\S]*Notebook-assisted working/);
	assert.match(sessionMarkdown(reopened.messages), /### Learner[\s\S]*Notebook-assisted working/);
	session.tutor.updateText(owner, "Unsent old problem reasoning"); await session.tutor.idle();
	await post({ type: "thinking", problemCallId: "problem-1", text: "Pressure is force per area." });
	await post({ type: "next" });
	assert.equal(activeProblemOf(chatStore.getChat(chat.id)!.messages)?.toolCallId, "problem-2");
	const stale = await session.tutor.prepareSubmission(owner);
	const response = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { ...stale, type: "thinking", problemCallId: "problem-1" } }) }), factory);
	assert.equal(response.status, 400);
	await session.tutor.reconcile();
	assert.match(JSON.stringify(session.tutor.draft(owner)), /Unsent old problem reasoning/);
	assert.equal(service.view(chat.id).lines[0]?.latex, "p=F/A", "new problem retains session Notebook");
	session.dispose();
});
