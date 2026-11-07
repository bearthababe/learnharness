"use client";

// Corner arc selectively carried forward from c663dcecd22a. Drawing values and
// the shared Pencil release-inside activation path belong to the notebook.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { EllipsisIcon, Minimize2Icon, Undo2Icon, Redo2Icon, XIcon } from "lucide-react";
import { HANDWRITING_HIGHLIGHT_COLOUR } from "@/src/core";

type Tool = "pen" | "highlighter" | "eraser";
export type ToolHandlers = (name: string, action: () => void) => Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onClick">;
type Props = {
	tool: Tool; colour: string; colours: readonly { name: string; value: string }[];
	sizes: readonly { name: string; value: number }[]; size: number; dimPaper: boolean;
	disabled: boolean; handlers: ToolHandlers;
	selectTool: (tool: Tool) => void; selectColour: (colour: string) => void; selectSize: (size: number) => void;
	undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; clear: () => void; togglePaper: () => void;
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
	const [expanded, setExpanded] = useState(false), [pageOpen, setPageOpen] = useState(false);
	const label = TOOLS.find(t => t.id === p.tool)!.label;
	const variant = p.variant ?? "wheel";
	// The wheel can fold down to its hub (remembered on this device), so the
	// paper is all page; the hub keeps showing the current ink and unfolds it.
	const [folded, setFolded] = useState(false);
	useEffect(() => { try { setFolded(window.localStorage.getItem(FOLD_KEY) === "1"); } catch { /* default open */ } }, []);
	// Every ring control carries its name (round 11), so there is no
	// first-sight legend over the page and no pop-out name to wait for.
	// The page menu closes on Escape or any press outside it (Pages,
	// Expand, Attach, the paper).
	useEffect(() => {
		if (!pageOpen) return;
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPageOpen(false); } };
		const onDown = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest(".hw-pageActions"))) setPageOpen(false); };
		document.addEventListener("keydown", onKey, true);
		document.addEventListener("pointerdown", onDown, true);
		return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
	}, [pageOpen]);
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
	const isFolded = variant === "wheel" && folded;
	const current = p.sizes.find(item => item.value === p.size)?.name;
	const hubTitle = isFoldedTitle(variant, folded) ? "Show writing tools" : `${label}${current ? ` · ${current}` : ""} — size and ink`;
	return <div className="hw-overlay" role="toolbar" aria-label="Writing tools" data-testid="notebook-toolbar" data-variant={variant}>
		<div className="hw-pageActions">
			<button type="button" className="hw-pageTrigger" aria-label="Page options" aria-expanded={pageOpen} disabled={p.disabled} {...p.handlers("Page options", () => setPageOpen(v => !v))}><EllipsisIcon size={20} /><span>Page</span></button>
			{pageOpen && <div className="hw-pageMenu" role="group" aria-label="Page actions">
				<button type="button" aria-pressed={p.dimPaper} data-testid="notebook-paper-mode" {...p.handlers("Dim paper", () => { p.togglePaper(); setPageOpen(false); })}>{p.dimPaper ? "Dim paper" : "White paper"}<span>{p.dimPaper ? "On" : "Off"}</span></button>
				<button type="button" aria-label="Clear" {...p.handlers("Clear", () => { p.clear(); setPageOpen(false); })}>Clear page<span>Undoable</span></button>
			</div>}
		</div>
		<div className="hw-arc" data-folded={isFolded || undefined}>
			<svg className="hw-arcTrack" viewBox="0 0 112 260" aria-hidden="true"><path d="M98 22C-7 58-7 193 98 235" /></svg>
			{TOOLS.map(tool => <button key={tool.id} type="button" data-ring-tool={tool.id} className={`hw-toolButton hw-arc_${tool.id}`} aria-label={tool.label} title={tool.label} aria-pressed={p.tool === tool.id} disabled={p.disabled}
				{...p.handlers(tool.label, () => { p.selectTool(tool.id); setExpanded(variant === "wheel" ? false : p.tool !== tool.id || !expanded); })}>
				<ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} /><span className="hw-toolName">{tool.label}</span>
				{variant === "wheel" && <span className="hw-ringLabel" aria-hidden="true">{tool.short}</span>}
			</button>)}
			{variant === "wheel" && <button type="button" className="hw-wheelHub" title={hubTitle} aria-label={isFolded ? "Show writing tools" : "Tool settings"} aria-expanded={isFolded ? false : expanded} disabled={p.disabled} {...p.handlers(isFolded ? "Show writing tools" : "Tool settings", () => { if (isFolded) fold(false); else setExpanded(v => !v); })}>
				<span className="hw-wheelSwatch" style={{ backgroundColor: p.tool === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.tool === "eraser" ? "transparent" : p.colour, filter: p.dimPaper ? "var(--lh-dim-paper-filter)" : undefined }} data-tool={p.tool} />
				{/* The ring names the tools; the hub says the current size (R6). */}
				<span className="hw-wheelSize">{current ?? TOOLS.find(t => t.id === p.tool)!.short}</span>
			</button>}
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
