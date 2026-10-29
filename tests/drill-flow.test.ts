import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";

// Isolate records before importing any app module that resolves config paths.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-drill-"));
process.env.LH_DATA_DIR = dataDir;
const { POST, GET } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, activeProblemOf, modelSolutionForConclude } = await import("../src/core/native-messages.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { createPracticeAgent, composeInstructions } = await import("../src/agent/teacher-agent.ts");
process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function create(body: unknown) {
	return POST(new Request("http://test/api/chats", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	}));
}

it("a learner-created drill keeps its identity and work after settings changes and reopen", async () => {
	const response = await create({ title: "Unit conversions", kind: "practice", practiceMode: "drill" });
	assert.equal(response.status, 200);
	const { id } = await response.json();
	assert.equal(chatStore.getChat(id)?.practiceMode, "drill");
	const work = newUserMessage("250 L × 1 m³ / 1000 L = 0.25 m³");
	chatStore.saveMessages(id, [work]);
	chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	chatStore.renameChat(id, "Volume conversions");
	const reopened = chatStore.getChat(id)!;
	assert.equal(reopened.kind, "practice");
	assert.equal(reopened.practiceMode, "drill");
	assert.deepEqual(reopened.messages, [work]);
	const { chats } = await (await GET()).json();
	assert.equal(chats.find((chat: { id: string }) => chat.id === id)?.practiceMode, "drill");
});

it("rejects invalid drill creation before writing and keeps ordinary sessions unchanged", async () => {
	const before = chatStore.listChats().length;
	for (const body of [
		{ practiceMode: "drill" },
		{ kind: "teach", practiceMode: "drill" },
		{ kind: "practice", practiceMode: "other" },
		{ kind: "practice", practiceMode: null },
	]) {
		const response = await create(body);
		assert.equal(response.status, 400);
		assert.deepEqual(await response.json(), { error: "Invalid drill configuration" });
	}
	assert.throws(() => chatStore.createChat("invalid", undefined, "drill"), /Invalid drill configuration/);
	assert.equal(chatStore.listChats().length, before);
	for (const kind of [undefined, "practice"]) {
		const { id } = await (await create({ title: "ordinary", kind })).json();
		assert.equal(chatStore.getChat(id)?.practiceMode, undefined);
	}
});

it("runs a drill through help, saved work, conclusion and the learner's next problem", async () => {
	const { id } = await (await create({ title: "Unit conversions", kind: "practice", practiceMode: "drill" })).json();
	chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const faux = createFauxCore({});
	const pose = { statement: "Convert 250 L to m³.", mode: "recall", modelSolution: "250 L × (1 m³ / 1000 L) = 0.25 m³." };
	faux.setResponses([
		() => fauxAssistantMessage([fauxToolCall("problem", pose, { id: "drill-p1" })], { stopReason: "toolUse" }),
		() => fauxAssistantMessage([fauxText("Arrange the ratio so litres cancel: multiply by 1 m³ / 1000 L.")]),
		() => fauxAssistantMessage([fauxToolCall("conclude", { outcome: "solvedWithHints", verdict: "Correct after help arranging the ratio.", rung: "R4", missClass: "execution", retest: true }, { id: "drill-c1" })], { stopReason: "toolUse" }),
		() => fauxAssistantMessage([fauxText("You used the ratio correctly. Ready for another example?")]),
		() => fauxAssistantMessage([fauxToolCall("problem", { ...pose, statement: "Convert 0.08 m³ to litres.", modelSolution: "0.08 × 1000 = 80 L." }, { id: "drill-p2" })], { stopReason: "toolUse" }),
	]);
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const prompts: string[] = [];
	async function turn(input: unknown) {
		const response = await handleChatRequest(new Request("http://test/api/chat", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: id, input }),
		}), (opts) => {
			const agent = createPracticeAgent({ chatId: id, chatStore }, { ...opts, engine });
			prompts.push(agent.state.systemPrompt);
			return agent;
		});
		assert.equal(response.status, 200, await response.clone().text());
		const run = runningTurn(id);
		if (run) await new Response(run.subscribe()).text();
	}
	await turn({ type: "text", text: "Help me practise volume conversions" });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages)?.toolCallId, "drill-p1");
	assert.match(prompts[0]!, /separate, optional drill/);
	assert.doesNotMatch(prompts[0]!, /Never issue blocks of same-target problems/);
	assert.match(composeInstructions("practice"), /Never issue blocks of same-target problems/);
	await turn({ type: "thinking", problemCallId: "drill-p1", text: "I don't know which way the ratio goes." });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages)?.toolCallId, "drill-p1");
	await turn({ type: "thinking", problemCallId: "drill-p1", text: "250 L × 1 m³ / 1000 L = 0.25 m³" });
	const completed = chatStore.getChat(id)!;
	assert.equal(completed.practiceMode, "drill");
	assert.equal(activeProblemOf(completed.messages), null);
	assert.match(JSON.stringify(completed.messages), /solvedWithHints/);
	assert.equal(modelSolutionForConclude(completed.messages, "drill-c1"), pose.modelSolution);
	await turn({ type: "text", text: "Next problem" });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages)?.toolCallId, "drill-p2");
	assert.ok(prompts.every((prompt) => prompt.includes("separate, optional drill")));
});
