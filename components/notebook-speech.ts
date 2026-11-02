import { notebookSpeechRunSchema, sameDraftOwner, type DictationCaptureAdapter, type DictationFinal, type NotebookSpeechApply, type NotebookSpeechRun, type NotebookSpeechTarget, type NotebookView, type TutorDraftOwner } from "@/src/core";
import type { DraftRecoveryStorage } from "./notebook-tutor-drafts";
import type { NotebookSession } from "./notebook-session";

export type NotebookSpeechInput = { kind: "notebook" } | { kind: "tutor"; owner: TutorDraftOwner; text?: string; partId?: string };
type Boundary = { at: number; target: NotebookSpeechTarget; manual: boolean; tutor: Extract<NotebookSpeechInput, { kind: "tutor" }> };
type SpeechCommand = { type: "speech-run"; expectedRevision: number; run: NotebookSpeechRun };

/** Source-owned hidden speech. The session's existing save rail is the only
 * network path; revealing is one atomic draft update, never a submission. */
export function createNotebookSpeech(chatId: string, session: Pick<NotebookSession, "tutor" | "dispatch" | "getSnapshot">, storage?: DraftRecoveryStorage) {
	const key = `lh:notebook-speech:${chatId}`;
	let pending: SpeechCommand[] = [];
	let tail: Promise<void> = Promise.resolve();
	let initialized = false;
	const runs = new Map<string, NotebookSpeechRun>();
	let config: { tutor: () => Extract<NotebookSpeechInput, { kind: "tutor" }>; select: (input: NotebookSpeechInput) => void } = { tutor: () => ({ kind: "tutor", owner: { kind: "ordinary" } }), select: () => {} };
	let selected: NotebookSpeechInput | null = null;
	const listeners = new Set<() => void>();
	let state = { active: false, destination: "tutor" as "tutor" | "notebook", error: null as string | null };
	function publish(error = state.error) { state = { active: active !== null, destination: selected?.kind ?? "tutor", error }; for (const listener of listeners) listener(); }
	let active: { run: NotebookSpeechRun; now: () => number; boundaries: Boundary[]; results: Map<string, DictationFinal>; consumed: Set<string>; utterance: string[]; notebookDraftId: string; captureStart: number; audioStarted?: boolean; intents: Array<{ id: string; speech: NotebookSpeechApply; cursorLineId?: string | null }> } | null = null;
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
		if (input.kind === "notebook") return { kind: "notebook", draftId: active?.notebookDraftId ?? session.getSnapshot().view!.draft.id };
		let draft = session.tutor.draft(input.owner);
		if (!draft) { session.tutor.updateText(input.owner, input.text ?? ""); draft = session.tutor.draft(input.owner)!; }
		return { kind: "tutor", owner: input.owner, draftId: draft.id, partId: input.partId ?? draft.parts.at(-1)!.id };
	}
	function at(boundaries: Boundary[], time: number): NotebookSpeechTarget | null {
		return boundaries.findLast(boundary => boundary.at <= time)?.target ?? null;
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
				const owner = at(active!.boundaries, word.start);
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
	function choose(input: NotebookSpeechInput, time = active?.now() ?? 0, manual = true) {
		const current = !active || time >= active.boundaries.at(-1)!.at;
		if (current) selected = input;
		if (!active) return;
		if (manual) active.utterance = [];
		const before = at(active.boundaries, time);
		if (before?.kind === "notebook" && input.kind === "tutor") {
			target(input);
			void session.tutor.returnToTutor(input.owner).catch(() => {});
			input = { ...input, partId: undefined }; // return always uses the continuation
		}
		const next = target(input);
		const tutor = input.kind === "tutor" ? input : config.tutor();
		if (!manual && JSON.stringify(before) === JSON.stringify(next) && JSON.stringify(active.boundaries.at(-1)?.tutor.owner) === JSON.stringify(tutor.owner)) return;
		active.boundaries.push({ at: time, target: next, manual, tutor }); active.boundaries.sort((a, b) => a.at - b.at);
		if (!manual && current) config.select(input);
		publish(); rebuild(); void save(active.run).catch(() => {});
	}
	function command(ids: string[]) {
		if (!active) return false;
		const results = ids.map(id => active!.results.get(id)!);
		const text = results.map(result => result.text).join(" ").toLowerCase().replace(/[.,!?;:]/g, "").replace(/\s+/g, " ").trim();
		if (text !== "switch to notebook" && text !== "switch to tutor" && text !== "apply changes") return false;
		const words = results.flatMap(result => result.words);
		if (!words.length || results.some(result => result.text.trim() && !result.words.length)) return false;
		const first = words[0]!.start; const last = words.at(-1)!.start;
		if (active.boundaries.some(boundary => boundary.manual && boundary.at > first && boundary.at <= last)) return false;
		if (text === "apply changes") {
			const boundary = active.boundaries.findLast(boundary => boundary.at <= first);
			if (boundary?.target.kind !== "notebook") return false;
			for (const id of ids) active.consumed.add(id);
			rebuild();
			const draftId = boundary.target.draftId;
			const nextDraftId = crypto.randomUUID();
			active.boundaries.push({ ...boundary, at: last, target: { kind: "notebook", draftId: nextDraftId }, manual: false });
			active.boundaries.sort((a, b) => a.at - b.at); rebuild();
			active.notebookDraftId = nextDraftId;
			const intent = { id: crypto.randomUUID(), cursorLineId: session.getSnapshot().cursorLineId, speech: { runId: active.run.id, draftId, nextDraftId, fragmentIds: [], text: "", prefix: session.getSnapshot().draftText, commandIds: ids, cutoff: last, ready: false, resolves: session.getSnapshot().view?.problem?.operationId } };
			active.intents.push(intent); updateIntents(intent.id);
			return true;
		}
		for (const id of ids) active.consumed.add(id);
		const tutor = active.boundaries.findLast(boundary => boundary.at <= first)?.tutor ?? config.tutor();
		choose(text === "switch to notebook" ? { kind: "notebook" } : tutor, last, false);
		return true;
	}
	function updateIntents(created?: string) {
		if (!active) return;
		let through = active.captureStart;
		for (const result of [...active.results.values()].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))) {
			if (result.start === null || result.end === null || result.start > through + 1 / 16000) break;
			through = Math.max(through, result.end);
		}
		for (const intent of active.intents) {
			if (intent.speech.ready) continue;
			const fragments = active.run.fragments.filter(fragment => fragment.target?.kind === "notebook" && fragment.target.draftId === intent.speech.draftId).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
			const speech = { ...intent.speech, fragmentIds: fragments.map(fragment => fragment.id), text: fragments.map(fragment => fragment.text).join(" "),
				ready: !active.run.incomplete && through >= Math.max(intent.speech.cutoff, ...fragments.map(fragment => fragment.end ?? Infinity)) };
			if (created === intent.id || JSON.stringify(speech) !== JSON.stringify(intent.speech)) {
				intent.speech = speech;
				void session.dispatch({ type: "apply", id: intent.id, cursorLineId: intent.cursorLineId, speech }).catch(() => {});
			}
		}
	}
	const begin: DictationCaptureAdapter["begin"] = async clock => {
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
		selected = initial;
		const run: NotebookSpeechRun = { id: clock.id, revision: 0, status: "recording", incomplete: false, fragments: [] };
		active = { run, now: clock.now, boundaries: [{ at: clock.now(), target: target(initial), manual: true, tutor: initial.kind === "tutor" ? initial : config.tutor() }], results: new Map(), consumed: new Set(), utterance: [], notebookDraftId: session.getSnapshot().view!.draft.id, captureStart: clock.now(), intents: [] };
		publish();
		try { await save(run); }
		catch (error) {
			active = null; publish(); run.status = "interrupted"; run.incomplete = true;
			void save(run).catch(() => {});
			throw error;
		}
		return {
			audio(start) { if (active?.run === run && !active.audioStarted) { active.captureStart = start; active.audioStarted = true; } },
			final(result) {
				if (active?.run !== run || active.results.has(result.id)) return;
				active.results.set(result.id, result);
				if (command([result.id])) active.utterance = [];
				else {
					active.utterance.push(result.id);
					if (result.speechFinal) { command(active.utterance); active.utterance = []; }
				}
				rebuild(); updateIntents(); void save(run).catch(() => {});
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
		followTutor() { choose(selected?.kind === "notebook" ? { kind: "notebook" } : config.tutor(), active?.now() ?? 0, false); },
		getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
	};
}
