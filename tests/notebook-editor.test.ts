import assert from "node:assert/strict";
import test from "node:test";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { runNotebookEditor, type NotebookEditorInput } from "../src/agent/notebook-editor.ts";

test("attempt accounting is checkpointed before retry, and checkpoint failure cannot dispatch another call", async () => {
	const faux = createFauxCore({});
	let calls = 0;
	faux.setResponses([() => { calls++; return fauxAssistantMessage("invalid JSON"); }]);
	const saved: unknown[] = [];
	await assert.rejects(runNotebookEditor({ state: { lines: [], undo: [] }, instruction: "Write p=" }, {
		engine: { model: faux.getModel(), streamFn: faux.streamSimple },
		onAttemptFinished: async (attempt) => {
			saved.push(structuredClone(attempt));
			assert.equal(attempt.failure, "format");
			assert.ok(attempt.usage);
			throw new Error("Checkpoint unavailable");
		},
	}), /Checkpoint unavailable/);
	assert.equal(calls, 1);
	assert.equal(saved.length, 1);
});

test("an editor instruction changes only the addressed line and retains an undoable original", async () => {
	const faux = createFauxCore({});
	faux.setResponses([() => fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [
		{ op: "replace", id: "L1", latex: "p = F/(2A)" },
	] }))]);
	const state = { lines: [{ id: "L1", latex: "p = F/A" }, { id: "L2", latex: "2 + 2 = 5" }], undo: [] };
	const original = structuredClone(state);
	const result = await runNotebookEditor({ state, instruction: "Double the denominator on line one." }, {
		engine: { model: faux.getModel(), streamFn: faux.streamSimple, level: "medium" },
	});
	assert.equal(result.response?.action, "edit");
	assert.deepEqual(result.state.lines, [{ id: "L1", latex: "p = F/(2A)" }, { id: "L2", latex: "2 + 2 = 5" }]);
	assert.deepEqual(result.state.undo, [original.lines]);
	assert.deepEqual(state, original, "the caller's working is never mutated in place");
});

test("equality continuation sends the entire earlier exchange and applies a whole-line result without losing earlier expressions", async () => {
	const faux = createFauxCore({});
	const before = [{ id: "L1", latex: String.raw`p = \frac{F}{A}` }, { id: "L2", latex: "2 + 2 = 5" }];
	const continued = [{ id: "L1", latex: String.raw`p = \frac{F}{A} = \frac{600}{}` }, before[1]!];
	const completed = [{ id: "L1", latex: String.raw`p = \frac{F}{A} = \frac{600}{0.003}` }, before[1]!];
	const prompts: string[] = [];
	faux.setResponses([continued, completed].map(lines => context => {
		const content = context.messages[0]!.content;
		assert.equal(typeof content, "string");
		prompts.push(String(content));
		return fauxAssistantMessage(JSON.stringify({ action: "edit", operations: [{ op: "replace", ...lines[0] }] }));
	}));
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const first = await runNotebookEditor({ state: { lines: before, undo: [] }, instruction: "On line one, set the equation equal to 600 over" }, { engine });
	const second = await runNotebookEditor({ state: first.state, history: first.history, instruction: "Set the denominator of that new fraction to 0.003." }, { engine });
	const supplied = JSON.parse(prompts[1]!.split("\n\nEARLIER CONVERSATION\n\n")[1]!.split("\n\nCURRENT INSTRUCTION")[0]!);
	assert.deepEqual(supplied, first.history, "every earlier instruction, model response and applied state reaches the next turn");
	assert.deepEqual(first.state.lines, continued);
	assert.deepEqual(second.state.lines, completed);
	assert.deepEqual(second.state.undo, [before, continued]);
	assert.deepEqual(second.history.map(exchange => exchange.notebookAfter), [continued, completed]);
});

test("clarification retains context and historical source; a completed edit can be undone across turns", async () => {
	const faux = createFauxCore({});
	const seen: string[] = [];
	faux.setResponses([
		(context) => { seen.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"question","question":"Which history entry?"}'); },
		(context) => { seen.push(JSON.stringify(context.messages)); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p=F/A; q=V/t"}]}'); },
		() => fauxAssistantMessage('{"action":"undo"}'),
	]);
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const input: NotebookEditorInput = {
		state: { lines: [], undo: [] }, instruction: "Copy line one from history.",
		notebookHistory: [{ id: "pressure", lines: [{ id: "L1", latex: "p=F/A; q=V/t" }] }],
	};
	const original = structuredClone(input);
	const question = await runNotebookEditor(input, { engine });
	assert.equal(question.response?.action, "question");
	assert.deepEqual(question.state, input.state);
	const edited = await runNotebookEditor({ ...input, state: question.state, history: question.history, instruction: "The pressure entry." }, { engine });
	assert.deepEqual(edited.state.lines, [{ id: "L1", latex: "p=F/A; q=V/t" }]);
	assert.match(seen[1]!, /Which history entry/);
	assert.match(seen[1]!, /Copy line one from history/);
	assert.match(seen[1]!, /p=F\/A; q=V\/t/);
	const undone = await runNotebookEditor({ ...input, state: edited.state, history: edited.history, instruction: "Undo that." }, { engine });
	assert.deepEqual(undone.state, input.state);
	assert.deepEqual(input, original, "historical working and caller input stay immutable");
});

test("rejected multi-line output retries once against unchanged working and preserves both failed attempts", async () => {
	const faux = createFauxCore({});
	const seen: string[] = [];
	faux.setResponses([
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"changed"},{"op":"replace","id":"L99","latex":"missing"}]}'),
		(context) => { seen.push(JSON.stringify(context.messages)); return fauxAssistantMessage("not JSON"); },
	]);
	const state = { lines: [{ id: "L1", latex: "p=" }], undo: [] };
	const result = await runNotebookEditor({ state, instruction: "Edit that line." }, { engine: { model: faux.getModel(), streamFn: faux.streamSimple } });
	assert.equal(result.response, null);
	assert.deepEqual(result.state, state);
	assert.equal(result.attempts.length, 2);
	assert.ok(result.attempts.every((attempt) => attempt.error));
	assert.match(seen[0]!, /NOTHING WAS APPLIED/);
	assert.equal(result.history.at(-1)?.response, null);
});

test("a provider failure cannot apply even valid-looking partial JSON and retains reported usage without retry", async () => {
	const faux = createFauxCore({});
	const failure = {
		...fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"lost"}]}', { stopReason: "error", errorMessage: "Fixture provider failed" }),
		usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 0, totalTokens: 150, reasoning: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	};
	const result = await runNotebookEditor({ state: { lines: [], undo: [] }, instruction: "Add a line." }, {
		engine: { model: faux.getModel(), streamFn: () => {
			const stream = new AssistantMessageEventStream();
			stream.push({ type: "error", reason: "error", error: failure });
			stream.end();
			return stream;
		}, level: "medium" },
	});
	assert.equal(result.response, null);
	assert.deepEqual(result.state, { lines: [], undo: [] });
	assert.equal(result.attempts.length, 1);
	assert.equal(result.attempts[0]?.failure, "provider");
	assert.equal(result.attempts[0]?.usage?.input, 100);
	assert.equal(result.attempts[0]?.usage?.reasoning, 10);
	assert.equal(result.attempts[0]?.model.thinkingLevel, "medium");
	assert.ok((result.attempts[0]?.elapsedMs ?? -1) >= 0);
});

test("a format retry can succeed once, preserving literal source and rejected-attempt usage", async () => {
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage("```json\n{}\n```"),
		() => fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":"L1","id":"L2","latex":"$&"}]}'),
	]);
	const result = await runNotebookEditor({ state: { lines: [{ id: "L1", latex: "\\frac{a}{" }], undo: [] }, instruction: "Add a line with literal $&." }, {
		engine: { model: faux.getModel(), streamFn: faux.streamSimple },
	});
	assert.equal(result.response?.action, "edit");
	assert.equal(result.error, undefined);
	assert.deepEqual(result.state.lines, [{ id: "L1", latex: "\\frac{a}{" }, { id: "L2", latex: "$&" }]);
	assert.equal(result.attempts.length, 2);
	assert.ok(result.attempts[0]?.usage);
	assert.equal(result.state.undo.length, 1);
});

test("truncation and pre-dispatch cancellation retain working without application or format retry", async () => {
	const state = { lines: [{ id: "L1", latex: "p=" }], undo: [] };
	for (const cancelled of [false, true]) {
		const faux = createFauxCore({});
		faux.setResponses([() => fauxAssistantMessage('{"action":"question","question":"Which line?"}', { stopReason: "length" })]);
		const result = await runNotebookEditor({ state, instruction: "Edit it." }, {
			engine: { model: faux.getModel(), streamFn: faux.streamSimple },
			signal: cancelled ? AbortSignal.abort(new Error("Cancelled")) : undefined,
		});
		assert.equal(result.response, null);
		assert.deepEqual(result.state, state);
		assert.equal(result.attempts.length, 1);
		if (cancelled) assert.equal(result.attempts[0]?.usage, null, "no usage was reported");
	}
});

test("an in-flight instruction keeps the working it was given even if the caller later changes its draft", async () => {
	let finish!: () => void;
	const held = new Promise<void>((resolve) => { finish = resolve; });
	const faux = createFauxCore({});
	faux.setResponses([async () => { await held; return fauxAssistantMessage('{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p=F/(2A)"}]}'); }]);
	const input = { state: { lines: [{ id: "L1", latex: "p=F/A" }, { id: "L2", latex: "x=1" }], undo: [] }, instruction: "Double A in the pressure equation." };
	const pending = runNotebookEditor(input, { engine: { model: faux.getModel(), streamFn: faux.streamSimple } });
	input.state.lines[1]!.latex = "later working";
	input.instruction = "a later draft";
	finish();
	const result = await pending;
	assert.deepEqual(result.state.lines, [{ id: "L1", latex: "p=F/(2A)" }, { id: "L2", latex: "x=1" }]);
	assert.equal(result.history.at(-1)?.instruction, "Double A in the pressure equation.");
});
