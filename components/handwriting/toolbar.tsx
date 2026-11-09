"use client";

// Corner arc selectively carried forward from c663dcecd22a. Drawing values and
// the shared Pencil release-inside activation path belong to the notebook.
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { GripHorizontalIcon, Minimize2Icon, Undo2Icon, Redo2Icon, XIcon } from "lucide-react";
import { HANDWRITING_HIGHLIGHT_COLOUR } from "@/src/core";
import { useWheelLook } from "@/components/device-features";

/**
 * Where the wheel sits on the page (round 14, T2): any corner or the middle
 * of either side, chosen by dragging its grip (it snaps to the nearest
 * spot) or with the arrow keys on the grip. Remembered on this device;
 * "Reset wheel position" (notebook ⋯) puts it back. A wheel moved to the
 * left replaces the old left-handed option; an older left-handed choice
 * starts it top-left.
 */
export type WheelSpot = `${"top" | "middle" | "bottom"}-${"left" | "right"}`;
const SPOT_KEY = "lh:writing-wheel-spot";
const spotListeners = new Set<() => void>();
function readWheelSpot(): WheelSpot {
	try {
		const raw = window.localStorage.getItem(SPOT_KEY);
		if (raw && /^(top|middle|bottom)-(left|right)$/.test(raw)) return raw as WheelSpot;
		return window.localStorage.getItem("lh:writing-tools-side") === "left" ? "top-left" : "top-right";
	} catch { return "top-right"; }
}
export function setWheelSpot(spot: WheelSpot | null) {
	try {
		if (spot) window.localStorage.setItem(SPOT_KEY, spot);
		else { window.localStorage.removeItem(SPOT_KEY); window.localStorage.removeItem("lh:writing-tools-side"); }
	} catch { /* this view only */ }
	for (const listener of spotListeners) listener();
}
export function useWheelSpot(): WheelSpot {
	return useSyncExternalStore((listener) => { spotListeners.add(listener); return () => { spotListeners.delete(listener); }; }, readWheelSpot, () => "top-right");
}
const ROWS = ["top", "middle", "bottom"] as const;
/** The spot nearest a wheel centred at (x, y) on a page of this size. */
export function nearestWheelSpot(x: number, y: number, width: number, height: number): WheelSpot {
	const row = y < height / 3 ? "top" : y > (height * 2) / 3 ? "bottom" : "middle";
	return `${row}-${x < width / 2 ? "left" : "right"}`;
}

type Tool = "pen" | "highlighter" | "eraser";
export type ToolHandlers = (name: string, action: () => void) => Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onClick">;
type Props = {
	tool: Tool; colour: string; colours: readonly { name: string; value: string }[];
	sizes: readonly { name: string; value: number }[]; size: number; dimPaper: boolean;
	disabled: boolean; handlers: ToolHandlers;
	selectTool: (tool: Tool) => void; selectColour: (colour: string) => void; selectSize: (size: number) => void;
	undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
	/** Palette layout: the compact wheel (default) or the vertical arc. */
	variant?: "wheel" | "arc";
};
const TOOLS = [{ id: "pen", label: "Pen", short: "Pen" }, { id: "highlighter", label: "Highlighter", short: "Highlight" }, { id: "eraser", label: "Eraser", short: "Eraser" }] as const;
function ToolGlyph({ tool, colour, dim }: { tool: Tool; colour: string; dim: boolean }) {
	const tip: CSSProperties = { fill: colour, filter: dim ? "var(--lh-dim-paper-filter)" : undefined };
	return <svg viewBox="0 0 36 44" className="hw-toolGlyph" aria-hidden="true">
		{tool === "pen" ? <>
			<path d="M11 3h14v20l-7 17-7-17Z" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="1.4" />
			<path d="m11 23 7 17 7-17Z" style={tip} /><path d="M18 28v9M11 9h14" stroke="currentColor" strokeWidth="1.3" />
		</> : tool === "highlighter" ? <>
			<rect x="8" y="3" width="20" height="24" rx="5" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="1.4" />
			<path d="M10 27h16v7l-16 6Z" style={tip} /><path d="M8 11h20M11 27h14" stroke="currentColor" strokeWidth="1.3" />
		</> : <>
			<path d="m10 7 19 12a3 3 0 0 1 1 4l-9 14a3 3 0 0 1-4 1L4 30a3 3 0 0 1-1-4L14 9" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.4" />
			<path d="m9 18 17 11-5 8a3 3 0 0 1-4 1L4 30a3 3 0 0 1-1-4Z" fill="currentColor" fillOpacity=".7" />
		</>}
	</svg>;
}
const FOLD_KEY = "lh:writing-wheel-folded";
const isFoldedTitle = (variant: string, folded: boolean) => variant === "wheel" && folded;
export function HandwritingToolbar(p: Props) {
	const [expanded, setExpanded] = useState(false);
	const label = TOOLS.find(t => t.id === p.tool)!.label;
	const variant = p.variant ?? "wheel";
	// The wheel can fold down to a small bar (remembered on this device), so
	// the paper is all page; its button shows the current tool and unfolds it.
	const [folded, setFolded] = useState(false);
	useEffect(() => { try { setFolded(window.localStorage.getItem(FOLD_KEY) === "1"); } catch { /* default open */ } }, []);
	const spot = useWheelSpot(), look = useWheelLook();
	const arcRef = useRef<HTMLDivElement>(null), overlayRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	// R10 (round 15): the grip introduces itself once, on this device, and the
	// note goes as soon as the wheel is moved or a few seconds pass.
	const [gripHint, setGripHint] = useState(false);
	useEffect(() => {
		if (variant !== "wheel") return;
		let timer = 0;
		try {
			if (window.localStorage.getItem("lh:wheel-grip-introduced")) return;
			window.localStorage.setItem("lh:wheel-grip-introduced", "1");
		} catch { return; }
		setGripHint(true);
		timer = window.setTimeout(() => setGripHint(false), 7000);
		return () => window.clearTimeout(timer);
	}, [variant]);
	// Escape closes the tool settings (one layer at a time).
	useEffect(() => {
		if (!expanded) return;
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setExpanded(false); } };
		document.addEventListener("keydown", onKey, true);
		return () => document.removeEventListener("keydown", onKey, true);
	}, [expanded]);
	const fold = (value: boolean) => {
		setFolded(value); setExpanded(false);
		try { window.localStorage.setItem(FOLD_KEY, value ? "1" : "0"); } catch { /* this view only */ }
	};
	// The grip moves only the wheel: it holds its own pointer, so a drag
	// never reaches the paper and never makes a mark.
	const gripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (p.disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
		event.preventDefault(); event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
		setDragging(true); setExpanded(false); setGripHint(false);
	};
	const gripMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const start = drag.current; if (!start || start.id !== event.pointerId || !arcRef.current) return;
		event.preventDefault();
		arcRef.current.style.translate = `${event.clientX - start.x}px ${event.clientY - start.y}px`;
	};
	const gripEnd = (event: ReactPointerEvent<HTMLButtonElement>, keep: boolean) => {
		const start = drag.current; if (!start || start.id !== event.pointerId) return;
		drag.current = null; setDragging(false);
		const arc = arcRef.current, page = overlayRef.current;
		if (arc && page && keep) {
			const a = arc.getBoundingClientRect(), r = page.getBoundingClientRect();
			if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) setWheelSpot(nearestWheelSpot(a.left + a.width / 2 - r.left, a.top + a.height / 2 - r.top, r.width, r.height));
		}
		if (arc) arc.style.translate = "";
	};
	const gripKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		const [row, side] = spot.split("-") as [typeof ROWS[number], "left" | "right"];
		const index = ROWS.indexOf(row);
		const next: WheelSpot | null = event.key === "ArrowLeft" ? `${row}-left` : event.key === "ArrowRight" ? `${row}-right`
			: event.key === "ArrowUp" ? `${ROWS[Math.max(0, index - 1)]!}-${side}` : event.key === "ArrowDown" ? `${ROWS[Math.min(2, index + 1)]!}-${side}` : null;
		if (!next) return;
		event.preventDefault();
		if (next !== spot) setWheelSpot(next);
	};
	const isFolded = variant === "wheel" && folded;
	const current = p.sizes.find(item => item.value === p.size)?.name;
	const hubTitle = isFoldedTitle(variant, folded) ? `${label}${current ? ` · ${current}` : ""} — show writing tools` : `${label}${current ? ` · ${current}` : ""} — size and ink`;
	return <div ref={overlayRef} className="hw-overlay" role="toolbar" aria-label="Writing tools" data-testid="notebook-toolbar" data-variant={variant}
		data-spot={variant === "wheel" ? spot : undefined} data-look={variant === "wheel" ? look : undefined} data-dragging={dragging || undefined}>
		<div ref={arcRef} className="hw-arc" data-folded={isFolded || undefined}>
			<svg className="hw-arcTrack" viewBox="0 0 112 260" aria-hidden="true"><path d="M98 22C-7 58-7 193 98 235" /></svg>
			{TOOLS.map(tool => <button key={tool.id} type="button" data-ring-tool={tool.id} className={`hw-toolButton hw-arc_${tool.id}`} aria-label={tool.label} title={tool.label} aria-pressed={p.tool === tool.id} disabled={p.disabled}
				{...p.handlers(tool.label, () => { p.selectTool(tool.id); setExpanded(variant === "wheel" ? false : p.tool !== tool.id || !expanded); })}>
				<ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} /><span className="hw-toolName">{tool.label}</span>
				{variant === "wheel" && <span className="hw-ringLabel" aria-hidden="true">{tool.short}</span>}
			</button>)}
			{variant === "wheel" && <button type="button" className="hw-wheelHub" title={hubTitle} aria-label={isFolded ? "Show writing tools" : "Tool settings"} aria-expanded={isFolded ? false : expanded} disabled={p.disabled} {...p.handlers(isFolded ? "Show writing tools" : "Tool settings", () => { if (isFolded) fold(false); else setExpanded(v => !v); })}>
				{isFolded
					? <ToolGlyph tool={p.tool} colour={p.tool === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} />
					: <span className="hw-wheelSwatch" style={{ backgroundColor: p.tool === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.tool === "eraser" ? "transparent" : p.colour, filter: p.dimPaper ? "var(--lh-dim-paper-filter)" : undefined }} data-tool={p.tool} />}
				{/* The ring names the tools; the hub says the current size (R6).
				    Folded, the button names the tool it will write with. */}
				<span className="hw-wheelSize">{isFolded ? TOOLS.find(t => t.id === p.tool)!.short : current ?? TOOLS.find(t => t.id === p.tool)!.short}</span>
			</button>}
			{variant === "wheel" && <button type="button" className="hw-wheelGrip" data-testid="wheel-grip" aria-label="Move the wheel" title="Drag to move the wheel · arrow keys move it too" disabled={p.disabled}
				onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={event => gripEnd(event, true)} onPointerCancel={event => gripEnd(event, false)} onLostPointerCapture={event => gripEnd(event, true)} onKeyDown={gripKey}>
				<GripHorizontalIcon aria-hidden size={18} />
			</button>}
			{variant === "wheel" && gripHint && !isFolded && <p className="hw-gripHint" role="status" data-testid="wheel-grip-hint">Drag the handle to move the wheel to any corner or side</p>}
			<div className="hw-arcUndo"><button type="button" className="hw-iconButton" aria-label="Undo" title="Undo" disabled={p.disabled || !p.canUndo} {...p.handlers("Undo", p.undo)}><Undo2Icon size={19} />{variant === "wheel" && <span className="hw-ringLabel" aria-hidden="true">Undo</span>}</button><button type="button" className="hw-iconButton" aria-label="Redo" title="Redo" disabled={p.disabled || !p.canRedo} {...p.handlers("Redo", p.redo)}><Redo2Icon size={19} />{variant === "wheel" && <span className="hw-ringLabel" aria-hidden="true">Redo</span>}</button></div>
			{expanded && <div className="hw-arcInspector">
				<div className="hw-inspectorTitle"><span>{label}</span><button type="button" aria-label="Close tool settings" {...p.handlers("Close tool settings", () => setExpanded(false))}><XIcon size={16} /></button></div>
				{variant === "wheel" && <div role="group" aria-label="Tool" className="hw-toolNames" data-testid="wheel-tool-names">{TOOLS.map(tool => <button key={tool.id} type="button" aria-pressed={p.tool === tool.id} disabled={p.disabled}
					{...p.handlers(`${tool.label} tool`, () => p.selectTool(tool.id))}>{tool.label}</button>)}</div>}
				<div role="group" aria-label={`${label} size`} className="hw-sizes">{p.sizes.map((item, index) => <button key={`${p.tool}-${item.name}`} type="button" className="hw-sizeChoice" aria-label={`${item.name} ${p.tool}`} aria-pressed={p.size === item.value} disabled={p.disabled}
					{...p.handlers(`${item.name} ${p.tool}`, () => { p.selectSize(item.value); setExpanded(false); })}>
					<span className="hw-sizeMark" style={{ width: p.tool === "pen" ? 20 : 7 + index * 5, height: p.tool === "pen" ? 1.5 + index * 2 : 7 + index * 5 }} /><span>{item.name}</span>
				</button>)}</div>
				{p.tool === "pen" && <><div className="hw-sectionLabel">Ink</div><div role="group" aria-label="Pen colour" className="hw-colours">{p.colours.map(item => <button key={item.name} type="button" className="hw-colourChoice" aria-label={`${item.name} pen`} aria-pressed={p.colour === item.value} disabled={p.disabled}
					{...p.handlers(`${item.name} pen`, () => { p.selectColour(item.value); setExpanded(false); })}><span style={{ backgroundColor: item.value, filter: p.dimPaper ? "var(--lh-dim-paper-filter)" : undefined }} /></button>)}</div></>}
				<p>{variant === "wheel" ? "Tap the centre of the wheel to adjust." : "Tap the active tool to adjust."}</p>
				{variant === "wheel" && <button type="button" className="hw-foldWheel" data-testid="fold-wheel" {...p.handlers("Fold the wheel", () => fold(true))}><Minimize2Icon aria-hidden size={16} /><span>Fold the wheel</span></button>}
			</div>}
		</div>
	</div>;
}
