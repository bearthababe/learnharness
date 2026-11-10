"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, KeyboardIcon } from "lucide-react";
import { PhoneMenuBackdrop } from "@/components/phone-menu-backdrop";

/**
 * THE shared menu shell (menu standardization, fix wave chunk B): one
 * placement body for the app's dropdown menus — portaled to document.body
 * (never clipped by an ancestor's overflow), fixed-anchored to the trigger's
 * rect, viewport-capped. PLACEMENT-ONLY by design: every site keeps its own
 * open/close/Esc contract (the layered-dismissal machinery differs
 * legitimately by surface — settings sections, the keys editor, the setup
 * dialog each own their Escape).
 *
 *  - Side: each site declares its preferred side — the composer opens UP
 *    (its control sits at screen bottom), the settings rows open DOWN;
 *    the shell flips when the preferred side cannot show the menu's
 *    content and the other side is roomier (the graph popovers'
 *    honest-fitting behavior, generalized).
 *  - Cap: max-height = min(60vh, the chosen side's available room); the
 *    menu scrolls internally instead of stretching the page or escaping
 *    the viewport (graph-view's max-h-[60vh] pattern).
 *  - Re-placement: capture-phase scroll + window resize — the settings
 *    menus' discipline (the settings dialog's inner content scroll
 *    included).
 *
 * Sites (model menus first, owner 2026-09-22; the graph popovers and the
 * stats-bar summary popover stay bespoke — seams stay open for later
 * adoption): the settings Agent section's slot + search-engine menus, the
 * Keys section's Add-provider menu, the composer's model/thinking menus
 * (model-picker.tsx), and the SetupDialog's slot pickers — portaling THOSE
 * out of the dialog's overflow-hidden frame so they extend beyond the
 * dialog exactly like the settings menus (owner, chunk B item 7).
 *
 * SSR: menus only mount client-side while open; the hidden measuring pass
 * below is the only pre-placement render, so a server render never emits
 * a positioned menu.
 */

const GAP = 4; // anchor edge → menu (the bespoke shells' settled 4px)
const EDGE = 8; // viewport floor the menu never enters
const CAP_VH = 0.6; // 60vh — the graph pattern's cap
const MIN_USABLE = 96; // floor: a shorter cap is an unusable sliver; the
// cap then overflows the edge instead of crushing the menu
const PHONE_DURATION = 400;
/** Phone cards open and close at once, like the Settings and Extract files
 *  menus (owner, round 11: the "fall-out" motion is gone). The motion code
 *  stays behind this switch, so it can be restored deliberately. */
const PHONE_MOTION = false;
const PHONE_EASING = "linear";

/** Grow about the bottom anchor without compressing the rounded corners. Give
 * contents their resting layout throughout so text never scales or squashes.
 * At rest the wrapper is display:contents and the inherited layout takes over. */
function animatePhoneFrame(menu: HTMLDivElement, content: HTMLDivElement, backdrop: HTMLDivElement,
	closing = false, fromHeight?: number, fromBlur = "blur(4px)") {
	const css = getComputedStyle(menu);
	const height = menu.getBoundingClientRect().height;
	const borderHeight = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
	const lineHeight = parseFloat(css.borderBottomWidth);
	// CSS proportionally shrinks ALL corner radii when they overlap. Never let
	// the painted frame get that short: reveal its actual bottom contour until
	// there is room for both corners, then grow the frame normally. The revealed
	// height moves at one constant speed across that boundary (no extra phase).
	const cornerHeight = Math.min(height, Math.max(
		parseFloat(css.borderTopLeftRadius) + parseFloat(css.borderBottomLeftRadius),
		parseFloat(css.borderTopRightRadius) + parseFloat(css.borderBottomRightRadius),
	));
	const start = closing ? fromHeight ?? height : lineHeight;
	const end = closing ? lineHeight : height;
	const frameAt = (visibleHeight: number, offset: number) => ({
		height: `${Math.max(cornerHeight, visibleHeight)}px`,
		clipPath: `inset(${Math.max(0, cornerHeight - visibleHeight)}px 0px 0px 0px)`,
		offset,
	});
	const crossing = (cornerHeight - start) / (end - start);
	const frames = [frameAt(start, 0)];
	if (crossing > 0 && crossing < 1) frames.push(frameAt(cornerHeight, crossing));
	frames.push(frameAt(end, 1));
	const layout = { display: css.display, flexDirection: css.flexDirection, gap: css.gap, padding: css.padding };
	const before = { padding: menu.style.padding, overflowX: menu.style.overflowX, overflowY: menu.style.overflowY, content: content.style.cssText };
	Object.assign(content.style, { ...layout, position: "absolute", top: "0", left: "0", right: "0", height: `${height - borderHeight}px`, boxSizing: "border-box" });
	menu.style.padding = "0";
	menu.style.overflow = "hidden";
	const animation = menu.animate(frames, { duration: PHONE_DURATION, easing: PHONE_EASING, fill: "both" });
	const blur = backdrop.animate([
		{ backdropFilter: closing ? fromBlur : "blur(0px)" },
		{ backdropFilter: closing ? "blur(0px)" : getComputedStyle(backdrop).backdropFilter },
	], { duration: PHONE_DURATION, easing: PHONE_EASING, fill: "both" });
	// Layout can run long after the last timeline tick. Backdating to that tick
	// skips the beginning (or all) of the motion. Start together on a fresh frame.
	animation.pause(); blur.pause();
	animation.currentTime = 0; blur.currentTime = 0;
	const frame = requestAnimationFrame(frameTime => {
		// A busy frame can delay this callback after its timestamp was sampled.
		// Both clocks use this document's time origin; never count that delay.
		// Backwards fill holds the initial frame until the timeline catches up.
		const startTime = Math.max(frameTime, performance.now());
		animation.play(); blur.play();
		animation.startTime = startTime; blur.startTime = startTime;
	});
	let active = true;
	return {
		get active() { return active; },
		get visibleHeight() {
			const clip = parseFloat(getComputedStyle(menu).clipPath.match(/^inset\(([^p]+)px/)?.[1] ?? "0");
			return menu.getBoundingClientRect().height - clip;
		},
		finished: Promise.all([animation.finished, blur.finished]),
		cancel() {
			if (!active) return;
			active = false;
			cancelAnimationFrame(frame);
			animation.cancel(); blur.cancel();
			menu.style.padding = before.padding;
			menu.style.overflowX = before.overflowX;
			menu.style.overflowY = before.overflowY;
			content.style.cssText = before.content;
		},
	};
}

/** A MenuShell mounted = a dropdown open (fix wave, owner ruling:
 *  the settings dialog's content column locks while any menu is down —
 *  no scrolling under a dropdown). The shell stays placement-only: it
 *  just ANNOUNCES, surfaces decide what to do with the fact (the
 *  settings dialog locks; anything un-lockable keeps the re-place-on-
 *  scroll fallback below). Count-based: overlapping menus open/close in
 *  any order and the accounting stays balanced. */
export const MENU_OPEN_EVENT = "lh:menu-open";
export const MENU_CLOSE_EVENT = "lh:menu-close";

export type MenuSide = "up" | "down";
export type MenuAlign = "left" | "right";

/** One placement decision. `style` is the fixed-position payload; the side
 *  rides back for the flip assertion in tests. */
export interface MenuPlacement {
	side: MenuSide;
	style: Record<string, string | number>;
	maxHeight: number;
}

/** Pure: the placement decision — anchored rect + viewport + the menu's
 *  UNCAPPED content height (scrollHeight, so re-placements after a search
 *  filter re-measure honestly) → side, fixed style, cap. Flip rule: stay
 *  on the preferred side unless it cannot show the full content AND the
 *  other side is roomier. The cap always keeps the menu inside its side's
 *  room when there is room; the floor keeps it usable when there isn't. */
export function computeMenuPlacement(
	rect: { top: number; bottom: number; left: number; right: number },
	viewport: { width: number; height: number },
	contentHeight: number,
	preferredSide: MenuSide,
	align: MenuAlign,
	cap = CAP_VH,
): MenuPlacement {
	const availDown = viewport.height - EDGE - (rect.bottom + GAP);
	const availUp = rect.top - GAP - EDGE;
	// contentHeight ≤ 0 (nothing measured yet) keeps the preferred side —
	// the hidden first pass re-measures and decides with real numbers.
	let side = preferredSide;
	if (contentHeight > 0) {
		const preferredAvail = preferredSide === "down" ? availDown : availUp;
		const otherAvail = preferredSide === "down" ? availUp : availDown;
		if (contentHeight > preferredAvail && otherAvail > preferredAvail) {
			side = preferredSide === "down" ? "up" : "down";
		}
	}
	const avail = side === "down" ? availDown : availUp;
	const maxHeight = Math.max(MIN_USABLE, Math.min(cap * viewport.height, avail));
	const horizontal: Record<string, number> =
		align === "right" ? { right: viewport.width - rect.right } : { left: rect.left };
	const vertical: Record<string, number> =
		side === "down" ? { top: rect.bottom + GAP } : { bottom: viewport.height - rect.top + GAP };
	return { side, style: { ...horizontal, ...vertical }, maxHeight };
}

/** Round 14 (C5): a placed menu always stays on screen — never past an
 *  edge horizontally (a wide menu starts at the left edge and is capped to
 *  the screen), never below or above the screen vertically (its cap shrinks
 *  to the room, and when even the usable floor does not fit, the menu moves
 *  inside instead of hanging off). It scrolls inside its cap. Pure. */
export function clampMenuPlacement(p: MenuPlacement, menuWidth: number, viewport: { width: number; height: number }): MenuPlacement {
	const style: Record<string, string | number> = { ...p.style };
	const width = Math.min(menuWidth, viewport.width - 2 * EDGE);
	const wantedLeft = typeof style.right === "number" ? viewport.width - style.right - menuWidth : typeof style.left === "number" ? style.left : EDGE;
	delete style.right;
	style.left = Math.max(EDGE, Math.min(viewport.width - EDGE - width, wantedLeft));
	style.maxWidth = viewport.width - 2 * EDGE;
	let maxHeight = Math.min(p.maxHeight, viewport.height - 2 * EDGE);
	if (typeof style.top === "number") {
		const room = viewport.height - EDGE - style.top;
		if (room < maxHeight) {
			if (room >= MIN_USABLE) maxHeight = room;
			else style.top = Math.max(EDGE, viewport.height - EDGE - maxHeight);
		}
	} else if (typeof style.bottom === "number") {
		const room = viewport.height - style.bottom - EDGE;
		if (room < maxHeight) {
			if (room >= MIN_USABLE) maxHeight = room;
			else style.bottom = Math.max(EDGE, viewport.height - EDGE - maxHeight);
		}
	}
	return { ...p, style, maxHeight };
}

/** Phone keyboards can cover the anchor without resizing the layout viewport.
 * Clamp that anchor into the visible area and never apply the desktop overflow
 * floor. Keep the same compact cap, gap and side preference. */
export function computeVisibleMenuPlacement(
	rect: { top: number; bottom: number; left: number; right: number },
	viewport: { width: number; height: number; offsetTop: number; offsetLeft: number },
	contentHeight: number, menuWidth: number, preferredSide: MenuSide, align: MenuAlign,
	dockSearch = false, cap = CAP_VH,
): MenuPlacement {
	const clampY = (y: number) => Math.max(EDGE, Math.min(viewport.height - EDGE, y - viewport.offsetTop));
	const local = { ...rect, top: clampY(rect.top), bottom: clampY(rect.bottom) };
	const side = dockSearch ? "up" : computeMenuPlacement(local, viewport, contentHeight, preferredSide, align, cap).side;
	// Focused phone search covers the composer instead of reserving its height.
	// The visible bottom is the browser-reported keyboard/accessory boundary.
	const edge = dockSearch ? viewport.height : side === "up" ? Math.max(EDGE, local.top - GAP) : Math.min(viewport.height - EDGE, local.bottom + GAP);
	const room = side === "up" ? edge - EDGE : viewport.height - EDGE - edge;
	const width = Math.min(menuWidth, Math.max(0, viewport.width - 2 * EDGE));
	const wantedLeft = (align === "right" ? rect.right - width : rect.left) - viewport.offsetLeft;
	const left = Math.max(EDGE, Math.min(viewport.width - EDGE - width, wantedLeft));
	return {
		side,
		maxHeight: Math.max(0, Math.min(cap * viewport.height, room)),
		style: { left: viewport.offsetLeft + left, top: viewport.offsetTop + edge,
			maxWidth: Math.max(0, viewport.width - 2 * EDGE), transform: side === "up" ? "translateY(-100%)" : "none" },
	};
}

/** The shared shell. Exactly one anchor seam: pass `anchorRef` (a live
 *  element ref) or `anchorTestid` (the settings section's pattern — the
 *  trigger is queried by testid at place time). */
export function MenuShell({
	anchorRef,
	anchorTestid,
	testid,
	preferredSide,
	align = "right",
	menuClass,
	children,
	focusSearch = true,
	fitVisualViewport = false,
	cap = CAP_VH,
	onClose,
	matchAnchorWidth = false,
	phoneTriggerTestid,
	closing = false,
	onClosed,
}: {
	anchorRef?: RefObject<HTMLElement | null>;
	anchorTestid?: string;
	/** The menu body's own testid (sites assert it). */
	testid: string;
	/** Which way the menu opens from the anchor when both sides fit. */
	preferredSide: MenuSide;
	/** Which anchor edge the menu's horizontal position keys off. */
	align?: MenuAlign;
	/** The menu body classes: width, border, bg, padding, text — the
	 *  shell adds position, z-index, the height cap, and scrolling. */
	menuClass: string;
	children: ReactNode;
	/** Phone Model opens on the body; search focus requires an explicit tap. */
	focusSearch?: boolean;
	/** Phone Model fits the visible area and docks there during search. */
	fitVisualViewport?: boolean;
	/** The share of the viewport the menu may take (60% by default). P3
	 *  (round 17): the phone's ⋯ menu uses all the room below its button, so
	 *  its last row is never half hidden. */
	cap?: number;
	onClose?: () => void;
	matchAnchorWidth?: boolean;
	/** The actual opener, kept visible above the phone blur and used for entrance. */
	phoneTriggerTestid?: string;
	/** Retain this shell until the synchronized phone exit has finished. */
	closing?: boolean;
	onClosed?: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const motionContentRef = useRef<HTMLDivElement>(null);
	const phoneBackdropRef = useRef<HTMLDivElement>(null);
	const [placed, setPlaced] = useState<MenuPlacement | null>(null);
	const focusedOnceRef = useRef(false);
	const entranceRef = useRef<ReturnType<typeof animatePhoneFrame> | null>(null);
	const finishExitRef = useRef<(() => void) | null>(null);
	const searchFocusedRef = useRef(false);
	const placePhoneRef = useRef<(() => void) | null>(null);
	const setSearchFocused = (focused: boolean) => {
		entranceRef.current?.cancel();
		searchFocusedRef.current = focused;
		placePhoneRef.current?.();
	};
	const pickingRef = useRef(false);
	const blurFrameRef = useRef(0);
	const finishPick = () => {
		pickingRef.current = false;
		cancelAnimationFrame(blurFrameRef.current);
		blurFrameRef.current = requestAnimationFrame(() => {
			if (!menuRef.current?.contains(document.activeElement)) setSearchFocused(false);
		});
	};
	useEffect(() => () => cancelAnimationFrame(blurFrameRef.current), []);

	// Announce open↔close for lockable surfaces (see MENU_OPEN_EVENT).
	useEffect(() => {
		window.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT));
		return () => {
			window.dispatchEvent(new CustomEvent(MENU_CLOSE_EVENT));
		};
	}, []);

	// Focus on open (owner, fix wave): the search menus land focus IN the
	// search; menus without one land it on the body (tabIndex -1 below) so
	// the arrow machine has a home. Once only — re-placements (scroll/
	// resize) must never steal focus back mid-walk. The lists' own mount
	// focus runs during the hidden measuring pass, where focus() silently
	// fails (visibility: hidden subtrees are not focusable) — this seam is
	// the one that actually lands.
	useEffect(() => {
		if (placed === null || focusedOnceRef.current) return;
		focusedOnceRef.current = true;
		const el = menuRef.current;
		if (!el) return;
		const input = focusSearch ? el.querySelector<HTMLElement>("input") : null;
		(input ?? el).focus({ preventScroll: true });
	}, [placed, focusSearch]);

	useLayoutEffect(() => {
		if (!PHONE_MOTION || !fitVisualViewport || !placed || !phoneTriggerTestid || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const menu = menuRef.current;
		const content = motionContentRef.current;
		const backdrop = phoneBackdropRef.current;
		if (!menu || !content || !backdrop) return;
		const motion = animatePhoneFrame(menu, content, backdrop);
		entranceRef.current = motion;
		void motion.finished.then(motion.cancel, () => {});
		// A newly loaded catalog must keep its natural size, not a stale measured
		// loading-card height. Like viewport/focus changes, new content ends entry.
		const contentSize = () => Array.from(content.children, child => child.scrollHeight).join(",");
		const openingContentSize = contentSize();
		const observer = new MutationObserver(() => { if (contentSize() !== openingContentSize) motion.cancel(); });
		observer.observe(content, { childList: true, characterData: true, subtree: true });
		return () => { observer.disconnect(); motion.cancel(); entranceRef.current = null; };
	}, [placed, fitVisualViewport, phoneTriggerTestid]);

	useLayoutEffect(() => {
		if (!closing || !onClosed) return;
		const menu = menuRef.current, content = motionContentRef.current, backdrop = phoneBackdropRef.current;
		if (!PHONE_MOTION || !fitVisualViewport || !placed || !menu || !content || !backdrop || matchMedia("(prefers-reduced-motion: reduce)").matches) {
			onClosed();
			return;
		}
		const fromHeight = entranceRef.current?.active ? entranceRef.current.visibleHeight : menu.getBoundingClientRect().height;
		const fromBlur = getComputedStyle(backdrop).backdropFilter;
		entranceRef.current?.cancel();
		const motion = animatePhoneFrame(menu, content, backdrop, true, fromHeight, fromBlur);
		let active = true;
		const finish = () => { if (active) { active = false; onClosed(); } };
		finishExitRef.current = finish;
		void motion.finished.then(finish, () => {});
		// Keep Escape owned by the departing card, not the lesson underneath.
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			active = false;
			finishExitRef.current = null;
			motion.cancel();
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [closing, onClosed, fitVisualViewport, placed, phoneTriggerTestid]);

	// The standard arrow machine for menus WITHOUT a search (owner: when a
	// dropdown is expanded, the arrow keys cycle the options and never
	// scroll the screen): ArrowDown/Up move DOM focus among the option
	// buttons with WRAP, Home/End hit the ends; Enter activates the
	// focused button natively. Search menus own their arrows inside the
	// input (their clamped-walk machine, 2026-09-17) — those events never
	// bubble here, and the input/textarea guard is belt-and-braces.
	const onBodyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		const { key } = e;
		if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
		const buttons = Array.from(
			menuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
		);
		if (buttons.length === 0) return;
		e.preventDefault();
		if (key === "Home") {
			buttons[0]?.focus();
			return;
		}
		if (key === "End") {
			buttons[buttons.length - 1]?.focus();
			return;
		}
		const delta = key === "ArrowDown" ? 1 : -1;
		const idx = buttons.findIndex((b) => b === document.activeElement);
		// From the body (nothing focused yet): ArrowDown enters at the FIRST
		// option, ArrowUp at the last — the native-select convention.
		const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx;
		const next = (base + delta + buttons.length) % buttons.length;
		buttons[next]?.focus();
	};

	const anchor = () => {
		if (anchorRef) return anchorRef.current;
		if (anchorTestid !== undefined) return document.querySelector(`[data-testid="${anchorTestid}"]`);
		return null;
	};

	// Measure + (re)place: on mount, then on every capture-phase scroll and
	// resize (rAF-throttled). scrollHeight keeps the flip decision honest
	// after the content changes shape (a search filtering the list).
	useLayoutEffect(() => {
		let raf = 0;
		const viewport = window.visualViewport;
		if (fitVisualViewport) {
			const menu = menuRef.current!;
			const input = menu.querySelector<HTMLInputElement>("input");
			const footer = menu.querySelector<HTMLElement>("[data-model-menu-footer]");
			const dismiss = menu.querySelector<HTMLButtonElement>("[data-testid='model-hide-keyboard']");
			let expandedHeight = Math.max(viewport?.height ?? innerHeight, innerHeight);
			let keyboardHeight = expandedHeight;
			let keyboardBottom = expandedHeight;
			let layoutWidth = innerWidth;
			let hadSearch = false;
			let shown = false;
			let signature = "";
			let viewportSignature = "";
			const inputHeight = input?.getBoundingClientRect().height ?? 0;
			const footerHeight = footer?.getBoundingClientRect().height ?? 0;
			const footerCss = footer ? getComputedStyle(footer) : null;
			const footerMargin = parseFloat(footerCss?.marginTop ?? "0");
			const footerPadding = parseFloat(footerCss?.paddingTop ?? "0");
			const footerBorder = parseFloat(footerCss?.borderTopWidth ?? "0");
			const place = () => {
				const trigger = anchor();
				if (!trigger || (viewport && viewport.scale !== 1)) return;
				const height = viewport?.height ?? innerHeight, width = viewport?.width ?? innerWidth;
				const offsetTop = viewport?.offsetTop ?? 0, offsetLeft = viewport?.offsetLeft ?? 0;
				const nextViewport = [height, width, offsetTop, offsetLeft].join(",");
				if (finishExitRef.current) {
					// Preserve the inherited viewport-interruption rule: release both
					// effects together rather than animating against keyboard motion.
					if (viewportSignature && nextViewport !== viewportSignature) finishExitRef.current();
					return;
				}
				if (viewportSignature && nextViewport !== viewportSignature) entranceRef.current?.cancel();
				viewportSignature = nextViewport;
				if (entranceRef.current?.active) return;
				if (innerWidth !== layoutWidth) { layoutWidth = innerWidth; expandedHeight = Math.max(height, innerHeight); keyboardHeight = expandedHeight; }
				expandedHeight = Math.max(expandedHeight, height);
				if (searchFocusedRef.current) { hadSearch = true; keyboardHeight = height; keyboardBottom = offsetTop + height; }
				// Keep the search layout through blur; the keyboard's actual visible
				// area, rather than a second focus-driven layout, owns its release.
				const progress = hadSearch && keyboardHeight < expandedHeight
					? Math.max(0, Math.min(1, (expandedHeight - height) / (expandedHeight - keyboardHeight))) : 0;
				const rect = trigger.getBoundingClientRect();
				const nextSignature = [height, width, offsetTop, offsetLeft, progress, rect.top, rect.bottom, rect.left, rect.right, menu.scrollHeight].join(",");
				if (nextSignature === signature) return;
				signature = nextSignature;
				// A card hanging DOWN from a top opener (the phone's More, round 13)
				// keeps its place under it; its height follows the visible area, so
				// the keyboard shortens it from below. Search docking is for cards
				// that rise from the composer.
				const dockSearch = !!input && preferredSide !== "down";
				const p = computeVisibleMenuPlacement(rect, { width, height, offsetTop, offsetLeft }, menu.scrollHeight, matchAnchorWidth ? rect.width : menu.getBoundingClientRect().width, preferredSide, align, dockSearch, cap);
				if (input && dockSearch) {
					// The frozen lesson's trigger has one resting position. Let the
					// keyboard push that card up, then reveal its resting position
					// again, without an early re-anchor or a late second jump.
					// The opener is frozen even if the composer keyboard was already
					// visible at entry. Its real position needs no viewport-height delta.
					const restingBottom = rect.top - GAP;
					// If the lesson froze with the composer keyboard open, its opener
					// can be above the search keyboard boundary. Dock search there, then
					// return continuously to the real opener as the keyboard dismisses.
					const searchBottom = restingBottom + Math.max(0, keyboardBottom - restingBottom) * progress;
					p.style.top = Math.min(searchBottom, offsetTop + height);
					p.maxHeight = Math.max(0, Math.min(CAP_VH * height, Number(p.style.top) - offsetTop - EDGE));
					input.style.width = `calc(100% - ${48 * progress}px)`;
					input.style.height = `${inputHeight + (44 - inputHeight) * progress}px`;
					if (footer) {
						footer.style.height = `${footerHeight * (1 - progress)}px`;
						footer.style.marginTop = `${footerMargin * (1 - progress)}px`;
						footer.style.paddingTop = `${footerPadding * (1 - progress)}px`;
						footer.style.borderTopWidth = `${footerBorder * (1 - progress)}px`;
						footer.style.overflow = "hidden";
						footer.style.opacity = String(1 - progress);
						footer.style.display = progress === 1 ? "none" : "";
					}
				}
				if (dismiss) { dismiss.style.display = progress > 0 ? "flex" : "none"; dismiss.style.opacity = String(progress); }
				if (progress > 0) menu.dataset.searchDocked = "true"; else delete menu.dataset.searchDocked;
				if (matchAnchorWidth) p.style.width = rect.width;
				for (const [key, value] of Object.entries(p.style)) menu.style.setProperty(key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), typeof value === "number" ? `${value}px` : value);
				menu.style.maxHeight = `${p.maxHeight}px`;
				if (!shown) { shown = true; setPlaced(p); }
			};
			placePhoneRef.current = place;
			place();
			// Safari may expose viewport geometry between resize notifications.
			// Read while the card is open and apply one synchronous geometry update;
			// do not queue a separate React render behind the background layout.
			const frame = () => { place(); raf = requestAnimationFrame(frame); };
			raf = requestAnimationFrame(frame);
			viewport?.addEventListener("resize", place);
			viewport?.addEventListener("scroll", place);
			window.addEventListener("resize", place);
			return () => {
				cancelAnimationFrame(raf);
				placePhoneRef.current = null;
				viewport?.removeEventListener("resize", place);
				viewport?.removeEventListener("scroll", place);
				window.removeEventListener("resize", place);
				delete menu.dataset.searchDocked;
				if (input) { input.style.removeProperty("width"); input.style.removeProperty("height"); }
				if (footer) for (const key of ["height", "margin-top", "padding-top", "border-top-width", "overflow", "opacity", "display"]) footer.style.removeProperty(key);
			};
		}
		const place = () => {
			const el = anchor();
			if (!el || !menuRef.current) return;
			const view = { width: window.innerWidth, height: window.innerHeight };
			const p = computeMenuPlacement(
				el.getBoundingClientRect(),
				view,
				menuRef.current.scrollHeight,
				preferredSide,
				align,
				cap,
			);
			setPlaced(clampMenuPlacement(p, menuRef.current.offsetWidth, view));
		};
		place();
		const rePlace = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(place);
		};
		window.addEventListener("scroll", rePlace, true);
		window.addEventListener("resize", rePlace);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", rePlace, true);
			window.removeEventListener("resize", rePlace);
		};
	}, [anchorRef, anchorTestid, preferredSide, align, fitVisualViewport, matchAnchorWidth, cap]);

	// First pass: mounted hidden at the viewport's top-left so the layout
	// effect can measure the real content height before anything is seen.
	// The menu is positioned ONCE and then only re-anchored — no flash.
	return createPortal(
		<>
		{fitVisualViewport && onClose && <PhoneMenuBackdrop onClose={() => { if (!closing) onClose(); }} triggerTestid={phoneTriggerTestid} backdropRef={phoneBackdropRef} menuRef={menuRef} />}
		<div
			ref={menuRef}
			data-testid={testid}
			data-lh-menu=""
			data-closing={closing || undefined}
			inert={closing}
			tabIndex={-1}
			onFocusCapture={(event) => {
				if (fitVisualViewport && event.target instanceof HTMLInputElement) setSearchFocused(true);
			}}
			onBlurCapture={(event) => {
				// Keep the card still while a result takes focus on pointerdown;
				// moving it before click would lose the intended model selection.
				// Safari can blur the input without focusing the tapped button.
				if (!pickingRef.current && !event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false);
			}}
			onPointerDownCapture={(event) => {
				if (fitVisualViewport && event.target instanceof Element && event.target.closest("button")) pickingRef.current = true;
			}}
			onPointerUpCapture={() => { if (pickingRef.current) finishPick(); }}
			onPointerCancel={() => { if (pickingRef.current) finishPick(); }}
			onKeyDown={onBodyKeyDown}
			style={placed === null ? { position: "fixed", left: 0, top: 0, visibility: "hidden" } : { position: "fixed", zIndex: 60, ...placed.style, maxHeight: placed.maxHeight, overflowY: "auto" }}
			// The body is the arrow machine's focus home (input-less menus
			// land focus here on open) — the focus STAYS, but the browser's
			// default blue ring around it must not draw (owner, polish
			// round). Arrow cycling moves DOM focus to the buttons, which
			// carry their own hover/highlight; the ring is pure noise.
			className={`${menuClass} lh-glass outline-none`}
		>
			<div ref={motionContentRef} style={{ display: "contents" }}>
			{fitVisualViewport && !focusSearch && (
				<button type="button" aria-label="Hide keyboard" data-testid="model-hide-keyboard"
					style={{ display: "none" }}
					className="absolute right-2 top-2 flex size-11 flex-col items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => {
						pickingRef.current = false;
						setSearchFocused(false);
						menuRef.current?.querySelector<HTMLInputElement>("input")?.blur();
						// Keep non-input focus in the open picker as this control hides.
						menuRef.current?.focus({ preventScroll: true });
					}}>
					<KeyboardIcon aria-hidden className="size-5" />
					<ChevronDownIcon aria-hidden className="size-3" />
				</button>
			)}
			{children}
			</div>
		</div>
		</>,
		document.body,
	);
}
