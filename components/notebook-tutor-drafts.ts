import { explanationHasContent, sameDraftOwner, ownedTutorDraftSchema, type QuestionAnswerData, type ChatInput, type NotebookCommand, type NotebookCommandReceipt, type NotebookView, type OwnedTutorDraft, type TutorDraftOwner } from "@/src/core";

export type DraftRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DraftCommand = Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" }>;
type PreparedInput = Extract<ChatInput, { type: "text" }>;
interface Entry {
	draft: OwnedTutorDraft;
	base: OwnedTutorDraft | null;
	dirty: boolean;
	wire?: DraftCommand;
	frozen?: PreparedInput | Extract<ChatInput, { type: "answer" }>;
	frozenDraft?: OwnedTutorDraft;
	preparing?: OwnedTutorDraft;
	conflict?: boolean;
	capture?: { before: OwnedTutorDraft; command: Extract<DraftCommand, { type: "snapshot" }> };
}
export interface TutorDraftSnapshot {
	drafts: OwnedTutorDraft[];
	recovery: OwnedTutorDraft[];
	saving: boolean;
	error: string | null;
}
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sameContent = (a: OwnedTutorDraft, b: OwnedTutorDraft) => equal(a.parts, b.parts) && equal(a.form, b.form);
const keyOf = (owner: TutorDraftOwner) => owner.kind === "ordinary" ? "ordinary" : owner.kind === "question" ? `question:${owner.toolCallId}:${owner.channel}` : `practice:${owner.problemCallId}`;

/** Durable learner drafts are an optional notebook adapter, not a replacement
 * for the ordinary text composer. No mutation here authorizes a Tutor send. */
export function createNotebookTutorDrafts(chatId: string, post: (command: DraftCommand | Extract<NotebookCommand, { type: "discard-tutor-draft" }>) => Promise<NotebookCommandReceipt>, refresh: () => Promise<void>, storage?: DraftRecoveryStorage) {
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
				entry.preparing = undefined; // no request existed before a frozen input
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
				if (entry.frozenDraft ? sameContent(entry.draft, entry.frozenDraft) : entry.frozen.type === "text" && equal(entry.draft.parts, entry.frozen.explanation)) { entries.delete(key); continue; }
				entry.base = remote; entry.frozen = undefined; entry.frozenDraft = undefined; entry.wire = undefined; entry.dirty = true;
				void queue(() => flush(entry.draft.owner)).catch(() => {});
			}
			if (entry.wire?.type === "tutor-draft" && equal(remote, entry.wire.draft)) {
				entry.base = remote;
				entry.dirty = !!entry.capture || !sameContent(entry.draft, remote!);
				if (!entry.dirty) entry.draft = remote!;
				entry.wire = undefined;
			}
			if (entry.wire?.type === "tutor-draft" && !equal(remote, entry.base)) entry.conflict = true;
			if (!entry.dirty && !entry.wire && !entry.frozen && !entry.capture && !entry.preparing) {
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
			if (wire.type === "tutor-draft" && remote && sameContent(entry.draft, wire.draft)) { entry.draft = remote; entry.dirty = false; }
			if (wire.type === "snapshot" && remote) captured(entry, remote);
			stash();
		}
		if (entry.capture) {
			const capture = entry.capture;
			if (!entry.base || !sameContent(entry.base, capture.before)) await save(entry, capture.before);
			entry.wire = { ...capture.command, expectedRevision: entry.base!.revision };
			stash();
			const receipt = await post(entry.wire);
			const remote = receipt.view.tutorDrafts!.find((draft) => sameDraftOwner(draft.owner, owner))!;
			captured(entry, remote);
			stash(); publish(null);
		}
		const desired = entry.preparing ?? entry.draft;
		if (!entry.base || !sameContent(entry.base, desired)) await save(entry, desired);
	}
	function captured(entry: Entry, remote: OwnedTutorDraft) {
		entry.base = remote; entry.wire = undefined; entry.capture = undefined;
		entry.draft = { ...remote, ...(entry.draft.form ? { form: entry.draft.form } : {}), parts: remote.parts.map((part) => part.kind === "text" ? entry.draft.parts.find((local) => local.id === part.id) ?? part : part) };
		entry.dirty = !sameContent(entry.draft, remote);
	}
	async function save(entry: Entry, desired: OwnedTutorDraft) {
		const draft = structuredClone({ ...desired, revision: (entry.base?.revision ?? 0) + 1 });
		entry.wire = { type: "tutor-draft", expectedRevision: entry.base?.revision ?? 0, draft };
		stash();
		const receipt = await post(entry.wire);
		entry.base = receipt.view.tutorDrafts?.find((item) => sameDraftOwner(item.owner, desired.owner)) ?? null;
		entry.wire = undefined;
		if (!entry.capture && sameContent(entry.draft, draft)) { entry.draft = entry.base!; entry.dirty = false; }
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
	function updateForm(owner: Extract<TutorDraftOwner, { kind: "question" }>, form: NonNullable<OwnedTutorDraft["form"]>) {
		const text = owner.channel === "text" ? form.text : form.thinking;
		if (!entries.has(keyOf(owner))) updateText(owner, text);
		const entry = entries.get(keyOf(owner))!;
		if (entry.conflict) return;
		entry.draft = structuredClone({ ...entry.draft, form });
		const last = entry.draft.parts.at(-1);
		if (last?.kind === "text") last.text = text;
		entry.dirty = true; stash(); publish();
		void queue(() => flush(owner)).catch(() => {});
	}
	function prepareSubmission(owner: TutorDraftOwner): Promise<PreparedInput> {
		return queue(async () => {
			await refresh();
			let entry = entries.get(keyOf(owner));
			if (entry?.frozen) {
				if (entry.frozen.type !== "text") throw new Error("Confirm the earlier answer before sending this draft");
				return structuredClone(entry.frozen);
			}
			await flush(owner);
			entry = entries.get(keyOf(owner));
			if (!entry || !explanationHasContent(entry.draft.parts)) throw new Error("Enter an explanation or notebook working");
			const draft = entry.base!;
			entry.frozen = { type: "text", text: draft.parts.filter((part) => part.kind === "text").map((part) => part.text).filter(Boolean).join("\n\n"), explanation: structuredClone(draft.parts), submission: { id: crypto.randomUUID(), draftId: draft.id, draftRevision: draft.revision, owner } };
			stash(); publish(null);
			return structuredClone(entry.frozen);
		});
	}
	function prepareAnswer(owner: Extract<TutorDraftOwner, { kind: "question" }>, answer: QuestionAnswerData): Promise<Extract<ChatInput, { type: "answer" }>> {
		const owners = [owner, ...(owner.channel === "reading-thinking" ? [] : [{ ...owner, channel: "reading-thinking" as const }])];
		// Reserve exactly the complete fields observed by this Send before queued
		// autosaves or an awaited refresh give later typing a chance to replace them.
		for (const owner of owners) {
			const entry = entries.get(keyOf(owner));
			if (entry && !entry.frozen && !entry.preparing) entry.preparing = structuredClone(entry.draft);
		}
		return queue(async () => {
			try {
			await refresh();
			const frozen = owners.map(owner => entries.get(keyOf(owner))?.frozen).find(Boolean);
			if (frozen) {
				if (frozen.type !== "answer") throw new Error("Confirm the earlier submission before sending this answer");
				return structuredClone(frozen);
			}
			for (const owner of owners) await flush(owner);
			const included = owners.flatMap(owner => { const entry = entries.get(keyOf(owner)); return entry?.base ? [entry] : []; });
			const input: Extract<ChatInput, { type: "answer" }> = { type: "answer", toolCallId: owner.toolCallId, answer: structuredClone(answer) };
			if (!included.length) return input;
			const refs = included.map(entry => ({ draftId: entry.base!.id, draftRevision: entry.base!.revision, owner: entry.base!.owner }));
			input.submission = { id: crypto.randomUUID(), ...refs[0]!, ...(refs.length > 1 ? { additionalDrafts: refs.slice(1) } : {}) };
			for (const entry of included) {
				const draft = entry.base!;
				if (draft.owner.kind !== "question") throw new Error("Question owner required");
				const channel = draft.owner.channel;
				const field = channel === "text" ? "textContent" : channel === "thinking" ? "thinkingContent" : "readingThinkingContent";
				const compatibility = channel === "reading-thinking" ? "readingThinking" : channel;
				input.answer[field] = structuredClone(draft.parts);
				input.answer[compatibility] = draft.parts.filter(part => part.kind === "text").map(part => part.text).filter(Boolean).join("\n\n") || undefined;
			}
			for (const entry of included) { entry.frozen = input; entry.frozenDraft = structuredClone(entry.base!); }
			stash(); publish(null);
			return structuredClone(input);
			} finally {
				for (const owner of owners) { const entry = entries.get(keyOf(owner)); if (entry) entry.preparing = undefined; }
			}
		});
	}
	return {
		getSnapshot: () => state,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		draft(owner: TutorDraftOwner) { return entries.get(keyOf(owner))?.draft; },
		adopt, updateText, updateForm, returnToTutor, prepareSubmission, prepareAnswer,
		discard(owner: TutorDraftOwner) {
			return queue(async () => {
				const entry = entries.get(keyOf(owner));
				if (!entry) return;
				const base = entry.base;
				if (base) await post({ type: "discard-tutor-draft", owner, draftId: base.id, expectedRevision: base.revision });
				entries.delete(keyOf(owner)); stash(); publish(null);
			});
		},
		async reconcile() { await refresh(); },
		async idle() { await tail; },
		dispose() { listeners.clear(); },
	};
}
