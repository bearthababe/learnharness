import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";

/**
 * The notebook instruction's device copy (round 13, D1): words typed just
 * before a reload come back, and a copy never overwrites words saved from
 * elsewhere.
 */
const dir = fs.mkdtempSync(join(tmpdir(), "notebook-instruction-copy-"));
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function setup(title: string) {
	const chat = chatStore.createChat(title); const faux = createFauxCore({});
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const data = new Map<string, string>();
	const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
	const handle = (init?: RequestInit) => service.handle(new Request("http://test/notebook", init), chat.id);
	return { chat, service, data, storage, handle };
}
const until = async (ok: () => boolean) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 10)); };

/** A page whose later saves reach the server but whose answers never come back (it reloads). */
async function typeThenReload(env: ReturnType<typeof setup>) {
	let cut = false;
	const page = createNotebookSession(env.chat.id, async (_url, init) => {
		const response = await env.handle(init);
		if (cut) return new Promise<Response>(() => {}); // the page is gone before the answer
		return response;
	}, env.storage);
	await page.refresh();
	await page.dispatch({ type: "draft", text: "Sol" });
	cut = true;
	void page.dispatch({ type: "draft", text: "Solve" }).catch(() => {});
	void page.dispatch({ type: "draft", text: "Solve for A" }).catch(() => {});
	await until(() => env.service.view(env.chat.id).draft.text === "Solve");
	page.dispose();
}

test("instruction words typed just before a reload come back, even past this device's own unanswered save", async () => {
	const env = setup("Instruction copy");
	await typeThenReload(env);
	assert.equal(env.service.view(env.chat.id).draft.text, "Solve", "the server holds this device's last save, not the newest words");
	const reloaded = createNotebookSession(env.chat.id, async (_url, init) => env.handle(init), env.storage);
	await reloaded.refresh();
	await until(() => env.service.view(env.chat.id).draft.text === "Solve for A");
	assert.equal(env.service.view(env.chat.id).draft.text, "Solve for A");
	assert.equal(reloaded.getSnapshot().draftText, "Solve for A");
	await until(() => !env.data.has(`lh:notebook-instruction:${env.chat.id}`));
	assert.ok(!env.data.has(`lh:notebook-instruction:${env.chat.id}`), "once saved, the device copy is gone");
	reloaded.dispose();
});

test("an instruction saved from elsewhere is never overwritten by this device's copy", async () => {
	const env = setup("Instruction elsewhere");
	await typeThenReload(env);
	const now = env.service.view(env.chat.id);
	env.service.dispatch(env.chat.id, { type: "draft", expectedRevision: now.draft.revision, text: "Written on the laptop" });
	const reloaded = createNotebookSession(env.chat.id, async (_url, init) => env.handle(init), env.storage);
	await reloaded.refresh();
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(env.service.view(env.chat.id).draft.text, "Written on the laptop");
	assert.equal(reloaded.getSnapshot().draftText, "Written on the laptop");
	assert.ok(!env.data.has(`lh:notebook-instruction:${env.chat.id}`), "the stale copy is dropped");
	reloaded.dispose();
});
