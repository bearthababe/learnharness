import { explanationHasContent, sameDraftOwner, ownedTutorDraftSchema, type ChatInput, type NotebookCommand, type NotebookCommandReceipt, type NotebookView, type OwnedTutorDraft, type TutorDraftOwner } from "@/src/core";

export type DraftRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DraftCommand = Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" }>;
type PreparedInput = Extract<ChatInput, { type: "text" }>;
interface Entry {
	draft: OwnedTutorDraft;
	base: OwnedTutorDraft | null;
	dirty: boolean;
	wire?: DraftCommand;
	frozen?: PreparedInput;
	conflict?: boolean;
	capture?: { before: OwnedTutorDraft; command: Extract<DraftCommand, { type: "snapshot" }> };
}
export interface TutorDraftSnapshot {
	drafts: OwnedTutorDraft[];
	recovery: OwnedTutorDraft[];
	saving: boolean;
	error: string | null;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (owner: TutorDraftOwner) => owner.kind === "ordinary" ? "ordinary" : owner.kind === "question" ? `question:${owner.toolCallId}:${owner.channel}` : `practice:${owner.problemCallId}`;

/** Durable learner drafts are an optional notebook adapter, not a replacement
 * for the ordinary text composer. No mutation here authorizes a Tutor send. */
export function createNotebookTutorDrafts(chatId: string, post: (command: DraftCommand) => Promise<NotebookCommandReceipt>, refresh: () => Promise<void>, storage?: DraftRecoveryStorage) {
	const entries = new Map<string, Entry>();
	const listeners = new Set<() => void>();
	const storageKey = `lh:notebook-drafts:${chatId}`;
	let loaded = false;
	let tail: Promise<unknown> = Promise.resolve();
	let saving = 0;
	let view: NotebookView | null = null;
	let state: TutorDraftSnapshot = { drafts: [], recovery: [], saving: false, error: null };
	function publish(error: string | null = state.error) {
		state = { drafts: [...entries.values()].flatMap((entry) => entry.conflict ? view?.tutorDrafts?.filter((draft) => sameDraftOwner(draft.owner, entry.draft.owner)) ?? [] : [entry.draft]), recovery: [...entries.values()].filter((entry) => entry.conflict).map((entry) => entry.draft), saving: saving > 0, error };
		for (const listener of listeners) listener();
	}
	function stash() {
		try {
			const retained = [...entries].filter(([, entry]) => entry.dirty || entry.wire || entry.frozen || entry.conflict || entry.capture);
			if (retained.length) storage?.setItem(storageKey, JSON.stringify(retained)); else storage?.removeItem(storageKey);
		} catch { publish("Local draft recovery could not be saved. Keep this page open until the server save succeeds."); }
	}
	function load() {
		if (loaded) return;
		loaded = true;
		try {
			const raw = storage?.getItem(storageKey);
			if (!raw) return;
			for (const [key, entry] of JSON.parse(raw) as Array<[string, Entry]>) {
				ownedTutorDraftSchema.parse(entry.draft);
				entries.set(key, entry);
			}
		} catch { publish("Saved local draft recovery could not be read."); }
	}
	function adopt(next: NotebookView) {
		view = next;
		const hydrating = !loaded;
		load();
		let confirmed = false;
		for (const [key, entry] of entries) {
			const remote = next.tutorDrafts?.find((draft) => sameDraftOwner(draft.owner, entry.draft.owner)) ?? null;
			if (entry.frozen && next.submissions?.some((receipt) => receipt.submission.id === entry.frozen!.submission?.id)) {
				confirmed = true;
				if (equal(entry.draft.parts, entry.frozen.explanation)) { entries.delete(key); continue; }
				entry.base = remote; entry.frozen = undefined; entry.wire = undefined; entry.dirty = true;
				void queue(() => flush(entry.draft.owner)).catch(() => {});
			}
			if (entry.wire?.type === "tutor-draft" && equal(remote, entry.wire.draft)) {
				entry.base = remote;
				entry.dirty = !!entry.capture || !equal(entry.draft.parts, remote!.parts);
				if (!entry.dirty) entry.draft = remote!;
				entry.wire = undefined;
			}
			if (entry.wire?.type === "tutor-draft" && !equal(remote, entry.base)) entry.conflict = true;
			if (!entry.dirty && !entry.wire && !entry.frozen && !entry.capture) {
				if (remote) { entry.draft = remote; entry.base = remote; } else entries.delete(key);
			} else if (!entry.wire && !equal(remote, entry.base)) {
				entry.conflict = true;
			}
		}
		for (const draft of next.tutorDrafts ?? []) {
			const key = keyOf(draft.owner);
			if (!entries.has(key)) entries.set(key, { draft, base: draft, dirty: false });
		}
		stash(); publish([...entries.values()].some((entry) => entry.conflict) ? "A newer saved draft exists. Your local copy is retained below for review." : confirmed ? null : state.error);
		if (hydrating) for (const entry of entries.values()) {
			if (!entry.conflict && !entry.frozen && (entry.dirty || entry.wire || entry.capture)) void queue(() => flush(entry.draft.owner)).catch(() => {});
		}
	}
	function queue<T>(work: () => Promise<T>): Promise<T> {
		saving++; publish();
		const task = tail.then(work).catch((error: unknown) => { publish(error instanceof Error ? error.message : "Tutor draft could not be saved"); throw error; }).finally(() => { saving--; publish(); });
		tail = task.catch(() => {});
		return task;
	}
	async function flush(owner: TutorDraftOwner) {
		if (!view) await refresh();
		const entry = entries.get(keyOf(owner));
		if (!entry) return;
		if (entry.conflict) throw new Error("Review the retained local copy before changing the newer saved draft.");
		if (entry.frozen) throw new Error("Confirm the earlier submission before saving newer changes.");
		if (entry.wire) {
			const wire = entry.wire;
			const receipt = await post(wire);
			const remote = receipt.view.tutorDrafts?.find((draft) => sameDraftOwner(draft.owner, owner)) ?? null;
			entry.base = remote; entry.wire = undefined;
			if (wire.type === "tutor-draft" && remote && equal(entry.draft.parts, wire.draft.parts)) { entry.draft = remote; entry.dirty = false; }
			if (wire.type === "snapshot" && remote) captured(entry, remote);
			stash();
		}
		if (entry.capture) {
			const capture = entry.capture;
			if (!equal(entry.base?.parts, capture.before.parts)) await save(entry, capture.before);
			entry.wire = { ...capture.command, expectedRevision: entry.base!.revision };
			stash();
			const receipt = await post(entry.wire);
			const remote = receipt.view.tutorDrafts!.find((draft) => sameDraftOwner(draft.owner, owner))!;
			captured(entry, remote);
			stash(); publish(null);
		}
		if (entry.dirty) await save(entry, entry.draft);
	}
	function captured(entry: Entry, remote: OwnedTutorDraft) {
		entry.base = remote; entry.wire = undefined; entry.capture = undefined;
		entry.draft = { ...remote, parts: remote.parts.map((part) => part.kind === "text" ? entry.draft.parts.find((local) => local.id === part.id) ?? part : part) };
		entry.dirty = !equal(entry.draft.parts, remote.parts);
	}
	async function save(entry: Entry, desired: OwnedTutorDraft) {
		const draft = structuredClone({ ...desired, revision: (entry.base?.revision ?? 0) + 1 });
		entry.wire = { type: "tutor-draft", expectedRevision: entry.base?.revision ?? 0, draft };
		stash();
		const receipt = await post(entry.wire);
		entry.base = receipt.view.tutorDrafts?.find((item) => sameDraftOwner(item.owner, desired.owner)) ?? null;
		entry.wire = undefined;
		if (!entry.capture && equal(entry.draft.parts, draft.parts)) { entry.draft = entry.base!; entry.dirty = false; }
		stash(); publish(null);
	}
	function updateText(owner: TutorDraftOwner, text: string, partId?: string) {
		load();
		const key = keyOf(owner);
		let entry = entries.get(key);
		if (entry?.conflict) return;
		if (!entry) {
			entry = { draft: { id: crypto.randomUUID(), owner, revision: 0, parts: [{ id: crypto.randomUUID(), kind: "text", text: "" }] }, base: null, dirty: false };
			entries.set(key, entry);
		}
		const draft = structuredClone(entry.draft);
		const part = partId ? draft.parts.find((part) => part.id === partId) : draft.parts.at(-1);
		if (!part || part.kind !== "text") throw new Error("No editable continuation");
		part.text = text;
		entry.draft = draft; entry.dirty = true;
		stash(); publish();
		void queue(() => flush(owner)).catch(() => {});
	}
	function returnToTutor(owner: TutorDraftOwner) {
		const entry = entries.get(keyOf(owner));
		if (!entry || !view?.contextId || entry.capture) return queue(() => flush(owner));
		if (view.pending) {
			publish("Notebook edit is pending. Return to Tutor again when it has settled.");
			return Promise.resolve();
		}
		const last = entry.draft.parts.filter((part) => part.kind === "working").at(-1);
		if (!view.lines.length || (last?.kind === "working" && last.contextId === view.contextId && last.revision === view.workingRevision)) return queue(() => flush(owner));
		const command: Extract<DraftCommand, { type: "snapshot" }> = { type: "snapshot", id: crypto.randomUUID(), owner, draftId: entry.draft.id, expectedRevision: entry.base?.revision ?? 0, continuationId: crypto.randomUUID(), contextId: view.contextId, workingRevision: view.workingRevision };
		entry.capture = { before: structuredClone(entry.draft), command };
		// Reserve the settled position synchronously, before a keystroke or save
		// can move continuation prose ahead of working. Pending cutoffs are #25.
		entry.draft = { ...entry.draft, parts: [...entry.draft.parts,
			{ id: command.id, kind: "working", snapshotId: command.id, contextId: view.contextId, revision: view.workingRevision, lines: structuredClone(view.lines) },
			{ id: command.continuationId, kind: "text", text: "" }] };
		entry.dirty = true;
		stash(); publish();
		return queue(() => flush(owner));
	}
	function prepareSubmission(owner: TutorDraftOwner): Promise<PreparedInput> {
		return queue(async () => {
			await refresh();
			let entry = entries.get(keyOf(owner));
			if (entry?.frozen) return structuredClone(entry.frozen);
			await flush(owner);
			entry = entries.get(keyOf(owner));
			if (!entry || !explanationHasContent(entry.draft.parts)) throw new Error("Enter an explanation or notebook working");
			const draft = entry.base!;
			entry.frozen = { type: "text", text: draft.parts.filter((part) => part.kind === "text").map((part) => part.text).filter(Boolean).join("\n\n"), explanation: structuredClone(draft.parts), submission: { id: crypto.randomUUID(), draftId: draft.id, draftRevision: draft.revision, owner } };
			stash(); publish(null);
			return structuredClone(entry.frozen);
		});
	}
	return {
		getSnapshot: () => state,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		draft(owner: TutorDraftOwner) { return entries.get(keyOf(owner))?.draft; },
		adopt, updateText, returnToTutor, prepareSubmission,
		async reconcile() { await refresh(); },
		async idle() { await tail; },
		dispose() { listeners.clear(); },
	};
}
