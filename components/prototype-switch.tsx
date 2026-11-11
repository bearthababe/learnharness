"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRightIcon } from "lucide-react";
import { usePrototypeView } from "@/components/device-prefs";
import { useDeviceClass } from "@/components/device-features";
import { tryoutDef, type TryoutDef, type TryoutId } from "@/components/tryout-registry";

/**
 * B18 (round 18, owner): Prototype view's in-place switch. While Prototype
 * view is on (Settings → Try-out designs), each try-out shows one small
 * developer-style switch beside the thing it changes: it names the current
 * variant, and a tap flips to the next. It floats (fixed, in a portal), so
 * it never moves the page; it sits outside its anchor, in the first nearby
 * spot with no text or control under it, so it never covers what it
 * controls. With Prototype view off, nothing renders.
 *
 * Adding a try-out: declare it in tryout-registry.ts, then place
 *   <PrototypeSwitch tryout="its-id" anchors={[{ selector: "…" }]} />
 * anywhere in the tree (the first visible anchor wins).
 */
export type ProtoPlace = "below-end" | "below-start" | "above-end" | "above-start" | "right" | "left" | "inside-end" | "inside-start" | "inside-bottom-end";
export type ProtoAnchor = { selector: string; places?: ProtoPlace[] };
const DEFAULT_PLACES: ProtoPlace[] = ["below-end", "above-end", "right", "left", "below-start", "above-start"];

export function PrototypeSwitch({ tryout, anchors }: { tryout: TryoutId; anchors: ProtoAnchor[] }) {
	const on = usePrototypeView();
	const device = useDeviceClass();
	const def = tryoutDef(tryout);
	const value = def.useValue();
	const applies = def.useApplies?.().applies ?? true;
	if (!on || device !== def.on || !applies || typeof document === "undefined") return null;
	return createPortal(<FloatingSwitch def={def} value={value} anchors={anchors} />, document.body);
}

const INTERACTIVE = "button, a, input, textarea, select, [contenteditable='true'], [role='button'], [role='switch'], img, svg, canvas, video";
/** Under (x, y): strict — bare background only; relaxed — text is allowed
 *  (a line of the lesson, say), but never a control, media or another switch. */
function freeAt(x: number, y: number, self: Element, strict: boolean): boolean {
	const hit = document.elementsFromPoint(x, y).find((e) => e !== self && !self.contains(e));
	if (!hit) return true;
	if (hit.closest("[data-prototype-switch]")) return false;
	if (hit.closest(INTERACTIVE)) return false;
	if (!strict) return true;
	for (const node of hit.childNodes) {
		if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
		const range = document.createRange(); range.selectNodeContents(node);
		for (const r of range.getClientRects()) if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return false;
	}
	return true;
}

type Spot = { left: number; top: number; inside?: boolean };
/** The anchors in view and on top (not under an open dialog or a pane). */
function anchorsInView(anchors: ProtoAnchor[]): { anchor: ProtoAnchor; el: HTMLElement }[] {
	const modal = [...document.querySelectorAll<HTMLElement>("[aria-modal='true']")].find((m) => { const r = m.getBoundingClientRect(); return m.checkVisibility?.({ visibilityProperty: true }) !== false && r.width > 0 && r.height > 0 && r.right > 1 && r.left < window.innerWidth - 1 && r.bottom > 1 && r.top < window.innerHeight - 1; });
	const out: { anchor: ProtoAnchor; el: HTMLElement }[] = [];
	for (const anchor of anchors) {
		const el = [...document.querySelectorAll<HTMLElement>(anchor.selector)].find((e) => e.getClientRects().length && e.checkVisibility?.({ visibilityProperty: true }) !== false);
		if (!el) continue;
		// Never over an open dialog the anchor is not part of (Settings, say);
		// a closed pane may keep aria-modal while it sits off screen.
		if (modal && !modal.contains(el)) continue;
		// Something full-screen over the anchor (a pane over the page bar):
		// the thing it controls is not in view, so neither is its switch.
		const ar = el.getBoundingClientRect(), probeY = ar.top + Math.min(ar.height / 2, 22);
		const covered = [0.25, 0.5, 0.75].every((f) => { const hit = document.elementsFromPoint(ar.left + ar.width * f, probeY).find((e) => !e.closest("[data-prototype-switch]")); return !!hit && !el.contains(hit) && !hit.contains(el); });
		if (!covered) out.push({ anchor, el });
	}
	return out;
}
function spotsAround(el: HTMLElement, places: ProtoPlace[], w: number, h: number): Spot[] {
	const a = el.getBoundingClientRect(), gap = 6, m = 8;
	const vw = window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight;
	const at: Record<ProtoPlace, [number, number]> = {
		"below-end": [a.right - w, a.bottom + gap], "below-start": [a.left, a.bottom + gap],
		"above-end": [a.right - w, a.top - gap - h], "above-start": [a.left, a.top - gap - h],
		"right": [a.right + gap, a.top + (a.height - h) / 2], "left": [a.left - gap - w, a.top + (a.height - h) / 2],
		"inside-end": [a.right - w - gap, a.top + gap], "inside-start": [a.left + gap, a.top + gap],
		"inside-bottom-end": [a.right - w - gap, a.bottom - h - gap],
	};
	const spots: Spot[] = [];
	for (const place of places) {
		let [left, top] = at[place];
		// Slide along its side to stay on screen (a full-width bar, say).
		if (place !== "left" && place !== "right") left = Math.min(Math.max(left, m), vw - w - m);
		if (place === "left" || place === "right" || place.startsWith("inside")) top = Math.min(Math.max(top, m), vh - h - m);
		if (left < m - 0.5 || top < m - 0.5 || left + w > vw - m + 0.5 || top + h > vh - m + 0.5) continue;
		// Outside places never overlap the anchor itself.
		if (!place.startsWith("inside") && left < a.right && left + w > a.left && top < a.bottom && top + h > a.top) continue;
		spots.push({ left: Math.round(left), top: Math.round(top), inside: place.startsWith("inside") });
	}
	return spots;
}

function FloatingSwitch({ def, value, anchors }: { def: TryoutDef; value: string; anchors: ProtoAnchor[] }) {
	const ref = useRef<HTMLButtonElement>(null);
	const [spot, setSpot] = useState<Spot | null>(null);
	const key = JSON.stringify(anchors);
	useLayoutEffect(() => {
		let frame = 0;
		const place = () => {
			frame = 0;
			const self = ref.current; if (!self) return;
			const w = self.offsetWidth, h = self.offsetHeight;
			const candidates = anchorsInView(anchors).flatMap(({ anchor, el }) => spotsAround(el, anchor.places ?? DEFAULT_PLACES, w, h));
			const clear = (s: Spot, strict: boolean) => [s.left + 2, s.left + w / 2, s.left + w - 2].every((x) => [s.top + 2, s.top + h / 2, s.top + h - 2].every((y) => freeAt(x, y, self, strict)));
			// Bare background first; else, outside what it controls, over text but
			// never a control; else hidden (it never covers what it controls).
			const found = candidates.find((s) => clear(s, true)) ?? candidates.find((s) => !s.inside && clear(s, false)) ?? null;
			const next = found && { left: found.left, top: found.top };
			setSpot((prior) => (prior?.left === next?.left && prior?.top === next?.top ? prior : next));
		};
		const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
		place();
		window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
		window.visualViewport?.addEventListener("resize", schedule);
		// Panes and cards open without a scroll or resize: look again now and then.
		const timer = window.setInterval(schedule, 400);
		return () => { if (frame) cancelAnimationFrame(frame); window.clearInterval(timer); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); };
	}, [key]); // anchors are compared by value (key)
	const index = Math.max(0, def.variants.findIndex((variant) => variant.value === value));
	const current = def.variants[index]!, next = def.variants[(index + 1) % def.variants.length]!;
	return (
		<button ref={ref} type="button" className="lh-proto-switch" data-prototype-switch="" data-testid={`proto-switch-${def.id}`} data-variant={current.value}
			aria-label={`Prototype: ${def.title} is ${current.label}. Switch to ${next.label}.`} title={`${def.title}: switch to ${next.label}`}
			style={spot ? { left: spot.left, top: spot.top } : { left: 0, top: 0, visibility: "hidden" }}
			onClick={() => def.set(next.value)}>
			<ArrowLeftRightIcon aria-hidden /><span className="lh-proto-text"><span className="lh-proto-name">{def.short}</span><span className="lh-proto-value">{current.label}</span></span>
		</button>
	);
}
