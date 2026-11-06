"use client";

/**
 * The tablet "Model" control (whole-app redesign): on a touch tablet the
 * model / thinking / usage row is not a permanent strip across the page —
 * one labelled button opens it as a card above the composer. The same
 * button and card serve the lesson, the graph home and a new session, so the
 * controls never change place between starting and continuing.
 *
 * The container that holds the StatsBar carries data-tablet-controls
 * ("open" | "closed"); globals.css hides or floats the bar from that.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Touch screens wider than a phone — keep in sync with globals.css. */
export const TABLET_MEDIA = "(min-width: 768px) and (pointer: coarse)";

function subscribe(update: () => void) {
	const media = typeof window.matchMedia === "function" ? window.matchMedia(TABLET_MEDIA) : null;
	media?.addEventListener?.("change", update);
	return () => media?.removeEventListener?.("change", update);
}

/** Whether this is a touch tablet (false on the server and before hydration). */
export function useTabletLayout(): boolean {
	return useSyncExternalStore(subscribe, () => typeof window.matchMedia === "function" && window.matchMedia(TABLET_MEDIA).matches, () => false);
}

/** Open state for the card: closes on Escape (unless a menu it opened is
 *  up), on a tap outside it (its own menus count as inside) and whenever
 *  `resetKey` changes. */
export function useTabletControls(resetKey?: unknown) {
	const [open, setOpen] = useState(false);
	useEffect(() => { setOpen(false); }, [resetKey]);
	useEffect(() => {
		if (!open) return;
		const inside = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-testid="stats-bar"], [data-testid="session-controls"], [data-lh-menu]');
		const onPointer = (event: PointerEvent) => { if (!inside(event.target)) setOpen(false); };
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("[data-lh-menu]")) { event.stopPropagation(); setOpen(false); } };
		document.addEventListener("pointerdown", onPointer, true);
		document.addEventListener("keydown", onKey);
		return () => { document.removeEventListener("pointerdown", onPointer, true); document.removeEventListener("keydown", onKey); };
	}, [open]);
	return [open, setOpen] as const;
}

/** The labelled button (shown only on touch tablets via globals.css). */
export function TabletModelButton({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
	return (
		<button
			type="button"
			data-testid="session-controls"
			aria-expanded={open}
			aria-label="Model and usage"
			onClick={onToggle}
			className={cn("lh-session-controls lh-no-drag hidden h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground", className)}
		>
			<SlidersHorizontalIcon className="size-4" aria-hidden />Model
		</button>
	);
}
