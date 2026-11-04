import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { emptyHandwriting, handwritingSchema, handwritingPrefix, HandwritingConflict } from "../core/handwriting.ts";
import type { HandwritingStore } from "../core/ports.ts";

export function createHandwritingStore(root: string): HandwritingStore {
	function file(id: string) {
		if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid chat id");
		return path.join(root, `${id}.json`);
	}
	return {
		read(id) {
			let text: string;
			try { text = fs.readFileSync(file(id), "utf8"); }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHandwriting();
				throw error;
			}
			// Corrupt or newer records are NOT empty notebooks and never overwritten.
			return handwritingSchema.parse(JSON.parse(text));
		},
		save(id, working) {
			const next = handwritingSchema.parse(working);
			const current = this.read(id);
			if (handwritingPrefix(next, current)) return current;
			if (!handwritingPrefix(current, next)) throw new HandwritingConflict("Divergent handwriting history");
			fs.mkdirSync(root, { recursive: true });
			const target = file(id), temp = `${target}.${crypto.randomUUID()}.tmp`;
			try {
				fs.writeFileSync(temp, JSON.stringify(next), { flag: "wx" });
				fs.renameSync(temp, target);
			} finally { fs.rmSync(temp, { force: true }); }
			return next;
		},
		deleteChat(id) { fs.rmSync(file(id), { force: true }); },
	};
}
export const handwritingStore = createHandwritingStore(path.join(PATHS.data, "handwriting"));
