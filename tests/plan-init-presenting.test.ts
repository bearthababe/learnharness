/**
 * plan_init — the presenting-turn reminder (issue #73, E3). While no
 * node-tagged quiz/explain call exists, a successful plan_init is the plan
 * presentation: its result tells the teacher to present, ask for
 * confirmation and end the turn, with no teaching. Once teaching has begun,
 * a rewrite carries on without re-presenting, so the reminder is absent.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { PLAN_PRESENTING_REMINDER, planTools, teachingStarted } from "../src/agent/tools/plan.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";

fs.mkdirSync(PATHS.data, { recursive: true });

const createdChats: string[] = [];
after(() => {
	for (const id of createdChats) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* scratch cleanup, best effort */
		}
	}
});

function newChat(title: string): string {
	const chat = chatStore.createChat(title);
	createdChats.push(chat.id);
	return chat.id;
}

function assistantWithCall(id: string, toolName: string, args: unknown): LhMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "toolCall", id: `call_${id}`, name: toolName, arguments: args as never }],
		api: "openai-completions",
		provider: "openrouter",
		model: "test",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		stopReason: "stop",
		timestamp: Date.now(),
	} as never;
}

const MERMAID = "graph TD\n  base[Base fact] --> goal[Goal]";

async function planInit(chatId: string): Promise<{ text: string; ok: boolean }> {
	const tool = planTools({ chatId, chatStore }).plan_init!;
	const result = await tool.execute("test", { mermaid: MERMAID });
	const text = (result.content[0] as { text: string }).text;
	return { text, ok: (result.details as { ok: boolean }).ok };
}

describe("plan_init: the presenting turn", () => {
	it("the first plan_init (no teaching yet) reminds the teacher to present, ask and stop", async () => {
		const chatId = newChat("Plan: presenting");
		const { text, ok } = await planInit(chatId);
		assert.equal(ok, true);
		const parsed = JSON.parse(text) as { reminder: string; nodeIds: string[] };
		assert.deepEqual(parsed.nodeIds, ["base", "goal"]);
		assert.ok(parsed.reminder.includes(PLAN_PRESENTING_REMINDER));
		assert.match(parsed.reminder, /No teaching/);
	});

	it("a re-presentation after a change request (still no tagged check) keeps the reminder", async () => {
		const chatId = newChat("Plan: re-present");
		chatStore.saveMessages(chatId, [
			assistantWithCall("m1", "plan_init", { mermaid: MERMAID }),
			// an untagged question does not start teaching
			assistantWithCall("m2", "ask_user_question", { question: "ok?" }),
		]);
		const parsed = JSON.parse((await planInit(chatId)).text) as { reminder: string };
		assert.ok(parsed.reminder.includes(PLAN_PRESENTING_REMINDER));
	});

	it("a refused quiz with an empty nodeId does not end the presenting turn", async () => {
		const chatId = newChat("Plan: empty node id");
		chatStore.saveMessages(chatId, [
			assistantWithCall("m1", "plan_init", { mermaid: MERMAID }),
			assistantWithCall("m2", "quiz", { question: "q?", nodeId: "", type: "check" }),
		]);
		const parsed = JSON.parse((await planInit(chatId)).text) as { reminder: string };
		assert.ok(parsed.reminder.includes(PLAN_PRESENTING_REMINDER));
	});

	it("a mid-lesson rewrite (a node-tagged check exists) carries on without the presenting reminder", async () => {
		const chatId = newChat("Plan: mid-lesson rewrite");
		chatStore.saveMessages(chatId, [
			assistantWithCall("m1", "plan_init", { mermaid: MERMAID }),
			assistantWithCall("m2", "quiz", { question: "q?", nodeId: "base", type: "check" }),
		]);
		const parsed = JSON.parse((await planInit(chatId)).text) as { reminder: string };
		assert.ok(!parsed.reminder.includes(PLAN_PRESENTING_REMINDER));
		assert.match(parsed.reminder, /only valid nodeId values/);
	});

	it("teachingStarted counts node-tagged quiz and explain calls only", () => {
		assert.equal(teachingStarted([]), false);
		assert.equal(teachingStarted([assistantWithCall("a", "quiz", { question: "q?" })]), false);
		assert.equal(teachingStarted([assistantWithCall("a", "quiz", { question: "q?", nodeId: "" })]), false, "an empty tag is untagged, as in phases.ts");
		assert.equal(teachingStarted([assistantWithCall("a", "explain", { question: "q?", nodeId: "x" })]), true);
	});
});
