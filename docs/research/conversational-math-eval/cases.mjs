// Expected results are used locally by the scorer, never sent to the model.
const line = (id, latex) => ({ id, latex });
const step = (instruction, expected, changed = [], extra = {}) => ({ instruction, expected, changed, ...extra });

export const cases = [
	{
		id: "01-denominator-and-undo", title: "Change a denominator, then undo",
		initial: [line("L1", String.raw`p = \frac{F}{A}`)],
		steps: [
			step("Change the denominator to twice the area.", [line("L1", String.raw`p = \frac{F}{2A}`)], ["L1"]),
			step("Actually, undo that.", [line("L1", String.raw`p = \frac{F}{A}`)], ["L1"], { action: "undo" }),
		],
	},
	{
		id: "02-selected-sum", title: "Wrap the selected sum, then edit the fraction",
		initial: [line("L1", "x + 1"), line("L2", "y = 7")],
		steps: [
			step("Put all of that over rho.", [line("L1", String.raw`\frac{x + 1}{\rho}`), line("L2", "y = 7")], ["L1"], { selection: { lineId: "L1", text: "x + 1" } }),
			step("No, change the denominator to five.", [line("L1", String.raw`\frac{x + 1}{5}`), line("L2", "y = 7")], ["L1"]),
		],
	},
	{
		id: "03-two-denominators", title: "Ask which fraction, then use the answer",
		initial: [line("L1", String.raw`p = \frac{F}{A}`), line("L2", String.raw`q = \frac{V}{t}`)],
		steps: [
			step("Change the denominator to five.", null, [], { action: "question" }),
			step("The flow equation, q.", [line("L1", String.raw`p = \frac{F}{A}`), line("L2", String.raw`q = \frac{V}{5}`)], ["L2"]),
		],
	},
	{
		id: "04-previous-line", title: "Use the cursor to identify the previous line",
		initial: [line("L1", String.raw`p = \frac{F}{A}`), line("L2", String.raw`q = \frac{V}{t}`), line("L3", "W = Fd")],
		steps: [step("On the previous line, change t to two t.", [line("L1", String.raw`p = \frac{F}{A}`), line("L2", String.raw`q = \frac{V}{2t}`), line("L3", "W = Fd")], ["L2"], { cursorLineId: "L3" })],
	},
	{
		id: "05-create-and-continue", title: "Add unfinished working and continue it",
		initial: [],
		steps: [
			step("New line: lowercase p equals. Leave the right side blank for now.", [line("L1", "p =")], ["L1"]),
			step("On that line, put F over A after the equals sign.", [line("L1", String.raw`p = \frac{F}{A}`)], ["L1"]),
		],
	},
	{
		id: "06-preserve-wrong-and-partial", title: "Keep mistakes and broken source when adding a line",
		initial: [line("L1", "2 + 2 = 5"), line("L2", String.raw`\frac{a}{`)],
		steps: [step("Add a new line at the end: W equals F times d, written as W = Fd. Leave the existing working alone.", [line("L1", "2 + 2 = 5"), line("L2", String.raw`\frac{a}{`), line("L3", "W = Fd")], ["L3"])],
	},
	{
		id: "07-correct-the-last-edit", title: "Correct a change and undo only the correction",
		initial: [line("L1", String.raw`p = \frac{F}{A}`)],
		steps: [
			step("Replace F with m times g.", [line("L1", String.raw`p = \frac{mg}{A}`)], ["L1"]),
			step("No, make the whole right-hand side rho times g times h instead.", [line("L1", String.raw`p = \rho gh`)], ["L1"]),
			step("Undo just that last change.", [line("L1", String.raw`p = \frac{mg}{A}`)], ["L1"], { action: "undo" }),
		],
	},
	{
		id: "08-repeated-text", title: "Target the last of two identical equations",
		initial: [line("L1", String.raw`p = \frac{F}{A}`), line("L2", "x = 2"), line("L3", String.raw`p = \frac{F}{A}`)],
		steps: [step("On the last line only, change A to twice A.", [line("L1", String.raw`p = \frac{F}{A}`), line("L2", "x = 2"), line("L3", String.raw`p = \frac{F}{2A}`)], ["L3"])],
	},
	{
		id: "09-ambiguous-that", title: "Ask what 'that' refers to, then wrap the intended line",
		initial: [line("L1", "x + y"), line("L2", "a + b")],
		steps: [
			step("Put that over rho.", null, [], { action: "question" }),
			step("I mean the whole first line.", [line("L1", String.raw`\frac{x + y}{\rho}`), line("L2", "a + b")], ["L1"]),
		],
	},
	{
		id: "10-case-units-and-no-solving", title: "Keep unit case and an incorrect value",
		initial: [line("L1", String.raw`P = 100\,\mathrm{kPa}`), line("L2", String.raw`p = 100000\,\mathrm{Pa}`), line("L3", String.raw`1\,\mathrm{kPa} = 10\,\mathrm{Pa}`)],
		steps: [step("On the second line change only 100000 to 120000. Keep everything else exactly as I wrote it.", [line("L1", String.raw`P = 100\,\mathrm{kPa}`), line("L2", String.raw`p = 120000\,\mathrm{Pa}`), line("L3", String.raw`1\,\mathrm{kPa} = 10\,\mathrm{Pa}`)], ["L2"])],
	},
];
