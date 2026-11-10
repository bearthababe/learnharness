/** Session-owned notebook executor. The request/view never owns accepted work. */
import { z } from "zod";
import { deploymentWorkPaused } from "./deployment-barrier.ts";
import { runNotebookEditor } from "../agent/notebook-editor.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import type { ChatStore } from "../core/ports.ts";
import type { NotebookCommand, NotebookRecord, NotebookOperation, NotebookView, NotebookUsage } from "../core/contracts/notebook.ts";
import { isSubscriptionModel } from "../core/prices.ts";
import { stores, effectiveSettings } from "./stores.ts";
import { initAuthEnv } from "./keys.ts";
import { ensureConnectionModel } from "./model-catalog.ts";
import { callCost } from "./pricing.ts";
import { DEFAULT_NOTEBOOK_CANDIDATE, NOTEBOOK_CANDIDATES, NOTEBOOK_MODEL_PICKER_VERSION, migrateNotebookModelPicker, notebookCandidateSelectable, notebookCandidateSchema, type NotebookCandidate } from "../core/notebook-models.ts";
import { notebookExpressionSelectionSchema, selectedNotebookExpression } from "../core/notebook-expressions.ts";
import { ownedTutorDraftSchema, tutorDraftOwnerSchema } from "../core/notebook-content.ts";
import { changeNotebookDraft, NotebookDraftConflict } from "../core/notebook-drafts.ts";
import { notebookSpeechApplySchema, notebookSpeechRunSchema, changeNotebookSpeech } from "../core/notebook-speech.ts";
import { notebookOperationPending as outstanding, notebookOperationPaused as paused, nextNotebookOperation as nextOperation, restoreNotebookOperation as restore,
	commitNotebookResult, completeNotebookWorking, undoNotebookWorking, startFreshNotebook, prepareNotebookExecution, recoverNotebookOperation,
	NotebookRefusal, reconcileNotebookOperation, reserveNotebookOperation } from "../core/notebook-operations.ts";

const id = z.string().min(1);
const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("candidate"), candidate: notebookCandidateSchema, expectedCandidate: notebookCandidateSchema }).strict(),
	z.object({ type: z.literal("speech-run"), expectedRevision: z.number().int().nonnegative(), run: notebookSpeechRunSchema }).strict(),
	z.object({ type: z.literal("discard-speech"), runId: id, fragmentId: id }).strict(),
	z.object({ type: z.literal("visibility"), visible: z.boolean() }).strict(),
	z.object({ type: z.literal("draft"), expectedRevision: z.number().int().nonnegative(), text: z.string() }).strict(),
	z.object({ type: z.literal("tutor-draft"), expectedRevision: z.number().int().nonnegative(), draft: ownedTutorDraftSchema }).strict(),
	z.object({ type: z.literal("discard-tutor-draft"), owner: tutorDraftOwnerSchema, draftId: id, expectedRevision: z.number().int().nonnegative() }).strict(),
	z.object({ type: z.literal("snapshot"), id, owner: tutorDraftOwnerSchema, draftId: id, expectedRevision: z.number().int().nonnegative(), continuationId: id, contextId: id.optional(), workingRevision: z.number().int().nonnegative().optional(), throughOperationId: id.optional() }).strict(),
	z.object({ type: z.literal("apply"), id, contextId: id, draftRevision: z.number().int().nonnegative(), instruction: z.string(), cursorLineId: z.string().nullable().optional(),
		expressionSelection: notebookExpressionSelectionSchema.nullable().optional(), candidate: notebookCandidateSchema.optional(), speech: notebookSpeechApplySchema.optional() }).strict(),
	z.object({ type: z.literal("undo"), id, contextId: id }).strict(),
	z.object({ type: z.literal("start-fresh"), id, contextId: id }).strict(),
]);

function emptyNotebook(): NotebookRecord {
	return { revision: 0, visible: false, candidate: DEFAULT_NOTEBOOK_CANDIDATE, modelPickerVersion: NOTEBOOK_MODEL_PICKER_VERSION,
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
	const pending = record?.operations.find(outstanding);
	return { revision: record?.revision ?? 0, candidate: record?.candidate ?? DEFAULT_NOTEBOOK_CANDIDATE, visible: record?.visible ?? false,
		contextId: record?.current.id ?? null, workingRevision: record?.current.revision ?? 0,
		lastOperationId: record?.operations.filter(op => op.contextId === record.current.id && op.kind !== "start-fresh").reduce<NotebookOperation | undefined>((last, op) => !last || op.sequence > last.sequence ? op : last, undefined)?.id,
		snapshots: structuredClone(record?.snapshots ?? []),
		lines: structuredClone(record?.current.state.lines ?? []), canUndo: !!record?.current.state.undo.length,
		history: structuredClone(record?.history ?? []),
		startFreshPending: !!record?.operations.some((op) => op.kind === "start-fresh" && outstanding(op)),
		draft: structuredClone(record?.notebookDraft ?? { id: "", revision: 0, text: "" }),
		pending: pending ? { id: pending.id, kind: pending.kind, status: pending.status } : null,
		problem: problem ? { operationId: problem.id, instruction: problem.recovery?.instructions.join("\n\n") ?? problem.instruction, status: problem.status as "failed" | "clarification" | "unknown", message: problem.error ?? "Edit needs attention" } : null,
		usage, speechRuns: structuredClone(record?.speechRuns ?? []), tutorDrafts: structuredClone(record?.tutorDrafts ?? []), submissions: record?.submissions?.map(({ submission, status, explanation }) => ({ submission, status, explanation })) ?? [] };
}

export function createNotebookService({ chatStore, engine }: {
	chatStore: ChatStore;
	engine: (candidate?: NotebookCandidate) => Promise<{ engine: PiEngine; model: string }>;
}) {
	const running = new Map<string, Promise<void>>();
	function read(chatId: string) {
		const chat = chatStore.getChat(chatId);
		if (!chat) throw new NotebookRefusal("Session not found", 404);
		if (chat.notebook && migrateNotebookModelPicker(chat.notebook)) {
			chat.notebook = chatStore.saveNotebook(chatId, chat.notebook.revision, chat.notebook);
		}
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
	function commit(chatId: string, operationId: string) {
		mutate(chatId, record => commitNotebookResult(record, operationId));
	}
	async function pump(chatId: string) {
		for (;;) {
			const record = read(chatId);
			const op = nextOperation(record);
			if (!record || !op || paused(op)) return;
			if (op.status === "result-ready") { commit(chatId, op.id); continue; }
			if (op.status !== "queued") return;
			if (op.kind === "edit" && op.speech?.ready && !op.instruction?.trim()) {
				mutate(chatId, record => completeNotebookWorking(record, record.operations.find(item => item.id === op.id)!));
				continue;
			}
			if (op.kind === "start-fresh") {
				mutate(chatId, record => startFreshNotebook(record, record.operations.find(item => item.id === op.id)!, { history: crypto.randomUUID(), context: crypto.randomUUID() }, new Date().toISOString()));
				continue;
			}
			if (op.kind === "undo") {
				mutate(chatId, record => undoNotebookWorking(record, record.operations.find(item => item.id === op.id)!));
				continue;
			}
			if (op.expressionSelection && !selectedNotebookExpression(record.current.state.lines, op.expressionSelection)) {
				mutate(chatId, record => restore(record, record.operations.find(item => item.id === op.id)!, "failed", "The selected expression changed. Select it again before applying."));
				return;
			}
			let resolved: Awaited<ReturnType<typeof engine>>;
			try { resolved = await engine(op.candidate); }
			catch (error) {
				mutate(chatId, (record) => restore(record, record.operations.find((item) => item.id === op.id)!, "failed", error instanceof Error ? error.message : "Editor unavailable"));
				return;
			}
			const prepared = mutate(chatId, record => prepareNotebookExecution(record, record.operations.find(item => item.id === op.id)!, crypto.randomUUID(), resolved.model));
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
			if (op.status === "running") mutate(chatId, record => recoverNotebookOperation(record, record.operations.find(item => item.id === op.id)!));
			if (op.status === "result-ready") commit(chatId, op.id);
		}
	}
	function resume(chatId: string) {
		if (running.has(chatId) || deploymentWorkPaused()) return;
		recover(chatId);
		schedule(chatId);
	}
	function dispatch(chatId: string, command: NotebookCommand) {
		if (deploymentWorkPaused()) throw new NotebookRefusal("Local maintenance pause", 503);
		resume(chatId);
		const previous = read(chatId);
		if (command.type === "apply" || command.type === "undo" || command.type === "start-fresh") {
			const duplicate = previous?.operations.find((op) => op.id === command.id);
			if (duplicate && previous) {
				const changed = reconcileNotebookOperation(previous, duplicate, command);
				const saved = changed ? chatStore.saveNotebook(chatId, previous.revision, previous) : previous;
				if (changed) schedule(chatId);
				return { id: command.id, view: notebookView(saved) };
			}
		}
		const saved = mutate(chatId, (record) => {
			if (command.type === "candidate") {
				if (!notebookCandidateSelectable(command.candidate)) throw new NotebookRefusal("Choose Terra or Sol for new Notebook work", 400);
				if (record.operations.some(outstanding) || record.speechRuns?.some(run => run.status === "recording")) throw new NotebookRefusal("Finish recording and applying before changing the Notebook model", 409);
				const current = record.candidate ?? DEFAULT_NOTEBOOK_CANDIDATE;
				if (current !== command.expectedCandidate && current !== command.candidate) throw new NotebookRefusal("Notebook model changed; refresh before selecting", 409);
				record.candidate = command.candidate; return;
			}
			if (command.type === "speech-run" || command.type === "discard-speech") {
				changeNotebookSpeech(record, command); return;
			}
			if (command.type === "tutor-draft" || command.type === "snapshot" || command.type === "discard-tutor-draft") { changeNotebookDraft(record, command); return; }
			if (command.type === "visibility") { record.visible = command.visible; return; }
			if (command.type === "draft") {
				if (record.notebookDraft.text === command.text && record.notebookDraft.revision === command.expectedRevision + 1) return;
				if (record.notebookDraft.revision !== command.expectedRevision) throw new NotebookRefusal("Notebook draft changed; refresh before saving", 409);
				record.notebookDraft.text = command.text; record.notebookDraft.revision++; return;
			}
			reserveNotebookOperation(record, command, new Date().toISOString());
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
			const record = chatStore.getChat(chatId)?.notebook;
			const next = record && nextOperation(record);
			return running.has(chatId) || !!next && outstanding(next);
		},
		initialize() { for (const chat of chatStore.listChats()) { try { resume(chat.id); } catch (error) { console.error(`[notebook ${chat.id}] recovery failed`, error); } } },
		async handle(request: Request, chatId: string): Promise<Response> {
			try {
				if (request.method === "GET") { resume(chatId); return Response.json(notebookView(read(chatId))); }
				if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
				const parsed = commandSchema.safeParse(await request.json().catch(() => null));
				if (!parsed.success) return Response.json({ error: "Invalid notebook command" }, { status: 400 });
				return Response.json(dispatch(chatId, parsed.data), { status: "id" in parsed.data ? 202 : 200 });
			} catch (error) {
				return Response.json({ error: error instanceof Error ? error.message : "Notebook unavailable" }, { status: error instanceof NotebookRefusal ? error.status : error instanceof NotebookDraftConflict ? 409 : 503 });
			}
		},
	};
}

type NotebookService = ReturnType<typeof createNotebookService>;
const globalNotebook = globalThis as typeof globalThis & { __lhNotebook?: NotebookService; __lhNotebookInitialized?: boolean };
export function notebookService(): NotebookService {
	return globalNotebook.__lhNotebook ??= createNotebookService({ chatStore: stores.chatStore, engine: async (candidate) => {
		initAuthEnv();
		// Only operations accepted before the picker retain the legacy slot lookup.
		const spec = candidate === undefined ? effectiveSettings().models.cheap : NOTEBOOK_CANDIDATES[candidate];
		if (!spec) throw new Error("Configure the existing Cheap model to finish the earlier Notebook operation.");
		await ensureConnectionModel(spec.provider, spec.id);
		const engine = piEngineForSpec(spec, false);
		if (candidate !== undefined && engine.level !== spec.thinkingLevel) throw new Error("The selected Notebook reasoning level is unavailable.");
		return { engine, model: `${spec.provider}:${spec.id}` };
	} });
}
export function initializeNotebookRecovery() {
	if (globalNotebook.__lhNotebookInitialized) return;
	globalNotebook.__lhNotebookInitialized = true;
	notebookService().initialize();
}
export function handleNotebookRequest(request: Request, chatId: string) { return notebookService().handle(request, chatId); }
