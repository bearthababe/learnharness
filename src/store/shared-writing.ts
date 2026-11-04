import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import type { SharedWriting } from "../core/shared-writing.ts";

/** Immutable originals. A temporary file + rename makes a new snapshot
 * visible atomically; pending/submitted state lives in the session record. */
export function createSharedWritingStore(root: string) {
	function directory(chatId: string) {
		if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new Error("Invalid chat id");
		return path.join(root, chatId);
	}
	function filePath(chatId: string, id: string) {
		if (!/^writing_[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid writing id");
		return path.join(directory(chatId), `${id}.png`);
	}
	return {
		filePath,
		put(chatId: string, bytes: Uint8Array): SharedWriting {
			const id = `writing_${Date.now().toString(36)}_${crypto.randomUUID()}`;
			const file = filePath(chatId, id);
			fs.mkdirSync(directory(chatId), { recursive: true });
			const temp = `${file}.tmp`;
			try {
				fs.writeFileSync(temp, bytes, { flag: "wx" });
				fs.renameSync(temp, file);
			} finally { fs.rmSync(temp, { force: true }); }
			return { id, createdAt: fs.statSync(file).mtime.toISOString() };
		},
		list(chatId: string): SharedWriting[] {
			const dir = directory(chatId);
			if (!fs.existsSync(dir)) return [];
			return fs.readdirSync(dir).filter((f) => /^writing_[A-Za-z0-9_-]+\.png$/.test(f))
				.map((f) => ({ id: f.slice(0, -4), createdAt: fs.statSync(path.join(dir, f)).mtime.toISOString() }))
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
		},
		read(chatId: string, id: string): Uint8Array { return fs.readFileSync(filePath(chatId, id)); },
		deleteChat(chatId: string) { fs.rmSync(directory(chatId), { recursive: true, force: true }); },
	};
}

export const sharedWritingStore = createSharedWritingStore(path.join(PATHS.data, "shared-writing"));
