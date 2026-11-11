import assert from "node:assert/strict";
import { normalizeContext } from "@earendil-works/pi-ai";
import "../../../src/server/web-subscriptions.ts";
import { refreshConnectionCatalog, modelCatalog, validateChatSettings } from "../../../src/server/model-catalog.ts";
import { chatGPTModels } from "../../../src/agent/chatgpt-bridge.ts";
import { nativeSubscriptionModels } from "../../../src/agent/subscription-bridge.ts";
import { piModels } from "../../../src/agent/models.ts";
import { chatGPTStream } from "../../../src/agent/chatgpt-stream.ts";
import { nativeSubscriptionStream } from "../../../src/agent/subscription-stream.ts";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { webSubscriptionOwner, webSubscriptionStatus } from "../../../src/server/web-subscriptions.ts";
import { subscriptionControlsResponse } from "../../../src/server/web-subscription-http.ts";

await refreshConnectionCatalog();
const available = chatGPTModels();
if (process.argv.includes("--denied")) {
	assert.equal(available.length, 0);
	assert.equal(nativeSubscriptionModels().length, 0);
	assert.equal((await webSubscriptionStatus()).chatgpt.available, false);
	assert.throws(() => webSubscriptionOwner(), /local lease approval/);
	const control = await subscriptionControlsResponse(new Request("http://preview.invalid/api/subscriptions", { method: "POST", headers: { "content-type": "application/json", "x-learnharness-subscriptions": "1", origin: "http://preview.invalid" }, body: JSON.stringify({ providerId: "chatgpt", op: "login" }) }));
	assert.equal(control.status, 400);
	console.log(JSON.stringify({ defaultDenied: true, localCredentialOwnerRefused: true, previewLoginRefused: true }));
	process.exit(0);
}
assert.equal(available.length >= 2, true);
const results = [];
for (const model of available.slice(0, 2)) {
	assert.equal(modelCatalog().models.some(entry => entry.provider === "chatgpt" && entry.id === model.id), true);
	assert.equal(validateChatSettings({ model: { provider: model.provider, id: model.id } }).ok, true);
	const response = await chatGPTStream(() => false)(model, normalizeContext({ messages: [{ role: "user", content: "Synthetic fixture only", timestamp: Date.now() }] }), { maxTokens: 100 }).result();
	assert.equal(response.stopReason, "stop", response.errorMessage);
	assert.equal(response.content.some(content => content.type === "text" && content.text === "Synthetic preview response"), true);
	results.push({ provider: model.provider, model: model.id, stopReason: response.stopReason });
}
const model = nativeSubscriptionModels().find(model => model.provider === "xai-subscription")!;
assert.ok(model);
const response = await nativeSubscriptionStream(xaiProvider(), () => false)(model, normalizeContext({ messages: [{ role: "user", content: "Synthetic fixture only", timestamp: Date.now() }] }), { maxTokens: 100 }).result();
assert.equal(response.stopReason, "stop", response.errorMessage);
results.push({ provider: model.provider, model: model.id, stopReason: response.stopReason });
assert.equal(piModels().getModels("openai").length > 0, true);
const result = { results, environmentContainsProviderCredential: Object.values(process.env).some(value => value?.includes("synthetic-helper-")) };
if (process.argv.includes("--watch")) {
	process.send!(result);
	process.once("message", async () => {
		await refreshConnectionCatalog();
		assert.equal(chatGPTModels().length, 0);
		assert.equal(nativeSubscriptionModels().length, 0);
		assert.equal((await webSubscriptionStatus()).chatgpt.available, false);
		process.send!({ refreshedAfterRevoke: true, availableModels: 0 }, () => process.disconnect());
	});
} else console.log(JSON.stringify(result));
