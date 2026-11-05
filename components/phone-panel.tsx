"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

/** Full-screen phone Plan surface: native modal focus/inertness, a stationary
 * header and a frame that fits the visible viewport above the keyboard. */
export function PhonePanel({ title, testid, onClose, children }: {
	title: string;
	testid: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	const titleId = useId();
	useLayoutEffect(() => {
		const dialog = dialogRef.current!;
		const viewport = window.visualViewport;
		const previousOverflow = document.body.style.overflow;
		const fit = () => {
			// Browser pinch outside the graph remains native, including its panning.
			if (viewport && viewport.scale !== 1) return;
			dialog.style.top = `${viewport?.offsetTop ?? 0}px`;
			dialog.style.height = `${viewport?.height ?? innerHeight}px`;
			dialog.dataset.keyboard = String((viewport?.height ?? innerHeight) < document.documentElement.clientHeight - 120);
		};
		fit();
		dialog.showModal();
		document.body.style.overflow = "hidden";
		// Focus the Close control after entering the native modal top layer.
		dialog.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !dialog.contains(event.target as Node)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			closeRef.current();
		};
		document.addEventListener("keydown", key, true);
		viewport?.addEventListener("resize", fit);
		viewport?.addEventListener("scroll", fit);
		window.addEventListener("resize", fit);
		return () => {
			document.removeEventListener("keydown", key, true);
			viewport?.removeEventListener("resize", fit);
			viewport?.removeEventListener("scroll", fit);
			window.removeEventListener("resize", fit);
			dialog.close();
			document.body.style.overflow = previousOverflow;
		};
	}, []);
	return createPortal(
		<dialog ref={dialogRef} className="lh-phone-panel" aria-labelledby={titleId}
			data-testid={`${testid}-dialog`} data-lh-menu=""
			onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
			onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<section className="lh-phone-panel-frame" data-testid={testid}>
				<header className="lh-phone-panel-header">
					<h2 id={titleId}>{title}</h2>
					<button type="button" onClick={onClose} aria-label={`Close ${title}`} data-testid={`${testid}-close`}><XIcon aria-hidden className="size-5" /></button>
				</header>
				<div className="lh-phone-panel-body">{children}</div>
			</section>
		</dialog>, document.body,
	);
}
