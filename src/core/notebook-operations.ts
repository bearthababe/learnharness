/** Existing Notebook lifecycle rules. The executor supplies persistence,
 * provider results, IDs and time; these transitions only change owned state. */
import type { NotebookRecord, NotebookOperation, NotebookCommand } from "./contracts/notebook.ts";
import { NOTEBOOK_FAILURE, snapshotPart } from "./notebook-content.ts";

export const notebookOperationPending = (op: NotebookOperation) => ["awaiting-transcript", "queued", "running", "result-ready"].includes(op.status);
export const notebookOperationPaused = (op: NotebookOperation) => ["failed", "clarification", "unknown"].includes(op.status);
export const nextNotebookOperation = (record?: NotebookRecord) => record?.operations.find(op => notebookOperationPending(op) || notebookOperationPaused(op));
type OperationCommand = Extract<NotebookCommand, { type: "apply" | "undo" | "start-fresh" }>;
export class NotebookRefusal extends Error {
	constructor(message: string, readonly status: number) { super(message); }
}

/** Reconcile the exact request identity. Returns whether a durable update is
 * needed; repeating an already accepted request leaves the record untouched. */
export function reconcileNotebookOperation(record: NotebookRecord, op: NotebookOperation, command: OperationCommand): boolean {
	if (command.type === "apply" && command.speech && op.speech) {
		const source = (speech: NonNullable<NotebookOperation["speech"]>) => JSON.stringify([speech.runId, speech.draftId, speech.nextDraftId, speech.prefix, speech.cutoff, speech.resolves]);
		if (op.contextId !== command.contextId || source(op.speech) !== source(command.speech)) throw new NotebookRefusal("Operation identity already used for different work", 409);
		if (op.status === "recovered") {
			const problem = record.operations.find(item => notebookOperationPaused(item) && item.recovery?.operationIds?.includes(op.id));
			if (problem) {
				const oldPrefix = problem.recovery!.instructions.join("\n\n");
				const later = record.notebookDraft.text.startsWith(oldPrefix) ? record.notebookDraft.text.slice(oldPrefix.length).replace(/^\n\n/, "") : record.notebookDraft.text;
				op.instruction = command.instruction; op.speech = structuredClone(command.speech);
				problem.recovery!.instructions = problem.recovery!.operationIds!.flatMap(id => record.operations.find(item => item.id === id)?.instruction || []);
				record.notebookDraft.text = [...problem.recovery!.instructions, later].filter(Boolean).join("\n\n"); record.notebookDraft.revision++;
				return true;
			}
		}
		if (op.status === "awaiting-transcript") {
			if (command.instruction !== [command.speech.prefix.trimEnd(), command.speech.text].filter(Boolean).join(" ")) throw new NotebookRefusal("Spoken instruction changed", 409);
			op.instruction = command.instruction; op.speech = structuredClone(command.speech);
			if (command.speech.ready) op.status = "queued";
			return true;
		}
		// A stale reservation or recovery replay cannot downgrade accepted work.
		if (!command.speech.ready || op.status === "recovered") return false;
	}
	if (op.contextId !== command.contextId || op.kind !== (command.type === "apply" ? "edit" : command.type) ||
		(command.type === "apply" && (op.instruction !== command.instruction || (op.cursorLineId ?? null) !== (command.cursorLineId ?? null) || JSON.stringify(op.speech) !== JSON.stringify(command.speech)))) throw new NotebookRefusal("Operation identity already used for different work", 409);
	return false;
}

export function reserveNotebookOperation(record: NotebookRecord, command: OperationCommand, acceptedAt: string) {
	if (record.current.id !== command.contextId) throw new NotebookRefusal("Notebook working context changed", 409);
	if (record.operations.some(op => op.kind === "start-fresh" && notebookOperationPending(op)) &&
		!(command.type === "apply" && record.operations.some(notebookOperationPaused))) throw new NotebookRefusal("Start fresh is waiting; resolve earlier work first", 409);
	let correctionIndex = -1;
	if (command.type === "apply") {
		const blocked = record.operations.find(notebookOperationPaused);
		if (command.speech && blocked && command.speech.resolves !== blocked.id) {
			if (command.speech.draftId !== record.notebookDraft.id) throw new NotebookRefusal("Notebook draft changed; review retained speech", 409);
			const instructions = blocked.recovery?.instructions ?? (blocked.instruction ? [blocked.instruction] : []);
			const prefix = instructions.join("\n\n");
			const later = record.notebookDraft.text.startsWith(prefix) ? record.notebookDraft.text.slice(prefix.length).replace(/^\n\n/, "") : record.notebookDraft.text;
			blocked.recovery = { instructions: [...instructions, command.instruction].filter(Boolean), operationIds: [...blocked.recovery?.operationIds ?? [blocked.id], command.id] };
			record.notebookDraft = { id: command.speech.nextDraftId, revision: record.notebookDraft.revision + 1, text: [...blocked.recovery.instructions, later].filter(Boolean).join("\n\n") };
			record.operations.push({ id: command.id, sequence: record.nextSequence++, kind: "edit", contextId: command.contextId, instruction: command.instruction, speech: structuredClone(command.speech), acceptedAt, status: "recovered", completedWorking: { revision: record.current.revision, lines: structuredClone(record.current.state.lines) } });
			return;
		}
		if (!command.speech && !command.instruction.trim()) throw new NotebookRefusal("Enter a notebook instruction", 400);
		const instruction = command.speech ? [record.notebookDraft.text.trimEnd(), command.speech.text].filter(Boolean).join(" ") : record.notebookDraft.text;
		if (record.notebookDraft.revision !== command.draftRevision || instruction !== command.instruction || command.speech && command.speech.draftId !== record.notebookDraft.id) throw new NotebookRefusal("Notebook draft changed; refresh before applying", 409);
		if (command.cursorLineId && !record.current.state.lines.some(line => line.id === command.cursorLineId)) throw new NotebookRefusal("Selected line no longer exists", 409);
		correctionIndex = record.operations.findIndex(notebookOperationPaused);
		if (correctionIndex >= 0) record.operations[correctionIndex]!.status = "recovered";
		record.notebookDraft.text = ""; record.notebookDraft.revision++;
		if (command.speech) record.notebookDraft.id = command.speech.nextDraftId;
	}
	const op: NotebookOperation = { id: command.id, contextId: command.contextId, sequence: record.nextSequence++, kind: command.type === "apply" ? "edit" : command.type,
		acceptedAt, status: command.type === "apply" && command.speech && !command.speech.ready ? "awaiting-transcript" : "queued",
		...(command.type === "apply" ? { instruction: command.instruction, cursorLineId: command.cursorLineId, ...(command.speech ? { speech: structuredClone(command.speech) } : {}) } : {}) };
	// A corrected instruction resolves the paused head before waiting controls.
	if (correctionIndex >= 0) record.operations.splice(correctionIndex + 1, 0, op); else record.operations.push(op);
}

export function resolveNotebookSnapshots(record: NotebookRecord, operationId: string) {
	const operation = record.operations.find(op => op.id === operationId)!;
	if (!operation.completedWorking) return;
	for (const snapshot of record.snapshots ?? []) {
		if (snapshot.status !== "pending" || snapshot.throughOperationId !== operationId) continue;
		snapshot.status = operation.status === "applied" ? "resolved" : "failed";
		if (snapshot.status === "failed") snapshot.failure = NOTEBOOK_FAILURE;
		snapshot.revision = operation.completedWorking.revision;
		snapshot.lines = structuredClone(operation.completedWorking.lines);
		const draft = record.tutorDrafts?.find(draft => draft.id === snapshot.draftId);
		const index = draft?.parts.findIndex(part => part.id === snapshot.id) ?? -1;
		if (draft && index >= 0) { draft.parts[index] = snapshotPart(snapshot); draft.revision++; }
	}
}

export function restoreNotebookOperation(record: NotebookRecord, op: NotebookOperation, status: "failed" | "clarification" | "unknown", message: string) {
	op.status = status;
	op.error = message;
	const returned = record.operations.slice(record.operations.indexOf(op)).filter(item => item === op || item.kind === "edit" && (item.status === "queued" || item.status === "awaiting-transcript"));
	op.recovery = { instructions: returned.flatMap(item => item.instruction ? [item.instruction] : []), operationIds: returned.map(item => item.id) };
	for (const item of returned) {
		if (item !== op) item.status = "recovered";
		item.completedWorking = { revision: record.current.revision, lines: structuredClone(record.current.state.lines) };
		resolveNotebookSnapshots(record, item.id);
	}
	if (op.recovery.instructions.length) {
		record.notebookDraft.text = [...op.recovery.instructions, record.notebookDraft.text].filter(Boolean).join("\n\n");
		record.notebookDraft.revision++;
	}
}

export function commitNotebookResult(record: NotebookRecord, operationId: string) {
	const op = record.operations.find(op => op.id === operationId)!;
	if (op.status !== "result-ready" || !op.result) return;
	if (record.current.id !== op.contextId || record.current.revision !== op.baseRevision) throw new Error("Notebook result has stale working context");
	record.current.exchanges = op.result.exchanges;
	if (op.result.response === null || op.result.response.action === "question") {
		restoreNotebookOperation(record, op, op.result.response ? "clarification" : "failed", op.result.response?.action === "question" ? op.result.response.question : op.result.error ?? "Notebook editor failed");
	} else {
		record.current.state = op.result.state;
		record.current.revision++;
		completeNotebookWorking(record, op);
	}
}

export function completeNotebookWorking(record: NotebookRecord, op: NotebookOperation) {
	op.status = "applied";
	op.appliedRevision = record.current.revision;
	op.completedWorking = { revision: record.current.revision, lines: structuredClone(record.current.state.lines) };
	resolveNotebookSnapshots(record, op.id);
}

export function undoNotebookWorking(record: NotebookRecord, op: NotebookOperation) {
	const lines = record.current.state.undo.pop();
	if (lines) {
		record.current.state.lines = lines; record.current.revision++;
		record.current.exchanges.push({ instruction: "Undo", selection: null, cursorLineId: null,
			response: { action: "undo" }, notebookAfter: structuredClone(lines) });
	}
	completeNotebookWorking(record, op);
}

export function startFreshNotebook(record: NotebookRecord, op: NotebookOperation, ids: { history: string; context: string }, createdAt: string) {
	if (record.current.id !== op.contextId) throw new Error("Notebook fresh action has stale working context");
	if (record.current.state.lines.length) {
		(record.history ??= []).push({ id: ids.history, sourceContextId: record.current.id,
			sourceRevision: record.current.revision, createdAt, lines: structuredClone(record.current.state.lines) });
	}
	record.current = { id: ids.context, revision: 0, state: { lines: [], undo: [] }, exchanges: [] };
	op.status = "applied";
	op.appliedRevision = 0;
}

export function prepareNotebookExecution(record: NotebookRecord, op: NotebookOperation, executionId: string, model: string) {
	op.status = "running";
	op.baseRevision = record.current.revision;
	op.execution = { id: executionId, model, attempts: [], input: {
		state: structuredClone(record.current.state), instruction: op.instruction!, cursorLineId: op.cursorLineId,
		history: structuredClone(record.current.exchanges),
		notebookHistory: (record.history ?? []).map((entry, index) => ({ ...structuredClone(entry), label: `Entry ${index + 1}` })),
	} };
}

export function recoverNotebookOperation(record: NotebookRecord, op: NotebookOperation) {
	if (op.execution) {
		const attempts = op.execution.attempts;
		op.execution.unobservedCall = attempts.length === 0 || (attempts.length === 1 && attempts[0]!.failure === "format");
	}
	restoreNotebookOperation(record, op, "unknown", "Editor completion is unknown. Review the retained instruction and explicitly Apply to retry.");
}
