import { z } from "zod";
import { canonicalHandwriting, notebookPageIdSchema, parseChatInput, type ChatInput } from "../../src/core/index.ts";

export type EditorSnapshot = { text?: string; thinking?: string; other?: string; confidenceIndex?: number; readingThinking?: string; selection?: { selected: number[]; otherSelected: boolean; dontKnow: boolean } };
const editorSchema = z.object({ text: z.string().optional(), thinking: z.string().optional(), other: z.string().optional(), confidenceIndex: z.number().int().nonnegative().optional(), readingThinking: z.string().optional(), selection: z.object({ selected: z.array(z.number().int().nonnegative()), otherSelected: z.boolean(), dontKnow: z.boolean() }).strict().optional() }).strict();
const draftSchema = z.object({ version: z.literal(1), chatId: z.string(), targetKey: z.string(), draftId: z.string(), revision: z.number().int().nonnegative(), editor: editorSchema }).strict();
export type DurableDraft = z.infer<typeof draftSchema>;
export type SubmissionAttempt = { version: 1; chatId: string; submissionId: string; input: ChatInput; imageVersions: { writingId: string; notebook?: { pageId: string; pageRevision: number } }[]; targetKey: string; draftId: string; draftRevision: number; editor: EditorSnapshot; createdAt: string; state: "prepared" | "sending" | "uncertain"; lastError?: string };
export type CaptureRecord = { version: 1; chatId: string; pageId: string; writingId: string; expectedPageRevision: number; sourceJson: string; sourceFingerprint: string; contentFingerprint: string; capturedAt: string; explanationDraft: Pick<DurableDraft, "targetKey" | "draftId" | "revision">; raster?: { width: 1400; height: 1800; rgba: ArrayBuffer }; png?: Blob; state: "captured" | "ready" | "uploading" | "failed" | "conflicted"; error?: string };
export type CaptureReceipt = { version: 1; chatId: string; pageId: string; sourceFingerprint: string; contentFingerprint: string; writingId: string; pageRevision: number; createdAt: string };
export type TransferSnapshot = { captures: CaptureRecord[]; submissions: SubmissionAttempt[]; drafts: DurableDraft[]; captureReceipts: CaptureReceipt[] };
/** Positive terminal evidence, distinct from a failed device write. */
export class CaptureRetiredError extends Error {
	constructor() { super("This capture has already settled or its page revision has advanced."); }
}
type Session = { version: 1; chatId: string; generation: number; deleted: boolean };
export interface TransferDevice {
	open(chatId: string): Promise<number>;
	read(chatId: string, generation: number): Promise<TransferSnapshot>;
	saveDraft(chatId: string, generation: number, draft: DurableDraft): Promise<void>;
	saveCapture(chatId: string, generation: number, capture: CaptureRecord, draft?: DurableDraft): Promise<void>;
	finishCapture(chatId: string, generation: number, writingId: string, receipt: CaptureReceipt): Promise<void>;
	saveSubmission(chatId: string, generation: number, attempt: SubmissionAttempt, draft?: DurableDraft): Promise<void>;
	finishSubmission(chatId: string, generation: number, attempt: SubmissionAttempt, accepted: boolean): Promise<void>;
	deleteChat(chatId: string): Promise<void>;
}
const stores = ["captures", "captureReceipts", "submissions", "drafts", "sessions"] as const;
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
function validateSession(value: unknown): Session {
	return z.object({ version: z.literal(1), chatId: z.string(), generation: z.number().int().nonnegative(), deleted: z.boolean() }).strict().parse(value);
}
function validateCapture(value: unknown): CaptureRecord {
	const record = z.object({ version: z.literal(1), chatId: z.string(), pageId: notebookPageIdSchema, writingId: z.string(), expectedPageRevision: z.number().int().nonnegative(), sourceJson: z.string(), sourceFingerprint: z.string(), contentFingerprint: z.string(), capturedAt: z.string(), explanationDraft: draftSchema.pick({ targetKey: true, draftId: true, revision: true }), raster: z.object({ width: z.literal(1400), height: z.literal(1800), rgba: z.instanceof(ArrayBuffer) }).strict().optional(), png: z.instanceof(Blob).optional(), state: z.enum(["captured", "ready", "uploading", "failed", "conflicted"]), error: z.string().optional() }).strict().parse(value);
	if ((!record.png && !record.raster) || (record.raster && record.raster.rgba.byteLength !== 1400 * 1800 * 4)) throw new Error("Corrupt saved raster");
	return record;
}
function validateAttempt(value: unknown): SubmissionAttempt {
	const record = z.object({ version: z.literal(1), chatId: z.string(), submissionId: z.string(), input: z.unknown(), imageVersions: z.array(z.object({ writingId: z.string(), notebook: z.object({ pageId: notebookPageIdSchema, pageRevision: z.number().int().positive() }).strict().optional() }).strict()), targetKey: z.string(), draftId: z.string(), draftRevision: z.number().int().nonnegative(), editor: editorSchema, createdAt: z.string(), state: z.enum(["prepared", "sending", "uncertain"]), lastError: z.string().optional() }).strict().parse(value);
	const input = parseChatInput(record.input);
	if (!("submissionId" in input) || input.submissionId !== record.submissionId || !input.writingIds?.length || input.writingIds.join() !== record.imageVersions.map(image => image.writingId).join()) throw new Error("Corrupt saved submission");
	return { ...record, input };
}
const receiptSchema = z.object({ version: z.literal(1), chatId: z.string(), pageId: notebookPageIdSchema, sourceFingerprint: z.string(), contentFingerprint: z.string(), writingId: z.string(), pageRevision: z.number().int().positive(), createdAt: z.string() }).strict();

/** Native IndexedDB only. A successful request is not durability: every public
 * write resolves at transaction completion, including the generation check. */
export class IndexedTransferDevice implements TransferDevice {
	private database?: Promise<IDBDatabase>;
	constructor(private factory: () => IDBFactory = () => indexedDB) {}
	private db() {
		return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
			const opening = this.factory().open("lh-handwriting-transfer", 1);
			opening.onupgradeneeded = () => {
				for (const name of stores) opening.result.createObjectStore(name, { keyPath: name === "sessions" ? "chatId" : name === "drafts" ? ["chatId", "targetKey", "draftId"] : ["chatId", name === "captures" ? "writingId" : name === "submissions" ? "submissionId" : "pageId"] });
			};
			opening.onsuccess = () => { opening.result.onversionchange = () => opening.result.close(); resolve(opening.result); };
			opening.onerror = () => { this.database = undefined; reject(opening.error); };
			opening.onblocked = () => reject(new Error("Device recovery is blocked by another window"));
		});
	}
	private async transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>): Promise<T> {
		const tx = (await this.db()).transaction([...stores], mode);
		const completed = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Device transaction aborted")); });
		try { const value = await run(tx); await completed; return value; }
		catch (error) { try { tx.abort(); } catch { /* already settled */ } await completed.catch(() => {}); throw error; }
	}
	private async guard(tx: IDBTransaction, chatId: string, generation: number) {
		const session = validateSession(await request(tx.objectStore("sessions").get(chatId)));
		if (session.deleted || session.generation !== generation) throw new Error("Session recovery was deleted");
	}
	open(chatId: string) { return this.transaction("readwrite", async tx => {
		const store = tx.objectStore("sessions"), saved = await request(store.get(chatId));
		const session = saved === undefined ? { version: 1 as const, chatId, generation: 0, deleted: false } : validateSession(saved);
		if (session.deleted) throw new Error("Session recovery was deleted");
		if (saved === undefined) store.add(session);
		return session.generation;
	}); }
	read(chatId: string, generation: number) { return this.transaction("readonly", async tx => {
		await this.guard(tx, chatId, generation);
		const rows = await Promise.all(stores.slice(0, 4).map(name => request(tx.objectStore(name).getAll(IDBKeyRange.bound([chatId], [chatId, []])))));
		return { captures: rows[0]!.map(validateCapture), captureReceipts: rows[1]!.map(value => receiptSchema.parse(value)), submissions: rows[2]!.map(validateAttempt), drafts: rows[3]!.map(value => draftSchema.parse(value)) };
	}); }
	private async putDraft(tx: IDBTransaction, draft: DurableDraft) {
		draftSchema.parse(draft);
		const store = tx.objectStore("drafts"), old = await request(store.get([draft.chatId, draft.targetKey, draft.draftId]));
		if (old !== undefined && draftSchema.parse(old).revision === draft.revision && canonicalHandwriting(old) !== canonicalHandwriting(draft)) throw new Error("Conflicting draft revision");
		if (old === undefined || draftSchema.parse(old).revision < draft.revision) store.put(draft);
	}
	saveDraft(chatId: string, generation: number, draft: DurableDraft) { return this.transaction("readwrite", async tx => { await this.guard(tx, chatId, generation); if (draft.chatId !== chatId) throw new Error("Wrong session"); await this.putDraft(tx, draft); }); }
	saveCapture(chatId: string, generation: number, capture: CaptureRecord, draft?: DurableDraft) { return this.transaction("readwrite", async tx => {
		await this.guard(tx, chatId, generation); validateCapture(capture);
		if (capture.chatId !== chatId || (draft && draft.chatId !== chatId)) throw new Error("Wrong session");
		const completed = await request(tx.objectStore("captureReceipts").get([chatId, capture.pageId]));
		if (completed !== undefined) {
			const receipt = receiptSchema.parse(completed);
			if (receipt.writingId === capture.writingId || receipt.pageRevision > capture.expectedPageRevision) throw new CaptureRetiredError();
		}
		const existing = await request(tx.objectStore("captures").getAll(IDBKeyRange.bound([chatId], [chatId, []])));
		for (const raw of existing) {
			const old = validateCapture(raw);
			if (old.writingId === capture.writingId) {
				if (old.sourceJson !== capture.sourceJson || old.sourceFingerprint !== capture.sourceFingerprint || old.contentFingerprint !== capture.contentFingerprint || old.pageId !== capture.pageId || old.expectedPageRevision !== capture.expectedPageRevision || old.capturedAt !== capture.capturedAt || canonicalHandwriting(old.explanationDraft) !== canonicalHandwriting(capture.explanationDraft)) throw new Error("Conflicting capture identity");
			} else if (old.pageId === capture.pageId && old.state !== "conflicted" && capture.state !== "conflicted") throw new Error("This page already has a saved capture");
		}
		tx.objectStore("captures").put(capture); if (draft) await this.putDraft(tx, draft);
	}); }
	finishCapture(chatId: string, generation: number, writingId: string, receipt: CaptureReceipt) { return this.transaction("readwrite", async tx => {
		await this.guard(tx, chatId, generation); receiptSchema.parse(receipt);
		if (receipt.chatId !== chatId || receipt.writingId !== writingId) throw new Error("Wrong capture");
		const store = tx.objectStore("captureReceipts"), old = await request(store.get([chatId, receipt.pageId]));
		if (!old || receiptSchema.parse(old).pageRevision < receipt.pageRevision) store.put(receipt);
		tx.objectStore("captures").delete([chatId, writingId]);
	}); }
	saveSubmission(chatId: string, generation: number, attempt: SubmissionAttempt, draft?: DurableDraft) { return this.transaction("readwrite", async tx => {
		await this.guard(tx, chatId, generation); validateAttempt(attempt);
		if (attempt.chatId !== chatId || (draft && draft.chatId !== chatId)) throw new Error("Wrong session");
		const existing = await request(tx.objectStore("submissions").getAll(IDBKeyRange.bound([chatId], [chatId, []])));
		if (existing.some(value => validateAttempt(value).submissionId !== attempt.submissionId)) throw new Error("Check delivery of your saved answer first");
		for (const value of existing) {
			const { state: _oldState, lastError: _oldError, ...old } = validateAttempt(value), { state: _state, lastError: _error, ...next } = attempt;
			if (canonicalHandwriting(old) !== canonicalHandwriting(next)) throw new Error("Conflicting submission identity");
		}
		tx.objectStore("submissions").put(attempt); if (draft) await this.putDraft(tx, draft);
	}); }
	finishSubmission(chatId: string, generation: number, attempt: SubmissionAttempt, accepted: boolean) { return this.transaction("readwrite", async tx => {
		await this.guard(tx, chatId, generation);
		const key = [chatId, attempt.targetKey, attempt.draftId], store = tx.objectStore("drafts");
		const old = await request(store.get(key));
		if (accepted) { if (old && draftSchema.parse(old).revision <= attempt.draftRevision) store.delete(key); }
		else await this.putDraft(tx, { version: 1, chatId, targetKey: attempt.targetKey, draftId: attempt.draftId, revision: attempt.draftRevision, editor: attempt.editor });
		tx.objectStore("submissions").delete([chatId, attempt.submissionId]);
	}); }
	deleteChat(chatId: string) { return this.transaction("readwrite", async tx => {
		const store = tx.objectStore("sessions"), old = await request(store.get(chatId));
		store.put({ version: 1, chatId, generation: old ? validateSession(old).generation + 1 : 1, deleted: true });
		for (const name of stores.slice(0, 4)) tx.objectStore(name).delete(IDBKeyRange.bound([chatId], [chatId, []]));
	}); }
}
export const handwritingTransferDevice = new IndexedTransferDevice();
