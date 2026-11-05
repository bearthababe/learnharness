import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { Chat } from "../components/chat.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { newNextMessage, newUserMessage, newThinkingMessage, newAnswerResult, type LhMessage } from "../src/core/native-messages.ts";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { LearnerExplanation } from "../src/core/contracts/notebook.ts";

/** Reopen's real Chat → useChatSession → projectView → transcript branch.
 * Rendering the explanation component alone misses the marker-card interception. */
function reopen(messages: LhMessage[]) {
	return parseHTML(renderToStaticMarkup(
		<AppRouterContext.Provider value={{ back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "notebook-reopen" }}>
			<ServerEventsProvider>
				<Chat chatId="notebook-reopen" title="Pressure explanation" initialMessages={messages} initialConfigured={true} />
			</ServerEventsProvider>
		</AppRouterContext.Provider>,
	)).document;
}

test("reopened Chat renders the native learner explanation and all three snapshots in its You row", () => {
	const parts: LearnerExplanation = [
		{ id: "before", kind: "text", text: "Pressure is force divided by area." },
		{ id: "first", kind: "working", snapshotId: "first", contextId: "original", revision: 1, lines: [{ id: "L1", latex: "p=F/A" }] },
		{ id: "between", kind: "text", text: "I compare the same force over a different area." },
		{ id: "second", kind: "working", snapshotId: "second", contextId: "original", revision: 2, lines: [{ id: "L1", latex: "p=F/5" }] },
		{ id: "fresh", kind: "text", text: "I reused the earlier working after Start fresh." },
		{ id: "third", kind: "working", snapshotId: "third", contextId: "fresh", revision: 1, lines: [{ id: "L1", latex: "p=F/5" }] },
		{ id: "after", kind: "text", text: "These steps were notebook assisted." },
	];
	// JSON round-trip models the saved native record handed to the reopened page.
	const saved: LhMessage[] = JSON.parse(JSON.stringify([newUserMessage("compatibility text", parts, "submitted-explanation")]));
	const document = reopen(saved);
	assert.equal(document.querySelectorAll("[data-snapshot-id]").length, 3, "submitted working must not disappear into the marker-card branch");
	const row = document.querySelector('[data-testid="user-message"]')!;
	assert.ok(row, "native learner authorship keeps the existing You row");
	assert.equal(row.querySelectorAll("[data-learner-explanation]").length, 1);
	assert.deepEqual([...row.querySelectorAll("[data-snapshot-id]")].map((node) => node.getAttribute("data-snapshot-id")), ["first", "second", "third"]);
	assert.match(row.textContent!, /Pressure is force divided by area\.[\s\S]*Notebook-assisted working[\s\S]*I compare the same force[\s\S]*I reused the earlier working[\s\S]*These steps were notebook assisted\./);
	assert.match(row.textContent!, /not by itself evidence of independent reasoning/);
	assert.doesNotMatch(row.textContent!, /compatibility text/);
});

test("reopened Chat keeps working-only learner input visible while existing marker cards and plain text keep their rendering", () => {
	const workingOnly = newUserMessage("", [{ id: "working", kind: "working", snapshotId: "working", contextId: "context", revision: 1, lines: [{ id: "L1", latex: "p=" }] }]);
	const document = reopen([newUserMessage("Plain learner text"), newNextMessage(), workingOnly]);
	assert.equal(document.querySelectorAll('[data-testid="user-message"]').length, 2);
	assert.equal(document.querySelectorAll('[data-testid="practice-next-line"]').length, 1);
	assert.equal(document.querySelectorAll("[data-snapshot-id]").length, 1);
	assert.match(document.querySelector('[data-testid="user-message"]')!.textContent!, /Plain learner text/);
});

test("complete Chat renders practice thinking working once under its existing learner card", () => {
	const parts: LearnerExplanation = [{ id: "working", kind: "working", snapshotId: "practice", contextId: "context", revision: 1, lines: [{ id: "L1", latex: "p=" }] }];
	const document = reopen(JSON.parse(JSON.stringify([newThinkingMessage("problem", "compatibility", parts)])));
	assert.equal(document.querySelectorAll("[data-snapshot-id]").length, 1);
	assert.doesNotMatch(document.querySelector('[data-testid="thinking-card"]')!.textContent!, /compatibility/);
});

test("complete Chat renders reading and answer snapshots in order without compatibility duplicates", () => {
	const parts = (id: string): LearnerExplanation => [{ id, kind: "working", snapshotId: id, contextId: "context", revision: 1, lines: [{ id: "L1", latex: "p=" }] }];
	const call = { ...fauxAssistantMessage([fauxToolCall("recall", { question: "Pressure?", correctAnswer: "Force per area" }, { id: "q1" })], { stopReason: "toolUse" }), id: "call" };
	const answer = newAnswerResult("q1", "recall", { kind: "explain", questionText: "Pressure?", dontKnow: false, answers: [], answeredAt: "now", readingThinking: "READING COMPAT", text: "ANSWER COMPAT", readingThinkingContent: parts("reading"), textContent: parts("answer") });
	const document = reopen([call, answer]);
	assert.deepEqual([...document.querySelectorAll("[data-snapshot-id]")].map(e => e.getAttribute("data-snapshot-id")), ["reading", "answer"]);
	assert.doesNotMatch(document.documentElement.textContent!, /READING COMPAT|ANSWER COMPAT/);
});

test("empty notebook reading and thinking channels do not add blank transcript headings", () => {
	const call = { ...fauxAssistantMessage([fauxToolCall("recall", { question: "Pressure?", correctAnswer: "Force per area" }, { id: "empty-q" })], { stopReason: "toolUse" }), id: "empty-call" };
	const answer = newAnswerResult("empty-q", "recall", { kind: "explain", questionText: "Pressure?", dontKnow: false, answers: [], answeredAt: "now", text: "Force per area", readingThinkingContent: [{ id: "empty-read", kind: "text", text: "" }], thinkingContent: [{ id: "empty-thinking", kind: "text", text: "" }] });
	const document = reopen([call, answer]);
	assert.equal(document.querySelectorAll('[data-testid="reading-thinking-block"], [data-testid="your-thinking"]').length, 0);
});
