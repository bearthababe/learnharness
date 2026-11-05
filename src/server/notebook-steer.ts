import type { UserSteerInput } from "../core/input-events.ts";
import { newUserSteer } from "../core/native-messages.ts";
import { stores } from "./stores.ts";
import { steerLiveChat } from "./jobs.ts";
import { commitNotebookInput, notebookSubmissionAccepted, validateNotebookSubmission } from "./notebook-submissions.ts";
import { NotebookDraftConflict } from "../core/notebook-drafts.ts";

export function submitNotebookSteer(chatId: string, input: UserSteerInput): Response {
	try {
		const record = stores.chatStore.getChat(chatId);
		if (!record) return Response.json({ error: "unknown chat" }, { status: 404 });
		if (input.id !== input.submission?.id) throw new NotebookDraftConflict("Steer and submission identities must match");
		if (notebookSubmissionAccepted(record, input)) return Response.json({ ok: true });
		validateNotebookSubmission(record, input);
		const message = newUserSteer(input.text, input.id, input.explanation);
		if (!steerLiveChat(chatId, message, () => commitNotebookInput(stores.chatStore, chatId, input, [message], true))) return Response.json({ error: "no live turn to steer" }, { status: 409 });
		return Response.json({ ok: true });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "Notebook steer could not be saved" }, { status: error instanceof NotebookDraftConflict ? 400 : 503 });
	}
}
