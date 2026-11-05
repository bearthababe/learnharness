import { canonicalHandwriting, canonicalWritingInput, handwritingSha256, matchWritingSubmission, writingInputObsolete, activeProblemOf, danglingQuestionOf, type ChatInput, type LhMessage, type SharedWriting, type WritingInputOutcome } from "../../src/core/index.ts";
import type { AttachmentReview } from "./attachment.ts";
import type { DurableDraft, EditorSnapshot, SubmissionAttempt, TransferDevice } from "./transfer-device.ts";

type Dependencies = { device: TransferDevice; fetch: typeof fetch; review: () => Promise<AttachmentReview>; changed: () => void };
export type ImageSend = (input: ChatInput, outcome: (value: WritingInputOutcome) => void) => Promise<unknown>;
class ReviewedImagesChanged extends Error {
	constructor() { super("Reviewed snapshots changed. Review them before submitting."); }
}

/** Normal drafts own editing; only uncertain delivery owns a frozen attempt. */
export class HandwritingSubmission {
	private generation: number | null = null;
	private drafts = new Map<string, DurableDraft>();
	private durable = new Set<string>();
	private writes: Promise<void> = Promise.resolve();
	private deleted = false;
	private disposed = false;
	private rejectedCleanup?: SubmissionAttempt;
	private checking?: Promise<"accepted" | "not_accepted" | "unknown">;
	attempt?: SubmissionAttempt;
	notice: string | null = null;
	busy = false;
	canRetry = false;
	constructor(private chatId: string, private deps: Dependencies) {}
	private update(notice = this.notice) { this.notice = notice; if (!this.disposed) this.deps.changed(); }
	async open() {
		try {
			this.generation = await this.deps.device.open(this.chatId);
			const saved = await this.deps.device.read(this.chatId, this.generation);
			for (const draft of saved.drafts) {
				const live = this.drafts.get(draft.targetKey);
				if (!live || live.revision < draft.revision) this.drafts.set(draft.targetKey, draft);
				this.durable.add(draft.targetKey);
			}
			if (saved.submissions.length > 1) throw new Error("Conflicting saved attempts");
			this.attempt = saved.submissions[0];
			if (this.attempt?.state === "prepared") {
				await this.retireUnsent();
				this.update("Couldn’t save this answer on this device. Nothing was sent.");
				return;
			}
			this.update(this.attempt ? "Couldn’t confirm delivery. Your saved answer is kept on this device." : null);
			if (this.attempt) await this.check();
		} catch { this.generation = null; this.update("Couldn’t read answer recovery on this device. Keep this page open."); }
	}
	draft(targetKey: string) { return this.drafts.get(targetKey); }
	savedDrafts() { return [...this.drafts.values()].filter(draft => this.durable.has(draft.targetKey)); }
	edit(targetKey: string, editor: EditorSnapshot): DurableDraft {
		const old = this.drafts.get(targetKey);
		if (old && canonicalHandwriting(old.editor) === canonicalHandwriting(editor)) return old;
		const draft: DurableDraft = { version: 1, chatId: this.chatId, targetKey, draftId: old?.draftId ?? crypto.randomUUID(), revision: (old?.revision ?? 0) + 1, editor: structuredClone(editor) };
		this.drafts.set(targetKey, draft);
		if (this.durable.has(targetKey)) this.queueDraft(draft);
		return draft;
	}
	private queueDraft(draft: DurableDraft) {
		this.writes = this.writes.catch(() => {}).then(async () => {
			if (this.deleted || this.generation === null) throw new Error("Recovery unavailable");
			await this.deps.device.saveDraft(this.chatId, this.generation, draft);
		}).catch(() => { this.update("Couldn’t save your latest edits on this device. Keep this page open."); throw new Error("Draft not saved"); });
		void this.writes.catch(() => {});
	}
	/** Enable durability before Attach's async work so newer edits get revisions. */
	checkpoint(targetKey: string, editor: EditorSnapshot) { const draft = this.edit(targetKey, editor); this.durable.add(targetKey); return draft; }
	retainSpeech(targetKey: string, editor: EditorSnapshot, field: "text" | "thinking" | "readingThinking", text: string) {
		const current = this.drafts.get(targetKey)?.editor ?? editor;
		const previous = current[field] ?? "";
		const draft = this.checkpoint(targetKey, { ...current, [field]: previous ? `${previous.replace(/\s+$/, "")} ${text}` : text });
		this.queueDraft(draft); this.update();
	}
	async flush() { await this.writes; }
	async submit(input: ChatInput, images: SharedWriting[], draft: DurableDraft, send: ImageSend): Promise<boolean> {
		if (this.busy || this.deleted) return false;
		this.busy = true; this.update();
		try {
			if (this.attempt) {
				const result = await this.check();
				if (result === "accepted") return true;
				if (this.attempt) {
					if (!this.canRetry) return false;
					await this.dispatch(send, false);
					return true;
				}
			}
			if (this.generation === null || !("writingIds" in input) || !input.writingIds?.length || input.writingIds.join() !== images.map(image => image.id).join()) throw new Error("Invalid pending review");
			if (this.rejectedCleanup) {
				await this.flush();
				await this.deps.device.finishSubmission(this.chatId, this.generation, this.rejectedCleanup, false);
				this.rejectedCleanup = undefined;
			}
			const review = await this.deps.review();
			if (images.some(image => !review.pending.some(current => current.id === image.id))) throw new ReviewedImagesChanged();
			const submissionId = `submission_${crypto.randomUUID()}`;
			const attempt: SubmissionAttempt = { version: 1, chatId: this.chatId, submissionId, input: { ...input, submissionId }, imageVersions: images.map(({ id, notebook }) => ({ writingId: id, ...(notebook ? { notebook: { pageId: notebook.pageId, pageRevision: notebook.pageRevision } } : {}) })), targetKey: draft.targetKey, draftId: draft.draftId, draftRevision: draft.revision, editor: structuredClone(draft.editor), createdAt: new Date().toISOString(), state: "prepared" };
			this.durable.add(draft.targetKey);
			await this.deps.device.saveSubmission(this.chatId, this.generation, attempt, draft);
			this.attempt = attempt;
			await this.dispatch(send, true);
			return true;
		} catch (error) {
			this.update(this.attempt ? "Couldn’t confirm delivery. Your saved answer is kept on this device." : error instanceof ReviewedImagesChanged ? error.message : "Couldn’t save this answer on this device. Nothing was sent.");
			return false;
		} finally { this.busy = false; this.update(); }
	}
	private async dispatch(send: ImageSend, original: boolean) {
		if (!this.attempt || this.generation === null || this.deleted) return;
		const attempt: SubmissionAttempt = { ...this.attempt, state: "sending" };
		try { await this.deps.device.saveSubmission(this.chatId, this.generation, attempt); }
		catch (error) { if (original) await this.retireUnsent(); throw error; }
		this.attempt = attempt;
		let outcome: WritingInputOutcome = { disposition: "unknown", original };
		try { await send(attempt.input, value => { outcome = { ...value, original: original && value.original }; }); }
		catch { /* unknown delivery is kept, never inferred from a thrown POST */ }
		if (this.deleted || this.attempt?.submissionId !== attempt.submissionId) return;
		if (outcome.disposition === "not_accepted" && outcome.original) {
			await this.retireUnsent();
			this.update("Your answer wasn’t sent. You can edit it and submit again.");
			await this.deps.review().catch(() => {});
			return;
		}
		this.attempt = { ...attempt, state: "uncertain" };
		await this.deps.device.saveSubmission(this.chatId, this.generation, this.attempt);
		this.update("Couldn’t confirm delivery. Your saved answer is kept on this device.");
		await this.check();
	}
	private async retireUnsent() {
		const attempt = this.attempt;
		try { await this.retire(false); }
		catch { this.rejectedCleanup = attempt; this.attempt = undefined; this.canRetry = false; }
	}
	private async retire(accepted: boolean) {
		const attempt = this.attempt;
		if (!attempt || this.generation === null) return;
		// Flush newer edits before terminal cleanup checks the stored revision.
		await this.flush();
		await this.deps.device.finishSubmission(this.chatId, this.generation, attempt, accepted);
		const draft = this.drafts.get(attempt.targetKey);
		if (accepted && draft?.draftId === attempt.draftId && draft.revision <= attempt.draftRevision) { this.drafts.delete(attempt.targetKey); this.durable.delete(attempt.targetKey); }
		this.attempt = undefined; this.canRetry = false; this.update(accepted ? "Your answer was sent." : "Your answer wasn’t sent. You can edit it and submit again.");
	}
	check(): Promise<"accepted" | "not_accepted" | "unknown"> {
		if (this.checking) return this.checking;
		const checking = this.checkAttempt(); this.checking = checking;
		void checking.finally(() => { if (this.checking === checking) this.checking = undefined; });
		return checking;
	}
	private async checkAttempt(): Promise<"accepted" | "not_accepted" | "unknown"> {
		const attempt = this.attempt;
		if (!attempt || this.deleted) return "unknown";
		this.canRetry = false; this.update("Checking whether your answer was received…");
		try {
			// Newer monotone page-head evidence MUST precede the canonical read.
			const review = await this.deps.review();
			const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}`, { cache: "no-store" });
			if (!response.ok) throw new Error("Record unavailable");
			const record = await response.json() as { messages: LhMessage[]; turnInFlight: boolean };
			if (!Array.isArray(record.messages) || typeof record.turnInFlight !== "boolean") throw new Error("Invalid record");
			if (this.attempt?.submissionId !== attempt.submissionId || this.deleted) return "unknown";
			const inputSha256 = await handwritingSha256(new TextEncoder().encode(canonicalWritingInput(attempt.input)));
			const match = matchWritingSubmission(record.messages, { id: attempt.submissionId, inputSha256 });
			if (match === "accepted") { await this.retire(true); return "accepted"; }
			if (match === "conflict") throw new Error("Conflicting receipt");
			const superseded = attempt.imageVersions.some(image => image.notebook && (review.pageAttachments[image.notebook.pageId]?.revision ?? 0) > image.notebook.pageRevision);
			if (superseded || writingInputObsolete(record.messages, attempt.input)) { await this.retire(false); return "not_accepted"; }
			const input = attempt.input;
			const eligible = input.type === "text" || (input.type === "answer" && danglingQuestionOf(record.messages)?.toolCallId === input.toolCallId) || (input.type === "thinking" && activeProblemOf(record.messages)?.toolCallId === input.problemCallId);
			this.canRetry = !record.turnInFlight && eligible && attempt.imageVersions.every(image => review.pending.some(current => current.id === image.writingId));
		} catch { /* absence/read failure never proves a delayed original failed */ }
		if (this.attempt) this.update("Couldn’t confirm delivery. Your saved answer is kept on this device.");
		return "unknown";
	}
	dispose() { this.disposed = true; }
	sessionDeleted() { this.deleted = true; this.disposed = true; }
}
