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
