import { notebookSpeechApplySchema, type NotebookCommand, type NotebookCommandReceipt, type NotebookView, type NotebookSpeechApply } from "@/src/core";
import { createNotebookTutorDrafts, type DraftRecoveryStorage } from "./notebook-tutor-drafts";
import { createNotebookSpeech } from "./notebook-speech";

export type NotebookSessionCommand =
	| { type: "visibility"; visible: boolean }
	| { type: "draft"; text: string }
	| { type: "apply"; cursorLineId?: string | null; id?: string; speech?: NotebookSpeechApply }
	| Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" | "discard-tutor-draft" | "speech-run" | "discard-speech" }>
	| { type: "undo" | "start-fresh" };
export interface NotebookSessionSnapshot {
	view: NotebookView | null;
	draftText: string;
	saving: boolean;
	error: string | null;
	cursorLineId?: string | null;
}

/** One session-lifetime observable. Serialized saves never overwrite newer text;
 * detaching a view does not abort requests or accepted server computation. */
export function createNotebookSession(chatId: string, fetcher: typeof fetch = fetch, recoveryStorage?: DraftRecoveryStorage) {
	const url = `/api/chats/${encodeURIComponent(chatId)}/notebook`;
	const listeners = new Set<() => void>();
	let state: NotebookSessionSnapshot = { view: null, draftText: "", saving: false, error: null };
	let tail: Promise<unknown> = Promise.resolve();
	let localRevision = 0;
	let savedLocalRevision = 0;
	let requests = 0;
	let uncertain: Extract<NotebookCommand, { type: "apply" | "undo" | "start-fresh" }> | null = null;
	let uncertainRevision = 0;
	const requested: Array<{ id: string; contextId: string }> = [];
	const requestOrder = new Map<string, number>();
	type SpeechRequest = { command: Extract<NotebookSessionCommand, { type: "apply" }>; contextId: string; wire?: Extract<NotebookCommand, { type: "apply" }> };
	let speechRequests: SpeechRequest[] = [];
	let requestsLoaded = false;
	const requestsKey = `lh:notebook-applies:${chatId}`;
	function stashRequests() {
		try { if (speechRequests.length) storage?.setItem(requestsKey, JSON.stringify(speechRequests)); else storage?.removeItem(requestsKey); }
		catch { publish({ error: "Local Apply recovery could not be saved. Keep this page open until the server save succeeds." }); }
	}
	function recoverRequests(view: NotebookView) {
		if (requestsLoaded) return;
		requestsLoaded = true;
		try {
			const raw = storage?.getItem(requestsKey);
			if (!raw) return;
			speechRequests = JSON.parse(raw) as SpeechRequest[];
			for (const request of speechRequests) {
				notebookSpeechApplySchema.parse(request.command.speech);
				if (!request.command.id || !request.contextId) throw new Error("Invalid saved Apply identity");
			}
			// Reserve the save rail before interrupted speech is restored. The exact
			// accepted request is idempotent even if its acknowledgment was lost.
			publish({ view });
			for (const request of speechRequests) void dispatch(request.command, request).catch(() => {});
		} catch { publish({ error: "Saved Apply recovery could not be read. Retained dictation is available for review." }); }
	}
	const recovered = new Set<string>();
	const recoveryPrefixes: string[] = [];
	const prepend = (prefixes: string[], text: string) => [...prefixes, text].filter(Boolean).join("\n\n");
	const publish = (patch: Partial<NotebookSessionSnapshot>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	function adopt(view: NotebookView) {
		if (state.view && view.revision < state.view.revision) return;
		tutor.adopt(view);
		recoverRequests(view);
		speech.adopt(view);
		if (view.problem && !recovered.has(view.problem.operationId)) {
			recovered.add(view.problem.operationId);
			if (view.problem.instruction) {
				recoveryPrefixes.push(view.problem.instruction);
				// Accepted words were restored server-side while these local words
				// were still being saved. Rebase both the field and queued saves.
				if (savedLocalRevision !== localRevision) publish({ draftText: prepend([view.problem.instruction], state.draftText) });
			}
		}
		const cursorLineId = state.view?.contextId === view.contextId && view.lines.some(line => line.id === state.cursorLineId) ? state.cursorLineId : null;
		publish({ view, cursorLineId, ...(savedLocalRevision === localRevision ? { draftText: view.draft.text } : {}) });
	}
	async function post(command: NotebookCommand): Promise<NotebookCommandReceipt> {
		const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
		const body = await response.json();
		if (!response.ok) {
			// A definite refusal is safe to correct; a lost ACK retains identity.
			if (response.status < 500 && "id" in command && command.id === uncertain?.id) uncertain = null;
			throw new Error(body.error ?? "Notebook save failed");
		}
		return body;
	}
	let refreshing: Promise<void> | undefined;
	let refreshAgain = false;
	function refresh(): Promise<void> {
		if (refreshing) { refreshAgain = true; return refreshing; }
		refreshing = (async () => {
			do {
				refreshAgain = false;
				try {
					const response = await fetcher(url, { cache: "no-store" });
					const body = await response.json();
					if (!response.ok) throw new Error(body.error ?? "Notebook unavailable");
					adopt(body);
				} catch (error) { publish({ error: error instanceof Error ? error.message : "Notebook unavailable" }); }
			} while (refreshAgain);
		})().finally(() => { refreshing = undefined; });
		return refreshing;
	}
	function dispatch(command: NotebookSessionCommand, replay?: SpeechRequest): Promise<NotebookCommandReceipt> {
		const prefix = command.type === "apply" && command.speech ? command.speech.prefix : state.draftText;
		const instruction = command.type === "apply" && command.speech ? [prefix.trimEnd(), command.speech.text].filter(Boolean).join(" ") : prefix;
		const recoveryEpoch = recoveryPrefixes.length;
		if (command.type === "draft") { localRevision++; publish({ draftText: command.text }); }
		const completing = command.type === "apply" && command.speech && command.speech.draftId !== state.view?.draft.id;
		if (command.type === "apply" && command.speech && !completing) { localRevision++; publish({ draftText: "" }); }
		const revision = localRevision;
		const operationId = command.type === "apply" || command.type === "undo" || command.type === "start-fresh"
			? command.type === "apply" && command.id ? command.id : uncertain && command.type === uncertain.type && (command.type !== "apply" || revision === uncertainRevision) ? uncertain.id : crypto.randomUUID() : undefined;
		const request = operationId && state.view?.contextId && command.type !== "start-fresh" ? { id: operationId, contextId: state.view.contextId } : undefined;
		if (request) {
			if (!requestOrder.has(request.id)) requestOrder.set(request.id, requestOrder.size);
			if (!replay || command.type !== "apply" || command.speech?.draftId === state.view?.draft.id) requested.push(request);
		}
		const speechRequest = replay ?? (command.type === "apply" && command.speech && request ? { command: { ...command, id: operationId! }, contextId: request.contextId } : undefined);
		if (speechRequest && !replay) { speechRequests.push(speechRequest); stashRequests(); }
		requests++; publish({ saving: true });
		const task = tail.then(async () => {
			if (!state.view) await refresh();
			if (!state.view) throw new Error("Notebook is not loaded");
			let wire: NotebookCommand;
			if (command.type === "draft") wire = { ...command, text: prepend(recoveryPrefixes.slice(recoveryEpoch), command.text), expectedRevision: state.view.draft.revision };
			else if (command.type === "visibility" || command.type === "tutor-draft" || command.type === "snapshot" || command.type === "discard-tutor-draft" || command.type === "speech-run" || command.type === "discard-speech") wire = command;
			else {
				if (!state.view.contextId) throw new Error("Open Notebook before editing");
				if (uncertain) {
					// First reconcile the exact earlier request, never mint a duplicate.
					const isRetry = command.type === uncertain.type && (command.type !== "apply" || operationId === uncertain.id && revision === uncertainRevision && JSON.stringify(command.speech) === JSON.stringify(uncertain.type === "apply" ? uncertain.speech : undefined));
					const receipt = await post(uncertain);
					uncertain = null;
					if (isRetry) savedLocalRevision = revision;
					adopt(receipt.view);
					publish({ error: null });
					if (isRetry) { if (speechRequest) { speechRequests = speechRequests.filter(item => item !== speechRequest); stashRequests(); } return receipt; }
				}
				if (command.type === "apply") {
					if (!instruction.trim() && !command.speech) throw new Error("Enter a notebook instruction");
					if (!command.speech && state.view.draft.text !== prefix) {
						const saved = await post({ type: "draft", text: prefix, expectedRevision: state.view.draft.revision });
						adopt(saved.view);
					}
					wire = speechRequest?.wire ?? { type: "apply", id: operationId!, contextId: speechRequest?.contextId ?? state.view.contextId!, draftRevision: state.view.draft.revision, instruction, cursorLineId: command.cursorLineId, ...(command.speech ? { speech: command.speech } : {}) };
					if (speechRequest) { speechRequest.wire = wire; stashRequests(); }
				} else wire = { type: command.type, id: operationId!, contextId: state.view.contextId };
				uncertain = wire;
				uncertainRevision = revision;
			}
			const receipt = await post(wire);
			if (speechRequest) { speechRequests = speechRequests.filter(item => item !== speechRequest); stashRequests(); }
			if ("id" in wire && wire.id === uncertain?.id) uncertain = null;
			if (command.type === "draft" || command.type === "apply") savedLocalRevision = revision;
			adopt(receipt.view); publish({ error: null });
			return receipt;
		}).catch((error: unknown) => {
			publish({ error: error instanceof Error ? error.message : "Notebook save failed" });
			throw error;
		}).finally(() => { if (request && requested.includes(request)) requested.splice(requested.indexOf(request), 1); requests--; publish({ saving: requests > 0 }); });
		tail = task.catch(() => {});
		return task;
	}
	let storage = recoveryStorage;
	try { storage ??= typeof window === "undefined" ? undefined : window.localStorage; } catch { /* server saves still work */ }
	const tutor = createNotebookTutorDrafts(chatId, dispatch, refresh, storage, () => {
		const latest = requested.reduce<typeof requested[number] | undefined>((last, item) => !last || requestOrder.get(item.id)! > requestOrder.get(last.id)! ? item : last, undefined);
		const saved = state.view?.lastOperationId;
		return latest && (!saved || (requestOrder.get(saved) ?? -1) <= requestOrder.get(latest.id)!) ? latest : undefined;
	});
	const speech = createNotebookSpeech(chatId, { tutor, dispatch, getSnapshot: () => state }, storage);
	return {
		tutor, speech,
		getSnapshot: () => state,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		dispatch, refresh,
		selectLine(cursorLineId: string) { if (state.view?.lines.some(line => line.id === cursorLineId)) publish({ cursorLineId }); },
		async idle() { await tail; },
		dispose() { listeners.clear(); tutor.dispose(); },
	};
}
export type NotebookSession = ReturnType<typeof createNotebookSession>;
