"use client";

import { useEffect, useRef } from "react";

/**
 * One menu open at a time, everywhere (owner, round 11): opening any menu
 * (Settings, Extract files, the model and thinking menus, Usage, the
 * notebook ⋯) closes whichever other one was open.
 */
const EVENT = "lh:menu-opened";

export function useOneMenu(id: string, open: boolean, close: () => void): void {
	const closeRef = useRef(close);
	closeRef.current = close;
	useEffect(() => {
		if (!open) return;
		// The window's own event constructor (test DOMs bring their own).
		const Ctor = (window as unknown as { CustomEvent?: typeof CustomEvent }).CustomEvent ?? CustomEvent;
		window.dispatchEvent(new Ctor(EVENT, { detail: id }));
		const onOther = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) closeRef.current(); };
		window.addEventListener(EVENT, onOther);
		return () => window.removeEventListener(EVENT, onOther);
	}, [id, open]);
}
