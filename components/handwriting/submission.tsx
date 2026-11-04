"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canonicalHandwriting, type ChatInput, type SharedWriting, type WritingInputOutcome } from "@/src/core";
import { HandwritingSubmission } from "./submission-recovery";
import { handwritingTransferDevice, type EditorSnapshot } from "./transfer-device";
import { HandwritingAttachment, type AttachmentReview } from "./attachment";
import { encodeHandwritingRaster } from "./render";
import { HANDWRITING_DELETED_EVENT } from "./device";

type Field = { targetKey: string; active: () => boolean; read: () => EditorSnapshot; restore: (editor: EditorSnapshot) => void };
type Bridge = ReturnType<typeof useHandwritingSubmission>;
export const HandwritingSubmissionContext = createContext<Bridge | null>(null);

export function useHandwritingSubmission(chatId: string, review: () => Promise<AttachmentReview>, send: (input: ChatInput, accepted?: () => void, outcome?: (value: WritingInputOutcome) => void) => Promise<boolean>, pending: SharedWriting[]) {
	const [epoch, render] = useState(0), [ready, setReady] = useState(false), [preparing, setPreparing] = useState(false);
	const preparingRef = useRef(false), fields = useRef(new Map<string, Field>()), callbacks = useRef({ review, send, pending }); callbacks.current = { review, send, pending };
	const modelRef = useRef<HandwritingSubmission | null>(null);
	const attachmentRef = useRef<HandwritingAttachment | null>(null), notebookView = useRef<{ canUpdate: () => boolean; reveal: () => void } | null>(null);
	useEffect(() => {
		let mounted = true;
		const changed = () => { if (mounted && (notebookView.current?.canUpdate() ?? true)) render(value => value + 1); };
		const model = new HandwritingSubmission(chatId, { device: handwritingTransferDevice, fetch: (...args) => fetch(...args), review: () => callbacks.current.review(), changed: () => { if (mounted) render(value => value + 1); } });
		modelRef.current = model;
		const attachment = new HandwritingAttachment(chatId, { device: handwritingTransferDevice, fetch: (...args) => fetch(...args), encode: encodeHandwritingRaster, refresh: () => callbacks.current.review(), reveal: () => notebookView.current?.reveal(), changed });
		attachmentRef.current = attachment; void attachment.open();
		void model.open().then(() => { if (mounted) setReady(true); });
		const deleted = (event: Event) => { if ((event as CustomEvent<string>).detail === chatId) { model.sessionDeleted(); attachment.sessionDeleted(); } };
		window.addEventListener(HANDWRITING_DELETED_EVENT, deleted);
		return () => { mounted = false; model.dispose(); attachment.dispose(); window.removeEventListener(HANDWRITING_DELETED_EVENT, deleted); };
	}, [chatId]);
	const actions = useMemo(() => ({
		attachment() { return attachmentRef.current; },
		registerNotebook(view: { canUpdate: () => boolean; reveal: () => void }) { notebookView.current = view; return () => { if (notebookView.current === view) notebookView.current = null; }; },
		refreshNotices() { render(value => value + 1); },
		refreshReview() { return callbacks.current.review(); },
		reviewed() { return structuredClone(callbacks.current.pending); },
		register(field: Field) { fields.current.set(field.targetKey, field); return () => { if (fields.current.get(field.targetKey) === field) fields.current.delete(field.targetKey); }; },
		activeField() { return [...fields.current.values()].find(field => field.active()); },
		field(targetKey: string) { return fields.current.get(targetKey); },
		claim() { if (preparingRef.current || modelRef.current?.busy) return false; preparingRef.current = true; setPreparing(true); return true; },
		release() { preparingRef.current = false; setPreparing(false); },
		blocked() { return preparingRef.current || !!modelRef.current?.busy || !!modelRef.current?.attempt; },
		checkpoint(targetKey: string) { const field = fields.current.get(targetKey), model = modelRef.current; if (!field || !model) throw new Error("Editor unavailable"); return model.checkpoint(targetKey, field.read()); },
		async submit(input: ChatInput, images: SharedWriting[], targetKey: string, extraEditor: EditorSnapshot = {}) {
			const model = modelRef.current, field = fields.current.get(targetKey);
			if (!model || !field || preparingRef.current) return false;
			const draft = model.checkpoint(targetKey, { ...field.read(), ...extraEditor });
			return model.submit(input, images, draft, (value, outcome) => callbacks.current.send(value, undefined, outcome));
		},
		check() { return modelRef.current?.check(); },
		retry() { return modelRef.current?.retry((value, outcome) => callbacks.current.send(value, undefined, outcome)); },
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
		}
		lastDraft.current = draft ? canonicalHandwriting(draft.editor) : null;
		model.edit(targetKey, mirrors.current.read());
	}, [bridge?.ready, bridge?.model, bridge?.epoch, targetKey, snapshot]);
	return bridge;
}

export function HandwritingDeliveryNotice({ bridge, activeTarget }: { bridge: Bridge; activeTarget?: string }) {
	const model = bridge.model, attempt = model?.attempt;
	return <div className="text-xs" data-testid="handwriting-delivery">
		{bridge.attachment()?.noticeEntries().map(({ pageId, text, retry }) => <p role="status" key={pageId}>{text}{retry && <button type="button" className="min-h-11 px-2 underline" onClick={() => void bridge.attachment()?.retry(pageId)}>Retry</button>}{text.includes("refresh review") && <button type="button" className="min-h-11 px-2 underline" onClick={() => void bridge.refreshReview().catch(() => {})}>Refresh review</button>}</p>)}
		{model?.notice && <p role="status">{model.notice}{attempt && <button type="button" className="min-h-11 px-2 underline" disabled={model.busy} onClick={() => void bridge.check()}>Check delivery</button>}</p>}
		{attempt && <><details><summary>Saved answer</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify({ input: attempt.input, images: attempt.imageVersions }, null, 2)}</pre><p>Later edits are not part of this saved answer.</p></details>{model.canRetry && <button type="button" className="min-h-11 underline" disabled={model.busy} onClick={() => void bridge.retry()}>Retry saved answer</button>}</>}
		{model?.savedDrafts().filter(draft => draft.targetKey !== activeTarget && !bridge.field(draft.targetKey)).map(draft => <details key={draft.draftId}><summary>Saved draft</summary><p>This draft belongs to an earlier question.</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(draft.editor, null, 2)}</pre></details>)}
	</div>;
}
