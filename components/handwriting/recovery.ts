import { emptyHandwriting, appendHandwriting, handwritingSchema, handwritingPrefix, replayHandwriting, reconcileHandwriting, type Handwriting, type HandwritingStroke, type HandwritingOperation } from "../../src/core/index.ts";
import { handwritingKey, handwritingRecoveryKey, clearHandwritingDevice } from "./device.ts";
export { handwritingKey, handwritingRecoveryKey } from "./device.ts";

type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Dependencies = { storage: () => DeviceStorage; fetch: (url: string, init?: RequestInit) => Promise<Response> };
export type RecoveryState = { working: Handwriting; ready: boolean; notice: string | null };

/** Local write-ahead journal + ordered server sync. Completed operations own
 * immutable IDs; ACKs never remove the recovery copy or replace a newer tail.
 * A disposed controller may finish a request, but cannot write device state. */
export class HandwritingRecovery {
	private state: RecoveryState = { working: emptyHandwriting(), ready: false, notice: "Opening notebook…" };
	private listeners = new Set<() => void>();
	private disposed = false;
	private localSaved = false;
	private acknowledged: Handwriting = emptyHandwriting();
	private flight: Promise<void> | null = null;
	private opening: Promise<void> | null = null;
	private blocked = false;
	private deleted = false;
	constructor(private chatId: string, private deps: Dependencies) {}
	getSnapshot = () => this.state;
	subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
	private update(patch: Partial<RecoveryState>) {
		if (this.disposed) return;
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener();
	}
	page() { return replayHandwriting(this.state.working).strokes; }
	private deviceReadFailure() {
		this.blocked = true;
		this.update({ ready: false, notice: "Couldn’t read handwriting on this device. Existing working is kept unchanged. Retry before editing." });
	}
	private restoreDevice(): boolean {
		// A completed stroke accepted before an ACK blocked reconciliation may
		// have its own recovery copy. Recover it first, even when the primary
		// record is unreadable. Neither copy is silently replaced on divergence.
		for (const key of [handwritingRecoveryKey(this.chatId), handwritingKey(this.chatId)]) {
			let text: string | null, saved: Handwriting;
			try {
				text = this.deps.storage().getItem(key);
				if (text === null) continue;
				saved = handwritingSchema.parse(JSON.parse(text));
			} catch { this.deviceReadFailure(); return false; }
			try { this.update({ working: reconcileHandwriting(this.state.working, saved) }); }
			catch { this.conflict(); return false; }
			this.localSaved = handwritingPrefix(this.state.working, saved);
		}
		return true;
	}
	private preserveBlockedWorking() {
		if (!this.localSaved) {
			// This copy has a distinct key: a corrupt/newer/divergent primary is
			// left byte-for-byte intact. Do not overwrite an unknown recovery copy.
			try {
				const storage = this.deps.storage(), key = handwritingRecoveryKey(this.chatId);
				const previous = storage.getItem(key);
				if (previous === null || handwritingPrefix(handwritingSchema.parse(JSON.parse(previous)), this.state.working)) {
					const text = JSON.stringify(this.state.working);
					storage.setItem(key, text); this.localSaved = storage.getItem(key) === text;
				}
			} catch { /* visible working remains in memory; never claim durability */ }
		}
		this.update({ notice: `${this.state.notice} ${this.localSaved ? "Latest working is saved on this device." : "Latest working could not be saved on this device or to LearnHarness. Keep this page open."}` });
	}
	private retireRecoveryCopy(acknowledged: Handwriting) {
		if (this.disposed || this.deleted) return;
		try {
			const storage = this.deps.storage(), key = handwritingRecoveryKey(this.chatId), text = storage.getItem(key);
			if (text !== null && handwritingPrefix(handwritingSchema.parse(JSON.parse(text)), acknowledged)) storage.removeItem(key);
		} catch { /* Keeping a redundant/unreadable recovery copy is safe. */ }
	}
	private persist(): boolean {
		let storage: DeviceStorage, previous: string | null;
		const key = handwritingKey(this.chatId);
		try { storage = this.deps.storage(); previous = storage.getItem(key); }
		catch { this.deviceReadFailure(); return false; }
		try {
			if (previous !== null) {
				let journal: Handwriting;
				try { journal = handwritingSchema.parse(JSON.parse(previous)); }
				catch {
					this.blocked = true;
					this.update({ ready: false, notice: "Couldn’t read the handwriting saved on this device. It has been kept unchanged. Retry to read again." });
					return false;
				}
				if (!handwritingPrefix(journal, this.state.working)) { this.conflict(); return false; }
			}
			const text = JSON.stringify(this.state.working);
			storage.setItem(key, text);
			return storage.getItem(key) === text;
		} catch { return false; }
	}
	private async response(response: Response): Promise<Handwriting> {
		if (response.status === 404) {
			this.blocked = true;
			this.update({ ready: false, notice: "This session is unavailable. Your device recovery has been kept." });
			throw new Error("unavailable");
		}
		if (response.status === 409) { this.conflict(); throw new Error("conflict"); }
		if (!response.ok) throw new Error("unavailable");
		return handwritingSchema.parse(await response.json());
	}
	private conflict() {
		this.blocked = true;
		this.update({ ready: false, notice: "Handwriting histories differ. Current working stays on this page and saved copies are unchanged. Keep this page open; Retry checks again without replacing them." });
	}
	open(): Promise<void> {
		if (this.opening) return this.opening;
		this.opening = this.load().finally(() => { this.opening = null; });
		return this.opening;
	}
	private async load() {
		if (this.disposed || this.deleted) return;
		if (!this.restoreDevice()) return;
		try {
			const remote = await this.response(await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting`, { cache: "no-store" }));
			if (this.disposed || this.deleted) return;
			try { this.update({ working: reconcileHandwriting(this.state.working, remote) }); }
			catch { this.conflict(); return; }
			this.blocked = false;
			this.acknowledged = remote;
			this.localSaved = this.persist();
			if (this.blocked) return;
			this.update({ ready: true, notice: null });
			await this.sync();
			this.retireRecoveryCopy(remote);
		} catch {
			if (!this.deleted && !this.blocked) this.update({ ready: false, notice: "Couldn’t open saved handwriting. Your working is retained. Retry before editing." });
		}
	}
	/** Admission is decided on pointerdown. An ACK can block the next stroke,
	 * but cannot revoke this accepted stroke's one completed operation. */
	beginStroke(): ((stroke: HandwritingStroke) => void) | null {
		if (!this.state.ready || this.disposed || this.blocked || this.deleted) return null;
		const base = this.state.working;
		let completed = false;
		return stroke => {
			if (completed) return;
			completed = true;
			this.append({ id: crypto.randomUUID(), kind: "stroke", stroke: structuredClone(stroke) }, base);
		};
	}
	draw(stroke: HandwritingStroke) { this.beginStroke()?.(stroke); }
	clear() { const page = replayHandwriting(this.state.working); if (page.strokes.length || page.background) this.append({ id: crypto.randomUUID(), kind: "clear" }); }
	undo() {
		if (replayHandwriting(this.state.working).canUndo) this.append({ id: crypto.randomUUID(), kind: "undo" });
	}
	redo() {
		if (replayHandwriting(this.state.working).canRedo) this.append({ id: crypto.randomUUID(), kind: "redo" });
	}
	private append(operation: HandwritingOperation, acceptedBase?: Handwriting) {
		if (this.disposed || this.deleted || (!acceptedBase && (!this.state.ready || this.blocked))) return;
		if (acceptedBase && (!handwritingPrefix(this.state.working, acceptedBase) || !handwritingPrefix(acceptedBase, this.state.working))) this.conflict();
		// This entire write occurs on pointer completion, never pointer movement.
		this.state = { ...this.state, working: appendHandwriting(acceptedBase ?? this.state.working, operation) };
		this.localSaved = this.persist();
		if (this.blocked) { this.preserveBlockedWorking(); return; }
		this.update({ notice: this.localSaved ? null : "Couldn’t save on this device; saving to LearnHarness…" });
		void this.sync();
	}
	private sync(): Promise<void> {
		if (this.flight) return this.flight;
		this.flight = this.flush().finally(() => { this.flight = null; });
		return this.flight;
	}
	private async flush() {
		while (!this.disposed && this.state.ready && !this.blocked && !handwritingPrefix(this.state.working, this.acknowledged)) {
			const sent = this.state.working;
			try {
				const remote = await this.response(await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) }));
				if (this.disposed || this.deleted) return;
				if (!handwritingPrefix(sent, remote)) { this.conflict(); return; }
				if (handwritingPrefix(this.state.working, remote)) {
					this.update({ working: remote });
					this.localSaved = this.persist();
					if (this.blocked) return;
				} else if (!handwritingPrefix(remote, this.state.working)) { this.conflict(); return; }
				this.acknowledged = remote;
				this.retireRecoveryCopy(remote);
				this.update({ notice: this.localSaved ? null : "Saved to LearnHarness; device recovery is unavailable." });
			} catch {
				if (!this.deleted && !this.blocked) this.update({ notice: this.localSaved ? "Saved on this device; couldn’t save to LearnHarness" : "Couldn’t save handwriting on this device or to LearnHarness. Keep this page open and Retry." });
				return;
			}
		}
	}
	async retry() {
		if (this.disposed || this.deleted) return;
		if (!this.state.ready) { this.blocked = false; await this.open(); return; }
		this.localSaved = this.persist();
		await this.sync();
		if (this.state.ready && handwritingPrefix(this.state.working, this.acknowledged)) this.update({ notice: this.localSaved ? null : "Saved to LearnHarness; device recovery is unavailable." });
	}
	dispose() { this.disposed = true; this.listeners.clear(); }
	sessionDeleted() {
		this.deleted = true;
		if (this.disposed) return;
		clearHandwritingDevice(this.chatId, this.deps.storage);
		this.update({ ready: false, notice: "This session is no longer available. Handwriting cannot be synced." });
	}
}
