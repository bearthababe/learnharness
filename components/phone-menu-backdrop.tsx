"use client";

import { useLayoutEffect } from "react";
import { fitPhoneViewport } from "@/components/use-phone-viewport";

let owners = 0;
let restore: (() => void) | undefined;

/** Portaled cards stay interactive while the lesson holds its opening geometry.
 * Count ownership so overlapping menus cannot release another menu's backdrop
 * lock. Preserve any existing inertness and inline sizing on cleanup. */
export function PhoneMenuBackdrop({ onClose }: { onClose: () => void }) {
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
	return <div data-testid="phone-menu-backdrop" aria-hidden="true"
		className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
		onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} />;
}
