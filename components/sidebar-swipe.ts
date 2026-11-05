export interface SidebarSwipe {
	startX: number;
	startY: number;
	width: number;
	distance: number;
	phase: "candidate" | "dragging" | "rejected";
}

export function startSidebarSwipe(clientX: number, clientY: number, width: number): SidebarSwipe | null {
	return clientX >= 32 && clientX <= 80 && width > 0
		? { startX: clientX, startY: clientY, width, distance: 0, phase: "candidate" }
		: null;
}

export function moveSidebarSwipe(swipe: SidebarSwipe, clientX: number, clientY: number): SidebarSwipe {
	if (swipe.phase === "rejected") return swipe;
	const horizontal = clientX - swipe.startX;
	const vertical = Math.abs(clientY - swipe.startY);
	let phase: SidebarSwipe["phase"] = swipe.phase;
	if (phase === "candidate") {
		if (horizontal >= 10 && horizontal >= 1.5 * vertical) phase = "dragging";
		else if (horizontal <= -10 || (vertical >= 10 && vertical >= Math.abs(horizontal))) phase = "rejected";
	}
	return { ...swipe, phase, distance: phase === "dragging" ? Math.max(0, Math.min(swipe.width, horizontal)) : 0 };
}

export function completesSidebarSwipe(swipe: SidebarSwipe): boolean {
	return swipe.phase === "dragging" && swipe.distance >= swipe.width / 2;
}

export function sidebarSwipePointer(event: PointerEvent): "candidate" | "consumed" | null {
	if (event.pointerType !== "touch" || !(event.target instanceof Element)) return null;
	const root = event.target.closest<HTMLElement>("[data-sessions-swipe-pointer]");
	if (root?.dataset.sessionsSwipePointer !== String(event.pointerId)) return null;
	return root.dataset.sessionsSwipeConsumed === "true" ? "consumed" : "candidate";
}

export function bindSidebarSwipe(panel: HTMLElement, open: () => void): () => void {
	const root = panel.closest<HTMLElement>(".lh-app-shell")!;
	let swipe: SidebarSwipe | null = null;
	let touchId: number | null = null;
	let graphStart = false;
	let suppressClick = false;
	let settling: ReturnType<typeof setTimeout> | undefined;
	const clearPreview = () => {
		clearTimeout(settling);
		settling = undefined;
		delete root.dataset.sessionsSwipe;
		root.style.removeProperty("--lh-sessions-swipe-distance");
	};
	const clearPointer = () => {
		delete root.dataset.sessionsSwipePointer;
		delete root.dataset.sessionsSwipeConsumed;
	};
	const consume = () => {
		root.dataset.sessionsSwipeConsumed = "true";
		suppressClick = true;
	};
	const settle = (commit: boolean) => {
		void panel.getBoundingClientRect();
		root.dataset.sessionsSwipe = "settling";
		root.style.setProperty("--lh-sessions-swipe-distance", `${commit ? swipe!.width : 0}px`);
		settling = setTimeout(clearPreview, 200);
		if (commit) open();
	};
	const cancel = () => {
		if (swipe) {
			consume();
			if (swipe.phase === "dragging") settle(false);
		}
		swipe = null;
		touchId = null;
	};
	const eligible = (target: Element) => {
		if (!target.closest(".lh-app-main") || target.closest("input, textarea, select, button, a, [role=button], [contenteditable]:not([contenteditable=false]), [role=slider]")) return false;
		if (document.querySelector('[aria-modal="true"], dialog[open]') || window.getSelection()?.isCollapsed === false) return false;
		for (let element: Element | null = target; element && element !== root; element = element.parentElement) {
			if (element.scrollWidth > element.clientWidth && /auto|scroll/.test(getComputedStyle(element).overflowX)) return false;
		}
		return true;
	};
	const pointerDown = (event: PointerEvent) => {
		if (event.pointerType !== "touch") { suppressClick = false; return; }
		if (!event.isPrimary) { cancel(); return; }
		clearPointer();
		suppressClick = false;
		if (settling || panel.getAttribute("aria-hidden") !== "true" || (window.visualViewport?.scale ?? 1) !== 1 || !(event.target instanceof Element) || !eligible(event.target)) return;
		swipe = startSidebarSwipe(event.clientX, event.clientY, root.clientWidth);
		if (!swipe) return;
		root.dataset.sessionsSwipePointer = String(event.pointerId);
		graphStart = event.target instanceof HTMLCanvasElement;
	};
	const touchStart = (event: TouchEvent) => {
		if (event.touches.length !== 1) { cancel(); return; }
		if (!swipe) return;
		touchId = event.touches[0]!.identifier;
		if (graphStart) event.stopPropagation();
	};
	const touchMove = (event: TouchEvent) => {
		if (!swipe) return;
		if (event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) !== 1 || window.getSelection()?.isCollapsed === false) { cancel(); return; }
		const touch = Array.from(event.touches).find(point => point.identifier === touchId);
		if (!touch) { cancel(); return; }
		swipe = moveSidebarSwipe(swipe, touch.clientX, touch.clientY);
		if (swipe.phase === "dragging") {
			consume();
			root.dataset.sessionsSwipe = "dragging";
			root.style.setProperty("--lh-sessions-swipe-distance", `${swipe.distance}px`);
			if (event.cancelable) event.preventDefault();
			event.stopPropagation();
		} else if (graphStart) {
			if (swipe.phase === "rejected") consume();
			event.stopPropagation();
		}
	};
	const touchEnd = (event: TouchEvent) => {
		if (swipe && event.touches.length === 0) {
			const released = Array.from(event.changedTouches).find(point => point.identifier === touchId);
			if (released) swipe = moveSidebarSwipe(swipe, released.clientX, released.clientY);
			else cancel();
			if (swipe?.phase === "dragging") {
				consume();
				if (event.cancelable) event.preventDefault();
				event.stopPropagation();
				settle(completesSidebarSwipe(swipe));
			}
			swipe = null;
			touchId = null;
		}
		if (event.touches.length === 0) clearPointer();
	};
	const touchCancel = () => { cancel(); clearPointer(); };
	const interrupt = () => { cancel(); clearPreview(); };
	const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
	const click = (event: MouseEvent) => {
		if (!suppressClick || !event.isTrusted) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		suppressClick = false;
	};
	root.addEventListener("pointerdown", pointerDown, true);
	root.addEventListener("pointercancel", cancel, true);
	root.addEventListener("touchstart", touchStart, { capture: true, passive: true });
	root.addEventListener("touchmove", touchMove, { capture: true, passive: false });
	root.addEventListener("touchend", touchEnd, { capture: true, passive: false });
	root.addEventListener("touchcancel", touchCancel, true);
	root.addEventListener("click", click, true);
	document.addEventListener("keydown", keyDown, true);
	document.addEventListener("visibilitychange", interrupt);
	window.addEventListener("resize", interrupt);
	window.visualViewport?.addEventListener("resize", interrupt);
	return () => {
		interrupt();
		clearPointer();
		root.removeEventListener("pointerdown", pointerDown, true);
		root.removeEventListener("pointercancel", cancel, true);
		root.removeEventListener("touchstart", touchStart, true);
		root.removeEventListener("touchmove", touchMove, true);
		root.removeEventListener("touchend", touchEnd, true);
		root.removeEventListener("touchcancel", touchCancel, true);
		root.removeEventListener("click", click, true);
		document.removeEventListener("keydown", keyDown, true);
		document.removeEventListener("visibilitychange", interrupt);
		window.removeEventListener("resize", interrupt);
		window.visualViewport?.removeEventListener("resize", interrupt);
	};
}
