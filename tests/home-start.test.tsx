import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionStartRequest } from "../components/home.tsx";
import { SessionStarter } from "../components/start-session.ts";

/**
 * Home is the one place a session starts (owner O4/P9: the old start page
 * and its tests are gone). These are the create-on-send rules that page's
 * tests guarded, now on Home's own request.
 */
function fakeFetch(id: string) {
	const calls: { url: string; body: Record<string, unknown> }[] = [];
	const f = (async (url: string, init?: RequestInit) => {
		calls.push({ url, body: JSON.parse(String(init?.body)) });
		return new Response(JSON.stringify({ id }), { status: 201 });
	}) as unknown as typeof fetch;
	return { f, calls };
}

describe("Home's session start", () => {
	it("teaching: the learner's words are the title, no kind on the wire", async () => {
		const { f, calls } = fakeFetch("c_teach");
		assert.equal(await new SessionStarter().start(sessionStartRequest("teach me orbital mechanics", "teach"), f), "/chat/c_teach");
		assert.equal(calls[0]!.url, "/api/chats");
		assert.deepEqual(calls[0]!.body, { title: "teach me orbital mechanics" });
	});
	it("practice is its own kind; with no picks it stays lean", () => {
		assert.deepEqual(sessionStartRequest("free practice", "practice", []), { title: "free practice", kind: "practice" });
	});
	it("drill has its own identity and carries picked ideas with the unchanged words", () => {
		const picks = [{ id: "n_volume", name: "Volume", statement: "1 m³ = 1000 L." }];
		assert.deepEqual(sessionStartRequest("Help with volume ratios", "drill", picks), {
			title: "Help with volume ratios", kind: "practice", practiceMode: "drill", graphContext: { propositions: picks },
		});
	});
	it("practice picks ride as graphContext", () => {
		const picks = [{ id: "n_1", name: "Parity", statement: "Odd + odd = even." }];
		assert.deepEqual(sessionStartRequest("drill me", "practice", picks), { title: "drill me", kind: "practice", graphContext: { propositions: picks } });
	});
});
