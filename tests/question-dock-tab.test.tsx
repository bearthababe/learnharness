// Keyboard traversal through a live question (whole-app redesign): the
// answer rows are one Tab stop, the thinking field is the next, and from
// there Tab belongs to the browser — Submit and the rest of the page stay
// reachable instead of looping between the rows and the field.
import React, { act } from "react";
(globalThis as { React?: typeof React }).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

function tab(target: EventTarget) {
	const key = new window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(key, { key: "Tab", shiftKey: false });
	target.dispatchEvent(key);
	return key;
}

test("Tab enters the rows from nowhere, leaves them for the thinking field, then is native", async () => {
	const input = { question: "Which change doubles the pressure?", options: [{ label: "Halve the area" }, { label: "Double the area" }, { label: "Double the force and the area" }], correctAnswer: "Halve the area", explanation: "Pressure is force over area." };
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<QuestionDock toolName="quiz" toolCallId="tab_walk" input={input} expanded
			dictationClaim={false} onExpand={() => {}} onSubmit={() => {}} />));
		const row = host.querySelector<HTMLElement>('[data-kbdrow="0"]')!;
		const thinking = host.querySelector<HTMLElement>('[aria-label="Your thinking"]')!;
		assert.ok(row && thinking);
		let key: Event;
		await act(async () => { key = tab(document.body); });
		assert.equal(key!.defaultPrevented, true, "Tab from nowhere enters the answer rows");
		await act(async () => { key = tab(row); });
		assert.equal(key!.defaultPrevented, true, "Tab from a row moves to the thinking field");
		await act(async () => { key = tab(thinking); });
		assert.equal(key!.defaultPrevented, false, "Tab from the thinking field is the browser's (on to Submit)");
		const submit = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "Submit answer" || button.textContent?.includes("Submit answer"))!;
		assert.ok(submit);
		await act(async () => { key = tab(submit); });
		assert.equal(key!.defaultPrevented, false, "Tab from Submit continues through the page");
	} finally { await act(async () => root.unmount()); host.remove(); }
});
