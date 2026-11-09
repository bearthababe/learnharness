"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NotebookPenIcon, PaperclipIcon } from "lucide-react";
import { MenuShell } from "@/components/menu-shell";
import { useOneMenu } from "@/components/one-menu";
import { useCardDismiss } from "@/components/card-dismiss";

export type NotebookKind = "handwriting" | "equations";
type Kind = { open: boolean; toggle: () => void };

const DEFAULT_KEY = "lh:notebook-default";
const listeners = new Set<() => void>();
/** Which notebook the button opens when both are switched on (Settings
 *  asks, round 14 T1). Unset: tablets write by hand, phones type maths. */
export function readNotebookDefault(): NotebookKind {
	try {
		const raw = window.localStorage.getItem(DEFAULT_KEY);
		if (raw === "handwriting" || raw === "equations") return raw;
	} catch { /* storage blocked */ }
	return typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px) and (pointer: coarse)").matches ? "handwriting" : "equations";
}
export function setNotebookDefault(kind: NotebookKind) {
	try { window.localStorage.setItem(DEFAULT_KEY, kind); } catch { /* this view only */ }
	for (const listener of listeners) listener();
}
export function useNotebookDefault(): NotebookKind {
	return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, readNotebookDefault, () => "equations");
}

export const NOTEBOOK_NAMES: Record<NotebookKind, { name: string; detail: string }> = {
	handwriting: { name: "Handwriting", detail: "Write and draw on pages with a pen or finger" },
	equations: { name: "Equations", detail: "Say or type an instruction; the working is laid out for you" },
};

const LONG_PRESS_MS = 450;

/**
 * The one "Notebook" button (round 14, owner T1): the handwriting canvas
 * and the equation notebook share one name. With one switched on it opens
 * that one. With both on, a tap opens the default and a long press (or a
 * right-click, or ↓ on the keyboard) offers both; a small mark on the
 * button says there is a choice. Each kind keeps its own hooks: equations
 * the notebook-owner toggle, handwriting `open-notebook`.
 */
export function NotebookOpener({ equations, handwriting, workingAttached = false }: {
	equations?: Kind;
	handwriting?: Kind;
	workingAttached?: boolean;
}) {
	const preferred = useNotebookDefault();
	const both = !!equations && !!handwriting;
	const kind: NotebookKind | null = both ? preferred : equations ? "equations" : handwriting ? "handwriting" : null;
	const [choosing, setChoosing] = useState(false);
	useOneMenu("notebook-chooser", choosing, () => setChoosing(false));
	useCardDismiss(choosing, () => setChoosing(false), ['[data-testid="notebook-chooser"]', ".lh-notebook-toggle"]);
	const button = useRef<HTMLButtonElement>(null);
	const press = useRef<{ timer: number; long: boolean } | null>(null);
	useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);
	if (!kind) return null;
	const target = kind === "equations" ? equations! : handwriting!;
	const open = (equations?.open ?? false) || (handwriting?.open ?? false);
	const label = (target.open ? "Close notebook" : "Open notebook");
	const hooks = kind === "equations"
		? { "data-input-owner": "notebook", "data-notebook-view-control": "", "aria-expanded": target.open }
		: { "data-testid": "open-notebook", "aria-pressed": target.open };
	const startPress = () => {
		if (!both) return;
		const timer = window.setTimeout(() => { if (press.current) press.current.long = true; setChoosing(true); }, LONG_PRESS_MS);
		press.current = { timer, long: false };
	};
	const endPress = () => { if (press.current) window.clearTimeout(press.current.timer); };
	let chooser: ReactNode = null;
	if (both && choosing) chooser = (
		<MenuShell anchorRef={button} testid="notebook-chooser" preferredSide="down" align="right" onClose={() => setChoosing(false)}
			menuClass="lh-page-menu lh-glass w-72 rounded-xl border bg-card p-1.5 shadow-xl">
			<div role="menu" aria-label="Choose a notebook">
				{(["handwriting", "equations"] as const).map((option) => {
					const item = option === "equations" ? equations! : handwriting!;
					return (
						<button key={option} type="button" role="menuitem" className="lh-page-menu-row lh-notebook-choice" data-testid={`notebook-open-${option}`}
							onClick={() => { setChoosing(false); item.toggle(); }}>
							<span className="lh-notebook-choice-text">
								<span className="lh-page-menu-label">{NOTEBOOK_NAMES[option].name}{option === preferred ? " · default" : ""}</span>
								<span className="lh-notebook-choice-detail">{item.open ? "Open now — tap to close" : NOTEBOOK_NAMES[option].detail}</span>
							</span>
						</button>
					);
				})}
			</div>
		</MenuShell>
	);
	return (
		<span className="lh-notebook-opener inline-flex shrink-0 items-center">
			<button
				ref={button}
				type="button"
				{...hooks}
				aria-label={label}
				title={both ? `${label} (${NOTEBOOK_NAMES[kind].name}) — press and hold to choose` : label}
				aria-haspopup={both ? "menu" : undefined}
				aria-description={both ? `Opens ${NOTEBOOK_NAMES[kind].name}. Press and hold, or press the down arrow, to choose Handwriting or Equations.` : undefined}
				data-open={open || undefined}
				data-choice={both || undefined}
				className="lh-notebook-toggle lh-no-drag pointer-events-auto inline-flex shrink-0 items-center justify-center text-muted-foreground"
				onPointerDown={startPress}
				onPointerUp={endPress}
				onPointerLeave={endPress}
				onPointerCancel={endPress}
				onContextMenu={(event) => { if (!both) return; event.preventDefault(); setChoosing(true); }}
				onKeyDown={(event) => { if (both && (event.key === "ArrowDown" || (event.key === "F10" && event.shiftKey))) { event.preventDefault(); setChoosing(true); } }}
				onClick={(event) => {
					if (press.current?.long) { press.current = null; event.preventDefault(); return; }
					press.current = null;
					target.toggle();
				}}
			>
				<NotebookPenIcon className="size-4" aria-hidden />
				<span className="lh-notebook-toggle-label" aria-hidden>Notebook</span>
				{both && <span className="lh-notebook-choice-mark" aria-hidden />}
			</button>
			{workingAttached && <span role="img" aria-label="Working attached" title="Working attached" className="text-muted-foreground"><PaperclipIcon className="size-3" aria-hidden="true" /></span>}
			{chooser}
		</span>
	);
}
