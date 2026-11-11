import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_CONFIDENCE_INDEX, emptyDockSelection, questionDraftHasWork } from "../src/core/question-core.ts";

const blank = { selection: emptyDockSelection(), thinking: "", other: "", text: "", confidenceIndex: DEFAULT_CONFIDENCE_INDEX };

it("busy signal: an untouched or missing question draft holds no work", () => {
	assert.equal(questionDraftHasWork(undefined), false);
	assert.equal(questionDraftHasWork({}), false);
	assert.equal(questionDraftHasWork({ form: blank, readingThinking: "   " }), false);
});

it("busy signal: a pick, any text, a moved confidence, the reading note or a failed send is work", () => {
	assert.equal(questionDraftHasWork({ form: { ...blank, selection: { ...emptyDockSelection(), selected: new Set([1]) } } }), true);
	// Stored drafts keep the selection as an array.
	assert.equal(questionDraftHasWork({ form: { ...blank, selection: { selected: [0] as unknown as Set<number>, otherSelected: false, dontKnow: false } } }), true);
	assert.equal(questionDraftHasWork({ form: { ...blank, selection: { ...emptyDockSelection(), dontKnow: true } } }), true);
	assert.equal(questionDraftHasWork({ form: { ...blank, selection: { ...emptyDockSelection(), otherSelected: true } } }), true);
	for (const field of ["thinking", "other", "text"] as const) assert.equal(questionDraftHasWork({ form: { ...blank, [field]: "p = F/A" } }), true, field);
	assert.equal(questionDraftHasWork({ form: { ...blank, confidenceIndex: DEFAULT_CONFIDENCE_INDEX + 1 } }), true);
	assert.equal(questionDraftHasWork({ readingThinking: "Skis spread the weight." }), true);
	assert.equal(questionDraftHasWork({ form: blank, unsent: { at: 1 } }), true);
});
