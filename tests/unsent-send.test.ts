// A failed send never loses the learner's text and is never offered twice
// (whole-app redesign, round 10).
import assert from "node:assert/strict";
import { it } from "node:test";
import { confirmedUserCount, lastUserText, plainSendError, recordKept, withoutUnconfirmedSend } from "../components/unsent-send.ts";

const user = (id: string, content: string) => ({ id, role: "user", content, timestamp: 1 }) as never;
const assistant = (id: string) => ({ id, role: "assistant", content: [{ type: "text", text: "ok" }], timestamp: 1 }) as never;

it("finds the latest learner message and whether the record kept a send", () => {
	const record = [user("m1", "first"), assistant("a1"), user("m2", "This answer must survive a failed send.")];
	assert.equal(lastUserText(record), "This answer must survive a failed send.");
	assert.equal(recordKept(record, { text: "This answer must survive a failed send.  ", before: 1 }), true);
	assert.equal(recordKept(record.slice(0, 2), { text: "This answer must survive a failed send.", before: 1 }), false);
	// An earlier identical message is not this send: the count must grow.
	assert.equal(recordKept(record, { text: "This answer must survive a failed send.", before: 2 }), false);
	assert.equal(confirmedUserCount([...record, user("c_x_1", "local")]), 2);
	assert.equal(lastUserText([assistant("a1")]), null);
});

it("drops only this send's unconfirmed bubble", () => {
	const local = [user("m1", "first"), assistant("a1"), user("c_abc_1", "unsent words")];
	assert.equal(withoutUnconfirmedSend(local, "unsent words").length, 2);
	// A server-stamped message, or different text, is never removed.
	assert.equal(withoutUnconfirmedSend([user("m1", "unsent words")], "unsent words").length, 1);
	assert.equal(withoutUnconfirmedSend(local, "other words").length, 3);
});

it("says a network failure in plain words and keeps other messages", () => {
	assert.equal(plainSendError("Failed to fetch"), "Couldn't reach the server. Check your connection, then try again.");
	assert.equal(plainSendError("TypeError: NetworkError when attempting to fetch resource."), "Couldn't reach the server. Check your connection, then try again.");
	assert.equal(plainSendError("A turn is already running — try again in a moment."), "A turn is already running — try again in a moment.");
	assert.equal(plainSendError('401: {"message":"Missing Authentication header","code":401}'), "The model provider refused the request (401: Missing Authentication header).");
});
