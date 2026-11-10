import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { createModels } from "@earendil-works/pi-ai";
import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { startPreviewSubscriptionHelper } from "../../../scripts/lib/preview-subscription-helper.mjs";

const require = createRequire(import.meta.url);
const { createChatGPT, SCOPES } = require("../../../electron/chatgpt.cjs");
const { createSubscriptions } = require("../../../electron/subscriptions.cjs");
const { createPreviewSubscriptionBackend } = require("../../../electron/preview-subscription-owner.cjs");
const credentials = { chatgpt: "synthetic-helper-chatgpt-secret", xai: "synthetic-helper-xai-secret", "github-copilot": "tid=synthetic-helper;proxy-ep=proxy.individual.githubcopilot.com;" };
const models = openaiProvider().getModels().filter(model => model.api === "openai-responses").slice(0, 2);
const copilotModels = githubCopilotProvider().getModels();
const requests = [];
let active = 0;
const upstream = http.createServer(async (request, response) => {
	try {
		const provider = request.url.slice(1);
		assert.equal(request.headers.authorization, `Bearer ${credentials[provider]}`);
		assert.equal(request.headers.host.startsWith("127.0.0.1:"), true);
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const payload = JSON.parse(Buffer.concat(chunks).toString());
		requests.push({ provider, model: payload.model, authenticated: true, injectedAuthorizationIgnored: request.headers.authorization !== "Bearer malicious-client-value" });
		if (payload.hold) {
			active++;
			response.on("close", () => { active--; });
			response.writeHead(200, { "content-type": "text/event-stream" });
			response.write("data: pending\n\n");
			return;
		}
		if (payload.fail) { response.writeHead(401, { authorization: request.headers.authorization }); response.end(request.headers.authorization); return; }
		response.writeHead(200, { "content-type": "text/event-stream", "set-cookie": "provider-secret=never-forward", authorization: request.headers.authorization });
		const event = value => response.write(`data: ${JSON.stringify(value)}\n\n`);
		event({ type: "response.created", response: { id: "response-fixture", status: "in_progress", model: payload.model, output: [] } });
		event({ type: "response.output_item.added", output_index: 0, item: { id: "message-fixture", type: "message", role: "assistant", content: [] } });
		event({ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
		event({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "Synthetic preview response" });
		event({ type: "response.output_text.done", output_index: 0, content_index: 0, text: "Synthetic preview response" });
		event({ type: "response.output_item.done", output_index: 0, item: { id: "message-fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Synthetic preview response", annotations: [] }] } });
		event({ type: "response.completed", response: { id: "response-fixture", status: "completed", model: payload.model, output: [], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3, input_tokens_details: { cached_tokens: 0 } } } });
		response.end();
	} catch { response.writeHead(500); response.end("Synthetic upstream assertion failed"); }
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
const state = { version: 1, hostId: "synthetic-host", allowBackgroundUse: true, activeId: "synthetic-account", registrations: [{ id: "synthetic-account", clientId: "oaiapp_synthetic", issuer: "https://auth.openai.com", subject: "synthetic-subject", email: "private-synthetic@example.invalid", tokens: { accessToken: credentials.chatgpt, refreshToken: "synthetic-refresh-secret", idToken: "synthetic-id-secret", scopes: SCOPES, expiresAt: Date.now() + 3600000 } }] };
const chatgpt = createChatGPT({ store: { read: async () => structuredClone(state), write: async () => { throw new Error("Unexpected fixture write"); } }, openExternal: async () => { throw new Error("No browser login"); }, fetch: async input => {
	assert.equal(String(input), "https://api.openai.com/v1/models");
	return Response.json({ models: models.map(model => ({ slug: model.id, display_name: model.name, visibility: "list" })) });
} });
const native = createSubscriptions({ directory: process.argv[2], sdk: { createModels, githubCopilotProvider, xaiProvider }, openExternal: async () => { throw new Error("No browser login"); }, stores: Object.fromEntries(["github-copilot", "xai"].map(provider => [provider, {
	read: async () => ({ version: 1, allowBackgroundUse: true, connectionId: "00000000-0000-4000-8000-000000000001", credential: { type: "oauth", access: credentials[provider], refresh: "synthetic-refresh-secret", expires: Date.now() + 3600000, ...(provider === "github-copilot" ? { availableModelIds: copilotModels.map(model => model.id) } : {}) } }),
	write: async () => { throw new Error("Unexpected fixture write"); },
}])) });
await native.ready;
const helper = await startPreviewSubscriptionHelper({ directory: process.argv[2], backend: createPreviewSubscriptionBackend({ chatgpt, native, fetch: async (input, init) => {
	const url = new URL(input);
	const provider = url.origin === "https://api.openai.com" ? "chatgpt" : url.origin === "https://api.x.ai" ? "xai" : url.hostname.endsWith(".githubcopilot.com") ? "github-copilot" : null;
	assert.ok(provider, "Only trusted provider destinations may be resolved");
	assert.ok(["/v1/responses", "/responses", "/chat/completions", "/v1/messages"].includes(url.pathname));
	return fetch(`http://127.0.0.1:${upstream.address().port}/${provider}`, init);
} }) });
process.send({ ready: true, models: models.map(model => model.id), upstreamPort: upstream.address().port });
process.on("message", message => {
	if (message.op === "stats") process.send({ stats: requests, active });
});
let stopping = false;
async function close() {
	if (stopping) return;
	stopping = true;
	await helper.close(); chatgpt.close(); native.close(); upstream.closeAllConnections();
	await new Promise(resolve => upstream.close(resolve));
	process.disconnect();
}
process.on("SIGTERM", () => { void close(); });
process.on("disconnect", () => { void close(); });
