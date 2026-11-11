import http from "node:http";
import { Readable } from "node:stream";
import type { SubscriptionRuntimeChannel } from "./subscription-runtime.ts";
import type { ChatGPTStatus } from "../core/contracts/chatgpt.ts";
import { NATIVE_SUBSCRIPTIONS, type NativeSubscriptionSnapshot } from "../core/contracts/subscriptions.ts";

export function previewSubscriptionsActive(): boolean { return process.env.LH_PREVIEW_PROFILE === "1"; }
const disconnectedChatGPT = (): ChatGPTStatus => ({ available: false, pending: false, allowBackgroundUse: false, activeId: null, accounts: [], error: "Preview subscription access requires local approval for this active lease." });
const disconnectedNative = (): NativeSubscriptionSnapshot => ({ statuses: NATIVE_SUBSCRIPTIONS.map(({ providerId }) => ({ providerId, available: false, connected: false, pending: false, allowBackgroundUse: false, connectionId: null, epoch: 0, authorityRevision: 0, revision: 0 })), models: {} });

function requestHelper(endpoint: string, command: unknown, signal?: AbortSignal): Promise<Response> {
	return new Promise((resolve, reject) => {
		const socketPath = process.env.LH_PREVIEW_HELPER_SOCKET;
		const lease = process.env.LH_PREVIEW_LEASE;
		if (!previewSubscriptionsActive() || !socketPath || !lease) return reject(new Error("Preview subscription unavailable."));
		const outgoing = http.request({ socketPath, path: endpoint, method: "POST", headers: { "content-type": "application/json", "x-preview-lease": lease }, signal }, incoming => {
			if (incoming.statusCode !== 200) { incoming.resume(); reject(new Error("Preview subscription unavailable. Local approval is required.")); return; }
			const headers = new Headers();
			if (typeof incoming.headers["content-type"] === "string") headers.set("content-type", incoming.headers["content-type"]);
			resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status: 200, headers }));
		});
		outgoing.on("error", () => reject(new Error("Preview subscription unavailable.")));
		outgoing.setTimeout(45000, () => outgoing.destroy(new Error("Preview subscription unavailable.")));
		outgoing.end(JSON.stringify(command));
	});
}

export async function previewSubscriptionRequest<T>(channel: SubscriptionRuntimeChannel, op: string, fields: Record<string, unknown>): Promise<T> {
	return await (await requestHelper("/read", { channel, op, fields })).json() as T;
}

export async function previewSubscriptionStatus() {
	const [chatgpt, native] = await Promise.all([previewSubscriptionRequest<{ status: ChatGPTStatus }>("lh:chatgpt", "status", {}).catch(() => ({ status: disconnectedChatGPT() })), previewSubscriptionRequest<NativeSubscriptionSnapshot>("lh:subscriptions", "snapshot", {}).catch(disconnectedNative)]);
	return { chatgpt: chatgpt.status, native: native.statuses };
}

export async function previewSubscriptionFetch(channel: SubscriptionRuntimeChannel, fields: Record<string, unknown>, input: string | URL | Request, init?: RequestInit): Promise<Response> {
	const request = new Request(input, init);
	if (request.method !== "POST") throw new Error("Preview subscription only supports model requests.");
	const payload: unknown = await request.json();
	return requestHelper("/dispatch", { channel, fields, request: { payload, headers: Object.fromEntries(request.headers) } }, request.signal);
}
