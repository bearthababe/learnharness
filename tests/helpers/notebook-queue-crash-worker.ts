import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chatStore } from "../../src/store/chats.ts";
import { createNotebookService } from "../../src/server/notebook.ts";

const [chatId, phase] = process.argv.slice(2);
if (!chatId) throw new Error("Missing fixture session");
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
let armed = false;
const rename = fs.renameSync;
fs.renameSync = (from, to) => {
	const record = JSON.parse(fs.readFileSync(from, "utf8"));
	rename(from, to);
	if (armed && record.notebook?.operations[0]?.status === phase) process.exit(0);
};
syncBuiltinESMExports();
const faux = createFauxCore({});
faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
service.dispatch(chatId, { type: "visibility", visible: true });
const owner = { kind: "ordinary" as const };
service.dispatch(chatId, { type: "tutor-draft", expectedRevision: 0, draft: { id: "draft", owner, revision: 1, parts: [{ id: "before", kind: "text", text: "Before working." }] } });
for (const [id, instruction] of [["A", "Write p="], ["B", "Use F/A"], ["C", "Double the area"]]) {
	let view = service.view(chatId);
	view = service.dispatch(chatId, { type: "draft", expectedRevision: view.draft.revision, text: instruction! }).view;
	service.dispatch(chatId, { type: "apply", id: id!, contextId: view.contextId!, draftRevision: view.draft.revision, instruction: instruction! });
	if (id === "B") service.dispatch(chatId, { type: "snapshot", id: "cutoff-B", owner, draftId: "draft", expectedRevision: 1, continuationId: "after", contextId: view.contextId!, throughOperationId: "B" });
}
armed = true;
if (phase === "queued") process.exit(0);
await service.settled(chatId);
throw new Error(`Did not reach ${phase}`);
