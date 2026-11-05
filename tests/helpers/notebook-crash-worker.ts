/** Subprocess crash fixture: real handler/storage/editor; scripted provider only. */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chatStore } from "../../src/store/chats.ts";
import { createNotebookService } from "../../src/server/notebook.ts";

const [chatId, phase] = process.argv.slice(2);
if (!chatId) throw new Error("Missing fixture session");
globalThis.fetch = async () => { throw new Error("Unexpected network call"); };
const rename = fs.renameSync;
fs.renameSync = (from, to) => {
	const record = JSON.parse(fs.readFileSync(from, "utf8"));
	rename(from, to);
	if (record.notebook?.operations.at(-1)?.status === phase) process.exit(0);
};
syncBuiltinESMExports();
const faux = createFauxCore({});
faux.setResponses([() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}')]);
const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
const view = service.view(chatId);
service.dispatch(chatId, { type: "apply", id: "crash-edit", contextId: view.contextId!, draftRevision: view.draft.revision, instruction: view.draft.text });
if (phase === "accepted") process.exit(0);
await service.settled(chatId);
throw new Error(`Did not reach crash checkpoint ${phase}`);
