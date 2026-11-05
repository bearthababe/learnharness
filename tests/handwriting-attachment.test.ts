import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, it } from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { appendHandwriting, notebookSource, emptyHandwriting, canonicalHandwriting, importHandwritingBackground } from "../src/core/handwriting.ts";

const data = mkdtempSync(join(tmpdir(), "46-attachment-test-"));
process.env.LH_DATA_DIR = data;
const { stores } = await import("../src/server/stores.ts");
const { sharedWritingResponse, sharedWritingSourceResponse, resolveSharedWriting } = await import("../src/server/shared-writing.ts");
after(() => rmSync(data, { recursive: true, force: true }));
const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800"><rect width="1400" height="1800" fill="white"/></svg>').render().asPng();
const source = notebookSource(emptyHandwriting());
const revised = notebookSource(appendHandwriting(source.journal, { id: "ink", kind: "stroke", stroke: { tool: "pen", colour: "#2563eb", penScale: 1, width: 38, points: [{ x: 100, y: 200, pressure: 0.6 }] } }));
function capture(chatId: string, writingId: string, expectedPageRevision: number, value = source, image: Uint8Array = png) {
	const form = new FormData();
	form.set("writingId", writingId); form.set("pageId", value.journal.pageId); form.set("expectedPageRevision", String(expectedPageRevision));
	form.set("source", new Blob([canonicalHandwriting(value)], { type: "application/json" }), "source.json");
	form.set("image", new Blob([new Uint8Array(image)], { type: "image/png" }), "image.png");
	return sharedWritingResponse(new Request("http://test/writing", { method: "POST", body: form }), chatId);
}
const identity = () => `writing_${crypto.randomUUID()}`;
it("import and multipart publication reject the same wrong-sized or truncated full-page PNGs", async () => {
	const chat = stores.chatStore.createChat("PNG boundary parity");
	const wrongSize = Buffer.from(png); wrongSize.writeUInt32BE(800, 16);
	for (const bytes of [png.subarray(0, 24), wrongSize]) {
		await assert.rejects(importHandwritingBackground(emptyHandwriting(), { mediaType: "image/png", width: 1400, height: 1800, data: bytes.toString("base64") }, "import"), /Invalid background PNG/);
		assert.equal((await capture(chat.id, identity(), 0, source, bytes)).status, 415);
	}
	assert.deepEqual(stores.sharedWritingStore.list(chat.id), []);
});
it("same-page Attach replaces only its pending head; exact old retries never promote it and its source stays readable", async () => {
	const chat = stores.chatStore.createChat("Immutable capture"), a = identity(), b = identity(), c = identity();
	assert.equal((await capture(chat.id, a, 0)).status, 201);
	assert.equal((await capture(chat.id, b, 1, revised)).status, 201);
	const other = { ...source, journal: { ...source.journal, pageId: `page_${crypto.randomUUID()}` } };
	assert.equal((await capture(chat.id, c, 0, other)).status, 201);
	const retry = await capture(chat.id, a, 0);
	assert.equal(retry.status, 200); assert.equal((await retry.json()).pending, false);
	const pending = await (await sharedWritingResponse(new Request("http://test/writing"), chat.id)).json();
	assert.deepEqual(new Set(pending.pending.map((item: { id: string }) => item.id)), new Set([b, c]));
	assert.equal(pending.pageAttachments.page_initial.revision, 2);
	assert.throws(() => resolveSharedWriting(chat.id, { type: "text", text: "", writingIds: [a] }, []), /missing|superseded/);
	assert.deepEqual(await (await sharedWritingSourceResponse(chat.id, a)).json(), source);
	assert.equal((await capture(chat.id, identity(), 0, revised)).status, 409);
	assert.equal((await capture(chat.id, a, 0, revised)).status, 409);
});

it("unpublished complete bundles are inert and exact retry finishes publication; corrupt promised source is unavailable", async () => {
	const chat = stores.chatStore.createChat("Crash boundary"), a = identity(), b = identity();
	await capture(chat.id, a, 0);
	const index = `${data}/shared-writing/${chat.id}/pending.json`, before = readFileSync(index);
	await capture(chat.id, b, 1, revised);
	// Simulate the crash window after immutable bundle rename but before index publication.
	writeFileSync(index, before);
	assert.deepEqual((await (await sharedWritingResponse(new Request("http://test/writing"), chat.id)).json()).pending.map((image: { id: string }) => image.id), [a]);
	assert.equal(sharedWritingSourceResponse(chat.id, b).status, 404);
	assert.equal((await capture(chat.id, b, 1, revised)).status, 201);
	assert.equal((await capture(chat.id, b, 1, revised)).status, 200);
	writeFileSync(`${data}/shared-writing/${chat.id}/${b}/source.json`, "{broken");
	assert.equal(sharedWritingSourceResponse(chat.id, b).status, 503);
	assert.equal((await capture(chat.id, b, 1, revised)).status, 503);
});

it("storage failure leaves the old pending head, and missing indexes never erase existing notebook evidence", async () => {
	const chat = stores.chatStore.createChat("Publication failure"), a = identity(), b = identity();
	await capture(chat.id, a, 0);
	const directory = `${data}/shared-writing/${chat.id}`;
	chmodSync(directory, 0o500);
	try {
		assert.equal((await capture(chat.id, b, 1, revised)).status, 503);
		assert.deepEqual((await (await sharedWritingResponse(new Request("http://test/writing"), chat.id)).json()).pending.map((image: { id: string }) => image.id), [a]);
	} finally { chmodSync(directory, 0o700); }
	rmSync(`${directory}/pending.json`);
	assert.equal((await capture(chat.id, b, 0, revised)).status, 503);
	assert.equal((await sharedWritingResponse(new Request("http://test/writing"), chat.id)).status, 503);
});

it("an accepted image submission receipt survives lost ACK and supersession without another input or tutor turn", async () => {
	const { createFauxCore, fauxAssistantMessage, fauxText } = await import("@earendil-works/pi-ai");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	const { toLlmMessages } = await import("../src/core/native-messages.ts");
	process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
	const chat = stores.chatStore.createChat("Receipt"), writingId = identity();
	stores.chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	await capture(chat.id, writingId, 0);
	const input = { type: "text", text: "Exact explanation", writingIds: [writingId], submissionId: `submission_${crypto.randomUUID()}` };
	const request = (value = input) => new Request("http://test/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: value }) });
	const faux = createFauxCore({}); faux.setResponses([fauxAssistantMessage([fauxText("Received")])]);
	assert.equal((await handleChatRequest(request(), opts => createTeacherAgent(undefined, { messages: opts.messages, engine: { model: faux.getModel(), streamFn: faux.streamSimple }, tools: {} }))).status, 200);
	const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	await capture(chat.id, identity(), 1, revised);
	const before = stores.chatStore.getChat(chat.id)!.messages;
	assert.equal((await handleChatRequest(request(), () => { throw new Error("Receipt replay must not build a tutor"); })).status, 200);
	assert.deepEqual(stores.chatStore.getChat(chat.id)!.messages, before);
	assert.equal(before.filter(message => message.writingSubmission?.id === input.submissionId).length, 1);
	assert.ok(!JSON.stringify(toLlmMessages(before)).includes(input.submissionId));
	assert.equal((await handleChatRequest(request({ ...input, text: "Changed" }))).status, 422);
});

it("parallel-question write-ahead records the receipt and racing exact requests cannot append twice", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await import("@earendil-works/pi-ai");
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const chat = stores.chatStore.createChat("Parallel receipt"), writingId = identity();
	stores.chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const question = { question: "Which topic?", options: [{ label: "History" }, { label: "Chemistry" }] };
	stores.chatStore.saveMessages(chat.id, [{ ...fauxAssistantMessage([fauxToolCall("ask_user_question", question, { id: "first" }), fauxToolCall("ask_user_question", question, { id: "second" })]), id: "batch" }]);
	await capture(chat.id, writingId, 0);
	const input = { type: "answer", toolCallId: "first", answer: { kind: "ask", questionText: question.question, dontKnow: false, answers: [], text: "History", answeredAt: new Date().toISOString() }, writingIds: [writingId], submissionId: `submission_${crypto.randomUUID()}` };
	const send = () => handleChatRequest(new Request("http://test/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input }) }), () => { throw new Error("Sibling still dangling: no tutor turn"); });
	const replies = await Promise.all([send(), send()]);
	assert.deepEqual(replies.map(response => response.status), [200, 200]);
	assert.equal(stores.chatStore.getChat(chat.id)!.messages.filter(message => message.writingSubmission?.id === input.submissionId).length, 1);
});

it("normal session deletion removes bundles and an upload released after deletion cannot recreate them", async () => {
	const { deleteChatSession } = await import("../src/server/chats.ts");
	const chat = stores.chatStore.createChat("Delete bundles"), writingId = identity();
	await capture(chat.id, writingId, 0);
	let release!: () => void;
	const body = new ReadableStream({ start(controller) { release = () => { controller.enqueue(png); controller.close(); }; } });
	const late = sharedWritingResponse(new Request("http://test/writing", { method: "POST", body, duplex: "half" } as RequestInit), chat.id);
	assert.equal((await deleteChatSession(chat.id, "preserve-graph")).ok, true);
	release(); assert.equal((await late).status, 404);
	assert.equal(existsSync(`${data}/shared-writing/${chat.id}`), false);
	assert.equal(sharedWritingSourceResponse(chat.id, writingId).status, 404);
});

it("multipart bounds cancel the stream before parsing and cannot publish partial bundles", async () => {
	const chat = stores.chatStore.createChat("Bounded capture");
	let cancelled = false;
	const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024)); }, cancel() { cancelled = true; } });
	const response = await sharedWritingResponse(new Request("http://test/writing", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" } as RequestInit), chat.id);
	assert.equal(response.status, 413); assert.equal(cancelled, true);
	assert.equal(stores.sharedWritingStore.list(chat.id).length, 0);
});
