import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-activities-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = `${dir}/auth.json`;
process.env.OPENROUTER_API_KEY = "test-key";
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { createPracticeAgent } = await import("../src/agent/teacher-agent.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
const { activeProblemOf, toLlmMessages } = await import("../src/core/native-messages.ts");
const { serializeForSummary } = await import("../src/core/compaction.ts");
const { sessionMarkdown } = await import("../src/core/session-markdown.ts");
const fetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
after(() => { globalThis.fetch = fetch; fs.rmSync(dir, { recursive: true, force: true }); });

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
	const input = { ...prepared, type: "thinking", problemCallId: "problem-1" };
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
