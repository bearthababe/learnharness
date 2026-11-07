"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { WaypointsIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { usePhoneLayout } from "./use-phone-viewport";
import { createNotesImportQueue, EMPTY_IMPORT_QUEUE, notesPath, type ImportDone } from "./notes-import-queue";

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
/** Dismiss the page's settled import errors and notices. */
export function dismissNotesImportResults() { pageImportQueue.dismiss(); }
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
		errors: snapshot.errors, notices: snapshot.notices, done: snapshot.done, importing: snapshot.importing,
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
		<div className="lh-graph-import relative shrink-0 rounded-xl border bg-card/85 px-1 py-[3px] shadow-lg backdrop-blur"
			onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
			onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
			<input ref={filesRef} type="file" multiple accept=".md,.markdown,.txt,.pdf" className="hidden" onChange={onChange} />
			<input ref={folderRef} type="file" {...{ webkitdirectory: "" }} className="hidden" onChange={onChange} />
			<Hint label="Extract files into the graph" side="bottom" disabled={phone}>
				<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" data-testid="import-notes"
					className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
					<WaypointsIcon className="size-3" />{importing ? "Extracting…" : "Extract files…"}
				</button>
			</Hint>
			{open && (
				<div role="menu" aria-label="Extract files into the graph" aria-describedby={hintId} className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border bg-card p-1 shadow-lg">
					<div role="none"><p id={hintId} className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">For lessons, attach material to a session instead.</p></div>
					{choices.map(([label, input]) => <button key={label} type="button" role="menuitem" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
						onClick={() => { setOpen(false); input.current?.click(); }}>{label}</button>)}
				</div>
			)}
		</div>
	);
}

/** A raw provider failure ("file: 401: {json}") reads as a sentence with a
 *  next step; anything else is shown as the server worded it. Pure. */
export function friendlyImportError(error: string): string {
	const m = /^(.+?): (\d{3}): (\{[\s\S]*\})$/.exec(error);
	if (!m) return error;
	let detail = "";
	try { const parsed = JSON.parse(m[3]!) as { message?: unknown; error?: unknown }; detail = String(parsed.message ?? parsed.error ?? ""); } catch { /* keep the status alone */ }
	const status = Number(m[2]);
	const hint = status === 401 || status === 403
		? "The model provider refused the request; check its key in Settings → Providers."
		: "The model provider returned an error; try again in a moment.";
	return `${m[1]} couldn't be imported. ${hint} (${status}${detail ? ` · ${detail}` : ""})`;
}
/** Failed imports as one contained panel: what failed, in a sentence, with
 *  the fix one tap away (provider settings) and a way to dismiss. Without
 *  handlers it renders the plain lines alone. */
export function NotesImportErrors({ errors, onOpenSettings, onDismiss }: { errors: readonly string[]; onOpenSettings?: () => void; onDismiss?: () => void }) {
	if (errors.length === 0) return null;
	const lines = errors.map((error, i) => <p key={i} role="alert" className="lh-import-error max-w-full whitespace-pre-wrap break-words text-xs text-red-400">{friendlyImportError(error)}</p>);
	if (!onOpenSettings && !onDismiss) return <>{lines}</>;
	const auth = errors.some((error) => /: 40[13]: /.test(error));
	return (
		<div className="lh-import-error-panel" data-testid="import-error-panel">
			<div className="lh-import-error-title">{errors.length === 1 ? "Import didn't finish" : `${errors.length} imports didn't finish`}</div>
			{lines}
			<div className="lh-import-error-actions">
				{auth && onOpenSettings && <button type="button" data-testid="import-error-settings" onClick={onOpenSettings}>Open provider settings</button>}
				{onDismiss && <button type="button" data-testid="import-error-dismiss" onClick={onDismiss}>Dismiss</button>}
			</div>
		</div>
	);
}
/** A finished import says what it added and offers the way to look:
 *  "Imported notes.md · 2 new ideas", Show ideas, Dismiss. */
export function NotesImportDone({ done, importing, onShowIdeas, onDismiss }: { done: readonly ImportDone[]; importing: boolean; onShowIdeas?: () => void; onDismiss?: () => void }) {
	if (done.length === 0 || importing) return null;
	const total = done.reduce((sum, item) => sum + item.ideas, 0);
	const name = (filePath: string) => filePath.split("/").pop() ?? filePath;
	const ideas = (n: number) => `${n} new ${n === 1 ? "idea" : "ideas"}`;
	return (
		<div className="lh-import-done-panel" role="status" data-testid="import-done-panel">
			<div className="lh-import-error-title">{done.length === 1 ? `Imported ${name(done[0]!.filePath)}` : `Imported ${done.length} files`}</div>
			<p className="lh-import-done-line">{done.length === 1 ? `${ideas(total)} in your graph${done[0]!.chains ? ` · ${done[0]!.chains} ${done[0]!.chains === 1 ? "chain" : "chains"}` : ""}.` : `${ideas(total)} in your graph.`}</p>
			{done.length > 1 && <ul className="lh-import-done-list">{done.slice(0, 5).map((item) => <li key={item.filePath}><span>{name(item.filePath)}</span><span>{ideas(item.ideas)}</span></li>)}</ul>}
			<div className="lh-import-error-actions">
				{onShowIdeas && <button type="button" data-testid="import-done-show" onClick={onShowIdeas}>Show ideas</button>}
				{onDismiss && <button type="button" data-testid="import-done-dismiss" onClick={onDismiss}>Dismiss</button>}
			</div>
		</div>
	);
}
export function NotesImportNotices({ notices }: { notices: readonly string[] }) {
	return <>{notices.map((notice, i) => <p key={i} role="status" className="max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground">{notice}</p>)}</>;
}
