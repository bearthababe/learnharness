import assert from "node:assert/strict";
import fs from "node:fs";
import { after, test } from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { notebookExpressions, notebookExpressionMap, type NotebookExpressionSelection } from "../src/core/notebook-expressions.ts";
import { createNotebookSession } from "../components/notebook-session.ts";

const dir = fs.mkdtempSync("/tmp/opencode/notebook-expressions-");
process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
const { chatStore } = await import("../src/store/chats.ts");
const { createNotebookService } = await import("../src/server/notebook.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("numbered expressions preserve source across relations, grouping, fractions and unfinished slots", () => {
	for (const [source, expected] of [
		[String.raw`p = \frac{F}{A} = \frac{600}{0.005} = \frac{600 \times 5}{1000}`, ["p ", String.raw` \frac{F}{A} `, String.raw` \frac{600}{0.005} `, String.raw` \frac{600 \times 5}{1000}`]],
		[String.raw`x < y \leq z ≈ q \neq r ≥ s > t`, ["x ", " y ", " z ", " q ", " r ", " s ", " t"]],
		[String.raw`f(x=2) = \frac{x=3}{y} = \left(a=b\right) = \text{x=y}`, ["f(x=2) ", String.raw` \frac{x=3}{y} `, String.raw` \left(a=b\right) `, String.raw` \text{x=y}`]],
		["2+2 = 5 =", ["2+2 ", " 5 ", ""]],
		["x", ["x"]],
		[String.raw`\langle a=b\rangle = \lvert x=y\rvert`, [String.raw`\langle a=b\rangle `, String.raw` \lvert x=y\rvert`]],
	] as const) {
		const parts = notebookExpressions(source)!;
		assert.deepEqual(parts.map(p => p.text), expected);
		assert.equal(parts.map(p => p.text + p.relationAfter).join(""), source);
		assert.deepEqual(parts.map(p => p.number), expected.map((_, i) => i + 1));
	}
	for (const source of [String.raw`x=\frac{1}{`, String.raw`\left(x=2`, "x=(y=2", String.raw`\begin{aligned}x&=2\end{aligned}`, String.raw`\verb|a=b|=c`, "x=1; y=2", String.raw`a \over b=c`, String.raw`x \not= y`, "x % = y", String.raw`\langle x=y`]) assert.equal(notebookExpressions(source), null);
	assert.deepEqual(notebookExpressionMap([{ id: "L7", latex: "a=b" }, { id: "L9", latex: "c=d" }]).map(line => [line.lineNumber, line.expressions?.map(p => p.number)]), [[1, [1, 2]], [2, [1, 2]]]);
});

async function fixture() {
	const chat = chatStore.createChat("Expression selection"); const faux = createFauxCore({});
	const prompts: string[] = [];
	faux.setResponses([
		() => fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [
			{ op: "insert", id: "L1", after: null, latex: "p = F/A = 2+2" }, { op: "insert", id: "L2", after: "L1", latex: "F = p A" },
		] })),
		context => { prompts.push(String(context.messages[0]!.content)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L2","latex":"F = (F/A) A"}]}'); },
		context => { prompts.push(String(context.messages[0]!.content)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p = F/A"}]}'); },
	]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: faux.getModel(), streamFn: faux.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.dispatch({ type: "draft", text: "Seed working" });
	await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
	return { chat, prompts, service, session };
}
const promptContext = (prompt: string) => JSON.parse(prompt.split("\n\nCURRENT NOTEBOOK AND CONTEXT\n\n")[1]!.split("\n\nNOTEBOOK HISTORY")[0]!);

test("clicked Apply sends the same expression addresses as the view and clears selection only when its line changes", async () => {
	const { chat, prompts, service, session } = await fixture();
	try {
		session.selectExpression("L1", 2);
		const selected = session.getSnapshot().expressionSelection!;
		await session.dispatch({ type: "draft", text: "Substitute this for p on line two" }); await session.dispatch({ type: "apply", cursorLineId: "L1" });
		await service.settled(chat.id); await session.refresh();
		assert.deepEqual(promptContext(prompts[0]!).expressionSelection, selected);
		assert.deepEqual(promptContext(prompts[0]!).expressionMap, notebookExpressionMap([{ id: "L1", latex: selected.lineSource }, { id: "L2", latex: "F = p A" }]));
		assert.deepEqual(session.getSnapshot().expressionSelection, selected, "Editing another line retains the selected source");
		await session.dispatch({ type: "draft", text: "Remove expression three on line one" }); await session.dispatch({ type: "apply" }); await service.settled(chat.id); await session.refresh();
		assert.equal(session.getSnapshot().expressionSelection, null); assert.equal(session.getSnapshot().cursorLineId, "L1");
		assert.deepEqual(notebookExpressions(session.getSnapshot().view!.lines[0]!.latex)?.map(p => p.number), [1, 2]);
		session.selectExpression("L1", 2); session.selectLine("L2"); assert.equal(session.getSnapshot().expressionSelection, null);
	} finally { session.dispose(); }
});

test("speech Apply freezes expression selection before late finalization and rejects changing an accepted selection", async () => {
	const { chat, prompts, service, session } = await fixture();
	try {
		await session.speech.choose({ kind: "notebook" }); session.selectExpression("L1", 2);
		const selected = session.getSnapshot().expressionSelection!;
		const capture = await session.speech.begin({ id: "selection-speech", now: () => 1 });
		assert.equal(session.speech.apply(), true);
		session.selectExpression("L1", 3);
		capture.final({ id: "late", text: "Substitute this for p on line two", start: 0, end: 1.1, words: [{ text: "Substitute this for p on line two", start: 0, end: .9 }], speechFinal: true });
		await capture.end("stop"); await session.speech.idle(); await session.idle(); await service.settled(chat.id); await session.refresh();
		assert.deepEqual(promptContext(prompts[0]!).expressionSelection, selected);
		const op = chatStore.getChat(chat.id)!.notebook!.operations.at(-1)!;
		assert.deepEqual(op.expressionSelection, selected);
		const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "apply", id: op.id, contextId: op.contextId, draftRevision: 0, instruction: op.instruction, speech: op.speech, candidate: op.candidate, expressionSelection: { ...selected, number: 3 } }) }), chat.id);
		assert.equal(response.status, 409);
	} finally { session.dispose(); }
});

test("a stale or forged expression address is refused before accepting work", async () => {
	const { chat, service, session, prompts } = await fixture();
	try {
		await session.dispatch({ type: "draft", text: "Copy this" });
		const view = service.view(chat.id);
		for (const selection of [
			{ lineId: "L1", number: 2, lineSource: "older working", text: " F/A " },
			{ lineId: "L1", number: 2, lineSource: view.lines[0]!.latex, text: "invented" },
		] satisfies NotebookExpressionSelection[]) {
			const response = await service.handle(new Request("http://test/notebook", { method: "POST", body: JSON.stringify({ type: "apply", id: crypto.randomUUID(), contextId: view.contextId, draftRevision: view.draft.revision, instruction: view.draft.text, expressionSelection: selection }) }), chat.id);
			assert.equal(response.status, 409);
		}
		assert.equal(prompts.length, 0); assert.equal(service.view(chat.id).draft.text, "Copy this");
	} finally { session.dispose(); }
});
