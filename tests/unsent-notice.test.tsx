import assert from "node:assert/strict";
import { it } from "node:test";
import { unsentNoticeText } from "../components/chat.tsx";

it("a not-sent note says 'back in the box' only when the box really holds that message", () => {
	assert.match(unsentNoticeText("failed", "Failed to fetch", true), /Not sent — LearnHarness couldn't be reached\. Your message is back in the box\./);
	// A newer draft is in the box: the failed message is quoted instead, never claimed.
	const quoted = unsentNoticeText("failed", "Failed to fetch", false);
	assert.doesNotMatch(quoted, /back in the box/);
	assert.match(quoted, /^Not sent — LearnHarness couldn't be reached:$/);
	assert.doesNotMatch(unsentNoticeText("restored", null, false), /back in the box/);
	assert.match(unsentNoticeText("restored", null, true), /back in the box/);
});

it("K2 (round 16): one wording live and after a reload", () => {
	assert.equal(unsentNoticeText("restored", null, true), "Not sent. Your message is back in the box.");
	assert.equal(unsentNoticeText("restored", null, false), "Not sent:");
	for (const text of [unsentNoticeText("failed", "Failed to fetch", true), unsentNoticeText("restored", null, true)]) {
		assert.match(text, /^Not sent\b/);
		assert.doesNotMatch(text, /wasn't sent/);
	}
});
