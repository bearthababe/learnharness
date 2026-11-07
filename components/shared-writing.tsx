"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { sharedWritingImageUrl, type LhMessage, type SharedWriting, type PageAttachments } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { HandwritingPagesContext } from "./handwriting/pages-context";
import type { OpenChoice, SnapshotWriting } from "./handwriting/pages";
import { useMenuEscape } from "./menu-escape";
import { XIcon } from "lucide-react";

export function useSharedWriting(chatId: string, messages: readonly LhMessage[]) {
	const submittedKey = messages.flatMap((m) => m.sharedWriting?.map((w) => w.id) ?? []).join(",");
	const [pending, setPending] = useState<SharedWriting[]>([]);
	const [pageAttachments, setPageAttachments] = useState<PageAttachments | null>(null);
	const [error, setError] = useState<string | null>(null);
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
	return { pending, pageAttachments, error, refresh, ids: () => pending.map((w) => w.id) };
}

export function SharedWritingImages({ chatId, writing, onRemove }: { chatId: string; writing: readonly Pick<SharedWriting, "id">[]; onRemove?: (id: string) => void }) {
	const actions = useContext(HandwritingPagesContext);
	const [opened, setOpened] = useState<{ item: SnapshotWriting; label: string; decision?: boolean } | null>(null), [menu, setMenu] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [busy, setBusy] = useState(false);
	async function run(item: SnapshotWriting, duplicate: boolean) {
		if (!actions || busy) return; setBusy(true); setMenu(null); setNotice(duplicate ? "Duplicating page…" : "Opening page…");
		try { const result = await actions.openSnapshot(item, duplicate); setNotice(result.kind === "failed" ? result.notice : null); if (result.kind === "choice") setOpened({ item, label: "Handwritten working", decision: true }); }
		finally { setBusy(false); }
	}
	return <><div className="flex max-h-32 gap-2 overflow-auto overscroll-contain py-2" data-testid="shared-writing-images">
		{writing.map((item, index) => <div key={item.id} className="flex shrink-0 items-end gap-1" data-writing-id={item.id}><span className="lh-writing-thumb relative inline-block">{onRemove && <button type="button" className="lh-writing-remove" aria-label={`Remove handwritten working ${index + 1} from this message`} title="Remove from this message" data-testid="writing-remove" disabled={busy} onClick={() => { setMenu(null); onRemove(item.id); }}><XIcon aria-hidden /></button>}<button type="button" onClick={() => { setMenu(null); setOpened({ item, label: `Handwritten working ${index + 1}` }); }} className="rounded border bg-white p-1" style={{ filter: "var(--lh-writing-image-filter)" }} aria-label={`Open handwritten working ${index + 1}`}>
			{/* Theme presentation only; the private endpoint retains original PNG bytes. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={sharedWritingImageUrl(chatId, item.id)} alt={`Handwritten working ${index + 1}`} className="h-24 max-w-48 object-contain" />
		</button></span>{actions && <button type="button" className="min-h-11 px-3" aria-label="Snapshot actions" aria-expanded={menu === item.id} disabled={busy} onClick={() => setMenu(value => value === item.id ? null : item.id)}>⋯</button>}
		</div>)}
	</div>{menu && <SnapshotMenu duplicate={() => void run(writing.find(item => item.id === menu)!, true)} open={() => void run(writing.find(item => item.id === menu)!, false)} close={() => { const id = menu; setMenu(null); document.querySelector<HTMLButtonElement>(`[data-writing-id="${id}"] [aria-label="Snapshot actions"]`)?.focus(); }} />}
	{notice && <p role="status" data-testid="snapshot-action-status">{notice}</p>}
	{opened && <SharedWritingViewer chatId={chatId} writing={opened.item} label={opened.label} initialDecision={opened.decision} onClose={() => setOpened(null)} />}</>;
}

function SnapshotMenu({ open, duplicate, close }: { open: () => void; duplicate: () => void; close: () => void }) {
	const menu = useRef<HTMLDivElement>(null); useEffect(() => { menu.current?.focus(); }, []);
	useMenuEscape("snapshot", close);
	return <div ref={menu} tabIndex={-1} className="rounded border bg-background p-2 text-xs" data-testid="snapshot-menu">
		<button type="button" className="block min-h-11 w-full px-3 text-left" onClick={open}>Open in notebook</button>
		<button type="button" className="block min-h-11 w-full px-3 text-left" onClick={duplicate}>Duplicate</button>
		<p>Duplicate opens an editable copy. It is not attached.</p>
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

export function SharedWritingPanel({ chatId, writing: all, busy, hideIds }: {
	chatId: string;
	writing: ReturnType<typeof useSharedWriting>;
	busy: boolean;
	/** Pages already shown with an unconfirmed answer: not listed twice. */
	hideIds?: readonly string[];
}) {
	const hidden = new Set(hideIds ?? []);
	const writing = hidden.size ? { ...all, pending: all.pending.filter((item) => !hidden.has(item.id)) } : all;
	const [uploadUrl, setUploadUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	// Removing only takes the snapshot out of this message: the page stays
	// in the notebook and can be attached again.
	const remove = (id: string) => {
		setRemoveError(null);
		void fetch(`/api/chats/${encodeURIComponent(chatId)}/writing/${encodeURIComponent(id)}`, { method: "DELETE" })
			.then(async (response) => {
				if (!response.ok && response.status !== 409) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn’t remove it. Try again.");
			})
			.catch((error: unknown) => setRemoveError(error instanceof Error ? error.message : "Couldn’t remove it. Try again."))
			.finally(() => void writing.refresh().catch(() => {}));
	};
	useEffect(() => { setUploadUrl(`${location.origin}/api/chats/${encodeURIComponent(chatId)}/writing`); }, [chatId]);
	return <section className="lh-shared-writing mb-2 rounded-lg border border-border bg-card px-3 py-2 text-xs" data-has-writing={writing.pending.length > 0 || !!writing.error} aria-label="Shared writing">
		{writing.pending.length > 0 && <>
			<p className="font-medium">{writing.pending.length} shared {writing.pending.length === 1 ? "image" : "images"} · not sent</p>
			<SharedWritingImages chatId={chatId} writing={writing.pending} onRemove={busy ? undefined : remove} />
			<p className="text-muted-foreground">{busy ? "Waiting for the tutor to finish. Your writing stays here." : "Review the images, add an explanation below if needed, then send your answer. × takes a page out of this message; it stays in your notebook."}</p>
			{removeError && <p role="alert" className="text-destructive">{removeError}</p>}
		</>}
		{writing.error && <p role="alert" className="text-destructive">{writing.error} <button type="button" className="underline" onClick={() => void writing.refresh().catch(() => {})}>Try again</button></p>}
		<details className={`lh-concepts-setup ${writing.pending.length ? "mt-2" : ""}`}>
			<summary className="cursor-pointer text-muted-foreground">Send pages from the Concepts app · setup</summary>
			<ol className="my-2 list-decimal space-y-1 pl-5">
				<li>Create a Shortcut named <strong>Send to LearnHarness</strong> and enable <strong>Show in Share Sheet</strong>, accepting Images.</li>
				<li>Add <strong>Get Contents of URL</strong> using this session’s URL. Set <strong>Method: POST</strong>, <strong>Request Body: File</strong>, with <strong>Shortcut Input</strong> as the file.</li>
				<li>Add <strong>Show Result</strong> with the HTTP response. A successful upload says “Writing received”.</li>
				<li>In Concepts, export as <strong>PNG</strong>, choose Share, then the shortcut. Return here to review and send.</li>
			</ol>
			<label className="block">This session’s upload URL<input readOnly value={uploadUrl} onFocus={(e) => e.currentTarget.select()} className="my-1 w-full rounded border bg-background p-2" /></label>
			<div className="flex flex-wrap gap-4">
				<button type="button" className="underline" onClick={() => { void navigator.clipboard.writeText(uploadUrl).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Copied" : "Copy upload URL"}</button>
				<button type="button" className="underline" onClick={() => void writing.refresh().catch(() => {})}>Check for writing</button>
				<button type="button" className="underline" onClick={() => location.reload()}>Reload preview</button>
			</div>
			<p className="mt-2 text-muted-foreground">Reload keeps uploaded images and saved conversation. Unsent typed text resets.</p>
		</details>
	</section>;
}
