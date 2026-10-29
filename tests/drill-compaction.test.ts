import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { createAssistantMessageEventStream, fauxProvider, fauxAssistantMessage, fauxToolCall, getSystemMessageText, type TranscriptContext } from "@earendil-works/pi-ai";

// Closed synthetic environment: no learner records, credentials, or network.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-drill-compaction-"));
const originalEnv = process.env;
const originalFetch = globalThis.fetch;
process.env = { NODE_ENV: "test", NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT, TMPDIR: "/tmp/opencode", HOME: dataDir, LH_DATA_DIR: dataDir, OPENROUTER_API_KEY: "offline-fixture" };
const env: Record<string, string | undefined> = process.env;
globalThis.fetch = async () => { throw new Error("Unexpected network request in drill compaction test"); };
const { chatStore } = await import("../src/store/chats.ts");
const { settingsStore } = await import("../src/store/settings.ts");
const { promptOverrides } = await import("../src/store/prompt-overrides.ts");
const { piModels } = await import("../src/agent/models.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { awaitCompaction } = await import("../src/server/compaction.ts");
const { newUserMessage, activeCompactionOf, estimateTokens, estimateContextTokens, toLlmMessages } = await import("../src/core/index.ts");
const { PATHS } = await import("../config.ts");
const faux = fauxProvider({ provider: "openrouter", models: [{ id: "offline-drill", contextWindow: 1_000_000 }] });
piModels().setProvider(faux.provider);
after(() => {
	process.env = originalEnv;
	globalThis.fetch = originalFetch;
	fs.rmSync(dataDir, { recursive: true, force: true });
});

function systemText(context: TranscriptContext): string {
	return context.messages.filter((message) => message.role === "system").map(getSystemMessageText).join("\n");
}

async function turn(chatId: string) {
	const response = await handleChatRequest(new Request("http://test/api/chat", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, practiceMode: "ordinary", input: { type: "text", text: "Let's continue." } }),
	}));
	assert.equal(response.status, 200, await response.clone().text());
	const run = runningTurn(chatId);
	if (run) await new Response(run.subscribe()).text();
	await awaitCompaction(chatId);
}

it("turn-start compaction uses the saved drill and current overridden instructions after the opening request leaves context", async (t) => {
	const policyPath = path.join(PATHS.root, "src/agent/prompts/drill/10-drill.md");
	const policy = fs.readFileSync(policyPath, "utf-8");
	const fixture = path.join(dataDir, "policy.md");
	fs.writeFileSync(fixture, policy);
	const read = fs.readFileSync;
	t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => read(args[0] === policyPath ? fixture : args[0], args[1]));
	promptOverrides.writeOverride("shared/10-voice.md", "Effective shared voice. " + "v".repeat(8_000));
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: 40_000 } });
	const chat = chatStore.createChat("Synthetic conversions", "practice", "drill");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
	const original = [
		newUserMessage("OPENING REQUEST: drill volume conversions, one at a time."),
		newUserMessage("Ratio cancellation and helped correction. " + "x".repeat(100_000)),
		newUserMessage("Fresh application; current conversion still underway. " + "y".repeat(100_000)),
		newUserMessage("I want to finish the current conversion."),
	];
	chatStore.saveMessages(chat.id, original);
	// The saved session predates this policy revision. Construction after compaction must read it afresh.
	fs.writeFileSync(fixture, `${policy}\n\nCurrent policy fixture: check unit cancellation explicitly.`);
	let summaryInput = "";
	let continuation: TranscriptContext | undefined;
	faux.setResponses([
		(context) => { summaryInput = JSON.stringify(context.messages); return fauxAssistantMessage("SUMMARY: volume conversions; ratio cancellation helped; finish current conversion."); },
		(context) => { continuation = structuredClone(context); return fauxAssistantMessage("Let's finish your conversion."); },
	]);
	// Exercise the real production gate and kick with the registered offline provider.
	env.NODE_ENV = "development";
	t.after(() => { env.NODE_ENV = "test"; });
	await turn(chat.id);
	assert.ok(summaryInput.includes("This is a focused drill"), "saved activity reaches the turn-start summarizer");
	assert.ok(continuation);
	const prompt = systemText(continuation);
	assert.match(prompt, /separate, optional drill/);
	assert.match(prompt, /Current policy fixture/);
	assert.match(prompt, /Effective shared voice/);
	assert.doesNotMatch(prompt, /Never issue blocks of same-target problems/);
	const context = JSON.stringify(continuation.messages);
	assert.match(context, /SUMMARY: volume conversions/);
	assert.doesNotMatch(context, /OPENING REQUEST/);
	const record = chatStore.getChat(chat.id)!;
	assert.deepEqual(record.messages.slice(0, original.length), original);
	assert.equal(record.practiceMode, "drill");
	assert.equal(activeCompactionOf(record.messages)!.details.tokensBefore,
		estimateTokens(toLlmMessages(original)) + Math.ceil(prompt.length / 4),
		"the pre-turn estimate counts the instructions actually received by the model");
});

it("settle compaction uses the saved drill and freshly effective shared override in its unanchored estimate", async (t) => {
	// A transport without reported usage exercises the fallback estimate. No
	// internal service mocks: the real request, persistence and summary run.
	piModels().setProvider({
		...faux.provider,
		streamSimple: (model, context, options) => {
			const output = createAssistantMessageEventStream();
			void (async () => {
				for await (const event of faux.provider.streamSimple(model, context, options)) {
					if (event.type === "done") event.message.usage = {
						input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					};
					output.push(event);
				}
				output.end();
			})();
			return output;
		},
	});
	t.after(() => piModels().setProvider(faux.provider));
	promptOverrides.writeOverride("shared/10-voice.md", "Voice before settlement.");
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: 150_000 } });
	const chat = chatStore.createChat("Synthetic settle continuity", "practice", "drill");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
	const original = [
		newUserMessage("OPENING REQUEST: focused conversions."),
		newUserMessage("Helped ratio correction. " + "x".repeat(100_000)),
		newUserMessage("Current conversion. " + "y".repeat(100_000)),
	];
	chatStore.saveMessages(chat.id, original);
	let summaryInput = "";
	let nextPrompt = "";
	faux.setResponses([
		() => {
			promptOverrides.writeOverride("shared/10-voice.md", "Voice after settlement. " + "v".repeat(12_000));
			settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: 40_000 } });
			return fauxAssistantMessage("Keep working on your conversion.");
		},
		(context) => { summaryInput = JSON.stringify(context.messages); return fauxAssistantMessage("SUMMARY: ratio correction; current conversion; retest independently."); },
		(context) => { nextPrompt = systemText(context); return fauxAssistantMessage("Continue using cancellation."); },
	]);
	env.NODE_ENV = "development";
	t.after(() => { env.NODE_ENV = "test"; });
	await turn(chat.id);
	assert.ok(summaryInput.includes("This is a focused drill"), "saved activity reaches the settle summarizer");
	const compacted = chatStore.getChat(chat.id)!;
	const marker = activeCompactionOf(compacted.messages)!;
	assert.ok(marker, "the settled turn is compacted before the next request");
	assert.deepEqual(compacted.messages.slice(0, original.length), original);
	await turn(chat.id);
	assert.match(nextPrompt, /separate, optional drill/);
	assert.match(nextPrompt, /Voice after settlement/);
	assert.doesNotMatch(nextPrompt, /Voice before settlement/);
	assert.equal(marker.details.tokensBefore,
		estimateTokens(toLlmMessages(compacted.messages.slice(0, -1))) + Math.ceil(nextPrompt.length / 4),
		"settle counts the freshly effective drill prompt, including shared overrides");
	assert.deepEqual(chatStore.getChat(chat.id)!.messages.slice(0, compacted.messages.length), compacted.messages);
});

it("records the constructed drill prompt for every assistant step even when instructions change mid-flight", async () => {
	promptOverrides.writeOverride("shared/10-voice.md", "Voice captured at construction.");
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } } });
	const chat = chatStore.createChat("Captured instructions", "practice", "drill");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
	let sentPrompt = "";
	faux.setResponses([
		(context) => {
			sentPrompt = systemText(context);
			promptOverrides.writeOverride("shared/10-voice.md", "Changed during generation. " + "v".repeat(8_000));
			// Validation failure keeps this run going to a second assistant step.
			return fauxAssistantMessage(fauxToolCall("problem", { statement: "Incomplete pose" }), { stopReason: "toolUse" });
		},
		() => fauxAssistantMessage("Which conversion would you like to work on?"),
	]);
	await turn(chat.id);
	const reopened = chatStore.getChat(chat.id)!;
	const assistants = reopened.messages.filter((message) => message.role === "assistant");
	assert.equal(assistants.length, 2);
	assert.equal(reopened.turns!.length, 1);
	assert.equal(reopened.turns![0]!.steps.length, 2);
	assert.ok(reopened.turns![0]!.steps.every((step) => step.inputTokens! > 0));
	assert.deepEqual(reopened.turns![0]!.drillPromptContext, {
		messageIds: assistants.map((message) => message.id),
		systemPromptTokens: Math.ceil(sentPrompt.length / 4),
	}, "reopening retains the actual run's prompt and both possible usage anchors");
});

it("an interrupted multi-step drill retains prompt provenance for the successful usage anchor", async () => {
	settingsStore.writeSettings({ version: 1 });
	for (const stopReason of ["error", "aborted"] as const) {
		const chat = chatStore.createChat(`Interrupted ${stopReason}`, "practice", "drill");
		chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
		faux.setResponses([
			() => fauxAssistantMessage(fauxToolCall("problem", { statement: "Incomplete pose" }), { stopReason: "toolUse" }),
			() => fauxAssistantMessage("Interrupted response", { stopReason, errorMessage: "Synthetic interruption" }),
		]);
		await turn(chat.id);
		const reopened = chatStore.getChat(chat.id)!;
		const assistants = reopened.messages.filter((message) => message.role === "assistant");
		assert.equal(assistants.length, 2);
		assert.equal(assistants[1]!.stopReason, stopReason);
		const estimate = estimateContextTokens(reopened.messages);
		assert.ok(estimate.usageTokens > 0);
		assert.equal(reopened.messages[estimate.lastUsageIndex!]!.id, assistants[0]!.id);
		assert.deepEqual(reopened.turns![0]!.drillPromptContext!.messageIds, assistants.map((message) => message.id),
			"the saved run identifies the valid earlier step as well as the interrupted tail");
	}
});

it("a reopened drill adjusts its usage anchor for policy and shared-override growth before the next turn", async (t) => {
	const policyPath = path.join(PATHS.root, "src/agent/prompts/drill/10-drill.md");
	const policy = fs.readFileSync(policyPath, "utf-8");
	const fixture = path.join(dataDir, "growing-policy.md");
	fs.writeFileSync(fixture, policy);
	const read = fs.readFileSync;
	t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => read(args[0] === policyPath ? fixture : args[0], args[1]));
	promptOverrides.writeOverride("shared/10-voice.md", "Shared voice.");
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } } });
	const chat = chatStore.createChat("Growing drill instructions", "practice", "drill");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
	chatStore.saveMessages(chat.id, [newUserMessage("Opening target."), newUserMessage("x".repeat(100_000)), newUserMessage("y".repeat(100_000))]);
	faux.setResponses([() => fauxAssistantMessage("Continue with cancellation.")]);
	await turn(chat.id);
	const reopened = chatStore.getChat(chat.id)!;
	const anchor = estimateContextTokens(reopened.messages);
	assert.ok(anchor.usageTokens > 40_000);
	fs.writeFileSync(fixture, policy.trim() + "p".repeat(4_000));
	promptOverrides.writeOverride("shared/10-voice.md", "Shared voice." + "v".repeat(4_000));
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: anchor.tokens + 1_000 } });
	let summaryInput = "";
	faux.setResponses([
		(context) => { summaryInput = JSON.stringify(context.messages); return fauxAssistantMessage("SUMMARY: conversions; cancellation; continue current work."); },
		() => fauxAssistantMessage("Use the revised guidance."),
	]);
	env.NODE_ENV = "development";
	t.after(() => { env.NODE_ENV = "test"; });
	await turn(chat.id);
	const marker = activeCompactionOf(chatStore.getChat(chat.id)!.messages);
	assert.ok(marker, "instruction growth crosses the threshold even though provider usage alone does not");
	assert.ok(summaryInput.includes("This is a focused drill"), "the first call after reopen must be the summarizer");
	assert.equal(marker.details.tokensBefore, anchor.tokens + 2_000, "retain all provider-counted context and tools; add only the instruction delta");
});

it("settle uses the captured prompt to subtract a mid-flight instruction shrink from nonzero provider usage", async (t) => {
	const policyPath = path.join(PATHS.root, "src/agent/prompts/drill/10-drill.md");
	const policy = fs.readFileSync(policyPath, "utf-8").trim();
	const fixture = path.join(dataDir, "shrinking-policy.md");
	fs.writeFileSync(fixture, policy + "p".repeat(40_000));
	const read = fs.readFileSync;
	t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => read(args[0] === policyPath ? fixture : args[0], args[1]));
	promptOverrides.writeOverride("shared/10-voice.md", "Shared voice." + "v".repeat(40_000));
	settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: 150_000 } });
	const chat = chatStore.createChat("Shrinking drill instructions", "practice", "drill");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "offline-drill" } });
	chatStore.saveMessages(chat.id, [newUserMessage("Opening target."), newUserMessage("x".repeat(30_000)), newUserMessage("y".repeat(30_000))]);
	let startedPrompt = "";
	faux.setResponses([
		(context) => {
			startedPrompt = systemText(context);
			fs.writeFileSync(fixture, policy);
			promptOverrides.writeOverride("shared/10-voice.md", "Shared voice.");
			settingsStore.writeSettings({ version: 1, agent: { prompts: { "shared/10-voice.md": true } }, compaction: { thresholdTokens: 70_000 } });
			return fauxAssistantMessage("Continue with cancellation.");
		},
	]);
	env.NODE_ENV = "development";
	t.after(() => { env.NODE_ENV = "test"; });
	await turn(chat.id);
	const reopened = chatStore.getChat(chat.id)!;
	const anchor = estimateContextTokens(reopened.messages);
	assert.ok(anchor.usageTokens > 70_000, "old instructions alone would have triggered settlement compaction");
	assert.ok(anchor.tokens - 20_000 < 70_000, "the current instructions put the projection below threshold");
	assert.equal(activeCompactionOf(reopened.messages), null, "shrinking instructions avoid an unnecessary summary");
	assert.equal(reopened.turns![0]!.drillPromptContext!.systemPromptTokens, Math.ceil(startedPrompt.length / 4));
	faux.setResponses([() => fauxAssistantMessage("Keep using cancellation.")]);
	await turn(chat.id);
	assert.equal(activeCompactionOf(chatStore.getChat(chat.id)!.messages), null, "the reopened turn-start gate uses the same saved prompt delta");
});
