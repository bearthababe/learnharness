import { emptyHandwriting, handwritingSchema, handwritingPrefix, handwritingPage, type Handwriting, type HandwritingStroke, type HandwritingOperation } from "../../src/core/index.ts";

type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Dependencies = { storage: () => DeviceStorage; fetch: (url: string, init?: RequestInit) => Promise<Response> };
export type RecoveryState = { working: Handwriting; ready: boolean; notice: string | null };
export const handwritingKey = (id: string) => `lh:handwriting:v1:${id}`;

/** Local write-ahead journal + ordered server sync. Completed operations own
 * immutable IDs; ACKs never remove the recovery copy or replace a newer tail.
 * A disposed controller may finish a request, but cannot write device state. */
export class HandwritingRecovery {
	private state: RecoveryState = { working: emptyHandwriting(), ready: false, notice: "Opening notebook…" };
	private listeners = new Set<() => void>();
	private disposed = false;
	private loadedLocal = false;
	private localSaved = false;
	private acknowledged = 0;
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
	page() { return handwritingPage(this.state.working); }
	private persist(): boolean {
		try {
			const storage = this.deps.storage(), key = handwritingKey(this.chatId);
			const previous = storage.getItem(key);
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
			this.deleted = true;
			if (!this.disposed) {
				try { this.deps.storage().removeItem(handwritingKey(this.chatId)); this.deps.storage().removeItem(`lh:handwriting:open:${this.chatId}`); } catch { /* best effort; server still refuses replay */ }
				this.update({ ready: false, notice: "This session is no longer available. Handwriting cannot be synced." });
			}
			throw new Error("deleted");
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
		if (!this.loadedLocal) {
			let text: string | null = null;
			try { text = this.deps.storage().getItem(handwritingKey(this.chatId)); }
			catch { this.update({ ready: false, notice: "Couldn’t read handwriting on this device. Existing working is kept unchanged. Retry before editing." }); return; }
			if (text !== null) {
				try { this.update({ working: handwritingSchema.parse(JSON.parse(text)) }); this.localSaved = true; }
				catch { this.update({ ready: false, notice: "Couldn’t read the handwriting saved on this device. It has been kept unchanged. Retry to read again." }); return; }
			}
			this.loadedLocal = true;
		}
		try {
			const remote = await this.response(await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting`, { cache: "no-store" }));
			if (this.disposed) return;
			const local = this.state.working;
			if (handwritingPrefix(local, remote)) this.update({ working: remote });
			else if (!handwritingPrefix(remote, local)) { this.conflict(); return; }
			this.blocked = false;
			this.acknowledged = remote.operations.length;
			this.localSaved = this.persist();
			if (this.blocked) return;
			this.update({ ready: true, notice: null });
			await this.sync();
		} catch {
			if (!this.deleted && !this.blocked) this.update({ ready: false, notice: "Couldn’t open saved handwriting. Your working is retained. Retry before editing." });
		}
	}
	draw(stroke: HandwritingStroke) { this.append({ id: crypto.randomUUID(), kind: "stroke", stroke: structuredClone(stroke) }); }
	clear() { if (this.page().length) this.append({ id: crypto.randomUUID(), kind: "clear" }); }
	undo() {
		let depth = 0;
		for (const op of this.state.working.operations) depth = op.kind === "undo" ? Math.max(0, depth - 1) : depth + 1;
		if (depth) this.append({ id: crypto.randomUUID(), kind: "undo" });
	}
	private append(operation: HandwritingOperation) {
		if (!this.state.ready || this.disposed || this.blocked) return;
		// This entire write occurs on pointer completion, never pointer movement.
		this.state = { ...this.state, working: { version: 1, operations: [...this.state.working.operations, operation] } };
		this.localSaved = this.persist();
		if (this.blocked) return;
		this.update({ notice: this.localSaved ? null : "Couldn’t save on this device; saving to LearnHarness…" });
		void this.sync();
	}
	private sync(): Promise<void> {
		if (this.flight) return this.flight;
		this.flight = this.flush().finally(() => { this.flight = null; });
		return this.flight;
	}
	private async flush() {
		while (!this.disposed && this.state.ready && !this.blocked && this.acknowledged < this.state.working.operations.length) {
			const sent = this.state.working;
			try {
				const remote = await this.response(await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) }));
				if (this.disposed) return;
				if (!handwritingPrefix(sent, remote)) { this.conflict(); return; }
				if (handwritingPrefix(this.state.working, remote)) {
					this.update({ working: remote });
					this.localSaved = this.persist();
					if (this.blocked) return;
				} else if (!handwritingPrefix(remote, this.state.working)) { this.conflict(); return; }
				this.acknowledged = remote.operations.length;
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
		if (this.state.ready && this.acknowledged === this.state.working.operations.length) this.update({ notice: this.localSaved ? null : "Saved to LearnHarness; device recovery is unavailable." });
	}
	dispose() { this.disposed = true; this.listeners.clear(); }
}
