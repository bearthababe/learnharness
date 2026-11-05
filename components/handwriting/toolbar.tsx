"use client";

// Corner arc selectively carried forward from c663dcecd22a. Drawing values and
// the shared Pencil release-inside activation path belong to the notebook.
import { useState, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { EllipsisIcon, Undo2Icon, Redo2Icon, XIcon } from "lucide-react";
import { HANDWRITING_HIGHLIGHT_COLOUR } from "@/src/core";

type Tool = "pen" | "highlighter" | "eraser";
export type ToolHandlers = (name: string, action: () => void) => Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onClick">;
type Props = {
	tool: Tool; colour: string; colours: readonly { name: string; value: string }[];
	sizes: readonly { name: string; value: number }[]; size: number; dimPaper: boolean;
	disabled: boolean; handlers: ToolHandlers;
	selectTool: (tool: Tool) => void; selectColour: (colour: string) => void; selectSize: (size: number) => void;
	undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; clear: () => void; togglePaper: () => void;
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
export function HandwritingToolbar(p: Props) {
	const [expanded, setExpanded] = useState(false), [pageOpen, setPageOpen] = useState(false);
	const label = TOOLS.find(t => t.id === p.tool)!.label;
	return <div className="hw-overlay" role="toolbar" aria-label="Writing tools" data-testid="notebook-toolbar" data-variant="arc">
		<div className="hw-pageActions">
			<button type="button" className="hw-pageTrigger" aria-label="Page options" aria-expanded={pageOpen} disabled={p.disabled} {...p.handlers("Page options", () => setPageOpen(v => !v))}><EllipsisIcon size={20} /><span>Page</span></button>
			{pageOpen && <div className="hw-pageMenu" role="group" aria-label="Page actions">
				<button type="button" aria-pressed={p.dimPaper} data-testid="notebook-paper-mode" {...p.handlers("Dim paper", () => { p.togglePaper(); setPageOpen(false); })}>{p.dimPaper ? "Dim paper" : "White paper"}<span>{p.dimPaper ? "On" : "Off"}</span></button>
				<button type="button" aria-label="Clear" {...p.handlers("Clear", () => { p.clear(); setPageOpen(false); })}>Clear page<span>Undoable</span></button>
			</div>}
		</div>
		<div className="hw-arc">
			<svg className="hw-arcTrack" viewBox="0 0 112 260" aria-hidden="true"><path d="M98 22C-7 58-7 193 98 235" /></svg>
			{TOOLS.map(tool => <button key={tool.id} type="button" className={`hw-toolButton hw-arc_${tool.id}`} aria-label={tool.label} aria-pressed={p.tool === tool.id} disabled={p.disabled}
				{...p.handlers(tool.label, () => { p.selectTool(tool.id); setExpanded(p.tool !== tool.id || !expanded); })}>
				<ToolGlyph tool={tool.id} colour={tool.id === "highlighter" ? HANDWRITING_HIGHLIGHT_COLOUR : p.colour} dim={p.dimPaper} /><span className="hw-toolName">{tool.label}</span>
			</button>)}
			<div className="hw-arcUndo"><button type="button" className="hw-iconButton" aria-label="Undo" title="Undo" disabled={p.disabled || !p.canUndo} {...p.handlers("Undo", p.undo)}><Undo2Icon size={19} /></button><button type="button" className="hw-iconButton" aria-label="Redo" title="Redo" disabled={p.disabled || !p.canRedo} {...p.handlers("Redo", p.redo)}><Redo2Icon size={19} /></button></div>
			{expanded && <div className="hw-arcInspector">
				<div className="hw-inspectorTitle"><span>{label}</span><button type="button" aria-label="Close tool settings" {...p.handlers("Close tool settings", () => setExpanded(false))}><XIcon size={16} /></button></div>
				<div role="group" aria-label={`${label} size`} className="hw-sizes">{p.sizes.map((item, index) => <button key={`${p.tool}-${item.name}`} type="button" className="hw-sizeChoice" aria-label={`${item.name} ${p.tool}`} aria-pressed={p.size === item.value} disabled={p.disabled}
					{...p.handlers(`${item.name} ${p.tool}`, () => { p.selectSize(item.value); setExpanded(false); })}>
					<span className="hw-sizeMark" style={{ width: p.tool === "pen" ? 20 : 7 + index * 5, height: p.tool === "pen" ? 1.5 + index * 2 : 7 + index * 5 }} /><span>{item.name}</span>
				</button>)}</div>
				{p.tool === "pen" && <><div className="hw-sectionLabel">Ink</div><div role="group" aria-label="Pen colour" className="hw-colours">{p.colours.map(item => <button key={item.name} type="button" className="hw-colourChoice" aria-label={`${item.name} pen`} aria-pressed={p.colour === item.value} disabled={p.disabled}
					{...p.handlers(`${item.name} pen`, () => { p.selectColour(item.value); setExpanded(false); })}><span style={{ backgroundColor: item.value, filter: p.dimPaper ? "var(--lh-dim-paper-filter)" : undefined }} /></button>)}</div></>}
				<p>Tap the active tool to adjust.</p>
			</div>}
		</div>
	</div>;
}
