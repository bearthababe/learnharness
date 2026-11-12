import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PATHS } from "../../config.ts";
import { CaptureConflict, commitNotebookCapture, emptyWritingIndex, writingIndexSchema, type SharedWriting, type WritingIndex } from "../core/shared-writing.ts";
import { canonicalHandwriting, handwritingContent, notebookSourceSchema } from "../core/handwriting.ts";
import { notebookSlotIdSchema, slotPage } from "../core/shared-writing.ts";
import type { SharedWritingStore } from "../core/ports.ts";

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const manifestSchema = z.object({ version: z.literal(1), id: z.string(), pageId: notebookSlotIdSchema, expectedPageRevision: z.number().int().nonnegative(), createdAt: z.string().datetime(), imageSha256: digest, sourceSha256: digest, contentFingerprint: digest, editableSource: z.object({ version: z.literal(1) }).strict() }).strict();

/** Immutable originals. A temporary file + rename makes a new snapshot
 * visible atomically; pending/submitted state lives in the session record. */
export function createSharedWritingStore(root: string): SharedWritingStore {
	function directory(chatId: string) {
		if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new Error("Invalid chat id");
		return path.join(root, chatId);
	}
	function bundlePath(chatId: string, id: string) {
		if (!/^writing_[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid writing id");
		return path.join(directory(chatId), id);
	}
	function readIndex(chatId: string): WritingIndex {
		const dir = directory(chatId);
		try { return writingIndexSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "pending.json"), "utf8"))); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			if (fs.existsSync(dir) && fs.readdirSync(dir).some(name => /^\.?writing_/.test(name) && !name.endsWith(".png"))) throw new Error("Notebook index unavailable");
			return emptyWritingIndex();
		}
	}
	function writeIndex(chatId: string, index: WritingIndex) {
		const target = path.join(directory(chatId), "pending.json"), temp = `${target}.${crypto.randomUUID()}.tmp`;
		try { fs.writeFileSync(temp, JSON.stringify(index), { flag: "wx" }); fs.renameSync(temp, target); }
		finally { fs.rmSync(temp, { force: true }); }
	}
	function readDismissed(chatId: string): string[] {
		try {
			const ids = z.array(z.string().regex(/^writing_[A-Za-z0-9_-]+$/)).parse(JSON.parse(fs.readFileSync(path.join(directory(chatId), "dismissed.json"), "utf8")));
			return ids;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
	}
	function bundle(chatId: string, id: string) {
		const dir = bundlePath(chatId, id);
		const manifest = manifestSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")));
		const sourceJson = fs.readFileSync(path.join(dir, "source.json"), "utf8"), image = fs.readFileSync(path.join(dir, "image.png"));
		const source = notebookSourceSchema.parse(JSON.parse(sourceJson));
		if (manifest.id !== id || slotPage(manifest.pageId) !== source.journal.pageId || hash(image) !== manifest.imageSha256 || hash(sourceJson) !== manifest.sourceSha256 || hash(handwritingContent(source.journal)) !== manifest.contentFingerprint) throw new Error("Corrupt notebook bundle");
		return { manifest, source, image };
	}
	function metadata(chatId: string, id: string, index: WritingIndex): SharedWriting {
		const { manifest } = bundle(chatId, id), receipt = index.committed[id];
		if (!receipt || receipt.pageId !== manifest.pageId || receipt.pageRevision !== manifest.expectedPageRevision + 1) throw new Error("Corrupt capture receipt");
		return { id, createdAt: manifest.createdAt, editableSource: manifest.editableSource, notebook: { pageId: manifest.pageId, pageRevision: receipt.pageRevision, contentFingerprint: manifest.contentFingerprint } };
	}
	function filePath(chatId: string, id: string) {
		const dir = bundlePath(chatId, id), index = readIndex(chatId);
		return index.committed[id] ? path.join(dir, "image.png") : `${dir}.png`;
	}
	return {
		filePath,
		put(chatId: string, bytes: Uint8Array): SharedWriting {
			const id = `writing_${Date.now().toString(36)}_${crypto.randomUUID()}`;
			const file = `${bundlePath(chatId, id)}.png`;
			fs.mkdirSync(directory(chatId), { recursive: true });
			const temp = `${file}.tmp`;
			try {
				fs.writeFileSync(temp, bytes, { flag: "wx" });
				fs.renameSync(temp, file);
			} finally { fs.rmSync(temp, { force: true }); }
			return { id, createdAt: fs.statSync(file).mtime.toISOString() };
		},
		list(chatId: string): SharedWriting[] {
			return this.readSnapshot(chatId).writing;
		},
		readSnapshot(chatId) {
			const dir = directory(chatId);
			const index = readIndex(chatId);
			const raw = !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter((f) => /^writing_[A-Za-z0-9_-]+\.png$/.test(f)).map((f) => ({ id: f.slice(0, -4), createdAt: fs.statSync(path.join(dir, f)).mtime.toISOString() }));
			return { index, dismissed: readDismissed(chatId), writing: [...raw, ...Object.keys(index.committed).map(id => metadata(chatId, id, index))].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) };
		},
		dismiss(chatId, id) {
			bundlePath(chatId, id);
			const ids = readDismissed(chatId);
			if (ids.includes(id)) return;
			const target = path.join(directory(chatId), "dismissed.json"), temp = `${target}.${crypto.randomUUID()}.tmp`;
			fs.mkdirSync(directory(chatId), { recursive: true });
			try { fs.writeFileSync(temp, JSON.stringify([...ids, id]), { flag: "wx" }); fs.renameSync(temp, target); }
			finally { fs.rmSync(temp, { force: true }); }
		},
		putNotebook(chatId, capture) {
			const source = notebookSourceSchema.parse(capture.source), dir = directory(chatId), target = bundlePath(chatId, capture.writingId);
			if (!/^writing_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(capture.writingId) || source.journal.pageId !== slotPage(capture.pageId) || !Number.isSafeInteger(capture.expectedPageRevision) || capture.expectedPageRevision < 0) throw new Error("Invalid capture");
			const sourceJson = canonicalHandwriting(source), imageSha256 = hash(capture.image), sourceSha256 = hash(sourceJson);
			const index = readIndex(chatId);
			if (fs.existsSync(`${target}.png`)) throw new CaptureConflict("capture_conflict");
			if (fs.existsSync(target)) {
				const { manifest } = bundle(chatId, capture.writingId);
				if (manifest.pageId !== capture.pageId || manifest.expectedPageRevision !== capture.expectedPageRevision || manifest.imageSha256 !== imageSha256 || manifest.sourceSha256 !== sourceSha256) throw new CaptureConflict("capture_conflict");
			}
			const next = commitNotebookCapture(index, capture);
			if (next === index) return { writing: metadata(chatId, capture.writingId, index), committed: false, currentPageRevision: index.pages[capture.pageId]!.revision };
			fs.mkdirSync(dir, { recursive: true });
			if (!fs.existsSync(path.join(dir, "pending.json"))) writeIndex(chatId, index);
			if (!fs.existsSync(target)) {
				const temp = path.join(dir, `.${capture.writingId}.${crypto.randomUUID()}.tmp`);
				fs.mkdirSync(temp);
				try {
					fs.writeFileSync(path.join(temp, "image.png"), capture.image, { flag: "wx" });
					fs.writeFileSync(path.join(temp, "source.json"), sourceJson, { flag: "wx" });
					fs.writeFileSync(path.join(temp, "manifest.json"), JSON.stringify({ version: 1, id: capture.writingId, pageId: capture.pageId, expectedPageRevision: capture.expectedPageRevision, createdAt: new Date().toISOString(), imageSha256, sourceSha256, contentFingerprint: hash(handwritingContent(source.journal)), editableSource: { version: 1 } }), { flag: "wx" });
					fs.renameSync(temp, target);
				} finally { fs.rmSync(temp, { recursive: true, force: true }); }
			}
			writeIndex(chatId, next);
			return { writing: metadata(chatId, capture.writingId, next), committed: true, currentPageRevision: next.pages[capture.pageId]!.revision };
		},
		readSource(chatId, id) {
			const index = readIndex(chatId);
			if (index.committed[id]) {
				try { metadata(chatId, id, index); return bundle(chatId, id).source; }
				catch (cause) { throw new Error("Promised source unavailable", { cause }); }
			}
			fs.statSync(`${bundlePath(chatId, id)}.png`);
			return null;
		},
		read(chatId: string, id: string): Uint8Array { return fs.readFileSync(filePath(chatId, id)); },
		deleteChat(chatId: string) { fs.rmSync(directory(chatId), { recursive: true, force: true }); },
	};
}

export const sharedWritingStore = createSharedWritingStore(path.join(PATHS.data, "shared-writing"));
