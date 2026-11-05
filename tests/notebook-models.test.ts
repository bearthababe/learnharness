import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { NotebookCandidate } from "../src/core/notebook-models.ts";
import type { NotebookCommand } from "../src/core/contracts/notebook.ts";
import { NOTEBOOK_CANDIDATES, NOTEBOOK_PICKER_MODELS, NOTEBOOK_MODEL_PICKER_VERSION, notebookCandidateFor } from "../src/core/notebook-models.ts";
import { piModels } from "../src/agent/models.ts";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-models-");
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
const { createNotebookSession } = await import("../components/notebook-session.ts");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("No live provider calls authorized"); };
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });

test("curated reasoning choices match the upstream catalog and unsupported Off switches to Medium", () => {
	for (const model of Object.values(NOTEBOOK_PICKER_MODELS)) {
		const spec = NOTEBOOK_CANDIDATES[model.candidates[0]!];
		assert.deepEqual(model.candidates.map(id => NOTEBOOK_CANDIDATES[id].thinkingLevel), getSupportedThinkingLevels(piModels().getModel("openai", spec.id)!));
	}
	assert.equal(notebookCandidateFor("sol", "terra-off"), "sol-medium");
	assert.equal(notebookCandidateFor("sol", "terra-high"), "sol-high");
	assert.equal(notebookCandidateFor("terra", "sol-low"), "terra-low");
});

test("existing sessions migrate once to Terra medium without rewriting their accepted work", () => {
	const chat = chatStore.createChat("One-time default migration");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No generation"); } });
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const record = chatStore.getChat(chat.id)!.notebook!;
	delete record.modelPickerVersion; record.candidate = "deepseek-low";
	record.current.state = { lines: [{ id: "L1", latex: "2+2=5=" }], undo: [[]] };
	record.notebookDraft.text = "My unfinished instruction";
	record.operations.push({ id: "old", sequence: 1, contextId: record.current.id, kind: "edit", status: "applied", candidate: "deepseek-low", acceptedAt: "2026-11-04T00:00:00Z" });
	const before = chatStore.saveNotebook(chat.id, record.revision, record);
	assert.equal(service.view(chat.id).candidate, "terra-medium");
	const migrated = chatStore.getChat(chat.id)!.notebook!;
	assert.deepEqual(migrated, { ...before, revision: before.revision + 1, candidate: "terra-medium", modelPickerVersion: NOTEBOOK_MODEL_PICKER_VERSION });
	service.dispatch(chat.id, { type: "candidate", candidate: "sol-high", expectedCandidate: "terra-medium" });
	const revision = service.view(chat.id).revision;
	assert.equal(service.view(chat.id).candidate, "sol-high"); assert.equal(service.view(chat.id).revision, revision);
});

test("candidate choice survives reopen per session without changing drafts, working, snapshots or Tutor", async () => {
	const chat = chatStore.createChat("Candidates"); const other = chatStore.createChat("Independent");
	const seen: Array<NotebookCandidate | undefined> = []; const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"2+2=5"}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"2+2=5; x="}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async candidate => { seen.push(candidate); return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: `faux:${candidate}` }; } });
	const transport: typeof fetch = async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id);
	const session = createNotebookSession(chat.id, transport);
	await session.refresh(); assert.equal(session.getSnapshot().view?.candidate, "terra-medium");
	await session.dispatch({ type: "visibility", visible: true });
	await session.dispatch({ type: "draft", text: "Write 2+2=5" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	session.tutor.updateText({ kind: "ordinary" }, "My own explanation"); await session.tutor.idle(); await session.tutor.returnToTutor({ kind: "ordinary" });
	await session.dispatch({ type: "draft", text: "Append x=" });
	const before = chatStore.getChat(chat.id)!;
	await session.dispatch({ type: "candidate", candidate: "terra-off" });
	const after = chatStore.getChat(chat.id)!;
	assert.deepEqual(after, { ...before, notebook: { ...before.notebook!, revision: before.notebook!.revision + 1, candidate: "terra-off" } });
	assert.equal(service.view(other.id).candidate, "terra-medium"); assert.deepEqual(seen, ["terra-medium"]);
	session.dispose(); const reopened = createNotebookSession(chat.id, transport); await reopened.refresh();
	assert.equal(reopened.getSnapshot().view?.candidate, "terra-off"); assert.equal(reopened.getSnapshot().draftText, "Append x=");
	await reopened.dispatch({ type: "apply" }); await service.settled(chat.id); await reopened.refresh();
	assert.deepEqual(seen, ["terra-medium", "terra-off"]);
	await reopened.dispatch({ type: "undo" }); await service.settled(chat.id); await reopened.refresh();
	assert.deepEqual(service.view(chat.id).lines, before.notebook!.current.state.lines);
	assert.deepEqual(service.view(chat.id).snapshots, before.notebook!.snapshots);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, before.messages);
	await reopened.dispatch({ type: "start-fresh" }); await service.settled(chat.id);
	assert.equal(service.view(chat.id).candidate, "terra-off"); assert.deepEqual(seen, ["terra-medium", "terra-off"]); reopened.dispose();
});

test("stale choices and Apply identities cannot silently change candidates; recording and accepted work block switching", async () => {
	const chat = chatStore.createChat("Candidate conflicts"); const faux = createFauxCore({});
	let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
	faux.setResponses([async () => { await gate; return fauxAssistantMessage('{"action":"question","question":"Which line?"}'); }]);
	const seen: Array<NotebookCandidate | undefined> = [];
	const service = createNotebookService({ chatStore, engine: async candidate => { seen.push(candidate); return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }; } });
	const post = (command: NotebookCommand) => service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify(command) }), chat.id);
	service.dispatch(chat.id, { type: "visibility", visible: true });
	const select = { type: "candidate", candidate: "terra-off", expectedCandidate: "terra-medium" } as const;
	assert.equal((await post(select)).status, 200); assert.equal((await post(select)).status, 200, "lost choice ACK is idempotent");
	assert.equal((await post({ type: "candidate", candidate: "sol-medium", expectedCandidate: "terra-medium" })).status, 409);
	const invalid = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ ...select, candidate: "sol-off" }) }), chat.id); assert.equal(invalid.status, 400);
	assert.equal((await post({ ...select, candidate: "deepseek-low" })).status, 400, "Legacy DeepSeek is not selectable for new work");
	service.dispatch(chat.id, { type: "draft", text: "Change that", expectedRevision: 0 });
	const view = service.view(chat.id);
	const apply = { type: "apply", id: "chosen", candidate: "terra-off", contextId: view.contextId!, instruction: view.draft.text, draftRevision: view.draft.revision } as const;
	assert.equal((await post({ ...apply, candidate: "deepseek-low" })).status, 409);
	assert.equal(service.view(chat.id).draft.text, "Change that"); assert.equal(seen.length, 0);
	assert.equal((await post(apply)).status, 202);
	try {
		assert.equal((await post({ type: "candidate", candidate: "terra-medium", expectedCandidate: "terra-off" })).status, 409);
		assert.equal((await post({ ...apply, candidate: "deepseek-low" })).status, 409);
		assert.equal(chatStore.getChat(chat.id)!.notebook!.operations[0]!.candidate, "terra-off");
	} finally { release(); await service.settled(chat.id); }
	assert.equal(service.view(chat.id).problem?.status, "clarification");
	assert.equal((await post({ type: "candidate", candidate: "terra-medium", expectedCandidate: "terra-off" })).status, 200);
	assert.equal((await post(apply)).status, 202, "old Apply ACK stays tied to its old candidate after switching"); assert.deepEqual(seen, ["terra-off"]);
	service.dispatch(chat.id, { type: "speech-run", expectedRevision: 0, run: { id: "recording", revision: 1, status: "recording", incomplete: false, fragments: [] } });
	assert.equal((await post(select)).status, 409);
	service.dispatch(chat.id, { type: "speech-run", expectedRevision: 1, run: { id: "recording", revision: 2, status: "revealed", incomplete: false, fragments: [] } });
	assert.equal((await post(select)).status, 200); assert.deepEqual(seen, ["terra-off"]);
});

for (const candidate of ["terra-off", "deepseek-low", undefined] as const) test(`restart routes ${candidate ?? "legacy shared-Cheap"} work from the accepted operation`, async () => {
	const chat = chatStore.createChat("Restart candidate");
	const seed = createNotebookService({ chatStore, engine: async () => { throw new Error("No seed dispatch"); } });
	seed.dispatch(chat.id, { type: "visibility", visible: true });
	const record = chatStore.getChat(chat.id)!.notebook!;
	record.candidate = "deepseek-low";
	delete record.modelPickerVersion;
	record.operations.push({ id: "durable", sequence: record.nextSequence++, contextId: record.current.id, kind: "edit", instruction: "Write x=", acceptedAt: new Date().toISOString(), status: "queued", ...(candidate ? { candidate } : {}) });
	chatStore.saveNotebook(chat.id, record.revision, record);
	const seen: Array<NotebookCandidate | undefined> = []; const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x="}]}')]);
	const restarted = createNotebookService({ chatStore, engine: async candidate => { seen.push(candidate); return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }; } });
	restarted.resume(chat.id); await restarted.settled(chat.id);
	assert.equal(restarted.view(chat.id).candidate, "terra-medium", "Migration changes the session default, never the accepted operation");
	assert.deepEqual(seen, [candidate]);
	assert.deepEqual(restarted.view(chat.id).lines, [{ id: "L1", latex: "x=" }]);
	restarted.resume(chat.id); await restarted.settled(chat.id); assert.equal(seen.length, 1);
});

test("a failed candidate is never substituted; switching after failure needs an explicit Apply", async () => {
	const chat = chatStore.createChat("Unavailable candidate"); const seen: Array<NotebookCandidate | undefined> = [];
	const faux = createFauxCore({}); let prompt = "";
	faux.setResponses([context => { prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"x="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async candidate => {
		seen.push(candidate); if (candidate === "terra-medium") throw new Error("Candidate unavailable");
		return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:terra" };
	} });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.dispatch({ type: "draft", text: "Write x=" });
	await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	assert.equal(session.getSnapshot().draftText, "Write x="); assert.equal(service.view(chat.id).problem?.message, "Candidate unavailable");
	await session.dispatch({ type: "candidate", candidate: "terra-off" }); await service.settled(chat.id); assert.deepEqual(seen, ["terra-medium"]);
	await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	assert.deepEqual(seen, ["terra-medium", "terra-off"]); assert.equal(service.view(chat.id).problem, null);
	assert.match(prompt, /Write x=/); session.dispose();
});
