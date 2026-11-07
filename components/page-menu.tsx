"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import { MenuShell } from "@/components/menu-shell";
import { useOneMenu } from "@/components/one-menu";

/**
 * The page menu (owner O1, round 12): on phones, Model, Reasoning and
 * Usage leave the row under the composer for one "More" menu in the page
 * bar. The controls themselves stay mounted (the send guard and keyboard
 * shortcuts read them); this menu shows their current values in full and
 * opens the same model, reasoning and Usage cards. Tablets and laptops
 * keep the row; the button is phone-only (CSS).
 */
type PageMenuState = { model: string | null; level: string | null; usage: string | null };
let state: PageMenuState = { model: null, level: null, usage: null };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** The model control and the stats bar publish what the menu shows. */
export function publishPageMenu(next: Partial<PageMenuState>) {
	const merged = { ...state, ...next };
	if (merged.model === state.model && merged.level === state.level && merged.usage === state.usage) return;
	state = merged;
	for (const listener of listeners) listener();
}

export const OPEN_THINKING_EVENT = "lh:open-thinking-picker";
export const OPEN_USAGE_EVENT = "lh:open-usage";

export function PageMenuButton() {
	const values = useSyncExternalStore(subscribe, () => state, () => state);
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	useOneMenu("page-menu", open, () => setOpen(false));
	const choose = (open: () => void) => {
		setOpen(false);
		// The chosen card opens as this menu leaves (one menu at a time).
		requestAnimationFrame(open);
	};
	const rows: { id: string; label: string; value: string; open: () => void }[] = [
		{ id: "model", label: "Model", value: values.model ?? "—", open: () => window.dispatchEvent(new CustomEvent("lh:kbd-open-model-picker")) },
		{ id: "reasoning", label: "Reasoning", value: values.level ?? "—", open: () => window.dispatchEvent(new CustomEvent(OPEN_THINKING_EVENT)) },
		...(values.usage ? [{ id: "usage", label: "Usage", value: values.usage, open: () => window.dispatchEvent(new CustomEvent(OPEN_USAGE_EVENT)) }] : []),
	];
	return (
		<>
			<button
				ref={trigger}
				type="button"
				className="lh-nav-chip lh-page-menu-button lh-no-drag"
				data-testid="page-menu-button"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<EllipsisIcon aria-hidden />
				<span className="lh-nav-chip-label">More</span>
			</button>
			{open && (
				<MenuShell anchorRef={trigger} testid="page-menu" preferredSide="down" align="right" fitVisualViewport
					phoneTriggerTestid="page-menu-button" onClose={() => setOpen(false)}
					menuClass="lh-page-menu rounded-xl border bg-card p-1.5 shadow-xl">
					<div role="menu" aria-label="Session settings">
						{rows.map((row) => (
							<button key={row.id} type="button" role="menuitem" className="lh-page-menu-row" data-testid={`page-menu-${row.id}`} onClick={() => choose(row.open)}>
								<span className="lh-page-menu-label">{row.label}</span>
								<span className="lh-page-menu-value">{row.value}</span>
								<ChevronRightIcon aria-hidden />
							</button>
						))}
					</div>
				</MenuShell>
			)}
		</>
	);
}
