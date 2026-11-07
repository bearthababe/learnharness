"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { sharedWritingImageUrl, type LhMessage, type SharedWriting, type PageAttachments } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { HandwritingPagesContext } from "./handwriting/pages-context";
import type { OpenChoice, SnapshotWriting } from "./handwriting/pages";
import { useMenuEscape } from "./menu-escape";
import { WRITING_ATTACHED_EVENT } from "./handwriting/attachment";

/* Pages the learner left out of the next answer (whole-app redesign, round
   8: an attached page could not be taken back before sending). Only this
   device's choice of what to send: the page, its snapshot and the notebook
   are untouched, and "Attach again" (or attaching the page again) brings it
   back. */
const asideKey = (chatId: string) => `lh:writing-aside:${chatId}`;
function readAside(chatId: string): string[] {
	try { const value = JSON.parse(window.localStorage.getItem(asideKey(chatId)) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; }
	catch { return []; }
}
function writeAside(chatId: string, ids: readonly string[]) {
	try { if (ids.length) window.localStorage.setItem(asideKey(chatId), JSON.stringify(ids)); else window.localStorage.removeItem(asideKey(chatId)); }
	catch { /* storage blocked: the choice lasts this visit */ }
}

export function useSharedWriting(chatId: string, messages: readonly LhMessage[]) {
	const submittedKey = messages.flatMap((m) => m.sharedWriting?.map((w) => w.id) ?? []).join(",");
	const [pending, setPending] = useState<SharedWriting[]>([]);
	const [pageAttachments, setPageAttachments] = useState<PageAttachments | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [aside, setAsideIds] = useState<string[]>([]);
	useEffect(() => { setAsideIds(readAside(chatId)); }, [chatId]);
	const updateAside = useCallback((next: (ids: string[]) => string[]) => {
		setAsideIds((ids) => { const value = next(ids); writeAside(chatId, value); return value; });
	}, [chatId]);
	useEffect(() => {
		const onAttached = (event: Event) => {
			const detail = (event as CustomEvent<{ chatId: string; writingId: string }>).detail;
			if (detail?.chatId === chatId) updateAside((ids) => ids.filter((id) => id !== detail.writingId));
		};
		window.addEventListener(WRITING_ATTACHED_EVENT, onAttached);
		return () => window.removeEventListener(WRITING_ATTACHED_EVENT, onAttached);
	}, [chatId, updateAside]);
	const generation = useRef(0);
	const refresh = useCallback(async () => {
		const run = ++generation.current;
		try {
			const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/writing`, { cache: "no-store" });
			if (!response.ok) throw new Error("Could not check for shared writing. Try again.");
			const result = await response.json() as { pending: SharedWriting[]; pageAttachments: PageAttachments };
			if (!Array.isArray(result.pending) || !result.pageAttachments) throw new Error("Could not check shared writing.");
			if (run !== generation.current) return result;
			setPending(result.pending);
			setPageAttachments(result.pageAttachments);
			setError(null);
			return result;
		} catch (err) {
			if (run === generation.current) setError(err instanceof Error ? err.message : "Could not check shared writing.");
			throw err;
		}
	}, [chatId]);
	useEffect(() => {
		void refresh().catch(() => {});
		return () => { generation.current++; };
	}, [refresh, submittedKey]);
	useEffect(() => {
		const onVisible = () => { if (!document.hidden) void refresh().catch(() => {}); };
		window.addEventListener("focus", onVisible);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.removeEventListener("focus", onVisible);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [refresh]);
	useServerEvent("writing-changed", (e) => { if (e.chatId === chatId) void refresh().catch(() => {}); });
	useServerEvent("record-changed", (e) => { if (e.chatId === chatId) void refresh().catch(() => {}); });
	useServerEvent("turn-settled", (e) => { if (e.chatId === chatId) void refresh().catch(() => {}); });
	useServerResync(() => void refresh().catch(() => {}));
	// Forget left-out pages that were sent or replaced since.
	useEffect(() => {
		if (!aside.length || !pageAttachments) return;
		const live = new Set(pending.map((w) => w.id));
		if (aside.some((id) => !live.has(id))) updateAside((ids) => ids.filter((id) => live.has(id)));
	}, [aside, pending, pageAttachments, updateAside]);
	const attached = pending.filter((w) => !aside.includes(w.id));
	const leftOut = pending.filter((w) => aside.includes(w.id));
	return {
		pending: attached, leftOut, pageAttachments, error, refresh, ids: () => attached.map((w) => w.id),
		leaveOut: (id: string) => updateAside((ids) => (ids.includes(id) ? ids : [...ids, id])),
		attachAgain: (id?: string) => updateAside((ids) => (id ? ids.filter((value) => value !== id) : [])),
	};
}

export function SharedWritingImages({ chatId, writing, small = false, onRemove }: { chatId: string; writing: readonly Pick<SharedWriting, "id">[]; small?: boolean;
	/** Unsent pages only: take this page out of the next answer. */
	onRemove?: (id: string) => void }) {
	const actions = useContext(HandwritingPagesContext);
	const [opened, setOpened] = useState<{ item: SnapshotWriting; label: string; decision?: boolean } | null>(null), [menu, setMenu] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [busy, setBusy] = useState(false);
	async function run(item: SnapshotWriting, duplicate: boolean) {
		if (!actions || busy) return; setBusy(true); setMenu(null); setNotice(duplicate ? "Duplicating page…" : "Opening page…");
		try { const result = await actions.openSnapshot(item, duplicate); setNotice(result.kind === "failed" ? result.notice : null); if (result.kind === "choice") setOpened({ item, label: "Handwritten working", decision: true }); }
		finally { setBusy(false); }
	}
	return <><div className={small ? "flex max-h-16 min-w-0 gap-2 overflow-auto overscroll-contain py-1" : "flex max-h-32 gap-2 overflow-auto overscroll-contain py-2"} data-testid="shared-writing-images">
		{writing.map((item, index) => <div key={item.id} className="shrink-0" data-writing-id={item.id}><button type="button" onClick={() => { setMenu(null); setOpened({ item, label: `Handwritten working ${index + 1}` }); }} className="rounded border bg-white p-1" style={{ filter: "var(--lh-writing-image-filter)" }} aria-label={`Open handwritten working ${index + 1}`}>
			{/* Theme presentation only; the private endpoint retains original PNG bytes. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={sharedWritingImageUrl(chatId, item.id)} alt={`Handwritten working ${index + 1}`} className={small ? "h-11 max-w-24 object-contain" : "h-24 max-w-48 object-contain"} />
		</button>{actions && <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-[18px] leading-none hover:bg-accent" aria-label="Snapshot actions" aria-expanded={menu === item.id} disabled={busy} onClick={() => setMenu(value => value === item.id ? null : item.id)}>⋯</button>}
		</div>)}
	</div>{menu && <SnapshotMenu duplicate={() => void run(writing.find(item => item.id === menu)!, true)} open={() => void run(writing.find(item => item.id === menu)!, false)} remove={onRemove ? () => { const id = menu; setMenu(null); onRemove(id); } : undefined} close={() => { const id = menu; setMenu(null); document.querySelector<HTMLButtonElement>(`[data-writing-id="${id}"] [aria-label="Snapshot actions"]`)?.focus(); }} />}
	{notice && <p role="status" data-testid="snapshot-action-status">{notice}</p>}
	{opened && <SharedWritingViewer chatId={chatId} writing={opened.item} label={opened.label} initialDecision={opened.decision} onClose={() => setOpened(null)} />}</>;
}

function SnapshotMenu({ open, duplicate, remove, close }: { open: () => void; duplicate: () => void; remove?: () => void; close: () => void }) {
	const menu = useRef<HTMLDivElement>(null); useEffect(() => { menu.current?.focus(); }, []);
	useMenuEscape("snapshot", close);
	return <div ref={menu} tabIndex={-1} className="rounded-xl border bg-background p-1.5 text-[13.5px]" data-testid="snapshot-menu">
		<button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-accent" onClick={open}>Open in notebook</button>
		<button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-accent" onClick={duplicate}>Duplicate</button>
		{remove && <button type="button" data-testid="snapshot-remove" className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-accent" onClick={remove}>Remove from this answer</button>}
		<p className="px-3 pb-1.5 pt-1 text-[12.5px] leading-snug text-muted-foreground">Duplicate opens an editable copy that is not attached.{remove ? " Removing keeps the page in your notebook." : ""}</p>
	</div>;
}

function SnapshotDecision({ choose, busy }: { choose: (choice: OpenChoice) => void; busy: boolean }) {
	const title = useRef<HTMLHeadingElement>(null); useEffect(() => { title.current?.focus(); }, []);
	return <section data-testid="handwriting-page-decision" className="space-y-3 p-4">
		<h2 ref={title} tabIndex={-1} className="font-medium">This page has changed</h2>
		<p>The current editable working differs from this snapshot. Choose what to open.</p>
		{([['current', 'Open current working'], ['restore', 'Restore snapshot'], ['copy', 'Open snapshot as copy'], ['cancel', 'Cancel']] as const).map(([choice, label]) => <div key={choice}>
			<button type="button" data-choice={choice} className="min-h-11 w-full rounded border px-3 py-2 text-left" disabled={busy} onClick={() => choose(choice)}>{label}</button>
			{choice === "restore" && <p className="text-xs text-muted-foreground">Keeps this page. Undo can bring back the working it replaces.</p>}
			{choice === "copy" && <p className="text-xs text-muted-foreground">Creates a separate page without changing the original.</p>}
		</div>)}
	</section>;
}

/** Keep enlarged working in the themed app instead of opening a raw white PNG.
 * Native modal focus/inertness, native scrolling and pinch zoom remain available. */
function SharedWritingViewer({ chatId, writing, label, initialDecision = false, onClose }: { chatId: string; writing: SnapshotWriting; label: string; initialDecision?: boolean; onClose: () => void }) {
	const actions = useContext(HandwritingPagesContext), [menu, setMenu] = useState(false), [decision, setDecision] = useState(initialDecision), [busy, setBusy] = useState(false), [notice, setNotice] = useState<string | null>(null);
	const url = sharedWritingImageUrl(chatId, writing.id);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef(onClose);
	function closeLayer() {
		if (menu) { setMenu(false); dialogRef.current?.querySelector<HTMLButtonElement>('[aria-label="Snapshot actions"]')?.focus(); return; }
		if (decision) { actions?.cancel(); if (initialDecision) onClose(); else setDecision(false); return; }
		actions?.cancel(); onClose();
	}
	closeRef.current = closeLayer;
	async function run(duplicate: boolean) { if (!actions || busy) return; setMenu(false); setBusy(true); setNotice(duplicate ? "Duplicating page…" : "Opening page…"); try { const result = await actions.openSnapshot(writing, duplicate); if (result.kind === "opened") onClose(); else { setDecision(result.kind === "choice"); setNotice(result.kind === "failed" ? result.notice : null); } } finally { setBusy(false); } }
	async function choose(choice: OpenChoice) { if (!actions || busy) return; if (choice === "cancel") { closeLayer(); return; } setBusy(true); setNotice(choice === "restore" ? "Restoring snapshot…" : choice === "copy" ? "Duplicating page…" : "Opening page…"); try { const result = await actions.choose(choice); if (result.kind === "opened") onClose(); else setNotice(result.kind === "failed" ? result.notice : null); } finally { setBusy(false); } }
	useEffect(() => {
		const dialog = dialogRef.current!;
		const overflow = document.body.style.overflow;
		dialog.showModal();
		dialog.querySelector<HTMLElement>('[data-testid="handwriting-page-decision"] h2')?.focus();
		document.body.style.overflow = "hidden";
		// One Escape closes this layer, never the underlying tutor/dictation.
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();
		};
		document.addEventListener("keydown", key, true);
		return () => {
			document.removeEventListener("keydown", key, true);
			dialog.close();
			document.body.style.overflow = overflow;
		};
	}, []);
	return <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} data-testid="shared-writing-viewer"
		className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-background/80 backdrop:backdrop-blur-sm"
		style={{ touchAction: "pinch-zoom" }} onClick={event => { if (event.target === event.currentTarget) closeLayer(); }} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); closeLayer(); }}>
		<header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
			<h2 className="text-sm font-medium">Handwritten working</h2>
			{actions && !decision && <button type="button" aria-label="Snapshot actions" aria-expanded={menu} disabled={busy} className="min-h-11 px-3" onClick={() => setMenu(value => !value)}>⋯</button>}
			<button type="button" onClick={closeLayer} aria-label="Close handwritten working" className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Close</button>
		</header>
		{menu && <SnapshotMenu open={() => void run(false)} duplicate={() => void run(true)} close={closeLayer} />}
		{notice && <p role="status" className="p-3">{notice}</p>}
		{decision ? <SnapshotDecision choose={choice => void choose(choice)} busy={busy} /> : <div className="max-h-[calc(100dvh-7rem)] overflow-auto overscroll-contain p-3" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={url} alt={label} className="mx-auto block h-auto max-w-full bg-white" style={{ filter: "var(--lh-writing-image-filter)" }} />
		</div>}
	</dialog>;
}

// The setup's actions are real buttons (finger-sized on touch screens via
// globals.css), not underlined words.
const WRITING_ACTION = "lh-writing-action inline-flex h-8 items-center rounded-full border border-border px-3 font-medium text-foreground transition-colors hover:bg-accent";

export function SharedWritingPanel({ chatId, writing, busy, compact = false, conceptsOffered = true }: {
	chatId: string;
	writing: ReturnType<typeof useSharedWriting>;
	busy: boolean;
	/** "Share from Concepts" belongs with the drawing canvas (Settings →
	 *  Writing): offered where the canvas is on; shared pages always show. */
	conceptsOffered?: boolean;
	/** Beside an open page (the drawing canvas): one line with small
	 *  thumbnails, so the question being answered stays in view. */
	compact?: boolean;
}) {
	const [uploadUrl, setUploadUrl] = useState("");
	const [copied, setCopied] = useState(false);
	useEffect(() => { setUploadUrl(`${location.origin}/api/chats/${encodeURIComponent(chatId)}/writing`); }, [chatId]);
	return <section className="lh-shared-writing mb-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]" data-has-writing={writing.pending.length > 0 || writing.leftOut.length > 0 || !!writing.error} aria-label="Shared writing">
		{writing.pending.length > 0 && (compact ? <div className="flex min-w-0 items-center gap-3">
			<p className="shrink-0 font-medium">{pendingLabel(writing.pending)}</p>
			<SharedWritingImages chatId={chatId} writing={writing.pending} small onRemove={writing.leaveOut} />
		</div> : <>
			<p className="font-medium">{pendingLabel(writing.pending)}</p>
			<SharedWritingImages chatId={chatId} writing={writing.pending} onRemove={writing.leaveOut} />
			<p className="text-muted-foreground">{busy ? "Waiting for the tutor to finish. Your writing stays here." : "Review the images, add an explanation below if needed, then send your answer."}</p>
		</>)}
		{writing.leftOut.length > 0 && <p data-testid="writing-left-out" className={`flex flex-wrap items-center gap-x-2 text-muted-foreground ${writing.pending.length ? "mt-1" : ""}`}>
			{writing.leftOut.length === 1 ? "1 page" : `${writing.leftOut.length} pages`} left out of this answer · still in your notebook
			<button type="button" className="lh-writing-retry min-h-9 font-medium text-foreground underline underline-offset-2" onClick={() => writing.attachAgain()}>Attach again</button>
		</p>}
		{writing.error && <p role="alert" className="text-destructive">{writing.error} <button type="button" className="lh-writing-retry underline underline-offset-2" onClick={() => void writing.refresh().catch(() => {})}>Try again</button></p>}
		{conceptsOffered && <details className={`lh-concepts-setup ${writing.pending.length ? "mt-2" : ""}`}>
			<summary className="lh-concepts-summary cursor-pointer text-muted-foreground transition-colors hover:text-foreground">Share from Concepts</summary>
			<ol className="my-2 list-decimal space-y-1 pl-5">
				<li>Create a Shortcut named <strong>Send to LearnHarness</strong> and enable <strong>Show in Share Sheet</strong>, accepting Images.</li>
				<li>Add <strong>Get Contents of URL</strong> using this session’s URL. Set <strong>Method: POST</strong>, <strong>Request Body: File</strong>, with <strong>Shortcut Input</strong> as the file.</li>
				<li>Add <strong>Show Result</strong> with the HTTP response. A successful upload says “Writing received”.</li>
				<li>In Concepts, export as <strong>PNG</strong>, choose Share, then the shortcut. Return here to review and send.</li>
			</ol>
			<label className="block">This session’s upload URL<input readOnly value={uploadUrl} onFocus={(e) => e.currentTarget.select()} className="my-1 w-full rounded-lg border bg-background p-2" /></label>
			<div className="flex flex-wrap gap-2">
				<button type="button" className={WRITING_ACTION} onClick={() => { void navigator.clipboard.writeText(uploadUrl).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Copied" : "Copy upload URL"}</button>
				<button type="button" className={WRITING_ACTION} onClick={() => void writing.refresh().catch(() => {})}>Check for writing</button>
				<button type="button" className={WRITING_ACTION} onClick={() => location.reload()}>Reload preview</button>
			</div>
			<p className="mt-2 text-muted-foreground">Reload keeps uploaded images, the saved conversation and your unsent message.</p>
		</details>}
	</section>;
}

/** "1 page attached · not sent" for pages from the drawing canvas; shared
 *  images (from Concepts) keep their own word. Pure. */
function pendingLabel(pending: readonly SharedWriting[]): string {
	const n = pending.length;
	return pending.every((item) => item.notebook)
		? `${n} ${n === 1 ? "page" : "pages"} attached · not sent`
		: `${n} shared ${n === 1 ? "image" : "images"} · not sent`;
}
