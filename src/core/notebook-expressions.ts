import { z } from "zod";
import type { NotebookLine } from "./contracts/notebook.ts";

export const notebookExpressionSelectionSchema = z.object({ lineId: z.string().min(1), number: z.number().int().positive(), lineSource: z.string(), text: z.string() }).strict();
export type NotebookExpressionSelection = z.infer<typeof notebookExpressionSelectionSchema>;
export interface NotebookExpression { number: number; text: string; start: number; end: number; relationAfter: string }
const relations = new Set(["=", "≈", "≠", "<", ">", "≤", "≥", "\\approx", "\\ne", "\\neq", "\\lt", "\\gt", "\\le", "\\leq", "\\ge", "\\geq"]);
const delimiters: Record<string, string> = { "\\rangle": "\\langle", "\\rvert": "\\lvert", "\\rVert": "\\lVert", "\\rbrace": "\\lbrace", "\\rfloor": "\\lfloor", "\\rceil": "\\lceil", "\\rparen": "\\lparen", "\\rbrack": "\\lbrack", "⟩": "⟨", "⌋": "⌊", "⌉": "⌈" };

/** Source-preserving addresses, not algebra. Uncertain grouping has no expression
 * map: rendering and the editor both retain whole-line addressing instead. */
export function notebookExpressions(source: string): NotebookExpression[] | null {
	const stack: string[] = [], parts: NotebookExpression[] = [];
	let start = 0;
	const part = (end: number, relationAfter: string) => parts.push({ number: parts.length + 1, text: source.slice(start, end), start, end, relationAfter });
	for (let i = 0; i < source.length;) {
		const at = i;
		let token = source[i++]!;
		if (token === "\\") {
			const command = /^[a-zA-Z]+|[^a-zA-Z]/.exec(source.slice(i))?.[0];
			if (!command) return null;
			token += command; i += command.length;
			if (["\\begin", "\\end", "\\\\", "\\def", "\\newcommand", "\\verb", "\\color", "\\displaystyle", "\\textstyle", "\\over", "\\atop", "\\choose", "\\not", "\\overset", "\\underset", "\\stackrel"].includes(token)) return null;
			if (/^\\(?:big|Big|bigg|Bigg)[lrm]?$/.test(token)) return null;
			if (token === "\\left" || token === "\\right") {
				if (token === "\\left") stack.push("left"); else if (stack.pop() !== "left") return null;
				const delimiter = /^\s*(?:\\[a-zA-Z]+|\\.|[()[\]{}.|<>])/.exec(source.slice(i));
				if (!delimiter) return null;
				i += delimiter[0].length; continue;
			}
		}
		if (token === "{") { stack.push("{"); continue; }
		if (token === "}") { if (stack.pop() !== "{") return null; continue; }
		if (token === "&") return null;
		if (token === "%") return null;
		if (!stack.length && [";", ",", "\\quad", "\\qquad"].includes(token)) return null;
		if (!stack.includes("{")) {
			if (["|", "\\vert", "\\Vert", "\\|"].includes(token)) { if (stack.at(-1) === token) stack.pop(); else stack.push(token); continue; }
			if (Object.values(delimiters).includes(token)) { stack.push(token); continue; }
			if (delimiters[token]) { if (stack.pop() !== delimiters[token]) return null; continue; }
			if (["(", "[", "\\{"].includes(token)) { stack.push(token); continue; }
			const opening = token === ")" ? "(" : token === "]" ? "[" : token === "\\}" ? "\\{" : null;
			if (opening) { if (stack.pop() !== opening) return null; continue; }
		}
		if (!stack.length && relations.has(token)) { part(at, token); start = i; }
	}
	if (stack.length) return null;
	part(source.length, "");
	return parts;
}

export function notebookExpressionMap(lines: readonly NotebookLine[]) {
	return lines.map((line, index) => ({ lineId: line.id, lineNumber: index + 1, expressions: notebookExpressions(line.latex)?.map(({ number, text, relationAfter }) => ({ number, text, relationAfter })) ?? null }));
}
export function selectedNotebookExpression(lines: readonly NotebookLine[], selection: NotebookExpressionSelection) {
	const line = lines.find(line => line.id === selection.lineId);
	if (!line || line.latex !== selection.lineSource) return false;
	return notebookExpressions(line.latex)?.find(part => part.number === selection.number)?.text === selection.text;
}
