"use client";

import { useEffect, useState } from "react";

/** Keep in sync with the phone shell rules in globals.css. */
export const PHONE_MEDIA = "(max-width: 767px)";

/** The visual viewport shrinks for the iOS keyboard; 100dvh alone does not.
 * Leave zoomed viewports alone so pinch/pan remains native. */
export function usePhoneViewport() {
	const [phone, setPhone] = useState(false);
	useEffect(() => {
		const media = matchMedia(PHONE_MEDIA);
		const view = window.visualViewport;
		const style = document.documentElement.style;
		const clear = () => {
			style.removeProperty("--lh-phone-height");
			style.removeProperty("--lh-phone-top");
		};
		const fit = () => {
			if (!media.matches) { clear(); return; }
			if (view && view.scale !== 1) return;
			style.setProperty("--lh-phone-height", `${view?.height ?? innerHeight}px`);
			style.setProperty("--lh-phone-top", `${view?.offsetTop ?? 0}px`);
		};
		const update = () => { setPhone(media.matches); fit(); };
		let touch: { x: number; y: number } | undefined;
		const start = (event: TouchEvent) => {
			const p = event.touches.length === 1 ? event.touches[0] : undefined;
			touch = p ? { x: p.clientX, y: p.clientY } : undefined;
		};
		const move = (event: TouchEvent) => {
			if (!media.matches || !touch || event.touches.length !== 1 || (view?.scale ?? 1) !== 1 || event.defaultPrevented) return;
			const p = event.touches[0]!;
			const dx = p.clientX - touch.x, dy = p.clientY - touch.y;
			touch = { x: p.clientX, y: p.clientY };
			if (!dx && !dy) return;
			const vertical = Math.abs(dy) >= Math.abs(dx);
			// Native scrolling stays inside the nearest scrollable surface. At
			// either edge, stop the gesture from bouncing the surrounding page.
			let target = event.target instanceof Element ? event.target : null;
			while (target && target !== document.documentElement) {
				const css = getComputedStyle(target);
				const size = vertical ? target.clientHeight : target.clientWidth;
				const extent = vertical ? target.scrollHeight : target.scrollWidth;
				if (/auto|scroll/.test(vertical ? css.overflowY : css.overflowX) && extent > size) {
					const position = vertical ? target.scrollTop : target.scrollLeft;
					const delta = vertical ? dy : dx;
					if ((delta < 0 && position + size < extent - 1) || (delta > 0 && position > 0)) return;
					break;
				}
				target = target.parentElement;
			}
			if (event.cancelable) event.preventDefault();
		};
		update();
		media.addEventListener("change", update);
		view?.addEventListener("resize", fit);
		view?.addEventListener("scroll", fit);
		window.addEventListener("resize", fit);
		document.addEventListener("touchstart", start, { passive: true });
		document.addEventListener("touchmove", move, { passive: false });
		return () => {
			clear();
			media.removeEventListener("change", update);
			view?.removeEventListener("resize", fit);
			view?.removeEventListener("scroll", fit);
			window.removeEventListener("resize", fit);
			document.removeEventListener("touchstart", start);
			document.removeEventListener("touchmove", move);
		};
	}, []);
	return phone;
}
