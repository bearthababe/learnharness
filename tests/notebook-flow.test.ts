import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { NotebookCommand, NotebookView } from "../src/core/contracts/notebook.ts";

const dir = fs.mkdtempSync(path.join(tmpdir(), "notebook-flow-"));
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = path.join(dir, "auth.json");
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { GET: getSession } = await import("../app/api/chats/[id]/route.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });

test("typed Apply is durable before dispatch, survives detach, reopens once and undoes without touching Tutor", async () => {
	const chat = chatStore.createChat("Pressure", "practice", "drill");
	const message = newUserMessage("My own reasoning");
	chatStore.saveMessages(chat.id, [message]);
	const before = chatStore.getChat(chat.id)!;
	const faux = createFauxCore({});
	let calls = 0;
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	faux.setResponses([async () => {
		calls++;
		await held;
		return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"2+2=5; p="}]}');
	}]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	async function command(command: NotebookCommand) {
		return service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(command) }), chat.id);
	}
	async function view(): Promise<NotebookView> { return (await service.handle(new Request("http://test/notebook"), chat.id)).json(); }
	assert.equal((await view()).visible, false);
	assert.equal(chatStore.getChat(chat.id)?.notebook, undefined, "reads do not create data");
	await command({ type: "visibility", visible: true });
	await command({ type: "draft", expectedRevision: 0, text: "Write 2+2=5; p=" });
	const initial = await view();
	const apply: NotebookCommand = { type: "apply", id: "edit-1", contextId: initial.contextId!, draftRevision: initial.draft.revision, instruction: initial.draft.text };
	assert.equal((await command(apply)).status, 202);
	assert.equal((await view()).pending?.id, "edit-1");
	const deletion = await deleteChatSession(chat.id, "preserve-graph");
	assert.equal(deletion.ok, false, "accepted notebook work blocks session deletion");
	if (!deletion.ok) assert.equal(deletion.status, 409);
	assert.equal((await command(apply)).status, 202, "redelivery acknowledges the same operation");
	await command({ type: "draft", expectedRevision: (await view()).draft.revision, text: "Later unsent words" });
	chatStore.saveSettings(chat.id, { thinkingLevel: "high" });
	release();
	await service.settled(chat.id);
	const reopened = await view();
	assert.deepEqual(reopened.lines, [{ id: "L1", latex: "2+2=5; p=" }]);
	assert.equal(reopened.canUndo, true);
	assert.equal(reopened.visible, true);
	assert.equal(reopened.draft.text, "Later unsent words");
	await command(apply);
	await service.settled(chat.id);
	assert.equal(calls, 1);
	assert.equal(reopened.usage.calls, 1);
	const publicRecord = await (await getSession(new Request("http://test/chat"), { params: Promise.resolve({ id: chat.id }) })).json();
	assert.equal(publicRecord.notebook, undefined, "dedicated notebook GET is the public notebook projection");
	assert.equal((chatStore.listChats().find((c) => c.id === chat.id) as unknown as Record<string, unknown>).notebook, undefined);
	assert.deepEqual(chatStore.getChat(chat.id)?.messages, [message]);
	assert.equal(chatStore.getChat(chat.id)?.practiceMode, "drill");
	assert.equal(chatStore.getChat(chat.id)?.settings?.thinkingLevel, "high");
	assert.equal(chatStore.getChat(chat.id)?.updatedAt, before.updatedAt);
	assert.equal(chatStore.getChat(chat.id)?.turns, undefined);
	await command({ type: "undo", id: "undo-1", contextId: reopened.contextId! });
	await service.settled(chat.id);
	assert.deepEqual((await view()).lines, []);
	assert.equal((await view()).canUndo, false);
	assert.equal(calls, 1);
});

test("clarification and rejected output retain working, ordered correction context and separate usage", async () => {
	const chat = chatStore.createChat("Clarify");
	const faux = createFauxCore({});
	const prompts: string[] = [];
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
		() => fauxAssistantMessage('{"action":"question","question":"Which denominator?"}'),
		(context) => { prompts.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); },
		() => fauxAssistantMessage("malformed"),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"missing","latex":"bad"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "chatgpt:gpt-5.4" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	async function apply(text: string) {
		const view = service.view(chat.id);
		service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text });
		const saved = service.view(chat.id);
		service.dispatch(chat.id, { type: "apply", id: crypto.randomUUID(), contextId: saved.contextId!, draftRevision: saved.draft.revision, instruction: text });
		await service.settled(chat.id);
		return service.view(chat.id);
	}
	await apply("Write p=");
	const question = await apply("Double the denominator");
	assert.equal(question.problem?.message, "Which denominator?");
	assert.equal(question.draft.text, "Double the denominator");
	assert.deepEqual(question.lines, [{ id: "L1", latex: "p=" }]);
	const corrected = await apply("Use F/A, with twice A");
	assert.deepEqual(corrected.lines, [{ id: "L1", latex: "p=F/(2A)" }]);
	assert.match(prompts[0]!, /Which denominator/);
	assert.match(prompts[0]!, /Double the denominator/);
	const failed = await apply("Replace something");
	assert.equal(failed.problem?.status, "failed");
	assert.equal(failed.draft.text, "Replace something");
	assert.deepEqual(failed.lines, corrected.lines);
	assert.equal(failed.usage.calls, 5);
	assert.equal(failed.usage.subscriptionCalls, 5);
	assert.equal(failed.usage.apiSubtotal, 0);
	assert.ok(failed.usage.tokens > 0);
	assert.equal((await deleteChatSession(chat.id, "preserve-graph")).ok, true, "paused failure does not block deletion");
	assert.equal(chatStore.getChat(chat.id), null);
});

for (const phase of ["accepted", "running", "result-ready", "applied"] as const) {
	test(`a fresh process recovers ${phase} honestly without duplicate application`, async () => {
		const chat = chatStore.createChat(`Recover ${phase}`);
		const setup = createNotebookService({ chatStore, engine: async () => { throw new Error("No model during setup"); } });
		setup.dispatch(chat.id, { type: "visibility", visible: true });
		setup.dispatch(chat.id, { type: "draft", expectedRevision: 0, text: "Write p=" });
		await setup.settled(chat.id);
		const child = spawnSync(process.execPath, ["--import", "tsx", "tests/helpers/notebook-crash-worker.ts", chat.id, phase], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
		assert.equal(child.status, 0, child.stderr);
		const faux = createFauxCore({});
		let calls = 0;
		faux.setResponses([() => { calls++; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
		const recovered = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
		recovered.initialize();
		await recovered.settled(chat.id);
		const view = recovered.view(chat.id);
		if (phase === "running") {
			assert.deepEqual(view.lines, []);
			assert.equal(view.problem?.status, "unknown");
			assert.equal(view.draft.text, "Write p=");
			assert.equal(calls, 0);
			assert.equal(view.usage.unknownCalls, 1);
			recovered.dispatch(chat.id, { type: "apply", id: "explicit-retry", contextId: view.contextId!, draftRevision: view.draft.revision, instruction: view.draft.text });
			await recovered.settled(chat.id);
			assert.deepEqual(recovered.view(chat.id).lines, [{ id: "L1", latex: "p=" }]);
			assert.equal(recovered.view(chat.id).usage.unknownCalls, 1, "retry cannot erase the interrupted call's unknown usage");
		} else {
			assert.deepEqual(view.lines, [{ id: "L1", latex: "p=" }]);
			assert.equal(view.canUndo, true);
			assert.equal(calls, phase === "accepted" ? 1 : 0);
			assert.equal(view.usage.calls, 1);
			recovered.initialize();
			await recovered.settled(chat.id);
			assert.equal(recovered.view(chat.id).workingRevision, 1);
		}
	});
}

test("failed atomic replacement and stale notebook writes preserve the last saved session", async () => {
	const chat = chatStore.createChat("Atomic recovery");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No dispatch for a draft"); } });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	service.dispatch(chat.id, { type: "draft", expectedRevision: 0, text: "Original draft" });
	await service.settled(chat.id);
	const stale = chatStore.getChat(chat.id)!.notebook!;
	service.dispatch(chat.id, { type: "draft", expectedRevision: 1, text: "New saved draft" });
	await service.settled(chat.id);
	assert.throws(() => chatStore.saveNotebook(chat.id, stale.revision, stale), /revision conflict/);
	const rename = fs.renameSync;
	fs.renameSync = () => { throw new Error("Disk unavailable at rename"); }; syncBuiltinESMExports();
	try {
		assert.throws(() => service.dispatch(chat.id, { type: "draft", expectedRevision: 2, text: "Cannot save" }), /Disk unavailable/);
	} finally { fs.renameSync = rename; syncBuiltinESMExports(); }
	assert.equal(service.view(chat.id).draft.text, "New saved draft");
	assert.equal(service.view(chat.id).visible, true);
	assert.equal(fs.readdirSync(path.join(dir, "chats")).some((file) => file.endsWith(".tmp")), false);
});

test("Undo waits for an accepted edit and pauses until its clarification is corrected", async () => {
	const chat = chatStore.createChat("Ordered Undo");
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"question","question":"Which symbol?"}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x=1"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	service.dispatch(chat.id, { type: "draft", expectedRevision: 0, text: "Write the symbol equals one" });
	let view = service.view(chat.id);
	service.dispatch(chat.id, { type: "apply", id: "ambiguous", contextId: view.contextId!, draftRevision: view.draft.revision, instruction: view.draft.text });
	service.dispatch(chat.id, { type: "undo", id: "waiting-undo", contextId: view.contextId! });
	await service.settled(chat.id);
	view = service.view(chat.id);
	assert.equal(view.pending?.kind, "undo"); assert.equal(view.problem?.message, "Which symbol?");
	service.dispatch(chat.id, { type: "draft", expectedRevision: view.draft.revision, text: "Use x" });
	view = service.view(chat.id);
	service.dispatch(chat.id, { type: "apply", id: "correction", contextId: view.contextId!, draftRevision: view.draft.revision, instruction: view.draft.text });
	await service.settled(chat.id);
	view = service.view(chat.id);
	assert.deepEqual(view.lines, []); assert.equal(view.workingRevision, 2); assert.equal(view.problem, null); assert.equal(view.pending, null);
});
