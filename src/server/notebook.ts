/** Session-owned notebook executor. The request/view never owns accepted work. */
import { z } from "zod";
import { runNotebookEditor } from "../agent/notebook-editor.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import type { ChatStore } from "../core/ports.ts";
import type { NotebookCommand, NotebookRecord, NotebookOperation, NotebookView, NotebookUsage } from "../core/contracts/notebook.ts";
import { isSubscriptionModel } from "../core/prices.ts";
import { stores, effectiveSettings } from "./stores.ts";
import { initAuthEnv } from "./keys.ts";
import { refreshConnectionCatalog } from "./model-catalog.ts";
import { callCost } from "./pricing.ts";
import { ownedTutorDraftSchema, tutorDraftOwnerSchema } from "../core/notebook-content.ts";
import { changeNotebookDraft, NotebookDraftConflict } from "./notebook-drafts.ts";

const id = z.string().min(1);
const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("visibility"), visible: z.boolean() }).strict(),
	z.object({ type: z.literal("draft"), expectedRevision: z.number().int().nonnegative(), text: z.string() }).strict(),
	z.object({ type: z.literal("tutor-draft"), expectedRevision: z.number().int().nonnegative(), draft: ownedTutorDraftSchema }).strict(),
	z.object({ type: z.literal("snapshot"), id, owner: tutorDraftOwnerSchema, draftId: id, expectedRevision: z.number().int().nonnegative(), continuationId: id, contextId: id.optional(), workingRevision: z.number().int().nonnegative().optional() }).strict(),
	z.object({ type: z.literal("apply"), id, contextId: id, draftRevision: z.number().int().nonnegative(), instruction: z.string().refine((s) => s.trim().length > 0), cursorLineId: z.string().nullable().optional() }).strict(),
	z.object({ type: z.literal("undo"), id, contextId: id }).strict(),
]);
const executable = (op: NotebookOperation) => ["queued", "running", "result-ready"].includes(op.status);
const paused = (op: NotebookOperation) => ["failed", "clarification", "unknown"].includes(op.status);
const nextOperation = (record?: NotebookRecord) => record?.operations.find((op) => executable(op) || paused(op));
class NotebookRefusal extends Error {
	constructor(message: string, readonly status: number) { super(message); }
}

function emptyNotebook(): NotebookRecord {
	return { revision: 0, visible: false,
		current: { id: crypto.randomUUID(), revision: 0, state: { lines: [], undo: [] }, exchanges: [] },
		notebookDraft: { id: crypto.randomUUID(), revision: 0, text: "" }, nextSequence: 1, operations: [] };
}

export function notebookView(record?: NotebookRecord): NotebookView {
	const usage: NotebookUsage = { calls: 0, unknownCalls: 0, subscriptionCalls: 0, unpricedCalls: 0, apiSubtotal: 0, tokens: 0 };
	for (const op of record?.operations ?? []) {
		const attempts = op.execution?.attempts ?? [];
		// A started call without an observed completion is explicitly unmeasured.
		if (op.execution?.unobservedCall) {
			usage.calls++; usage.unknownCalls++;
			if (isSubscriptionModel(op.execution.model)) usage.subscriptionCalls++; else usage.unpricedCalls++;
		}
		for (const attempt of attempts) {
			usage.calls++;
			if (!attempt.usage) usage.unknownCalls++;
			else usage.tokens += (attempt.usage.inputTokens ?? 0) + (attempt.usage.outputTokens ?? 0) + (attempt.usage.cacheReadTokens ?? 0) + (attempt.usage.cacheWriteTokens ?? 0);
			if (isSubscriptionModel(attempt.model)) usage.subscriptionCalls++;
			else {
				const cost = attempt.usage ? callCost(attempt.usage, attempt.model) : null;
				if (cost === null) usage.unpricedCalls++; else usage.apiSubtotal += cost;
			}
		}
	}
	const problem = record?.operations.find(paused);
	const pending = record?.operations.find(executable);
	return { revision: record?.revision ?? 0, visible: record?.visible ?? false,
		contextId: record?.current.id ?? null, workingRevision: record?.current.revision ?? 0,
		lines: structuredClone(record?.current.state.lines ?? []), canUndo: !!record?.current.state.undo.length,
		draft: structuredClone(record?.notebookDraft ?? { id: "", revision: 0, text: "" }),
		pending: pending ? { id: pending.id, kind: pending.kind, status: pending.status } : null,
		problem: problem ? { operationId: problem.id, instruction: problem.instruction, status: problem.status as "failed" | "clarification" | "unknown", message: problem.error ?? "Edit needs attention" } : null,
		usage, tutorDrafts: structuredClone(record?.tutorDrafts ?? []), submissions: record?.submissions?.map(({ submission, status, explanation }) => ({ submission, status, explanation })) ?? [] };
}

export function createNotebookService({ chatStore, engine }: {
	chatStore: ChatStore;
	engine: () => Promise<{ engine: PiEngine; model: string }>;
}) {
	const running = new Map<string, Promise<void>>();
	function read(chatId: string) {
		const chat = chatStore.getChat(chatId);
		if (!chat) throw new NotebookRefusal("Session not found", 404);
		if (chat.notebook?.submissions?.some((receipt) => receipt.status === "pending")) {
			const ids = new Set(chat.messages.map((message) => message.id));
			for (const receipt of chat.notebook.submissions) if (ids.has(receipt.message.id)) receipt.status = "delivered";
		}
		return chat.notebook;
	}
	function mutate(chatId: string, change: (record: NotebookRecord) => void) {
		const record = read(chatId) ?? emptyNotebook();
		change(record);
		return chatStore.saveNotebook(chatId, record.revision, record);
	}
	function restore(record: NotebookRecord, op: NotebookOperation, status: "failed" | "clarification" | "unknown", message: string) {
		op.status = status;
		op.error = message;
		if (op.instruction) {
			record.notebookDraft.text = [op.instruction, record.notebookDraft.text].filter(Boolean).join("\n\n");
			record.notebookDraft.revision++;
		}
	}
	function commit(chatId: string, operationId: string) {
		mutate(chatId, (record) => {
			const op = record.operations.find((op) => op.id === operationId)!;
			if (op.status !== "result-ready" || !op.result) return;
			if (record.current.id !== op.contextId || record.current.revision !== op.baseRevision) throw new Error("Notebook result has stale working context");
			record.current.exchanges = op.result.exchanges;
			if (op.result.response === null || op.result.response.action === "question") {
				restore(record, op, op.result.response ? "clarification" : "failed", op.result.response?.action === "question" ? op.result.response.question : op.result.error ?? "Notebook editor failed");
			} else {
				record.current.state = op.result.state;
				record.current.revision++;
				op.status = "applied";
				op.appliedRevision = record.current.revision;
			}
		});
	}
	async function pump(chatId: string) {
		for (;;) {
			const record = read(chatId);
			const op = nextOperation(record);
			if (!record || !op || paused(op)) return;
			if (op.status === "result-ready") { commit(chatId, op.id); continue; }
			if (op.status !== "queued") return;
			if (op.kind === "undo") {
				mutate(chatId, (record) => {
					const current = record.operations.find((item) => item.id === op.id)!;
					const lines = record.current.state.undo.pop();
					if (lines) {
						record.current.state.lines = lines; record.current.revision++;
						record.current.exchanges.push({ instruction: "Undo", selection: null, cursorLineId: null,
							response: { action: "undo" }, notebookAfter: structuredClone(lines) });
					}
					current.status = "applied";
					current.appliedRevision = record.current.revision;
				});
				continue;
			}
			let resolved: Awaited<ReturnType<typeof engine>>;
			try { resolved = await engine(); }
			catch (error) {
				mutate(chatId, (record) => restore(record, record.operations.find((item) => item.id === op.id)!, "failed", error instanceof Error ? error.message : "Editor unavailable"));
				return;
			}
			const prepared = mutate(chatId, (record) => {
				const current = record.operations.find((item) => item.id === op.id)!;
				current.status = "running";
				current.baseRevision = record.current.revision;
				current.execution = { id: crypto.randomUUID(), model: resolved.model, attempts: [], input: {
					state: structuredClone(record.current.state), instruction: current.instruction!, cursorLineId: current.cursorLineId,
					history: structuredClone(record.current.exchanges),
				} };
			});
			const input = prepared.operations.find((item) => item.id === op.id)!.execution!.input;
			const result = await runNotebookEditor(input, { engine: resolved.engine, onAttemptFinished: async (attempt, index) => {
				mutate(chatId, (record) => {
					const execution = record.operations.find((item) => item.id === op.id)!.execution!;
					const attemptId = `${execution.id}:${index}`;
					if (execution.attempts.some((item) => item.id === attemptId)) return;
					execution.attempts.push({ id: attemptId, model: resolved.model, returnedModel: attempt.returnedModel,
						thinkingLevel: attempt.model.thinkingLevel, at: new Date().toISOString(), elapsedMs: attempt.elapsedMs,
						usage: attempt.usage ? { inputTokens: attempt.usage.input, outputTokens: attempt.usage.output,
							cacheReadTokens: attempt.usage.cacheRead, cacheWriteTokens: attempt.usage.cacheWrite,
							cacheWrite1hTokens: attempt.usage.cacheWrite1h, reasoningTokens: attempt.usage.reasoning } : null,
						failure: attempt.failure, error: attempt.error, raw: attempt.raw });
				});
			} });
			mutate(chatId, (record) => {
				const current = record.operations.find((item) => item.id === op.id)!;
				current.result = { state: result.state, response: result.response, exchanges: result.history, error: result.error };
				current.status = "result-ready";
			});
			commit(chatId, op.id);
		}
	}
	function schedule(chatId: string) {
		if (running.has(chatId)) return;
		const next = nextOperation(read(chatId));
		if (!next || paused(next)) return;
		let interrupted = false;
		const task = Promise.resolve().then(() => pump(chatId)).catch((error: unknown) => {
			interrupted = true;
			console.error(`[notebook ${chatId}] execution interrupted:`, error);
			// If storage is unavailable, leave the durable checkpoint untouched.
			// The next recovery pass will distinguish saved results from unknown calls.
			try { recover(chatId); } catch { /* durable state will recover on reopen */ }
		}).finally(() => {
			running.delete(chatId);
			// A command can arrive between pump completion and this microtask.
			const next = nextOperation(chatStore.getChat(chatId)?.notebook);
			if (!interrupted && next && (next.status === "queued" || next.status === "result-ready")) schedule(chatId);
		});
		running.set(chatId, task);
	}
	function recover(chatId: string) {
		const record = read(chatId);
		if (!record) return;
		for (const op of record.operations) {
			if (op.status === "running") mutate(chatId, (record) => {
				const interrupted = record.operations.find((item) => item.id === op.id)!;
				if (interrupted.execution) {
					const attempts = interrupted.execution.attempts;
					interrupted.execution.unobservedCall = attempts.length === 0 || (attempts.length === 1 && attempts[0]!.failure === "format");
				}
				restore(record, interrupted, "unknown", "Editor completion is unknown. Review the retained instruction and explicitly Apply to retry.");
			});
			if (op.status === "result-ready") commit(chatId, op.id);
		}
	}
	function resume(chatId: string) {
		if (running.has(chatId)) return;
		recover(chatId);
		schedule(chatId);
	}
	function dispatch(chatId: string, command: NotebookCommand) {
		resume(chatId);
		const previous = read(chatId);
		if (command.type === "apply" || command.type === "undo") {
			const duplicate = previous?.operations.find((op) => op.id === command.id);
			if (duplicate) {
				if (duplicate.contextId !== command.contextId || duplicate.kind !== (command.type === "apply" ? "edit" : "undo") ||
					(command.type === "apply" && (duplicate.instruction !== command.instruction || (duplicate.cursorLineId ?? null) !== (command.cursorLineId ?? null)))) throw new NotebookRefusal("Operation identity already used for different work", 409);
				return { id: command.id, view: notebookView(previous) };
			}
		}
		const saved = mutate(chatId, (record) => {
			if (command.type === "tutor-draft" || command.type === "snapshot") { changeNotebookDraft(record, command); return; }
			if (command.type === "visibility") { record.visible = command.visible; return; }
			if (command.type === "draft") {
				if (record.notebookDraft.text === command.text && record.notebookDraft.revision === command.expectedRevision + 1) return;
				if (record.notebookDraft.revision !== command.expectedRevision) throw new NotebookRefusal("Notebook draft changed; refresh before saving", 409);
				record.notebookDraft.text = command.text; record.notebookDraft.revision++; return;
			}
			if (record.current.id !== command.contextId) throw new NotebookRefusal("Notebook working context changed", 409);
			let correctionIndex = -1;
			if (command.type === "apply") {
				if (record.operations.some((op) => op.kind === "edit" && executable(op))) throw new NotebookRefusal("An edit is pending", 409);
				if (record.notebookDraft.revision !== command.draftRevision || record.notebookDraft.text !== command.instruction) throw new NotebookRefusal("Notebook draft changed; refresh before applying", 409);
				if (command.cursorLineId && !record.current.state.lines.some((line) => line.id === command.cursorLineId)) throw new NotebookRefusal("Selected line no longer exists", 409);
				correctionIndex = record.operations.findIndex(paused);
				if (correctionIndex >= 0) record.operations[correctionIndex]!.status = "recovered";
				record.notebookDraft.text = ""; record.notebookDraft.revision++;
			}
			const op: NotebookOperation = { id: command.id, contextId: command.contextId, sequence: record.nextSequence++, kind: command.type === "apply" ? "edit" : "undo",
				acceptedAt: new Date().toISOString(), status: "queued",
				...(command.type === "apply" ? { instruction: command.instruction, cursorLineId: command.cursorLineId } : {}) };
			// A corrected instruction resolves the paused head before waiting controls.
			if (correctionIndex >= 0) record.operations.splice(correctionIndex + 1, 0, op); else record.operations.push(op);
		});
		schedule(chatId);
		return { ...("id" in command ? { id: command.id } : {}), view: notebookView(saved) };
	}
	return {
		dispatch,
		resume,
		view(chatId: string) { resume(chatId); return notebookView(read(chatId)); },
		async settled(chatId: string) { await running.get(chatId); },
		busy(chatId: string) {
			const next = nextOperation(read(chatId));
			return running.has(chatId) || !!next && executable(next);
		},
		initialize() { for (const chat of chatStore.listChats()) { try { resume(chat.id); } catch (error) { console.error(`[notebook ${chat.id}] recovery failed`, error); } } },
		async handle(request: Request, chatId: string): Promise<Response> {
			try {
				if (request.method === "GET") { resume(chatId); return Response.json(notebookView(read(chatId))); }
				if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
				const parsed = commandSchema.safeParse(await request.json().catch(() => null));
				if (!parsed.success) return Response.json({ error: "Invalid notebook command" }, { status: 400 });
				return Response.json(dispatch(chatId, parsed.data), { status: parsed.data.type === "apply" || parsed.data.type === "undo" ? 202 : 200 });
			} catch (error) {
				return Response.json({ error: error instanceof Error ? error.message : "Notebook unavailable" }, { status: error instanceof NotebookRefusal ? error.status : error instanceof NotebookDraftConflict ? 409 : 503 });
			}
		},
	};
}

type NotebookService = ReturnType<typeof createNotebookService>;
const globalNotebook = globalThis as typeof globalThis & { __lhNotebook?: NotebookService; __lhNotebookInitialized?: boolean };
export function notebookService(): NotebookService {
	return globalNotebook.__lhNotebook ??= createNotebookService({ chatStore: stores.chatStore, engine: async () => {
		initAuthEnv();
		const cheap = effectiveSettings().models.cheap;
		if (!cheap) throw new Error("Configure the existing Cheap model before editing the notebook.");
		await refreshConnectionCatalog(cheap.provider);
		return { engine: piEngineForSpec(cheap, false), model: `${cheap.provider}:${cheap.id}` };
	} });
}
export function initializeNotebookRecovery() {
	if (globalNotebook.__lhNotebookInitialized) return;
	globalNotebook.__lhNotebookInitialized = true;
	notebookService().initialize();
}
export function handleNotebookRequest(request: Request, chatId: string) { return notebookService().handle(request, chatId); }
