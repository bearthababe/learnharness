import { notebookSpeechRunSchema, sameDraftOwner, type NotebookExpressionSelection, type DictationCaptureAdapter, type DictationFinal, type NotebookSpeechApply, type NotebookSpeechRun, type NotebookSpeechTarget, type NotebookView, type TutorDraftOwner } from "@/src/core";
import type { DraftRecoveryStorage } from "./notebook-tutor-drafts";
import type { NotebookSession } from "./notebook-session";

export type NotebookSpeechInput = { kind: "notebook" } | { kind: "tutor"; owner: TutorDraftOwner; text?: string; partId?: string };
type SpeechCommand = { type: "speech-run"; expectedRevision: number; run: NotebookSpeechRun };

/** Source-owned hidden speech. The session's existing save rail is the only
 * network path; revealing is one atomic draft update, never a submission. */
export function createNotebookSpeech(chatId: string, session: Pick<NotebookSession, "tutor" | "dispatch" | "getSnapshot" | "settle">, storage?: DraftRecoveryStorage) {
	const key = `lh:notebook-speech:${chatId}`;
	let pending: SpeechCommand[] = [];
	let tail: Promise<void> = Promise.resolve();
	let initialized = false;
	const runs = new Map<string, NotebookSpeechRun>();
	let config: { tutor: () => Extract<NotebookSpeechInput, { kind: "tutor" }>; select: (input: NotebookSpeechInput) => void; finish?: () => Promise<void> } = { tutor: () => ({ kind: "tutor", owner: { kind: "ordinary" } }), select: () => {} };
	let selected: NotebookSpeechInput | null = null;
	const listeners = new Set<() => void>();
	let handoff: Promise<void> | undefined;
	let state = { active: false, switching: false, destination: "tutor" as "tutor" | "notebook", error: null as string | null };
	function publish(error = state.error) { state = { active: active !== null, switching: !!handoff, destination: selected?.kind ?? "tutor", error }; for (const listener of listeners) listener(); }
	let active: { run: NotebookSpeechRun; now: () => number; requestFinalization?: (cutoff: number) => void; source: NotebookSpeechTarget; results: Map<string, DictationFinal>; consumed: Set<string>; captureStart: number; audioStarted?: boolean; intents: Array<{ id: string; clicked: boolean; finalizationRequests: number; speech: NotebookSpeechApply; cursorLineId?: string | null; expressionSelection: NotebookExpressionSelection | null }> } | null = null;
	function stash() {
		try { if (pending.length) storage?.setItem(key, JSON.stringify(pending)); else storage?.removeItem(key); }
		catch { publish("Local dictation recovery could not be saved. Keep this page open until the server save succeeds."); }
	}
	async function flush() {
		await session.tutor.idle();
		while (pending.length) {
			const command = pending[0]!;
			await session.dispatch(command);
			pending = pending.filter(item => item !== command);
			stash();
		}
	}
	function save(run: NotebookSpeechRun) {
		const expectedRevision = run.revision++;
		runs.set(run.id, structuredClone(run));
		pending.push({ type: "speech-run", expectedRevision, run: structuredClone(run) });
		stash();
		const task = tail.then(flush);
		tail = task.catch(() => {});
		return task;
	}
	function adopt(view: NotebookView) {
		const hydrating = !initialized;
		if (!initialized) {
			initialized = true;
			const raw = storage?.getItem(key);
			if (raw) {
				pending = JSON.parse(raw) as SpeechCommand[];
				for (const command of pending) { notebookSpeechRunSchema.parse(command.run); runs.set(command.run.id, structuredClone(command.run)); }
			}
		}
		for (const remote of view.speechRuns ?? []) {
			pending = pending.filter(command => command.run.id !== remote.id || command.run.revision > remote.revision);
			if ((runs.get(remote.id)?.revision ?? -1) <= remote.revision) runs.set(remote.id, structuredClone(remote));
		}
		stash();
		for (const run of runs.values()) if (run.status === "recording" && run.id !== active?.run.id) {
			run.status = "interrupted"; run.incomplete = true;
			void save(run).catch(() => {});
		}
		if (hydrating && pending.length) tail = tail.then(flush).catch(() => {});
	}
	function target(input: NotebookSpeechInput): NotebookSpeechTarget {
		if (input.kind === "notebook") return { kind: "notebook", draftId: session.getSnapshot().view!.draft.id };
		let draft = session.tutor.draft(input.owner);
		if (!draft) { session.tutor.updateText(input.owner, input.text ?? ""); draft = session.tutor.draft(input.owner)!; }
		return { kind: "tutor", owner: input.owner, draftId: draft.id, partId: input.partId ?? draft.parts.at(-1)!.id };
	}
	function at(time: number): NotebookSpeechTarget | null {
		if (!active) return null;
		if (active.source.kind === "tutor") return active.source;
		const preceding = active.intents.findLast(intent => intent.speech.cutoff <= time);
		return { kind: "notebook", draftId: preceding?.speech.nextDraftId ?? active.source.draftId };
	}
	function rebuild() {
		if (!active) return;
		active.run.fragments = [...active.results.values()].flatMap(result => {
			if (!result.text.trim() || active!.consumed.has(result.id)) return [];
			if (!result.words.length || result.start === null || result.end === null) {
				active!.run.incomplete = true;
				return [{ id: result.id, start: result.start, end: result.end, text: result.text, target: null }];
			}
			const groups: NotebookSpeechRun["fragments"] = [];
			for (const word of result.words) {
				const owner = at(word.start);
				const last = groups.at(-1);
				if (last && JSON.stringify(last.target) === JSON.stringify(owner)) { last.text += ` ${word.text}`; last.end = word.end; }
				else groups.push({ id: `${result.id}:${groups.length}`, start: word.start, end: word.end, text: word.text, target: owner });
			}
			if (groups.length === 1) groups[0]!.text = result.text;
			else if (result.words.map(word => word.text).join("").toLowerCase() !== result.text.replace(/\s+/g, "").toLowerCase()) {
				active!.run.incomplete = true;
				return [{ id: result.id, start: result.start, end: result.end, text: result.text, target: null }];
			}
			return groups;
		});
	}
	function choose(input: NotebookSpeechInput, closing = false): Promise<void> {
		if (handoff) return handoff;
		if (selected?.kind === "notebook" && input.kind === "notebook") return Promise.resolve();
		if (selected?.kind === "tutor" && input.kind === "tutor" && sameDraftOwner(selected.owner, input.owner)) {
			const latest = session.tutor.draft(input.owner)?.parts.at(-1)?.id;
			const currentPart = active?.source.kind === "tutor" ? active.source.partId : selected.partId ?? latest;
			if (currentPart === (input.partId ?? latest) && !(closing && active)) return Promise.resolve();
		}
		const returning = selected?.kind === "notebook" && input.kind === "tutor";
		if (!active && !returning) { selected = input; config.select(input); publish(null); return Promise.resolve(); }
		handoff = Promise.resolve().then(async () => {
			if (active) {
				if (!config.finish) throw new Error("Finish dictation before switching inputs.");
				await config.finish();
				if (active) throw new Error("Finish dictation before switching inputs.");
			}
			await session.settle(closing);
			if (returning && input.kind === "tutor") {
				target(input);
				await session.tutor.returnToTutor(input.owner, closing && session.getSnapshot().view?.problem?.status === "clarification");
				input = { ...input, partId: undefined };
			}
			selected = input;
		}).then(() => { publish(null); }, error => { publish(error instanceof Error ? error.message : "Notebook unavailable"); throw error; }).finally(() => {
			handoff = undefined; publish();
			if (selected) config.select(selected);
		});
		publish();
		return handoff;
	}
	function command(ids: string[]) {
		if (!active) return false;
		const results = ids.map(id => active!.results.get(id)!);
		const text = results.map(result => result.text).join(" ").toLowerCase().replace(/[.,!?;:]/g, "").replace(/\s+/g, " ").trim();
		if (text !== "switch to notebook" && text !== "switch to tutor" && text !== "apply changes") return false;
		const words = results.flatMap(result => result.words);
		if (!words.length || results.some(result => result.text.trim() && !result.words.length)) return false;
		const first = words[0]!.start; const last = words.at(-1)!.start;
		if (text === "apply changes") {
			const owner = at(first);
			if (owner?.kind !== "notebook") return false;
			for (const id of ids) active.consumed.add(id);
			rebuild();
			const covered = active.intents.find(intent => intent.clicked && intent.speech.draftId === owner.draftId && intent.speech.cutoff > last);
			if (covered) {
				covered.speech = { ...covered.speech, commandIds: [...covered.speech.commandIds, ...ids] };
				return true;
			}
			if (session.getSnapshot().editing) { publish("Still applying. Apply again when finished"); return true; }
			reserveApply(last, ids);
			return true;
		}
		for (const id of ids) active.consumed.add(id);
		void choose(text === "switch to notebook" ? { kind: "notebook" } : config.tutor()).catch(() => {});
		return true;
	}
	function reserveApply(cutoff: number, commandIds: string[]) {
		if (!active) return false;
		const owner = at(cutoff);
		if (owner?.kind !== "notebook") return false;
		const draftId = owner.draftId;
		const nextDraftId = crypto.randomUUID();
		const intent = { id: crypto.randomUUID(), clicked: commandIds.length === 0, finalizationRequests: 0, cursorLineId: session.getSnapshot().cursorLineId, expressionSelection: structuredClone(session.getSnapshot().expressionSelection ?? null), speech: { runId: active.run.id, draftId, nextDraftId, fragmentIds: [], text: "", prefix: session.getSnapshot().draftText, commandIds, cutoff, ready: false, resolves: session.getSnapshot().view?.problem?.operationId } };
		active.intents.push(intent); rebuild(); updateIntents(intent.id);
		return true;
	}
	function recognizeCommands() {
		if (!active) return;
		const through = finalizedThrough();
		let utterance: string[] = [];
		// Finalization still interprets the original recording in source order.
		// A handoff changes destination only after its final commands and edit settle.
		for (const result of [...active.results.values()].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))) {
			if (result.end === null || result.end > through) break;
			if (active.consumed.has(result.id)) { utterance = []; continue; }
			if (command([result.id])) { utterance = []; continue; }
			utterance.push(result.id);
			if (result.speechFinal) { command(utterance); utterance = []; }
		}
	}
	function finalizedThrough() {
		if (!active) return 0;
		let through = active.captureStart;
		for (const result of [...active.results.values()].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))) {
			if (result.start === null || result.end === null || result.start > through + 1 / 16000) break;
			through = Math.max(through, result.end);
		}
		return through;
	}
	function updateIntents(created?: string) {
		if (!active) return;
		const through = finalizedThrough();
		for (const intent of active.intents) {
			if (created && intent.id !== created) continue;
			if (intent.speech.ready) continue;
			const fragments = active.run.fragments.filter(fragment => fragment.target?.kind === "notebook" && fragment.target.draftId === intent.speech.draftId).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
			const speech = { ...intent.speech, fragmentIds: fragments.map(fragment => fragment.id), text: fragments.map(fragment => fragment.text).join(" "),
				ready: !created && !active.run.incomplete && through > intent.speech.cutoff && through >= Math.max(...fragments.map(fragment => fragment.end ?? Infinity)) };
			if (created === intent.id || JSON.stringify(speech) !== JSON.stringify(intent.speech)) {
				intent.speech = speech;
				void session.dispatch({ type: "apply", id: intent.id, cursorLineId: intent.cursorLineId, expressionSelection: intent.expressionSelection, speech }).catch(() => {});
			}
		}
	}
	function requestFinalization(followup = false) {
		if (!active?.requestFinalization || active.run.incomplete) return;
		const intent = active.intents.findLast(item => item.clicked && !item.speech.ready);
		if (!intent || intent.finalizationRequests !== (followup ? 1 : 0) || finalizedThrough() > intent.speech.cutoff) return;
		// At most one follow-up when a flush stopped short. Neither the response
		// flag nor requesting another flush changes the existing readiness rule.
		intent.finalizationRequests++;
		active.requestFinalization(intent.speech.cutoff);
	}
	function requireRecordingReady() {
		if (handoff) throw new Error("Finish switching inputs before recording.");
		if (session.tutor.getSnapshot().locked) throw new Error("Finish sending before recording.");
	}
	const begin: DictationCaptureAdapter["begin"] = async clock => {
		requireRecordingReady();
		// Reserve existing visible text before initializing Notebook can mount its
		// durable draft adapter. Creation of the record must never erase prefill.
		const applicable = config.tutor();
		const initial = !selected ? applicable : selected.kind === "tutor" && sameDraftOwner(selected.owner, applicable.owner)
			? { ...applicable, partId: selected.partId ?? applicable.partId } : selected;
		if (initial.kind === "tutor") target(initial);
		await tail;
		if (pending.length) await flush();
		await session.tutor.idle();
		if (!session.getSnapshot().view?.contextId) await session.dispatch({ type: "visibility", visible: false });
		requireRecordingReady();
		selected = initial;
		const run: NotebookSpeechRun = { id: clock.id, revision: 0, status: "recording", incomplete: false, fragments: [] };
		active = { run, now: clock.now, requestFinalization: clock.requestFinalization, source: target(initial), results: new Map(), consumed: new Set(), captureStart: clock.now(), intents: [] };
		publish();
		try {
			await save(run);
		}
		catch (error) {
			active = null; publish(); run.status = "interrupted"; run.incomplete = true;
			void save(run).catch(() => {});
			throw error;
		}
		return {
			audio(start) { if (active?.run === run && !active.audioStarted) { active.captureStart = start; active.audioStarted = true; } },
			final(result) {
				if (active?.run !== run) return;
				if (!active.results.has(result.id)) {
					active.results.set(result.id, result);
					recognizeCommands();
					rebuild(); updateIntents(); void save(run).catch(() => {});
				}
				// Deepgram can attach the flush flag to an already received span.
				// Observe that hint without duplicating words or command handling.
				if (result.fromFinalize) requestFinalization(true);
			},
			incomplete() { if (active?.run === run) { run.incomplete = true; void save(run).catch(() => {}); } },
			async end(reason) {
				if (active?.run !== run) return;
				if (active.intents.some(intent => !intent.speech.ready)) run.incomplete = true;
				active = null;
				publish();
				run.status = reason === "cancel" ? "cancelled" : reason === "interrupted" || run.incomplete ? "interrupted" : "revealed";
				if (reason === "cancel") run.fragments = [];
				if (reason === "interrupted") run.incomplete = true;
				await save(run);
				if (reason === "stop" && run.incomplete) throw new Error("Recording interrupted. Review the restored words before sending.");
			},
		};
	};
	return { begin, choose, adopt, configure(next: typeof config) { config = next; }, isActive: () => active !== null, async idle() { await tail; },
		async closeNotebook(input: Extract<NotebookSpeechInput, { kind: "tutor" }>) {
			await choose(input, true);
			// A reloaded page may not have selected either field yet. Closing
			// still owns a settled attachment boundary; repeated capture dedupes.
			await session.settle(true);
			target(input);
			await session.tutor.returnToTutor(input.owner, session.getSnapshot().view?.problem?.status === "clarification");
			await session.dispatch({ type: "visibility", visible: false });
		},
		apply() {
			if (active && (handoff || session.getSnapshot().editing)) { publish("Still applying. Apply again when finished"); return true; }
			if (!active || !reserveApply(active.now(), [])) return false;
			updateIntents();
			requestFinalization();
			void save(active.run).catch(() => {}); return true;
		},
		followTutor() { void choose(selected?.kind === "notebook" ? { kind: "notebook" } : config.tutor()).catch(() => {}); },
		getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
	};
}
