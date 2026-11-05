import React, { act } from "react";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import { useDictation, useDictationTarget, dictationCheckpoint, type Dictation } from "../components/dictation.tsx";
import { notifySettingsSaved } from "../components/settings-signal.ts";
import { useDictationLanguage } from "../components/dictation-preference.ts";
import { isDictationActive, useDictationActive } from "../components/dictation-state.ts";
import type { DictationCaptureAdapter, DictationFinal, UserSettings } from "../src/core/index.ts";
import { PracticeDock } from "../components/practice-dock.tsx";
import { QuestionDock } from "../components/question-dock.tsx";
import { NotebookPanel } from "../components/notebook-panel.tsx";
import { useNotebookDestination } from "../components/notebook-destination.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

class Socket extends EventTarget {
	static CONNECTING = 0;
	static OPEN = 1;
	static all: Socket[] = [];
	readyState = Socket.CONNECTING;
	sent: unknown[] = [];
	constructor(readonly url: string, readonly protocols: string[]) { super(); Socket.all.push(this); }
	get language() { return new URL(this.url).searchParams.get("language"); }
	send(data: unknown) { this.sent.push(data); }
	close() { this.readyState = 3; }
	open() { this.readyState = Socket.OPEN; this.dispatchEvent(new Event("open")); }
	end(code = 1000) { this.close(); this.dispatchEvent(Object.assign(new Event("close"), { code })); }
	final(text: string) {
		this.dispatchEvent(Object.assign(new Event("message"), {
			data: JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript: text }] } }),
		}));
	}
}

class AudioGraph {
	static time = 0;
	get currentTime() { return AudioGraph.time; }
	state = "running";
	destination = {};
	audioWorklet = { addModule: async () => {} };
	createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
}
class Worklet {
	static all: Worklet[] = [];
	static autoFlush = true;
	port = {
		onmessage: null as ((event: { data: unknown }) => void) | null,
		postMessage: (message: { type: string }) => {
			if (message.type === "flush" && Worklet.autoFlush) queueMicrotask(() => this.emit({ type: "flushed" }));
		},
	};
	constructor() { Worklet.all.push(this); }
	emit(data: unknown) { this.port.onmessage?.({ data }); }
	connect() {}
	disconnect() {}
}

const globals = globalThis as Record<string, unknown>;
let restore: (() => void) | undefined;
let dispose: (() => Promise<void>) | undefined;

async function fixture(language: "pl" | "en" = "pl", delayedRead?: Promise<Response>, controls?: () => React.ReactNode, capture?: DictationCaptureAdapter) {
	const dom = parseHTML("<html><body><div id='root'></div></body></html>");
	const state = {
		record: { version: 1, dictation: { language } } as UserSettings,
		nextRead: delayedRead,
		nextWrite: undefined as Promise<Response> | undefined,
		nextMic: undefined as Promise<{ getTracks: () => { stop: () => void }[] }> | undefined,
		readFails: false,
		tokenMissing: false,
		reads: 0,
		active: false,
		captures: 0,
		stops: 0,
		appends: [] as string[],
		target: "first" as "first" | "second",
		fields: { first: [] as string[], second: [] as string[] },
	};
	Socket.all = [];
	Worklet.all = []; Worklet.autoFlush = true;
	const previous = new Map<string, PropertyDescriptor | undefined>();
	for (const [key, value] of Object.entries({
		React, window: dom.window, document: dom.document, CustomEvent: dom.window.CustomEvent,
		navigator: { userAgent: "", platform: "", mediaDevices: { getUserMedia: async () => {
			state.captures++;
			if (state.nextMic) return state.nextMic;
			return { getTracks: () => [{ stop() { state.stops++; } }] };
		} } },
		WebSocket: Socket, AudioContext: AudioGraph, AudioWorkletNode: Worklet,
		IS_REACT_ACT_ENVIRONMENT: true,
		fetch: async (url: string, init?: RequestInit) => {
			if (url === "/api/stt/token") return state.tokenMissing ? Response.json({ error: "Missing Deepgram key" }, { status: 503 }) : Response.json({ token: "test-token" });
			if (url === "/api/settings") {
				state.reads++;
				if (state.nextRead) { const response = state.nextRead; state.nextRead = undefined; return response; }
				return state.readFails ? Response.json({}, { status: 500 }) : Response.json({ settings: state.record });
			}
			assert.equal(url, "/api/settings/dictation");
			assert.equal(init?.method, "PUT");
			if (state.nextWrite) { const response = state.nextWrite; state.nextWrite = undefined; return response; }
			state.record = { ...state.record, dictation: JSON.parse(init.body as string) };
			return Response.json({ settings: state.record });
		},
	})) {
		previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
	}
	restore = () => {
		for (const [key, descriptor] of previous) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globals[key];
		}
	};
	const { createRoot } = await import("react-dom/client");
	let latest!: Dictation;
	let setting!: ReturnType<typeof useDictationLanguage>;
	const targets = { first: (text: string) => state.fields.first.push(text), second: (text: string) => state.fields.second.push(text) };
	let claim = false;
	function Harness() {
		latest = useDictation({ append: (text) => state.appends.push(text), capture });
		useDictationTarget(targets[state.target], claim);
		setting = useDictationLanguage();
		state.active = useDictationActive();
		return controls?.() ?? null;
	}
	let root = createRoot(document.getElementById("root")!);
	let firstMount = true;
	const mount = async () => {
		await act(async () => { root.render(<Harness />); });
		// Each fixture is a new server record. Explicitly invalidate a prior
		// fixture's window-lifetime cache, but do not refetch on remounts.
		if (firstMount && setting.language !== undefined) {
			await act(async () => { notifySettingsSaved("dictation"); });
		}
		firstMount = false;
	};
	dispose = async () => { await act(async () => { root.unmount(); }); };
	return {
		state,
		get dictation() { return latest; },
		get setting() { return setting; },
		mount,
		claim: async (target: "first" | "second") => { claim = true; state.target = target; await mount(); },
		unmount: () => dispose!(),
		remount: async () => {
			await dispose!();
			root = createRoot(document.getElementById("root")!);
			await mount();
		},
	};
}

afterEach(async () => { await dispose?.(); restore?.(); dispose = undefined; restore = undefined; });

test("switching mounted practice to Notebook finishes recording and keeps all its final words in practice", async () => {
	const fs = await import("node:fs");
	const dir = fs.mkdtempSync(join(tmpdir(), "notebook-speech-mounted-"));
	process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
	const { chatStore } = await import("../src/store/chats.ts");
	const { createNotebookService } = await import("../src/server/notebook.ts");
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const chat = chatStore.createChat("Mounted speech");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No editor calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true });
	session.tutor.updateText({ kind: "practice", problemCallId: "old" }, "Prefilled."); await session.tutor.idle();
	function Controls() {
		const root = React.useRef<HTMLDivElement>(null);
		useNotebookDestination(root, session, true);
		return <div ref={root}><PracticeDock notebook={session} problemCallId="old" input={{ statement: "Pressure?" }} expanded onExpand={() => {}} onSubmit={() => { throw new Error("Switching cannot submit"); }} /><NotebookPanel session={session} /></div>;
	}
	const f = await fixture("en", undefined, () => <Controls />, session.speech);
	try {
		await f.mount(); AudioGraph.time = 10;
		await act(async () => f.dictation.toggle());
		const socket = Socket.all.at(-1)!;
		await act(async () => { socket.open(); Worklet.all.at(-1)!.emit({ type: "audio", buffer: new Int16Array(64000), contextStart: 10, sampleRate: 16000 }); });
		await act(async () => { AudioGraph.time = 12; document.querySelector('#notebook-instruction')!.dispatchEvent(new window.Event("pointerdown", { bubbles: true })); });
		assert.equal(f.dictation.phase, "stopping");
		await act(async () => socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start: 1, duration: 2, channel: { alternatives: [{ transcript: "Earlier crossing later.", words: [{ word: "Earlier", start: 1.5, end: 1.8 }, { word: "crossing", start: 1.9, end: 2.1 }, { word: "later.", start: 2.2, end: 2.5 }] }] } }) })));
		await act(async () => session.speech.idle());
		assert.equal(document.querySelector('[data-testid="practice-dock"] [data-file-path-input]')!.textContent, "Prefilled.");
		assert.equal(document.querySelector<HTMLTextAreaElement>('#notebook-instruction')!.value, "");
		await act(async () => { socket.end(); await session.speech.choose({ kind: "notebook" }); });
		assert.equal(document.querySelector('[data-testid="practice-dock"] [data-file-path-input]')!.textContent, "Prefilled. Earlier crossing later.");
		assert.equal(document.querySelector<HTMLTextAreaElement>('#notebook-instruction')!.value, "");
		assert.equal(f.dictation.phase, "idle");
		assert.equal(f.state.captures, 1);
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, []);
	} finally { await f.unmount(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the global dictation shortcut cannot record into a submitted Notebook-assisted draft", async () => {
	const fs = await import("node:fs");
	const dir = fs.mkdtempSync(join(tmpdir(), "notebook-shortcut-locked-"));
	process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
	const { chatStore } = await import("../src/store/chats.ts");
	const { createNotebookService } = await import("../src/server/notebook.ts");
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const chat = chatStore.createChat("Shortcut during Send");
	const service = createNotebookService({ chatStore, engine: async () => { throw new Error("No provider calls"); } });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); session.tutor.updateText({ kind: "ordinary" }, "Fixed reasoning."); await session.tutor.idle();
	const f = await fixture("en", undefined, undefined, session.speech);
	try {
		await f.mount(); const prepared = await session.tutor.prepareSubmission({ kind: "ordinary" });
		await act(async () => window.dispatchEvent(new window.Event("lh:kbd-toggle-dictation")));
		assert.match(f.dictation.error!, /Finish sending/);
		assert.equal(f.dictation.phase, "idle"); assert.equal(Socket.all.length, 0);
		assert.equal(session.speech.isActive(), false);
		assert.deepEqual(service.view(chat.id).tutorDrafts![0]!.parts, prepared.explanation);
		assert.deepEqual(service.view(chat.id).speechRuns, []);
	} finally { await f.unmount(); session.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the optional capture adapter receives source-timed finals while normal text stays deferred", async () => {
	const finals: DictationFinal[] = []; const endings: string[] = [];
	const f = await fixture("en", undefined, undefined, { begin: async () => ({ final: result => finals.push(result), incomplete() {}, end: async reason => { endings.push(reason); } }) });
	await f.mount();
	AudioGraph.time = 10;
	await act(async () => f.dictation.toggle());
	const socket = Socket.all.at(-1)!; const worklet = Worklet.all.at(-1)!;
	await act(async () => {
		worklet.emit({ type: "audio", buffer: new Int16Array(16000), contextStart: 10, sampleRate: 16000 });
		socket.open();
		socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ type: "Results", is_final: false, channel: { alternatives: [{ transcript: "Switch to notebook" }] } }) }));
		assert.equal(finals.length, 0, "interim hypotheses never reach command routing");
		socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ type: "Results", is_final: true, start: 0, duration: 1, speech_final: true, channel: { alternatives: [{ transcript: "Earlier words.", words: [{ word: "earlier", punctuated_word: "Earlier", start: 0.2, end: 0.4 }, { word: "words", punctuated_word: "words.", start: 0.5, end: 0.8 }] }] } }) }));
	});
	assert.equal(finals.length, 1);
	assert.deepEqual({ ...finals[0], id: "ignored" }, { id: "ignored", text: "Earlier words.", start: 10, end: 11, speechFinal: true, words: [{ text: "Earlier", start: 10.2, end: 10.4 }, { text: "words.", start: 10.5, end: 10.8 }] });
	assert.deepEqual(f.state.appends, []);
	await act(async () => f.dictation.stop()); await act(async () => socket.end());
	assert.deepEqual(endings, ["stop"]);
	assert.deepEqual(f.state.appends, [], "the session adapter owns revealing, not the current input registry");
});

test("capture recovery preserves the actionable missing-key error after startup fails", async () => {
	const reasons: string[] = [];
	const f = await fixture("en", undefined, undefined, { begin: async () => ({ final() {}, incomplete() {}, end: async reason => { reasons.push(reason); } }) });
	f.state.tokenMissing = true;
	await f.mount();
	await act(async () => f.dictation.toggle());
	assert.equal(f.dictation.phase, "idle");
	assert.match(f.dictation.error!, /Dictation needs a Deepgram key/);
	assert.deepEqual(reasons, ["interrupted"]);
	assert.equal(f.state.active, false);
});

test("clicked Apply flushes after sent audio, follows up once on short coverage, and retains a whole crossing word", async () => {
	const fs = await import("node:fs");
	const dir = fs.mkdtempSync(join(tmpdir(), "notebook-finalize-mounted-"));
	process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
	const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
	const { chatStore } = await import("../src/store/chats.ts");
	const { createNotebookService } = await import("../src/server/notebook.ts");
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const chat = chatStore.createChat("Bounded finalization"); const editor = createFauxCore({}); let calls = 0; let prompt = "";
	editor.setResponses([context => { calls++; prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.speech.choose({ kind: "notebook" });
	const f = await fixture("en", undefined, () => <NotebookPanel session={session} />, session.speech);
	const control = JSON.stringify({ type: "Finalize" });
	try {
		await f.mount(); AudioGraph.time = 10;
		await act(async () => f.dictation.toggle());
		const socket = Socket.all.at(-1)!; const worklet = Worklet.all.at(-1)!;
		const audio = (start: number, samples: number) => worklet.emit({ type: "audio", buffer: new Int16Array(samples), contextStart: start, sampleRate: 16000 });
		const result = (start: number, duration: number, transcript: string, words: Array<{ word: string; start: number; end: number }>, fromFinalize = false) => socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ type: "Results", is_final: true, from_finalize: fromFinalize, start, duration, channel: { alternatives: [{ transcript, words }] } }) }));
		await act(async () => { socket.open(); audio(10, 32000); });
		await act(async () => {
			AudioGraph.time = 12.05;
			document.querySelector('.notebook-panel form')!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
			await session.idle();
		});
		assert.equal(socket.sent.includes(control), false, "audio covering the click has not been sent");
		await act(async () => { audio(12, 2048); });
		assert.ok(socket.sent.at(-1) === control, "request final coverage promptly after the covering PCM packet");
		assert.ok(socket.sent.at(-2) instanceof Int16Array);
		await act(async () => {
			result(0, 2.032, "Write", [{ word: "Write", start: 1, end: 1.5 }], true);
			result(0, 2.032, "Write", [{ word: "Write", start: 1, end: 1.5 }], true);
			session.speech.apply(); await session.idle();
		});
		assert.equal(calls, 0, "a flush flag cannot certify the still-missing crossing word");
		assert.equal(socket.sent.filter(value => value === control).length, 1, "follow-up needs additional audio");
		await act(async () => { audio(12.128, 2048); });
		assert.equal(socket.sent.filter(value => value === control).length, 2);
		await act(async () => {
			result(2.032, 0.224, "pressure.", [{ word: "pressure.", start: 2.04, end: 2.23 }], true);
			await session.idle(); await session.speech.idle(); await service.settled(chat.id); await session.refresh();
		});
		assert.equal(calls, 1); assert.match(prompt, /Write pressure\./);
		assert.equal(f.dictation.phase, "recording"); assert.equal(f.state.stops, 0);
		await act(async () => {
			audio(12.256, 11904);
			result(2.256, 0.744, "Later.", [{ word: "Later.", start: 2.4, end: 2.8 }]);
			await session.speech.idle(); f.dictation.stop();
		});
		await act(async () => socket.end());
		assert.equal(socket.sent.filter(value => value === control).length, 2);
		assert.equal(service.view(chat.id).draft.text, "Later."); assert.equal(service.view(chat.id).usage.calls, 1);
		assert.equal(service.view(chat.id).speechRuns![0]!.incomplete, false);
	} finally { await f.unmount(); session.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

for (const ending of ["stop", "cancel", "reconnect", "replace"] as const) test(`pending finalization is discarded on ${ending} and cannot leak from a retired capture`, async () => {
	const clocks: Array<Parameters<DictationCaptureAdapter["begin"]>[0]> = [];
	const f = await fixture("en", undefined, undefined, { begin: async clock => { clocks.push(clock); return { final() {}, incomplete() {}, end: async () => {} }; } });
	await f.mount(); AudioGraph.time = 10; await act(async () => f.dictation.toggle());
	const socket = Socket.all.at(-1)!; const worklet = Worklet.all.at(-1)!;
	assert.equal(typeof clocks[0]!.requestFinalization, "function");
	clocks[0]!.requestFinalization!(10.01);
	if (ending === "reconnect") {
		await act(async () => { socket.open(); socket.end(1006); });
		await act(async () => { Socket.all.at(-1)!.open(); });
	} else if (ending === "replace") {
		await f.remount(); await act(async () => f.dictation.toggle());
		await act(async () => Socket.all.at(-1)!.open());
	} else await act(async () => f.dictation[ending]());
	await act(async () => {
		clocks[0]!.requestFinalization!(10.01);
		worklet.emit({ type: "audio", buffer: new Int16Array(2048), contextStart: 10, sampleRate: 16000 });
		if (ending === "stop") socket.open();
		if (ending === "replace") Worklet.all.at(-1)!.emit({ type: "audio", buffer: new Int16Array(2048), contextStart: 10, sampleRate: 16000 });
	});
	assert.equal(Socket.all.flatMap(value => value.sent).includes(JSON.stringify({ type: "Finalize" })), false);
});

test("a finalization request during connection setup follows queued audio strictly beyond the click", async () => {
	let clock!: Parameters<DictationCaptureAdapter["begin"]>[0];
	const f = await fixture("en", undefined, undefined, { begin: async value => { clock = value; return { final() {}, incomplete() {}, end: async () => {} }; } });
	await f.mount(); AudioGraph.time = 10; await act(async () => f.dictation.toggle());
	const socket = Socket.all.at(-1)!; const worklet = Worklet.all.at(-1)!;
	assert.equal(typeof clock.requestFinalization, "function"); clock.requestFinalization!(10.128);
	const first = new Int16Array(2048); const second = new Int16Array(2048);
	await act(async () => {
		worklet.emit({ type: "audio", buffer: first, contextStart: 10, sampleRate: 16000 });
		worklet.emit({ type: "audio", buffer: second, contextStart: 10.128, sampleRate: 16000 });
		socket.open();
	});
	assert.deepEqual(socket.sent, [first, second, JSON.stringify({ type: "Finalize" })]);
});

for (const trigger of ["Apply button", "pane Enter"] as const) test(`mounted ${trigger} keeps capture running until a return finalizes the crossing word and completed working`, async () => {
	const fs = await import("node:fs");
	const dir = fs.mkdtempSync(join(tmpdir(), "notebook-click-mounted-"));
	process.env.LH_DATA_DIR = dir; process.env.LH_AUTH_FILE = `${dir}/auth.json`;
	const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
	const { chatStore } = await import("../src/store/chats.ts");
	const { createNotebookService } = await import("../src/server/notebook.ts");
	const { createNotebookSession } = await import("../components/notebook-session.ts");
	const chat = chatStore.createChat("Clicked crossing word"); const editor = createFauxCore({}); let calls = 0; let prompt = "";
	editor.setResponses([context => { calls++; prompt = JSON.stringify(context.messages); return fauxAssistantMessage('{"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p="}]}'); }]);
	const service = createNotebookService({ chatStore, engine: async () => ({ engine: { model: editor.getModel(), streamFn: editor.streamSimple }, model: "faux:editor" }) });
	const session = createNotebookSession(chat.id, async (_url, init) => service.handle(new Request("http://test/notebook", init), chat.id));
	await session.refresh(); await session.dispatch({ type: "visibility", visible: true }); await session.dispatch({ type: "draft", text: "Write" });
	function Controls() {
		const root = React.useRef<HTMLDivElement>(null); useNotebookDestination(root, session, true);
		return <div ref={root}><PracticeDock notebook={session} problemCallId="problem" input={{ statement: "Pressure?" }} expanded onExpand={() => {}} onSubmit={() => { throw new Error("No Tutor submit"); }} /><NotebookPanel session={session} /></div>;
	}
	const f = await fixture("en", undefined, () => <Controls />, session.speech);
	try {
		await f.mount(); AudioGraph.time = 10;
		await act(async () => document.querySelector('#notebook-instruction')!.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
		await act(async () => f.dictation.toggle()); const socket = Socket.all.at(-1)!;
		assert.equal(document.querySelector<HTMLButtonElement>('.notebook-panel button[type="submit"]')!.disabled, false);
		await act(async () => { socket.open(); Worklet.all.at(-1)!.emit({ type: "audio", buffer: new Int16Array(64000), contextStart: 10, sampleRate: 16000 }); });
		await act(async () => {
			AudioGraph.time = 12;
			if (trigger === "Apply button") {
				document.querySelector('.notebook-panel button[type="submit"]')!.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
				document.querySelector('.notebook-panel form')!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
			} else {
				const target = document.querySelector('.notebook-panel')!;
				target.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter", shiftKey: true }));
				assert.equal(service.view(chat.id).pending, null, "Shift+Enter is not Apply");
				target.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" }));
			}
			await session.idle();
		});
		assert.equal(calls, 0, "typed prefix alone cannot authorize a pre-click speech edit");
		assert.equal(service.view(chat.id).pending?.status, "awaiting-transcript");
		assert.equal(f.state.stops, 0); assert.equal(Socket.all.length, 1);
		await act(async () => { AudioGraph.time = 12.5; document.querySelector('[data-testid="practice-dock"] [data-file-path-input]')!.dispatchEvent(new window.Event("pointerdown", { bubbles: true })); });
		assert.equal(f.dictation.phase, "stopping");
		const final = (start: number, duration: number, transcript: string, words: Array<{ word: string; start: number; end: number }>) => socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, start, duration, channel: { alternatives: [{ transcript, words }] } }) }));
		await act(async () => { final(0, 2.1, "pressure.", [{ word: "pressure.", start: 1.9, end: 2.2 }]); await session.idle(); });
		assert.equal(calls, 0, "whole crossing word needs finalized coverage through its end");
		await act(async () => { final(2.1, 0.9, "Later. Reasoning.", [{ word: "Later.", start: 2.3, end: 2.4 }, { word: "Reasoning.", start: 2.6, end: 2.8 }]); await session.idle(); await session.speech.idle(); await service.settled(chat.id); await session.refresh(); });
		assert.equal(calls, 1); assert.match(prompt, /Write pressure/); assert.doesNotMatch(prompt, /Later|Reasoning/);
		assert.equal(document.querySelector<HTMLTextAreaElement>('#notebook-instruction')!.value, "");
		assert.equal(document.querySelector('[data-testid="practice-dock"] [data-file-path-input]')!.textContent, "");
		await act(async () => { socket.end(); await session.speech.choose({ kind: "tutor", owner: { kind: "practice", problemCallId: "problem" } }); });
		assert.equal(document.querySelector<HTMLTextAreaElement>('#notebook-instruction')!.value, "Later. Reasoning.");
		assert.equal(document.querySelector('[data-testid="practice-thinking-field"] [data-file-path-input]')!.textContent, "");
		assert.deepEqual(service.view(chat.id).snapshots![0]!.lines, [{ id: "L1", latex: "p=" }]);
		assert.equal(f.state.captures, 1);
	} finally { await f.unmount(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Send arriving during terminal draft persistence waits for that same completion", async () => {
	const saved = deferred<void>();
	const f = await fixture("en", undefined, undefined, { begin: async () => ({ final() {}, incomplete() {}, end: () => saved.promise }) });
	await f.mount(); await act(async () => f.dictation.toggle());
	const socket = Socket.all.at(-1)!;
	await act(async () => socket.open());
	await act(async () => f.dictation.stop());
	await act(async () => socket.end());
	let completed = false;
	void f.dictation.finish().then(() => { completed = true; });
	assert.equal(completed, false);
	await act(async () => saved.resolve());
	assert.equal(completed, true);
});

test("Stop timeout reports interruption and blocks a waiting Send", async (context) => {
	const reasons: string[] = [];
	const f = await fixture("en", undefined, undefined, { begin: async () => ({ final() {}, incomplete() {}, end: async reason => { reasons.push(reason); } }) });
	await f.mount(); await act(async () => f.dictation.toggle());
	await act(async () => Socket.all.at(-1)!.open());
	context.mock.timers.enable({ apis: ["setTimeout"] });
	let finished!: Promise<void>;
	await act(async () => { finished = f.dictation.finish(); });
	const refusal = assert.rejects(finished, /interrupted/);
	await act(async () => context.mock.timers.tick(3000));
	await refusal;
	assert.deepEqual(reasons, ["interrupted"]);
	assert.equal(f.dictation.phase, "idle");
});

test("Stop sends the worklet's partial tail before closing the provider stream", async () => {
	const f = await fixture("en");
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all.at(-1)!;
	const worklet = Worklet.all.at(-1)!;
	await act(async () => socket.open());
	Worklet.autoFlush = false;
	await act(async () => { f.dictation.stop(); });
	assert.equal(f.dictation.phase, "stopping");
	assert.deepEqual(socket.sent, [], "CloseStream must wait for the partial audio packet");
	const tail = new Int16Array([120, -120]);
	await act(async () => {
		worklet.emit({ type: "audio", buffer: tail, contextStart: 10, sampleRate: 16000 });
		worklet.emit({ type: "flushed" });
	});
	assert.deepEqual(socket.sent, [tail, JSON.stringify({ type: "CloseStream" })]);
	await act(async () => { socket.final("complete tail"); socket.end(); });
	assert.deepEqual(f.state.appends, ["complete tail"]);
	assert.equal(f.state.stops, 1);
});

test("a dying replaced socket cannot append or stop the continuing recording", async () => {
	const f = await fixture("en");
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const old = Socket.all.at(-1)!;
	await act(async () => { old.open(); old.final("before reconnect"); old.end(1006); });
	const current = Socket.all.at(-1)!;
	assert.notEqual(current, old);
	await act(async () => { current.open(); old.final("stale duplicate"); old.end(); });
	assert.equal(f.dictation.phase, "recording");
	assert.deepEqual(f.state.appends, []);
	await act(async () => { current.final("after reconnect"); f.dictation.stop(); });
	await act(async () => current.end());
	assert.deepEqual(f.state.appends, ["before reconnect after reconnect"]);
	assert.equal(f.state.captures, 1);
});

test("Stop during the socket handshake retains queued audio and sends its tail before CloseStream", async () => {
	const f = await fixture("en");
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all.at(-1)!;
	const worklet = Worklet.all.at(-1)!;
	const audio = new Int16Array([1, 2]);
	const tail = new Int16Array([3]);
	Worklet.autoFlush = false;
	await act(async () => {
		worklet.emit({ type: "audio", buffer: audio, contextStart: 0, sampleRate: 16000 });
		f.dictation.stop();
		worklet.emit({ type: "audio", buffer: tail, contextStart: 2 / 16000, sampleRate: 16000 });
		worklet.emit({ type: "flushed" });
	});
	assert.equal(f.dictation.phase, "stopping");
	assert.equal(socket.readyState, Socket.CONNECTING);
	await act(async () => socket.open());
	assert.equal(f.dictation.phase, "stopping", "opening a draining stream must not restart recording");
	assert.deepEqual(socket.sent, [audio, tail, JSON.stringify({ type: "CloseStream" })]);
	await act(async () => { socket.final("queued beginning and end"); socket.end(); });
	assert.deepEqual(f.state.appends, ["queued beginning and end"]);
});

test("actual practice Send finishes empty-visible deferred speech against its captured problem", async () => {
	let problem = "old";
	const sent: Array<[string, string]> = [];
	const f = await fixture("en", undefined, () => <PracticeDock key={problem} problemCallId={problem} input={{ statement: problem }} expanded onExpand={() => {}} onSubmit={(text, id) => { sent.push([text, id]); }} />);
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all.at(-1)!;
	await act(async () => { socket.open(); socket.final("My deferred reasoning"); });
	assert.equal(document.querySelector('[data-file-path-input]')!.textContent, "");
	await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!.click());
	assert.equal(f.dictation.phase, "stopping");
	assert.deepEqual(sent, []);
	problem = "new"; await f.mount();
	await act(async () => { socket.end(); });
	assert.deepEqual(sent, [["My deferred reasoning", "old"]]);
	assert.equal(document.querySelector('[data-file-path-input]')!.textContent, "");
});

test("actual written answer finishes empty-visible speech for its captured question across a question transition", async () => {
	let question = "old";
	const sent: Array<[string | undefined, string]> = [];
	const f = await fixture("en", undefined, () => <QuestionDock toolName="recall" toolCallId={question} input={{ question, correctAnswer: "hidden" }} expanded onExpand={() => {}} onSubmit={(answer, id) => { sent.push([answer.text, id]); }} />);
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all.at(-1)!;
	await act(async () => { socket.open(); socket.final("My deferred answer"); });
	assert.equal(document.querySelector('[data-file-path-input]')!.textContent, "");
	const send = document.querySelector<HTMLButtonElement>('[data-testid="question-send"]')!;
	assert.equal(send.disabled, false);
	await act(async () => { send.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
	assert.equal(f.dictation.phase, "stopping");
	question = "new"; await f.mount();
	await act(async () => { socket.end(); });
	assert.deepEqual(sent, [["My deferred answer", "old"]]);
	assert.equal(document.querySelector('[data-file-path-input]')!.textContent, "");
});

test("finalization pins its original actual hook owner before a replacement field can receive late speech", async () => {
	const f = await fixture("en"); await f.claim("first");
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all[0]!; await act(async () => socket.open());
	const valid = dictationCheckpoint(); let finished!: Promise<void>;
	await act(async () => { finished = f.dictation.finish(); });
	await f.claim("second");
	await act(async () => { socket.final("Tail belonging to first question"); socket.end(); await finished; });
	assert.equal(valid(), false);
	assert.deepEqual(f.state.fields, { first: ["Tail belonging to first question"], second: [] });
	assert.deepEqual(f.state.appends, []);
});

test("waits for the saved language; reconnect preserves it and finals still flush exactly once", async () => {
	const read = deferred<Response>();
	const f = await fixture("pl", read.promise);
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	assert.equal(f.dictation.phase, "connecting");
	assert.equal(f.state.active, true, "the settings row locks while connecting");
	assert.equal(f.state.captures, 0);
	assert.equal(Socket.all.length, 0, "must not open a default-English socket before settings arrive");
	await act(async () => { read.resolve(Response.json({ settings: f.state.record })); });
	const first = Socket.all[0]!;
	assert.equal(first.language, "pl");
	await act(async () => { first.open(); first.final("Cześć"); });
	assert.deepEqual(f.state.appends, []);
	// A preference refresh during capture affects the next run only.
	f.state.record.dictation = { language: "multi" };
	await act(async () => { notifySettingsSaved("dictation"); });
	await act(async () => { first.end(1006); });
	const second = Socket.all[1]!;
	assert.equal(second.language, "pl");
	assert.deepEqual(second.protocols, ["bearer", "test-token"]);
	await act(async () => { second.open(); second.final("świecie"); });
	await act(async () => { f.dictation.stop(); });
	assert.equal(f.dictation.phase, "stopping");
	assert.equal(f.state.active, true, "the settings row remains locked while stopping");
	assert.equal(second.sent.at(-1), JSON.stringify({ type: "CloseStream" }));
	await act(async () => { second.end(); });
	assert.deepEqual(f.state.appends, ["Cześć świecie"]);
	assert.equal(f.dictation.phase, "idle");
	assert.equal(f.state.active, false);
	await act(async () => { f.dictation.toggle(); });
	assert.equal(Socket.all[2]!.language, "multi");
});

test("a failed save keeps the previous language, including a shortcut pressed while saving", async () => {
	const f = await fixture();
	await f.mount();
	const write = deferred<Response>();
	f.state.nextWrite = write.promise;
	let saved!: Promise<boolean>;
	await act(async () => { saved = f.setting.save("multi"); });
	assert.equal(f.setting.saving, true);
	await act(async () => { f.dictation.toggle(); });
	assert.equal(f.state.captures, 0);
	await act(async () => { write.resolve(Response.json({}, { status: 500 })); await saved; });
	assert.equal(await saved, false);
	assert.equal(f.setting.language, "pl");
	assert.match(f.setting.error!, /Could not save/);
	assert.equal(Socket.all[0]!.language, "pl");
});

test("confirmed choices stay cached across navigation; failed explicit refreshes block capture", async () => {
	const f = await fixture();
	await f.mount();
	await act(async () => { assert.equal(await f.setting.save("multi"), true); });
	const reads = f.state.reads;
	f.state.readFails = true;
	await f.remount();
	assert.equal(f.setting.language, "multi");
	assert.equal(f.state.reads, reads, "navigation must not reread a confirmed preference");
	await act(async () => { notifySettingsSaved("dictation"); });
	await act(async () => { f.dictation.toggle(); });
	assert.match(f.dictation.error!, /Could not load/);
	assert.equal(f.state.captures, 0);
	assert.equal(Socket.all.length, 0);
	f.state.readFails = false;
	await act(async () => { f.dictation.toggle(); });
	assert.equal(Socket.all[0]!.language, "multi");
});

test("a shortcut waits for a language save made by the separate settings control", async () => {
	const f = await fixture();
	await f.mount();
	const write = deferred<Response>();
	f.state.nextWrite = write.promise;
	let saved!: Promise<boolean>;
	await act(async () => { saved = f.setting.save("multi"); });
	await act(async () => { f.dictation.toggle(); });
	assert.equal(f.state.captures, 0);
	f.state.record.dictation = { language: "multi" };
	await act(async () => { write.resolve(Response.json({ settings: f.state.record })); await saved; });
	assert.equal(Socket.all[0]!.language, "multi");
});

test("a saved-language refresh gates capture even when an older choice is cached", async () => {
	const f = await fixture();
	await f.mount();
	const read = deferred<Response>();
	f.state.nextRead = read.promise;
	f.state.record.dictation = { language: "multi" };
	await act(async () => { notifySettingsSaved("dictation"); });
	await act(async () => { f.dictation.toggle(); });
	assert.equal(f.state.captures, 0);
	assert.equal(Socket.all.length, 0);
	await act(async () => { read.resolve(Response.json({ settings: f.state.record })); });
	assert.equal(Socket.all[0]!.language, "multi");
});

test("a stale settings refresh cannot overwrite a newer confirmed choice", async () => {
	const f = await fixture();
	await f.mount();
	const read = deferred<Response>();
	f.state.nextRead = read.promise;
	await act(async () => { notifySettingsSaved("dictation"); });
	await act(async () => { await f.setting.save("multi"); });
	await act(async () => { read.resolve(Response.json({ settings: { version: 1, dictation: { language: "pl" } } })); });
	assert.equal(f.setting.language, "multi");
	await act(async () => { f.dictation.toggle(); });
	assert.equal(Socket.all[0]!.language, "multi");
});

test("cancel while settings load does not open a microphone or socket later", async () => {
	const read = deferred<Response>();
	const f = await fixture("pl", read.promise);
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	await act(async () => { f.dictation.cancel(); });
	await act(async () => { read.resolve(Response.json({ settings: f.state.record })); });
	assert.equal(f.dictation.phase, "idle");
	assert.equal(f.state.captures, 0);
	assert.equal(Socket.all.length, 0);
});

test("reopening settings during a save shares its busy state and rejects a competing selection", async () => {
	const f = await fixture();
	await f.mount();
	const write = deferred<Response>();
	f.state.nextWrite = write.promise;
	let first!: Promise<boolean>;
	await act(async () => { first = f.setting.save("multi"); });
	await f.remount();
	assert.equal(f.setting.saving, true);
	assert.equal(await f.setting.save("en"), false, "a different selection cannot inherit another write's success");
	f.state.record.dictation = { language: "multi" };
	await act(async () => { write.resolve(Response.json({ settings: f.state.record })); await first; });
	assert.equal(f.setting.saving, false);
	assert.equal(f.setting.language, "multi");
});

test("a confirmed save applies to capture even when subsequent settings GET requests would fail", async () => {
	const f = await fixture();
	await f.mount();
	f.state.readFails = true;
	await act(async () => { assert.equal(await f.setting.save("multi"), true); });
	assert.equal(f.state.record.dictation?.language, "multi");
	await act(async () => { f.dictation.toggle(); });
	assert.equal(Socket.all[0]!.language, "multi");
});

test("unmount during a pending language read prevents orphaned capture", async () => {
	const read = deferred<Response>();
	const f = await fixture("pl", read.promise);
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	await f.unmount();
	await act(async () => { read.resolve(Response.json({ settings: f.state.record })); });
	assert.equal(f.state.captures, 0);
	assert.equal(Socket.all.length, 0);
	assert.equal(isDictationActive(), false);
});

test("unmount during recording stops resources and discards the departing page's buffered text", async () => {
	const f = await fixture();
	await f.mount();
	await act(async () => { f.dictation.toggle(); });
	const socket = Socket.all[0]!;
	await act(async () => { socket.open(); socket.final("do not append into another page"); });
	await f.unmount();
	assert.equal(f.state.stops, 1);
	assert.equal(socket.readyState, 3);
	assert.equal(isDictationActive(), false);
	assert.deepEqual(f.state.appends, []);
	await act(async () => { socket.final("late event"); socket.end(1006); });
	assert.equal(Socket.all.length, 1);
	assert.deepEqual(f.state.appends, []);
});

test("microphone permission resolving after unmount immediately stops the late stream", async () => {
	const f = await fixture();
	await f.mount();
	const mic = deferred<{ getTracks: () => { stop: () => void }[] }>();
	f.state.nextMic = mic.promise;
	await act(async () => { f.dictation.toggle(); });
	assert.equal(f.state.captures, 1);
	await f.unmount();
	await act(async () => { mic.resolve({ getTracks: () => [{ stop() { f.state.stops++; } }] }); });
	assert.equal(f.state.stops, 1);
	assert.equal(Socket.all.length, 0);
	assert.equal(isDictationActive(), false);
});
