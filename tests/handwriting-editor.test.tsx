import React, { act, useRef, useState } from "react";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseHTML } from "linkedom";

const dom = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { React, window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { useHandwritingEditor, useHandwritingSubmission } = await import("../components/handwriting/submission.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { handwritingTransferDevice } = await import("../components/handwriting/transfer-device.ts");
const original = { open: handwritingTransferDevice.open, read: handwritingTransferDevice.read, saveDraft: handwritingTransferDevice.saveDraft };
Object.assign(handwritingTransferDevice, {
	open: async () => 0,
	read: async () => ({ captures: [], submissions: [], drafts: [], captureReceipts: [] }),
	saveDraft: async () => {},
});
after(() => Object.assign(handwritingTransferDevice, original));

test("editing a recovered speech draft back to its earlier text preserves the new edit", async () => {
	let edit!: (value: string) => void;
	let bridge!: ReturnType<typeof useHandwritingSubmission>;
	function Field() {
		const text = useRef("Original session draft.");
		const [value, setValue] = useState(text.current);
		edit = next => { text.current = next; setValue(next); };
		bridge = useHandwritingSubmission("chat_editor", async () => ({ pending: [], pageAttachments: {} }), async () => true, []);
		useHandwritingEditor("composer", () => ({ text: text.current }), draft => edit(draft.text ?? ""), true, bridge);
		return <output>{value}</output>;
	}
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<ServerEventsProvider connect={() => ({ onEvent() {}, onOpen() {}, close() {} })}><Field /></ServerEventsProvider>));
		assert.equal(bridge.ready, true);
		await act(async () => edit("Original session draft. Abandoned words."));
		assert.equal(host.textContent, "Original session draft. Abandoned words.");
		await act(async () => edit("Original session draft."));
		assert.equal(host.textContent, "Original session draft.");
		assert.equal(bridge.model!.draft("composer")!.editor.text, "Original session draft.");
		await act(async () => {
			bridge.model!.edit("composer", { text: "Original session draft. Retained final." });
			bridge.refreshNotices();
		});
		assert.equal(host.textContent, "Original session draft. Retained final.", "A real recovery update still reaches an unchanged editor");
		await act(async () => edit("Original session draft."));
		assert.equal(host.textContent, "Original session draft.");
	} finally { await act(async () => root.unmount()); host.remove(); }
});
