"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckIcon, MicIcon, SquareIcon, XIcon } from "lucide-react";
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
/** How many secret fields the last screenshot masked (the report says so). */
let maskedCount = 0;
function maskClone(node: Node) {
	if (!(node instanceof Element) || !node.matches(SECRET_FIELDS)) return;
	maskedCount += 1;
	if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
		const masked = node.value || node.getAttribute("value") ? DOTS : "";
		node.value = masked; node.setAttribute("value", masked);
		if (node instanceof HTMLTextAreaElement) node.textContent = masked;
		node.removeAttribute("placeholder");
	} else node.textContent = DOTS;
}

/**
 * Pinned rows in a scrolled area (merge proof N1). The screenshot keeps each
 * scrolled area's position by shifting its content up; a row pinned with
 * `position: sticky` (a list's "Your turn in …" line, a pinned Submit row)
 * would be shifted off with it, and its pinning in the copy works out from
 * the top, not from where the learner had scrolled. So every pinned row in a
 * scrolled area is measured where it shows and where it would sit unpinned
 * (a style swap with no paint in between); the copy places it where it shows.
 */
const SHOT_SHIFT = "data-lh-shot-shift", SHOT_TEXT = "data-lh-shot-text";
/**
 * A scrolled field whose text the library cannot move (merge proof N1,
 * round 3): it shifts an area's element children, and plain text, inline
 * children and a textarea's own text ignore that — the composer or a
 * reasoning field scrolled to its last lines would show its first ones.
 */
function holdsLooseText(area: Element): boolean {
	if (area instanceof HTMLTextAreaElement) return true;
	if (!/^(block|flow-root|inline-block|list-item)$/.test(getComputedStyle(area).display)) return false;
	for (const child of area.childNodes) {
		if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.textContent ?? "")) return true;
		if (child instanceof HTMLElement && getComputedStyle(child).display === "inline") return true;
	}
	return false;
}
function markForShot(root: Element): () => void {
	const marked: Element[] = [], seen = new Set<Element>();
	for (const area of root.querySelectorAll("*")) {
		if (!area.scrollTop && !area.scrollLeft) continue;
		if (holdsLooseText(area)) { area.setAttribute(SHOT_TEXT, `${area.scrollLeft} ${area.scrollTop}`); marked.push(area); }
		for (const row of area.querySelectorAll<HTMLElement>("*")) {
			if (seen.has(row)) continue;
			seen.add(row);
			if (getComputedStyle(row).position !== "sticky") continue;
			const shown = row.getBoundingClientRect();
			const before = row.style.getPropertyValue("position"), priority = row.style.getPropertyPriority("position");
			row.style.setProperty("position", "static", "important");
			const unpinned = row.getBoundingClientRect();
			if (before) row.style.setProperty("position", before, priority); else row.style.removeProperty("position");
			row.setAttribute(SHOT_SHIFT, `${shown.left - unpinned.left} ${shown.top - unpinned.top}`);
			marked.push(row);
		}
	}
	return () => { for (const element of marked) { element.removeAttribute(SHOT_SHIFT); element.removeAttribute(SHOT_TEXT); } };
}
const shotOffset = (element: Element, mark: string): [number, number] => {
	const [x, y] = (element.getAttribute(mark) ?? "").split(" ").map(Number);
	return [x || 0, y || 0];
};
/** The copy of a scrolled field: its content moves up as one, as scrolled. */
function placeScrolledText(node: Node) {
	if (!(node instanceof HTMLElement)) return;
	// A textarea's text is not content the copy can move: its parent swaps it
	// for a box of the same look holding the text, moved as scrolled.
	for (const child of [...node.children]) if (child instanceof HTMLTextAreaElement && child.hasAttribute(SHOT_TEXT)) child.replaceWith(textareaAsText(child));
	if (node instanceof HTMLTextAreaElement || !node.hasAttribute(SHOT_TEXT)) return;
	const [left, top] = shotOffset(node, SHOT_TEXT);
	node.removeAttribute(SHOT_TEXT);
	const content = node.ownerDocument.createElement("div");
	content.style.cssText = `display:block;margin:0;padding:0;border:0;transform:translate(${-left}px, ${-top}px)`;
	for (const child of [...node.childNodes]) {
		// The library already moved element children; the whole content moves once instead.
		if (child instanceof HTMLElement) { const back = new DOMMatrix(child.style.transform || "none"); back.e += left; back.f += top; child.style.transform = back.toString(); }
		content.append(child);
	}
	node.append(content);
}
function textareaAsText(area: HTMLTextAreaElement): HTMLElement {
	const [left, top] = shotOffset(area, SHOT_TEXT);
	const box = area.ownerDocument.createElement("div");
	box.style.cssText = area.style.cssText;
	box.style.setProperty("overflow", "hidden");
	box.style.setProperty("white-space", "pre-wrap");
	box.style.setProperty("overflow-wrap", "break-word");
	const content = area.ownerDocument.createElement("div");
	content.style.cssText = `transform:translate(${-left}px, ${-top}px)`;
	// The copy's value (masked already when the field is secret).
	content.textContent = area.getAttribute("value") ?? area.textContent ?? "";
	box.append(content);
	return box;
}
function placePinnedRow(node: Node) {
	if (!(node instanceof HTMLElement) || !node.hasAttribute(SHOT_SHIFT)) return;
	const [dx, dy] = shotOffset(node, SHOT_SHIFT);
	node.removeAttribute(SHOT_SHIFT);
	// Positioned (it stays above the rows it covered), offset by hand only.
	node.style.position = "relative";
	for (const side of ["top", "right", "bottom", "left", "inset-block-start", "inset-block-end", "inset-inline-start", "inset-inline-end"]) node.style.setProperty(side, "auto");
	const shift = new DOMMatrix(node.style.transform || "none");
	shift.e += dx; shift.f += dy;
	node.style.transform = shift.toString();
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
		// The screenshot code loads ahead, when the device is idle (a built app
		// has the chunk ready; a dev server would compile it on every first visit).
		if (process.env.NODE_ENV !== "production") return;
		const load = () => { void import("modern-screenshot"); };
		const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
		if (w.requestIdleCallback) w.requestIdleCallback(load); else window.setTimeout(load, 3000);
	}, []);

	// P2 (round 20): a proper modal — focus moves in once the screenshot is
	// taken (a held menu stays open for its shot), Tab stays inside, Escape
	// saves and closes, and focus returns where it was (pointer devices; a
	// touch screen never gets its keyboard raised by it).
	const backdropPress = useRef(false);
	const sheetRef = useRef<HTMLDivElement>(null);
	const returnFocus = useRef<HTMLElement | null>(null);
	const restoreFocus = () => {
		const back = returnFocus.current; returnFocus.current = null;
		if (back?.isConnected && !matchMedia("(pointer: coarse)").matches) back.focus({ preventScroll: true });
	};
	const trapKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab") return;
		const items = [...(sheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], textarea, [tabindex='0']") ?? [])].filter(el => el.getClientRects().length > 0);
		if (!items.length) return;
		const first = items[0]!, last = items.at(-1)!, at = document.activeElement;
		if (event.shiftKey ? at === first || at === sheetRef.current : at === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
	};
	/** Leave the dialog keeping the report (Close, Open report, another page). */
	const leave = useCallback(async (silent = false) => {
		// Words still being spoken land in the note before it lets go of the mic.
		if (isDictationActive()) await finishDictation().catch(() => {});
		const draft = draftRef.current;
		setOpen(false); openAt.current = null; restoreFocus();
		if (!draft) return;
		draft.update({ closed: true });
		if (!silent) showToast({ text: "Report saved", id: draft.value.id });
		try { await draft.flush(); void fetch(`/api/bugs/${draft.value.id}/file`, { method: "POST", keepalive: true }).catch(() => {}); } catch { /* kept on this device; sent on the next visit */ }
		if (draftRef.current === draft) draftRef.current = null;
	}, [showToast]);

	const discard = useCallback(async () => {
		if (isDictationActive()) await finishDictation().catch(() => {});
		const draft = draftRef.current;
		setOpen(false); openAt.current = null; draftRef.current = null; restoreFocus();
		if (!draft) return;
		draft.update({ discardPending: true });
		showToast({ text: "Report discarded" });
		void draft.flush().catch(() => {});
	}, [showToast]);

	// P2 (round 20): Escape saves and closes, like ✕ (first, so nothing beneath acts on it).
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => { if (event.key !== "Escape" || event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); void leave(); };
		document.addEventListener("keydown", onKey, true);
		return () => document.removeEventListener("keydown", onKey, true);
	}, [open, leave]);

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
			const active = document.activeElement;
			returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
			setOpen(true);
			flush(draft);
			// Menus close first (a tap), so the shot shows the page, not the menu.
			await new Promise(r => setTimeout(r, keepMenus ? 60 : 420));
			try {
				const { domToBlob } = await import("modern-screenshot");
				maskedCount = 0;
				const h = innerHeight;
				const unmark = markForShot(document.body);
				const blob = await domToBlob(document.body, {
					width: innerWidth, height: h, scale: 1, font: false, type: "image/jpeg", quality: 0.85,
					backgroundColor: getComputedStyle(document.body).backgroundColor,
					style: { margin: "0" },
					filter: node => !(node instanceof Element) || !node.closest(".lh-bug-sheet, .lh-bug-toast, .lh-bug-backdrop"),
					onCloneEachNode: node => { placePinnedRow(node); maskClone(node); placeScrolledText(node); },
					// The current screen as the learner sees it: a scrolled area (a
					// Settings pane, the lesson, a list) keeps its scroll position in the
					// shot, instead of showing from its top; its pinned rows stay where
					// they show, and a scrolled field shows the lines on screen (merge proof N1).
					features: { restoreScrollPosition: true },
				}).finally(unmark);
				await draft.flush();
				if (draft.value.discardPending) return;
				const res = await fetch(`/api/bugs/${reportId}/screenshot`, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
				if (!res.ok) throw new Error(String(res.status));
				// The report records what its screenshot hid (keys, passwords, secret fields).
				void fetch(`/api/bugs/${reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenshotMasked: maskedCount }) }).catch(() => {});
				if (draftRef.current === draft) setShot("ok");
			} catch {
				if (draftRef.current === draft) setShot("failed");
			}
			const sheet = sheetRef.current;
			if (draftRef.current === draft && sheet && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
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
				// P2 (round 20): a dimmed backdrop (a tap on it saves and closes, like ✕);
				// the screenshot never includes it (see the capture's filter). Only a
				// tap that began on it counts: lifting the finger off a held Report
				// (the report opened under it) must not close what just opened.
				<div className="lh-bug-backdrop" data-testid="bug-backdrop" aria-hidden="true"
					onPointerDown={() => { backdropPress.current = true; }}
					onClick={() => { if (!backdropPress.current) return; backdropPress.current = false; void leave(); }} />
			)}
			{open && (
				<div ref={sheetRef} className="lh-bug-sheet" role="dialog" aria-modal="true" aria-labelledby="lh-bug-title" data-testid="bug-dialog" data-kind={kind} tabIndex={-1} onKeyDown={trapKeys}>
					<div className="lh-bug-head">
						<strong id="lh-bug-title">🐞 Report a problem</strong>
						<button type="button" className="lh-bug-x" data-testid="bug-x" aria-label="Save and close" title="Save and close" onClick={() => void leave()}><XIcon aria-hidden /></button>
						<span className="lh-bug-status" role="status" data-testid="bug-status" data-saving={saving} data-shot={shot}>
							{saving === "offline" ? "Kept on this device · will save when online" : saving === "saving" ? "Saving…" : shot === "pending" ? "Saved · taking the screenshot…" : shot === "failed" ? "Saved · no screenshot" : "Saved with a screenshot"}
						</span>
					</div>
					{/* P2: the captured screenshot, once it is ready (keys and passwords hidden). */}
					<div className="lh-bug-shot" data-testid="bug-shot" data-state={shot}>
						{shot === "ok" && id ? <a href={`/api/bugs/${id}/screenshot`} target="_blank" rel="noreferrer" aria-label="Open the screenshot">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={`/api/bugs/${id}/screenshot`} alt="Screenshot of this screen (keys and passwords hidden)" data-testid="bug-thumb" /></a>
							: <span className="lh-bug-shot-wait" aria-hidden="true">{shot === "failed" ? "No screenshot" : "Screenshot…"}</span>}
						<span className="lh-bug-shot-caption">{shot === "ok" ? "This screen, with keys and passwords hidden" : shot === "failed" ? "The report is saved without one" : "Taking it now"}</span>
					</div>
					<div className="lh-bug-kind" role="radiogroup" aria-label="Kind of report">
						{(["bug", "change"] as const).map(k => (
							<button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`bug-kind-${k}`} onClick={() => { setKind(k); edit({ kind: k }); }}>
								{kind === k && <CheckIcon aria-hidden className="lh-bug-kind-check" />}{k === "bug" ? "🐞 Bug" : "💡 Change"}
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
					<p className="lh-bug-hint">{kind === "change" ? "A change keeps your note, the page and the screenshot (no error log)." : "Reports stay on this computer."}</p>
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
