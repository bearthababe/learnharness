import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import { deliveredIn, friendlyNetworkError, listUnsent, putUnsent, removeUnsent } from "../components/unsent-message.ts";
import { newUserMessage } from "../src/core/native-messages.ts";

it("a send that is never acknowledged leaves no 'sent' bubble behind once its text goes back to the composer", async () => {
	const model = new SessionModel({ chatId: "chat_unsent", initialMessages: [], fetch: async () => { throw new TypeError("Failed to fetch"); } });
	const accepted = await model.send({ type: "text", text: "Why does a sharp knife cut better?" });
	assert.equal(accepted, false, "a network failure is never reported as accepted");
	assert.ok(model.getState().nativeMessages.some((m) => m.role === "user"), "the optimistic bubble is still there until the page takes it back");
	assert.equal(model.discardUnsentText("Why does a sharp knife cut better?"), true);
	assert.equal(model.getState().nativeMessages.some((m) => m.role === "user"), false);
	assert.equal(model.discardUnsentText("Why does a sharp knife cut better?"), false, "only local, unconfirmed bubbles are ever removed");
});

it("a canonical record message is never discarded", () => {
	const record = [{ ...newUserMessage("Kept"), id: "msg_server" }];
	const model = new SessionModel({ chatId: "chat_kept", initialMessages: record });
	assert.equal(model.discardUnsentText("Kept"), false);
	assert.equal(model.getState().nativeMessages.length, 1);
});

it("a lost acknowledgement that did land is recognised in the record; older same-text messages are not", () => {
	const at = Date.now();
	const later = { ...newUserMessage("Same words"), timestamp: at + 1000 };
	const earlier = { ...newUserMessage("Same words"), timestamp: at - 10 * 60_000 };
	assert.equal(deliveredIn([later], { text: "Same words", at }), true);
	assert.equal(deliveredIn([earlier], { text: "Same words", at }), false);
	assert.equal(deliveredIn([later], { text: "Other words", at }), false);
	assert.equal(deliveredIn([{ ...later, id: "c_local_1" }], { text: "Same words", at }), false, "the page's own optimistic bubble is not delivery");
});

it("network failures read in plain words", () => {
	assert.match(friendlyNetworkError("Failed to fetch") ?? "", /couldn't be reached/);
	assert.match(friendlyNetworkError("NetworkError when attempting to fetch resource.") ?? "", /couldn't be reached/);
	assert.equal(friendlyNetworkError("A turn is already running — try again in a moment."), null);
});

it("each unsent message keeps its own copy: a newer draft never replaces an older failed one", () => {
	const store = new Map<string, string>();
	const previous = (globalThis as { localStorage?: unknown }).localStorage;
	(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
	try {
		putUnsent("chat_race", { id: "a", text: "Draft A", at: 1 });
		putUnsent("chat_race", { id: "b", text: "Draft B", at: 2 });
		assert.deepEqual(listUnsent("chat_race").map((entry) => entry.text), ["Draft A", "Draft B"]);
		removeUnsent("chat_race", "b"); // B was acknowledged
		assert.deepEqual(listUnsent("chat_race").map((entry) => entry.text), ["Draft A"], "A survives B's success");
		removeUnsent("chat_race", "a");
		assert.equal(store.has("lh:unsent:chat_race"), false);
		// A copy written by the previous build (one object) still reads.
		store.set("lh:unsent:chat_old", JSON.stringify({ text: "Old draft", at: 3 }));
		assert.deepEqual(listUnsent("chat_old").map((entry) => entry.text), ["Old draft"]);
	} finally {
		(globalThis as { localStorage?: unknown }).localStorage = previous;
	}
});
