import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { HandwritingRecovery } from "../components/handwriting/recovery.ts";
import { handwritingKey, handwritingRecoveryKey } from "../components/handwriting/recovery.ts";
import { handwritingVisibilityKey } from "../components/handwriting/device.ts";
import { normalizeHandwriting } from "../src/core/handwriting.ts";

const data = mkdtempSync(`${process.env.LH_HANDWRITING_TEST_ROOT ?? "/tmp/opencode"}/handwriting-recovery-`);
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

it("Redo survives device and server reopen and a new completed stroke abandons its branch", async () => {
	const chat = stores.chatStore.createChat("Persistent Redo"), storage = device();
	const first = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await first.open(); first.draw(stroke); first.clear(); first.undo(); first.undo(); await first.retry(); first.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open(); reopened.redo(); assert.deepEqual(reopened.page(), [stroke]);
	reopened.redo(); assert.deepEqual(reopened.page(), []);
	reopened.undo(); reopened.draw(stroke); reopened.redo(); assert.deepEqual(reopened.page(), [stroke, stroke]);
	await reopened.retry(); reopened.dispose();
});

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
	assert.equal(Object.keys(normalizeHandwriting(JSON.parse(storage.getItem(handwritingKey(chat.id))!)).events).length, 2);
	assert.match(recovery.getSnapshot().notice!, /Saved on this device/);
	recovery.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open();
	assert.equal(Object.keys(normalizeHandwriting(reopened.getSnapshot().working).events).length, 2);
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

it("an unavailable session cannot be resurrected, and a generic 404 keeps device recovery", async () => {
	const chat = stores.chatStore.createChat("Deleted");
	const storage = device();
	const copy = JSON.stringify({ version: 1, operations: [{ kind: "stroke", id: "pending", stroke }] });
	storage.setItem(handwritingKey(chat.id), copy); storage.setItem(handwritingKey("other"), copy);
	stores.chatStore.deleteChat(chat.id);
	const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await recovery.open(); recovery.draw(stroke); await recovery.retry();
	assert.equal(storage.getItem(handwritingKey(chat.id)), copy);
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

it("an unreadable reconciliation read after GET blocks edits and PUT until device truth can be read", async () => {
	const chat = stores.chatStore.createChat("Unreadable reconciliation");
	const storage = device();
	let denyReads = false, release!: () => void, writes = 0, hold = true;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => ({ ...storage, getItem(key) { if (denyReads) throw new Error("SecurityError during reconciliation"); return storage.getItem(key); } }), fetch: async (url, init) => {
		if (init?.method === "PUT") writes++;
		else if (hold) await new Promise<void>(resolve => { release = resolve; });
		return transport(chat.id)(url, init);
	} });
	const opening = recovery.open();
	const newer = JSON.stringify({ version: 1, operations: [{ id: "undiscovered", kind: "stroke", stroke }] });
	storage.setItem(handwritingKey(chat.id), newer); denyReads = true;
	release(); await opening;
	assert.equal(recovery.getSnapshot().ready, false, "Unreadable device truth is not a writable empty page");
	recovery.draw(stroke); await recovery.retry();
	assert.equal(writes, 0); assert.equal(storage.getItem(handwritingKey(chat.id)), newer);
	denyReads = false; hold = false; await recovery.retry();
	assert.equal(recovery.getSnapshot().ready, true);
	assert.deepEqual(recovery.page(), [stroke]); recovery.dispose();
});

it("an admitted stroke is kept when a blocking ACK and failed recovery write occur before completion", async () => {
	const chat = stores.chatStore.createChat("Admitted completion");
	const storage = device();
	let release!: () => void, first = true, failBackup = true;
	const recovery = new HandwritingRecovery(chat.id, { storage: () => ({ ...storage, setItem(key, value) { if (key === handwritingRecoveryKey(chat.id) && failBackup) throw new Error("Quota exceeded"); storage.setItem(key, value); } }), fetch: async (url, init) => {
		const response = await transport(chat.id)(url, init);
		if (init?.method === "PUT" && first) { first = false; await new Promise<void>(resolve => { release = resolve; }); }
		return response;
	} });
	await recovery.open(); recovery.draw(stroke);
	while (!release) await new Promise(resolve => setTimeout(resolve, 0));
	const complete = recovery.beginStroke(); assert.ok(complete);
	const acknowledged = storage.getItem(handwritingKey(chat.id))!;
	storage.setItem(handwritingKey(chat.id), '{"version":2,"operations":[]}');
	release(); await recovery.retry();
	assert.equal(recovery.getSnapshot().ready, false);
	assert.equal(recovery.beginStroke(), null, "A blocked controller admits no further strokes");
	const second = { ...stroke, points: [{ x: 300, y: 400, pressure: 0.9 }] };
	complete(second); complete(second);
	assert.deepEqual(recovery.page(), [stroke, second], "One accepted completion remains in working, even if it cannot yet be saved");
	assert.match(recovery.getSnapshot().notice!, /Latest working could not be saved/);
	assert.equal(storage.getItem(handwritingKey(chat.id)), '{"version":2,"operations":[]}');
	failBackup = false; storage.setItem(handwritingKey(chat.id), acknowledged);
	await recovery.retry();
	assert.equal(recovery.getSnapshot().ready, true);
	assert.equal(Object.keys(normalizeHandwriting(await (await transport(chat.id)("/handwriting")).json()).events).length, 2);
	recovery.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open(); assert.deepEqual(reopened.page(), [stroke, second]);
	reopened.undo(); await reopened.retry(); assert.deepEqual(reopened.page(), [stroke]); reopened.dispose();
});

it("successful deletion invalidates an acknowledged idle controller and late ACKs without recreating device data", async () => {
	const { deleteChatSession } = await import("../src/server/chats.ts");
	for (const hold of [false, true]) {
		const chat = stores.chatStore.createChat("Delete callback");
		const storage = device(); let release!: () => void;
		const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: async (url, init) => {
			const response = await transport(chat.id)(url, init);
			if (hold && init?.method === "PUT") await new Promise<void>(resolve => { release = resolve; });
			return response;
		} });
		await recovery.open(); recovery.draw(stroke);
		if (hold) { while (!release) await new Promise(resolve => setTimeout(resolve, 0)); }
		else await recovery.retry();
		const complete = recovery.beginStroke(); assert.ok(complete);
		storage.setItem(handwritingVisibilityKey(chat.id), "1");
		storage.setItem(handwritingRecoveryKey(chat.id), storage.getItem(handwritingKey(chat.id))!);
		storage.setItem(handwritingKey("other-session"), "unrelated working");
		assert.equal((await deleteChatSession(chat.id, "preserve-graph")).ok, true);
		recovery.sessionDeleted();
		if (hold) release();
		complete(stroke); await recovery.retry();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepEqual([handwritingKey(chat.id), handwritingRecoveryKey(chat.id), handwritingVisibilityKey(chat.id)].map(key => storage.getItem(key)), [null, null, null]);
		assert.equal(storage.getItem(handwritingKey("other-session")), "unrelated working");
		assert.equal(recovery.getSnapshot().ready, false); recovery.dispose();
	}
});

it("Undo exhaustion after restoring Clear is a no-op across save and reopen", async () => {
	const chat = stores.chatStore.createChat("Undo replay"); const storage = device();
	const recovery = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await recovery.open(); recovery.draw(stroke); recovery.clear(); recovery.undo();
	assert.deepEqual(recovery.page(), [stroke]);
	recovery.undo(); await recovery.retry(); assert.deepEqual(recovery.page(), []);
	const saved = await (await transport(chat.id)("/handwriting")).json();
	recovery.undo(); await recovery.retry(); recovery.dispose();
	const reopened = new HandwritingRecovery(chat.id, { storage: () => storage, fetch: transport(chat.id) });
	await reopened.open(); reopened.undo(); await reopened.retry();
	assert.deepEqual(await (await transport(chat.id)("/handwriting")).json(), saved, "Undo availability follows the same history replay as the page");
	reopened.dispose();
});
