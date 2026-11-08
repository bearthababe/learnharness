"use strict";
const { randomUUID } = require("node:crypto");

const PLACEHOLDER = "preview-helper-not-a-provider-credential";
const PROVIDERS = ["github-copilot", "xai"];
const PATHS = { "openai-responses": "responses", "openai-completions": "chat/completions", "anthropic-messages": "v1/messages" };
const PROTOCOL_HEADERS = new Set(["anthropic-version", "anthropic-beta", "x-initiator", "openai-intent", "copilot-vision-request", "copilot-integration-id", "editor-version", "editor-plugin-version", "user-agent", "x-github-api-version"]);
const stamp = value => ({ epoch: value.epoch, authorityRevision: value.authorityRevision, revision: value.revision });
const safeModel = model => ({ id: model.id, name: model.name, type: model.type, provider: model.provider, api: model.api, baseUrl: "https://preview-helper.invalid", reasoning: model.reasoning, input: model.input, inputLimits: model.inputLimits, cost: model.cost, contextWindow: model.contextWindow, maxTokens: model.maxTokens, compat: model.compat, thinkingLevelMap: model.thinkingLevelMap, promptCache: model.promptCache, samplingParams: model.samplingParams, samplingParamsByThinkingLevel: model.samplingParamsByThinkingLevel });

function createPreviewSubscriptionBackend({ chatgpt, native, fetch: transport = globalThis.fetch }) {
	return {
		open() {
			const aliases = new Map();
			const alias = identity => {
				if (!identity) return null;
				if (!aliases.has(identity)) aliases.set(identity, randomUUID());
				return aliases.get(identity);
			};
			async function chatModels() {
				const value = await chatgpt.models();
				const active = value.status.activeId;
				const account = value.status.accounts.find(account => account.id === active);
				const status = { available: value.status.available, pending: false, allowBackgroundUse: value.status.allowBackgroundUse, activeId: alias(active), accounts: active ? [{ id: alias(active), email: "Preview subscription", registration: "preview", connected: account?.connected === true, planEnabled: account?.planEnabled }] : [], error: value.status.error ? "Subscription unavailable." : null, ...(value.status.catalogError ? { catalogError: "Subscription model catalog unavailable." } : {}) };
				return { original: value, public: { ...stamp(value), status, accountId: alias(value.accountId), models: value.models.map(model => ({ id: model.id, name: model.name })) } };
			}
			async function snapshot() {
				const value = await native.snapshot();
				return { original: value, public: { statuses: value.statuses.map(status => ({ providerId: status.providerId, available: status.available, connected: status.connected, pending: false, allowBackgroundUse: status.allowBackgroundUse, connectionId: alias(status.connectionId), ...stamp(status) })), models: Object.fromEntries(PROVIDERS.map(provider => [provider, (value.models[provider] ?? []).map(safeModel)])) } };
			}
			async function resolve(channel, fields) {
				if (channel === "lh:chatgpt") {
					const value = await chatModels();
					if (fields.expectedAccountId !== value.public.accountId || fields.expectedAuthorityRevision !== value.public.authorityRevision || !value.public.models.some(model => model.id === fields.selectedModelId)) throw new Error("Unavailable");
					return { original: value.original, public: value.public, scope: { ...fields, expectedAccountId: value.original.accountId } };
				}
				if (channel !== "lh:subscriptions" || !PROVIDERS.includes(fields.scope?.providerId)) throw new Error("Unavailable");
				const value = await snapshot();
				const status = value.original.statuses.find(status => status.providerId === fields.scope.providerId);
				if (!status || fields.scope.connectionId !== alias(status.connectionId) || fields.scope.epoch !== status.epoch || fields.scope.authorityRevision !== status.authorityRevision || !value.original.models[status.providerId]?.some(model => model.id === fields.scope.selectedModelId)) throw new Error("Unavailable");
				return { original: value.original, scope: { ...fields.scope, connectionId: status.connectionId } };
			}
			return {
				async read(channel, op, fields) {
					if (channel === "lh:chatgpt" && ["status", "models"].includes(op)) return (await chatModels()).public;
					if (channel === "lh:subscriptions" && op === "snapshot") return (await snapshot()).public;
					if (op !== "lease" || typeof fields.background !== "boolean") throw new Error("Unavailable");
					const resolved = await resolve(channel, fields);
					if (channel === "lh:chatgpt") return { ...stamp(resolved.public), accountId: resolved.public.accountId, accessToken: PLACEHOLDER };
					return { scope: fields.scope, auth: { apiKey: PLACEHOLDER } };
				},
				async dispatch(channel, fields, request, signal) {
					if (typeof fields.background !== "boolean" || !request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) throw new Error("Unavailable");
					const resolved = await resolve(channel, fields);
					let auth, model;
					if (channel === "lh:chatgpt") {
						const credentials = await chatgpt.lease(fields.background, resolved.scope);
						auth = { apiKey: credentials.accessToken };
						model = { id: fields.selectedModelId, api: "openai-responses", baseUrl: "https://api.openai.com/v1" };
					} else {
						const leased = await native.lease(resolved.scope, fields.background);
						auth = leased.auth;
						model = resolved.original.models[resolved.scope.providerId].find(model => model.id === resolved.scope.selectedModelId);
					}
					if (signal.aborted || request.payload.model !== model.id || !PATHS[model.api]) throw new Error("Unavailable");
					const endpoint = new URL(`${(auth.baseUrl ?? model.baseUrl).replace(/\/$/, "")}/${PATHS[model.api]}`);
					if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Unavailable");
					const headers = new Headers({ "content-type": "application/json", accept: "text/event-stream" });
					for (const [name, value] of Object.entries(request.headers ?? {})) if (PROTOCOL_HEADERS.has(name.toLowerCase()) && typeof value === "string") headers.set(name, value);
					for (const [name, value] of Object.entries(model.headers ?? {})) if (value !== null) headers.set(name, value);
					if (auth.apiKey) headers.set("authorization", `Bearer ${auth.apiKey}`);
					for (const [name, value] of Object.entries(auth.headers ?? {})) { if (value === null) headers.delete(name); else headers.set(name, value); }
					return transport(endpoint, { method: "POST", headers, body: JSON.stringify(request.payload), signal, redirect: "error", cache: "no-store" });
				},
			};
		},
	};
}

module.exports = { createPreviewSubscriptionBackend };
