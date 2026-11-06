"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { FileUpIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { usePhoneLayout } from "./use-phone-viewport";
import { createNotesImportQueue, EMPTY_IMPORT_QUEUE, notesPath } from "./notes-import-queue";

export { MAX_IMPORT_BYTES } from "@/lib/notes-import-limits.ts";
export { notesPath } from "./notes-import-queue";

// Transport-only types: never import the server's extraction/agent module here.
export interface NotesImportResult {
	requestIndex: number;
	filePath: string;
	ok: boolean;
	outcome: "completed" | "failed" | "partial" | "aborted" | "busy";
	stats?: { nodes: number; chains?: number; droppedChains?: number };
	error?: string;
	code?: string;
	missing?: string[];
	provider?: string;
	slots?: string[];
	notice?: string;
}

/** Contributor's strict attribution: validate the complete response before
 * applying any row, even when several files have identical basenames. */
export function parseNotesImportResults(body: unknown, files: readonly File[]): NotesImportResult[] {
	const invalid = () => new Error("Invalid import response. Check the graph before retrying.");
	if (!body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results) || body.results.length !== files.length) throw invalid();
	const seen = new Set<number>();
	for (const raw of body.results) {
		if (!raw || typeof raw !== "object") throw invalid();
		const r = raw as NotesImportResult;
		if (!Number.isInteger(r.requestIndex) || r.requestIndex < 0 || r.requestIndex >= files.length || seen.has(r.requestIndex) || r.filePath !== notesPath(files[r.requestIndex]!)) throw invalid();
		seen.add(r.requestIndex);
		if (!["completed", "failed", "partial", "aborted", "busy"].includes(r.outcome) || typeof r.ok !== "boolean" || r.ok !== (r.outcome === "completed")) throw invalid();
		if (r.stats !== undefined && (!r.stats || typeof r.stats !== "object" || !Number.isFinite(r.stats.nodes) || r.stats.nodes < 0 || (r.stats.chains !== undefined && (!Number.isFinite(r.stats.chains) || r.stats.chains < 0)))) throw invalid();
		if (r.ok && !r.stats) throw invalid();
		if (!r.ok && typeof r.error !== "string") throw invalid();
		for (const field of ["error", "code", "provider", "notice"] as const) if (r[field] !== undefined && typeof r[field] !== "string") throw invalid();
		for (const field of ["missing", "slots"] as const) if (r[field] !== undefined && (!Array.isArray(r[field]) || !r[field]!.every((v) => typeof v === "string"))) throw invalid();
	}
	return body.results as NotesImportResult[];
}

export async function postNotesImport(files: readonly File[]): Promise<NotesImportResult[]> {
	const form = new FormData();
	for (const file of files) {
		form.append("files", file);
		form.append("paths", notesPath(file));
	}
	const response = await fetch("/api/graph/import", { method: "POST", body: form });
	let body: unknown;
	try { body = await response.json(); }
	catch { throw new Error("Invalid import response. Check the graph before retrying."); }
	if (!response.ok) {
		const detail = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? `: ${body.error}` : "";
		throw new Error(`Import request failed (HTTP ${response.status})${detail}${/[.!?]$/.test(detail) ? "" : "."} Check the graph before retrying.`);
	}
	return parseNotesImportResults(body, files);
}

// Client module singleton: shared by both home views and successive selections.
// SSR never appends Files, and uses the immutable empty server snapshot.
const pageImportQueue = createNotesImportQueue(postNotesImport);
export function useNotesImport(callbacks: { onStart?: () => void; onFinish?: () => void } = {}) {
	const snapshot = useSyncExternalStore(pageImportQueue.subscribe, pageImportQueue.getSnapshot, () => EMPTY_IMPORT_QUEUE);
	const latest = useRef(callbacks);
	latest.current = callbacks;
	const seenCompletion = useRef(snapshot.completion);
	useEffect(() => {
		if (seenCompletion.current !== snapshot.completion) {
			seenCompletion.current = snapshot.completion;
			latest.current.onFinish?.();
		}
	}, [snapshot.completion]);
	return {
		errors: snapshot.errors, notices: snapshot.notices, importing: snapshot.importing,
		onImportFiles: (files: FileList | null) => {
			if (!files || files.length === 0) return;
			latest.current.onStart?.();
			pageImportQueue.append(Array.from(files));
		},
	};
}

/** PR198's shared Files / Folder native picker. Unlike the donor, it remains
 * available while work is running; later selections join the SAME queue. */
export function NotesImportControl({ importing, onImportFiles }: { importing: boolean; onImportFiles: (files: FileList | null) => void }) {
	const phone = usePhoneLayout();
	const filesRef = useRef<HTMLInputElement>(null);
	const folderRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const hintId = useId();
	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		onImportFiles(event.target.files);
		event.target.value = "";
	};
	const choices = [["Files", filesRef], ["Folder", folderRef]] as const;
	return (
		<div className="lh-graph-import relative shrink-0 rounded-full border border-border/70 bg-card/90 p-0.5 shadow-lg backdrop-blur"
			onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
			onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
			<input ref={filesRef} type="file" multiple accept=".md,.markdown,.txt,.pdf" className="hidden" onChange={onChange} />
			<input ref={folderRef} type="file" {...{ webkitdirectory: "" }} className="hidden" onChange={onChange} />
			<Hint label="Extract files into the graph" side="bottom" disabled={phone}>
				<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" data-testid="import-notes"
					className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-foreground">
					<FileUpIcon className="size-3.5 text-muted-foreground" />{importing ? "Extracting…" : "Extract files…"}
				</button>
			</Hint>
			{open && (
				<div role="menu" aria-label="Extract files into the graph" aria-describedby={hintId} className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border bg-popover p-1.5 shadow-2xl">
					<div role="none"><p id={hintId} className="px-2.5 pb-1.5 pt-1 text-[12.5px] leading-relaxed text-muted-foreground">Adds your notes to the knowledge graph. For lessons, attach material to a session instead.</p></div>
					{choices.map(([label, input]) => <button key={label} type="button" role="menuitem" className="block min-h-9 w-full rounded-lg px-2.5 py-1.5 text-left text-[13.5px] hover:bg-accent"
						onClick={() => { setOpen(false); input.current?.click(); }}>{label}</button>)}
				</div>
			)}
		</div>
	);
}

/** Provider refusals arrive as "file: 401: {json}" — say what happened and
 *  what to do instead of showing the raw payload. Other messages pass
 *  through unchanged. Pure; exported for tests. */
export function readableImportError(error: string): string {
	const match = /^(.*?): (\d{3}): (\{.*\})\s*$/s.exec(error);
	if (!match) return error;
	const [, file, status, payload] = match;
	let detail = "";
	try {
		const parsed = JSON.parse(payload!) as { message?: unknown; error?: unknown };
		const message = typeof parsed.message === "string" ? parsed.message : typeof parsed.error === "string" ? parsed.error : "";
		detail = message ? ` (${message})` : "";
	} catch { /* keep the status alone */ }
	const hint = status === "401" || status === "403" ? " Check the provider key in Settings, then try again." : " Try again in a moment.";
	return `${file}: the model provider refused the extraction — HTTP ${status}${detail}.${hint}`;
}

export function NotesImportErrors({ errors }: { errors: readonly string[] }) {
	return <>{errors.map((error, i) => <p key={i} role="alert" className="max-w-80 whitespace-pre-wrap break-words text-right text-[12.5px] leading-snug text-red-300">{readableImportError(error)}</p>)}</>;
}
export function NotesImportNotices({ notices }: { notices: readonly string[] }) {
	return <>{notices.map((notice, i) => <p key={i} role="status" className="max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground">{notice}</p>)}</>;
}
