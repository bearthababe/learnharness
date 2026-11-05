import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { emptyHandwriting, handwritingSchema, reconcileHandwriting } from "../core/handwriting.ts";
import { notebookPageIdSchema } from "../core/handwriting.ts";
import { handwritingPageSchema, initialHandwritingPage, pageSummary, orderedPages, reconcileHandwritingPage, validatePageCreation, existingPageCreation } from "../core/handwriting-pages.ts";
import type { HandwritingStore } from "../core/ports.ts";

export function createHandwritingStore(root: string): HandwritingStore {
	function file(id: string) {
		if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid chat id");
		return path.join(root, `${id}.json`);
	}
	function pageFile(id: string, pageId: string) {
		const initial = file(id); notebookPageIdSchema.parse(pageId);
		return pageId === "page_initial" ? initial : path.join(root, id, `${pageId}.json`);
	}
	function write(target: string, value: unknown) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const temp = `${target}.${crypto.randomUUID()}.tmp`;
		try { fs.writeFileSync(temp, JSON.stringify(value), { flag: "wx" }); fs.renameSync(temp, target); }
		finally { fs.rmSync(temp, { force: true }); }
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
			const current = this.read(id);
			const next = reconcileHandwriting(current, handwritingSchema.parse(working));
			if (next === current) return current;
			fs.mkdirSync(root, { recursive: true });
			const target = file(id), temp = `${target}.${crypto.randomUUID()}.tmp`;
			try {
				fs.writeFileSync(temp, JSON.stringify(next), { flag: "wx" });
				fs.renameSync(temp, target);
			} finally { fs.rmSync(temp, { force: true }); }
			return next;
		},
		readPage(id, pageId) {
			let text: string;
			try { text = fs.readFileSync(pageFile(id, pageId), "utf8"); }
			catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
			const page = pageId === "page_initial" ? initialHandwritingPage(handwritingSchema.parse(JSON.parse(text))) : handwritingPageSchema.parse(JSON.parse(text));
			if (page.id !== pageId) throw new Error("Page filename identity mismatch");
			return page;
		},
		listPages(id) {
			const pages = [], initial = this.readPage(id, "page_initial"); if (initial) pages.push(pageSummary(initial));
			let names: string[];
			try { names = fs.readdirSync(path.join(root, id)); }
			catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return pages; throw error; }
			for (const name of names) {
				if (/^page_[0-9a-f-]+\.json\.[0-9a-f-]+\.tmp$/.test(name)) continue;
				if (!name.endsWith(".json")) throw new Error("Unknown page file");
				const page = this.readPage(id, name.slice(0, -5)); if (!page) throw new Error("Missing listed page");
				pages.push(pageSummary(page));
			}
			const external = pages.flatMap(page => page.origin.kind === "external" ? [page.origin.writingId] : []);
			if (new Set(external).size !== external.length) throw new Error("Conflicting external page mapping");
			return orderedPages(pages);
		},
		createPageIfAbsent(id, input, creation) {
			const page = handwritingPageSchema.parse(input); validatePageCreation(page, creation);
			if (page.origin.kind === "external") {
				const writingId = page.origin.writingId, mapped = this.listPages(id).find(item => item.origin.kind === "external" && item.origin.writingId === writingId);
				if (mapped) return { page: this.readPage(id, mapped.id)!, existing: true };
			}
			const current = this.readPage(id, page.id);
			if (current) return { page: existingPageCreation(current, page, creation), existing: true };
			write(pageFile(id, page.id), page.id === "page_initial" ? page.journal : page);
			return { page, existing: false };
		},
		savePage(id, input) {
			const page = handwritingPageSchema.parse(input), current = this.readPage(id, page.id);
			if (!current && page.id !== "page_initial") throw new Error("Page does not exist");
			const next = current ? reconcileHandwritingPage(current, page) : page;
			write(pageFile(id, page.id), page.id === "page_initial" ? next.journal : next);
			return next;
		},
		deleteChat(id) { fs.rmSync(file(id), { force: true }); fs.rmSync(path.join(root, id), { recursive: true, force: true }); },
	};
}
export const handwritingStore = createHandwritingStore(path.join(PATHS.data, "handwriting"));
