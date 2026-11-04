import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync } from "node:fs";

const data = mkdtempSync("/tmp/opencode/handwriting-test-");
process.env.LH_DATA_DIR = data;
const { stores } = await import("../src/server/stores.ts");
const { handwritingResponse } = await import("../src/server/handwriting.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const { subscribe } = await import("../src/core/events.ts");
after(() => rmSync(data, { recursive: true, force: true }));
const stroke = { tool: "pen", colour: "#2563eb", penScale: 1, width: 38, points: [{ x: 100, y: 200, pressure: 0.6 }, { x: 200, y: 250, pressure: 0.8 }] };
const working = { version: 1, operations: [{ id: "stroke-one", kind: "stroke", stroke }, { id: "clear-one", kind: "clear" }] };
const read = (id: string) => handwritingResponse(new Request("http://test/handwriting"), id);
const save = (id: string, body: unknown) => handwritingResponse(new Request("http://test/handwriting", { method: "PUT", body: JSON.stringify(body) }), id);

it("reopens editable strokes and undoable Clear without changing the session or pending writing", async () => {
	const chat = stores.chatStore.createChat("Continuing handwriting");
	const pending = stores.sharedWritingStore.put(chat.id, new Uint8Array([1, 2, 3]));
	const events: string[] = [];
	const off = subscribe(event => events.push(event.type));
	assert.deepEqual(await (await read(chat.id)).json(), { version: 1, operations: [] });
	assert.equal((await save(chat.id, working)).status, 200);
	assert.deepEqual(await (await read(chat.id)).json(), working);
	assert.deepEqual(stores.chatStore.getChat(chat.id), chat);
	assert.deepEqual(stores.sharedWritingStore.list(chat.id), [pending]);
	assert.ok(!JSON.stringify(stores.chatStore.listChats()).includes("stroke-one"));
	off(); assert.deepEqual(events, [], "No sidebar, attachment or tutor events on autosave");
});

it("late saves and lost-ACK retries cannot replace newer work; divergent histories refuse overwrite", async () => {
	const chat = stores.chatStore.createChat("Ordered saves");
	const first = { version: 1, operations: working.operations.slice(0, 1) };
	assert.equal((await save(chat.id, first)).status, 200);
	assert.equal((await save(chat.id, working)).status, 200);
	assert.deepEqual(await (await save(chat.id, first)).json(), working, "A late older save acknowledges current truth without regressing it");
	assert.deepEqual(await (await save(chat.id, working)).json(), working, "Retry has the same identity and applies once");
	assert.equal((await save(chat.id, { version: 1, operations: [{ ...working.operations[0], id: "other-history" }] })).status, 409);
	assert.equal((await save(chat.id, { version: 1, operations: [{ ...working.operations[0], stroke: { ...stroke, colour: "#dc2626" } }] })).status, 409, "Reusing an identity with different ink is a conflict");
	assert.deepEqual(await (await read(chat.id)).json(), working);
});

it("deletion cleans owned handwriting and refuses a request whose body finishes afterward", async () => {
	for (const mode of ["preserve-graph", "delete-nodes"] as const) {
		const chat = stores.chatStore.createChat("Delete handwriting");
		const other = stores.chatStore.createChat("Keep handwriting");
		await save(chat.id, working); await save(other.id, working);
		let release!: () => void;
		const body = new ReadableStream({ start(controller) { release = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(working))); controller.close(); }; } });
		const pending = handwritingResponse(new Request("http://test/handwriting", { method: "PUT", body, duplex: "half" } as RequestInit), chat.id);
		assert.equal((await deleteChatSession(chat.id, mode)).ok, true);
		assert.equal(existsSync(`${data}/handwriting/${chat.id}.json`), false);
		release();
		assert.equal((await pending).status, 404);
		assert.equal((await save(chat.id, working)).status, 404);
		assert.deepEqual(await (await read(other.id)).json(), working);
	}
});

it("corrupt/future records and invalid payloads stay untouched; unrelated chat updates preserve ink", async () => {
	const chat = stores.chatStore.createChat("Guarded working", "practice", "drill");
	await save(chat.id, working);
	stores.chatStore.renameChat(chat.id, "Renamed");
	stores.chatStore.saveSettings(chat.id, {});
	stores.chatStore.saveMessages(chat.id, []);
	stores.chatStore.saveTree(chat.id, { nodes: [], edges: [], version: 1 });
	stores.chatStore.appendTurnUsage(chat.id, { id: "usage", messageId: "message", at: "2026-11-04T00:00:00.000Z", model: "test", steps: [] });
	assert.deepEqual(await (await read(chat.id)).json(), working);
	assert.equal(stores.chatStore.getChat(chat.id)!.practiceMode, "drill");
	for (const invalid of [{ ...working, version: 2 }, { version: 1, operations: [working.operations[0], working.operations[0]] }, { version: 1, operations: [{ ...working.operations[0], stroke: { ...stroke, points: [{ x: -1, y: 0, pressure: 2 }] } }] }]) {
		assert.equal((await save(chat.id, invalid)).status, 400);
	}
	assert.equal((await save("../escape", working)).status, 404);
	const file = `${data}/handwriting/${chat.id}.json`;
	for (const bytes of ["{broken", JSON.stringify({ ...working, version: 2 })]) {
		writeFileSync(file, bytes);
		assert.equal((await read(chat.id)).status, 503);
		assert.equal((await save(chat.id, working)).status, 503);
		assert.equal(readFileSync(file, "utf8"), bytes);
	}
});

it("a filesystem write failure retains the complete last acknowledged editable record", async () => {
	const chat = stores.chatStore.createChat("Atomic save");
	await save(chat.id, working);
	chmodSync(`${data}/handwriting`, 0o500);
	try {
		const next = { ...working, operations: [...working.operations, { id: "undo-after-clear", kind: "undo" }] };
		assert.equal((await save(chat.id, next)).status, 503);
		assert.deepEqual(await (await read(chat.id)).json(), working);
		assert.ok(readdirSync(`${data}/handwriting`).every(file => !file.endsWith(".tmp")));
	} finally { chmodSync(`${data}/handwriting`, 0o700); }
});
