import { appendHandwriting, canonicalHandwriting, copyHandwriting, handwritingAtHead, handwritingContent, handwritingFingerprints, handwritingPageSchema, handwritingPrefix, handwritingSchema, initialHandwritingPage, normalizeHandwriting, notebookSource, notebookSourceSchema, orderedPages, pageSummary, pageSummarySchema, reconcileHandwritingPage, adoptHandwritingPageMetadata, replayHandwriting, restoreHandwriting, importHandwritingBackground, type BackgroundPixels, type HandwritingPage, type HandwritingStroke, type HandwritingOperation, type HandwritingV2, type NotebookSource, type PageCreation, type PageSummary, type SharedWriting } from "../../src/core/index.ts";
import { compactPage, hydratePage, pageDeviceKey, pageRecoveryKey, PageDeviceConflict, type PagesDevice, type PageAction } from "./pages-device.ts";
import { handwritingKey, handwritingRecoveryKey } from "./device.ts";
import { HandwritingConflict } from "../../src/core/index.ts";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Dependencies = { device: PagesDevice; storage: () => StoragePort; fetch: typeof fetch; prepare: (page: HandwritingPage) => Promise<void>; flatten: (url: string) => Promise<BackgroundPixels>; preserveDrafts?: () => Promise<void> };
export type SnapshotWriting = Pick<SharedWriting, "id"> & Partial<Pick<SharedWriting, "editableSource" | "notebook">>;
export type OpenChoice = "current" | "restore" | "copy" | "cancel";
export type PageDecision = { writing: SnapshotWriting; source: NotebookSource; target: HandwritingPage; expectedHead: string | null; external: boolean };
export type PagesState = { working: HandwritingV2; page: HandwritingPage; pages: PageSummary[]; ready: boolean; notice: string | null; decision: PageDecision | null; busy: boolean };
const blank = () => initialHandwritingPage({ version: 1, operations: [] });
const deviceFailure = "Couldn’t save the current page on this device. It is still open. Retry before switching.";
const loadFailure = "Couldn’t load this snapshot’s editable history. Your current page is unchanged.";
const syncFailure = "Saved on this device; couldn’t save to LearnHarness";
const conflictNotice = "Handwriting histories differ. Current working stays on this page and saved copies are unchanged. Keep this page open; Retry checks again without replacing them.";
class PageReadError extends Error { constructor(readonly page: HandwritingPage) { super("Unreadable device working"); } }
class CheckpointWriteError extends Error {}

/** Local acceptance owns navigation/history. The server flight owns only sync:
 * it cannot select a page, rerun a decision or allocate another action identity. */
export class HandwritingPages {
	private state: PagesState = { working: blank().journal, page: blank(), pages: [], ready: false, notice: "Opening notebook…", decision: null, busy: false };
	private pages = new Map<string, HandwritingPage>();
	private summaries = new Map<string, PageSummary>();
	private assets = new Map<string, BackgroundPixels>();
	private remote = new Map<string, HandwritingPage | null>();
	private actions = new Map<string, PageAction>();
	private listeners = new Set<() => void>();
	private generation: number | null = null;
	private disposed = false;
	private deleted = false;
	private blocked = new Set<string>();
	private localSaved = new Set<string>();
	private flights = new Map<string, Promise<void>>();
	private localFlight: Promise<void> = Promise.resolve();
	private opening: Promise<void> | null = null;
	private strokes = 0;
	private actionEpoch = 0;
	private listFailed = false;
	constructor(private chatId: string, private deps: Dependencies) {}
	getSnapshot = () => this.state;
	subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
	private alive() { return !this.disposed && !this.deleted; }
	private update(patch: Partial<PagesState> = {}) {
		if (!this.alive()) return;
		this.state = { ...this.state, ...patch, pages: orderedPages([...this.summaries.values()]) };
		for (const listener of this.listeners) listener();
	}
	private remember(page: HandwritingPage) {
		this.pages.set(page.id, page); this.summaries.set(page.id, pageSummary(page));
		for (const [id, asset] of Object.entries(page.journal.backgrounds)) this.assets.set(id, asset);
	}
	private activate(page: HandwritingPage, notice: string | null = null, preserveDecision = false) { this.remember(page); this.update({ page, working: page.journal, ready: !this.blocked.has(page.id), notice, decision: preserveDecision ? this.state.decision : null }); }
	private conflict(pageId: string) { this.blocked.add(pageId); this.update({ ready: this.state.page.id === pageId ? false : this.state.ready, notice: conflictNotice }); }
	private reconcileDevice(page: HandwritingPage, authoritative = false): HandwritingPage {
		let next = page;
		try {
		for (const key of [pageRecoveryKey(this.chatId, page.id), pageDeviceKey(this.chatId, page.id)]) {
			const text = this.deps.storage().getItem(key); if (text !== null) { const saved = hydratePage(JSON.parse(text), this.assets); next = authoritative ? adoptHandwritingPageMetadata(saved, next) : reconcileHandwritingPage(next, saved); }
		}
		if (page.id === "page_initial") for (const key of [handwritingRecoveryKey(this.chatId), handwritingKey(this.chatId)]) {
			const text = this.deps.storage().getItem(key); if (text !== null) next = reconcileHandwritingPage(next, initialHandwritingPage(handwritingSchema.parse(JSON.parse(text))));
		}
		return next;
		} catch { throw new PageReadError(next); }
	}
	private mirror(page: HandwritingPage, authoritative = false): boolean {
		try {
			const current = this.reconcileDevice(page, authoritative);
			if (current.journal.head !== page.journal.head) { this.conflict(page.id); return false; }
			const key = pageDeviceKey(this.chatId, page.id), text = JSON.stringify(compactPage(page)), storage = this.deps.storage();
			storage.setItem(key, text); const saved = storage.getItem(key) === text;
			if (saved) this.localSaved.add(page.id); return saved;
		} catch { return false; }
	}
	private preserveSecondary(page: HandwritingPage) {
		try {
			const key = pageRecoveryKey(this.chatId, page.id), storage = this.deps.storage(), old = storage.getItem(key);
			if (old !== null && !handwritingPrefix(hydratePage(JSON.parse(old), this.assets).journal, page.journal)) return;
			const text = JSON.stringify(compactPage(page)); storage.setItem(key, text); if (storage.getItem(key) === text) this.localSaved.add(page.id);
		} catch { /* Never overwrite unknown recovery to claim success. */ }
	}
	private async localRead() {
		if (this.generation === null) throw new Error("Device not open");
		const saved = await this.deps.device.read(this.chatId, this.generation);
		for (const page of saved.pages) for (const [id, asset] of Object.entries(page.journal.backgrounds)) this.assets.set(id, asset);
		return saved;
	}
	private async getRemote(pageId: string) {
		const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting/pages/${encodeURIComponent(pageId)}`, { cache: "no-store" });
		if (response.status === 404) { const result = await response.json(); if (result.code === "page_not_found") { this.remote.set(pageId, null); return null; } this.unavailable(); throw new Error("Session unavailable"); }
		if (!response.ok) throw new Error("Could not read working");
		const page = handwritingPageSchema.parse(await response.json()); if (page.id !== pageId) throw new Error("Wrong page"); this.remote.set(pageId, page); return page;
	}
	private unavailable() { this.blocked.add(this.state.page.id); this.update({ ready: false, notice: "This session is unavailable. Your device recovery has been kept." }); }
	open() { if (this.state.ready) return Promise.resolve(); return this.opening ??= this.load().finally(() => { this.opening = null; }); }
	private async load() {
		if (!this.alive()) return;
		try {
			const session = await this.deps.device.open(this.chatId); this.generation = session.generation;
			const saved = await this.localRead(); if (!this.alive()) return;
			for (const action of saved.actions) this.actions.set(action.actionId, action);
			for (const page of saved.pages) { const reconciled = this.reconcileDevice(page); this.remember(reconciled); this.localSaved.add(page.id); }
			// Old keys are read even after migration, including corrupt/old-tab tails.
			const initial = this.reconcileDevice(this.pages.get("page_initial") ?? blank());
			if (initial.journal.head !== null || this.pages.has("page_initial")) this.remember(initial);
			const selected = saved.session.activePageId;
			let page = this.pages.get(selected);
			if (!page) { const remote = await this.getRemote(selected); if (!remote && selected !== "page_initial") throw new Error("Missing selected page"); page = remote ?? blank(); if (remote) this.remember(remote); }
			if (this.blocked.has(selected)) { const remote = await this.getRemote(selected); if (remote) page = reconcileHandwritingPage(page, remote); }
			page = this.reconcileDevice(page);
			await this.deps.prepare(page); if (!this.alive()) return;
			this.blocked.delete(selected);
			this.activate(page); // existing local acceptance is usable before network ACK
			if (selected === "page_initial" && page.journal.head === null && !saved.pages.some(page => page.id === selected) && this.remote.get(selected) === null && initial.journal.head === null) this.pages.delete(selected);
			await this.refreshPages().catch(() => {});
			if (!this.alive()) return;
			void this.retry();
		} catch (error) {
			if (error instanceof PageReadError) { this.remember(error.page); this.update({ page: error.page, working: error.page.journal }); }
			if (this.alive()) this.update({ ready: false, notice: "Couldn’t open saved handwriting. Your working is retained. Retry before editing." });
		}
	}
	async refreshPages() {
		try {
		const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting/pages`, { cache: "no-store" });
		if (response.status === 404) { this.unavailable(); throw new Error("Session unavailable"); }
		if (!response.ok) throw new Error("Could not list pages");
		const result = await response.json(); if (!Array.isArray(result.pages)) throw new Error("Invalid page list");
		const summaries = result.pages.map((value: unknown) => pageSummarySchema.parse(value));
		if (!this.alive()) return;
		for (const summary of summaries) this.summaries.set(summary.id, summary); this.listFailed = false; this.update({ notice: this.state.notice === "Couldn’t load pages. Your current page is unchanged." ? null : this.state.notice });
		} catch (error) { this.listFailed = true; if (this.state.ready) this.update({ notice: "Couldn’t load pages. Your current page is unchanged." }); throw error; }
	}
	async readPage(pageId: string): Promise<HandwritingPage | null> {
		const saved = await this.localRead(), persisted = saved.pages.find(page => page.id === pageId);
		let page = this.pages.get(pageId);
		let compact: HandwritingPage | undefined;
		for (const key of [pageRecoveryKey(this.chatId, pageId), pageDeviceKey(this.chatId, pageId)]) {
			const text = this.deps.storage().getItem(key); if (text === null) continue;
			const found = hydratePage(JSON.parse(text), this.assets); if (found.id !== pageId) throw new Error("Wrong recovery identity");
			compact = compact ? reconcileHandwritingPage(compact, found) : found;
		}
		// The fresh-session virtual blank is not proof of an original's existence.
		if (page?.id === "page_initial" && page.journal.head === null && !persisted && !compact && !this.localSaved.has(pageId) && this.remote.get(pageId) === null) page = undefined;
		if (compact) page = page ? reconcileHandwritingPage(page, compact) : compact;
		if (persisted) page = page ? reconcileHandwritingPage(page, persisted) : persisted;
		if (page) page = this.reconcileDevice(page);
		if (!this.remote.has(pageId) && !persisted) {
			const remote = await this.getRemote(pageId);
			if (remote) page = page ? reconcileHandwritingPage(page, remote) : remote;
		}
		if (page) { for (const [id, asset] of Object.entries(page.journal.backgrounds)) this.assets.set(id, asset); await this.deps.prepare(page); }
		return page ?? null;
	}
	beginStroke(): ((stroke: HandwritingStroke) => void) | null {
		if (!this.alive() || !this.state.ready || this.state.busy || this.blocked.has(this.state.page.id)) return null;
		const page = this.state.page; this.strokes++; let completed = false;
		return stroke => { if (completed) return; completed = true; this.strokes--; this.append({ id: crypto.randomUUID(), kind: "stroke", stroke: structuredClone(stroke) }, page); };
	}
	draw(stroke: HandwritingStroke) { this.beginStroke()?.(stroke); }
	undo() { if (replayHandwriting(this.state.working).canUndo) this.append({ id: crypto.randomUUID(), kind: "undo" }); }
	redo() { if (replayHandwriting(this.state.working).canRedo) this.append({ id: crypto.randomUUID(), kind: "redo" }); }
	clear() { const content = replayHandwriting(this.state.working); if (content.strokes.length || content.background) this.append({ id: crypto.randomUUID(), kind: "clear" }); }
	private append(operation: HandwritingOperation, admitted?: HandwritingPage) {
		if (!this.alive() || (!admitted && (!this.state.ready || this.state.busy || this.strokes))) return;
		const before = admitted ?? this.state.page, page = { ...before, journal: appendHandwriting(before.journal, operation) };
		if (admitted && before.journal.head !== this.state.working.head) this.conflict(page.id);
		this.remember(page);
		this.localSaved.delete(page.id);
		let readFailed = false;
		try { const reconciled = this.reconcileDevice(page); if (reconciled.journal.head !== page.journal.head) readFailed = true; } catch { readFailed = true; }
		if (readFailed) this.conflict(page.id);
		const mirrored = !readFailed && this.mirror(page);
		if (this.blocked.has(page.id)) { this.preserveSecondary(page); this.update({ page, working: page.journal, ready: false, notice: `${conflictNotice} ${this.localSaved.has(page.id) ? "Latest working is saved on this device." : "Latest working could not be saved on this device or to LearnHarness. Keep this page open."}` }); return; }
		this.activate(page, mirrored ? null : "Couldn’t save on this device; saving to LearnHarness…", true);
		void this.checkpoint().then(() => this.sync(page.id)).catch(error => { if (error instanceof CheckpointWriteError) void this.sync(page.id); else if (this.alive()) this.update({ ready: false, notice: "Couldn’t read handwriting on this device. Existing working is kept unchanged. Retry before editing." }); });
	}
	private checkpoint() {
		const task = this.localFlight.catch(() => {}).then(async () => {
			if (!this.alive() || this.generation === null) return;
			const saved = await this.localRead(), pages = [...this.pages.values()].filter(page => !this.blocked.has(page.id));
			const expected: Record<string, { head: string | null } | null> = {};
			for (let i = 0; i < pages.length; i++) {
				const page = pages[i]!, old = saved.pages.find(item => item.id === page.id); expected[page.id] = old ? { head: old.journal.head } : null;
				const next = this.reconcileDevice(old ? reconcileHandwritingPage(page, old) : page);
				if (next.journal.head !== page.journal.head) { this.conflict(page.id); throw new Error("Newer local history"); }
				pages[i] = next;
			}
			if (!this.alive()) return;
			try { await this.deps.device.commit(this.chatId, this.generation, { pages, expected, valid: () => this.alive() }); }
			catch (error) { if (error instanceof PageDeviceConflict || error instanceof HandwritingConflict) { this.conflict(this.state.page.id); throw error; } throw new CheckpointWriteError("Could not checkpoint working"); }
			for (const page of pages) if (this.pages.get(page.id)?.journal.head === page.journal.head) this.localSaved.add(page.id);
		}); this.localFlight = task; return task;
	}
	private async transition(target: HandwritingPage, action?: PageAction, epoch = this.actionEpoch): Promise<boolean> {
		if (!this.alive() || this.generation === null || this.strokes) return false;
		const outgoing = this.state.page;
		try {
			await this.localFlight.catch(() => {});
			await this.deps.preserveDrafts?.();
			await this.deps.prepare(target);
			const saved = await this.localRead();
			if (!this.alive() || epoch !== this.actionEpoch) return false;
			const pages = outgoing.id === target.id ? [target] : [outgoing, target], expected: Record<string, { head: string | null } | null> = {};
			for (const page of pages) {
				const old = saved.pages.find(item => item.id === page.id); expected[page.id] = old ? { head: old.journal.head } : null;
				if (old && action && action.kind !== "restore" && action.pageId === page.id) throw new Error("Original appeared during preparation");
				if (old && reconcileHandwritingPage(old, page).journal.head !== page.journal.head) throw new Error("Newer local working");
				if (this.reconcileDevice(page).journal.head !== page.journal.head) throw new Error("Newer synchronous recovery");
			}
			if (action?.kind === "restore" && this.state.working.pageId === target.id && this.state.working.head !== action.expectedHead) throw new Error("Restore decision changed");
			if (!this.alive() || epoch !== this.actionEpoch) return false;
			await this.deps.device.commit(this.chatId, this.generation, { pages, expected, activePageId: target.id, expectedActivePageId: outgoing.id, action, valid: () => this.alive() && epoch === this.actionEpoch });
			// The action is accepted now, even if its view was unmounted meanwhile.
			if (!this.alive()) return true;
			if (action) this.actions.set(action.actionId, action);
			let mirrored = true;
			for (const page of pages) { this.remember(page); this.localSaved.add(page.id); mirrored = this.mirror(page) && mirrored; }
			this.activate(target, mirrored ? action?.kind === "restore" ? "Snapshot restored · Undo available" : action?.kind === "duplicate" ? "Copy opened · not attached" : null : "Page saved on this device. Couldn’t finish opening it.");
			for (const page of pages) void this.sync(page.id);
			return true;
		} catch { if (this.alive()) this.update({ notice: deviceFailure }); return false; }
	}
	async switchPage(pageId: string) {
		if (!this.state.ready || this.state.busy || this.strokes) return false;
		if (pageId === this.state.page.id && !this.pages.has(pageId)) return true;
		this.update({ busy: true, notice: "Opening page…" });
		try { const page = await this.readPage(pageId); if (!page) throw new Error("Missing page"); return await this.transition(page); }
		catch { this.update({ notice: loadFailure }); return false; }
		finally { this.update({ busy: false }); }
	}
	async duplicateWorking() {
		if (!this.state.ready || this.state.busy || this.strokes) return false;
		const original = structuredClone(this.state.page); this.update({ busy: true, notice: "Duplicating page…" });
		try { return await this.copy(notebookSource(original.journal), { kind: "working", pageId: original.id }); }
		catch { this.update({ notice: deviceFailure }); return false; }
		finally { this.update({ busy: false }); }
	}
	private async copy(source: NotebookSource, from: PageCreation["from"]) {
		const epoch = this.actionEpoch;
		const id = `page_${crypto.randomUUID()}`, journal = copyHandwriting(source.journal, id), { sourceFingerprint } = await handwritingFingerprints(notebookSource(journal));
		const target: HandwritingPage = { version: 1, id, createdAt: new Date().toISOString(), origin: { kind: "duplicate", from, seedFingerprint: sourceFingerprint }, journal };
		return this.transition(target, { version: 1, chatId: this.chatId, actionId: crypto.randomUUID(), kind: "duplicate", pageId: id, ...(from.kind === "snapshot" ? { writingId: from.writingId } : {}), seedHead: target.journal.head, seedFingerprint: sourceFingerprint, state: "local-committed" }, epoch);
	}
	async openSnapshot(writing: SnapshotWriting, duplicate = false): Promise<"opened" | "choice" | "failed"> {
		if (!this.state.ready || this.state.busy || this.strokes) return "failed";
		const epoch = ++this.actionEpoch;
		this.update({ busy: true, notice: duplicate ? "Duplicating page…" : "Opening page…" });
		try {
			const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/writing/${encodeURIComponent(writing.id)}/source`, { cache: "no-store" });
			let source: NotebookSource, external = false, target: HandwritingPage | null = null;
			if (response.ok) {
				source = notebookSourceSchema.parse(await response.json());
				if (writing.notebook && writing.notebook.pageId !== source.journal.pageId) throw new Error("Snapshot page identity mismatch");
				if (writing.notebook && writing.notebook.contentFingerprint !== (await handwritingFingerprints(source)).contentFingerprint) throw new Error("Snapshot content identity mismatch");
			} else {
				const result = await response.json();
				if (response.status !== 404 || result.code !== "no_editable_source" || writing.editableSource || writing.notebook) throw new Error("Promised source unavailable");
				external = true;
				await this.refreshPages();
				const candidates = [...this.summaries.values()].filter(page => page.origin.kind === "external" && page.origin.writingId === writing.id);
				if (candidates.length > 1) throw new Error("Conflicting external mapping");
				if (candidates[0]) {
					target = await this.readPage(candidates[0].id);
					if (!target || target.origin.kind !== "external") throw new Error("Missing external original");
					source = notebookSource(handwritingAtHead(target.journal, target.origin.seedHead));
					if ((await handwritingFingerprints(source)).sourceFingerprint !== target.origin.seedFingerprint) throw new Error("Corrupt external seed");
				} else {
					const background = await this.deps.flatten(`/api/chats/${encodeURIComponent(this.chatId)}/writing/${encodeURIComponent(writing.id)}`);
					const id = `page_${crypto.randomUUID()}`, journal = await importHandwritingBackground(copyHandwriting({ version: 1, operations: [] }, id), background, crypto.randomUUID());
					source = notebookSource(journal);
				}
			}
			if (!this.alive() || epoch !== this.actionEpoch) return "failed";
			if (duplicate) return await this.copy(source, { kind: "snapshot", writingId: writing.id }) ? "opened" : "failed";
			if (!external) target = await this.readPage(source.journal.pageId);
			if (!this.alive() || epoch !== this.actionEpoch) return "failed";
			if (!target) {
				const id = source.journal.pageId, { sourceFingerprint } = await handwritingFingerprints(source);
				const page: HandwritingPage = { version: 1, id, createdAt: id === "page_initial" ? null : new Date().toISOString(), journal: source.journal, origin: id === "page_initial" ? { kind: "working" } : external ? { kind: "external", writingId: writing.id, seedHead: source.journal.head!, seedFingerprint: sourceFingerprint } : { kind: "recovered", writingId: writing.id } };
				return await this.transition(page, { version: 1, chatId: this.chatId, actionId: crypto.randomUUID(), kind: external ? "external" : "recover", pageId: id, writingId: writing.id, seedHead: source.journal.head, seedFingerprint: sourceFingerprint, state: "local-committed" }, epoch) ? "opened" : "failed";
			}
			if (handwritingContent(target.journal) === handwritingContent(source.journal)) return await this.transition(target) ? "opened" : "failed";
			this.update({ decision: { writing, source, target, expectedHead: target.journal.head, external }, notice: null }); return "choice";
		} catch { this.update({ notice: loadFailure }); return "failed"; }
		finally { this.update({ busy: false }); }
	}
	async choose(choice: OpenChoice): Promise<"opened" | "choice" | "failed" | "cancelled"> {
		if (choice === "cancel") { this.cancelDecision(); return "cancelled"; }
		const decision = this.state.decision; if (!decision || this.state.busy || this.strokes) return "failed";
		const epoch = ++this.actionEpoch;
		this.update({ busy: true, notice: choice === "restore" ? "Restoring snapshot…" : choice === "copy" ? "Duplicating page…" : "Opening page…" });
		try {
			const target = await this.readPage(decision.target.id); if (!target) throw new Error("Original disappeared");
			if (!this.alive() || epoch !== this.actionEpoch) return "cancelled";
			if (target.journal.head !== decision.expectedHead) { this.update({ decision: { ...decision, target, expectedHead: target.journal.head }, notice: null }); return "choice"; }
			if (choice === "copy") return await this.copy(decision.source, { kind: "snapshot", writingId: decision.writing.id }) ? "opened" : "failed";
			if (choice === "current") return await this.transition(target) ? "opened" : "failed";
			const eventId = crypto.randomUUID(), journal = restoreHandwriting(target.journal, decision.source.journal, eventId), { sourceFingerprint } = await handwritingFingerprints(decision.source);
			return await this.transition({ ...target, journal }, { version: 1, chatId: this.chatId, actionId: eventId, kind: "restore", pageId: target.id, writingId: decision.writing.id, expectedHead: target.journal.head, eventId, seedHead: decision.source.journal.head, seedFingerprint: sourceFingerprint, state: "local-committed" }, epoch) ? "opened" : "failed";
		} catch { this.update({ notice: loadFailure }); return "failed"; }
		finally { this.update({ busy: false }); }
	}
	async importBackground(prepare: () => Promise<BackgroundPixels>) {
		if (!this.state.ready || this.state.busy || this.strokes) return false;
		const page = this.state.page, empty = () => { const drawing = replayHandwriting(this.state.working); return !drawing.strokes.length && !drawing.background; };
		if (!empty()) { this.update({ notice: "Import needs an empty page. Clear this page first, or choose an empty page in Pages. Clear can be undone." }); return false; }
		this.update({ busy: true, notice: "Opening page…" });
		try { const background = await prepare(); if (!this.alive() || !empty() || this.state.working.head !== page.journal.head) return false; const journal = await importHandwritingBackground(page.journal, background, crypto.randomUUID()); return await this.transition({ ...page, journal }); }
		catch { this.update({ notice: loadFailure }); return false; }
		finally { this.update({ busy: false }); }
	}
	private creation(page: HandwritingPage, action: PageAction): { page: HandwritingPage; creation: PageCreation } {
		const from = action.kind === "recover" && !action.writingId ? { kind: "working" as const, pageId: page.id } : page.origin.kind === "duplicate" ? page.origin.from : { kind: "snapshot" as const, writingId: action.writingId! };
		return { page: { ...page, journal: handwritingAtHead(page.journal, action.seedHead) }, creation: { id: action.actionId, kind: action.kind as PageCreation["kind"], seedFingerprint: action.seedFingerprint, from } };
	}
	private sync(pageId: string): Promise<void> {
		const running = this.flights.get(pageId); if (running) return running;
		const flight = this.flush(pageId).finally(() => { this.flights.delete(pageId); }); this.flights.set(pageId, flight); return flight;
	}
	private async flush(pageId: string) {
		if (!this.alive() || this.blocked.has(pageId) || this.generation === null) return;
		try {
			let page = this.pages.get(pageId); if (!page) return;
			for (const action of this.actions.values()) if (action.pageId === pageId) await this.deps.device.markAction(this.chatId, this.generation, action.actionId, "syncing");
			if (!this.alive()) return;
			let creation = [...this.actions.values()].find(action => action.pageId === pageId && action.kind !== "restore");
			if (!creation && pageId !== "page_initial" && (!this.remote.has(pageId) || this.remote.get(pageId) === null)) {
				const remote = await this.getRemote(pageId);
				if (!remote) {
					if (this.state.busy || this.strokes || !this.alive()) return;
					this.update({ busy: true });
					try {
						await this.localFlight.catch(() => {}); page = this.pages.get(pageId)!;
						const saved = await this.localRead(), old = saved.pages.find(item => item.id === pageId);
						if (!old) throw new Error("Unproven local original");
						const { sourceFingerprint } = await handwritingFingerprints(notebookSource(page.journal));
						creation = { version: 1, chatId: this.chatId, actionId: crypto.randomUUID(), kind: "recover", pageId, seedHead: page.journal.head, seedFingerprint: sourceFingerprint, state: "local-committed" };
						if (!this.alive()) return;
						await this.deps.device.commit(this.chatId, this.generation, { pages: [page], expected: { [pageId]: { head: old.journal.head } }, action: creation, valid: () => this.alive() });
						if (!this.alive()) return;
						this.actions.set(creation.actionId, creation);
					} finally { this.update({ busy: false }); }
				}
			}
			if (creation) {
				const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.creation(page, creation)) });
				const result = await this.syncResponse(response, pageId, true); if (!this.alive()) return;
				page = this.pages.get(pageId)!;
				if (result.id !== pageId) { this.conflict(pageId); return; }
				// Adopt descriptive server metadata only after causal compatibility.
				if (!handwritingPrefix(result.journal, page.journal) && !handwritingPrefix(page.journal, result.journal)) { this.conflict(pageId); return; }
				const reconciled = adoptHandwritingPageMetadata(page, result);
				if (canonicalHandwriting(pageSummary(page)) !== canonicalHandwriting(pageSummary(result)) || reconciled.journal.head !== page.journal.head) {
					if (this.strokes || this.state.busy) return;
					this.update({ busy: true });
					try {
						await this.localFlight.catch(() => {});
						const saved = await this.localRead(), old = saved.pages.find(item => item.id === pageId);
						if (!old || !this.alive()) return;
						page = adoptHandwritingPageMetadata(this.reconcileDevice(this.pages.get(pageId)!), result);
						await this.deps.prepare(page);
						await this.deps.device.commit(this.chatId, this.generation, { pages: [page], expected: { [pageId]: { head: old.journal.head } }, adoptMetadata: [pageId], valid: () => this.alive() });
						if (!this.alive()) return;
						this.remember(page); this.mirror(page, true); if (this.state.page.id === pageId) this.activate(page, null, true);
					} finally { this.update({ busy: false }); }
				}
				this.remote.set(pageId, result);
				await this.deps.device.finishAction(this.chatId, this.generation, creation.actionId); this.actions.delete(creation.actionId);
			}
			while (this.alive() && !this.blocked.has(pageId)) {
				page = this.pages.get(pageId)!; const acknowledged = this.remote.get(pageId);
				if (acknowledged && handwritingPrefix(page.journal, acknowledged.journal)) break;
				const response = await this.deps.fetch(`/api/chats/${encodeURIComponent(this.chatId)}/handwriting/pages/${encodeURIComponent(pageId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
				const remote = await this.syncResponse(response, pageId); if (!this.alive()) return;
				const current = this.pages.get(pageId)!;
				try { if (this.reconcileDevice(current).journal.head !== current.journal.head) { this.conflict(pageId); return; } } catch { this.conflict(pageId); return; }
				if (!handwritingPrefix(page.journal, remote.journal)) { this.conflict(pageId); return; }
				const next = reconcileHandwritingPage(current, remote);
				this.remote.set(pageId, remote);
				if (next.journal.head !== current.journal.head) { if (this.strokes || this.state.busy) { this.conflict(pageId); return; } this.remember(next); if (this.state.page.id === pageId) this.activate(next); this.mirror(next); }
				for (const action of this.actions.values()) if (action.pageId === pageId && action.kind === "restore" && action.eventId && remote.journal.events[action.eventId]) { await this.deps.device.finishAction(this.chatId, this.generation, action.actionId); this.actions.delete(action.actionId); }
			}
			if (this.state.page.id === pageId && (!this.localSaved.has(pageId) || this.state.notice === syncFailure || this.state.notice === "Couldn’t save on this device; saving to LearnHarness…" || this.state.notice === "Saved to LearnHarness; device recovery is unavailable.")) this.update({ notice: this.localSaved.has(pageId) ? null : "Saved to LearnHarness; device recovery is unavailable." });
		} catch (error) {
			if (this.alive() && this.generation !== null) for (const action of this.actions.values()) if (action.pageId === pageId) await this.deps.device.markAction(this.chatId, this.generation, action.actionId, "failed").catch(() => {});
			if (error instanceof HandwritingConflict || error instanceof PageReadError) this.conflict(pageId); else if (this.alive() && !this.blocked.has(pageId)) this.update({ notice: this.localSaved.has(pageId) ? syncFailure : "Couldn’t save handwriting on this device or to LearnHarness. Keep this page open and Retry." });
		}
	}
	private async syncResponse(response: Response, pageId: string, created = false) {
		if (response.status === 404) { const result = await response.json(); if (result.code === "page_not_found") this.remote.set(pageId, null); else this.unavailable(); throw new Error("Unavailable"); }
		if (response.status === 409) { this.conflict(pageId); throw new Error("Divergence"); }
		if (!response.ok) throw new Error("Sync failed"); const result = await response.json(); return handwritingPageSchema.parse(created ? result.page : result);
	}
	async retry() {
		if (!this.alive() || this.state.busy || this.strokes) return;
		if (!this.state.ready) { await this.open(); return; }
		if (this.listFailed) await this.refreshPages().catch(() => {});
		for (const page of this.pages.values()) this.mirror(page);
		try { await this.checkpoint(); } catch (error) { if (!(error instanceof CheckpointWriteError)) { this.update({ ready: false, notice: deviceFailure }); return; } }
		await Promise.all([...this.pages.keys()].map(id => this.sync(id)));
	}
	cancelDecision() { this.actionEpoch++; this.update({ decision: null }); }
	dispose() { this.disposed = true; this.listeners.clear(); }
	sessionDeleted() { this.deleted = true; this.listeners.clear(); }
}
