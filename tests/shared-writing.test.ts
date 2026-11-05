import assert from "node:assert/strict";
import { after, it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { stores } from "../src/server/stores.ts";
import { MAX_WRITING_BYTES, sharedWritingResponse, resolveSharedWriting } from "../src/server/shared-writing.ts";
import { handleChatRequest } from "../src/server/chat-handler.ts";
import { runningTurn } from "../src/server/turn-runs.ts";
import { createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { readTool } from "../src/agent/tools/read.ts";
import { inputAppends, parseChatInput } from "../src/core/input-events.ts";
import { newThinkingMessage, toLlmMessages, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { buildAnswer } from "../src/core/question-core.ts";

const png = Buffer.from(createCanvas(1, 1).toBuffer("image/png"));
const created: string[] = [];
function chat() {
	const c = stores.chatStore.createChat("Shared writing integration test");
	created.push(c.id);
	return c;
}
after(() => {
	for (const id of created) {
		stores.sharedWritingStore.deleteChat(id);
		stores.chatStore.deleteChat(id);
	}
});
const get = (id: string) => sharedWritingResponse(new Request("http://test/writing"), id);
const upload = (id: string, body = png) => sharedWritingResponse(new Request("http://test/writing", { method: "POST", body }), id);

it("upload preserves the original and stays pending across reads without starting a turn", async () => {
	const c = chat();
	const result = await upload(c.id);
	assert.equal(result.status, 201);
	const { writing } = await result.json();
	assert.equal(runningTurn(c.id), undefined);
	assert.deepEqual(stores.chatStore.getChat(c.id)!.messages, []);
	for (let i = 0; i < 2; i++) assert.deepEqual((await (await get(c.id)).json()).pending, [writing]);
	const image = await sharedWritingResponse(new Request("http://test/image"), c.id, writing.id);
	assert.equal(image.headers.get("Content-Type"), "image/png");
	assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
	assert.throws(() => resolveSharedWriting(chat().id, { type: "text", text: "", writingIds: [writing.id] }, []), /missing/);
	assert.throws(() => resolveSharedWriting(c.id, { type: "text", text: "", writingIds: ["writing_missing"] }, []), /missing/);
	assert.equal((await (await get(c.id)).json()).pending.length, 1);
});

it("rejects invalid and oversized uploads without recording work", async () => {
	const c = chat();
	assert.equal((await upload(c.id, Buffer.from("not a PNG"))).status, 415);
	assert.equal((await upload(c.id, Buffer.alloc(MAX_WRITING_BYTES + 1))).status, 413);
	assert.equal((await upload("missing_session")).status, 404);
	assert.equal((await get("../escape")).status, 404);
	assert.deepEqual((await (await get(c.id)).json()).pending, []);
	assert.throws(() => parseChatInput({ type: "text", text: "" }), /text/);
	assert.throws(() => parseChatInput({ type: "retry", writingIds: ["writing_one"] }), /submission/);
	assert.throws(() => parseChatInput({ type: "text", text: "", writingIds: ["../escape"] }), /ids/);
});

it("explicit image-only Send persists once and the real read tool supplies image bytes to the model", async () => {
	process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";
	const c = chat();
	stores.chatStore.saveSettings(c.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const { writing } = await (await upload(c.id)).json();
	const imagePath = stores.sharedWritingStore.filePath(c.id, writing.id);
	const faux = createFauxCore({});
	let imageRead = false;
	faux.setResponses([
		(context) => {
			assert.match(JSON.stringify(context.messages), /Shared handwritten working/);
			assert.ok(JSON.stringify(context.messages).includes(imagePath));
			return fauxAssistantMessage([fauxToolCall("read", { path: imagePath })], { stopReason: "toolUse" });
		},
		(context) => {
			const result = context.messages.find((m) => m.role === "toolResult" && m.toolName === "read");
			assert.ok(result && Array.isArray(result.content));
			assert.ok(result.content.some((part) => part.type === "image" && part.data === png.toString("base64")));
			imageRead = true;
			return fauxAssistantMessage([fauxText("Image received by the scripted tutor.")]);
		},
	]);
	const request = () => new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: c.id, input: { type: "text", text: "", writingIds: [writing.id] } }) });
	const response = await handleChatRequest(request(), (opts) => createTeacherAgent(undefined, { messages: opts.messages, engine: { model: faux.getModel(), streamFn: faux.streamSimple }, tools: { read: readTool } }));
	assert.equal(response.status, 200, await response.text());
	const turn = runningTurn(c.id);
	if (turn) await new Response(turn.subscribe()).text();
	assert.ok(imageRead);
	const saved = stores.chatStore.getChat(c.id)!;
	assert.equal(saved.messages.filter((m) => m.sharedWriting?.length).length, 1);
	assert.deepEqual((await (await get(c.id)).json()).pending, []);
	assert.ok(projectView(saved.messages)[0]!.parts.some((p) => p.type === "data-shared-writing"));
	assert.equal((await handleChatRequest(request())).status, 400);
	assert.deepEqual(Buffer.from(stores.sharedWritingStore.read(c.id, writing.id)), png);
});

it("question answers and practice submissions retain image references in model and transcript views", async () => {
	const c = chat();
	const { writing } = await (await upload(c.id)).json();
	const refs = resolveSharedWriting(c.id, { type: "text", text: "", writingIds: [writing.id] }, []);
	const question: LhMessage = { ...fauxAssistantMessage([fauxToolCall("ask_user_question", { question: "Explain", mode: "text" }, { id: "question" })], { stopReason: "toolUse" }), id: "assistant" };
	const answer = buildAnswer({ id: "question", kind: "ask", mode: "text", question: "Explain", options: [], createdAt: new Date().toISOString() }, { text: "See my drawing" });
	const appends = inputAppends({ messages: [question] }, parseChatInput({ type: "answer", toolCallId: "question", answer, writingIds: [writing.id] }));
	appends[0]!.sharedWriting = refs;
	const thinking: LhMessage = { ...newThinkingMessage("problem", ""), sharedWriting: refs };
	for (const messages of [[question, ...appends], [thinking]]) {
		assert.ok(JSON.stringify(toLlmMessages(messages)).includes(refs[0]!.path));
		assert.ok(projectView(messages).some((m) => m.parts.some((p) => p.type === "data-shared-writing")));
	}
});
