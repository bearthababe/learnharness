"use client";
import { useDeploymentActivity } from "../deployment-activity";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canonicalHandwriting, type ChatInput, type SharedWriting, type WritingInputOutcome } from "@/src/core";
import { HandwritingSubmission } from "./submission-recovery";
import { handwritingTransferDevice, type EditorSnapshot } from "./transfer-device";
import { HandwritingAttachment, type AttachmentReview } from "./attachment";
import { encodeHandwritingRaster } from "./render";
import { HANDWRITING_DELETED_EVENT } from "./device";
import { useServerEvent, useServerResync } from "../server-events";
import { SharedWritingImages } from "../shared-writing";

type Field = { targetKey: string; active: () => boolean; read: () => EditorSnapshot; restore: (editor: EditorSnapshot) => void };
type Bridge = ReturnType<typeof useHandwritingSubmission>;
export const HandwritingSubmissionContext = createContext<Bridge | null>(null);

export function useHandwritingSubmission(chatId: string, review: () => Promise<AttachmentReview>, send: (input: ChatInput, accepted?: () => void, outcome?: (value: WritingInputOutcome) => void) => Promise<boolean>, pending: SharedWriting[]) {
	const [epoch, render] = useState(0), [ready, setReady] = useState(false), [preparing, setPreparing] = useState(false);
	const preparingRef = useRef(false), fields = useRef(new Map<string, Field>()), callbacks = useRef({ review, send, pending }); callbacks.current = { review, send, pending };
	useDeploymentActivity("upload-or-handwriting-submission", () => preparingRef.current || !!modelRef.current?.busy || !!modelRef.current?.attempt || !!attachmentRef.current?.noticeEntries().some(entry => attachmentRef.current?.busy(entry.pageId)));
	const modelRef = useRef<HandwritingSubmission | null>(null);
	const attachmentRef = useRef<HandwritingAttachment | null>(null), notebookView = useRef<{ canUpdate: () => boolean; reveal: (pageId: string) => void } | null>(null);
	const reconcile = () => { const model = modelRef.current; if (model?.attempt && !model.busy) void model.check(); };
	useServerEvent("record-changed", event => { if (event.chatId === chatId) reconcile(); });
	useServerEvent("writing-changed", event => { if (event.chatId === chatId) reconcile(); });
	useServerEvent("turn-settled", event => { if (event.chatId === chatId) reconcile(); });
	useServerResync(reconcile);
	useEffect(() => {
		let mounted = true;
		const changed = () => { if (mounted && (notebookView.current?.canUpdate() ?? true)) render(value => value + 1); };
		const sessionReview = callbacks.current.review;
		const model = new HandwritingSubmission(chatId, { device: handwritingTransferDevice, fetch: (...args) => fetch(...args), review: sessionReview, changed: () => { if (mounted) render(value => value + 1); }, journal: () => window.localStorage });
		modelRef.current = model;
		const attachment = new HandwritingAttachment(chatId, { device: handwritingTransferDevice, fetch: (...args) => fetch(...args), encode: encodeHandwritingRaster, refresh: sessionReview, reveal: pageId => notebookView.current?.reveal(pageId), changed });
		attachmentRef.current = attachment; void attachment.open();
		void model.open().then(() => { if (mounted) setReady(true); });
		const deleted = (event: Event) => { if ((event as CustomEvent<string>).detail === chatId) { model.sessionDeleted(); attachment.sessionDeleted(); } };
		window.addEventListener(HANDWRITING_DELETED_EVENT, deleted);
		const check = () => { if (!document.hidden && model.attempt && !model.busy) void model.check(); };
		const timer = window.setInterval(check, 5000);
		window.addEventListener("online", check); window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
		const recoverUploads = () => { void attachment.recover(); };
		window.addEventListener("online", recoverUploads);
		return () => { mounted = false; model.dispose(); attachment.dispose(); clearInterval(timer); window.removeEventListener("online", check); window.removeEventListener("online", recoverUploads); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); window.removeEventListener(HANDWRITING_DELETED_EVENT, deleted); };
	}, [chatId]);
	const actions = useMemo(() => ({
		attachment() { return attachmentRef.current; },
		registerNotebook(view: { canUpdate: () => boolean; reveal: (pageId: string) => void }) { notebookView.current = view; return () => { if (notebookView.current === view) notebookView.current = null; }; },
		refreshNotices() { render(value => value + 1); },
		refreshReview() { return callbacks.current.review(); },
		reviewed() { return structuredClone(callbacks.current.pending); },
		register(field: Field) { fields.current.set(field.targetKey, field); return () => { if (fields.current.get(field.targetKey) === field) fields.current.delete(field.targetKey); }; },
		activeField() { return [...fields.current.values()].find(field => field.active()); },
		field(targetKey: string) { return fields.current.get(targetKey); },
		claim() { if (preparingRef.current || modelRef.current?.busy) return false; preparingRef.current = true; setPreparing(true); return true; },
		isPreparing() { return preparingRef.current; },
		release() { preparingRef.current = false; setPreparing(false); },
		blocked() { return preparingRef.current || !!modelRef.current?.busy; },
		hasAttempt() { return !!modelRef.current?.attempt; },
		recoveryAction() {
			const send = callbacks.current.send;
			return modelRef.current?.recoveryAction((value, outcome) => send(value, undefined, outcome));
		},
		retainSpeech(targetKey: string, name: "text" | "thinking" | "readingThinking") {
			const field = fields.current.get(targetKey), model = modelRef.current;
			if (!field || !model) return;
			const editor = structuredClone(field.read()); model.checkpoint(targetKey, editor);
			return (text: string) => model.retainSpeech(targetKey, editor, name, text);
		},
		checkpoint(targetKey: string) { const field = fields.current.get(targetKey), model = modelRef.current; if (!field || !model) throw new Error("Editor unavailable"); return model.checkpoint(targetKey, field.read()); },
		async submit(input: ChatInput, images: SharedWriting[], targetKey: string, extraEditor: EditorSnapshot = {}) {
			const model = modelRef.current, field = fields.current.get(targetKey);
			if (!model || !field || preparingRef.current) return false;
			const draft = model.checkpoint(targetKey, { ...field.read(), ...extraEditor });
			const send = callbacks.current.send;
			return model.submit(input, images, draft, (value, outcome) => send(value, undefined, outcome));
		},
	}), []);
	return { ...actions, model: modelRef.current, ready, epoch, preparing };
}

/** Registers the existing field, including its ref mirrors; it never adds a
 * second editor. Restore is target-bound and never overwrites edits made while
 * the device read was pending. */
export function useHandwritingEditor(targetKey: string, read: () => EditorSnapshot, restore: (editor: EditorSnapshot) => void, active: boolean, explicit?: Bridge) {
	const context = useContext(HandwritingSubmissionContext), bridge = explicit ?? context;
	const mirrors = useRef({ read, restore, active }); mirrors.current = { read, restore, active };
	const baseline = useRef<{ targetKey: string; value: string }>({ targetKey, value: canonicalHandwriting(read()) });
	if (baseline.current.targetKey !== targetKey) baseline.current = { targetKey, value: canonicalHandwriting(read()) };
	const initialized = useRef<string | null>(null), lastDraft = useRef<string | null>(null);
	useLayoutEffect(() => bridge?.register({ targetKey, active: () => mirrors.current.active, read: () => mirrors.current.read(), restore: editor => mirrors.current.restore(editor) }), [bridge?.register, targetKey]);
	const snapshot = canonicalHandwriting(read());
	useLayoutEffect(() => {
		if (!bridge?.ready || !bridge.model) return;
		const model = bridge.model, draft = model.draft(targetKey);
		if (initialized.current !== targetKey) {
			initialized.current = targetKey;
			if (draft && canonicalHandwriting(mirrors.current.read()) === baseline.current.value) mirrors.current.restore(draft.editor);
		} else if (lastDraft.current && !draft) {
			if (canonicalHandwriting(mirrors.current.read()) === lastDraft.current) mirrors.current.restore({});
		} else if (draft && lastDraft.current && canonicalHandwriting(draft.editor) !== lastDraft.current && canonicalHandwriting(mirrors.current.read()) === lastDraft.current) {
			mirrors.current.restore(draft.editor);
		}
		// Compare future recovery against the edit we just recorded, not the
		// previous revision: typing back to earlier text is still a new edit.
		lastDraft.current = canonicalHandwriting(model.edit(targetKey, mirrors.current.read()).editor);
	}, [bridge?.ready, bridge?.model, bridge?.epoch, targetKey, snapshot]);
	return bridge;
}

/** What was sent, in the learner's own words (never the wire format). */
export function describeAttempt(input: ChatInput): string {
	if (input.type === "text") return input.text.trim() ? `“${input.text.trim()}”` : "Your attached pages";
	if (input.type === "thinking") return input.text.trim() ? `Your working: “${input.text.trim()}”` : "Your working";
	if (input.type === "answer") {
		const answer = input.answer;
		const chosen = answer.dontKnow ? "I don't know" : [...answer.answers.map((option) => option.label), answer.other?.trim() ? `Other: ${answer.other.trim()}` : ""].filter(Boolean).join(", ");
		const parts = [answer.questionText ? `Your answer to “${answer.questionText}”` : "Your answer", chosen || answer.text?.trim() || ""].filter(Boolean);
		const why = (answer.thinking ?? answer.note)?.trim();
		return `${parts.join(": ")}${why ? ` — why: “${why}”` : ""}`;
	}
	return "Your last answer";
}
function describeDraft(editor: EditorSnapshot): string {
	const fields = editor as { text?: unknown; thinking?: unknown; other?: unknown; readingThinking?: unknown };
	const text = [fields.text, fields.thinking, fields.other, fields.readingThinking].find((value) => typeof value === "string" && value.trim()) as string | undefined;
	return text ? `“${text.trim()}”` : "Your choices and working";
}

export function HandwritingDeliveryNotice({ bridge, activeTarget }: { bridge: Bridge; activeTarget?: string }) {
	const model = bridge.model, attempt = model?.attempt;
	return <div className="text-xs" data-testid="handwriting-delivery">
		{/* "Attached · not sent" is the tray's own heading; only notices the
		    tray doesn't say (failures, refresh) repeat here (round 11). */}
		{bridge.attachment()?.noticeEntries().filter(({ kind }) => kind !== "attached" && kind !== "updated").map(({ pageId, text, refresh }) => <p role="status" key={pageId}>{text}{refresh && <button type="button" className="min-h-11 px-2 underline" onClick={() => void bridge.refreshReview().catch(() => {})}>Refresh review</button>}</p>)}
		{model?.notice && <p role="status">{model.notice}</p>}
		{attempt && <div data-testid="handwriting-attempt-review" className="lh-attempt-review">
			<p className="lh-attempt-label">Not confirmed yet</p>
			<p className="lh-attempt-summary">{describeAttempt(attempt.input)}</p>
			<SharedWritingImages chatId={attempt.chatId} writing={attempt.imageVersions.map(image => ({ id: image.writingId }))} />
			<p className="lh-attempt-help">Press Send to check: it sends only if it didn’t arrive, never twice. Later edits are not part of this answer.</p>
		</div>}
		{model?.savedDrafts().filter(draft => draft.targetKey !== activeTarget && !bridge.field(draft.targetKey)).map(draft => <div key={draft.draftId} className="lh-attempt-review"><p className="lh-attempt-label">Saved from an earlier question</p><p className="lh-attempt-summary">{describeDraft(draft.editor)}</p></div>)}
	</div>;
}
