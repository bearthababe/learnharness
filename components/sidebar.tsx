"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useFocusMode } from "@/components/focus-mode";
import { usePathname, useRouter } from "next/navigation";
import { MenuShell } from "@/components/menu-shell";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { forgetHandwritingOnDevice } from "@/components/handwriting/device";
import type { ChatDeleteMode } from "@/src/core";
import { BookOpenIcon, ChevronLeftIcon, DumbbellIcon, MoreHorizontalIcon, PanelLeftCloseIcon, PlusIcon, PanelLeftOpenIcon, RotateCwIcon, SearchIcon, SettingsIcon, TargetIcon, XIcon } from "lucide-react";
import { ActivitySection } from "@/components/activity-dock";
import { CoverageMenuBlock } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { BrailleSpinner } from "@/components/braille-spinner";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SettingsDialogProvider, useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fuzzyScore } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import type { ChatListItem } from "@/src/core";
import { kbdEventForAction } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { usePhoneViewport } from "@/components/use-phone-viewport";
import { useTryout } from "@/components/device-prefs";
import { bindSidebarSwipe } from "@/components/sidebar-swipe";
import { publishWaitingCount, useWaitingCount } from "@/components/sessions-summary";
import { hasNewResult, useSessionSeen } from "@/components/session-seen";

/**
 * Desktop navigation sits inline and retains its open preference. On phones
 * it is a full-width modal panel, closed on launch and after choosing a route.
 */

const STORAGE_KEY = "lh:sidebar-open";

/*
 * Narrow-window behavior (owner, 2026-09-17): below SIDEBAR_AUTOCLOSE the
 * sidebar would squeeze the page below the 640px window floor (the two
 * numbers compose: 640 + 288 sidebar = 928), so it auto-closes — and
 * auto-RESTORES when the window widens again (owner choice: the sidebar
 * pops back, not a manual re-open). The whole behavior is one expression:
 * rendered = pref && !narrow, where pref is the persisted user choice.
 * Manual closes persist and stay closed; auto-close does not touch the
 * preference. Opening the sidebar while narrow asks the Electron shell to
 * widen the window to the threshold (window.lh.expandWindow, IPC in
 * electron/main.cjs) — the resize listener flips `narrow` and the sidebar
 * appears. In the plain browser there is no window to widen and no
 * suppression — a narrow tab opens the sidebar if the user says so.
 *
 * Mirrors SIDEBAR_AUTOCLOSE in electron/main.cjs — keep in sync.
 */
import type { ChatGPTControlBridge, NativeSubscriptionControlBridge } from "@/src/core";
import type { UpdateState } from "@/components/settings/update-settings.tsx";
import { FilePathDropZone } from "@/components/file-path-drop-zone";
import { PrototypeSwitch } from "@/components/prototype-switch";
const SIDEBAR_AUTOCLOSE = 928;

// Module scope, guarded for SSR (the server has no navigator).
const IS_ELECTRON = typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

declare global {
	interface Window {
		/** Preload bridge (electron/preload.cjs) — Electron only, absent in the browser. */
		lh?: {
			/** Read-only host OS; determines the native-control gutter. */
			platform?: string;
			/** Resolve an OS-backed File without copying/uploading its contents. */
			getPathForFile?: (file: File) => string;
			/** Choose one original directory path, without reading its contents. */
			chooseAttachmentFolder?: () => Promise<string | null>;
			/** External Next desktop-dev uses the server's web connections. */
			subscriptionTransport?: "desktop" | "web";
			openSubscriptionBrowser?: (action: string) => Promise<void>;
			chatgpt?: ChatGPTControlBridge;
			subscriptions?: NativeSubscriptionControlBridge;
			expandWindow: () => void;
			/** The zoom truth (owner round 7): subscribes to "lh:zoom" pushes; returns unsubscribe. */
			onZoom?: (cb: (factor: number) => void) => () => void;
			getZoom?: () => Promise<number>;
			/** Observational update events and a snapshot for late subscribers. */
			onUpdateStatus?: (cb: (status: UpdateState) => void) => () => void;
			getUpdateState?: () => Promise<UpdateState>;
			/** Explicit manual check also downloads and stages available updates. */
			checkForUpdates?: () => Promise<void>;
			installUpdate?: () => void;
			onOpenSettings?: (cb: (section: string) => void) => () => void;
		};
	}
}

const SidebarContext = createContext<{ open: boolean; phone: boolean; drawer: boolean; toggle: () => void; closePhone: () => void }>({
	open: false,
	phone: false,
	drawer: false,
	toggle: () => {},
	closePhone: () => {},
});

/** Portrait tablets: the sessions list is an overlay drawer, closed by
 *  default, so the lesson keeps the full width. Wider screens keep the
 *  inline sidebar and its remembered preference. */
const DRAWER_MEDIA = "(min-width: 768px) and (max-width: 1023px)";
function subscribeDrawer(update: () => void) {
	const media = window.matchMedia?.(DRAWER_MEDIA);
	media?.addEventListener("change", update);
	return () => media?.removeEventListener("change", update);
}
/** Read synchronously while rendering: during hydration the store still
 *  reports its server value, and a tablet must never flash the inline
 *  sidebar open (the width change unpins the conversation from its end). */
function drawerNow() {
	return typeof window !== "undefined" && (window.matchMedia?.(DRAWER_MEDIA).matches ?? false) && !(window.matchMedia?.("(max-width: 767px)").matches ?? false);
}
function useDrawerLayout() {
	return useSyncExternalStore(subscribeDrawer, () => window.matchMedia?.(DRAWER_MEDIA).matches ?? false, () => false);
}

export function useSidebar() {
	return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const bridge = window.lh?.chatgpt;
		if (!bridge) return;
		const off = bridge.onChange(() => notifySettingsSaved("keys"));
		notifySettingsSaved("keys"); // cover changes missed before this root-lifetime subscription
		return off;
	}, []);
	// Start closed so server and client first-render agree (no hydration
	// mismatch); the stored value is applied after mount.
	const [open, setOpen] = useState(false);
	const [narrow, setNarrow] = useState(false);
	const [mounted, setMounted] = useState(false);
	const phone = usePhoneViewport();
	const drawer = useDrawerLayout() && !phone;
	const [phoneOpen, setPhoneOpen] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const closePhone = useCallback(() => { setPhoneOpen(false); setDrawerOpen(false); }, []);
	const pathname = usePathname();
	useEffect(() => { closePhone(); }, [pathname, phone, closePhone]);

	useEffect(() => {
		// Electron shell detection (merged chrome, 2026-09-17): keys the
		// .lh-electron CSS (app/globals.css) that turns the header bands
		// into the window's drag surface. Post-mount only — server HTML
		// and first client render must agree (no hydration mismatch),
		// and in the plain browser the class never appears.
		if (IS_ELECTRON) {
			document.documentElement.classList.add("lh-electron");
			document.documentElement.dataset.lhPlatform = window.lh?.platform ?? "";
		}

		// THE ZOOM TRUTH (owner round 7, 2026-10-05): ⌘±/⌘0 zoom the UI
		// (Electron zoomFactor) while the native traffic lights stay
		// physical-fixed — the CSS gutter lengths divide by this factor so
		// their RENDERED size never moves. getZoom covers the first-paint
		// race; every later change arrives as an lh:zoom push.
		const setZoomVar = (factor: number) =>
			document.documentElement.style.setProperty("--lh-zoom", String(factor));
		const off = window.lh?.onZoom?.(setZoomVar);
		void window.lh?.getZoom?.().then(setZoomVar);

		const stored = localStorage.getItem(STORAGE_KEY);
		// Default: open (first run introduces the sidebar).
		setOpen(stored === null ? true : stored === "1");
		setMounted(true);
		return () => off?.();
	}, []);

	// B13 (round 18): until React's own state matches, CSS shows the state the
	// boot script read before the first paint (no slide on load); once it does,
	// the boot rules step aside and only the user's toggles animate.
	useEffect(() => { if (mounted) document.documentElement.dataset.sidebarSynced = ""; }, [mounted]);

	// Narrow-window auto-close/auto-restore (see SIDEBAR_AUTOCLOSE note):
	// fires only on actual resizes — a boolean compare, no layout work.
	// Both this and the mount effect land before the first paint, so a
	// narrow window never flashes the open sidebar on load.
	useEffect(() => {
		if (!IS_ELECTRON) return; // plain-browser tabs open freely
		const onResize = () => setNarrow(window.innerWidth < SIDEBAR_AUTOCLOSE);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const toggle = useCallback(() => {
		if (phone) {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			setPhoneOpen((value) => !value);
			return;
		}
		if (drawer) {
			setDrawerOpen((value) => !value);
			return;
		}
		// Opening while narrow (auto-closed, or the user's own closed-at-
		// narrow): ask the shell to widen to the threshold — the resize
		// listener flips `narrow` and the sidebar appears. The preference
		// persists like any other open, so a restart at a narrow width
		// still auto-restores when widened.
		if (narrow && !open) {
			localStorage.setItem(STORAGE_KEY, "0");
			setOpen(true);
			window.lh?.expandWindow();
			return;
		}
		setOpen((v) => {
			localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
			return !v;
		});
	}, [narrow, open, phone, drawer]);

	// ⌘B: the global shortcut dispatches kbdEventForAction("toggle-sidebar")
	// and the context answers on exactly that name — the shared spelling
	// is the fix for the interlude bug (the listener sat on the pre-
	// convention name "lh:toggle-sidebar" while the dispatcher sent
	// "lh:kbd-toggle-sidebar", so ⌘B silently did nothing; owner
	// 2026-09-25).
	useEffect(() => {
		const event = kbdEventForAction("toggle-sidebar");
		const onToggle = () => toggle();
		window.addEventListener(event, onToggle);
		return () => window.removeEventListener(event, onToggle);
	}, [toggle]);

	return (
		<SidebarContext.Provider value={{ open: phone ? phoneOpen : drawer || drawerNow() ? drawerOpen : open && !narrow, phone, drawer, toggle, closePhone }}>
			{/* transitions gated on mount: no slide-in flash on page load */}
			<div className={cn("lh-app-shell flex h-dvh", mounted && "[&_.sidebar-motion]:transition-[width,margin,opacity]")} data-drawer={drawer || undefined} data-drawer-open={(drawer && drawerOpen) || undefined}>{children}</div>
		</SidebarContext.Provider>
	);
}

/** Hamburger for page headers — only visible when the sidebar is closed.
 *
 *  Owner, round 6c: the toggle is ALWAYS MOUNTED, owning a slot whose
 *  width+margin animate in LOCKSTEP with the sidebar's own width
 *  transition (same duration-200, same easing, both gated on mount) —
 *  before, it mounted/unmounted in one frame, so its 48px footprint
 *  (button + gap) popped and dragged the title and chips sideways while
 *  the sidebar was still mid-slide. When open the slot is exactly zero
 *  (w-0 -mr-3: width 0, the negative margin cancels the header's gap-3),
 *  so resting layouts are pixel-identical to the old conditional render.
 *  The icon fades with the slot and is clipped by it as it collapses —
 *  no popping in either direction. */
export function SidebarToggle() {
	const { open, phone, drawer, toggle } = useSidebar();
	const waiting = useWaitingCount();
	// P4 (round 17, phones): as a page under the bar, Sessions stays in the
	// bar as the current page; a second tap closes it, where it opened.
	const sessionsPage = useTryout("sessionsPage");
	const pageBar = phone && sessionsPage === "toolbar";
	const current = open && pageBar;
	// Round 15 (F1): where the list is an overlay (phones, tablet drawers) the
	// bar underneath never rearranges, so closing the list never slides Home.
	// Only the docked laptop sidebar takes the chip's place.
	const collapse = open && !phone && !drawer;
	return (
		<span
			className={cn(
				"sidebar-motion lh-no-drag relative flex shrink-0 items-center overflow-hidden duration-200",
				collapse ? "w-0 -mr-3" : "w-auto mr-0 lh-closed-toggle",
			)}
		>
			<Hint label="Open sessions" action="toggle-sidebar" disabled={phone}>
			<Button
				variant="ghost"
				size="icon"
				data-testid="open-sidebar"
				aria-label={current ? "Close sessions" : "Open sessions"}
				aria-describedby={waiting > 0 ? "lh-waiting-description" : undefined}
				aria-expanded={pageBar ? open : undefined}
				aria-current={current ? "page" : undefined}
				data-current={current || undefined}
				title={waiting > 0 ? (waiting === 1 ? "Your turn in 1 session" : `Your turn in ${waiting} sessions`) : undefined}
				aria-hidden={open && !current}
				tabIndex={open && !current ? -1 : 0}
				onClick={toggle}
				className={cn("lh-nav-chip sidebar-motion relative duration-200", open && !current ? "pointer-events-none opacity-0" : "opacity-100")}
			>
				{/* Owner, round 6: size-4, SAME as the close glyph — the toggle
				    must not grow when the sidebar is closed (it did: size-5 here).
				    The small look is the standard, both directions. */}
				<PanelLeftOpenIcon className="size-4" />
				{/* Labelled (owner O4): the list of sessions, not a bare icon. */}
				<span className="lh-nav-chip-label">Sessions</span>
				{/* Sessions waiting for an answer stay visible while the list is closed. */}
				{waiting > 0 && <span className="lh-waiting-badge" aria-hidden="true" data-testid="sessions-waiting-badge">{waiting}</span>}
				{waiting > 0 && <span id="lh-waiting-description" className="sr-only">{waiting === 1 ? "Your turn in 1 session (the count shows only sessions waiting for your answer)" : `Your turn in ${waiting} sessions (the count shows only sessions waiting for your answer)`}</span>}
			</Button>
			</Hint>
		</span>
	);
}

/**
 * The row's status indicator (owner, minimal-color round): the braille
 * spinner, ONLY while a teach turn is in flight — monochrome motion, the
 * terminal's own glyph, existing exactly as long as the work does and
 * vanishing the moment it ends. Every other state renders NOTHING:
 * phases only advance (all sessions end in Teaching — phase-as-signal was
 * decoration, now retired app-wide), and question-pending is the dominant
 * RESTING state of real sessions — a resting state has no scan value, so
 * the meta line's "Waiting for input" text carries it. Idle is the
 * absence of a signal, by design.
 */
function SessionStatus({ busy }: { busy: boolean }) {
	if (!busy) return null;
	return <BrailleSpinner />;
}

/** Compact "how long ago": "just now", "5m ago", "3h ago", "2d ago",
 *  then a plain date. How long a session has been WAITING matters more
 *  than an absolute timestamp. Beyond a week the date renders ISO
 *  (YYYY-MM-DD, zero-padded) — the international standard: unambiguous
 *  in any locale and it sorts (owner, typography round 5; the old
 *  M/D/YYYY was the US convention. A user-locale setting can come later
 *  — trivial, a format function swap). Pure — exported for tests. */
export function timeAgo(iso: string, now = new Date()): string {
	const ms = now.getTime() - new Date(iso).getTime();
	if (ms < 60_000) return "just now";
	const min = Math.floor(ms / 60_000);
	if (min < 60) return `${min}m ago`;
	const h = Math.floor(min / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const date = new Date(iso);
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${mm}-${dd}`;
}

/** The row's second line: the state when a state exists (waiting/working),
 *  otherwise just how long ago. The message count is DROPPED (owner,
 *  typography round 5): it informed no decision — clutter. messageCount
 *  still rides the API payload, so this is a one-line flip back if it's
 *  ever wanted. */
function sessionMeta(chat: ChatListItem): string {
	if (chat.compacting) return `Compacting context · ${timeAgo(chat.updatedAt)}`;
	// Round 14 (P12): one wording wherever the tutor waits for the learner —
	// a question or a problem alike is "Your turn" (as on Home's cards).
	if (chat.pendingQuestion || ((chat.kind ?? "teach") === "practice" && chat.pendingProblem)) return `Your turn · ${timeAgo(chat.updatedAt)}`;
	if (chat.busy) return "Working…";
	return timeAgo(chat.updatedAt);
}

/**
 * One session row: the status spinner (only while working), then title +
 * state-aware meta. Exported for render tests — pure function of the
 * list item.
 */
export function SessionRow({
	chat,
	active,
	onOpen,
	kbdSelected = false,
	onContextMenu,
}: {
	chat: ChatListItem;
	active: boolean;
	onOpen: () => void;
	/** Keyboard-cycle highlight (shortcut wave A: Alt+↑/↓ + Alt+Enter) —
	 *  visually distinct from the active session, which stays filled. */
	kbdSelected?: boolean;
	/** Right-click opens the context menu (wave 6: Rename / Delete). */
	onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
	const kind = chat.kind === "practice" ? (chat.practiceMode === "drill" ? "drill" : "practice") : "teach";
	const state = chat.busy || chat.compacting ? "working" : chat.pendingQuestion || (kind !== "teach" && chat.pendingProblem) ? "waiting" : "idle";
	// P15 (round 14): a helper's result not yet seen — its own mark, not
	// "your turn", and never part of the Sessions badge.
	const fresh = hasNewResult(chat, useSessionSeen()) && !active;
	return (
		<button
			type="button"
			onClick={onOpen}
			onContextMenu={onContextMenu}
			aria-current={active ? "page" : undefined}
			data-testid={kbdSelected ? "session-row-kbd" : "session-row"}
			data-kind={kind}
			data-state={state}
			className={cn(
				"lh-session-row relative mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60",
				active && "bg-accent",
				kbdSelected && !active && "bg-accent/60 ring-1 ring-border",
			)}
		>
			{/* Kind tile: what sort of session this is, at a glance (teaching /
			    practice / drill each keep one quiet hue). While a turn runs the
			    tile carries the spinner instead — motion means work. */}
			<span className="lh-kind-tile" data-kind={kind} {...(kind === "practice" ? { role: "img", "aria-label": "Practice session" } : {})}>
				{chat.busy || chat.compacting ? (
					<SessionStatus busy />
				) : kind === "drill" ? (
					<TargetIcon aria-hidden />
				) : kind === "practice" ? (
					<DumbbellIcon aria-hidden />
				) : (
					<BookOpenIcon aria-hidden />
				)}
			</span>
			<span className="min-w-0 flex-1">
				<span className="lh-session-name block truncate">{chat.title}</span>
				<span className="lh-session-meta block truncate">
					{fresh && <span className="lh-new-result" data-testid="session-new-result">New result</span>}
					{sessionMeta(chat)}
					{kind === "drill" && <span className="sr-only">Drill</span>}
				</span>
			</span>
		</button>
	);
}

/** The inline-rename row (wave 6): same geometry as SessionRow, but the
 *  title line becomes a text input — select-all on entry (the click means
 *  "replace", the header rename's rule), Enter/blur commits, Esc discards.
 *  The meta line stays so the row never changes height mid-edit. */
export function RenameRow({ chat, onCommit, onCancel }: { chat: ChatListItem; onCommit: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		const el = inputRef.current;
		if (el) {
			el.focus();
			el.select();
		}
	}, []);
	return (
		<div
			data-testid="session-rename-row"
			className="relative mb-0.5 flex w-full items-center rounded-lg bg-accent px-3 py-2"
		>
			{/* NOTHING MOVES (owner, polish round): an idle row renders no
			    status spacer (SessionStatus is null when not busy), so the
			    title starts at the row's own px-3 — 12px in. The old rename
			    row always carried a 14px spacer + gap + the input's border
			    and padding, landing the text ~41px in (and the meta with
			    it). The input here is borderless and padding-free at the
			    exact title x; the underline is the only editing cue. */}
			<span className="flex min-w-0 w-full flex-col">
				<input
					ref={inputRef}
					value={draft}
					spellCheck={false}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => onCommit(draft)}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
						if (e.key === "Escape") {
							e.stopPropagation(); // discard, not also the sidebar/chat chains
							onCancel();
						}
					}}
					aria-label="Rename session"
					data-testid="session-rename-input"
					className="lh-input w-full min-w-0 truncate border-0 border-b border-border bg-transparent px-0 text-foreground outline-none"
				/>
				<span className="block truncate text-xs text-muted-foreground">{sessionMeta(chat)}</span>
			</span>
		</div>
	);
}

/** The three-way kind filter (practice sessions, owner 2026-10-04):
 *  Teaching / All / Practice — a client-side filter over the same
 *  snapshot, persisted in localStorage, defaulting to All. */
export type SessionKindFilter = "teach" | "all" | "practice";
const KIND_FILTER_KEY = "lh:session-kind-filter";

function SessionsSidebar() {
	const { open, phone, drawer, toggle, closePhone } = useSidebar();
	const sidebarRef = useRef<HTMLElement>(null);
	// P4 (round 17, phones): the list as a page — under the page's own bar
	// (the bar stays, Sessions shown current) or with its own header and Back.
	const sessionsPage = useTryout("sessionsPage");
	useEffect(() => {
		if (!phone || !open || sessionsPage !== "toolbar") return;
		// The page starts under the bar's first row (where Sessions is).
		const shell = sidebarRef.current?.closest<HTMLElement>(".lh-app-shell");
		const place = () => {
			const chip = [...document.querySelectorAll<HTMLElement>('[data-testid="open-sidebar"]')].find((el) => el.getClientRects().length);
			if (chip && shell) shell.style.setProperty("--lh-sessions-page-top", `${Math.round(chip.getBoundingClientRect().bottom + 8)}px`);
		};
		place();
		window.visualViewport?.addEventListener("resize", place);
		return () => { window.visualViewport?.removeEventListener("resize", place); shell?.style.removeProperty("--lh-sessions-page-top"); };
	}, [phone, open, sessionsPage]);
	useEffect(() => {
		if (!phone || !open) return;
		const sidebar = sidebarRef.current!;
		(sidebar.querySelector<HTMLButtonElement>(sessionsPage === "header" ? '[data-testid="sessions-back"]' : '[data-testid="new-session"]')
			?? sidebar.querySelector<HTMLButtonElement>('button[aria-label="Close sidebar"]'))?.focus({ preventScroll: true });
		return () => {
			requestAnimationFrame(() => {
				const opener = document.querySelector<HTMLButtonElement>('button[data-testid="open-sidebar"]');
				if ((document.activeElement === document.body || sidebar.contains(document.activeElement)) && opener?.getAttribute("aria-hidden") === "false") {
					opener.focus({ preventScroll: true });
				}
			});
		};
	}, [phone, open, sessionsPage]);
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const [ctxChatId, setCtxChatId] = useState<string | null>(null);
	// Round 15 (A4): no special freezing. The list is ordered by the
	// learner's own activity (activityAt: sent, answered, retried), so a
	// background event — a helper finishing, say — never moves a row; it only
	// adds the "New result" mark.
	const yourTurn = (chats ?? []).filter((c) => c.pendingQuestion || ((c.kind ?? "teach") === "practice" && c.pendingProblem)).length;
	useEffect(() => {
		publishWaitingCount(yourTurn);
	}, [yourTurn]);
	const [query, setQuery] = useState("");
	// Phone search is its own mode (round 11): the search bar pins to the
	// top, the filter sits under it and the results get the whole sheet;
	// the create row, background agents and Settings step aside. Entered by
	// focusing the search; left by Cancel, Escape, opening a session or
	// closing the sheet — never by blur, so tapping a result can't shift
	// the layout under the finger.
	const [searchMode, setSearchMode] = useState(false);
	useEffect(() => { if (!open || !phone) setSearchMode(false); }, [open, phone]);
	const [kindFilter, setKindFilter] = useState<SessionKindFilter>("all");
	useEffect(() => {
		const stored = window.localStorage.getItem(KIND_FILTER_KEY);
		if (stored === "teach" || stored === "all" || stored === "practice") setKindFilter(stored);
	}, []);
	const setFilter = useCallback((f: SessionKindFilter) => {
		setKindFilter(f);
		window.localStorage.setItem(KIND_FILTER_KEY, f);
	}, []);
	const pathname = usePathname();
	const router = useRouter();
	useEffect(() => {
		if (phone && sidebarRef.current) return bindSidebarSwipe(sidebarRef.current, toggle);
	}, [phone, pathname, toggle]);
	const { open: openSettings } = useSettingsDialog();

	/* New session (owner, 2026-09-13): NO POST — the button opens the
	   sessionless draft view; the session is created only when the first
	   message is sent (and that message becomes its title). Search: a
	   client-side filter over the poll snapshot — no server round trip. */
	const newSession = useCallback((mode: "teach" | "practice" | "drill" = "teach") => {
		closePhone();
		// One place starts sessions (owner O4): Home, with this mode chosen.
		router.push(`/?mode=${mode}`);
	}, [router, closePhone]);

	/* FUZZY (owner round 8, 2026-10-05): subsequence match ranked by
	 * fuzzyScore — prefix beats word-boundary beats scattered. Empty query
	 * keeps the natural list order (scores are all 0, sort is stable). */
	const shown = useMemo(() => {
		const q = query.trim();
		let list = chats;
		if (list && kindFilter !== "all") {
			list = list.filter((c) => (c.kind ?? "teach") === kindFilter);
		}
		if (!list) return list;
		if (!q) return list;
		return list
			.map((c) => ({ c, score: fuzzyScore(q, c.title) }))
			.filter((r): r is { c: (typeof list)[number]; score: number } => r.score !== null)
			.sort((a, b) => b.score - a.score)
			.map((r) => r.c);
	}, [chats, query, kindFilter]);

	// R4 (round 16): the session on screen is never hidden by the list's
	// filter or search. When it would be — a new session under a Practice
	// filter, say — the list shows All (or drops the search), the row is
	// highlighted, and one line says why. Checked when the session changes
	// or first appears, never when the learner picks a filter on purpose.
	const currentId = pathname.startsWith("/chat/") ? decodeURIComponent(pathname.slice(6)) : null;
	const [revealNote, setRevealNote] = useState<string | null>(null);
	const revealedFor = useRef<string | null>(null);
	useEffect(() => {
		if (!currentId || !chats) return;
		const current = chats.find((c) => c.id === currentId);
		if (!current || revealedFor.current === currentId) return;
		revealedFor.current = currentId;
		const hiddenByFilter = kindFilter !== "all" && (current.kind ?? "teach") !== kindFilter;
		const hiddenBySearch = query.trim() !== "" && fuzzyScore(query.trim(), current.title) === null;
		if (!hiddenByFilter && !hiddenBySearch) { setRevealNote(null); return; }
		if (hiddenByFilter) setFilter("all");
		if (hiddenBySearch) { setQuery(""); setKbdIndex(null); }
		setRevealNote(hiddenByFilter
			? `Showing all sessions, so “${current.title || "this session"}” is in the list.`
			: `Search cleared, so “${current.title || "this session"}” is in the list.`);
		requestAnimationFrame(() => listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" }));
	}, [currentId, chats, kindFilter, query, setFilter]);
	useEffect(() => { if (!revealNote) return; const timer = window.setTimeout(() => setRevealNote(null), 9000); return () => window.clearTimeout(timer); }, [revealNote]);

	const refreshInFlightRef = useRef(false);
	const refresh = useCallback(async () => {
		// In-flight coalesce (S6): event bursts may land several refresh
		// calls at once — one fetch serves them all; anything newer arrives
		// with the next event's fetch.
		if (refreshInFlightRef.current) return;
		refreshInFlightRef.current = true;
		try {
			const res = await fetch("/api/chats", { cache: "no-store" });
			const d = (await res.json()) as { chats: ChatListItem[] };
			setChats(d.chats);
		} catch {
			// a transient failure keeps the last snapshot
			setChats((prev) => prev ?? []);
		} finally {
			refreshInFlightRef.current = false;
		}
	}, []);

	/* Instant rename propagation (2026-09-17): the chat header's rename
	   commits dispatch lh:chat-renamed; patch the snapshot in place instead
	   of waiting for the 2.5s poll. */
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev));
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, []);

	/* INSTANT TURN-STATE (owner, sidebar round 2026-10-02): the open
	   session broadcasts lh:turn-state the instant its turn starts
	   (submitted — the optimistic machine's own flip) and at settle —
	   busy mirrors the server's own definition (isTurnRunning), so the
	   patch is exact: spinner up the moment the action happens, cleared
	   and refetched once at settle (title/order move with turns). The
	   events channel is the backstop for everything only the server
	   knows: other windows, wake turns in unopened sessions. A start on
	   a chat not yet in the snapshot (a brand-new session) = one
	   immediate refresh instead of a patch. */
	const chatsRef = useRef(chats);
	chatsRef.current = chats;
	useEffect(() => {
		const onTurnState = (e: Event) => {
			const { id, running } = (e as CustomEvent<{ id: string; running: boolean }>).detail;
			if (running) {
				if (chatsRef.current?.some((c) => c.id === id)) {
					setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: true } : c)) : prev));
				} else {
					void refresh(); // the brand-new session: it isn't in the snapshot yet
				}
				return;
			}
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: false } : c)) : prev));
			void refresh(); // settle: the server snapshot is now truthful — land it now
		};
		window.addEventListener("lh:turn-state", onTurnState);
		return () => window.removeEventListener("lh:turn-state", onTurnState);
	}, [refresh]);

	/* PUSH (architecture S6, 2026-10-02): the 2.5s poll is RETIRED — the
	   last standing network poll in the app. List truth arrives as
	   events: chats-changed (create/rename/delete — the list-SHAPE
	   writes), and turn-started/turn-settled for EVERY chat (unfiltered:
	   any chat's turn flips busy/order/phase in this list). Announced
	   fetches ride the 250ms trailing debounce (the S4/S5 law); resync
	   (reconnect / dev-restart) is immediate. lh:turn-state +
	   lh:chat-renamed stay for same-tab INSTANTS — local beats any
	   round-trip. */
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const eventDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const scheduleEventRefresh = () => {
		if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		eventDebounceRef.current = setTimeout(() => {
			eventDebounceRef.current = undefined;
			void refreshRef.current();
		}, 250);
	};
	useServerEvent("chats-changed", scheduleEventRefresh);
	useServerEvent("turn-started", scheduleEventRefresh);
	useServerEvent("turn-settled", scheduleEventRefresh);
	useServerEvent("compaction-changed", scheduleEventRefresh);
	useServerResync(() => void refreshRef.current());
	useEffect(
		() => () => {
			if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		},
		[],
	);

	/* ── Keyboard seams (shortcut wave A, 2026-09-17; search-walk round
	   2026-10-10) ── ⌘⇧F focuses the search field — and THE SEARCH OWNS THE
	   WALK: ↑/↓ cycle the filtered list (wrap — "cycle"), Enter opens the
	   walked row, or the FIRST match when nothing is walked (owner,
	   2026-10-10 — the quick-open pattern: ⌘⇧F, type, Enter, done). The
	   Alt+↑/↓/↵ global cycle was RETIRED the same round: barely used,
	   felt laggy. The selection is a row index into `shown`, so the walk
	   follows whatever the query + kind filter leave. Mouse and keyboard
	   coexist: hovering doesn't claim, a click or an open clears the
	   selection. */
	const [kbdIndex, setKbdIndex] = useState<number | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	/* ── Wave 6 chunk A: context menu + inline rename + deletion ──
	   Right-click a session row → MenuShell: the two management actions
	   first (owner ruling), then — below a hairline — the extraction
	   coverage block (owner-locked redesign 2026-09-24, order refined
	   2026-09-24: Rename/Delete on top, the numbers + manual Extract
	   affordance at the bottom). The anchor is the row that was
	   right-clicked — assigned into a ref before the state flip so the
	   shell measures it on its first (hidden) pass. */
	const ctxAnchorRef = useRef<HTMLElement | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

	const openContext = (e: React.MouseEvent<HTMLButtonElement>, chat: ChatListItem) => {
		e.preventDefault(); // suppress the native menu
		ctxAnchorRef.current = e.currentTarget;
		setCtxChatId(chat.id);
	};

	// The menu contract (agent-section's): any pointerdown outside the menu
	// or its row closes it; Esc is CLAIMED so it never also aborts a turn
	// or folds the sidebar. Right-clicking another row re-anchors: its
	// pointerdown closes this menu, its contextmenu opens the next.
	useEffect(() => {
		if (ctxChatId === null) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (ctxAnchorRef.current?.contains(target)) return;
			setCtxChatId(null);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setCtxChatId(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [ctxChatId]);

	// Inline rename (owner ruling, wave 6): the row swaps to a text input;
	// commit rides the SAME plumbing as the header rename — PUT the title,
	// then lh:chat-renamed patches every listener (this sidebar's own
	// listener patches the snapshot instantly; an open chat header hears
	// it too). Esc discards; empty commit discards (the header's rules).
	const commitRename = useCallback(async (id: string, next: string) => {
		setRenamingId(null);
		const t = next.trim();
		if (t === "") return;
		try {
			const res = await fetch(`/api/chats/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: t }),
			});
			if (!res.ok) throw new Error(`rename failed: ${res.status}`);
			window.dispatchEvent(new CustomEvent("lh:chat-renamed", { detail: { id, title: t } }));
		} catch (err) {
			console.error("rename failed:", err); // keep the old title
		}
	}, []);

	// Delete success: patch the list instantly (the poll is the backstop),
	// navigate home if the open session died (the chat view unmounts —
	// drafts die with it, no orphan bubbles), and announce the graph
	// revision so the graph view refetches (deletion is the one writer
	// the status poll can't see — no run ever transitions some→none).
	// A short confirmation after a delete ("Deleted “…”"), then it fades.
	const [deletedNotice, setDeletedNotice] = useState<string | null>(null);
	useEffect(() => {
		if (!deletedNotice) return;
		const timer = window.setTimeout(() => setDeletedNotice(null), 4000);
		return () => window.clearTimeout(timer);
	}, [deletedNotice]);
	const onDeleted = useCallback(
		(id: string, _mode: ChatDeleteMode, graphRevision: number) => {
			forgetHandwritingOnDevice(id);
			const title = chatsRef.current?.find((c) => c.id === id)?.title;
			setDeletedNotice(title ? `Deleted “${title}”` : "Session deleted");
			setDeleting(null);
			setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
			if (pathname === `/chat/${id}`) router.push("/");
			window.dispatchEvent(new CustomEvent("lh:graph-revision", { detail: { revision: graphRevision } }));
		},
		[pathname, router],
	);

	useEffect(() => {
		const onFocusSearch = (event: Event) => {
			// E5 (round 16): "Search sessions instead" carries its words along.
			const carried = (event as CustomEvent<{ query?: string }>).detail?.query;
			if (typeof carried === "string") { setQuery(carried); setKbdIndex(null); if (phone) setSearchMode(true); }
			if (!open) toggle();
			// A clipped (overflow-hidden) input still focuses — the sidebar's
			// slide-in doesn't gate the keystroke.
			requestAnimationFrame(() => searchRef.current?.focus());
		};
		window.addEventListener("lh:kbd-sessions-search", onFocusSearch);
		return () => window.removeEventListener("lh:kbd-sessions-search", onFocusSearch);
	}, [open, toggle, phone]);

	// Keep the kbd-selected row in view (the rows are the container's only
	// buttons, so the index matches).
	useEffect(() => {
		if (kbdIndex === null) return;
		listRef.current?.querySelectorAll("button")[kbdIndex]?.scrollIntoView({ block: "nearest" });
	}, [kbdIndex]);

	useEffect(() => {
		if (!open) return;
		void refresh();
		// Opening + navigation refetch; while open, the events channel owns
		// freshness (S6) — no interval, nothing standing.
	}, [open, pathname, refresh]);
	// One load even while closed: the closed-list button shows how many
	// sessions wait for an answer (the events channel keeps it current).
	useEffect(() => { void refresh(); }, [refresh]);

	return (
		<aside
			ref={sidebarRef}
			className={cn("lh-sessions-panel sidebar-motion shrink-0 overflow-hidden duration-200", open ? "w-72" : "w-0")}
			aria-hidden={!open}
			inert={!open}
			data-sessions-page={phone ? sessionsPage : undefined}
			role={phone && open ? "dialog" : undefined}
			aria-modal={phone && open && sessionsPage === "header" ? true : undefined}
			aria-label="Sessions"
			onKeyDown={(event) => {
				if (drawer && open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); toggle(); return; }
				if (!phone || !open || !sidebarRef.current?.contains(event.target as Node)) return;
				if (event.key === "Escape") {
					event.preventDefault(); event.stopPropagation(); closePhone();
				} else if (event.key === "Tab") {
					const controls = [...sidebarRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]')].filter(e => e.tabIndex >= 0 && e.getClientRects().length > 0);
					const first = controls[0], last = controls.at(-1);
					if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
					if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
				}
			}}
		>
			<div className="lh-sessions-content flex h-full w-72 flex-col border-r" data-searching={searchMode || undefined}>
				{/* B18 (round 18): Prototype view's switch for the phone's Sessions page. */}
				{/* B18: the header's empty end (with Back); the page's foot when the
				    list is short; else the end of the Your turn note (text only). */}
				{phone && open && <PrototypeSwitch tryout="sessions-page" anchors={[
					{ selector: '.lh-sessions-panel[aria-hidden="false"] .lh-sessions-header', places: ["inside-end"] },
					{ selector: '.lh-sessions-panel[aria-hidden="false"]', places: ["inside-bottom-end"] },
					{ selector: '.lh-sessions-panel[aria-hidden="false"] [data-testid="your-turn-hint"]', places: ["inside-center-end"], text: true },
				]} />}
				{/* LH wordmark — the owner's header; close toggle sits at the edge.
				    Merged chrome (2026-09-17): in Electron this band is the
				    window's drag surface and starts after the traffic lights
				    (.lh-lights-gutter); in the browser those classes are inert. */}
				<div className="lh-sessions-header lh-drag lh-lights-gutter flex items-center gap-2 px-3">
					{/* The owner's mark (2026-09-17) replaces the "LH" text — still the
					    home link, still vertically centered by the band's items-center.
					    The 92px .lh-lights-gutter keeps it clear of the traffic lights
					    with the lights' own edge-inset as the gap. */}
					{/* Hover mirrors the ghost toggle buttons (owner ask, 2026-09-17):
					    same size-9 chip geometry, same hover:bg-accent treatment. */}
					<Hint
						// Kept (owner, subtlety round 2026-09-25) but to the RIGHT
						// of the logo, carrying its real shortcut: ⌘G jumps to
						// the graph view (keyboard-shortcuts routes it to "/",
						// the same destination as this logo).
						label="Home"
						action="jump-graph"
						side="right"
						disabled={phone}
					>
						<Link
							href="/"
							onClick={closePhone}
							aria-label="Home"
							className="lh-no-drag flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
						>
							<LhMark className="size-6" />
							<span className="lh-phone-home-label hidden">Home</span>
						</Link>
					</Hint>
					{/* T9 (round 17): no app name here — it belongs on Home. */}
					{/* P4 (phones, page with Back): Back where Sessions was. */}
					<button type="button" className="lh-sessions-back hidden" data-testid="sessions-back" onClick={closePhone}>
						<ChevronLeftIcon aria-hidden />Back
					</button>
					<h2 className="lh-sessions-title hidden">Sessions</h2>
					<Hint label="Close sidebar" action="toggle-sidebar" disabled={phone}>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Close sidebar"
							onClick={toggle}
							className="lh-sessions-close lh-no-drag"
						>
							<PanelLeftCloseIcon className="lh-desktop-close-icon size-4" />
							<XIcon className="lh-phone-close-icon hidden" aria-hidden />
						</Button>
					</Hint>
				</div>

				{/* Two doors, STACKED (owner round 8, 2026-10-05 — was a
				    half/half row): full-width rows read cleaner and give the
				    labels room; teaching keeps the original draft route,
				    practice carries its mode. */}
				{/* Round 14 (owner P3): no heading — the "+" says these start
				    something new (on Home, in that mode); the list follows. */}
				<div className="lh-sessions-create" role="group" aria-label="Start a new session">
					<button
						type="button"
						data-testid="new-session"
						data-kind="teach"
						onClick={() => newSession("teach")}
					>
						<PlusIcon aria-hidden />
						Teach
						<span className="sr-only">: start a new teaching session</span>
					</button>
					<button
						type="button"
						data-testid="new-session-practice"
						data-kind="practice"
						onClick={() => newSession("practice")}
					>
						<PlusIcon aria-hidden />
						Practice
						<span className="sr-only">: start a new practice session</span>
					</button>
					<button
						type="button"
						data-testid="new-session-drill"
						data-kind="drill"
						onClick={() => newSession("drill")}
					>
						<PlusIcon aria-hidden />
						Drill
						<span className="sr-only">: start a new drill</span>
					</button>
				</div>

				<div className="lh-sessions-create-label lh-sessions-list-label">Sessions</div>
				<div className="lh-sessions-search">
					<Hint label="Search sessions" action="sessions-search" side="bottom" disabled={phone}>
					<span className="relative flex-1">
						<Input
							ref={searchRef}
							data-testid="session-search"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								// The list reorders under the query every keystroke —
								// a stale walk index would point at the wrong row.
								setKbdIndex(null);
							}}
							// THE SEARCH OWNS THE WALK (owner, 2026-10-10 — the
							// retired Alt+↑/↓/↵ cycle's successor): ↑/↓ cycle the
							// filtered rows (wrap), Enter opens the walked row —
							// or the FIRST match when nothing is walked (the
							// quick-open pattern) — then blurs (focus returns to
							// the app per the Enter law; the query stays for
							// re-searching). Esc leaves the search (owner,
							// keyboard wave): blur back to normal, and claim the
							// key so the window Esc chain (dictation / abort)
							// doesn't also fire.
							onFocus={() => { if (phone) setSearchMode(true); }}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									e.stopPropagation();
									e.currentTarget.blur();
									setSearchMode(false);
									return;
								}
								// Modified keys belong to the surface (⇧↵ etc.).
								if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
								const n = shown?.length ?? 0;
								if (n === 0) return;
								if (e.key === "ArrowDown" || e.key === "ArrowUp") {
									// The rows move, not the caret.
									e.preventDefault();
									const dir = e.key === "ArrowDown" ? 1 : -1;
									setKbdIndex((i) =>
										i === null || i >= n ? (dir === 1 ? 0 : n - 1) : (i + dir + n) % n,
										);
									return;
								}
								if (e.key === "Enter") {
									const target = shown![kbdIndex !== null && kbdIndex < n ? kbdIndex : 0];
									if (!target) return;
									e.preventDefault();
									closePhone();
									setSearchMode(false);
									router.push(`/chat/${target.id}`);
									setKbdIndex(null);
									e.currentTarget.blur();
								}
							}}
							placeholder="Search sessions"
							aria-label="Search sessions"
							className="lh-sessions-search-input"
						/>
						<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					</span>
					</Hint>
					{searchMode && (
						<button
							type="button"
							className="lh-sessions-search-cancel"
							data-testid="session-search-cancel"
							onClick={() => { setQuery(""); setKbdIndex(null); setSearchMode(false); }}
						>
							Cancel
						</button>
					)}
				</div>

				{/* The three-way filter, HEADING THE LIST (owner round 8b,
				    2026-10-05 — moved below the search): it scopes what the
				    list shows, so it sits directly above it as a caption row;
				    search stays the top muscle-memory target. Order: Teaching /
				    Practice / All — the real modes first, "All" as the escape
				    hatch on the right, mirroring the create-buttons above.
				    Persisted client-side. */}
				{/* Filtering the list, captioned so it never reads as creating
				    (owner O4): "Show" here, "New session" above. */}
				<div className="lh-sessions-filter-row">
				<span className="lh-sessions-filter-caption" aria-hidden="true">Show</span>
				<div className="lh-segmented lh-sessions-filter" role="group" aria-label="Show sessions" data-testid="session-kind-filter">
					{(["teach", "practice", "all"] as const).map((f) => (
						<button
							key={f}
							type="button"
							data-testid={`kind-filter-${f}`}
							onClick={() => setFilter(f)}
							aria-pressed={kindFilter === f}
							data-active={kindFilter === f}
						>
							{f === "teach" ? "Teaching" : f === "all" ? "All" : "Practice"}
						</button>
					))}
				</div>
				</div>

				{deletedNotice && <p role="status" data-testid="session-deleted-notice" className="lh-deleted-notice">{deletedNotice}</p>}
				{/* Round 15 (A3): the badge on Sessions, explained where the
				    sessions are — it counts only those waiting for an answer. */}
				{yourTurn > 0 && <p className="lh-your-turn-hint" data-testid="your-turn-hint">
					<span className="lh-your-turn-dot" aria-hidden />
					{yourTurn === 1 ? "Your turn in 1 session" : `Your turn in ${yourTurn} sessions`}
					<span className="lh-your-turn-note">The number on Sessions counts only these.</span>
				</p>}
				{revealNote && <p className="lh-list-reveal" role="status" data-testid="session-reveal-note">{revealNote}</p>}
				<div ref={listRef} data-testid="session-list" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1">
					{shown === null ? (
						<div className="px-2 py-4 text-sm text-muted-foreground">Loading…</div>
					) : shown.length === 0 ? (
						<div className="px-2 py-4 text-sm text-muted-foreground">
							{query.trim() ? "No sessions match." : "No sessions yet."}
						</div>
					) : (
						shown.map((c, i) =>
							renamingId === c.id ? (
								<RenameRow
									key={c.id}
									chat={c}
									onCommit={(next) => void commitRename(c.id, next)}
									onCancel={() => setRenamingId(null)}
								/>
							) : (
								<div key={c.id} className="lh-session-item" data-menu-open={ctxChatId === c.id || undefined}>
									<SessionRow
										chat={c}
										active={pathname === `/chat/${c.id}`}
										kbdSelected={i === kbdIndex}
										onOpen={() => {
											setKbdIndex(null);
											setSearchMode(false);
											closePhone();
											router.push(`/chat/${c.id}`);
										}}
										onContextMenu={(e) => openContext(e, c)}
									/>
									<button
										type="button"
										className="lh-session-more"
										data-testid="session-more"
										aria-label={`Actions for ${c.title}`}
										aria-haspopup="menu"
										aria-expanded={ctxChatId === c.id}
										onClick={(e) => {
											if (ctxChatId === c.id) setCtxChatId(null);
											else openContext(e, c);
										}}
									>
										<MoreHorizontalIcon aria-hidden />
									</button>
								</div>
							),
						)
					)}
				</div>

					{/* Background agents (owner, sidebar round): the section is
					    ALWAYS here — empty means empty (the header sits alone); it
					    populates and grows when processes run. Settings shares its
					    row (round 11): both are secondary, so the sessions get the
					    room. Settings is also mod+, in the keyboard registry. */}
					<ActivitySection
						trailing={
							<Hint label="Settings" action="open-settings" side="right" disabled={phone}>
								<button
									type="button"
									onClick={() => openSettings()}
									data-testid="settings-entry"
									className="lh-footer-row lh-settings-entry"
								>
									<SettingsIcon className="size-4" />
									{/* Labelled (owner O4): no icon-only navigation. */}
									<span>Settings</span>
								</button>
							</Hint>
						}
					/>

					{process.env.NODE_ENV === "development" && <div className="lh-sessions-footer">
						<details className="lh-sessions-tools mt-1 px-2 text-xs text-muted-foreground">
							<summary className="cursor-pointer py-1.5 uppercase tracking-wider">Tools</summary>
							<button type="button" onClick={() => location.reload()} className="flex items-center gap-1.5 rounded-md py-1.5 hover:text-foreground">
								<RotateCwIcon className="size-3" />
								Reload preview
							</button>
							<p className="pb-1 text-[11px]">Reload keeps saved conversations and uploads. Unsent text and prototype ink reset.</p>
						</details>
					</div>}
				</div>

				{/* The context menu (wave 6 + the extraction-UX redesign): the
				    coverage block above, then exactly two management actions
				    (owner ruling — no more). MenuShell owns placement/focus/arrow
				    cycling; the dismissal effect above owns the contract. */}
				{ctxChatId !== null && (
					<MenuShell
						anchorRef={ctxAnchorRef}
						testid="session-context-menu"
						preferredSide="down"
						menuClass="lh-menu flex w-60 flex-col gap-0.5 rounded-2xl border bg-popover p-1.5 text-sm shadow-xl"
					>
						{/* The two management actions first, then the extraction block
						    (owner refinement round, 2026-09-24): Rename/Delete stay at the
						    top, the coverage numbers + Extract affordance sit below the
						    hairline — the block is info + a stateful affordance, the
						    actions above it. Fetched on menu open (the block mounts WITH
						    the menu); 409 = benign. Renders nothing on a failed read. */}
						<button
							type="button"
							data-testid="ctx-rename"
							onClick={() => {
								setRenamingId(ctxChatId);
								setCtxChatId(null);
							}}
							className="lh-menu-item flex items-center rounded-lg px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
						>
							Rename
						</button>
						{/* Export as Markdown (owner, release polish 2026-10-06): the
					    session-markdown engine's user-facing debut — same-origin
						    anchor download; the route's Content-Disposition names the
						    file. Sits with the management actions, above Delete (the
						    destructive action stays last — the danger-fence law). */}
						<button
							type="button"
							data-testid="ctx-export-md"
							onClick={() => {
								const chatId = ctxChatId;
								setCtxChatId(null);
								const a = document.createElement("a");
								a.href = `/api/chats/${chatId}/markdown`;
								a.download = ""; // the route's filename wins
								document.body.appendChild(a);
								a.click();
								a.remove();
							}}
							className="lh-menu-item flex items-center rounded-lg px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
						>
							Export as Markdown…
						</button>
						<button
							type="button"
							data-testid="ctx-delete"
							onClick={() => {
								const target = chats?.find((c) => c.id === ctxChatId);
								if (target) setDeleting(target);
								setCtxChatId(null);
							}}
							className="lh-menu-item flex items-center rounded-lg px-3 py-2 text-left text-destructive transition-colors hover:bg-accent"
						>
							Delete…
						</button>
						<div className="my-0.5 border-t border-border/60" aria-hidden="true" />
						<CoverageMenuBlock chatId={ctxChatId} />
					</MenuShell>
				)}

				{/* The two-option delete dialog (wave 6) — portaled to body
				    by the component itself, lives here for state locality. */}
				<DeleteSessionDialog
					chat={deleting}
					onClose={() => setDeleting(null)}
					onDeleted={onDeleted}
				/>
			</aside>
	);
}

/** The app frame: sidebar inline + content. Rendered once in the root layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
	const { phone, open, drawer, toggle } = useSidebar();
	const pathname = usePathname();
	// R9 (round 16): focus mode folds a docked sessions sidebar away and
	// brings it back on exit, as it was.
	const focusMode = useFocusMode();
	const foldedForFocus = useRef(false);
	const focusState = useRef({ open, phone, drawer, toggle }); focusState.current = { open, phone, drawer, toggle };
	useEffect(() => {
		const now = focusState.current;
		if (focusMode) {
			if (now.open && !now.phone && !now.drawer) { foldedForFocus.current = true; now.toggle(); }
		} else if (foldedForFocus.current) {
			foldedForFocus.current = false;
			if (!now.open) now.toggle();
		}
	}, [focusMode]);
	// P4 (round 17, phones): the sessions page under the bar keeps the page's
	// bar live (Sessions closes it, Home goes home); everything else beneath
	// is inert while it is open. The page with its own header covers it all.
	// Hydrated: placeholders kept for content that arrives after hydration (the
	// mic slots) can step aside where nothing came.
	useEffect(() => { document.documentElement.dataset.hydrated = ""; }, []);
	const sessionsPage = useTryout("sessionsPage");
	const underBar = phone && open && sessionsPage === "toolbar";
	useEffect(() => {
		const main = document.querySelector<HTMLElement>('main[data-testid="file-path-drop-zone"]');
		if (!underBar || !main) return;
		// The bar holding the visible Sessions chip: a session's or Ideas' top
		// bar, or Home's navigation row.
		const chip = [...main.querySelectorAll<HTMLElement>('[data-testid="open-sidebar"]')].find((el) => el.getClientRects().length);
		const bar = chip?.closest<HTMLElement>(".lh-topbar, .lh-home-navigation") ?? null;
		if (!bar) { main.inert = true; return () => { main.inert = false; }; }
		const marked: HTMLElement[] = [];
		for (let node: HTMLElement | null = bar; node && node !== main; node = node.parentElement) {
			for (const sibling of node.parentElement?.children ?? []) {
				if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; marked.push(sibling); }
			}
		}
		// The bar's second row (a session's name) is under the page: inert too.
		for (const row of bar.querySelectorAll<HTMLElement>(":scope > .lh-title-block")) { if (!row.inert) { row.inert = true; marked.push(row); } }
		return () => { for (const el of marked) el.inert = false; };
	}, [underBar, pathname]);
	// Throwaway whole-shell comparison: its navigation is the subject of the trial.
	if (process.env.NODE_ENV !== "production" && pathname.startsWith("/prototype/mobile-ui")) return <>{children}</>;
	return (
		<SettingsDialogProvider>
			{/* R9 (round 16): the first stop for a keyboard — straight to the sessions. */}
			<div className="lh-skip-links">
				<a href="#sessions" data-testid="skip-to-sessions"
					onClick={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("lh:kbd-sessions-search")); }}
					onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent("lh:kbd-sessions-search")); }}>Skip to sessions</a>
			</div>
			<SessionsSidebar />
			<FilePathDropZone className="lh-app-main relative min-w-0 flex-1" inert={phone && open && sessionsPage === "header"}>{children}</FilePathDropZone>
			{drawer && open && <div className="lh-drawer-scrim" aria-hidden="true" data-testid="sessions-drawer-scrim" onClick={toggle} />}
			{/* The single document-level keydown listener (keyboard wave A) —
			    after the content in the tree, but it's window-level so order only
			    matters for the events it dispatches, never for DOM priority. */}
			<KeyboardShortcuts />
		</SettingsDialogProvider>
	);
}
