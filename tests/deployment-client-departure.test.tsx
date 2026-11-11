import React, { act } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { ChatSessionComposer } from "../components/composer.tsx";
import { DeploymentActivity } from "../components/deployment-activity.tsx";
import { createActivity } from "../electron/deployment-activity.cjs";
import { useNotebookSession } from "../components/use-notebook-session.ts";
import type { NotebookView } from "../src/core/index.ts";

async function fixture(input: { value?: string; dictationActive?: boolean; hasContent?: boolean; notebookView?: NotebookView } = {}) {
	const { window: browserWindow, document: browserDocument } = parseHTML("<html><body><div id='root'></div></body></html>");
	let clock = 100;
	const activity = createActivity({ now: () => clock });
	const finishWork = activity.enterRequest();
	const documentId = activity.open("synthetic-session");
	const reports: { reasons: string[]; leave?: boolean }[] = [];
	let notebookView = input.notebookView;
	let notebookSession: ReturnType<typeof useNotebookSession>["session"] | undefined;
	function NotebookActivity() {
		notebookSession = useNotebookSession("synthetic-session").session;
		return null;
	}
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
		fetch: async (target: unknown, request: RequestInit) => {
			if (String(target).endsWith("/notebook")) return Response.json(notebookView);
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
		{input.notebookView && <NotebookActivity />}
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
		async refreshNotebook(view: NotebookView) {
			notebookView = view;
			await act(async () => { await notebookSession?.refresh(); });
			await act(async () => { browserWindow.dispatchEvent(new browserWindow.Event("pageshow")); });
		},
		async close() {
			try {
				if (notebookView) {
					notebookView = { ...notebookView, revision: notebookView.revision + 1, speechRuns: [] };
					await act(async () => { await notebookSession?.refresh(); });
				}
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

function retainedSpeech(): NotebookView {
	return {
		revision: 4, candidate: "terra-medium", visible: false, contextId: "synthetic-context",
		workingRevision: 0, lines: [], history: [], startFreshPending: false, canUndo: false,
		draft: { id: "empty-draft", revision: 0, text: "" }, pending: null, problem: null,
		usage: { calls: 0, unknownCalls: 0, subscriptionCalls: 0, unpricedCalls: 0, apiSubtotal: 0, tokens: 0 },
		speechRuns: [{
			id: "interrupted-speech", revision: 3, status: "interrupted", incomplete: true,
			fragments: [{ id: "unplaced-words", start: null, end: null, text: "Unsubmitted retained learner speech", target: null }],
			unplaced: ["unplaced-words"],
		}],
	};
}

test("unplaced recovered speech blocks freeze before and after departure with empty editors", async () => {
	const view = await fixture({ notebookView: retainedSpeech() });
	try {
		view.complete();
		await view.refreshNotebook(retainedSpeech());
		assert.equal(view.activity.snapshot().state, "busy");
		assert.throws(() => view.activity.beginFreeze());
		await view.depart();
		assert.ok(view.reports.at(-1)?.reasons.includes("notebook"));
		assert.equal(view.activity.snapshot().state, "busy");
		assert.throws(() => view.activity.beginFreeze());
		view.age();
		assert.equal(view.activity.snapshot().state, "unknown");
		assert.throws(() => view.activity.beginFreeze());
	} finally { await view.close(); }
});

test("explicitly discarding recovered speech releases idle and retains its discard identity", async () => {
	const notebookView = retainedSpeech();
	const view = await fixture({ notebookView });
	try {
		view.complete();
		await view.refreshNotebook(notebookView);
		assert.equal(view.activity.snapshot().state, "busy");
		const discarded = { ...notebookView, revision: 5, speechRuns: notebookView.speechRuns!.map(run => ({ ...run, fragments: [], discarded: ["unplaced-words"] })) };
		await view.refreshNotebook(discarded);
		await view.depart();
		assert.deepEqual(view.reports.at(-1)?.reasons, []);
		assert.equal(view.activity.snapshot().state, "idle");
		assert.doesNotThrow(() => view.activity.beginFreeze());
		assert.equal(discarded.speechRuns[0]!.id, "interrupted-speech");
		assert.deepEqual(discarded.speechRuns[0]!.discarded, ["unplaced-words"]);
	} finally { await view.close(); }
});

for (const cleared of ["placed", "discarded", "empty"] as const) {
	test(`${cleared} speech history does not leave a clean Notebook client busy`, async () => {
		const notebookView = retainedSpeech();
		for (const run of notebookView.speechRuns!) {
			if (cleared === "placed") run.unplaced = [];
			if (cleared === "discarded") run.discarded = ["unplaced-words"];
			if (cleared === "empty") run.fragments[0]!.text = "  ";
		}
		const view = await fixture({ notebookView });
		try {
			view.complete();
			await view.refreshNotebook(notebookView);
			assert.equal(view.activity.snapshot().state, "idle");
			await view.depart();
			assert.deepEqual(view.reports.at(-1)?.reasons, []);
			assert.equal(view.activity.snapshot().clients, 0);
			assert.doesNotThrow(() => view.activity.beginFreeze());
		} finally { await view.close(); }
	});
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
