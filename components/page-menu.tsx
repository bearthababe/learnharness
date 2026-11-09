"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import { MenuShell } from "@/components/menu-shell";
import { useOneMenu } from "@/components/one-menu";
import { usePhoneMenuPresence } from "@/components/phone-menu-presence";
import { installKeyboardGuard, setKeyboardOff, useKeyboardOff } from "@/components/device-prefs";
import { useCoarsePointer, usePhoneLayout } from "@/components/use-phone-viewport";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { ActivitySection } from "@/components/activity-dock";

/**
 * The app menu (round 14, owner M1): one icon-only ⋯ at the right of the
 * page bar on phones and tablets — on sessions and on Home. In order:
 * - Keep keyboard closed (touch screens): one remembered switch for every
 *   dictation field (M2); the fields show "type instead" while it is on;
 * - Model, Reasoning, Usage: their values in full, each opening the same
 *   card as before (the controls stay mounted but hidden, because the send
 *   guard and the shortcuts read them);
 * - Tutor helpers (P14), opening its own sheet, and Settings (M5).
 * Laptops keep the model row under the composer and the sidebar footer;
 * the button is touch-only (CSS).
 */
type PageMenuState = { model: string | null; level: string | null; usage: string | null; importing: boolean; graphDisplay: boolean };
let state: PageMenuState = { model: null, level: null, usage: null, importing: false, graphDisplay: false };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** The model control and the stats bar publish what the menu shows. */
export function publishPageMenu(next: Partial<PageMenuState>) {
	const merged = { ...state, ...next };
	if ((Object.keys(merged) as (keyof PageMenuState)[]).every((key) => merged[key] === state[key])) return;
	state = merged;
	for (const listener of listeners) listener();
}

export const OPEN_THINKING_EVENT = "lh:open-thinking-picker";
export const OPEN_USAGE_EVENT = "lh:open-usage";
/** Opens the Tutor helpers sheet (the ⋯ row, or a session's failure note). */
export const OPEN_HELPERS_EVENT = "lh:open-helpers";
/** Home's rows (round 14, P5/P16): the import menu and Graph display open
 *  from ⋯ on phones and tablets. */
export const OPEN_IMPORT_EVENT = "lh:open-import";
export const OPEN_GRAPH_DISPLAY_EVENT = "lh:open-graph-display";

export type PageMenuRow = { id: string; label: string; value?: string; open: () => void };

export function PageMenuButton({ extraRows = [] }: {
	/** Rows of this page placed after Usage (Home: import, graph display). */
	extraRows?: PageMenuRow[];
}) {
	const values = useSyncExternalStore(subscribe, () => state, () => state);
	const [open, setOpen] = useState(false);
	const [helpers, setHelpers] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const phone = usePhoneLayout();
	const touch = useCoarsePointer();
	const keyboardOff = useKeyboardOff();
	const { open: openSettings } = useSettingsDialog();
	useOneMenu("page-menu", open, () => setOpen(false));
	useOneMenu("helpers-sheet", helpers, () => setHelpers(false));
	const helpersPresence = usePhoneMenuPresence(helpers ? "helpers" : null, phone);
	useEffect(() => { installKeyboardGuard(); }, []);
	useEffect(() => {
		const onOpen = () => setHelpers(true);
		window.addEventListener(OPEN_HELPERS_EVENT, onOpen);
		return () => window.removeEventListener(OPEN_HELPERS_EVENT, onOpen);
	}, []);
	const choose = (open: () => void) => {
		setOpen(false);
		// The chosen card opens as this menu leaves (one menu at a time).
		requestAnimationFrame(open);
	};
	const groups: PageMenuRow[][] = [
		[
			{ id: "model", label: "Model", value: values.model ?? "—", open: () => window.dispatchEvent(new CustomEvent("lh:kbd-open-model-picker")) },
			{ id: "reasoning", label: "Reasoning", value: values.level ?? "—", open: () => window.dispatchEvent(new CustomEvent(OPEN_THINKING_EVENT)) },
			...(values.usage ? [{ id: "usage", label: "Usage", value: values.usage, open: () => window.dispatchEvent(new CustomEvent(OPEN_USAGE_EVENT)) }] : []),
			// Home (P5): the knowledge map's own actions, off the crowded bar.
			...(values.importing ? [{ id: "import", label: "Import to knowledge map", open: () => window.dispatchEvent(new CustomEvent(OPEN_IMPORT_EVENT)) }] : []),
			...(values.graphDisplay ? [{ id: "graph-display", label: "Graph display", open: () => window.dispatchEvent(new CustomEvent(OPEN_GRAPH_DISPLAY_EVENT)) }] : []),
			...extraRows,
		],
		[
			{ id: "helpers", label: "Tutor helpers", open: () => setHelpers(true) },
			{ id: "settings", label: "Settings", open: () => openSettings() },
		],
	];
	const row = (item: PageMenuRow) => (
		<button key={item.id} type="button" role="menuitem" className="lh-page-menu-row" data-testid={`page-menu-${item.id}`} onClick={() => choose(item.open)}>
			<span className="lh-page-menu-label">{item.label}</span>
			{item.value !== undefined && <span className="lh-page-menu-value">{item.value}</span>}
			<ChevronRightIcon aria-hidden />
		</button>
	);
	let keyboardSwitch: ReactNode = null;
	if (touch) keyboardSwitch = (
		<button type="button" role="menuitemcheckbox" aria-checked={keyboardOff} className="lh-page-menu-row lh-page-menu-switch" data-testid="page-menu-keyboard"
			onClick={() => setKeyboardOff(!keyboardOff)}>
			<span className="lh-page-menu-label">Keep keyboard closed</span>
			<span className="lh-page-menu-switch-hint">{keyboardOff ? "On — dictate, or tap the keyboard icon in a field to type" : "Off"}</span>
			<span className="lh-switch" data-on={keyboardOff || undefined} aria-hidden><span /></span>
		</button>
	);
	return (
		<>
			<button
				ref={trigger}
				type="button"
				className="lh-nav-chip lh-page-menu-button lh-no-drag"
				data-testid="page-menu-button"
				aria-label="More options"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<EllipsisIcon aria-hidden />
			</button>
			{open && (
				<MenuShell anchorRef={trigger} testid="page-menu" preferredSide="down" align="right" fitVisualViewport={phone}
					phoneTriggerTestid="page-menu-button" onClose={() => setOpen(false)}
					menuClass="lh-page-menu lh-glass rounded-xl border bg-card p-1.5 shadow-xl">
					<div role="menu" aria-label="More options">
						{keyboardSwitch}
						{groups.map((group, index) => (
							<Fragment key={index}>
								{(index > 0 || keyboardSwitch) && <div role="separator" className="lh-page-menu-divider" />}
								{group.map(row)}
							</Fragment>
						))}
					</div>
				</MenuShell>
			)}
			{helpersPresence.value && (
				<MenuShell anchorTestid="page-menu-button" testid="helpers-sheet" preferredSide="down" align="right" fitVisualViewport={phone}
					closing={helpersPresence.closing} onClosed={helpersPresence.onClosed}
					phoneTriggerTestid="page-menu-button" onClose={() => setHelpers(false)}
					menuClass="lh-helpers-sheet lh-glass w-[24rem] max-w-[calc(100vw-24px)] rounded-xl border bg-card p-1 shadow-xl">
					<ActivitySection sheet />
				</MenuShell>
			)}
		</>
	);
}
