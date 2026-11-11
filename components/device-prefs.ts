"use client";

import { useSyncExternalStore } from "react";

/**
 * Small preferences kept on this device (round 12), read wherever they
 * apply and changed from Settings or the control itself:
 * - revealStyle (owner O5): "Show question" quiet (default) or prominent.
 * - keyboardOff (owner O6): keep the on-screen keyboard closed while
 *   dictating; typing comes back when it is switched off again.
 */
export type RevealStyle = "quiet" | "prominent";
/** Round 15 (A6): the phone's page bar, solid (default) or glass over the
 *  lesson, which then scrolls beneath it. */
export type HeaderLook = "solid" | "glass";
type Prefs = { revealStyle: RevealStyle; keyboardOff: boolean; headerLook: HeaderLook; prototypeView: boolean };

const KEYS = { revealStyle: "lh:reveal-style", keyboardOff: "lh:keyboard-off", headerLook: "lh:header-look", prototypeView: "lh:prototype-view" } as const;
const DEFAULTS: Prefs = { revealStyle: "quiet", keyboardOff: false, headerLook: "solid", prototypeView: false };

function read<K extends keyof Prefs>(key: K): Prefs[K] {
	try {
		const raw = window.localStorage.getItem(KEYS[key]);
		if (key === "revealStyle") return (raw === "prominent" ? "prominent" : "quiet") as Prefs[K];
		if (key === "headerLook") return (raw === "glass" ? "glass" : "solid") as Prefs[K];
		return (raw === "on") as Prefs[K];
	} catch {
		return DEFAULTS[key];
	}
}

const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => { if (event.key === KEYS.revealStyle || event.key === KEYS.keyboardOff || event.key === KEYS.headerLook || event.key === KEYS.prototypeView || event.key?.startsWith(TRYOUT_PREFIX)) notify(); };
	window.addEventListener("storage", onStorage);
	return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/**
 * Try-out designs (round 16, owner rule): alternatives the owner compares
 * on his phone and tablet. Each is a real, complete variant, kept on this
 * device like the other preferences here; the first option is the default.
 * Round 17: the owner's picks became the design (the big mic bar and Peek);
 * the variants he did not pick are gone. New this round:
 * - cardLayout (S4, phones): surfaces that take over the screen (the
 *   thinking pane, the notebook, an open question, a practice problem) as
 *   today's plain full-screen layout, or as one inset card with a filled
 *   main action at the bottom.
 * - sessionsPage (P4, phones): the sessions list as a page under the usual
 *   toolbar (Sessions shown active), or a page with its own header and Back.
 */
export const TRYOUTS = {
	cardLayout: { options: ["plain", "card"] },
	sessionsPage: { options: ["toolbar", "header"] },
} as const;
export type Tryout = keyof typeof TRYOUTS;
export type TryoutValue<T extends Tryout> = (typeof TRYOUTS)[T]["options"][number];
const TRYOUT_PREFIX = "lh:try:";
const TRYOUT_KEY: Record<Tryout, string> = {
	cardLayout: `${TRYOUT_PREFIX}card-layout`,
	sessionsPage: `${TRYOUT_PREFIX}sessions-page`,
};
/** Keys of round 16's retired try-outs: dropped once, so nothing stale lingers. */
const RETIRED_TRYOUT_KEYS = ["pane-controls", "pane-peek", "tablet-pane", "notebook-input"].map((name) => `${TRYOUT_PREFIX}${name}`);
let retiredCleared = false;
function clearRetiredTryouts() {
	if (retiredCleared) return;
	retiredCleared = true;
	try { for (const key of RETIRED_TRYOUT_KEYS) window.localStorage.removeItem(key); } catch { /* storage blocked */ }
}
export function tryoutDefault<T extends Tryout>(name: T): TryoutValue<T> {
	return TRYOUTS[name].options[0] as TryoutValue<T>;
}
export function readTryout<T extends Tryout>(name: T): TryoutValue<T> {
	clearRetiredTryouts();
	try {
		const raw = window.localStorage.getItem(TRYOUT_KEY[name]);
		return ((TRYOUTS[name].options as readonly string[]).includes(raw ?? "") ? raw : tryoutDefault(name)) as TryoutValue<T>;
	} catch {
		return tryoutDefault(name);
	}
}
export function setTryout<T extends Tryout>(name: T, value: TryoutValue<T>) {
	try { window.localStorage.setItem(TRYOUT_KEY[name], value); } catch { /* this view only */ }
	notify();
}
export function useTryout<T extends Tryout>(name: T): TryoutValue<T> {
	return useSyncExternalStore(subscribe, () => readTryout(name), () => tryoutDefault(name));
}

/** B18 (round 18, owner): Prototype view — while on, each design with
 *  alternatives shows a small switch where it appears (PrototypeSwitch).
 *  Off by default; kept on this device. */
export function setPrototypeView(on: boolean) {
	try { if (on) window.localStorage.setItem(KEYS.prototypeView, "on"); else window.localStorage.removeItem(KEYS.prototypeView); } catch { /* this view only */ }
	notify();
}
export function usePrototypeView(): boolean {
	return useSyncExternalStore(subscribe, () => read("prototypeView"), () => DEFAULTS.prototypeView);
}

export function setHeaderLook(look: HeaderLook) {
	try { window.localStorage.setItem(KEYS.headerLook, look); } catch { /* this view only */ }
	notify();
}
export function useHeaderLook(): HeaderLook {
	return useSyncExternalStore(subscribe, () => read("headerLook"), () => DEFAULTS.headerLook);
}

export function setRevealStyle(style: RevealStyle) {
	try { window.localStorage.setItem(KEYS.revealStyle, style); } catch { /* this view only */ }
	notify();
}
export function useRevealStyle(): RevealStyle {
	return useSyncExternalStore(subscribe, () => read("revealStyle"), () => DEFAULTS.revealStyle);
}

export function keyboardOff(): boolean {
	return typeof window !== "undefined" && read("keyboardOff");
}
/** Round 15 (F4): the first time a field gets no keyboard because the switch
 *  is on, say once where the switch is (cleared when the keyboard comes back,
 *  so the next time it is kept closed the reminder can show once more). */
export const KEYBOARD_HINT_EVENT = "lh:keyboard-off-hint";
const HINT_KEY = "lh:keyboard-off-hinted";
export function setKeyboardOff(off: boolean) {
	try {
		window.localStorage.setItem(KEYS.keyboardOff, off ? "on" : "off");
		if (!off) window.localStorage.removeItem(HINT_KEY);
	} catch { /* this view only */ }
	applyKeyboardMode();
	notify();
}
export function useKeyboardOff(): boolean {
	return useSyncExternalStore(subscribe, () => read("keyboardOff"), () => DEFAULTS.keyboardOff);
}

/** The fields the switch covers (S3, round 17): learning activities only —
 *  the dictation fields of a lesson, practice or drill (the session's dock,
 *  and the panes it opens over the page, marked data-learning-surface).
 *  Utility inputs always raise the keyboard, even with the switch on:
 *  search, naming and renaming (folders, sessions), Settings, and Home's
 *  start field. The switch exists so that tapping a field while reading
 *  does not change the whole screen. */
export const LEARNING_SURFACE = ":is([data-session-workspace], [data-learning-surface])";
const EDITABLE = `${LEARNING_SURFACE} .lh-compact-field :is(textarea, [contenteditable="true"], [data-file-path-input])`;

/** Apply the keyboard choice to every field (and to fields that appear
 *  later, on focus). With the keyboard off, fields are marked
 *  inputmode="none": the on-screen keyboard stays closed while dictation
 *  still writes into them. A field that is focused right now is blurred
 *  and refocused so a keyboard that is already up goes away. */
export function applyKeyboardMode() {
	if (typeof document === "undefined") return;
	const off = keyboardOff();
	for (const field of document.querySelectorAll<HTMLElement>(EDITABLE)) mark(field, off);
	const active = document.activeElement as HTMLElement | null;
	if (active && active.matches?.(EDITABLE)) {
		active.blur();
		active.focus({ preventScroll: true });
	}
}
function mark(field: HTMLElement, off: boolean) {
	if (off) {
		if (!field.hasAttribute("data-lh-keyboard-off")) {
			field.setAttribute("data-lh-keyboard-off", field.getAttribute("inputmode") ?? "");
			field.setAttribute("inputmode", "none");
		}
	} else if (field.hasAttribute("data-lh-keyboard-off")) {
		const before = field.getAttribute("data-lh-keyboard-off");
		if (before) field.setAttribute("inputmode", before); else field.removeAttribute("inputmode");
		field.removeAttribute("data-lh-keyboard-off");
	}
}

let installed = false;
/** Once per page: fields that receive focus follow the current choice. */
export function installKeyboardGuard() {
	if (installed || typeof document === "undefined") return;
	installed = true;
	// Before focus (a tap) and on focus (keyboard, script): a field takes the
	// choice before the browser decides whether to raise the keyboard.
	const follow = (event: Event) => {
		const field = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(EDITABLE);
		if (field) mark(field, keyboardOff());
	};
	const remind = (event: Event) => {
		if (!keyboardOff() || !(event.target as HTMLElement | null)?.closest?.(EDITABLE)) return;
		try {
			if (window.localStorage.getItem(HINT_KEY)) return;
			window.localStorage.setItem(HINT_KEY, "1");
		} catch { return; }
		window.dispatchEvent(new CustomEvent(KEYBOARD_HINT_EVENT));
	};
	document.addEventListener("pointerdown", follow, true);
	document.addEventListener("focusin", follow, true);
	document.addEventListener("focusin", remind);
}
