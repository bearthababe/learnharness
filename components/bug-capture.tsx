"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MicIcon, SquareIcon } from "lucide-react";
import { useDeploymentActivity } from "@/components/deployment-activity";
import { useDeviceClass } from "@/components/device-features";
import { dictationAvailable, finishDictation, joinDictation, useDictationTarget } from "@/components/dictation";
import { isDictationActive, useDictationActive } from "@/components/dictation-state";
import { BugDraft, newReportId, persistDraft, readOutbox, type BugDraftValue, type BugKind, type BugTransport } from "@/components/bug-draft";

/**
 * Round 19 (§0, owner): 🐞 Report a problem, ported from lego-notebook with
 * 3d-printers' durable drafts and masked screenshots.
 *
 * From any screen (the ⋯ page menu, the notebook's options, the laptop's
 * sidebar footer, Settings → About): the dialog opens at once, the report is
 * saved under its own id right away, and a masked viewport screenshot fills
 * in after. A tap captures with menus closed; holding half a second captures
 * with the open menu still showing. The note (typed or dictated) is kept as
 * it is typed, on this device too until the server has it. Close, Open
 * report and leaving the page keep the report ("Report saved"); Discard
 * deletes it. Reports stay in this instance's data dir.
 */
export const BUG_CAPTURE_EVENT = "lh:bug-capture";
export const captureBug = (keepMenus = false) => window.dispatchEvent(new CustomEvent(BUG_CAPTURE_EVENT, { detail: { keepMenus } }));
const HOLD_MS = 500;

/** Press handlers for a 🐞 control: tap → `onTap` (close the menu), then
 *  capture; hold ~0.5 s → capture now, menus still open. */
export function useBugPress(onTap?: () => void) {
	const timer = useRef(0), held = useRef(false);
	const stop = () => window.clearTimeout(timer.current);
	return {
		onPointerDown: () => {
			held.current = false;
			stop();
			timer.current = window.setTimeout(() => { held.current = true; navigator.vibrate?.(15); captureBug(true); }, HOLD_MS);
		},
		onPointerUp: stop,
		onPointerCancel: stop,
		onPointerLeave: stop,
		onClick: () => {
			stop();
			if (held.current) { held.current = false; return; }
			onTap?.();
			captureBug(false);
		},
		onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
	};
}

/** Fields whose contents never enter a screenshot. */
export const SECRET_FIELDS = [
	'input[type="password"]', "[data-lh-secret]", 'input[autocomplete*="password"]',
	'input[aria-label$=" key" i]', 'input[aria-label*="api key" i]', 'input[aria-label*="token" i]', 'input[aria-label*="password" i]', 'input[aria-label*="secret" i]',
	'input[name*="key" i]', 'input[name*="token" i]', 'input[name*="secret" i]', 'input[placeholder*="key" i]',
].join(", ");
const DOTS = "••••••••";
function maskClone(node: Node) {
	if (!(node instanceof Element) || !node.matches(SECRET_FIELDS)) return;
	if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
		const masked = node.value || node.getAttribute("value") ? DOTS : "";
		node.value = masked; node.setAttribute("value", masked);
		if (node instanceof HTMLTextAreaElement) node.textContent = masked;
		node.removeAttribute("placeholder");
	} else node.textContent = DOTS;
}

/** This device's try-out variants and settings (an allow-list: no drafts, no learner text). */
const SETTING_KEYS = /^lh:(try:[\w-]+|device-tool:[\w-]+|writing-palette|writing-wheel-look|header-look|reveal-style|keyboard-off|prototype-view|sidebar-open|hw-zoom|hw-split|tablet-ui-size|focus-place|ask-tutor|reading-size|text-size|theme|appearance)$/;
function deviceSettings(): Record<string, string> {
	const out: Record<string, string> = {};
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !SETTING_KEYS.test(key)) continue;
			const value = localStorage.getItem(key) ?? "";
			if (value.length <= 32) out[key.slice(3)] = value;
		}
	} catch { /* storage blocked */ }
	const html = document.documentElement.dataset;
	for (const name of ["headerLook", "focusPlace", "cardLayout", "device", "sidebarBoot", "tabletUi"]) if (html[name]) out[`html:${name}`] = html[name]!;
	return out;
}

const transport: BugTransport = {
	async create(id, report) {
		const res = await fetch("/api/bugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, report }) });
		if (res.status === 410) return "discarded";
		if (!res.ok) throw new Error(`Report not saved (${res.status})`);
		return "saved";
	},
	async edit(id, edit) {
		const res = await fetch(`/api/bugs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit), keepalive: true });
		if (!res.ok) throw new Error(`Note not saved (${res.status})`);
	},
	async remove(id) {
		const res = await fetch(`/api/bugs/${id}`, { method: "DELETE", keepalive: true });
		if (!res.ok && res.status !== 404) throw new Error(`Not discarded (${res.status})`);
	},
};

type Shot = "pending" | "ok" | "failed";
type Toast = { text: string; id?: string } | null;

export function BugCapture() {
	const device = useDeviceClass();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [id, setId] = useState<string | null>(null);
	const [kind, setKind] = useState<BugKind>("bug");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState<"saving" | "saved" | "offline">("saving");
	const [shot, setShot] = useState<Shot>("pending");
	const [copied, setCopied] = useState(false);
	const [toast, setToast] = useState<Toast>(null);
	const draftRef = useRef<BugDraft | null>(null);
	const flushTimer = useRef(0), toastTimer = useRef(0);
	const openAt = useRef<string | null>(null);
	const noteRef = useRef<HTMLTextAreaElement>(null);
	const dictating = useDictationActive();
	const [canDictate, setCanDictate] = useState(false);

	// main's busy signal: an open report with a note not yet on the server.
	useDeploymentActivity("bug-report", () => open && (!!note.trim() || !(draftRef.current?.saved ?? true)));

	const flush = useCallback((draft: BugDraft) => {
		setSaving("saving");
		draft.flush().then(() => { if (draftRef.current === draft) setSaving("saved"); }, () => { if (draftRef.current === draft) setSaving("offline"); });
	}, []);
	const showToast = useCallback((next: Toast) => {
		window.clearTimeout(toastTimer.current);
		setToast(next);
		toastTimer.current = window.setTimeout(() => setToast(null), 4500);
	}, []);

	// Drafts left behind (a reload, offline) finish now; Discards pending finish too.
	useEffect(() => {
		for (const value of Object.values(readOutbox())) {
			if (draftRef.current?.value.id === value.id) continue;
			void new BugDraft({ ...value, closed: true }, transport, persistDraft).flush().catch(() => {});
		}
		const load = () => { void import("modern-screenshot"); };
		const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
		if (w.requestIdleCallback) w.requestIdleCallback(load); else window.setTimeout(load, 3000);
	}, []);

	/** Leave the dialog keeping the report (Close, Open report, another page). */
	const leave = useCallback(async (silent = false) => {
		// Words still being spoken land in the note before it lets go of the mic.
		if (isDictationActive()) await finishDictation().catch(() => {});
		const draft = draftRef.current;
		setOpen(false); openAt.current = null;
		if (!draft) return;
		draft.update({ closed: true });
		if (!silent) showToast({ text: "Report saved", id: draft.value.id });
		try { await draft.flush(); void fetch(`/api/bugs/${draft.value.id}/file`, { method: "POST", keepalive: true }).catch(() => {}); } catch { /* kept on this device; sent on the next visit */ }
		if (draftRef.current === draft) draftRef.current = null;
	}, [showToast]);

	const discard = useCallback(async () => {
		if (isDictationActive()) await finishDictation().catch(() => {});
		const draft = draftRef.current;
		setOpen(false); openAt.current = null; draftRef.current = null;
		if (!draft) return;
		draft.update({ discardPending: true });
		showToast({ text: "Report discarded" });
		void draft.flush().catch(() => {});
	}, [showToast]);

	// Navigating away keeps the report (and says so).
	useEffect(() => {
		if (!open) return;
		if (openAt.current === null) { openAt.current = pathname; return; }
		if (openAt.current !== pathname) void leave();
	}, [pathname, open, leave]);
	useEffect(() => {
		const away = () => { const draft = draftRef.current; if (draft) { draft.update({ closed: true }); void draft.flush().catch(() => {}); } };
		window.addEventListener("pagehide", away);
		return () => window.removeEventListener("pagehide", away);
	}, []);

	useEffect(() => {
		const go = async (keepMenus: boolean) => {
			if (draftRef.current) await leave(true);
			const reportId = newReportId();
			const html = document.documentElement;
			const page: Record<string, unknown> = {
				at: new Date().toISOString(),
				path: location.pathname,
				url: location.origin + location.pathname + location.search,
				viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY), visualHeight: window.visualViewport?.height ?? null },
				userAgent: navigator.userAgent,
				colorScheme: html.classList.contains("dark") ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
				menusKeptOpen: keepMenus,
				device: { class: device, settings: deviceSettings() },
				sessionId: location.pathname.match(/^\/chat\/([^/?#]+)/)?.[1] ?? null,
				log: (window.__lhBugLog ?? []).slice(-80),
			};
			const value: BugDraftValue = { id: reportId, kind: "bug", note: "", sequence: 0, savedSequence: -1, created: false, report: page };
			const draft = new BugDraft(value, transport, persistDraft);
			draftRef.current = draft;
			persistDraft(value, false);
			setId(reportId); setKind("bug"); setNote(""); setShot("pending"); setCopied(false); setSaving("saving");
			setCanDictate(dictationAvailable());
			setOpen(true);
			flush(draft);
			// Menus close first (a tap), so the shot shows the page, not the menu.
			await new Promise(r => setTimeout(r, keepMenus ? 60 : 420));
			try {
				const { domToBlob } = await import("modern-screenshot");
				const h = innerHeight;
				const blob = await domToBlob(document.body, {
					width: innerWidth, height: h, scale: 1, font: false, type: "image/jpeg", quality: 0.85,
					backgroundColor: getComputedStyle(document.body).backgroundColor,
					style: { margin: "0" },
					filter: node => !(node instanceof Element) || !node.closest(".lh-bug-sheet, .lh-bug-toast"),
					onCloneEachNode: maskClone,
				});
				await draft.flush();
				if (draft.value.discardPending) return;
				const res = await fetch(`/api/bugs/${reportId}/screenshot`, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
				if (!res.ok) throw new Error(String(res.status));
				if (draftRef.current === draft) setShot("ok");
			} catch {
				if (draftRef.current === draft) setShot("failed");
			}
		};
		const on = (event: Event) => void go((event as CustomEvent<{ keepMenus?: boolean }>).detail?.keepMenus ?? false);
		window.addEventListener(BUG_CAPTURE_EVENT, on);
		return () => window.removeEventListener(BUG_CAPTURE_EVENT, on);
	}, [device, flush, leave]);

	const edit = (patch: { note?: string; kind?: BugKind }) => {
		const draft = draftRef.current;
		if (!draft) return;
		draft.update(patch);
		window.clearTimeout(flushTimer.current);
		flushTimer.current = window.setTimeout(() => flush(draft), patch.kind ? 0 : 500);
	};
	const setNoteText = (text: string) => { setNote(text); edit({ note: text }); };
	// While the dialog is open, speech goes into the note (the page's own
	// dictation, claimed on top of any field beneath).
	const noteNow = useRef(note); noteNow.current = note;
	const appendSpoken = useCallback((text: string) => { const next = joinDictation(noteNow.current, text); noteNow.current = next; setNote(next); const draft = draftRef.current; if (draft) { draft.update({ note: next }); flush(draft); } }, [flush]);
	useDictationTarget(appendSpoken, open);

	const url = id ? `/bugs/${id}` : "";
	return (
		<>
			{open && (
				<div className="lh-bug-sheet" role="dialog" aria-label="Report a problem" data-testid="bug-dialog" data-kind={kind}>
					<div className="lh-bug-head">
						<strong>🐞 Report a problem</strong>
						<span className="lh-bug-status" role="status" data-testid="bug-status" data-saving={saving} data-shot={shot}>
							{saving === "offline" ? "Kept on this device · will save when online" : saving === "saving" ? "Saving…" : shot === "pending" ? "Saved · taking the screenshot…" : shot === "failed" ? "Saved · no screenshot" : "Saved with a screenshot"}
						</span>
					</div>
					<div className="lh-bug-kind" role="radiogroup" aria-label="Kind of report">
						{(["bug", "change"] as const).map(k => (
							<button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`bug-kind-${k}`} onClick={() => { setKind(k); edit({ kind: k }); }}>
								{k === "bug" ? "🐞 Bug" : "💡 Change"}
							</button>
						))}
					</div>
					<div className="lh-bug-note">
						<textarea ref={noteRef} value={note} rows={3} data-testid="bug-note" aria-label="What happened"
							placeholder={kind === "change" ? "What should change, and why?" : "What happened? What did you expect?"}
							onChange={event => setNoteText(event.target.value)} />
						{canDictate && (
							<button type="button" className="lh-bug-mic" data-active={dictating || undefined} data-testid="bug-mic"
								aria-label={dictating ? "Stop dictation" : "Dictate the note"} aria-pressed={dictating}
								onClick={() => window.dispatchEvent(new Event("lh:kbd-toggle-dictation"))}>
								{dictating ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
							</button>
						)}
					</div>
					<p className="lh-bug-hint">{kind === "change" ? "A change keeps your note, the page and the screenshot (no error log)." : "The screenshot hides keys and passwords. Reports stay on this computer."}</p>
					<div className="lh-bug-actions">
						<button type="button" className="lh-bug-primary" data-testid="bug-close" onClick={() => void leave()}>Save and close</button>
						{url ? <Link href={url} className="lh-bug-secondary" data-testid="bug-open" onClick={() => void leave()}>Open report</Link> : <span className="lh-bug-secondary" aria-disabled="true">Open report</span>}
						<button type="button" className="lh-bug-secondary" data-testid="bug-copy" disabled={!url} onClick={async () => { try { await navigator.clipboard.writeText(location.origin + url); setCopied(true); } catch { /* not allowed */ } }}>{copied ? "✓ Copied" : "Copy link"}</button>
						<button type="button" className="lh-bug-discard" data-testid="bug-discard" onClick={() => void discard()}>Discard</button>
					</div>
					<Link href="/bugs" className="lh-bug-all" data-testid="bug-all" onClick={() => void leave()}>See all reports</Link>
				</div>
			)}
			{toast && (
				<div className="lh-bug-toast" role="status" aria-live="polite" data-testid="bug-toast">
					<span>{toast.text === "Report saved" ? "✓ " : ""}{toast.text}</span>
					{toast.id && <Link href={`/bugs/${toast.id}`} onClick={() => setToast(null)}>Open</Link>}
				</div>
			)}
		</>
	);
}
