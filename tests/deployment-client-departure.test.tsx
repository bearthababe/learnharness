import React, { act } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { ChatSessionComposer } from "../components/composer.tsx";
import { DeploymentActivity } from "../components/deployment-activity.tsx";
import { createActivity } from "../electron/deployment-activity.cjs";

async function fixture(input: { value?: string; dictationActive?: boolean; hasContent?: boolean } = {}) {
	const { window: browserWindow, document: browserDocument } = parseHTML("<html><body><div id='root'></div></body></html>");
	let clock = 100;
	const activity = createActivity({ now: () => clock });
	const finishWork = activity.enterRequest();
	const documentId = activity.open("synthetic-session");
	const reports: { reasons: string[]; leave?: boolean }[] = [];
	const previous = new Map<string, PropertyDescriptor | undefined>();
	for (const [name, value] of Object.entries({
		React,
		window: browserWindow,
		document: browserDocument,
		Node: browserWindow.Node,
		HTMLElement: browserWindow.HTMLElement,
		HTMLTextAreaElement: browserWindow.HTMLTextAreaElement,
		Element: browserWindow.Element,
		Event: browserWindow.Event,
		IS_REACT_ACT_ENVIRONMENT: true,
		fetch: async (_target: unknown, request: RequestInit) => {
			const report = JSON.parse(String(request.body));
			reports.push(report);
			return Response.json(activity.report("synthetic-session", report));
		},
	})) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(browserDocument.getElementById("root")!);
	const draw = (state = input, busy = true) => root.render(<>
		<DeploymentActivity documentId={documentId} />
		<ChatSessionComposer value={state.value ?? ""} revision={busy ? 0 : 1} busy={busy}
			dictationActive={state.dictationActive ?? false} hasContent={state.hasContent ?? false}
			onChange={() => {}} onSend={() => {}} onStop={() => {}} sendAllowed autoFocus={false} />
	</>);
	await act(async () => { draw(); });
	return {
		activity,
		reports,
		async depart() {
			const event = new browserWindow.Event("pagehide");
			Object.defineProperty(event, "persisted", { value: false });
			await act(async () => { browserWindow.dispatchEvent(event); });
		},
		complete() { finishWork(); },
		age() { clock += 6000; },
		async close() {
			try {
				await act(async () => { draw({}, false); });
				await act(async () => { root.unmount(); });
			} finally {
				for (const [name, descriptor] of previous) {
					if (descriptor) Object.defineProperty(globalThis, name, descriptor);
					else Reflect.deleteProperty(globalThis, name);
				}
			}
		},
	};
}

test("departing an empty busy composer stops blocking after server work completes", async () => {
	const view = await fixture();
	try {
		assert.equal(view.activity.snapshot().state, "busy");
		await view.depart();
		assert.deepEqual(view.reports.at(-1)?.reasons, []);
		assert.equal(view.activity.snapshot().state, "busy");
		assert.throws(() => view.activity.beginFreeze());
		view.complete();
		assert.equal(view.activity.snapshot().state, "idle");
		assert.equal(view.activity.snapshot().clients, 0);
		view.age();
		assert.equal(view.activity.snapshot().state, "idle");
		assert.doesNotThrow(() => view.activity.beginFreeze());
	} finally { await view.close(); }
});

for (const [name, state] of [
	["unsent text", { value: "Unsent steering draft" }],
	["active dictation", { dictationActive: true }],
	["retained attachments", { hasContent: true }],
] as const) {
	test(`departed ${name} still prevents an idle cutover after tutor work completes`, async () => {
		const view = await fixture(state);
		try {
			await view.depart();
			assert.ok(view.reports.at(-1)?.reasons.includes("composer"));
			view.complete();
			assert.equal(view.activity.snapshot().state, "busy");
			assert.throws(() => view.activity.beginFreeze());
			view.age();
			assert.equal(view.activity.snapshot().state, "unknown");
			assert.throws(() => view.activity.beginFreeze());
		} finally { await view.close(); }
	});
}
