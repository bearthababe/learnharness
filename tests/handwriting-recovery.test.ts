import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { HandwritingRecovery } from "../components/handwriting/recovery.ts";
import { handwritingKey } from "../components/handwriting/recovery.ts";

const data = mkdtempSync("/tmp/opencode/handwriting-recovery-");
process.env.LH_DATA_DIR = data;
const { stores } = await import("../src/server/stores.ts");
const { handwritingResponse } = await import("../src/server/handwriting.ts");
after(() => rmSync(data, { recursive: true, force: true }));
const stroke = { tool: "pen" as const, colour: "#2563eb" as const, penScale: 1 as const, width: 38 as const, points: [{ x: 100, y: 200, pressure: 0.6 }] };
function device() {
	const values = new Map<string, string>();
	return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const transport = (id: string) => (url: string, init?: RequestInit) => handwritingResponse(new Request(`http://test${url}`, init), id);

it("completed ink and Clear recover before held saves arrive, with Undo still editable after remount", async () => {
	const chat = stores.chatStore.createChat("Recover on leave");
	const storage = device();
	let release!: () => void;
	const first = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: async (url, init) => {
		if (init?.method === "PUT") await new Promise<void>(resolve => { release = resolve; });
		return transport(chat.id)(url, init);
	} });
	await first.open();
	first.draw(stroke);
	first.clear();
	first.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open();
	assert.equal(reopened.page().length, 0);
	reopened.undo();
	assert.deepEqual(reopened.page(), [stroke]);
	await reopened.retry();
	release();
	await new Promise(resolve => setTimeout(resolve, 10));
	reopened.dispose();
	const again = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await again.open();
	assert.deepEqual(again.page(), [stroke]);
	again.undo();
	assert.deepEqual(again.page(), [], "Undo after reopen removes the original editable stroke");
	await again.retry(); again.dispose();
});

it("an older ACK cannot clear the newer device journal, and a lost ACK retries once", async () => {
	const chat = stores.chatStore.createChat("Old ACK");
	const storage = device();
	let release!: () => void, requests = 0;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: async (url, init) => {
		const response = await transport(chat.id)(url, init);
		if (init?.method === "PUT") {
			requests++;
			if (requests === 1) await new Promise<void>(resolve => { release = resolve; });
			else throw new Error("Lost acknowledgement after server committed");
		}
		return response;
	} });
	await recovery.open(); recovery.draw(stroke);
	while (!release) await new Promise(resolve => setTimeout(resolve, 0));
	recovery.clear(); release();
	await recovery.retry();
	assert.equal(JSON.parse(storage.getItem(handwritingKey(chat.id))!).operations.length, 2);
	assert.match(recovery.getSnapshot().notice!, /Saved on this device/);
	recovery.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open();
	assert.equal(reopened.getSnapshot().working.operations.length, 2);
	reopened.undo(); await reopened.retry();
	assert.deepEqual(reopened.page(), [stroke]); reopened.dispose();
});

it("honestly distinguishes device-only, neither saved, and server-only recovery, then clears recovered errors", async () => {
	const chat = stores.chatStore.createChat("Failures");
	const storage = device();
	let failLocal = false, failServer = true;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => ({ ...storage, setItem(key, value) { if (failLocal) throw new Error("Quota exceeded"); storage.setItem(key, value); } }), fetch: (url, init) => {
		if (init?.method === "PUT" && failServer) return Promise.reject(new Error("Network failed"));
		return transport(chat.id)(url, init);
	} });
	await recovery.open(); recovery.draw(stroke); await recovery.retry();
	assert.equal(recovery.getSnapshot().notice, "Saved on this device; couldn’t save to LearnHarness");
	failLocal = true; recovery.draw(stroke); await recovery.retry();
	assert.match(recovery.getSnapshot().notice!, /this device or to LearnHarness/);
	failServer = false; await recovery.retry();
	assert.match(recovery.getSnapshot().notice!, /Saved to LearnHarness/);
	failLocal = false; await recovery.retry();
	assert.equal(recovery.getSnapshot().notice, null);
	recovery.dispose();
});

it("a failed read never autosaves blank; corrupt/newer device records and divergence are preserved", async () => {
	const chat = stores.chatStore.createChat("Read protection");
	const storage = device();
	let failRead = true, writes = 0;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: (url, init) => {
		if (init?.method === "PUT") writes++;
		if (failRead) return Promise.resolve(new Response(null, { status: 503 }));
		return transport(chat.id)(url, init);
	} });
	await recovery.open(); recovery.draw(stroke); await recovery.retry();
	assert.equal(writes, 0); assert.equal(recovery.getSnapshot().ready, false);
	failRead = false; await recovery.retry(); recovery.draw(stroke); await recovery.retry(); recovery.dispose();
	for (const invalid of ["bad JSON", '{"version":2,"operations":[]}']) {
		storage.setItem(handwritingKey(chat.id), invalid);
		const broken = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
		await broken.open(); broken.clear(); await broken.retry();
		assert.equal(broken.getSnapshot().ready, false);
		assert.equal(storage.getItem(handwritingKey(chat.id)), invalid); broken.dispose();
	}
	const divergent = JSON.stringify({ version: 1, operations: [{ kind: "stroke", id: "other-device", stroke }] });
	storage.setItem(handwritingKey(chat.id), divergent);
	const conflict = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await conflict.open(); conflict.clear(); await conflict.retry();
	assert.equal(conflict.getSnapshot().ready, false); assert.match(conflict.getSnapshot().notice!, /histories differ/);
	assert.equal(storage.getItem(handwritingKey(chat.id)), divergent); conflict.dispose();
});

it("deleted sessions cannot be resurrected by device recovery; another session's copy remains", async () => {
	const chat = stores.chatStore.createChat("Deleted");
	const storage = device();
	const copy = JSON.stringify({ version: 1, operations: [{ kind: "stroke", id: "pending", stroke }] });
	storage.setItem(handwritingKey(chat.id), copy); storage.setItem(handwritingKey("other"), copy);
	stores.chatStore.deleteChat(chat.id);
	const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await recovery.open(); recovery.draw(stroke); await recovery.retry();
	assert.equal(storage.getItem(handwritingKey(chat.id)), null);
	assert.equal(storage.getItem(handwritingKey("other")), copy);
	assert.equal(recovery.getSnapshot().ready, false); recovery.dispose();
});

it("a denied device read never treats undiscovered pending work as a blank journal", async () => {
	const chat = stores.chatStore.createChat("Device read unavailable");
	const storage = device();
	const copy = JSON.stringify({ version: 1, operations: [{ id: "local-pending", kind: "stroke", stroke }] });
	storage.setItem(handwritingKey(chat.id), copy);
	let denied = true;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => ({ ...storage, getItem(key) { if (denied) throw new Error("SecurityError"); return storage.getItem(key); } }), fetch: transport(chat.id) });
	await recovery.open();
	assert.equal(storage.getItem(handwritingKey(chat.id)), copy, "A failed read never authorizes replacing the device record");
	assert.equal(recovery.getSnapshot().ready, false);
	denied = false; await recovery.retry();
	assert.deepEqual(recovery.page(), [stroke]); recovery.dispose();
});

it("a delayed load cannot overwrite a newer or unreadable device record", async () => {
	for (const replacement of ['{"version":2,"operations":[]}', JSON.stringify({ version: 1, operations: [{ id: "newer-device-work", kind: "stroke", stroke }] })]) {
		const chat = stores.chatStore.createChat("Delayed load");
		const storage = device();
		let release!: () => void;
		const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: async (url, init) => {
			await new Promise<void>(resolve => { release = resolve; });
			return transport(chat.id)(url, init);
		} });
		const opening = recovery.open();
		storage.setItem(handwritingKey(chat.id), replacement); release(); await opening;
		assert.equal(storage.getItem(handwritingKey(chat.id)), replacement);
		assert.equal(recovery.getSnapshot().ready, false);
		recovery.dispose();
	}
});
