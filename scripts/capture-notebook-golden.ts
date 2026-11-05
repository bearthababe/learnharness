/** Owner-approved #28 fixture capture: production writers, scripted providers,
 * isolated data/auth, byte-for-byte output. Run with node --import tsx. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-golden-");
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = path.join(dir, "auth.json");
process.env.OPENROUTER_API_KEY = "offline-fixture";
Object.assign(process.env, { NODE_ENV: "test" });
globalThis.fetch = async () => { throw new Error("Golden capture forbids network calls"); };
try {
	const { chatStore } = await import("../src/store/chats.ts");
	const { createNotebookService } = await import("../src/server/notebook.ts");
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const { handleChatRequest } = await import("../src/server/chat-handler.ts");
	const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
	const { runningTurn } = await import("../src/server/turn-runs.ts");
	const chat = chatStore.createChat("Notebook compatibility capture");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	const editor = createFauxCore({});
	editor.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/A"}]}'),
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://capture/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	const owner = { kind: "ordinary" as const };
	session.tutor.updateText(owner, "Pressure is force per area."); await session.tutor.idle();
	for (const text of ["Write p=", "Complete the formula with F/A"]) {
		if (session.getSnapshot().view?.lines.length) session.selectExpression("L1", 2);
		await session.dispatch({ type: "draft", text }); await session.dispatch({ type: "apply" });
		await service.settled(chat.id); await session.refresh(); await session.tutor.returnToTutor(owner);
	}
	session.tutor.updateText(owner, "I compare the area while holding force constant."); await session.tutor.idle();
	const prepared = await session.tutor.prepareSubmission(owner);
	const tutor = createFauxCore({}); tutor.setResponses([() => fauxAssistantMessage("Explain how doubling area affects pressure.")]);
	const response = await handleChatRequest(new Request("http://capture/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: prepared.text, explanation: prepared.explanation, submission: prepared.submission } }) }),
		opts => createTeacherAgent(undefined, { engine: { model: tutor.getModel(), streamFn: tutor.streamSimple }, messages: opts.messages }));
	assert.equal(response.status, 200, await response.clone().text());
	const turn = runningTurn(chat.id); if (turn) await new Response(turn.subscribe()).text();
	await session.tutor.reconcile();
	session.tutor.updateText(owner, "Unsent next thought."); await session.tutor.idle(); await session.tutor.returnToTutor(owner);
	await session.dispatch({ type: "draft", text: "Next unsent instruction." });
	// One recording, one owned Tutor continuation; production code writes the
	// received words without applying or submitting them.
	await session.speech.choose({ kind: "tutor", owner });
	const capture = await session.speech.begin({ id: crypto.randomUUID(), now: () => 0 });
	capture.final({ id: "continuation", text: "Saved spoken continuation.", start: 0, end: 1, words: [{ text: "Saved spoken continuation.", start: 0, end: 0.9 }], speechFinal: true });
	await capture.end("stop"); session.dispose();
	const source = path.join(dir, "chats", `${chat.id}.json`);
	const destination = path.resolve("tests/fixtures/golden-data/chats", `${chat.id}.json`);
	fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
	assert.deepEqual(fs.readFileSync(source), fs.readFileSync(destination));
	console.log(JSON.stringify({ path: destination, sha256: createHash("sha256").update(fs.readFileSync(destination)).digest("hex"), liveCalls: 0 }, null, 2));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
