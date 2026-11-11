"use client";

import { useDeploymentActivity } from "./deployment-activity";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileTextIcon, FolderOpenIcon, ImportIcon, WaypointsIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { usePhoneLayout, useTouchLayout } from "./use-phone-viewport";
import { MenuShell } from "./menu-shell";
import { OPEN_IMPORT_EVENT, publishPageMenu } from "./page-menu";
import { createNotesImportQueue, EMPTY_IMPORT_QUEUE, notesPath, type ImportDone } from "./notes-import-queue";
import { useOneMenu } from "./one-menu";
import { useCardDismiss } from "./card-dismiss";

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
	useDeploymentActivity("upload-or-extraction", () => pageImportQueue.getSnapshot().importing);
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
	useOneMenu("extract-files", open, () => setOpen(false));
	const hintId = useId();
	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		// L1 (round 19): a chosen file closes the Import menu, wherever it opened.
		if (event.target.files?.length) { setOpen(false); setAnchored(false); anchorRef.current = null; }
		onImportFiles(event.target.files);
		event.target.value = "";
	};
	const choices = [["Files…", filesRef, FileTextIcon], ["A folder…", folderRef, FolderOpenIcon]] as const;
	// Phones and tablets (round 14, P5): the import is a row in the ⋯ menu,
	// and this menu opens from there.
	const touch = useTouchLayout();
	// The control that asked for the menu (⋯ on touch screens, or an Import
	// button elsewhere): the menu opens beside it.
	const anchorRef = useRef<HTMLElement | null>(null);
	const [anchored, setAnchored] = useState(false);
	const close = () => { setOpen(false); setAnchored(false); anchorRef.current = null; };
	useCardDismiss(open && (touch || anchored), close, ['[data-testid="import-menu"]', '[data-testid="page-menu-button"]', '[data-testid="import-link"]', '[data-testid="ideas-import"]']);
	useEffect(() => {
		const onOpen = (event: Event) => {
			const anchor = (event as CustomEvent<{ anchor?: HTMLElement } | null>).detail?.anchor ?? null;
			anchorRef.current = anchor; setAnchored(!!anchor); setOpen(true);
		};
		window.addEventListener(OPEN_IMPORT_EVENT, onOpen);
		publishPageMenu({ importing: true });
		return () => { window.removeEventListener(OPEN_IMPORT_EVENT, onOpen); publishPageMenu({ importing: false }); };
	}, []);
	// Round 14 (P16): named by what it does; attaching material to a lesson
	// is its own, separate action (the session's attach button).
	const menu = (
		<div role="menu" aria-label="Import to knowledge map" aria-describedby={hintId}>
			<div role="none"><p id={hintId} className="lh-import-hint">Adds the ideas in your notes or PDFs to your knowledge map. For material you want in one lesson, attach it inside that session instead.</p></div>
			{/* R2 (round 15): the two actions lead; the explanation stays quiet. */}
			{choices.map(([label, input, Icon]) => <button key={label} type="button" role="menuitem" className="lh-page-menu-row lh-import-choice"
				onClick={() => { close(); input.current?.click(); }}><Icon aria-hidden /><span className="lh-page-menu-label">{label}</span></button>)}
		</div>
	);
	return (
		<div className="lh-graph-import relative shrink-0 rounded-xl border bg-card/85 px-1 py-[3px] shadow-lg backdrop-blur"
			onBlur={(event) => { if (!touch && !anchored && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
			onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
			<input ref={filesRef} type="file" multiple accept=".md,.markdown,.txt,.pdf" className="hidden" onChange={onChange} />
			<input ref={folderRef} type="file" {...{ webkitdirectory: "" }} className="hidden" onChange={onChange} />
			<Hint label="Import notes or PDFs into your knowledge map" side="bottom" disabled={phone}>
				<button type="button" onClick={() => { if (open) close(); else setOpen(true); }} aria-expanded={open} aria-haspopup="menu" data-testid="import-notes"
					className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
					<WaypointsIcon className="size-3" />{importing ? "Importing…" : "Import to knowledge map"}
				</button>
			</Hint>
			{open && (anchored
				? <MenuShell anchorRef={anchorRef} testid="import-menu" preferredSide="down" align="left" onClose={close}
					menuClass="lh-page-menu lh-glass w-80 max-w-[calc(100vw-24px)] rounded-xl border bg-card p-1.5 shadow-xl">{menu}</MenuShell>
				: touch
				? <MenuShell anchorTestid="page-menu-button" testid="import-menu" preferredSide="down" align="right" onClose={close}
					menuClass="lh-page-menu lh-glass w-80 max-w-[calc(100vw-24px)] rounded-xl border bg-card p-1.5 shadow-xl">{menu}</MenuShell>
				: <div className="lh-import-menu absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border bg-card p-1 shadow-lg">{menu}</div>)}
		</div>
	);
}

/** R3/R4 (round 15): an Import button outside the bar (the first-run hint,
 *  the Ideas view). It opens the same import menu (Files… / A folder…),
 *  next to itself, on every device. */
export function ImportNotesLink({ className = "", label = "Import to knowledge map", testid = "import-link" }: { className?: string; label?: string; testid?: string }) {
	return (
		<button type="button" className={`lh-import-link ${className}`} data-testid={testid} aria-label="Import to knowledge map"
			onClick={(event) => window.dispatchEvent(new CustomEvent(OPEN_IMPORT_EVENT, { detail: { anchor: event.currentTarget } }))}>
			<ImportIcon aria-hidden /><span>{label}</span>
		</button>
	);
}

/** A raw provider failure ("file: 401: {json}") reads as a sentence with a
 *  next step; anything else is shown as the server worded it. Pure. */
const SLOT_NAMES: Record<string, string> = { cheap: "Helpers", strong: "Main tutor", vision: "Images & PDFs" };
export function friendlyImportError(error: string): string {
	// A configuration code rides on its own line ("code — detail — …"): say
	// what to do instead of showing the code.
	const [first = "", codeLine] = error.split("\n");
	if (codeLine) {
		const [code, ...details] = codeLine.split(" — ");
		const said = first.replace(/[.!?]?\s*$/, "");
		if (code === "models_not_configured") {
			const slots = (details[0] ?? "").split(", ").filter(Boolean).map((slot) => SLOT_NAMES[slot] ?? slot);
			return `${said}. Choose ${slots.length ? `models for ${slots.join(", ")}` : "your models"} in Settings → Agent, then import again.`;
		}
		if (code === "provider_key_missing") {
			const provider = details.find((d) => !d.includes(",") && !/^[A-Z0-9_]+$/.test(d) && !SLOT_NAMES[d]);
			return `${said}. Add ${provider ? `your ${provider} key` : "the provider key"} in Settings → Providers, then import again.`;
		}
		return first;
	}
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
export function NotesImportErrors({ errors, onOpenSettings, onDismiss }: { errors: readonly string[]; onOpenSettings?: (section: "keys" | "agent") => void; onDismiss?: () => void }) {
	if (errors.length === 0) return null;
	const lines = errors.map((error, i) => <p key={i} role="alert" className="lh-import-error max-w-full whitespace-pre-wrap break-words text-xs text-red-400">{friendlyImportError(error)}</p>);
	if (!onOpenSettings && !onDismiss) return <>{lines}</>;
	// The fix lives where the error says: model roles under Agent, keys
	// under Providers.
	const models = errors.some((error) => /\nmodels_not_configured/.test(error));
	const auth = !models && errors.some((error) => /: 40[13]: |\nprovider_key_missing/.test(error));
	return (
		<div className="lh-import-error-panel" data-testid="import-error-panel">
			<div className="lh-import-error-title">{errors.length === 1 ? "Import didn't finish" : `${errors.length} imports didn't finish`}</div>
			{lines}
			<div className="lh-import-error-actions">
				{models && onOpenSettings && <button type="button" data-testid="import-error-settings" onClick={() => onOpenSettings("agent")}>Open model settings</button>}
				{auth && onOpenSettings && <button type="button" data-testid="import-error-settings" onClick={() => onOpenSettings("keys")}>Open provider settings</button>}
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

/**
 * L1 (round 19): progress and results show where the import started — on top
 * of whatever surface is active. While Ideas (or another full-screen surface)
 * covers Home, they float above it, their buttons working; otherwise they sit
 * in Home's own column as before.
 */
export function NotesImportResults({ floating, importing, children }: { floating: boolean; importing: boolean; children: ReactNode }) {
	const body = <>
		{importing && floating && <p role="status" className="lh-import-progress" data-testid="import-progress">Importing to your knowledge map… you can keep working.</p>}
		{children}
	</>;
	if (!floating || typeof document === "undefined") return body;
	return createPortal(<div className="lh-import-float" data-testid="import-float">{body}</div>, document.body);
}

