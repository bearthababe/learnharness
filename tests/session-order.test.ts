import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, it } from "node:test";

/**
 * The sessions list follows the learner (round 13, owner P8): a background
 * delivery — a retried job's result arriving — saves messages but never
 * moves a session; the learner acting there does.
 */
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-session-order-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));
const { chatStore } = await import("../src/store/chats.ts");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("background deliveries keep the order; learner activity moves a session to the top", async () => {
	const older = chatStore.createChat("older session");
	await sleep(5);
	const newer = chatStore.createChat("newer session");
	await sleep(5);
	assert.deepEqual(chatStore.listChats().map((c) => c.id), [newer.id, older.id]);
	chatStore.saveMessages(older.id, [{ role: "custom", customType: "subagent-result", content: "brief", display: true, details: {}, timestamp: Date.now() } as never]);
	assert.deepEqual(chatStore.listChats().map((c) => c.id), [newer.id, older.id], "a delivered result does not reorder");
	await sleep(5);
	chatStore.markLearnerActivity!(older.id);
	assert.deepEqual(chatStore.listChats().map((c) => c.id), [older.id, newer.id], "the learner acting there does");
});

it("an older record without the activity stamp keeps its place when a result arrives", async () => {
	const legacy = chatStore.createChat("legacy session");
	await sleep(5);
	const recent = chatStore.createChat("recent session");
	// Records written before round 13 have no activityAt.
	const file = path.join(TMP_DATA, "chats", `${legacy.id}.json`);
	const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
	delete raw.activityAt;
	fs.writeFileSync(file, JSON.stringify(raw));
	const order = () => chatStore.listChats().map((c) => c.id).filter((id) => id === legacy.id || id === recent.id);
	assert.deepEqual(order(), [recent.id, legacy.id]);
	await sleep(5);
	chatStore.saveMessages(legacy.id, [{ role: "custom", customType: "subagent-result", content: "brief", display: true, details: {}, timestamp: Date.now() } as never]);
	assert.deepEqual(order(), [recent.id, legacy.id], "the delivery does not lift the older session");
});
