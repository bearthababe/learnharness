"use client";

import { useEffect, type RefObject } from "react";

/** Focus owns only an attribute/CSS lock, never another overlay's body styles. */
export function useSessionInputViewport(rootRef: RefObject<HTMLElement | null>, enabled = true) {
	useEffect(() => {
		const root = rootRef.current;
		if (!root || !enabled) return;
		let locked = false;
		let scrollX = 0, scrollY = 0;
		let x = 0, y = 0;
		let disposed = false;
		const style = (name: string, value: string) => {
			if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
		};
		const release = () => {
			if (!locked) return;
			locked = false;
			delete root.dataset.inputFocused;
			delete root.dataset.keyboardOpen;
			document.documentElement.removeAttribute("data-session-input-locked");
			for (const prop of ["height", "top", "left", "width"]) root.style.removeProperty(`--session-viewport-${prop}`);
			window.scrollTo(scrollX, scrollY);
		};
		const sync = () => {
			if (disposed) return;
			const field = document.activeElement as HTMLElement | null;
			if (window.innerWidth >= 768 || !field || !root.contains(field) || !field.matches('textarea,input:not([type="range"]),[contenteditable="true"]')) { release(); return; }
			const pane = field.closest("[data-input-owner]")?.getAttribute("data-input-owner");
			if (pane !== "notebook" && pane !== "tutor") { release(); return; }
			if (!locked) {
				const rect = root.getBoundingClientRect();
				scrollX = window.scrollX; scrollY = window.scrollY;
				root.style.setProperty("--session-viewport-left", `${rect.left}px`);
				root.style.setProperty("--session-viewport-width", `${rect.width}px`);
				locked = true;
				document.documentElement.setAttribute("data-session-input-locked", "");
			}
			const viewport = window.visualViewport;
			if ((viewport?.scale ?? 1) !== 1) return;
			if (root.dataset.inputFocused !== pane) root.dataset.inputFocused = pane;
			const keyboard = String((viewport?.height ?? window.innerHeight) < window.innerHeight - 100);
			if (root.dataset.keyboardOpen !== keyboard) root.dataset.keyboardOpen = keyboard;
			style("--session-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
			style("--session-viewport-top", `${viewport?.offsetTop ?? 0}px`);
		};
		const blur = () => { queueMicrotask(sync); };
		const start = (event: TouchEvent) => {
			if (event.touches.length !== 1) return;
			x = event.touches[0]!.clientX; y = event.touches[0]!.clientY;
		};
		const move = (event: TouchEvent) => {
			if (!locked || event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) !== 1) return; // preserve pinch zoom
			const dx = event.touches[0]!.clientX - x, dy = event.touches[0]!.clientY - y;
			x = event.touches[0]!.clientX; y = event.touches[0]!.clientY;
			const horizontal = Math.abs(dx) > Math.abs(dy);
			// Native scrollers keep their gesture; an edge never chains to the page.
			for (let el = event.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
				if (!(el instanceof HTMLElement)) continue;
				const style = getComputedStyle(el);
				const scrollable = /auto|scroll/.test(horizontal ? style.overflowX : style.overflowY) || el.tagName === "TEXTAREA";
				if (!scrollable) continue;
				const position = horizontal ? el.scrollLeft : el.scrollTop;
				const max = horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
				if (max <= 1) continue;
				const delta = horizontal ? dx : dy;
				if (delta > 0 ? position > 0 : position < max - 1) return;
				break;
			}
			event.preventDefault();
		};
		document.addEventListener("focusin", sync);
		document.addEventListener("focusout", blur);
		document.addEventListener("touchstart", start, { passive: true });
		document.addEventListener("touchmove", move, { passive: false });
		window.addEventListener("resize", sync);
		window.visualViewport?.addEventListener("resize", sync);
		window.visualViewport?.addEventListener("scroll", sync);
		// Removing/collapsing a focused pane need not emit focusout on every browser.
		const observer = new MutationObserver(() => { if (locked) sync(); });
		observer.observe(root, { childList: true, subtree: true });
		sync();
		return () => {
			disposed = true; observer.disconnect(); release();
			document.removeEventListener("focusin", sync); document.removeEventListener("focusout", blur);
			document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move);
			window.removeEventListener("resize", sync);
			window.visualViewport?.removeEventListener("resize", sync); window.visualViewport?.removeEventListener("scroll", sync);
		};
	}, [rootRef, enabled]);
}
