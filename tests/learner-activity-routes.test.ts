/**
 * THE SESSIONS LIST FOLLOWS THE LEARNER (round 14 P15; merge proof E2).
 * Every learner-initiated write that changes the conversation moves its
 * session to the top, as it did on base (where any such write bumped the
 * list order): an Esc-dismissal (written at once, or parked while a turn
 * runs), the demo/figure invert switch, a steer while the tutor answers.
 * A refused request moves nothing, and a background delivery never moves
 * a session. The guard at the end keeps every route that writes the
 * conversation on the list.
 *
 * Runs under an isolated LH_DATA_DIR (set before any config-loading import).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-learner-activity-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { chatStore } = await import("../src/store/chats.ts");
const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");
const { registerLiveAgent, unregisterLiveAgent } = await import("../src/server/jobs.ts");
const { danglingQuestionOf, dismissedAnswer, buildSubagentSteer } = await import("../src/core/index.ts");
const { newMessageId } = await import("../src/core/native-messages.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const artifactRoute = await import("../app/api/chats/[id]/artifact-ui/route.ts");
const steerRoute = await import("../app/api/chats/[id]/steer/route.ts");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const post = (route: { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }, id: string, body: unknown) =>
	route.POST(new Request(`http://test/api/chats/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const order = (...ids: string[]) => chatStore.listChats().map((chat) => chat.id).filter((id) => ids.includes(id));

/** An older session (the one the learner acts in) and a newer one above it. */
async function pair(setup: (id: string) => void): Promise<{ older: string; newer: string }> {
	const older = chatStore.createChat("zz-older").id;
	setup(older);
	await sleep(5);
	const newer = chatStore.createChat("zz-newer").id;
	await sleep(5);
	assert.deepEqual(order(older, newer), [newer, older], "setup: the newer session is on top");
	return { older, newer };
}
const withQuiz = (id: string) => chatStore.saveMessages(id, [{
	id: newMessageId(), role: "assistant",
	content: [{ type: "toolCall", id: `${id}-q1`, name: "quiz", arguments: { question: "What is pressure?", options: [{ label: "Force per area" }, { label: "Force" }], correctAnswer: "Force per area", explanation: "p = F/A" } }],
} as never]);
const dismissBody = (id: string) => {
	const pending = danglingQuestionOf(chatStore.getChat(id)!.messages)!;
	return { input: { type: "dismiss", toolCallId: pending.toolCallId, answer: dismissedAnswer("quiz", "What is pressure?") } };
};

describe("learner writes move the session (P15)", () => {
	it("an Esc-dismissal written at once", async () => {
		const { older, newer } = await pair(withQuiz);
		const res = await post(dismissRoute, older, dismissBody(older));
		assert.equal(res.status, 200);
		assert.deepEqual(order(older, newer), [older, newer]);
	});

	it("an Esc-dismissal parked while a turn runs (202): the learner acted now", async () => {
		const { older, newer } = await pair(withQuiz);
		beginTurn(older);
		try {
			const res = await post(dismissRoute, older, dismissBody(older));
			assert.equal(res.status, 202);
			assert.deepEqual(order(older, newer), [older, newer]);
		} finally { endTurn(older); }
	});

	it("the demo/figure invert switch", async () => {
		const steer = buildSubagentSteer({ id: "jz", kind: "demo", toolCallId: "cz" }, { title: "T", html: "<p>x</p>", tested: true });
		const { older, newer } = await pair((id) => chatStore.saveMessages(id, [steer as never]));
		const res = await post(artifactRoute, older, { input: { messageId: (steer as { id: string }).id, inverted: true } });
		assert.equal(res.status, 200);
		assert.deepEqual(order(older, newer), [older, newer]);
	});

	it("a steer typed while the tutor is answering", async () => {
		const { older, newer } = await pair(() => {});
		const steered: unknown[] = [];
		registerLiveAgent(older, { steer: (message: unknown) => steered.push(message) } as never);
		try {
			const res = await post(steerRoute, older, { input: { type: "steer", text: "zz-prove-it steer", id: newMessageId() } });
			assert.equal(res.status, 200);
			assert.equal(steered.length, 1);
			assert.deepEqual(order(older, newer), [older, newer]);
		} finally { unregisterLiveAgent(older); }
	});
});

describe("refused requests and background deliveries never move a session", () => {
	it("a refused dismissal (nothing pending: 400)", async () => {
		const { older, newer } = await pair(() => {});
		const res = await post(dismissRoute, older, { input: { type: "dismiss", toolCallId: "no-such-call", answer: dismissedAnswer("quiz", "x") } });
		assert.equal(res.status, 400);
		assert.deepEqual(order(older, newer), [newer, older]);
	});

	it("a refused invert (not a demo/figure: 400) and a steer with no live turn (409)", async () => {
		const { older, newer } = await pair((id) => chatStore.saveMessages(id, [{ id: "plain", role: "user", content: "hi" } as never]));
		assert.equal((await post(artifactRoute, older, { input: { messageId: "plain", inverted: true } })).status, 400);
		assert.equal((await post(steerRoute, older, { input: { type: "steer", text: "zz-prove-it", id: newMessageId() } })).status, 409);
		assert.deepEqual(order(older, newer), [newer, older]);
	});

	it("a job's result delivered in the background", async () => {
		const { older, newer } = await pair(() => {});
		chatStore.saveMessages(older, [{ role: "custom", customType: "subagent-steer", content: "result", display: true, details: {}, timestamp: Date.now() } as never]);
		assert.deepEqual(order(older, newer), [newer, older], "updatedAt moves, the order does not");
		assert.ok(chatStore.listChats().find((chat) => chat.id === older)?.resultAt, "the list marks the new result instead");
	});
});

describe("guard: every route that writes the conversation stamps learner activity", () => {
	it("each app route calling a conversation writer is on the learner list (or explained)", () => {
		const writers = /saveMessages\(|commitNotebookInput\(|commitNotebookSubmission\(|steerLiveChat\(|submitNotebookSteer\(|handleChatRequest\(|handleChatInput\(/;
		// Routes whose writes are not a learner acting in an existing session, or
		// that stamp through a server function they call.
		const explained: Record<string, string> = {
			"app/api/chats/route.ts": "creates the session; a new record carries activityAt from its birth",
			"app/api/chat/route.ts": "handleChatRequest stamps after an accepted input (src/server/chat-handler.ts)",
		};
		const routes: string[] = [];
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name === "route.ts") routes.push(path.relative(process.cwd(), full));
			}
		};
		walk(path.join(process.cwd(), "app", "api"));
		const unstamped = routes.filter((file) => {
			const source = fs.readFileSync(file, "utf-8");
			return writers.test(source) && !source.includes("noteLearnerActivity") && !(file in explained);
		});
		assert.deepEqual(unstamped, [], "a route writes the conversation without noting learner activity");
		const notebookSteer = fs.readFileSync("src/server/notebook-steer.ts", "utf-8");
		assert.ok(notebookSteer.includes("noteLearnerActivity"), "the notebook steer stamps too");
		const handler = fs.readFileSync("src/server/chat-handler.ts", "utf-8");
		assert.ok(handler.includes("noteLearnerActivity(chatId)"), "the chat route stamps after an accepted input");
	});
});
