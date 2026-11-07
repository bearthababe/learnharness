"use client";

// Corner arc selectively carried forward from c663dcecd22a. Drawing values and
// the shared Pencil release-inside activation path belong to the notebook.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDownIcon, EllipsisIcon, Undo2Icon, Redo2Icon, XIcon } from "lucide-react";
import { HANDWRITING_HIGHLIGHT_COLOUR } from "@/src/core";
import { useCanvasPalette } from "@/components/device-features";

type Tool = "pen" | "highlighter" | "eraser";
export type ToolHandlers = (name: string, action: () => void) => Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onClick">;
type Props = {
	tool: Tool; colour: string; colours: readonly { name: string; value: string }[];
	sizes: readonly { name: string; value: number }[]; size: number; dimPaper: boolean;
	disabled: boolean; handlers: ToolHandlers;
	selectTool: (tool: Tool) => void; selectColour: (colour: string) => void; selectSize: (size: number) => void;
	undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; clear: () => void; togglePaper: () => void;
	/** Finger drawing opt-in (phones have no stylus). Optional for callers. */
	fingerDraw?: boolean; toggleFingerDraw?: () => void;
};
const TOOLS = [{ id: "pen", label: "Pen" }, { id: "highlighter", label: "Highlighter" }, { id: "eraser", label: "Eraser" }] as const;
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
/* The wheel names its tools (round-8 review: only the active tool was
   labelled). For the first few times the page opens, a small legend sits
   beside the wheel until "Got it"; and pressing or hovering (Pencil hover)
   any ring button shows its name in the centre. */
const LEGEND_KEY = "lh:hint:wheel-legend";
const LEGEND_SHOWS = 3;
function useWheelLegend(active: boolean) {
	const [shown, setShown] = useState(false);
	const counted = useRef(false);
	useEffect(() => {
		if (!active || counted.current) return;
		counted.current = true;
		try {
			const seen = Number(window.localStorage.getItem(LEGEND_KEY) ?? "0") || 0;
			if (seen < LEGEND_SHOWS) { window.localStorage.setItem(LEGEND_KEY, String(seen + 1)); setShown(true); }
		} catch { setShown(true); }
	}, [active]);
	// Never in the way of the pen: the first stroke (or any press outside
	// the wheel) puts the legend away for this visit.
	useEffect(() => {
		if (!shown) return;
		const away = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest(".hw-wheel"))) setShown(false); };
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [shown]);
	const dismiss = () => { setShown(false); try { window.localStorage.setItem(LEGEND_KEY, "99"); } catch { /* storage blocked */ } };
	return [shown, dismiss, () => setShown(true)] as const;
}
function WheelLegend({ colour, dim, onDismiss }: { colour: string; dim: boolean; onDismiss: () => void }) {
	const row = "flex items-center gap-2.5";
	return <div className="hw-wheelLegend" data-testid="wheel-legend">
		<p className="hw-wheelLegendTitle">Your tools</p>
		<ul>
			{TOOLS.map(tool => <li key={tool.id} className={row}><ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : colour} dim={dim} />{tool.label}</li>)}
			<li className={row}><Undo2Icon size={17} aria-hidden /><span>Undo</span><Redo2Icon size={17} aria-hidden className="ml-1" /><span>Redo</span></li>
			<li className={row}><span className="hw-wheelLegendInk" aria-hidden />Centre: size and colour</li>
		</ul>
		<p className="hw-wheelLegendHint">Press and hold a tool to see its name.</p>
		<button type="button" className="hw-wheelLegendDone" onClick={onDismiss}>Got it</button>
	</div>;
}
export function HandwritingToolbar(p: Props) {
	const [expanded, setExpanded] = useState(false), [pageOpen, setPageOpen] = useState(false);
	const palette = useCanvasPalette();
	const [legend, dismissLegend, showLegend] = useWheelLegend(palette === "wheel");
	const [preview, setPreview] = useState<string | null>(null);
	const previewFrom = (event: ReactPointerEvent) => {
		const name = (event.target as Element | null)?.closest?.("[data-wheel-name]")?.getAttribute("data-wheel-name");
		if (name) setPreview(name);
	};
	const label = TOOLS.find(t => t.id === p.tool)!.label;
	const activeInk = p.tool === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.tool === "eraser" ? "var(--muted-foreground)" : p.colour;
	const pickTool = (tool: Tool) => { p.selectTool(tool); setExpanded(p.tool !== tool || !expanded); };
	// The Page menu (whole-app redesign): plain states — the paper is "Dimmed"
	// or "White", Clear says it can be undone.
	const pageActions = <div className="hw-pageActions">
		<button type="button" className="hw-pageTrigger" aria-label="Page options" aria-expanded={pageOpen} disabled={p.disabled} {...p.handlers("Page options", () => setPageOpen(v => !v))}><EllipsisIcon size={20} /><span>Page</span></button>
		{pageOpen && <div className="hw-pageMenu" role="group" aria-label="Page actions">
			<button type="button" aria-pressed={p.dimPaper} data-testid="notebook-paper-mode" {...p.handlers("Dim paper", () => { p.togglePaper(); setPageOpen(false); })}>Paper<span>{p.dimPaper ? "Dimmed" : "White"}</span></button>
			{p.toggleFingerDraw && <button type="button" aria-pressed={!!p.fingerDraw} data-testid="notebook-finger-draw" {...p.handlers("Draw with finger", () => { p.toggleFingerDraw!(); setPageOpen(false); })}>Draw with finger<span>{p.fingerDraw ? "On" : "Off"}</span></button>}
			<button type="button" aria-label="Clear" {...p.handlers("Clear", () => { p.clear(); setPageOpen(false); })}>Clear page<span>You can undo it</span></button>
			{palette === "wheel" && <button type="button" data-testid="wheel-names" {...p.handlers("Tool names", () => { setPageOpen(false); showLegend(); })}>Tool names<span>Show the legend</span></button>}
		</div>}
	</div>;
	const inspector = expanded && <div className={palette === "wheel" ? "hw-arcInspector hw-wheelInspector" : "hw-arcInspector"}>
		<div className="hw-inspectorTitle"><span>{label}</span><button type="button" aria-label="Close tool settings" {...p.handlers("Close tool settings", () => setExpanded(false))}><XIcon size={16} /></button></div>
		<div role="group" aria-label={`${label} size`} className="hw-sizes">{p.sizes.map((item, index) => <button key={`${p.tool}-${item.name}`} type="button" className="hw-sizeChoice" aria-label={`${item.name} ${p.tool}`} aria-pressed={p.size === item.value} disabled={p.disabled}
			{...p.handlers(`${item.name} ${p.tool}`, () => { p.selectSize(item.value); setExpanded(false); })}>
			<span className="hw-sizeMark" style={{ width: p.tool === "pen" ? 20 : 7 + index * 5, height: p.tool === "pen" ? 1.5 + index * 2 : 7 + index * 5 }} /><span>{item.name}</span>
		</button>)}</div>
		{p.tool === "pen" && <><div className="hw-sectionLabel">Ink</div><div role="group" aria-label="Pen colour" className="hw-colours">{p.colours.map(item => <button key={item.name} type="button" className="hw-colourChoice" aria-label={`${item.name} pen`} aria-pressed={p.colour === item.value} disabled={p.disabled}
			{...p.handlers(`${item.name} pen`, () => { p.selectColour(item.value); setExpanded(false); })}><span style={{ backgroundColor: item.value, filter: p.dimPaper ? "var(--lh-dim-paper-filter)" : undefined }} /></button>)}</div></>}
		<p>Tap the active tool to adjust.</p>
	</div>;
	const undo = <button type="button" className="hw-iconButton" aria-label="Undo" title="Undo" data-wheel-name="Undo" disabled={p.disabled || !p.canUndo} {...p.handlers("Undo", p.undo)}><Undo2Icon size={19} /></button>;
	const redo = <button type="button" className="hw-iconButton" aria-label="Redo" title="Redo" data-wheel-name="Redo" disabled={p.disabled || !p.canRedo} {...p.handlers("Redo", p.redo)}><Redo2Icon size={19} /></button>;
	if (palette === "wheel") {
		// The tool wheel (owner amendment 2; after the Concepts wheel): one
		// compact disc docked in the paper's upper-right corner — the three
		// tools on its ring, Undo/Redo on its left, the current ink and tool
		// in the middle (tap it, or the active tool, for size and colour).
		return <div className="hw-overlay" role="toolbar" aria-label="Writing tools" data-testid="notebook-toolbar" data-variant="wheel">
			{pageActions}
			<div className="hw-wheel" onPointerDownCapture={previewFrom} onPointerOver={previewFrom}
				onPointerUpCapture={() => setPreview(null)} onPointerCancelCapture={() => setPreview(null)} onPointerLeave={() => setPreview(null)}>
				<div className="hw-wheelRing" aria-hidden="true" />
				{TOOLS.map(tool => <button key={tool.id} type="button" className={`hw-wheelTool hw-wheel_${tool.id}`} aria-label={tool.label} title={tool.label} data-wheel-name={tool.label} aria-pressed={p.tool === tool.id} disabled={p.disabled}
					{...p.handlers(tool.label, () => pickTool(tool.id))}>
					<ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} />
				</button>)}
				<div className="hw-wheelUndo">{undo}</div>
				<div className="hw-wheelRedo">{redo}</div>
				<button type="button" className="hw-wheelCenter" aria-label="Tool size and colour" aria-expanded={expanded} disabled={p.disabled} {...p.handlers("Tool size and colour", () => setExpanded(v => !v))}>
					<span className="hw-wheelInk" style={{ background: activeInk, filter: p.dimPaper && p.tool === "pen" ? "var(--lh-dim-paper-filter)" : undefined }} />
					<span className="hw-wheelLabel" data-preview={preview ? "" : undefined}>{preview ?? label}{!preview && <ChevronDownIcon aria-hidden className="hw-wheelChevron" />}</span>
				</button>
				{inspector}
				{legend && !expanded && <WheelLegend colour={p.colour} dim={p.dimPaper} onDismiss={dismissLegend} />}
			</div>
		</div>;
	}
	return <div className="hw-overlay" role="toolbar" aria-label="Writing tools" data-testid="notebook-toolbar" data-variant="arc">
		{pageActions}
		<div className="hw-arc">
			<svg className="hw-arcTrack" viewBox="0 0 112 260" aria-hidden="true"><path d="M98 22C-7 58-7 193 98 235" /></svg>
			{TOOLS.map(tool => <button key={tool.id} type="button" className={`hw-toolButton hw-arc_${tool.id}`} aria-label={tool.label} aria-pressed={p.tool === tool.id} disabled={p.disabled}
				{...p.handlers(tool.label, () => pickTool(tool.id))}>
				<ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} /><span className="hw-toolName">{tool.label}</span>
			</button>)}
			<div className="hw-arcUndo">{undo}{redo}</div>
			{inspector}
		</div>
	</div>;
}
