import { z } from "zod";
import { canonicalHandwriting, handwritingPageSchema, handwritingSha256, isFullPageHandwritingPng, pageOriginSchema, notebookPageIdSchema, reconcileHandwritingPage, adoptHandwritingPageMetadata, type BackgroundPixels, type HandwritingPage } from "../../src/core/index.ts";

export const pageDeviceKey = (chatId: string, pageId: string) => `lh:handwriting:pages:v1:${chatId}:${pageId}`;
export const pageRecoveryKey = (chatId: string, pageId: string) => `lh:handwriting:pages:recovery:v1:${chatId}:${pageId}`;
const sessionSchema = z.object({ version: z.literal(1), chatId: z.string(), generation: z.number().int().nonnegative(), deleted: z.boolean(), activePageId: notebookPageIdSchema }).strict();
export type WorkingSession = z.infer<typeof sessionSchema>;
const actionSchema = z.object({ version: z.literal(1), chatId: z.string(), actionId: z.string(), kind: z.enum(["duplicate", "restore", "recover", "external", "blank"]), pageId: notebookPageIdSchema, writingId: z.string().optional(), expectedHead: z.string().nullable().optional(), eventId: z.string().optional(), seedHead: z.string().nullable(), seedFingerprint: z.string().regex(/^[0-9a-f]{64}$/), state: z.enum(["local-committed", "syncing", "failed"]) }).strict();
export type PageAction = z.infer<typeof actionSchema>;
export type WorkingSnapshot = { session: WorkingSession; pages: HandwritingPage[]; actions: PageAction[] };
export type PageCommit = { pages: HandwritingPage[]; expected: Record<string, { head: string | null } | null>; activePageId?: string; expectedActivePageId?: string; action?: PageAction; retireAction?: string; adoptMetadata?: string[]; valid?: () => boolean };
export interface PagesDevice {
	open(chatId: string): Promise<WorkingSession>;
	read(chatId: string, generation: number): Promise<WorkingSnapshot>;
	commit(chatId: string, generation: number, commit: PageCommit): Promise<void>;
	finishAction(chatId: string, generation: number, actionId: string): Promise<void>;
	markAction(chatId: string, generation: number, actionId: string, state: PageAction["state"]): Promise<void>;
	deleteChat(chatId: string): Promise<void>;
}
export class PageDeviceConflict extends Error {}
export type CompactPage = Omit<HandwritingPage, "journal"> & { journal: Omit<HandwritingPage["journal"], "backgrounds"> & { backgrounds: string[] } };
export function compactPage(page: HandwritingPage): CompactPage { return { ...page, journal: { ...page.journal, backgrounds: Object.keys(page.journal.backgrounds).sort() } }; }
const compactSchema = z.object({ version: z.literal(1), id: notebookPageIdSchema, origin: pageOriginSchema, createdAt: z.iso.datetime().nullable(), journal: z.object({ version: z.literal(2), pageId: notebookPageIdSchema, head: z.string().nullable(), events: z.record(z.string(), z.unknown()), backgrounds: z.array(z.string().regex(/^[0-9a-f]{64}$/)) }).strict() }).strict();
export function hydratePage(value: unknown, assets: ReadonlyMap<string, BackgroundPixels>): HandwritingPage {
	const compact = compactSchema.parse(value), backgrounds: Record<string, BackgroundPixels> = {};
	for (const id of compact.journal.backgrounds) { const asset = assets.get(id); if (!asset || backgrounds[id]) throw new Error("Missing or duplicate background asset"); backgrounds[id] = asset; }
	return handwritingPageSchema.parse({ ...compact, journal: { ...compact.journal, backgrounds } });
}
function base64(bytes: Uint8Array) { let raw = ""; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(raw); }
async function prepareAssets(pages: HandwritingPage[]) {
	const assets = new Map<string, BackgroundPixels>(), blobs = new Map<string, Blob>();
	for (const page of pages) for (const [id, pixels] of Object.entries(page.journal.backgrounds)) {
		if (assets.has(id)) { if (canonicalHandwriting(assets.get(id)) !== canonicalHandwriting(pixels)) throw new Error("Conflicting asset"); continue; }
		const bytes = Uint8Array.from(atob(pixels.data), c => c.charCodeAt(0));
		if (base64(bytes) !== pixels.data || !isFullPageHandwritingPng(bytes) || await handwritingSha256(bytes) !== id) throw new Error("Invalid working asset");
		assets.set(id, pixels); blobs.set(id, new Blob([bytes], { type: "image/png" }));
	}
	return { assets, blobs };
}
const names = ["backgrounds", "pages", "sessions", "pageActions"] as const;
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const range = (chat: string) => IDBKeyRange.bound([chat], [chat, []]);

/** Full graph recovery without synchronous PNG serialization. All accepted
 * transitions (including pointer and action) acknowledge transaction completion. */
export class IndexedPagesDevice implements PagesDevice {
	private database?: Promise<IDBDatabase>;
	constructor(private factory: () => IDBFactory = () => indexedDB) {}
	private db() { return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
		const opening = this.factory().open("lh-handwriting-working", 1);
		opening.onupgradeneeded = () => { for (const name of names) opening.result.createObjectStore(name, { keyPath: name === "sessions" ? "chatId" : ["chatId", name === "backgrounds" ? "backgroundId" : name === "pageActions" ? "actionId" : "pageId"] }); };
		opening.onsuccess = () => { opening.result.onversionchange = () => opening.result.close(); resolve(opening.result); };
		opening.onerror = () => { this.database = undefined; reject(opening.error); }; opening.onblocked = () => reject(new Error("Working recovery is blocked by another window"));
	}); }
	private async transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>): Promise<T> {
		const tx = (await this.db()).transaction([...names], mode), done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Working transaction aborted")); });
		try { const result = await run(tx); await done; return result; }
		catch (error) { try { tx.abort(); } catch { /* already completed */ } await done.catch(() => {}); throw error; }
	}
	private async guard(tx: IDBTransaction, chatId: string, generation: number) {
		const session = sessionSchema.parse(await request(tx.objectStore("sessions").get(chatId)));
		if (session.chatId !== chatId || session.deleted || session.generation !== generation) throw new Error("Working recovery was deleted"); return session;
	}
	open(chatId: string) { return this.transaction("readwrite", async tx => {
		const store = tx.objectStore("sessions"), saved = await request(store.get(chatId));
		const session = saved === undefined ? { version: 1 as const, chatId, generation: 0, deleted: false, activePageId: "page_initial" } : sessionSchema.parse(saved);
		if (session.deleted || session.chatId !== chatId) throw new Error("Working recovery was deleted"); if (saved === undefined) store.add(session); return session;
	}); }
	async read(chatId: string, generation: number): Promise<WorkingSnapshot> {
		const raw = await this.transaction("readonly", async tx => ({ session: await this.guard(tx, chatId, generation), assets: await request(tx.objectStore("backgrounds").getAll(range(chatId))), pages: await request(tx.objectStore("pages").getAll(range(chatId))), actions: await request(tx.objectStore("pageActions").getAll(range(chatId))) }));
		const assets = new Map<string, BackgroundPixels>();
		for (const value of raw.assets) {
			const asset = z.object({ version: z.literal(1), chatId: z.literal(chatId), backgroundId: z.string().regex(/^[0-9a-f]{64}$/), width: z.literal(1400), height: z.literal(1800), png: z.instanceof(Blob) }).strict().parse(value);
			const bytes = new Uint8Array(await asset.png.arrayBuffer());
			if (!isFullPageHandwritingPng(bytes) || await handwritingSha256(bytes) !== asset.backgroundId) throw new Error("Corrupt working background");
			assets.set(asset.backgroundId, { mediaType: "image/png", width: 1400, height: 1800, data: base64(bytes) });
		}
		const pages = raw.pages.map(value => { const row = z.object({ chatId: z.literal(chatId), pageId: notebookPageIdSchema, page: z.unknown() }).strict().parse(value); const page = hydratePage(row.page, assets); if (page.id !== row.pageId) throw new Error("Wrong page key"); return page; });
		const actions = raw.actions.map(value => actionSchema.parse(value));
		for (const action of actions) { const page = pages.find(page => page.id === action.pageId); if (action.chatId !== chatId || !page || (action.seedHead !== null && !page.journal.events[action.seedHead]) || (action.eventId && !page.journal.events[action.eventId])) throw new Error("Missing action history"); }
		return { session: raw.session, pages, actions };
	}
	async commit(chatId: string, generation: number, input: PageCommit) {
		const pages = input.pages.map(page => handwritingPageSchema.parse(page)), { assets, blobs } = await prepareAssets(pages);
		if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
		if (input.action && (actionSchema.parse(input.action).chatId !== chatId || !pages.some(page => page.id === input.action!.pageId))) throw new Error("Wrong action");
		await this.transaction("readwrite", async tx => {
			const session = await this.guard(tx, chatId, generation);
			if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
			if (input.expectedActivePageId !== undefined && session.activePageId !== input.expectedActivePageId) throw new PageDeviceConflict("Active page changed");
			if (input.retireAction) {
				const old = await request(tx.objectStore("pageActions").get([chatId, input.retireAction]));
				if (old !== undefined && !pages.some(page => page.id === actionSchema.parse(old).pageId)) throw new Error("Wrong retiring action");
			}
			for (const page of pages) {
				const row = await request(tx.objectStore("pages").get([chatId, page.id])), expected = input.expected[page.id];
				if (expected === undefined) throw new Error("Missing page precondition");
				if (row === undefined) { if (expected !== null) throw new PageDeviceConflict("Page disappeared"); }
				else {
					const current = hydratePage(row.page, assets);
					if (expected === null || current.journal.head !== expected.head) throw new PageDeviceConflict("Working page changed");
					const merged = input.adoptMetadata?.includes(page.id) ? adoptHandwritingPageMetadata(current, page) : reconcileHandwritingPage(current, page);
					if (merged.journal.head !== page.journal.head) throw new PageDeviceConflict("Newer recovery exists");
				}
			}
			if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
			for (const [backgroundId, png] of blobs) {
				const store = tx.objectStore("backgrounds"), old = await request(store.get([chatId, backgroundId]));
				if (old === undefined) store.add({ version: 1, chatId, backgroundId, width: 1400, height: 1800, png });
			}
			if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
			for (const page of pages) tx.objectStore("pages").put({ chatId, pageId: page.id, page: compactPage(page) });
			// The original wrapper remains the frozen creation seed until both
			// metadata adoption and action retirement commit, or both roll back.
			if (input.retireAction) tx.objectStore("pageActions").delete([chatId, input.retireAction]);
			if (input.action) {
				const store = tx.objectStore("pageActions"), old = await request(store.get([chatId, input.action.actionId]));
				if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
				if (old !== undefined && canonicalHandwriting(old) !== canonicalHandwriting(input.action)) throw new Error("Conflicting page action");
				store.put(input.action);
			}
			if (input.activePageId !== undefined) {
				if (input.valid && !input.valid()) throw new Error("Page action was cancelled");
				if (!pages.some(page => page.id === input.activePageId)) throw new Error("Selection is not durably preserved");
				tx.objectStore("sessions").put({ ...session, activePageId: input.activePageId });
			}
		});
	}
	finishAction(chatId: string, generation: number, actionId: string) { return this.transaction("readwrite", async tx => { await this.guard(tx, chatId, generation); tx.objectStore("pageActions").delete([chatId, actionId]); }); }
	markAction(chatId: string, generation: number, actionId: string, state: PageAction["state"]) { return this.transaction("readwrite", async tx => { await this.guard(tx, chatId, generation); const store = tx.objectStore("pageActions"), old = await request(store.get([chatId, actionId])); if (old !== undefined) store.put({ ...actionSchema.parse(old), state }); }); }
	deleteChat(chatId: string) { return this.transaction("readwrite", async tx => {
		const store = tx.objectStore("sessions"), old = await request(store.get(chatId));
		store.put({ version: 1, chatId, generation: old ? sessionSchema.parse(old).generation + 1 : 1, deleted: true, activePageId: "page_initial" });
		for (const name of ["backgrounds", "pages", "pageActions"]) tx.objectStore(name).delete(range(chatId));
	}); }
}
export const handwritingPagesDevice = new IndexedPagesDevice();
