import assert from "node:assert/strict";
import { it } from "node:test";
import { HandwritingAttachment } from "../components/handwriting/attachment.ts";
import { HandwritingSubmission } from "../components/handwriting/submission-recovery.ts";
import type { TransferDevice, TransferSnapshot, CaptureRecord, DurableDraft, SubmissionAttempt, CaptureReceipt } from "../components/handwriting/transfer-device.ts";
import { notebookSource, emptyHandwriting } from "../src/core/handwriting.ts";
import { writingSubmissionReceipt } from "../src/server/writing-submission.ts";
import { parseChatInput } from "../src/core/input-events.ts";
import { readFileSync } from "node:fs";
import { transpile, ScriptTarget } from "typescript";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionDock } from "../components/question-dock.tsx";
import { HandwritingSubmissionContext } from "../components/handwriting/submission.tsx";

function device(): TransferDevice {
	const saved: TransferSnapshot = { captures: [], drafts: [], submissions: [], captureReceipts: [] };
	const saveDraft = (draft: DurableDraft) => { const previous = saved.drafts.find(value => value.targetKey === draft.targetKey); if (!previous || previous.revision < draft.revision) saved.drafts = [...saved.drafts.filter(value => value.targetKey !== draft.targetKey), structuredClone(draft)]; };
	return {
		async open() { return 0; }, async read() { return structuredClone(saved); },
		async saveDraft(_chat, _generation, draft: DurableDraft) { saveDraft(draft); },
		async saveCapture(_chat, _generation, capture: CaptureRecord, draft?: DurableDraft) { saved.captures = [structuredClone(capture)]; if (draft) saveDraft(draft); },
		async finishCapture(_chat, _generation, _writingId, receipt: CaptureReceipt) { saved.captures = []; saved.captureReceipts = [receipt]; },
		async saveSubmission(_chat, _generation, attempt: SubmissionAttempt, draft?: DurableDraft) { saved.submissions = [structuredClone(attempt)]; if (draft) saved.drafts = [structuredClone(draft)]; },
		async finishSubmission() { saved.submissions = []; }, async deleteChat() { saved.captures = []; saved.submissions = []; saved.drafts = []; },
	};
}
it("Attach saves finalized explanation and detached source before upload, then reopening automatically retries the exact identity and PNG", async () => {
	const local = device(), requests: FormData[] = [];
	let finalized = false;
	const source = notebookSource(emptyHandwriting());
	const draft: DurableDraft = { version: 1, chatId: "chat", targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "Final speech" } };
	const deps = { device: local, fetch: async (_url: RequestInfo | URL, init?: RequestInit) => { requests.push(init!.body as FormData); throw new Error("Lost ACK"); }, encode: async () => new Blob(["frozen PNG"], { type: "image/png" }), refresh: async () => ({ pending: [], pageAttachments: {} }), reveal: () => {}, changed: () => {} };
	const first = new HandwritingAttachment("chat", deps); await first.open();
	await first.attach({ pageId: "page_initial", head: undefined, valid: () => true, finish: async () => { finalized = true; return true; }, freeze: () => { assert.ok(finalized); return { source, draft, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) } }; } });
	assert.equal(requests.length, 1);
	const durable = await local.read("chat", 0); assert.equal(durable.drafts[0]!.editor.text, "Final speech");
	assert.equal(durable.captures[0]!.raster, undefined);
	const reopened = new HandwritingAttachment("chat", deps); await reopened.open();
	assert.equal(requests.length, 2, "Reopen retries the saved capture without requiring a separate action");
	assert.equal(requests[0]!.get("writingId"), requests[1]!.get("writingId"));
	assert.equal(await (requests[1]!.get("image") as Blob).text(), "frozen PNG");
	assert.equal(await (requests[0]!.get("source") as Blob).text(), await (requests[1]!.get("source") as Blob).text());
});

it("ordinary Attach and concurrent reconnect recover one saved capture without preparing newer working", async () => {
	const local = device(), requests: FormData[] = [], source = notebookSource(emptyHandwriting());
	const draft: DurableDraft = { version: 1, chatId: "chat", targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "Original" } };
	let hold = false, release!: () => void, entered!: () => void;
	const started = new Promise<void>(resolve => { entered = resolve; });
	const model = new HandwritingAttachment("chat", { device: local, fetch: async (_url, init) => { requests.push(init!.body as FormData); if (hold) { entered(); await new Promise<void>(resolve => { release = resolve; }); } throw new Error("Offline"); }, encode: async () => new Blob(["original bytes"], { type: "image/png" }), refresh: async () => ({ pending: [], pageAttachments: {} }), reveal() {}, changed() {} });
	await model.open();
	await model.attach({ pageId: "page_initial", head: undefined, valid: () => true, finish: async () => true, freeze: () => ({ source, draft, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) } }) });
	await local.saveDraft("chat", 0, { ...draft, revision: 2, editor: { text: "Newer" } });
	hold = true;
	const preparation = { pageId: "page_initial", head: undefined, valid: () => true, finish: async () => { assert.fail("Retry must not finalize/recapture a newer editor"); }, freeze: () => { throw new Error("Retry must not freeze newer working"); } };
	const retry = model.attach(preparation); await started;
	await Promise.all([model.recover(), model.attach(preparation), model.recover()]);
	assert.equal(requests.length, 2, "Only one replay may be in flight");
	release(); await retry;
	assert.equal(requests[1]!.get("writingId"), requests[0]!.get("writingId"));
	assert.equal(await (requests[1]!.get("image") as Blob).text(), "original bytes");
	assert.equal(await (requests[1]!.get("source") as Blob).text(), await (requests[0]!.get("source") as Blob).text());
	assert.equal((await local.read("chat", 0)).drafts[0]!.editor.text, "Newer");
});

it("automatic capture recovery retains but never uploads oversized, conflicted or corrupt saved captures", async () => {
	const seed = device(), source = notebookSource(emptyHandwriting());
	const draft: DurableDraft = { version: 1, chatId: "chat", targetKey: "composer", draftId: "draft", revision: 1, editor: { text: "Original" } };
	const deps = { device: seed, fetch: async () => { throw new Error("Offline"); }, encode: async () => new Blob(["PNG"]), refresh: async () => ({ pending: [], pageAttachments: {} }), reveal() {}, changed() {} };
	const first = new HandwritingAttachment("chat", deps); await first.open();
	await first.attach({ pageId: "page_initial", head: undefined, valid: () => true, finish: async () => true, freeze: () => ({ source, draft, raster: { width: 1400, height: 1800, rgba: new ArrayBuffer(1400 * 1800 * 4) } }) });
	const original = (await seed.read("chat", 0)).captures[0]!;
	const variants: CaptureRecord[] = [{ ...original, png: new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]) }, { ...original, state: "conflicted" }, { ...original, sourceJson: "{broken" }];
	for (const capture of variants) {
		const local = device(); await local.saveCapture("chat", 0, capture, draft); let uploads = 0;
		const model = new HandwritingAttachment("chat", { ...deps, device: local, fetch: async () => { uploads++; throw new Error("Must not upload"); } });
		await model.open(); await model.recover();
		assert.equal(uploads, 0); assert.equal((await local.read("chat", 0)).captures[0]!.writingId, original.writingId);
	}
});

it("a rejected retry cannot erase uncertainty about a delayed original; newer page head then fresh record can", async () => {
	const local = device(), calls: string[] = [];
	let replaced = false;
	const writing = { id: "writing_original", createdAt: "2026-11-04", notebook: { pageId: "page_initial", pageRevision: 1, contentFingerprint: "original" } };
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => { calls.push("record"); return Response.json({ messages: [], turnInFlight: false }); }, review: async () => { calls.push("heads"); return { pending: replaced ? [] : [writing], pageAttachments: { page_initial: { revision: replaced ? 2 : 1, writingId: replaced ? "writing_new" : writing.id, contentFingerprint: "current" } } }; } });
	await recovery.open();
	const draft = recovery.edit("composer", { text: "original" });
	await recovery.submit({ type: "text", text: "original", writingIds: [writing.id] }, [writing], draft, async (_input, outcome) => { outcome({ disposition: "unknown", original: true }); });
	recovery.edit("composer", { text: "newer edit" });
	await recovery.submit({ type: "text", text: "newer edit", writingIds: [writing.id] }, [writing], recovery.draft("composer")!, async (_input, outcome) => { outcome({ disposition: "not_accepted", original: true }); });
	assert.ok(recovery.attempt, "Refusal of retry cannot prove original rejection");
	assert.equal(recovery.draft("composer")!.editor.text, "newer edit");
	replaced = true; calls.length = 0; await recovery.check();
	assert.deepEqual(calls, ["heads", "record"]);
	assert.equal(recovery.attempt, undefined);
	assert.equal(recovery.draft("composer")!.editor.text, "newer edit");
});

it("canonical acceptance retires a real answer shape whose optional fields disappear on the JSON wire", async () => {
	const local = device(), writing = { id: "writing_original", createdAt: "2026-11-04" };
	let messages: import("../src/core/native-messages.ts").LhMessage[] = [];
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages, turnInFlight: false }), review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await recovery.open();
	const draft = recovery.edit("question:first", { text: "Answer" });
	await recovery.submit({ type: "answer", toolCallId: "first", writingIds: [writing.id], answer: { kind: "ask", questionText: "Question", questionType: undefined, thinking: undefined, readingThinking: undefined, dontKnow: false, answers: [], text: "Answer", answeredAt: "2026-11-04T00:00:00.000Z" } }, [writing], draft, async (input, outcome) => {
		const receipt = writingSubmissionReceipt(parseChatInput(JSON.parse(JSON.stringify(input))));
		messages = [{ role: "user", id: "accepted", content: "Answer", timestamp: 1, writingSubmission: receipt }];
		outcome({ disposition: "accepted", original: true });
	});
	assert.equal(recovery.attempt, undefined, "Accepted answer must not remain permanently uncertain");
});

it("failure to persist sending never dispatches or traps a definitely-unsent answer in uncertainty", async () => {
	const local = device(), save = local.saveSubmission, writing = { id: "writing_original", createdAt: "2026-11-04" };
	local.saveSubmission = async (chat, generation, attempt, draft) => { if (attempt.state === "sending") throw new Error("Quota abort"); await save(chat, generation, attempt, draft); };
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => { throw new Error("No acceptance lookup needed"); }, review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await recovery.open(); let sends = 0;
	const draft = recovery.edit("composer", { text: "Still editable" });
	assert.equal(await recovery.submit({ type: "text", text: "Still editable", writingIds: [writing.id] }, [writing], draft, async () => { sends++; }), false);
	assert.equal(sends, 0); assert.equal(recovery.attempt, undefined);
	assert.equal(recovery.draft("composer")!.editor.text, "Still editable");
	assert.match(recovery.notice!, /Nothing was sent/);
});

it("normal Send reconciles then retries the original identity and payload, retaining later edits", async () => {
	const local = device(), writing = { id: "writing_external", createdAt: "2026-11-05" };
	let messages: import("../src/core/native-messages.ts").LhMessage[] = [];
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages, turnInFlight: false }), review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await recovery.open();
	let original!: import("../src/core/input-events.ts").ChatInput;
	await recovery.submit({ type: "text", text: "Original", writingIds: [writing.id] }, [writing], recovery.edit("composer", { text: "Original" }), async input => { original = input; });
	const newer = recovery.edit("composer", { text: "Later unsent edits" });
	let retries = 0;
	await recovery.submit({ type: "text", text: "Later unsent edits", writingIds: [writing.id] }, [writing], newer, async (input, outcome) => {
		retries++; assert.deepEqual(input, original);
		messages = [{ role: "user", id: "accepted", content: "Original", timestamp: 1, sharedWriting: [{ ...writing, path: "/fixture.png" }], writingSubmission: writingSubmissionReceipt(input) }];
		outcome({ disposition: "accepted", original: true });
	});
	assert.equal(retries, 1); assert.equal(recovery.attempt, undefined);
	assert.equal(recovery.draft("composer")!.editor.text, "Later unsent edits");
	assert.match(recovery.notice!, /sent/i);
});

it("normal Send first discovers a lost accepted receipt and never posts the newer draft as an accidental second input", async () => {
	const local = device(), writing = { id: "writing_external", createdAt: "2026-11-05" };
	let accepted: import("../src/core/input-events.ts").ChatInput | undefined;
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages: accepted ? [{ role: "user", id: "accepted", content: "Original", timestamp: 1, writingSubmission: writingSubmissionReceipt(accepted) }] : [], turnInFlight: false }), review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await recovery.open(); let original!: import("../src/core/input-events.ts").ChatInput;
	await recovery.submit({ type: "text", text: "Original", writingIds: [writing.id] }, [writing], recovery.edit("composer", { text: "Original" }), async input => { original = input; });
	accepted = original;
	const newer = recovery.edit("composer", { text: "Newer" });
	await recovery.submit({ type: "text", text: "Newer", writingIds: [writing.id] }, [writing], newer, async () => { assert.fail("Receipt must prevent a second POST"); });
	assert.equal(recovery.attempt, undefined); assert.equal(recovery.draft("composer")!.editor.text, "Newer");
	assert.match(recovery.notice!, /sent/i);
});

it("canonical consumption by a different input retires uncertainty without claiming success or losing later drafts", async () => {
	const local = device(), writing = { id: "writing_external", createdAt: "2026-11-05" };
	let consumed = false, failRead = false;
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => failRead ? new Response(null, { status: 503 }) : Response.json({ messages: consumed ? [{ role: "user", id: "other", content: "Different submission", timestamp: 1, sharedWriting: [writing] }] : [], turnInFlight: false }), review: async () => ({ pending: consumed ? [] : [writing], pageAttachments: {} }) });
	await recovery.open();
	await recovery.submit({ type: "text", text: "Original", writingIds: [writing.id] }, [writing], recovery.edit("composer", { text: "Original" }), async () => {});
	recovery.edit("composer", { text: "Newer" });
	consumed = true; failRead = true; await recovery.check(); assert.ok(recovery.attempt, "Failed read is not rejection proof");
	failRead = false; await recovery.check();
	assert.equal(recovery.attempt, undefined); assert.equal(recovery.draft("composer")!.editor.text, "Newer");
	assert.doesNotMatch(recovery.notice ?? "", /already sent|was received/i);
});

it("a different canonical resolution of the original question retires its attempt while keeping the old target draft", async () => {
	const local = device(), writing = { id: "writing_external", createdAt: "2026-11-05" };
	let resolved = false;
	const recovery = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages: resolved ? [{ role: "toolResult", id: "other", toolCallId: "first", toolName: "ask_user_question", content: [{ type: "text", text: "Other answer" }], timestamp: 1 }] : [], turnInFlight: false }), review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await recovery.open();
	await recovery.submit({ type: "answer", toolCallId: "first", answer: { kind: "ask", questionText: "Q", dontKnow: false, answers: [], text: "Original", answeredAt: "2026-11-05T00:00:00.000Z" }, writingIds: [writing.id] }, [writing], recovery.edit("question:first", { text: "Original" }), async () => {});
	assert.ok(recovery.attempt, "An absent target alone is not canonical resolution evidence");
	resolved = true; await recovery.check();
	assert.equal(recovery.attempt, undefined); assert.equal(recovery.draft("question:first")!.editor.text, "Original");
	assert.equal(recovery.draft("question:second"), undefined);
});

it("the actual Chat Send continuation cannot fall through to newer text when acceptance arrives during speech finalization", async () => {
	const local = device(), writing = { id: "writing_original", createdAt: "2026-11-05" };
	let accepted: import("../src/core/input-events.ts").ChatInput | undefined;
	const model = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages: accepted ? [{ role: "user", id: "accepted", content: "Original", timestamp: 1, writingSubmission: writingSubmissionReceipt(accepted) }] : [], turnInFlight: false }), review: async () => ({ pending: accepted ? [] : [writing], pageAttachments: {} }) });
	await model.open(); let original!: import("../src/core/input-events.ts").ChatInput;
	await model.submit({ type: "text", text: "Original", writingIds: [writing.id] }, [writing], model.edit("composer", { text: "Original" }), async input => { original = input; });
	model.edit("composer", { text: "Newer unsent explanation" });
	const posts: unknown[] = [], textRef = { current: "Newer unsent explanation" }, field = {};
	let finish!: () => void;
	const speech = new Promise<void>(resolve => { finish = resolve; });
	const dispatch = async (input: unknown) => { posts.push(input); };
	const handwritingSubmission = { blocked: () => model.busy, reviewed: () => [], activeField: () => field, hasAttempt: () => !!model.attempt, recoveryAction: () => model.recoveryAction(dispatch), submit: async () => { assert.fail("Resolved recovery must not create a new submission"); } };
	// Execute the caller's exact closures, not a copy of the branch algorithm.
	// This isolates the real async caller/controller seam from the full Chat providers.
	const file = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
	const source = file.slice(file.indexOf("\tconst onSend = () => {"), file.indexOf('\tuseHandwritingEditor("composer"'));
	assert.ok(source.includes("dictation.finish()"));
	const env = { handwritingSubmission, pending: null, compacting: false, busy: false, textRef, dictationCheckpoint: () => () => true, dictation: { active: true, finish: () => speech }, zeroKeys: false, selectedModelUnavailable: () => false, catalog: {}, selectedModel: "fixture", openingDraftRef: { current: null }, draftRef: { current: null }, send: dispatch, steer: dispatch, applyText: (text: string) => { textRef.current = text; }, setSetupOpen: () => assert.fail("Unexpected setup"), openModelPicker: () => assert.fail("Unexpected model picker"), deliverOpeningPrompt: () => assert.fail("Unexpected opening") };
	const onSend = new Function(...Object.keys(env), transpile(source, { target: ScriptTarget.ESNext }) + "\nreturn onSend;")(...Object.values(env)) as () => void;
	onSend(); accepted = original; await model.check();
	assert.equal(model.attempt, undefined);
	finish(); await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(posts, []);
	assert.equal(textRef.current, "Newer unsent explanation");
	assert.equal(model.draft("composer")!.editor.text, "Newer unsent explanation");
});

it("the actual choice dock permits ordinary recovery with empty newer choices but refuses an empty new answer", async () => {
	const local = device(), writing = { id: "writing_choice", createdAt: "2026-11-05" };
	const input = { question: "Choose", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], multiSelect: true };
	const model = new HandwritingSubmission("chat", { device: local, changed: () => {}, fetch: async () => Response.json({ messages: [{ role: "assistant", content: [{ type: "toolCall", id: "question", name: "ask_user_question", arguments: input }] }], turnInFlight: false }), review: async () => ({ pending: [writing], pageAttachments: {} }) });
	await model.open();
	await model.submit({ type: "answer", toolCallId: "question", answer: { kind: "ask", questionText: "Choose", dontKnow: false, answers: [{ label: "A", value: "a", index: 1 }], answeredAt: "2026-11-05T00:00:00.000Z" }, writingIds: [writing.id] }, [writing], model.edit("question:question", { selection: { selected: [0], otherSelected: false, dontKnow: false } }), async () => {});
	assert.equal(model.canRetry, true);
	model.edit("question:question", { selection: { selected: [], otherSelected: false, dontKnow: false } });
	const bridge = { model, ready: true, epoch: 0, preparing: false, hasAttempt: () => !!model.attempt, blocked: () => false } as NonNullable<ContextType<typeof HandwritingSubmissionContext>>;
	const render = (value: typeof bridge | null) => renderToStaticMarkup(createElement(HandwritingSubmissionContext.Provider, { value }, createElement(QuestionDock, { toolName: "ask_user_question", toolCallId: "question", input, expanded: true, onExpand() {}, onSubmit() { assert.fail("Rendering must not submit"); } })));
	const submitButton = (html: string) => html.match(/<button[^>]*type="submit"[^>]*>/)![0];
	assert.doesNotMatch(submitButton(render(bridge)), /\sdisabled=/);
	assert.match(submitButton(render(null)), /\sdisabled=/);
});
