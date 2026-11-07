// The tutor's working folds into one plain line (whole-app redesign, owner
// amendment 2): display only — every part is still rendered inside the fold.
import assert from "node:assert/strict";
import { it } from "node:test";
import { workSegments, workSummary } from "../components/work-steps.tsx";

const tool = (name: string, state = "output-available") => ({ type: `tool-${name}`, state });

it("folds a run of thinking and quiet tool steps; lesson parts stay outside", () => {
	const parts = [
		{ type: "step-start" },
		{ type: "reasoning" },
		tool("list_sessions"),
		{ type: "step-start" },
		{ type: "reasoning" },
		tool("list_propositions"), tool("list_propositions"),
		{ type: "step-start" },
		{ type: "text" },
		tool("research"),
	];
	assert.deepEqual(workSegments(parts), [
		{ kind: "part", index: 0 },
		{ kind: "work", indexes: [1, 2, 3, 4, 5, 6] },
		{ kind: "part", index: 7 },
		{ kind: "part", index: 8 },
		{ kind: "part", index: 9 },
	]);
});

it("thinking alone, a live tool and the teaching boundary are never folded", () => {
	assert.deepEqual(workSegments([{ type: "reasoning" }, { type: "text" }]), [{ kind: "part", index: 0 }, { kind: "part", index: 1 }]);
	assert.deepEqual(workSegments([{ type: "reasoning" }, tool("read", "input-streaming")]), [{ kind: "part", index: 0 }, { kind: "part", index: 1 }]);
	const boundary = workSegments([tool("ls"), { type: "step-start" }, tool("ls")], (index) => index === 1);
	assert.deepEqual(boundary, [{ kind: "work", indexes: [0] }, { kind: "part", index: 1 }, { kind: "work", indexes: [2] }]);
});

it("says what the tutor did in plain words", () => {
	assert.equal(workSummary([tool("list_sessions"), tool("list_propositions"), tool("list_propositions"), tool("list_propositions")]),
		"The tutor looked through your sessions and read the ideas from 3 sessions");
	assert.equal(workSummary([tool("read"), tool("grep"), { type: "tool-read", state: "output-error" }]), "The tutor read a file, searched your files and retried a step");
	assert.equal(workSummary([{ type: "reasoning" }]), "The tutor thought it through");
});
