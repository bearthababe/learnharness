"use client";

import katex from "katex";
import type { NotebookLine } from "@/src/core";

export function NotebookWorking({ lines, selectedLineId, onSelect }: {
	lines: readonly NotebookLine[];
	selectedLineId?: string | null;
	onSelect?: (id: string) => void;
}) {
	return <ol className="space-y-3" aria-label="Notebook working">
		{lines.map((line, index) => {
			let html: string | null = null;
			try { html = katex.renderToString(line.latex, { throwOnError: true, trust: false, displayMode: true }); } catch { /* Exact source is the fallback. */ }
			const content = <><span className="shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
				{html === null ? <code data-notebook-source="" className="whitespace-pre-wrap break-all">{line.latex}</code> : <span className="min-w-0 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />}</>;
			return <li key={line.id}>{onSelect ? <button type="button" aria-label={`Select line ${index + 1}`} aria-pressed={selectedLineId === line.id}
				className="flex w-full items-baseline gap-3 rounded p-2 text-left hover:bg-accent aria-pressed:bg-accent" onClick={() => onSelect(line.id)}>{content}</button>
				: <div className="flex items-baseline gap-3 p-2">{content}</div>}</li>;
		})}
	</ol>;
}
