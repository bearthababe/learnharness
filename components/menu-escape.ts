import { useEffect, useRef } from "react";

const owners: symbol[] = [];

/** Notebook and snapshot menus can overlap without moving typing focus.
 * Opening order owns Escape; rerenders must not reorder the open menus. */
export function useMenuEscape(surface: string | null, close: () => void) {
	const latest = useRef(close); latest.current = close;
	useEffect(() => {
		if (surface === null) return;
		const owner = Symbol(surface); owners.push(owner);
		const dismiss = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || owners.at(-1) !== owner || document.querySelector("dialog[open]")) return;
			event.preventDefault(); event.stopImmediatePropagation(); latest.current();
		};
		document.addEventListener("keydown", dismiss, true);
		return () => { owners.splice(owners.indexOf(owner), 1); document.removeEventListener("keydown", dismiss, true); };
	}, [surface]);
}
