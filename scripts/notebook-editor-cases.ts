import type { NotebookHistoryEntry, NotebookLine, NotebookEditorInput } from "../src/agent/notebook-editor.ts";
import { cases } from "../docs/research/conversational-math-eval/cases.mjs";

export interface EditorCase {
	id: string;
	title: string;
	initial: NotebookLine[];
	notebookHistory?: NotebookHistoryEntry[];
	steps: Array<Pick<NotebookEditorInput, "instruction" | "selection" | "cursorLineId"> & {
		action?: string;
		expected: NotebookLine[] | null;
		changed: string[];
	}>;
}

const line = (id: string, latex: string): NotebookLine => ({ id, latex });
const multi = [line("L1", "a=1"), line("L2", "b=2"), line("L3", "c=3"), line("L4", "d=4"), line("L5", String.raw`p=\frac{F}{A};\quad q=\frac{V}{t}`)];
const pressure = { id: "pressure", lines: multi };
const velocity = { id: "velocity", lines: [line("L1", "v=d/t"), line("L2", "x=vt")] };
const longSheet = Array.from({ length: 100 }, (_, i) => line(`L${i + 1}`, `x_{${i + 1}}=${i + 1}`));
longSheet[0] = line("L1", "2+2=5");
longSheet[1] = line("L2", String.raw`\frac{a}{`);
longSheet[49] = line("L50", String.raw`p=\frac{F}{A}`);
const changedLong = longSheet.map((item) => item.id === "L50" ? line("L50", String.raw`p=\frac{F}{2A}`) : item);
const extended: EditorCase[] = [
	{
		id: "11-whole-line-vs-equation", title: "Target a whole multi-equation line, then one equation", initial: multi,
		steps: [
			{ instruction: "Copy the whole of line five onto a new line at the end.", expected: [...multi, line("L6", String.raw`p=\frac{F}{A};\quad q=\frac{V}{t}`)], changed: ["L6"] },
			{ instruction: "On line six, change only the denominator of equation two to 5. Leave equation one alone.", expected: [...multi, line("L6", String.raw`p=\frac{F}{A};\quad q=\frac{V}{5}`)], changed: ["L6"] },
		],
	},
	{
		id: "12-history-whole-line", title: "Copy a whole historical line", initial: [line("L1", "2+2=5")], notebookHistory: [pressure],
		steps: [{ instruction: "From the pressure history entry, copy the whole of line five to a new line after my current line one.", expected: [line("L1", "2+2=5"), line("L2", String.raw`p=\frac{F}{A};\quad q=\frac{V}{t}`)], changed: ["L2"] }],
	},
	{
		id: "13-history-one-equation", title: "Copy only one historical equation", initial: [], notebookHistory: [pressure],
		steps: [{ instruction: "Copy only equation two on line five of pressure history into a new first line.", expected: [line("L1", String.raw`q=\frac{V}{t}`)], changed: ["L1"] }],
	},
	{
		id: "14-history-clarification", title: "Disambiguate the history entry and continue", initial: [], notebookHistory: [pressure, velocity],
		steps: [
			{ instruction: "Copy line one from history into a new first line.", expected: null, changed: [], action: "question" },
			{ instruction: "The velocity entry.", expected: [line("L1", "v=d/t")], changed: ["L1"] },
		],
	},
	{
		id: "15-long-notebook", title: "Edit and undo amid 100 lines with wrong and unfinished work", initial: longSheet,
		steps: [
			{ instruction: "On line fifty change the denominator to twice A. Leave all other lines alone.", expected: changedLong, changed: ["L50"] },
			{ instruction: "Add a final line: z equals, with the right side unfinished.", expected: [...changedLong, line("L101", "z=")], changed: ["L101"] },
			{ instruction: "Undo only the new unfinished line.", expected: changedLong, changed: ["L101"], action: "undo" },
		],
	},
	{
		id: "16-many-history-entries", title: "Retrieve specified working among ten saved entries", initial: [line("L1", "p=")],
		notebookHistory: Array.from({ length: 10 }, (_, i) => ({ id: `entry-${i + 1}`, lines: [line("L1", `a=${i + 1}`), line("L2", `b=${i + 11}`)] })),
		steps: [
			{ instruction: "Replace my current first line with line two from history entry-8.", expected: [line("L1", "b=18")], changed: ["L1"] },
			{ instruction: "On that line change b to beta, using the Greek letter. Keep its value unchanged.", expected: [line("L1", String.raw`\beta=18`)], changed: ["L1"] },
		],
	},
	{
		id: "17-missing-history", title: "Do not invent absent historical source", initial: [line("L1", "p=")], notebookHistory: [velocity],
		steps: [{ instruction: "Copy line five from the pressure entry in history onto a new last line.", expected: null, changed: [], action: "question" }],
	},
	{
		id: "18-continuing-equality", title: "Continue an equality without removing earlier expressions", initial: [line("L1", String.raw`p = \frac{F}{A}`), line("L2", "F = p \\times A")],
		steps: [
			{ instruction: "On line one, set the equation equal to 600 over", expected: [line("L1", String.raw`p = \frac{F}{A} = \frac{600}{}`), line("L2", "F = p \\times A")], changed: ["L1"] },
			{ instruction: "Set the denominator of that new fraction to 0.003.", expected: [line("L1", String.raw`p = \frac{F}{A} = \frac{600}{0.003}`), line("L2", "F = p \\times A")], changed: ["L1"] },
			{ instruction: "So that... Set that equal to sick... 600 times three divided", expected: [line("L1", String.raw`p = \frac{F}{A} = \frac{600}{0.003} = 600 \times 3 \div`), line("L2", "F = p \\times A")], changed: ["L1"] },
			{ instruction: "Replace that unfinished last expression with 200000.", expected: [line("L1", String.raw`p = \frac{F}{A} = \frac{600}{0.003} = 200000`), line("L2", "F = p \\times A")], changed: ["L1"] },
		],
	},
];

// The 17 frozen turns stay unchanged. Expected source is never passed to the editor.
export const editorCases: EditorCase[] = [...cases, ...extended];
