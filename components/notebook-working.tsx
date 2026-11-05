"use client";

import katex from "katex";
import { notebookExpressions, type NotebookExpressionSelection, type NotebookLine } from "@/src/core";

export function NotebookWorking({ lines, selectedLineId, expressionSelection, onSelect, onSelectExpression }: {
	lines: readonly NotebookLine[];
	selectedLineId?: string | null;
	onSelect?: (id: string) => void;
	expressionSelection?: NotebookExpressionSelection | null;
	onSelectExpression?: (lineId: string, number: number) => void;
}) {
	return <ol className="space-y-3" aria-label="Notebook working">
		{lines.map((line, index) => {
			const expressions = notebookExpressions(line.latex);
			const rendered = expressions?.map(part => {
				let expression: string | null = null;
				try { expression = katex.renderToString(part.text, { throwOnError: true, trust: false, displayMode: true }); } catch { /* Retain exact source and the shared address. */ }
				return { expression, relation: part.relationAfter ? katex.renderToString(part.relationAfter, { throwOnError: true, trust: false }) : "" };
			});
			if (expressions && rendered) return <li key={line.id} className="notebook-working-line flex min-w-0 items-center gap-2">
				{onSelect ? <button type="button" aria-label={`Select line ${index + 1}`} aria-pressed={selectedLineId === line.id && !expressionSelection} className="min-h-11 shrink-0 rounded px-2 text-xs text-muted-foreground hover:bg-accent aria-pressed:bg-accent" onClick={() => onSelect(line.id)}>{index + 1}.</button>
					: <span className="shrink-0 px-2 text-xs text-muted-foreground">{index + 1}.</span>}
				<span className="flex min-w-0 items-center overflow-x-auto py-1">{expressions.map((part, i) => {
					const html = rendered[i]!.expression;
					const content = <><span className="notebook-expression-number" aria-hidden="true">{part.number}</span>{html === null ? <code data-notebook-source="" className="whitespace-pre-wrap">{part.text}</code> : <span dangerouslySetInnerHTML={{ __html: html }} />}{!part.text.trim() && <span className="sr-only">Empty expression</span>}</>;
					return <span key={part.number} className="inline-flex shrink-0 items-center">
						{onSelectExpression ? <button type="button" className="notebook-expression rounded hover:bg-accent aria-pressed:bg-accent" aria-label={`Select expression ${part.number} on line ${index + 1}`} aria-pressed={expressionSelection?.lineId === line.id && expressionSelection.number === part.number} onClick={() => onSelectExpression(line.id, part.number)}>{content}</button>
							: <span className="notebook-expression" aria-label={`Expression ${part.number} on line ${index + 1}`}>{content}</span>}
						{part.relationAfter && <span className="notebook-relation px-1" dangerouslySetInnerHTML={{ __html: rendered[i]!.relation }} />}
					</span>;
				})}</span>
			</li>;
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
