"use client";

import { useEffect, type RefObject } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import { PHONE_MEDIA } from "@/components/use-phone-viewport";

/** Focus-scoped counterpart of the accepted notebook preview lock. Native
 * history/textarea scrolling stays enabled; edge gestures cannot move the page. */
export function useMobileChatFocus(rootRef: RefObject<HTMLDivElement | null>, history: RefObject<StickToBottomContext | null>) {
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const mobile = matchMedia("(pointer: coarse) and (max-width: 979px)");
		const phone = matchMedia(PHONE_MEDIA);
		let unlock: (() => void) | undefined;
		let touch: { x: number; y: number } | undefined;
		let frame = 0;
		const viewport = () => {
			const view = window.visualViewport;
			if (!unlock || (view && view.scale !== 1)) return;
			root.style.height = phone.matches ? `calc(${view?.height ?? innerHeight}px - var(--lh-safe-top) - var(--lh-safe-bottom))` : `${view?.height ?? innerHeight}px`;
			root.style.top = phone.matches ? `calc(${view?.offsetTop ?? 0}px + var(--lh-safe-top))` : `${view?.offsetTop ?? 0}px`;
		};
		const update = () => {
			const focused = document.activeElement;
			const shouldLock = mobile.matches && focused instanceof HTMLTextAreaElement && root.contains(focused);
			if (shouldLock && !unlock) {
				const x = scrollX, y = scrollY;
				const rect = root.getBoundingClientRect();
				const savedRoot = { position: root.style.position, top: root.style.top, left: root.style.left, width: root.style.width, height: root.style.height };
				const body = document.body;
				const savedBody = { position: body.style.position, top: body.style.top, width: body.style.width };
				// An existing modal owns its own body lock. Never release that lock.
				const ownBody = getComputedStyle(body).position !== "fixed";
				if (ownBody) Object.assign(body.style, { position: "fixed", top: `${-y}px`, width: "100%" });
				Object.assign(root.style, { position: "fixed", left: `${rect.left}px`, width: `${rect.width}px` });
				unlock = () => {
					Object.assign(root.style, savedRoot);
					if (ownBody && body.style.position === "fixed" && body.style.top === `${-y}px`) {
						Object.assign(body.style, savedBody);
						window.scrollTo(x, y);
					}
				};
			} else if (!shouldLock && unlock) {
				unlock();
				unlock = undefined;
			}
			viewport();
		};
		const focusOut = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
		const start = (event: TouchEvent) => {
			const point = event.touches.length === 1 ? event.touches[0] : undefined;
			touch = point ? { x: point.clientX, y: point.clientY } : undefined;
		};
		const move = (event: TouchEvent) => {
			if (!unlock || !touch || event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) !== 1) return;
			const point = event.touches[0]!;
			const dy = point.clientY - touch.y, dx = point.clientX - touch.x;
			touch = { x: point.clientX, y: point.clientY };
			const target = event.target instanceof Element ? event.target : null;
			const textarea = target?.closest("textarea");
			const scroll = history.current?.scrollRef.current;
			const allowed = textarea && root.contains(textarea) ? textarea : scroll?.contains(target) ? scroll : null;
			if (!allowed || (Math.abs(dy) >= Math.abs(dx) && (
				allowed.scrollHeight <= allowed.clientHeight ||
				(dy > 0 && allowed.scrollTop <= 0) ||
				(dy < 0 && allowed.scrollTop + allowed.clientHeight >= allowed.scrollHeight - 1)
			))) event.preventDefault();
		};
		root.addEventListener("focusin", update);
		root.addEventListener("focusout", focusOut);
		mobile.addEventListener("change", update);
		phone.addEventListener("change", update);
		window.visualViewport?.addEventListener("resize", viewport);
		window.visualViewport?.addEventListener("scroll", viewport);
		document.addEventListener("touchstart", start, { passive: true });
		document.addEventListener("touchmove", move, { passive: false });
		update();
		return () => {
			cancelAnimationFrame(frame);
			unlock?.();
			root.removeEventListener("focusin", update);
			root.removeEventListener("focusout", focusOut);
			mobile.removeEventListener("change", update);
			phone.removeEventListener("change", update);
			window.visualViewport?.removeEventListener("resize", viewport);
			window.visualViewport?.removeEventListener("scroll", viewport);
			document.removeEventListener("touchstart", start);
			document.removeEventListener("touchmove", move);
		};
	}, [rootRef, history]);
}
