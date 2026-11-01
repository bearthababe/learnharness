import type { NotebookCommand, NotebookCommandReceipt, NotebookView } from "@/src/core";
import { createNotebookTutorDrafts, type DraftRecoveryStorage } from "./notebook-tutor-drafts";

export type NotebookSessionCommand =
	| { type: "visibility"; visible: boolean }
	| { type: "draft"; text: string }
	| { type: "apply"; cursorLineId?: string | null }
	| Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" }>
	| { type: "undo" | "start-fresh" };
export interface NotebookSessionSnapshot {
	view: NotebookView | null;
	draftText: string;
	saving: boolean;
	error: string | null;
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
		if (view.problem && !recovered.has(view.problem.operationId)) {
			recovered.add(view.problem.operationId);
			if (view.problem.instruction) {
				recoveryPrefixes.push(view.problem.instruction);
				// Accepted words were restored server-side while these local words
				// were still being saved. Rebase both the field and queued saves.
				if (savedLocalRevision !== localRevision) publish({ draftText: prepend([view.problem.instruction], state.draftText) });
			}
		}
		publish({ view, ...(savedLocalRevision === localRevision ? { draftText: view.draft.text } : {}) });
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
	async function refresh() {
		try {
			const response = await fetcher(url, { cache: "no-store" });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error ?? "Notebook unavailable");
			adopt(body);
		} catch (error) { publish({ error: error instanceof Error ? error.message : "Notebook unavailable" }); }
	}
	function dispatch(command: NotebookSessionCommand): Promise<NotebookCommandReceipt> {
		const instruction = state.draftText;
		const recoveryEpoch = recoveryPrefixes.length;
		if (command.type === "draft") { localRevision++; publish({ draftText: command.text }); }
		const revision = localRevision;
		requests++; publish({ saving: true });
		const task = tail.then(async () => {
			if (!state.view) await refresh();
			if (!state.view) throw new Error("Notebook is not loaded");
			let wire: NotebookCommand;
			if (command.type === "draft") wire = { ...command, text: prepend(recoveryPrefixes.slice(recoveryEpoch), command.text), expectedRevision: state.view.draft.revision };
			else if (command.type === "visibility" || command.type === "tutor-draft" || command.type === "snapshot") wire = command;
			else {
				if (!state.view.contextId) throw new Error("Open Notebook before editing");
				if (uncertain) {
					// First reconcile the exact earlier request, never mint a duplicate.
					const isRetry = command.type === uncertain.type && (command.type !== "apply" || revision === uncertainRevision);
					const receipt = await post(uncertain);
					uncertain = null;
					if (isRetry) savedLocalRevision = revision;
					adopt(receipt.view);
					publish({ error: null });
					if (isRetry) return receipt;
				}
				if (command.type === "apply") {
					if (!instruction.trim()) throw new Error("Enter a notebook instruction");
					if (state.view.draft.text !== instruction) {
						const saved = await post({ type: "draft", text: instruction, expectedRevision: state.view.draft.revision });
						adopt(saved.view);
					}
					wire = { type: "apply", id: crypto.randomUUID(), contextId: state.view.contextId!, draftRevision: state.view.draft.revision, instruction, cursorLineId: command.cursorLineId };
				} else wire = { type: command.type, id: crypto.randomUUID(), contextId: state.view.contextId };
				uncertain = wire;
				uncertainRevision = revision;
			}
			const receipt = await post(wire);
			if ("id" in wire && wire.id === uncertain?.id) uncertain = null;
			if (command.type === "draft" || command.type === "apply") savedLocalRevision = revision;
			adopt(receipt.view); publish({ error: null });
			return receipt;
		}).catch((error: unknown) => {
			publish({ error: error instanceof Error ? error.message : "Notebook save failed" });
			throw error;
		}).finally(() => { requests--; publish({ saving: requests > 0 }); });
		tail = task.catch(() => {});
		return task;
	}
	let storage = recoveryStorage;
	try { storage ??= typeof window === "undefined" ? undefined : window.localStorage; } catch { /* server saves still work */ }
	const tutor = createNotebookTutorDrafts(chatId, dispatch, refresh, storage);
	return {
		tutor,
		getSnapshot: () => state,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		dispatch, refresh,
		async idle() { await tail; },
		dispose() { listeners.clear(); tutor.dispose(); },
	};
}
export type NotebookSession = ReturnType<typeof createNotebookSession>;
