"use client";

import Link from "next/link";
import { HomeIcon } from "lucide-react";

/**
 * Where you are, and the way back (owner O4, round 12). Every screen's bar
 * starts with the same two places: Sessions (the list) and Home (the graph,
 * where every session starts). On Home itself the Home chip is the current
 * place; on the Ideas overlay it closes the overlay, back to the graph.
 */
export function HomeButton({ current = false, onReturn }: { current?: boolean; onReturn?: () => void }) {
	return (
		<Link
			href="/"
			data-testid="nav-home"
			aria-current={current ? "page" : undefined}
			data-current={current || undefined}
			className="lh-nav-chip lh-no-drag"
			onClick={(event) => {
				if (onReturn) { event.preventDefault(); onReturn(); }
			}}
		>
			<HomeIcon aria-hidden />
			<span className="lh-nav-chip-label">Home</span>
		</Link>
	);
}
