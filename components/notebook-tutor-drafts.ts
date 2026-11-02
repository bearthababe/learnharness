import { explanationHasContent, sameDraftOwner, ownedTutorDraftSchema, type QuestionAnswerData, type NotebookInputFields, type NotebookCommand, type NotebookCommandReceipt, type NotebookView, type OwnedTutorDraft, type TutorDraftOwner } from "@/src/core";

export type DraftRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DraftCommand = Extract<NotebookCommand, { type: "tutor-draft" | "snapshot" }>;
export type PreparedNotebookContent = { text: string } & Required<NotebookInputFields>;
export type PreparedNotebookAnswer = { answer: QuestionAnswerData } & Pick<NotebookInputFields, "submission">;
type FrozenContent = { kind: "content"; content: PreparedNotebookContent } | { kind: "answer"; content: PreparedNotebookAnswer };
interface Entry {
	draft: OwnedTutorDraft;
	base: OwnedTutorDraft | null;
	dirty: boolean;
	wire?: DraftCommand;
	frozen?: FrozenContent;
	frozenDraft?: OwnedTutorDraft;
	preparing?: OwnedTutorDraft;
	conflict?: boolean;
	capture?: { before: OwnedTutorDraft; command: Extract<DraftCommand, { type: "snapshot" }> };
	nextCaptures?: NonNullable<Entry["capture"]>[];
}
export interface TutorDraftSnapshot {
	drafts: OwnedTutorDraft[];
	recovery: OwnedTutorDraft[];
	saving: boolean;
	error: string | null;
	waitingForWorking?: boolean;
}
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sameContent = (a: OwnedTutorDraft, b: OwnedTutorDraft) => equal(a.parts, b.parts) && equal(a.form, b.form);
const keyOf = (owner: TutorDraftOwner) => owner.kind === "ordinary" ? "ordinary" : owner.kind === "question" ? `question:${owner.toolCallId}:${owner.channel}` : `practice:${owner.problemCallId}`;

/** Durable learner drafts are an optional notebook adapter, not a replacement
 * for the ordinary text composer. No mutation here authorizes a Tutor send. */
export function createNotebookTutorDrafts(chatId: string, post: (command: DraftCommand | Extract<NotebookCommand, { type: "discard-tutor-draft" }>) => Promise<NotebookCommandReceipt>, refresh: () => Promise<void>, storage?: DraftRecoveryStorage, requestedCutoff?: () => { id: string; contextId: string } | undefined) {
	const entries = new Map<string, Entry>();
	const listeners = new Set<() => void>();
	const cancelWaiters = new Set<() => void>();
	let disposed = false;
	const storageKey = `lh:notebook-drafts:${chatId}`;
	let loaded = false;
	let tail: Promise<unknown> = Promise.resolve();
	let saving = 0;
	let waitingForWorking = 0;
	let view: NotebookView | null = null;
	let state: TutorDraftSnapshot = { drafts: [], recovery: [], saving: false, error: null };
	function publish(error: string | null = state.error) {
		state = { drafts: [...entries.values()].flatMap((entry) => entry.conflict ? view?.tutorDrafts?.filter((draft) => sameDraftOwner(draft.owner, entry.draft.owner)) ?? [] : [entry.draft]), recovery: [...entries.values()].filter((entry) => entry.conflict).map((entry) => entry.draft), saving: saving > 0, waitingForWorking: waitingForWorking > 0, error };
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
			for (const [key, saved] of JSON.parse(raw) as Array<[string, Omit<Entry, "frozen"> & { frozen?: FrozenContent | ({ type: "text" } & PreparedNotebookContent) | ({ type: "answer"; toolCallId: string } & PreparedNotebookAnswer) }]>) {
				ownedTutorDraftSchema.parse(saved.draft);
				// Older recovery stored native-shaped requests. Keep their content and
				// receipt exactly, but let the current Tutor adapter choose its action.
				const frozen = saved.frozen;
				const entry: Entry = { ...saved, frozen: !frozen || "kind" in frozen ? frozen : frozen.type === "text"
						? { kind: "content", content: { text: frozen.text, explanation: frozen.explanation, submission: frozen.submission } }
						: { kind: "answer", content: { answer: frozen.answer, submission: frozen.submission } } };
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
			// Server-owned pending working resolves without changing learner text.
			// Rebase just that reserved content, including a Send already waiting.
			if (remote && entry.base && entry.wire?.type !== "snapshot" && remote.revision > entry.base.revision) {
				const previous = entry.base;
				const comparison = { ...remote, revision: previous.revision, parts: remote.parts.map(part => {
					const before = previous.parts.find(item => item.id === part.id);
					return part.kind === "working" && before?.kind === "working" && before.pending ? before : part;
				}) };
				if (equal(comparison, previous)) {
					const resolved = (draft: OwnedTutorDraft) => ({ ...draft, parts: draft.parts.map(part => part.kind === "working" && part.pending ? remote.parts.find(item => item.id === part.id) ?? part : part) });
					entry.base = remote;
					entry.draft = resolved(entry.draft);
					if (entry.preparing) entry.preparing = resolved(entry.preparing);
					for (const capture of [entry.capture, ...entry.nextCaptures ?? []]) if (capture) capture.before = resolved(capture.before);
					if (entry.wire?.type === "tutor-draft") entry.wire = { type: "tutor-draft", expectedRevision: remote.revision, draft: { ...resolved(entry.wire.draft), revision: remote.revision + 1 } };
				}
			}
			if (entry.frozen && next.submissions?.some((receipt) => receipt.submission.id === entry.frozen!.content.submission?.id)) {
				confirmed = true;
				if (entry.frozenDraft ? sameContent(entry.draft, entry.frozenDraft) : entry.frozen.kind === "content" && equal(entry.draft.parts, entry.frozen.content.explanation)) { entries.delete(key); continue; }
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
	async function deliver(entry: Entry, wire: DraftCommand): Promise<{ receipt: NotebookCommandReceipt; wire: DraftCommand }> {
		try { return { receipt: await post(wire), wire }; }
		catch (error) {
			await refresh();
			// Only a proven server-owned working resolution can replace this wire.
			// Ordinary competing text remains a conflict, never an automatic retry.
			if (!entry.conflict && entry.wire && entry.wire !== wire) return deliver(entry, entry.wire);
			throw error;
		}
	}
	async function flush(owner: TutorDraftOwner) {
		if (!view) await refresh();
		const entry = entries.get(keyOf(owner));
		if (!entry) return;
		if (entry.conflict) throw new Error("Review the retained local copy before changing the newer saved draft.");
		if (entry.frozen) throw new Error("Confirm the earlier submission before saving newer changes.");
		if (entry.wire) {
			const { wire, receipt } = await deliver(entry, entry.wire);
			const remote = receipt.view.tutorDrafts?.find((draft) => sameDraftOwner(draft.owner, owner)) ?? null;
			entry.base = remote; entry.wire = undefined;
			if (wire.type === "tutor-draft" && remote && sameContent(entry.draft, wire.draft)) { entry.draft = remote; entry.dirty = false; }
			if (wire.type === "snapshot" && remote) captured(entry, remote);
			stash();
		}
		while (entry.capture) {
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
		const resolved = (draft: OwnedTutorDraft) => ({ ...draft, parts: draft.parts.map(part => part.kind === "working" ? remote.parts.find(item => item.id === part.id) ?? part : part) });
		entry.base = remote; entry.wire = undefined; entry.capture = entry.nextCaptures?.shift();
		entry.draft = { ...resolved(entry.draft), revision: remote.revision };
		for (const capture of [entry.capture, ...entry.nextCaptures ?? []]) if (capture) capture.before = resolved(capture.before);
		entry.dirty = !sameContent(entry.draft, remote);
	}
	async function save(entry: Entry, desired: OwnedTutorDraft) {
		const draft = structuredClone({ ...desired, revision: (entry.base?.revision ?? 0) + 1 });
		entry.wire = { type: "tutor-draft", expectedRevision: entry.base?.revision ?? 0, draft };
		stash();
		const { receipt, wire } = await deliver(entry, entry.wire);
		entry.base = receipt.view.tutorDrafts?.find((item) => sameDraftOwner(item.owner, desired.owner)) ?? null;
		entry.wire = undefined;
		if (!entry.capture && wire.type === "tutor-draft" && sameContent(entry.draft, wire.draft)) { entry.draft = entry.base!; entry.dirty = false; }
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
		if (!entry || !view?.contextId) return queue(() => flush(owner));
		const requested = requestedCutoff?.();
		const throughOperationId = requested?.contextId === view.contextId ? requested.id : view.lastOperationId;
		const pending = !!view.pending || !!requested && requested.contextId === view.contextId;
		const reserved = entry.nextCaptures?.at(-1) ?? entry.capture;
		if (reserved && reserved.command.throughOperationId === throughOperationId) return queue(() => flush(owner));
		const last = entry.draft.parts.filter((part) => part.kind === "working").at(-1);
		const lastSnapshot = last?.kind === "working" ? view.snapshots?.find(snapshot => snapshot.id === last.snapshotId) : undefined;
		if (throughOperationId && lastSnapshot?.throughOperationId === throughOperationId || !pending && !view.problem && (!view.lines.length || (last?.kind === "working" && !last.pending && last.contextId === view.contextId && last.revision === view.workingRevision))) return queue(() => flush(owner));
		const command: Extract<DraftCommand, { type: "snapshot" }> = { type: "snapshot", id: crypto.randomUUID(), owner, draftId: entry.draft.id, expectedRevision: entry.base?.revision ?? 0, continuationId: crypto.randomUUID(), contextId: view.contextId,
			...(throughOperationId ? { throughOperationId } : { workingRevision: view.workingRevision }) };
		const capture = { before: structuredClone(entry.draft), command };
		if (entry.capture) (entry.nextCaptures ??= []).push(capture); else entry.capture = capture;
		// Reserve the settled position synchronously, before a keystroke or save
		// can move continuation prose ahead of working, even across rapid returns.
		entry.draft = { ...entry.draft, parts: [...entry.draft.parts,
			{ id: command.id, kind: "working", snapshotId: command.id, contextId: view.contextId, revision: view.workingRevision, lines: structuredClone(view.lines), ...(pending ? { pending: true as const } : {}) },
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
	function prepareSubmission(owner: TutorDraftOwner): Promise<PreparedNotebookContent> {
		const reserving = entries.get(keyOf(owner));
		if (reserving && !reserving.frozen && !reserving.preparing) reserving.preparing = structuredClone(reserving.draft);
		return queue(async () => {
			try {
			await refresh();
			let entry = entries.get(keyOf(owner));
			if (entry?.frozen) {
				if (entry.frozen.kind !== "content") throw new Error("Confirm the earlier answer before sending this draft");
				return structuredClone(entry.frozen.content);
			}
			await flush(owner);
			await waitForWorking([owner]);
			entry = entries.get(keyOf(owner));
			if (!entry || !explanationHasContent(entry.draft.parts)) throw new Error("Enter an explanation or notebook working");
			const draft = entry.base!;
			entry.frozen = { kind: "content", content: { text: draft.parts.filter((part) => part.kind === "text").map((part) => part.text).filter(Boolean).join("\n\n"), explanation: structuredClone(draft.parts), submission: { id: crypto.randomUUID(), draftId: draft.id, draftRevision: draft.revision, owner } } };
			stash(); publish(null);
			return structuredClone(entry.frozen.content);
			} finally { const entry = entries.get(keyOf(owner)); if (entry) entry.preparing = undefined; }
		});
	}
	async function waitForWorking(owners: TutorDraftOwner[]) {
		if (disposed) throw new Error("Send cancelled after leaving this session. The draft is retained.");
		const pending = owners.flatMap(owner => entries.get(keyOf(owner))?.draft.parts.filter(part => part.kind === "working" && part.pending).map(part => part.id) ?? []);
		if (!pending.length) return;
		waitingForWorking++; publish();
		try {
			await new Promise<void>((resolve, reject) => {
				const cancel = () => { listeners.delete(check); cancelWaiters.delete(cancel); reject(new Error("Send cancelled after leaving this session. The draft is retained.")); };
				const check = () => {
					const snapshots = pending.map(id => view?.snapshots?.find(snapshot => snapshot.id === id));
					if (snapshots.some(snapshot => !snapshot || snapshot.status === "pending")) return;
					listeners.delete(check);
					cancelWaiters.delete(cancel);
					if (snapshots.some(snapshot => snapshot!.status === "failed")) reject(new Error("Notebook edits failed. Review the retained draft before sending again."));
					else resolve();
				};
				listeners.add(check); cancelWaiters.add(cancel); check();
			});
		} finally { waitingForWorking--; publish(); }
	}
	function prepareAnswer(owner: Extract<TutorDraftOwner, { kind: "question" }>, answer: QuestionAnswerData): Promise<PreparedNotebookAnswer> {
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
				if (frozen.kind !== "answer") throw new Error("Confirm the earlier submission before sending this answer");
				return structuredClone(frozen.content);
			}
			for (const owner of owners) await flush(owner);
			await waitForWorking(owners);
			const included = owners.flatMap(owner => { const entry = entries.get(keyOf(owner)); return entry?.base ? [entry] : []; });
			const input: PreparedNotebookAnswer = { answer: structuredClone(answer) };
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
			for (const entry of included) { entry.frozen = { kind: "answer", content: input }; entry.frozenDraft = structuredClone(entry.base!); }
			stash(); publish(null);
			return structuredClone(input);
			} finally {
				for (const owner of owners) { const entry = entries.get(keyOf(owner)); if (entry) entry.preparing = undefined; }
			}
		});
	}
	return {
		getSnapshot: () => state,
		subscribe(listener: () => void) { disposed = false; listeners.add(listener); return () => { listeners.delete(listener); }; },
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
		dispose() { disposed = true; for (const cancel of cancelWaiters) cancel(); listeners.clear(); },
	};
}
