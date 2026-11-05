import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";

const directory = await fs.mkdtemp(path.join(tmpdir(), "notebook-catalog-"));
process.env.LH_DATA_DIR = path.join(directory, "data");
process.env.LH_AUTH_FILE = path.join(directory, "auth.json");
delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
const require = createRequire(import.meta.url);
const { SCOPES } = require("../electron/chatgpt.cjs");
const modelId = "gpt-6.1-terra";
await fs.mkdir(process.env.LH_DATA_DIR);
await fs.writeFile(process.env.LH_AUTH_FILE, JSON.stringify({ OPENCODE_API_KEY: "fixture-zen-key" }), { mode: 0o600 });
await fs.writeFile(path.join(directory, "data/settings.json"), JSON.stringify({ version: 1, models: { cheap: { model: { provider: "chatgpt", id: modelId }, thinkingLevel: "low" } } }));
await fs.writeFile(path.join(directory, "chatgpt-credentials.json"), JSON.stringify({ version: 1, hostId: "fixture-host", allowBackgroundUse: true, activeId: "A", registrations: ["A", "B"].map(id => ({ id, clientId: `oaiapp_fixture_${id}`, issuer: "https://auth.openai.com", subject: `fixture-${id}`, tokens: { accessToken: `fixture-access-${id}`, refreshToken: `fixture-refresh-${id}`, idToken: "fixture-identity", scopes: SCOPES, expiresAt: Date.now() + 3600000 } })) }), { mode: 0o600 });

let discoveries = 0, generations = 0, zenGenerations = 0;
let visibleModels = [modelId];
let discoveryFails = false, generationFails = false;
let expectedEffort = "medium";
const generationAccounts: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const request = new Request(input, init);
	if (request.url === "https://opencode.ai/inference/openai/v1/chat/completions") {
		zenGenerations++;
		assert.equal(request.headers.get("authorization"), "Bearer fixture-zen-key");
		const body = await request.json();
		assert.equal(body.model, "deepseek-v4.1-flash"); assert.equal(body.reasoning_effort, "low");
		assert.match(body.messages[0].content, /Distinguish these from speech-recognition errors/);
		const text = '{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x="}]}';
		const chunk = { id: "fixture-zen", object: "chat.completion.chunk", created: 1, model: body.model };
		return new Response([
			{ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] },
			{ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } },
		].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
	}
	if (request.url === "https://api.openai.com/v1/models") {
		discoveries++;
		return discoveryFails ? new Response("Fixture offline", { status: 503 }) : Response.json({ models: visibleModels.map(slug => ({ slug, display_name: slug, visibility: "list" })) });
	}
	assert.equal(request.url, "https://api.openai.com/v1/responses", "No unmocked network or API-key fallback");
	assert.equal(request.method, "POST");
	generationAccounts.push(request.headers.get("authorization")!); generations++;
	if (generationFails) return Response.json({ error: { message: "Fixture authorization rejected", type: "invalid_request_error", code: "invalid_user" } }, { status: 401 });
	const body = await request.json(); assert.equal(body.model, modelId);
	assert.equal(body.reasoning?.effort, expectedEffort, "Notebook reasoning must not inherit the shared Cheap low setting");
	const prompt = body.input.flatMap((item: { content: Array<{ text?: string }> }) => item.content ?? []).map((part: { text?: string }) => part.text ?? "").join("");
	const state = JSON.parse(prompt.split("CURRENT NOTEBOOK AND CONTEXT\n\n")[1]!.split("\n\nNOTEBOOK HISTORY")[0]!);
	const text = JSON.stringify({ action: "edit", operations: [{ op: state.lines.length ? "replace" : "insert", ...(!state.lines.length ? { after: null } : {}), id: "L1", latex: `p=${generations}` }] });
	const item = { type: "message", id: "fixture-output", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
	const events = [
		{ type: "response.created", response: { id: "fixture-response" } },
		{ type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
		{ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
		{ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
		{ type: "response.output_item.done", output_index: 0, item },
		{ type: "response.completed", response: { id: "fixture-response", status: "completed", output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } },
	];
	return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
};
const { webSubscriptionOwner } = await import("../src/server/web-subscriptions.ts");
const { refreshConnectionCatalog } = await import("../src/server/model-catalog.ts");
const { chatGPTScope } = await import("../src/agent/chatgpt-bridge.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { notebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
const service = notebookService();
const chat = chatStore.createChat("Catalog reuse");
const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
after(async () => { session.dispose(); webSubscriptionOwner().close(); globalThis.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); });
async function apply() {
	await session.dispatch({ type: "draft", text: "Write pressure." });
	await session.dispatch({ type: "apply" });
	await service.settled(chat.id); await session.refresh();
	return service.view(chat.id);
}

test("production Notebook engine reuses account-valid catalogs while preserving admission and explicit failure recovery", async t => {
	await t.test("the default candidate uses ChatGPT Terra medium on the wire independently of shared Cheap", async () => {
		const independent = chatStore.createChat("Default Terra medium");
		const client = createNotebookSession(independent.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), independent.id));
		try {
			await client.refresh(); await client.dispatch({ type: "visibility", visible: true });
			await client.dispatch({ type: "draft", text: "Write x=" }); await client.dispatch({ type: "apply" });
			await service.settled(independent.id); await client.refresh();
			assert.equal(client.getSnapshot().view?.problem, null);
			assert.deepEqual(client.getSnapshot().view?.lines, [{ id: "L1", latex: "p=1" }]);
			assert.equal(zenGenerations, 0); assert.equal(generations, 1); assert.equal(discoveries, 1);
			const attempt = chatStore.getChat(independent.id)!.notebook!.operations[0]!.execution!.attempts[0]!;
			assert.equal(attempt.model, "chatgpt:gpt-6.1-terra"); assert.equal(attempt.thinkingLevel, "medium");
		} finally { client.dispose(); }
	});
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "candidate", candidate: "terra-off" });
	expectedEffort = "none";
	const leases = t.mock.method(webSubscriptionOwner().chatgpt, "lease");
	await t.test("the next session and Apply reuse discovery but acquire fresh credential admissions", async () => {
		assert.equal((await apply()).problem, null); assert.equal(discoveries, 1); assert.equal(generations, 2);
		assert.equal((await apply()).problem, null); assert.equal(generations, 3);
		assert.equal(leases.mock.callCount(), 2, "catalog reuse never reuses a credential admission");
		assert.equal(discoveries, 1, "warm Apply must not wait on a new provider catalog request");
	});
	await t.test("explicit refresh fetches fresh metadata, then Apply reuses it", async () => {
		const before = discoveries; await refreshConnectionCatalog("chatgpt"); assert.equal(discoveries, before + 1);
		assert.equal((await apply()).problem, null); assert.equal(discoveries, before + 1);
	});
	await t.test("account switch invalidates the old catalog and acquires only the new account's credential", async () => {
		const before = discoveries; await webSubscriptionOwner().chatgpt.select("B");
		assert.throws(() => chatGPTScope(modelId), /catalog/);
		assert.equal((await apply()).problem, null); assert.equal(discoveries, before + 1);
		assert.equal(generationAccounts.at(-1), "Bearer fixture-access-B");
	});
	await t.test("removed model cannot dispatch or replay; an explicit new Apply can rediscover it", async () => {
		visibleModels = []; await refreshConnectionCatalog("chatgpt");
		const before = generations; const calls = discoveries;
		assert.equal((await apply()).problem?.status, "failed"); assert.equal(generations, before); assert.equal(discoveries, calls + 1);
		visibleModels = [modelId]; service.resume(chat.id); await service.settled(chat.id);
		assert.equal(generations, before, "availability returning cannot automatically retry failed working");
		assert.equal((await apply()).problem, null); assert.equal(generations, before + 1);
	});
	await t.test("failed explicit refresh invalidates prior metadata; retry remains explicit", async () => {
		discoveryFails = true; await refreshConnectionCatalog("chatgpt");
		assert.throws(() => chatGPTScope(modelId), /catalog/);
		const before = generations;
		assert.equal((await apply()).problem?.status, "failed"); assert.equal(generations, before);
		discoveryFails = false;
		assert.equal((await apply()).problem, null); assert.equal(generations, before + 1);
	});
	await t.test("a cached model cannot hide provider authorization failure or trigger a transport retry", async () => {
		generationFails = true; const before = generations; const working = service.view(chat.id).lines;
		assert.equal((await apply()).problem?.status, "failed"); assert.equal(generations, before + 1);
		assert.deepEqual(service.view(chat.id).lines, working);
		generationFails = false; service.resume(chat.id); await service.settled(chat.id); assert.equal(generations, before + 1);
		await refreshConnectionCatalog("chatgpt"); assert.equal((await apply()).problem, null);
	});
	await t.test("paused authorization denies new generations despite previously loaded metadata", async () => {
		webSubscriptionOwner().chatgpt.pause(); const before = generations;
		assert.throws(() => chatGPTScope(modelId), /catalog/);
		assert.equal((await apply()).problem?.status, "failed"); assert.equal(generations, before);
	});
});
