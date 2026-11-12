/**
 * D1 (round 20): a notebook-backed draft must never be lost to a quick reload.
 *
 * Two causes, each reproduced deterministically here:
 * 1. The answer recovery keeps each durable draft on the device (IndexedDB),
 *    written asynchronously. On load it restores that copy over the form when
 *    the learner hasn't typed yet. A reload that landed while the newest
 *    draft's write was still queued restored the older copy. The recovery now
 *    keeps a synchronous write-ahead journal; on open the journal's newer
 *    revision wins and is written again.
 * 2. While the notebook was closed, form edits stayed local; reopening it
 *    showed the notebook's older copy, which the recovery then recorded as a
 *    newer edit. A plain notebook copy is now kept current while it is closed.
 */
import React, { act, useRef, type MutableRefObject } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { HandwritingSubmission, type DraftJournal } from "../components/handwriting/submission-recovery.ts";
import type { TransferDevice, TransferSnapshot, DurableDraft } from "../components/handwriting/transfer-device.ts";

const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { React, window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { useNotebookQuestionDraft } = await import("../components/notebook-question-draft.ts");
const { sameDraftOwner, emptyDockSelection, DEFAULT_CONFIDENCE_INDEX } = await import("../src/core/index.ts");

/** A device whose draft writes can be held back, as a slow IndexedDB would be at a reload. */
function heldDevice() {
	const saved: TransferSnapshot = { captures: [], drafts: [], submissions: [], captureReceipts: [] };
	let hold = false;
	const held: (() => void)[] = [];
	const put = (draft: DurableDraft) => {
		const old = saved.drafts.find(value => value.targetKey === draft.targetKey && value.draftId === draft.draftId);
		if (!old || old.revision < draft.revision) saved.drafts = [...saved.drafts.filter(value => value !== old), structuredClone(draft)];
	};
	const device: TransferDevice = {
		async open() { return 0; },
		async read() { return structuredClone(saved); },
		saveDraft(_chat, _generation, draft) {
			if (!hold) { put(draft); return Promise.resolve(); }
			// Held: the write lands only if released (a reload loses it).
			return new Promise<void>(resolve => held.push(() => { put(draft); resolve(); }));
		},
		async saveCapture(_chat, _generation, _capture, draft) { if (draft) put(draft); },
		async finishCapture() {},
		async saveSubmission(_chat, _generation, _attempt, draft) { if (draft) put(draft); },
		async finishSubmission() {},
		async deleteChat() { saved.drafts = []; },
	};
	return { device, saved, holdWrites: (value: boolean) => { hold = value; }, held };
}
function memoryStorage(): DraftJournal & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: key => void data.delete(key) };
}
const deps = (device: TransferDevice, journal?: DraftJournal) => ({ device, fetch: (async () => { throw new Error("offline"); }) as typeof fetch, review: async () => ({ pending: [], pageAttachments: {} }), changed: () => {}, journal: journal ? () => journal : undefined });

test("D1: a reload while the newest draft's device write is still pending restores the newest draft", async () => {
	const { device, saved, holdWrites } = heldDevice(), journal = memoryStorage();
	const before = new HandwritingSubmission("chat", deps(device, journal));
	await before.open();
	before.checkpoint("question:q1", { thinking: "Initial reasoning." });
	before.edit("question:q1", { thinking: "Initial reasoning. More" });
	await before.flush();
	assert.equal(saved.drafts[0]!.editor.thinking, "Initial reasoning. More", "the device holds the earlier edit");
	// The learner corrects the reasoning; the device write is still queued when the page reloads.
	holdWrites(true);
	before.edit("question:q1", { thinking: "Corrected reasoning." });
	assert.equal(saved.drafts[0]!.editor.thinking, "Initial reasoning. More", "the device has not caught up");
	before.dispose();
	holdWrites(false);
	// The reload: a new page opens the recovery against the same device and storage.
	const after = new HandwritingSubmission("chat", deps(device, journal));
	await after.open();
	assert.equal(after.draft("question:q1")?.editor.thinking, "Corrected reasoning.", "the journal's newer revision wins over the device's older copy");
	await after.flush();
	assert.equal(saved.drafts[0]!.editor.thinking, "Corrected reasoning.", "and is written to the device again");
	assert.equal(journal.data.size, 0, "once written, the journal lets it go");
});

test("D1: without the journal the same timing restores the older copy (the race this fixes)", async () => {
	const { device, holdWrites } = heldDevice();
	const before = new HandwritingSubmission("chat", deps(device));
	await before.open();
	before.checkpoint("question:q1", { thinking: "Initial" });
	before.edit("question:q1", { thinking: "Initial reasoning." });
	await before.flush();
	holdWrites(true);
	before.edit("question:q1", { thinking: "Corrected reasoning." });
	holdWrites(false);
	const after = new HandwritingSubmission("chat", deps(device));
	await after.open();
	assert.equal(after.draft("question:q1")?.editor.thinking, "Initial reasoning.");
});

test("D1: a journal from an earlier generation (a deleted session) is never restored", async () => {
	const { device } = heldDevice(), journal = memoryStorage();
	journal.setItem("lh:handwriting-draft-journal:chat", JSON.stringify({ version: 1, generation: 7, drafts: { "question:q1": { version: 1, chatId: "chat", targetKey: "question:q1", draftId: "old", revision: 9, editor: { thinking: "From a deleted session" } } } }));
	const model = new HandwritingSubmission("chat", deps(device, journal));
	await model.open();
	assert.equal(model.draft("question:q1"), undefined);
	assert.equal(journal.data.size, 0);
});

// ---- The closed-notebook edit (the trigger in the phone flow) ----
type Owner = { kind: "question"; toolCallId: string; channel: "thinking" };
const owner: Owner = { kind: "question", toolCallId: "q1", channel: "thinking" };
type Part = { id: string; kind: "text"; text: string } | { id: string; kind: "working"; snapshotId: string };
type Draft = { id: string; owner: Owner; revision: number; parts: Part[]; form?: Record<string, unknown> };
function sessionDouble() {
	let open = true;
	let drafts: Draft[] = [];
	const listeners = new Set<() => void>(), tutorListeners = new Set<() => void>();
	let snapshot = { view: { contextId: "ctx" as string | null }, sendBlocked: false };
	let tutorState = { drafts, recovery: [], saving: false, error: null };
	const publish = () => { tutorState = { ...tutorState, drafts }; for (const listener of tutorListeners) listener(); };
	const upsert = (text: string, form?: Record<string, unknown>) => {
		const old = drafts.find(draft => sameDraftOwner(draft.owner, owner));
		const parts = old ? old.parts.map((part, index) => index === old.parts.length - 1 && part.kind === "text" ? { ...part, text } : part) : [{ id: "p1", kind: "text" as const, text }];
		drafts = [...drafts.filter(draft => draft !== old), { id: old?.id ?? "d1", owner, revision: (old?.revision ?? 0) + 1, parts, form: form ?? old?.form }];
		publish();
	};
	const session = {
		subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
		getSnapshot: () => snapshot,
		tutor: {
			subscribe: (listener: () => void) => { tutorListeners.add(listener); return () => tutorListeners.delete(listener); },
			getSnapshot: () => tutorState,
			updateForm: (_owner: Owner, form: { thinking: string }) => upsert(form.thinking, form),
			updateText: (_owner: Owner, text: string) => upsert(text),
		},
	};
	return {
		session,
		drafts: () => drafts,
		setDrafts: (next: Draft[]) => { drafts = next; publish(); },
		setOpen(value: boolean) { open = value; snapshot = { ...snapshot, view: { contextId: open ? "ctx" : null } }; for (const listener of listeners) listener(); },
	};
}
type Owned = ReturnType<typeof useNotebookQuestionDraft>;
function Probe({ session, api }: { session: unknown; api: MutableRefObject<Owned | null> }) {
	const initial = useRef({ selection: emptyDockSelection(), text: "", thinking: "Initial reasoning.", other: "", confidenceIndex: DEFAULT_CONFIDENCE_INDEX });
	const owned = useNotebookQuestionDraft(session as Parameters<typeof useNotebookQuestionDraft>[0], owner, initial.current);
	api.current = owned;
	return <p id="thinking">{owned.form.thinking}</p>;
}

test("D1: an edit made while the notebook is closed is what the notebook shows when reopened", async () => {
	const double = sessionDouble(), api: MutableRefObject<Owned | null> = { current: null };
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => { root.render(<Probe session={double.session} api={api} />); });
		assert.equal(double.drafts()[0]?.parts[0]?.kind === "text" && double.drafts()[0]!.parts[0]!.text, "Initial reasoning.", "opening the notebook seeds its copy");
		await act(async () => { double.setOpen(false); });
		await act(async () => { api.current!.change("thinking", "Corrected reasoning."); });
		const copy = double.drafts()[0]!;
		assert.equal(copy.parts.at(-1)?.kind === "text" && (copy.parts.at(-1) as { text: string }).text, "Corrected reasoning.", "the closed-notebook edit reaches the notebook's plain copy");
		await act(async () => { double.setOpen(true); });
		assert.equal(document.getElementById("thinking")?.textContent, "Corrected reasoning.", "reopening shows the newest text, never the older copy");
	} finally { await act(async () => root.unmount()); host.remove(); }
});

test("D1: a notebook copy holding working is not rewritten from the closed field (its continuation is the notebook's)", async () => {
	const double = sessionDouble(), api: MutableRefObject<Owned | null> = { current: null };
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	try {
		await act(async () => { root.render(<Probe session={double.session} api={api} />); });
		double.setDrafts([{ id: "d1", owner, revision: 3, parts: [{ id: "a", kind: "text", text: "Initial reasoning." }, { id: "w", kind: "working", snapshotId: "w" }, { id: "c", kind: "text", text: "" }] }]);
		await act(async () => { double.setOpen(false); });
		await act(async () => { api.current!.change("thinking", "Typed while closed"); });
		assert.deepEqual(double.drafts()[0]!.parts.map(part => part.kind === "text" ? part.text : "[working]"), ["Initial reasoning.", "[working]", ""]);
	} finally { await act(async () => root.unmount()); host.remove(); }
});
