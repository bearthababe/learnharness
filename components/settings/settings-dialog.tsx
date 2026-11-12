"use client";
/**
 * THE SETTINGS DIALOG (settings-app wave, 2026-09-20): the thin settings
 * page graduated into the designed surface — a centered modal over
 * everything, left section nav + one scrolling content column.
 *
 * Owner decisions this wave:
 * - Dialog, not a page: opens over whatever screen you're on (the payoff:
 *   appearance edits restyle the chat LIVE behind the dialog). Escape,
 *   backdrop, and ✕ all close. Modal-only — /settings redirects, so
 *   nothing links into a dead surface.
 * - Left section nav in the app's mono chrome (text-only, session-list
 *   language — active = bg-accent), no icons, matching the minimal-color
 *   doctrine.
 * - The dialog is surface-agnostic by construction: the sections talk to
 *   /api/settings* and localStorage only, so this shell can be re-mounted
 *   as a true OS window in the Electron round with near-zero churn.
 *
 * The record + the single `write` seam moved here from the thin page:
 * one record instance for the whole dialog, sections write through it,
 * switching sections never refetches.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import {
	CURRENT_SETTINGS_VERSION,
	type AgentSettings,
	type AppearanceSettings,
	type CompactionSettings,
	type GraphSettings,
	type UserSettings,
} from "@/src/core";
import { useAppearance } from "./appearance.tsx";
import { SettingsSection } from "./controls.tsx";
import { UpdateSettings } from "./update-settings.tsx";
import { DeviceToolsSettings } from "./device-tools.tsx";
import { RuntimeSettings } from "./runtime-settings.tsx";
import { AboutSection } from "./about-section.tsx";
import { AgentSection } from "./agent-section.tsx";
import type { ModelsSettings } from "@/src/core";
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";
import { KeysSection } from "./keys-section.tsx";
import { Hint } from "@/components/ui/hint";
import { AppearanceSection, GraphSection } from "./appearance-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";
import { TryoutsSection } from "./tryouts-section.tsx";
import { ChatGPTUIProvider } from "./chatgpt-connection.tsx";
import { usePhoneLayout } from "@/components/use-phone-viewport";
import { useDeviceClass } from "@/components/device-features";
import { ActivityIcon, BrainIcon, ChevronLeftIcon, ChevronRightIcon, FlaskConicalIcon, InfoIcon, KeyRoundIcon, KeyboardIcon, PaletteIcon, SlidersHorizontalIcon } from "lucide-react";
import { NativeSubscriptionUIProvider } from "./subscription-connections.tsx";
import { useOneMenu } from "@/components/one-menu";
import { useDialogFocus } from "@/components/dialog-focus";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "keys", label: "Providers", blurb: "Model keys and subscriptions" },
	{ id: "agent", label: "Agent", blurb: "Models, tools and context" },
	{ id: "appearance", label: "Appearance", blurb: "Reading size, fonts and colours" },
	{ id: "graph", label: "Graph", blurb: "Knowledge graph and extraction" },
	{ id: "keyboard", label: "Keyboard", hint: "Stored on this device", blurb: "Shortcuts" },
	{ id: "general", label: "General", blurb: "Tools on this device, updates" },
	// Round 16: alternatives to compare, after the everyday settings.
	{ id: "tryouts", label: "Try-out designs", blurb: "Alternative designs to compare" },
	// Round 19 (L15, §0): the build and the 🐞 problem reports, last.
	{ id: "about", label: "About this app", blurb: "Build and problem reports" },
] as const;
// Phones only: tablets keep the two-pane list beside the section, so
// switching categories stays one tap.
const NARROW_SETTINGS = "(max-width: 767px)";
function subscribeNarrow(update: () => void) {
	const media = window.matchMedia?.(NARROW_SETTINGS);
	media?.addEventListener("change", update);
	return () => media?.removeEventListener("change", update);
}
function useNarrowSettings() {
	return useSyncExternalStore(subscribeNarrow, () => window.matchMedia?.(NARROW_SETTINGS).matches ?? false, () => false);
}

const SECTION_ICON = {
	keys: KeyRoundIcon,
	agent: BrainIcon,
	appearance: PaletteIcon,
	graph: ActivityIcon,
	keyboard: KeyboardIcon,
	general: SlidersHorizontalIcon,
	tryouts: FlaskConicalIcon,
	about: InfoIcon,
} as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** `open(section?, row?)` — the optional ROW deep-links into the Keys
 *  section with that row unfolded (zero-keys wave: the dictation error's
 *  click lands on the Deepgram row). `row` is the KEY ID (the env-var
 *  name, e.g. DEEPGRAM_API_KEY — KeysSection's openRow state), not the
 *  row's testid. */
const DialogContext = createContext<{ open: (section?: string, row?: string) => void }>({ open: () => {} });

/** AppShell-level mount: the sidebar row and the mod+, chord call this.
 *  `open(section)` lands the dialog on a specific section (the first-run
 *  setup flow deep-links to Keys when no provider key exists yet). */
export function SettingsDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [show, setShow] = useState(false);
	const [landOn, setLandOn] = useState<SectionId>("keys");
	const [landOnRow, setLandOnRow] = useState<string | null>(null);
	const [landExplicit, setLandExplicit] = useState(false);
	const open = useCallback((section?: string, row?: string) => {
		setLandOn(section ? section as SectionId : "keys");
		setLandOnRow(row ?? null);
		setLandExplicit(!!section);
		setShow(true);
	}, []);
	useEffect(() => window.lh?.onOpenSettings?.((section) => open(section)), [open]);
	useOneMenu("settings", show, () => setShow(false));
	return (
		<ChatGPTUIProvider><NativeSubscriptionUIProvider><DialogContext.Provider value={{ open }}>
			{children}
			{show && (
				<SettingsDialog onClose={() => setShow(false)} initialSection={landOn} initialRow={landOnRow} startWithList={!landExplicit} />
			)}
		</DialogContext.Provider></NativeSubscriptionUIProvider></ChatGPTUIProvider>
	);
}

export function useSettingsDialog() {
	return useContext(DialogContext);
}

function SettingsDialog({
	onClose,
	initialSection,
	initialRow,
	startWithList,
}: {
	onClose: () => void;
	initialSection: SectionId;
	/** The keys-section row to unfold (see DialogContext above). */
	initialRow: string | null;
	/** Phones open on the section list unless a caller asked for a section. */
	startWithList: boolean;
}) {
	const backdropDismiss = useBackdropDismiss(onClose);
	// Plain dim backdrop (no blur — nothing decorative); a genuine
	// backdrop click closes, the dialog body stops propagation.
	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
			data-testid="settings-backdrop"
			{...backdropDismiss}
		>
			<SettingsDialogBody onClose={onClose} initialSection={initialSection} initialRow={initialRow} startWithList={startWithList} />
		</div>,
		document.body,
	);
}

/** The dialog without the portal/backdrop — the SSR-testable frame
 *  (portals render nothing under renderToStaticMarkup). */
export function SettingsDialogBody({
	onClose,
	initialSection = "keys",
	initialRow = null,
	startWithList = false,
}: {
	onClose: () => void;
	/** Phones: show the section list first (drill-in navigation). */
	startWithList?: boolean;
	initialSection?: SectionId;
	/** The keys row to unfold on arrival (null = none). While-open
	 *  retargets follow it exactly like initialSection below. */
	initialRow?: string | null;
}) {
	const { onAppearanceChange } = useAppearance();
	const [record, setRecord] = useState<UserSettings | null | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | null>(null);
	const [fileAccessError, setFileAccessError] = useState<string | null>(null);
	// MenuShell open-count — drives the content column's scroll lock.
	const [openMenus, setOpenMenus] = useState(0);
	const contentRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: the scrollbar MAY stay,
	// scrolling must NOT happen, nothing may move): the content column
	// keeps overflow-y-auto — the scrollbar and every width stay exactly
	// as they are — and while any MenuShell is open, non-passive wheel +
	// touchmove listeners on the column preventDefault. React attaches
	// synthetic wheel/touch passively at the root, so this needs the
	// native-listener ref seam.
	useEffect(() => {
		const el = contentRef.current;
		if (!el || openMenus === 0) return;
		const block = (e: Event) => e.preventDefault();
		el.addEventListener("wheel", block, { passive: false });
		el.addEventListener("touchmove", block, { passive: false });
		return () => {
			el.removeEventListener("wheel", block);
			el.removeEventListener("touchmove", block);
		};
	}, [openMenus]);

	useEffect(() => {
		const onOpen = () => setOpenMenus((n) => n + 1);
		const onClose = () => setOpenMenus((n) => Math.max(0, n - 1));
		window.addEventListener(MENU_OPEN_EVENT, onOpen);
		window.addEventListener(MENU_CLOSE_EVENT, onClose);
		return () => {
			window.removeEventListener(MENU_OPEN_EVENT, onOpen);
			window.removeEventListener(MENU_CLOSE_EVENT, onClose);
		};
	}, []);
	const [active, setActive] = useState<SectionId>(initialSection);
	// A deep-link fired while the dialog is ALREADY open (first exercised by
	// the wave-6 embedding picker's "Add a provider key first…" link — the
	// picker itself died with wave 7, the mechanism is general) changes
	// initialSection under our feet — follow it, or the link silently does
	// nothing.
	useEffect(() => {
		setActive(initialSection);
	}, [initialSection]);
	// Below 840px wide settings is one column that drills into a section.
	const phoneLayout = usePhoneLayout();
	const narrowSettings = useNarrowSettings();
	const phone = phoneLayout || narrowSettings;
	// T10 (round 17): keyboard shortcuts are for computers; phones and tablets
	// (touch devices) do not list them.
	const deviceClass = useDeviceClass();
	const noShortcuts = phone || deviceClass === "phone" || deviceClass === "tablet";
	useEffect(() => { if (noShortcuts && active === "keyboard") setActive("general"); }, [noShortcuts, active]);
	const [listOpen, setListOpen] = useState(startWithList);
	const phoneList = phone && listOpen;
	const activeLabel = SECTIONS.find((x) => x.id === active)?.label ?? "Settings";

	// Fetch once per dialog mount. 200 {settings: null} is FIRST BOOT
	// (no record = factory everything), not a failure — the error state is
	// a non-200 or a network throw only.
	useEffect(() => {
		fetch("/api/settings")
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
			)
			.then((body: { settings: UserSettings | null; fileAccessError?: string }) => {
				setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION });
				setFileAccessError(body.fileAccessError ?? null);
			})
			.catch(() => setRecord(null));
	}, []);

	// Escape closes — the layered-dismiss convention (Esc is dead for the
	// sections' own editors while they hold focus; this listener is the
	// dialog's outer layer).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim
				// at the document level — the window chain (dictation →
				// abort) must not also act. One Esc, one action.
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	/** ONE writer for the whole dialog: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline (a 400 is a
	 *  schema mistake caught by the validation surface). */
	const write = useCallback(
		async (
			section: "general" | "agent" | "models" | "appearance" | "graph" | "compaction",
			body: object,
		) => {
			setError(null);
			const res = await fetch(`/api/settings/${section}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const detail = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setError(`${section}: ${detail.error ?? res.status}`);
				return;
			}
			// Server truth, never the request body (fix wave, owner repro):
			// the models section clamps pinned thinking levels on write
			// (bd68486) — a swap that rides an unsupported level lands
			// CLAMPED in the record, and the writing surface must show the
			// stored value in this same interaction, not the optimistic one.
			const reply = (await res.json().catch(() => null)) as { settings?: UserSettings; fileAccessError?: string } | null;
			const stored = reply?.settings;
			setFileAccessError(reply?.fileAccessError ?? null);
			setRecord(
				(prev) =>
					stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings,
			);
			notifySettingsSaved(section);
			if (section === "appearance")
				onAppearanceChange(body as AppearanceSettings);
		},
		[onAppearanceChange],
	);

	const dialogRef = useRef<HTMLDivElement>(null);
	useDialogFocus(dialogRef);
	return (
		<div
			ref={dialogRef}
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			data-testid="settings-dialog"
			data-phone-view={phone ? (phoneList ? "list" : "section") : undefined}
			className="lh-settings settings-dialog-pop flex h-[680px] max-h-[88vh] w-[960px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
			onClick={(e) => e.stopPropagation()}
		>
			<header className="lh-settings-header flex h-15 shrink-0 items-center gap-3 border-b border-border px-5">
				{phone && !phoneList && (
					<button type="button" className="lh-settings-back" data-testid="settings-back" onClick={() => setListOpen(true)} aria-label="All settings">
						<ChevronLeftIcon aria-hidden />
						<span>Settings</span>
					</button>
				)}
				<h2 className="lh-settings-title">{phone && !phoneList ? activeLabel : "Settings"}</h2>
				<Hint
						// Esc closes the dialog (its own listener) — surface it.
						label="Close"
						binding="escape"
						side="left"
					>
						<button
					type="button"
					aria-label="Close settings"
					data-testid="settings-close"
					className="lh-settings-close ml-auto size-9 rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onClick={onClose}
				>
					<svg
						viewBox="0 0 16 16"
						className="mx-auto size-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					>
						<path d="M4 4l8 8M12 4l-8 8" />
					</svg>
				</button>
					</Hint>
			</header>

			<div className="flex min-h-0 flex-1">
				{/* Left nav — text-only, the session-list mono language,
					    active = bg-accent. */}
				<nav
					aria-label="Settings sections"
					data-testid="settings-nav"
					hidden={phone && !phoneList}
					className="lh-settings-nav flex w-52 shrink-0 flex-col gap-0.5 border-r border-border p-2"
				>
					{SECTIONS.filter((s) => !(noShortcuts && s.id === "keyboard")).map((s) => {
						const Icon = SECTION_ICON[s.id];
						return (
							<button
								key={s.id}
								type="button"
								data-testid={`settings-nav-${s.id}`}
								aria-current={!phone && active === s.id}
								className="lh-settings-nav-item"
								onClick={() => { setActive(s.id); setListOpen(false); }}
							>
								<span className="lh-settings-nav-icon"><Icon aria-hidden /></span>
								<span className="min-w-0 flex-1">
									<span className="lh-settings-nav-label">{s.label}</span>
									<span className="lh-settings-nav-blurb">{s.blurb}</span>
								</span>
								<ChevronRightIcon className="lh-settings-nav-chevron" aria-hidden />
							</button>
						);
					})}
				</nav>

				{/* Content column — one section at a time, this scrolls — and
				    LOCKS while any MenuShell is open (owner ruling: no
				    scrolling with a dropdown down; MenuShell announces
				    open/close, the count keeps overlap honest). The lock
				    intercepts wheel/touch instead of hiding the scrollbar —
				    nothing may shift when the lock engages. */}
				<div
					ref={contentRef}
					hidden={phoneList}
					className="lh-settings-content min-w-0 flex-1 overflow-y-auto"
					data-testid="settings-content"
				>
					{error && (
						<p
							role="alert"
							className="m-4 rounded-sm border border-red-500/40 px-3 py-2 text-xs text-red-500"
							data-testid="settings-error"
						>
							{error}
						</p>
					)}
					{record === undefined ? (
						<p className="px-6 py-5 text-xs text-muted-foreground/70">
							Loading settings…
						</p>
					) : record === null ? (
						<p className="px-6 py-5 text-xs text-muted-foreground/70">
							Settings could not be loaded — refresh to retry.
						</p>
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									<DeviceToolsSettings />
									{/* main: the running service's status, beside its updates. */}
									<RuntimeSettings />
									<UpdateSettings
										autoUpdate={record.general?.autoUpdate ?? true}
										onAutoUpdateChange={(on) =>
											void write("general", { ...record.general, autoUpdate: on })
										}
									/>
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Providers" testid="section-keys">
									<KeysSection initialRow={initialRow ?? undefined} />
								</SettingsSection>
							)}
							{active === "agent" && (
								<SettingsSection
									title="Agent"
									testid="section-agent"
								>
									<AgentSection
										agent={record.agent}
										fileAccessError={fileAccessError}
										models={record.models}
										graph={record.graph}
										compaction={record.compaction}
										onModelsChange={(next: ModelsSettings) =>
											void write("models", next)
										}
										onSectionChange={(next: AgentSettings) =>
											void write("agent", next)
										}
										onCompactionChange={(next: CompactionSettings) =>
											void write("compaction", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "appearance" && (
								<SettingsSection
									title="Appearance"
									testid="section-appearance"
								>
									<AppearanceSection
										appearance={record.appearance}
										onSectionChange={(next: AppearanceSettings) =>
											void write("appearance", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "graph" && (
								<SettingsSection
									title="Graph"
									testid="section-graph"
								>
									<GraphSection
										graph={record.graph}
										onSectionChange={(next: GraphSettings) =>
											void write("graph", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "tryouts" && (
								<SettingsSection title="Try-out designs" testid="section-tryouts">
									<TryoutsSection />
								</SettingsSection>
							)}
							{active === "about" && (
								<SettingsSection title="About this app" testid="section-about">
									<AboutSection />
								</SettingsSection>
							)}
							{active === "keyboard" && !noShortcuts && (
								<SettingsSection
									title="Keyboard"
									hint="Stored on this device"
									testid="section-keyboard"
								>
									<KeyboardSection />
								</SettingsSection>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
