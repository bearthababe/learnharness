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
const { createPracticeAgent, createProberAgent, composeInstructions } = await import("../src/agent/teacher-agent.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { PATHS } = await import("../config.ts");
const { promptOverrides } = await import("../src/store/prompt-overrides.ts");
const { settingsStore } = await import("../src/store/settings.ts");
process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network request in isolated drill test"); };
after(() => { globalThis.fetch = originalFetch; });
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
		() => fauxAssistantMessage([fauxText("The ratio equals one: both parts describe the same volume, so the quantity stays the same.")]),
		() => fauxAssistantMessage([fauxToolCall("problem", { ...pose, statement: "Convert 0.08 m³ to litres.", modelSolution: "0.08 × 1000 = 80 L." }, { id: "drill-p2" })], { stopReason: "toolUse" }),
	]);
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const prompts: string[] = [];
	const toolSchemas: string[] = [];
	async function turn(input: unknown) {
		const response = await handleChatRequest(new Request("http://test/api/chat", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: id, input }),
		}), (opts) => {
			const agent = createPracticeAgent({ chatId: id, chatStore }, { ...opts, engine });
			prompts.push(agent.state.systemPrompt);
			toolSchemas.push(JSON.stringify(agent.state.tools.map((tool) => tool.parameters)));
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
	assert.doesNotMatch(toolSchemas[0]!, /NEVER announces the target proposition|hint-ladder rung|do NOT give the correction/);
	assert.match(toolSchemas[0]!, /most revealing relevant help/);
	await turn({ type: "thinking", problemCallId: "drill-p1", text: "I don't know which way the ratio goes." });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages)?.toolCallId, "drill-p1");
	await turn({ type: "thinking", problemCallId: "drill-p1", text: "250 L × 1 m³ / 1000 L = 0.25 m³" });
	const completed = chatStore.getChat(id)!;
	assert.equal(completed.practiceMode, "drill");
	assert.equal(activeProblemOf(completed.messages), null);
	assert.match(JSON.stringify(completed.messages), /solvedWithHints/);
	assert.equal(modelSolutionForConclude(completed.messages, "drill-c1"), pose.modelSolution);
	await turn({ type: "text", text: "Why is it okay to multiply by that ratio?" });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages), null);
	await turn({ type: "text", text: "Next problem" });
	assert.equal(activeProblemOf(chatStore.getChat(id)!.messages)?.toolCallId, "drill-p2");
	assert.ok(prompts.every((prompt) => prompt.includes("separate, optional drill")));
});

it("an existing drill reads revised policy next turn, honors shared overrides and preserves earlier work", async (t) => {
	const policyPath = path.join(PATHS.root, "src/agent/prompts/drill/10-drill.md");
	const policy = fs.readFileSync(policyPath, "utf-8");
	const fixture = path.join(dataDir, "drill-policy.md");
	fs.writeFileSync(fixture, policy);
	// Redirect only this worker's policy read to an owned file. Never edit shared source files.
	const read = fs.readFileSync;
	t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => read(args[0] === policyPath ? fixture : args[0], args[1]));
	promptOverrides.writeOverride("shared/10-voice.md", "Shared voice override for this learner.");
	promptOverrides.writeOverride("practice/10-doctrine.md", "Ordinary practice override must stay isolated.");
	t.after(() => {
		promptOverrides.deleteOverride("shared/10-voice.md");
		promptOverrides.deleteOverride("practice/10-doctrine.md");
		settingsStore.writeSettings({ version: 1, agent: { prompts: {} } });
	});
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true, "practice/10-doctrine.md": true } } });
	const { id } = await (await create({ title: "Ratios", kind: "practice", practiceMode: "drill" })).json();
	chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage([fauxText("We can work on ratios.")]),
		() => fauxAssistantMessage([fauxText("We can continue with your target.")]),
	]);
	const prompts: string[] = [];
	const agents: ReturnType<typeof createPracticeAgent>[] = [];
	async function turn(text: string) {
		const response = await handleChatRequest(new Request("http://test/api/chat", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chatId: id, practiceMode: "ordinary", input: { type: "text", text } }),
		}), (opts) => {
			const agent = createPracticeAgent({ chatId: id, chatStore }, { ...opts, engine: { model: faux.getModel(), streamFn: faux.streamSimple } });
			prompts.push(agent.state.systemPrompt);
			agents.push(agent);
			return agent;
		});
		assert.equal(response.status, 200);
		const run = runningTurn(id);
		if (run) await new Response(run.subscribe()).text();
	}
	await turn("I need help with ratios.");
	const earlier = chatStore.getChat(id)!.messages;
	fs.writeFileSync(fixture, `${policy}\n\nRevised policy marker: check unit cancellation explicitly.`);
	await turn("Let's continue.");
	assert.doesNotMatch(prompts[0]!, /Revised policy marker/);
	assert.match(prompts[1]!, /Revised policy marker/);
	assert.equal(agents[0]!.state.systemPrompt, prompts[0], "an already-built response retains its original policy");
	assert.deepEqual(chatStore.getChat(id)!.messages.slice(0, earlier.length), earlier);
	for (const prompt of prompts) {
		assert.match(prompt, /separate, optional drill/);
		assert.match(prompt, /Shared voice override/);
		assert.doesNotMatch(prompt, /Ordinary practice override/);
	}
});

it("ordinary and older sessions ignore a request's claimed drill mode and retain their own instructions and schemas", async () => {
	for (const kind of [undefined, "practice"] as const) {
		const { id } = await (await create({ title: "Ordinary session", kind })).json();
		chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
		const faux = createFauxCore({});
		faux.setResponses([() => fauxAssistantMessage([fauxText("Ordinary response.")])]);
		let prompt = "";
		let schema = "";
		const response = await handleChatRequest(new Request("http://test/api/chat", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chatId: id, practiceMode: "drill", input: { type: "text", text: "Let's work." } }),
		}), (opts) => {
			assert.equal(opts.practiceMode, undefined);
			const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
			const agent = kind === "practice"
				? createPracticeAgent({ chatId: id, chatStore }, { ...opts, engine })
				: createProberAgent({ chatId: id, chatStore, jobStore, deliver: () => {}, spawn: () => {} }, { ...opts, engine });
			prompt = agent.state.systemPrompt;
			schema = JSON.stringify(agent.state.tools.map((tool) => tool.parameters));
			return agent;
		});
		assert.equal(response.status, 200);
		const run = runningTurn(id);
		if (run) await new Response(run.subscribe()).text();
		assert.equal(prompt, composeInstructions(kind === "practice" ? "practice" : "prober"));
		assert.doesNotMatch(prompt, /separate, optional drill/);
		if (kind === "practice") {
			assert.match(schema, /NEVER announces the target proposition/);
			assert.match(schema, /hint-ladder rung/);
		}
		assert.equal(chatStore.getChat(id)!.practiceMode, undefined);
		assert.ok(chatStore.getChat(id)!.turns!.every((turn) => turn.drillPromptContext === undefined), "ordinary turns retain the existing usage shape");
	}
});
