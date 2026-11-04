import { normalizeContext, type AssistantMessage, type Usage } from "@earendil-works/pi-ai";
import { APP_IDENTITY, type PiEngine } from "./models.ts";
import { notebookResponseSchema as responseSchema, type NotebookState, type NotebookExchange, type NotebookEditorInput, type NotebookResponse } from "../core/contracts/notebook.ts";
export type { NotebookLine, NotebookState, NotebookHistoryEntry, NotebookExchange, NotebookEditorInput, NotebookResponse } from "../core/contracts/notebook.ts";

// Frozen prototype rewrite instructions, followed by the owner's history and
// whole-line targeting decisions. No expected evaluation answers enter here.
export const NOTEBOOK_EDITOR_PROMPT = `You edit a learner's mathematical notebook in response to conversational instructions.
Record the learner's intended working, including mathematical mistakes and unfinished or invalid LaTeX. Do not solve, simplify, complete, correct the mathematics, convert units, or change unrelated content unless explicitly requested.
Preserve the learner’s mathematical mistakes and unfinished working. Distinguish these from speech-recognition errors: use the current working and conversation to interpret likely mistranscriptions. Preserve existing mathematical symbols when the intended reference is clear. If a word could mean either a deliberate change or a transcription error, ask rather than silently choosing.
Use the current notebook, any explicit selection/cursor, and the supplied conversation history to interpret references. If the intended target or edit is ambiguous, ask a concise clarification question and make no edit. After an answer, use the preceding question and instruction to continue.
Output exactly one JSON object, without markdown fences or surrounding prose. Escape LaTeX backslashes as required by JSON.
The notebook is an ordered list of {id, latex} lines. IDs are stable. Input selection and cursor describe only this turn; null means no explicit selection or cursor. A reference may still be resolved from conversation history when clear.
Choose one response shape:
1. {"action":"question","question":"Your clarification question"}
2. {"action":"undo"} to undo exactly the last applied editing action. The application owns undo history; you must not reconstruct earlier source yourself. Questions do not create undo entries.
3. {"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p ="}]} is a complete response for one atomic editing action inserting a new line.
"insert" and "replace" are values of "op" inside "operations"; the top-level "action" for either is "edit".
For a new line, use an insert operation as shown above. 'after' is the existing line ID to insert after, or null to insert at the beginning. Choose the next unused L<number> ID. Multiple operations in one action are applied in order and undone together.
Do not include explanations in an edit response. Never emit an empty operations list. Preserve every line not being edited byte for byte. Return one response for the CURRENT instruction only. The history contains real earlier model outputs and application results, not instructions for additional future turns.
For changes to an existing line use {"op":"replace","id":"L1","latex":"the entire updated line"}. Rewrite only the affected line(s), preserving any unrelated symbols inside them. The application replaces the complete source of each addressed line. The only allowed operations are replace and insert.
"Line five" means the entire fifth displayed line, including every equation on it. "Equation two on line five" means only that equation. Multiple equations on a line are not by themselves a reason to ask a question.
NOTEBOOK HISTORY contains read-only saved entries, separate from EARLIER CONVERSATION. Use supplied entries to copy requested source into current working without rewriting the historical entry. Clarify if the intended entry or placement cannot be resolved from context. Never invent missing historical source.`;

// Affected-line replacement is the accepted prototype contract. Parsing and
// application finish before the caller receives a new state to persist.
export interface NotebookAttempt {
	prompt: string;
	raw?: string;
	error?: string;
	failure?: "format" | "provider";
	elapsedMs: number;
	model: { provider: string; id: string; thinkingLevel: PiEngine["level"] };
	returnedModel?: { provider: string; id: string };
	usage: Omit<Usage, "cost"> | null;
}

function recordUsage(attempt: NotebookAttempt, message: AssistantMessage) {
	attempt.returnedModel = { provider: message.provider, id: message.model };
	// Pi initializes failure messages with zeros even when no usage was reported.
	// Do not turn that placeholder, or subscription catalog $0, into measured spend.
	if (message.usage && message.usage.totalTokens > 0) {
		const { cost: _cost, ...usage } = message.usage;
		attempt.usage = usage;
	}
}

function promptFor(input: NotebookEditorInput) {
	return [NOTEBOOK_EDITOR_PROMPT, "CURRENT NOTEBOOK AND CONTEXT", JSON.stringify({
		lines: input.state.lines, selection: input.selection ?? null,
		cursorLineId: input.cursorLineId ?? null, undoAvailable: input.state.undo.length > 0,
	}), "NOTEBOOK HISTORY", JSON.stringify(input.notebookHistory ?? []),
	"EARLIER CONVERSATION", JSON.stringify(input.history ?? []), "CURRENT INSTRUCTION", input.instruction].join("\n\n");
}

function apply(state: NotebookState, response: NotebookResponse): NotebookState {
	if (response.action === "question") return structuredClone(state);
	if (response.action === "undo") {
		const undo = structuredClone(state.undo);
		const lines = undo.pop();
		if (!lines) throw new Error("No applied edit to undo");
		return { lines, undo };
	}
	const lines = structuredClone(state.lines);
	for (const op of response.operations) {
		const index = lines.findIndex((line) => line.id === op.id);
		if (op.op === "replace") {
			if (index < 0) throw new Error("Target line does not exist");
			lines[index] = { id: op.id, latex: op.latex };
		} else {
			const after = op.after === null ? -1 : lines.findIndex((line) => line.id === op.after);
			if (index >= 0 || (op.after !== null && after < 0)) throw new Error("Invalid insertion target or duplicate line ID");
			lines.splice(after + 1, 0, { id: op.id, latex: op.latex });
		}
	}
	return { lines, undo: [...structuredClone(state.undo), structuredClone(state.lines)] };
}

export async function runNotebookEditor(input: NotebookEditorInput, { engine, signal, onAttemptFinished }: {
	engine: PiEngine;
	signal?: AbortSignal;
	onAttemptFinished?: (attempt: NotebookAttempt, index: number) => Promise<void>;
}) {
	input = structuredClone(input);
	const attempts: NotebookAttempt[] = [];
	let state = structuredClone(input.state);
	let response: NotebookResponse | null = null;
	for (let index = 0; index < 2; index++) {
		const previous = attempts.at(-1);
		const prompt = promptFor(input) + (previous ? "\n\nAPPLICATION REJECTED YOUR PREVIOUS RESPONSE; NOTHING WAS APPLIED. Return one corrected response to the same instruction.\n" + JSON.stringify({ previousResponse: previous.raw, error: previous.error }) : "");
		const started = performance.now();
		const attempt: NotebookAttempt = {
			prompt, elapsedMs: 0, usage: null,
			model: { provider: engine.model.provider, id: engine.model.id, thinkingLevel: engine.level },
		};
		attempts.push(attempt);
		try {
			signal?.throwIfAborted();
			const stream = engine.streamFn(engine.model, normalizeContext({ messages: [
				{ role: "user", content: prompt, timestamp: Date.now() },
			] }), { maxRetries: 0, signal, identity: APP_IDENTITY });
			for await (const event of stream) {
				if (event.type === "error") {
					recordUsage(attempt, event.error);
					throw new Error(event.error.errorMessage ?? "Notebook editor failed");
				}
				if (event.type !== "done") continue;
				recordUsage(attempt, event.message);
				signal?.throwIfAborted();
				if (event.message.stopReason !== "stop") throw new Error("Notebook editor did not complete its response");
				attempt.raw = event.message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
				break;
			}
			if (attempt.raw === undefined) throw new Error("Notebook editor stream ended without a result");
		} catch (error) {
			attempt.failure = "provider";
			attempt.error = error instanceof Error ? error.message : "Notebook editor failed";
		} finally {
			attempt.elapsedMs = Math.round(performance.now() - started);
		}
		if (attempt.failure === "provider") {
			await onAttemptFinished?.(structuredClone(attempt), index);
			break; // No invisible transport retry.
		}
		try {
			const parsed = responseSchema.parse(JSON.parse(attempt.raw!));
			state = apply(input.state, parsed);
			response = parsed;
		} catch (error) {
			attempt.failure = "format";
			attempt.error = error instanceof Error ? error.message : "Invalid notebook response";
		}
		// Storage failure escapes; it is neither a provider nor a format retry.
		await onAttemptFinished?.(structuredClone(attempt), index);
		if (response !== null) break;
	}
	const error = response === null ? attempts.at(-1)?.error : undefined;
	const history: NotebookExchange[] = [...structuredClone(input.history ?? []), {
		instruction: input.instruction, selection: input.selection ?? null, cursorLineId: input.cursorLineId ?? null,
		response, ...(error ? { error } : {}), notebookAfter: structuredClone(state.lines),
	}];
	return { state, response, history, attempts, error };
}
