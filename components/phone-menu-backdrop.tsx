"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { fitPhoneViewport } from "@/components/use-phone-viewport";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";

let owners = 0;
let restore: (() => void) | undefined;

/** Portaled cards stay interactive while the lesson holds its opening geometry.
 * Count ownership so overlapping menus cannot release another menu's backdrop
 * lock. Preserve any existing inertness and inline sizing on cleanup. */
export function PhoneMenuBackdrop({ onClose, triggerTestid, backdropRef }: { onClose: () => void; triggerTestid?: string; backdropRef: RefObject<HTMLDivElement | null> }) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dismiss = useBackdropDismiss(onClose);
	useLayoutEffect(() => {
		if (owners++ === 0) {
			const shell = document.querySelector<HTMLElement>(".lh-app-shell");
			if (shell) {
				const rect = shell.getBoundingClientRect();
				const before = { height: shell.style.height, top: shell.style.top, inert: shell.inert };
				shell.style.height = `${rect.height}px`;
				shell.style.top = `${rect.top}px`;
				shell.inert = true;
				restore = () => {
					fitPhoneViewport();
					shell.style.height = before.height;
					shell.style.top = before.top;
					shell.inert = before.inert;
				};
			}
		}
		return () => { if (--owners === 0) { restore?.(); restore = undefined; } };
	}, []);
	useLayoutEffect(() => {
		if (!triggerTestid) return;
		const source = document.querySelector<HTMLElement>(`[data-testid="${triggerTestid}"]`);
		const backdrop = backdropRef.current, button = triggerRef.current;
		if (!source || !backdrop || !button) return;
		let frame = 0, previous = "";
		const place = () => {
			const r = source.getBoundingClientRect();
			const label = source.getAttribute("aria-label") ?? source.textContent ?? "";
			const signature = [r.left, r.top, r.width, r.height, label].join(",");
			if (signature !== previous) {
				previous = signature;
				// The original opener stays in the frozen lesson, visible through a
				// clear aperture. Its inert ancestor still protects the lesson; this
				// foreground target supplies only the opener's close-toggle action.
				backdrop.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.left}px ${r.top}px, ${r.left}px ${r.bottom}px, ${r.right}px ${r.bottom}px, ${r.right}px ${r.top}px, ${r.left}px ${r.top}px)`;
				Object.assign(button.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
				button.setAttribute("aria-label", label);
			}
			frame = requestAnimationFrame(place);
		};
		place();
		return () => cancelAnimationFrame(frame);
	}, [triggerTestid, backdropRef]);
	return <>
		<div ref={backdropRef} data-testid="phone-menu-backdrop" aria-hidden="true"
			className="fixed inset-0 z-50 backdrop-blur-xs"
			{...dismiss}
			onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} />
		{triggerTestid && <button ref={triggerRef} type="button" data-testid="phone-menu-trigger"
			aria-expanded="true" aria-label="Close card"
			className="fixed z-[61] rounded-full bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
			onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
			onClick={(event) => { event.stopPropagation(); onClose(); }} />}
	</>;
}
