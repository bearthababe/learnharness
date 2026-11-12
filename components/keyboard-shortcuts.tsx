"use client";

/**
 * Keyboard shortcuts (shortcut wave A, 2026-09-17) — the single document-level
 * keydown listener. Owns the pieces that belong to no surface in particular:
 *
 * - Tab follows the browser's focus order, with two app refinements: from
 *   nowhere it lands in the surface's first text field, and between several
 *   text fields it cycles them (see field-cycle.ts). Shift+Tab is native.
 * - Esc is a layered dismiss: topmost popover first (popovers stopPropagation
 *   on their own Esc — usePopoverDismiss + ModelControl), then dictation
 *   CANCEL (discard the transcript, owner 2026-09-17 round 3), then abort of
 *   an in-flight turn.
 * - Global actions dispatch lh:kbd-<action> window events; surfaces that are
 *   mounted listen (the lh:chat-renamed pattern). A surface that isn't
 *   mounted simply doesn't listen — an F2 on the graph view is a no-op, not
 *   an error. Actions live in src/core/keyboard.ts (registry + persisted
 *   overrides), the ONE table the settings milestone will render as its
 *   editor.
 *
 * Listeners attach at the WINDOW level (bubble's last stop) so every
 * component-level handler — popovers' own Esc, the composer's Esc — gets the
 * event first and can claim it with stopPropagation.
 */

import { useEffect, useRef, useState } from "react";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { useRouter } from "next/navigation";
import {
	actionForBinding,
	bindingForAction,
	eventBinding,
	formatBinding,
	isTypingSurface,
	kbdEventForAction,
	KEYBOARD_ACTIONS,
} from "@/src/core";
import { isDictationActive } from "@/components/dictation";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";

// Re-exported for the contract pin (tests/keyboard-toggle-sidebar.test.ts):
// the dispatcher composes event names through the ONE helper — a second
// spelling here is how the ⌘B bug happened.
export { kbdEventForAction };

/** R9 (round 16): the page's Tab order, region by region. Anything a
 *  region does not contain (menus, panes, dialogs) keeps the browser's order. */
const TAB_REGIONS: readonly string[] = [
	".lh-skip-links",
	"header.lh-topbar, .lh-session-head, .lh-home-navigation, .lh-home-toolbar, .lh-map-toggle",
	".lh-sessions-panel",
	".lh-dock-overlay, .lh-home-dock",
	".lh-app-main",
];
// The composer (index 3) comes after the lesson (index 4 matches the rest of
// the page): the walk visits regions in this order.
const REGION_ORDER = [0, 1, 2, 4, 3];
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function regionOf(el: Element): number {
	for (let i = 0; i < TAB_REGIONS.length; i++) if (el.closest(TAB_REGIONS[i]!)) return i;
	return -1;
}
export function moveFocusByRegion(step: 1 | -1): boolean {
	if (typeof document === "undefined") return false;
	const active = document.activeElement as HTMLElement | null;
	const inPage = !active || active === document.body || active === document.documentElement;
	if (!inPage && regionOf(active!) < 0) return false;
	if (active?.closest('[role="menu"], [role="listbox"], [data-lh-menu]')) return false;
	const list = [...document.querySelectorAll<HTMLElement>(TABBABLE)]
		.filter((el) => el.tabIndex >= 0 && regionOf(el) >= 0 && !el.closest("[inert], [aria-hidden='true']") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
		.map((el, index) => ({ el, index, rank: REGION_ORDER.indexOf(regionOf(el)) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((item) => item.el);
	if (list.length === 0) return false;
	const at = inPage ? -1 : list.findIndex((el) => el === active || el.contains(active!));
	if (!inPage && at < 0) return false;
	const next = at < 0 ? (step === 1 ? list[0] : list.at(-1)) : list[(at + step + list.length) % list.length];
	next?.focus();
	return !!next;
}

export function KeyboardShortcuts() {
	const router = useRouter();
	const [cheatOpen, setCheatOpen] = useState(false);
	const { open: openSettings } = useSettingsDialog();

	// Router + cheat + settings state inside a ref so the keydown listener
	// (attached once) never goes stale.
	const handlersRef = useRef<{
		router: ReturnType<typeof useRouter>;
		setCheatOpen: (v: boolean) => void;
		openSettings: () => void;
	}>({ router, setCheatOpen, openSettings });
	handlersRef.current = { router, setCheatOpen, openSettings };

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// ── Tab is dead (owner, 2026-09-17): preventDefault even when
			// nothing is bound to it — browser tab-focus is abandoned, and
			// the default action runs after dispatch, so suppressing it here
			// works from any focus.
			if (e.key === "Tab") {
				// Tab keeps the browser's focus order except where the app has
				// something better: from nowhere it lands in the surface's
				// first text field, and between several text fields it cycles
				// them. A surface claims the key by cancelling the cycle event;
				// unclaimed (one field, a focused control, an open modal),
				// Tab moves on normally so every control stays reachable. The
				// quiz dock's rows↔thinking claim stops propagation at document
				// level, so a claimed Tab never reaches this dispatch.
				if (e.metaKey || e.ctrlKey || e.altKey) return;
				if (document.querySelector('[aria-modal="true"]')) return;
				if (!e.shiftKey) {
					const cycle = new CustomEvent("lh:kbd-cycle-fields", { cancelable: true });
					window.dispatchEvent(cycle);
					if (cycle.defaultPrevented) { e.preventDefault(); return; }
				}
				// R9 (round 16): past the text fields, Tab walks the whole page
				// in one order — header, sessions, lesson, composer — and wraps
				// to the start, never looping inside the composer.
				if (moveFocusByRegion(e.shiftKey ? -1 : 1)) e.preventDefault();
				return;
			}

			if (e.key === "Escape") {
				// Our own overlay is the topmost layer.
				if (cheatOpen) {
					setCheatOpen(false);
					e.preventDefault();
					return;
				}
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): one
				// Esc, one action, on the topmost active layer. Field-level
				// handlers claim at their element (focus in a field: the
				// field's action); every SURFACED layer (popovers, plan,
				// overlays, dialogs) claims at the DOCUMENT level, which
				// fires before this window listener — so reaching here means
				// NOTHING is surfaced and no field is focused. This chain is
				// the fallback, bottom-up: dictation (a live capture, not a
				// surface — it survives Esc that closes a plan or overlay),
				// then abort the turn (a server-side turn has no client
				// request to abort — the abort seam in Chat decides what's
				// honestly stoppable, layered by escAbortTarget).
				if (isDictationActive()) {
					e.preventDefault();
					window.dispatchEvent(new CustomEvent("lh:kbd-cancel-dictation"));
					return;
				}
				window.dispatchEvent(new CustomEvent("lh:kbd-abort-turn"));
				return;
			}

			// ── Registry dispatch.
			const action = actionForBinding(eventBinding(e));
			if (!action) return;

			// The input guard: inside a typing surface only mod/alt combos
			// fire (they never type a character). Bare keys — "?" included —
			// pass through so the field keeps them. Tab already returned above.
			if (isTypingSurface(e) && !(e.metaKey || e.ctrlKey || e.altKey)) return;

			// Dispatch: global commands we own run here; surface commands
			// ride the window event for the mounted surface to catch.
			switch (action) {
				case "new-session":
					handlersRef.current.router.push("/?mode=teach");
					break;
				case "open-settings":
					// Settings-app wave: the dialog is the surface, the URL is
					// gone — /settings redirects to the draft shell.
					handlersRef.current.openSettings();
					break;
				case "jump-graph":
					handlersRef.current.router.push("/");
					break;
				case "cheat-sheet":
					handlersRef.current.setCheatOpen(true);
					break;
				case "find":
					// The mounted surface owns Find (session text / graph nodes).
					// Claim Mod+F so Chromium's whole-window finder cannot open too.
					e.preventDefault();
					window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
					break;
				default:
					window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [cheatOpen]);

	// Focus rings follow how focus moved: Tab navigation shows them, any
	// pointer press hides them again — so a clicked control never lights up
	// later just because other keys (quiz arrows, typing) were pressed.
	useEffect(() => {
		const root = document.documentElement;
		const onKey = (e: KeyboardEvent) => { if (e.key === "Tab") root.dataset.focusSource = "keyboard"; };
		const onPointer = () => { delete root.dataset.focusSource; };
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
		};
	}, []);

	return <CheatSheet open={cheatOpen} onClose={() => setCheatOpen(false)} />;
}

/** The ? overlay — the registry rendered as a table (grouped by scope).
 *  Until the settings milestone ships an editor, this is how shortcuts
 *  stay discoverable. */
function CheatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const backdropDismiss = useBackdropDismiss(onClose);
	if (!open) return null;
	const scopes = ["global", "chat", "graph"] as const;
	const scopeLabels: Record<(typeof scopes)[number], string> = {
		global: "Global",
		chat: "Chat",
		graph: "Graph view",
	};
	return (
		<div
			data-testid="cheat-sheet"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			{...backdropDismiss}
		>
			<div
				className="max-h-[80vh] w-full max-w-[36rem] overflow-y-auto rounded-xl border bg-card p-5 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-4 flex items-baseline justify-between">
					<span className="text-sm font-medium text-card-foreground">Keyboard shortcuts</span>
					<span className="text-xs text-muted-foreground">Esc to close</span>
				</div>
				{scopes.map((scope) => {
					const actions = KEYBOARD_ACTIONS.filter((a) => a.scope === scope);
					if (actions.length === 0) return null;
					return (
						<div key={scope} className="mb-4">
							<div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground/70">
								{scopeLabels[scope]}
							</div>
							<div className="flex flex-col gap-1">
								{actions.map((a) => (
									<div key={a.id} className="flex items-center justify-between gap-4 text-sm">
										<span className="text-muted-foreground">{a.label}</span>
										<kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-card-foreground">
											{formatBinding(bindingForAction(a.id))}
										</kbd>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
