import assert from "node:assert/strict";
import { it } from "node:test";
import { HandwritingAttachment } from "../components/handwriting/attachment.ts";
import { HandwritingSubmission } from "../components/handwriting/submission-recovery.ts";
import type { TransferDevice, TransferSnapshot, CaptureRecord, DurableDraft, SubmissionAttempt, CaptureReceipt } from "../components/handwriting/transfer-device.ts";
import { notebookSource, emptyHandwriting } from "../src/core/handwriting.ts";
import { writingSubmissionReceipt } from "../src/server/writing-submission.ts";
import { parseChatInput } from "../src/core/input-events.ts";

function device(): TransferDevice {
	const saved: TransferSnapshot = { captures: [], drafts: [], submissions: [], captureReceipts: [] };
	return {
		async open() { return 0; }, async read() { return structuredClone(saved); },
		async saveDraft(_chat, _generation, draft: DurableDraft) { saved.drafts = [structuredClone(draft)]; },
		async saveCapture(_chat, _generation, capture: CaptureRecord, draft?: DurableDraft) { saved.captures = [structuredClone(capture)]; if (draft) saved.drafts = [structuredClone(draft)]; },
		async finishCapture(_chat, _generation, _writingId, receipt: CaptureReceipt) { saved.captures = []; saved.captureReceipts = [receipt]; },
		async saveSubmission(_chat, _generation, attempt: SubmissionAttempt, draft?: DurableDraft) { saved.submissions = [structuredClone(attempt)]; if (draft) saved.drafts = [structuredClone(draft)]; },
		async finishSubmission() { saved.submissions = []; }, async deleteChat() { saved.captures = []; saved.submissions = []; saved.drafts = []; },
	};
}
it("Attach saves finalized explanation and detached source before upload, then reload Retry reuses the exact identity and PNG", async () => {
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
	assert.equal(requests.length, 1, "Reopen does not silently upload");
	await reopened.retry("page_initial");
	assert.equal(requests[0]!.get("writingId"), requests[1]!.get("writingId"));
	assert.equal(await (requests[1]!.get("image") as Blob).text(), "frozen PNG");
	assert.equal(await (requests[0]!.get("source") as Blob).text(), await (requests[1]!.get("source") as Blob).text());
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
