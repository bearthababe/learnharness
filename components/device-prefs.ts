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
type Prefs = { revealStyle: RevealStyle; keyboardOff: boolean; headerLook: HeaderLook };

const KEYS = { revealStyle: "lh:reveal-style", keyboardOff: "lh:keyboard-off", headerLook: "lh:header-look" } as const;
const DEFAULTS: Prefs = { revealStyle: "quiet", keyboardOff: false, headerLook: "solid" };

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
	const onStorage = (event: StorageEvent) => { if (event.key === KEYS.revealStyle || event.key === KEYS.keyboardOff || event.key === KEYS.headerLook || event.key?.startsWith(TRYOUT_PREFIX)) notify(); };
	window.addEventListener("storage", onStorage);
	return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/**
 * Try-out designs (round 16, owner rule): alternatives the owner compares
 * on his phone and tablet. Each is a real, complete variant, kept on this
 * device like the other preferences here; the first option is the default.
 * - paneControls (P1): the thinking pane's controls — the mic inside the
 *   field with ⋯ in the bottom bar, or a big centre mic with a keyboard toggle.
 * - panePeek (P2): looking at the lesson while writing — Back plus a
 *   "Continue writing" pill, a "From the lesson" strip, or a Peek button.
 * - tabletPane (F6): the tablet's reading note inline, or the slide-in pane.
 * - notebookInput (P3): the phone notebook's one chat box docked at the
 *   bottom with a Tutor | Notebook switch, or following the active area.
 */
export const TRYOUTS = {
	paneControls: { options: ["field-mic", "big-mic"] },
	panePeek: { options: ["pill", "strip", "peek"] },
	tabletPane: { options: ["inline", "pane"] },
	notebookInput: { options: ["docked", "follow"] },
} as const;
export type Tryout = keyof typeof TRYOUTS;
export type TryoutValue<T extends Tryout> = (typeof TRYOUTS)[T]["options"][number];
const TRYOUT_PREFIX = "lh:try:";
const TRYOUT_KEY: Record<Tryout, string> = {
	paneControls: `${TRYOUT_PREFIX}pane-controls`,
	panePeek: `${TRYOUT_PREFIX}pane-peek`,
	tabletPane: `${TRYOUT_PREFIX}tablet-pane`,
	notebookInput: `${TRYOUT_PREFIX}notebook-input`,
};
export function tryoutDefault<T extends Tryout>(name: T): TryoutValue<T> {
	return TRYOUTS[name].options[0] as TryoutValue<T>;
}
export function readTryout<T extends Tryout>(name: T): TryoutValue<T> {
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

/** The fields that take dictation (each sits in a compact field with its
 *  mic). Round 14 (M2): search, renaming and Settings always type — the
 *  switch is about dictating, and those fields have no mic. */
const EDITABLE = '.lh-compact-field :is(textarea, [contenteditable="true"], [data-file-path-input])';

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
