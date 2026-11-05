import { canonicalHandwriting, handwritingFingerprints, notebookSourceSchema, type NotebookSource, type PageAttachments, type SharedWriting } from "../../src/core/index.ts";
import type { CaptureRecord, DurableDraft, TransferDevice } from "./transfer-device.ts";

export type AttachmentReview = { pending: SharedWriting[]; pageAttachments: PageAttachments };
type Dependencies = { device: TransferDevice; fetch: typeof fetch; encode: (raster: NonNullable<CaptureRecord["raster"]>) => Promise<Blob>; refresh: () => Promise<AttachmentReview>; reveal: () => void; changed: () => void };
export type AttachPreparation = { pageId: string; head: PageAttachments[string] | undefined; valid: () => boolean; finish: () => Promise<boolean>; freeze: () => { source: NotebookSource; draft: DurableDraft; raster: NonNullable<CaptureRecord["raster"]> } };
const LIMIT = 25 * 1024 * 1024;
const noticeText = {
	preparing: "Preparing snapshot…",
	uploading: "Attaching snapshot… You can keep writing.",
	failed: "Snapshot saved on this device. Couldn’t attach it.",
	local_failed: "Couldn’t save this snapshot on this device. It has not been uploaded. Keep this page open and retry.",
	recovery_unavailable: "Couldn’t read snapshot recovery on this device. Keep this page open and retry.",
	review_unavailable: "Couldn’t check attached snapshots. Refresh review before attaching.",
	refresh_failed: "Snapshot attached. Couldn’t refresh review.",
	conflicted: "A newer snapshot of this page is already attached. Your captured version has been kept on this device.",
	superseded: "A newer snapshot of this page is attached.",
	unchanged: "This page version is already attached.",
	attached: "Snapshot attached · not sent",
	updated: "Snapshot updated · not sent",
	sent: "This version was already sent.",
	unavailable: "This session is unavailable. Your device recovery has been kept.",
} as const;
type NoticeKind = keyof typeof noticeText;
type SizeLimit = "source" | "image";
class CaptureSizeError extends Error {
	constructor(readonly part: SizeLimit) { super(part === "source" ? "Source exceeds 25 MiB. Full history has been kept." : "PNG exceeds 25 MiB."); }
}

/** Owns capture identity and transport, never mutable working or editor fields. */
export class HandwritingAttachment {
	private generation: number | null = null;
	private captures = new Map<string, CaptureRecord>();
	private drafts = new Map<string, DurableDraft>();
	private notices = new Map<string, { kind: NoticeKind; limit?: SizeLimit }>();
	private flights = new Set<string>();
	private disposed = false;
	private deleted = false;
	constructor(private chatId: string, private deps: Dependencies) {}
	notice(pageId: string) {
		const notice = this.notices.get(pageId); if (!notice) return;
		return { ...notice, text: noticeText[notice.kind] + (notice.limit ? ` ${new CaptureSizeError(notice.limit).message}` : ""), refresh: notice.kind === "refresh_failed" || notice.kind === "review_unavailable" };
	}
	noticeEntries() { return [...this.notices.keys()].map(pageId => ({ pageId, ...this.notice(pageId)! })); }
	report(pageId: string, kind: NoticeKind) { this.update(pageId, kind); }
	busy(pageId: string) { return this.flights.has(pageId); }
	hasCapture(pageId: string) { return this.captures.has(pageId); }
	private update(pageId: string, kind: NoticeKind, limit?: SizeLimit) { this.notices.set(pageId, { kind, limit }); if (!this.disposed) this.deps.changed(); }
	async open() {
		try {
			this.generation = await this.deps.device.open(this.chatId);
			const saved = await this.deps.device.read(this.chatId, this.generation);
			for (const capture of saved.captures) {
				const source = notebookSourceSchema.parse(JSON.parse(capture.sourceJson)), fingerprints = await handwritingFingerprints(source);
				if (source.journal.pageId !== capture.pageId || fingerprints.sourceFingerprint !== capture.sourceFingerprint || fingerprints.contentFingerprint !== capture.contentFingerprint) throw new Error("Corrupt saved capture");
				if (capture.state !== "conflicted" && this.captures.has(capture.pageId)) throw new Error("Conflicting device captures");
				if (capture.state !== "conflicted") this.captures.set(capture.pageId, capture);
				this.update(capture.pageId, capture.state === "conflicted" ? "conflicted" : "failed");
			}
		} catch { this.generation = null; this.update("page_initial", "recovery_unavailable"); return; }
		await this.recover();
	}
	async recover() {
		if (this.deleted || this.disposed || this.generation === null) return;
		await Promise.all([...this.captures.keys()].map(pageId => this.retry(pageId)));
	}
	async attach(preparation: AttachPreparation) {
		const pageId = preparation.pageId;
		if (this.deleted || this.disposed || this.flights.has(pageId)) return;
		if (this.captures.has(pageId)) { await this.retry(pageId); return; }
		this.flights.add(pageId); this.update(pageId, "preparing");
		try {
			if (this.generation === null) throw new Error("Device unavailable");
			if (!await preparation.finish() || !preparation.valid() || this.deleted || this.disposed) { this.notices.delete(pageId); return; }
			// Freeze all inputs in the caller's one synchronous completed-stroke task.
			const frozen = preparation.freeze();
			const source = notebookSourceSchema.parse(frozen.source), sourceJson = canonicalHandwriting(source);
			if (source.journal.pageId !== pageId || frozen.draft.chatId !== this.chatId) throw new Error("Capture target changed");
			const fingerprints = await handwritingFingerprints(source);
			if (this.deleted) return;
			if (preparation.head?.contentFingerprint === fingerprints.contentFingerprint) {
				await this.deps.device.saveDraft(this.chatId, this.generation, frozen.draft);
				this.update(pageId, "unchanged");
				if (!this.disposed && preparation.valid()) this.deps.reveal();
				return;
			}
			const capture: CaptureRecord = { version: 1, chatId: this.chatId, pageId, writingId: `writing_${crypto.randomUUID()}`, expectedPageRevision: preparation.head?.revision ?? 0, sourceJson, ...fingerprints, capturedAt: new Date().toISOString(), explanationDraft: { targetKey: frozen.draft.targetKey, draftId: frozen.draft.draftId, revision: frozen.draft.revision }, raster: frozen.raster, state: "captured" };
			this.captures.set(pageId, capture);
			this.drafts.set(pageId, frozen.draft);
			await this.deps.device.saveCapture(this.chatId, this.generation, capture, frozen.draft);
			if (new TextEncoder().encode(sourceJson).length > LIMIT) throw new CaptureSizeError("source");
			if (!this.disposed && preparation.valid()) this.deps.reveal();
			await this.transfer(capture);
		} catch (error) {
			this.update(pageId, "local_failed", error instanceof CaptureSizeError ? error.part : undefined);
		} finally { this.flights.delete(pageId); if (!this.disposed) this.deps.changed(); }
	}
	async retry(pageId: string) {
		if (this.deleted || this.disposed || this.flights.has(pageId)) return;
		const capture = this.captures.get(pageId);
		if (!capture || this.generation === null) return;
		const limit = new TextEncoder().encode(capture.sourceJson).length > LIMIT ? "source" : (capture.png?.size ?? 0) > LIMIT ? "image" : undefined;
		if (limit) { this.update(pageId, "failed", limit); return; }
		this.flights.add(pageId);
		try { await this.deps.device.saveCapture(this.chatId, this.generation, capture, this.drafts.get(pageId)); await this.transfer(capture); }
		catch { this.update(pageId, "local_failed"); }
		finally { this.flights.delete(pageId); if (!this.disposed) this.deps.changed(); }
	}
	private async transfer(original: CaptureRecord) {
		let capture = original;
		let uploaded = false, acknowledged = false;
		if (this.deleted || this.generation === null) return;
		try {
			if (new TextEncoder().encode(capture.sourceJson).length > LIMIT) throw new CaptureSizeError("source");
			if (!capture.png) {
				if (!capture.raster) throw new Error("Missing frozen pixels");
				const png = await this.deps.encode(capture.raster);
				const { raster: _raster, ...retained } = capture;
				capture = { ...retained, png, state: "ready" };
				await this.deps.device.saveCapture(this.chatId, this.generation, capture);
				this.captures.set(capture.pageId, capture);
			}
			if (capture.png!.size > LIMIT) throw new CaptureSizeError("image");
			capture = { ...capture, state: "uploading" };
			await this.deps.device.saveCapture(this.chatId, this.generation, capture);
			if (this.deleted) return;
			this.update(capture.pageId, "uploading");
			const form = new FormData();
			form.set("writingId", capture.writingId); form.set("pageId", capture.pageId); form.set("expectedPageRevision", String(capture.expectedPageRevision));
			form.set("source", new Blob([capture.sourceJson], { type: "application/json" }), "source.json"); form.set("image", capture.png!, "image.png");
			uploaded = true;
			const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/writing`, { method: "POST", body: form });
			if (response.status === 404) { this.update(capture.pageId, "unavailable"); return; }
			const result = await response.json();
			if (!response.ok) {
				if (result.code === "page_changed") {
					await this.deps.device.saveCapture(this.chatId, this.generation, { ...capture, state: "conflicted", error: result.error });
					this.captures.delete(capture.pageId); await this.deps.refresh().catch(() => {});
					this.update(capture.pageId, "conflicted"); return;
				}
				throw new Error(result.error ?? "Upload failed");
			}
			const writing = result.writing as SharedWriting;
			if (writing.id !== capture.writingId || writing.notebook?.pageId !== capture.pageId || writing.notebook.pageRevision !== capture.expectedPageRevision + 1 || writing.notebook.contentFingerprint !== capture.contentFingerprint) throw new Error("Invalid capture receipt");
			acknowledged = true;
			await this.deps.device.finishCapture(this.chatId, this.generation, capture.writingId, { version: 1, chatId: this.chatId, pageId: capture.pageId, sourceFingerprint: capture.sourceFingerprint, contentFingerprint: capture.contentFingerprint, writingId: capture.writingId, pageRevision: writing.notebook.pageRevision, createdAt: writing.createdAt });
			this.captures.delete(capture.pageId);
			try {
				const review = await this.deps.refresh(), head = review.pageAttachments[capture.pageId];
				this.update(capture.pageId, head?.writingId !== capture.writingId ? "superseded" : review.pending.some(item => item.id === capture.writingId) ? capture.expectedPageRevision > 0 ? "updated" : "attached" : "sent");
				if (!this.disposed) this.deps.reveal();
			} catch { this.update(capture.pageId, "refresh_failed"); }
		} catch (error) {
			capture = { ...capture, state: "failed", error: error instanceof Error ? error.message : "Upload failed" };
			this.captures.set(capture.pageId, capture);
			try { await this.deps.device.saveCapture(this.chatId, this.generation, capture); }
			catch {
				this.update(capture.pageId, acknowledged ? "refresh_failed" : uploaded ? "failed" : "local_failed");
				return;
			}
			this.update(capture.pageId, acknowledged ? "refresh_failed" : "failed", error instanceof CaptureSizeError ? error.part : undefined);
		}
	}
	dispose() { this.disposed = true; }
	sessionDeleted() { this.deleted = true; this.disposed = true; }
}
