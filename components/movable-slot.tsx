"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Round 16 (R6/P3): a piece of UI that can sit in either of two places
 * without remounting. Its content renders into one stable element (a portal
 * host); the host is moved between its natural place and `to`. Moving the
 * host keeps every bit of state — the draft, the caret, the field's scroll,
 * dictation claims — because React never sees a new tree.
 */
export function MovableSlot({ to, hidden = false, owner, label, children }: {
	/** Where it sits now; null = its natural place (here). */
	to: HTMLElement | null;
	/** Kept mounted but not shown (the other mode's input). */
	hidden?: boolean;
	/** Whose input this is, for focus and speech routing. */
	owner: "tutor" | "notebook";
	/** A visible mode name at the field (the follow-the-work variant). */
	label?: string;
	children: ReactNode;
}) {
	const place = useRef<HTMLDivElement>(null);
	const [host] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
	useLayoutEffect(() => {
		if (!host) return;
		host.className = "lh-movable";
		host.dataset.inputOwner = owner;
		host.dataset.testid = `movable-${owner}`;
		const parent = to ?? place.current;
		if (parent && host.parentElement !== parent) parent.appendChild(host);
	}, [host, to, owner]);
	useLayoutEffect(() => {
		if (!host) return;
		host.hidden = hidden;
		if (label) host.dataset.label = label; else delete host.dataset.label;
	}, [host, hidden, label]);
	useLayoutEffect(() => () => { host?.remove(); }, [host]);
	return <div ref={place} className="contents">{host && createPortal(children, host)}</div>;
}
