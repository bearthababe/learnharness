"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Loader2Icon, MicIcon } from "lucide-react";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { Hint } from "@/components/ui/hint";
import { createDictationTimeline, deepgramListenUrl, type DictationAudioPacket, type DictationCaptureAdapter, type DictationCaptureRun, type DictationLanguage } from "@/src/core";
import { useDictationLanguage } from "@/components/dictation-preference";
import { setDictationActive } from "@/components/dictation-state";
import { useDeploymentActivity } from "./deployment-activity";
export { isDictationActive } from "@/components/dictation-state";

/**
 * Voice dictation — the cloud engine (STT wave 1, 2026-09-17).
 *
 * Architecture (docs/research/stt.md): the renderer captures mic audio in
 * an AudioWorklet (public/worklets/pcm-capture.js → linear16 16kHz mono),
 * opens the Deepgram streaming WebSocket DIRECTLY (audio never loops
 * through our server) with a short-lived token minted by /api/stt/token
 * (the real key stays server-side), and streams frames while it listens.
 * Finals append into the PRIMARY INPUT (see below).
 *
 * Ported patterns from the owner's pi `dictate` extension (his words:
 * "very well tuned") — see ~/.pi/agent/extensions/dictate:
 *   - generation counter: every start/stop increments it; all async
 *     handlers no-op when stale, so a dying session's socket can never
 *     tear down the current one.
 *   - meter: latest-RMS-never-resets — the level ref keeps the last
 *     observed value, so a tick with no fresh audio re-renders the last
 *     level instead of dropping to silence (60ms tick samples the ref).
 *   - dB mapping floor −50 / ceiling −10: the sweet spot for showing
 *     conversational speech as mid-height bars without pegging.
 *   - stop: seal capture and drain the worklet's partial packet, then
 *     CloseStream; a 3s safety net bounds teardown, not ASR completeness.
 *   - interim_results=false, endpointing=300: his live-tuned params — no
 *     partial hypotheses, finals commit ~300ms after a pause (owner
 *     round 1: live words are distracting and shift the meter; the
 *     meter's width is FIXED while recording).
 *
 * Owner round 2 (2026-09-17, second live test):
 *   - DEFERRED transcript: finals accumulate in a buffer during the run
 *     and flush into the primary input ONCE, when the dictation ends
 *     (click-again/Esc → Deepgram flushes its last finals → socket close
 *     → one joined append). Nothing textual renders while recording —
 *     only the meter. Live output may return as a toggleable setting at
 *     the settings milestone; deferred is the only behavior for now.
 *   - ADAPTIVE meter: the strip's cell count derives from its measured
 *     width (4px pitch, 8–48 cells, ResizeObserver) so narrow rows (the
 *     draft view's tighter column) show fewer bars instead of
 *     overflowing under their neighbors.
 *
 * Owner round 1 (2026-09-17, first live mic test):
 *   - ONE primary transcription input at all times: the pending
 *     quiz/ask question's field while one waits (text mode → the answer
 *     field, select modes → "Your thinking"), else the page's composer.
 *     Implemented as a module-level registry the question form claims on
 *     mount — see useDictationTarget below.
 *   - Click → meter IMMEDIATELY (optimistic): the meter strip renders
 *     from the click, connection + TCC happen behind it. The token mint
 *     and the mic acquisition run CONCURRENTLY (Promise.all) to shrink
 *     the real gap.
 *
 * Meter rendering lives in <DictationBar> (own 60ms timer over the level
 * ref) so the 16-renders/sec never touch the page component — only the
 * tiny bar strip repaints.
 *
 * Start-latency mitigation wave (owner, 2026-09-27 — A+B+C+D, the
 * optimistic meter stays): the old start path serialized [token ∥ mic] →
 * NEW AudioContext → addModule fetch → WSS handshake, and DROPPED every
 * frame that arrived before the socket was OPEN — the first seconds of
 * speech never reached Deepgram. Now:
 *   - QUEUE-DON'T-DROP (A): frames arriving before OPEN buffer (capped,
 *     oldest dropped) and flush in order on open — captured speech is
 *     never lost, wherever in setup it lands.
 *   - PARALLEL HANDSHAKE (B, mic-gated): the handshake starts the moment
 *     the capture graph is live, not after it. Mic-gated, NOT token-gated:
 *     an OS TCC prompt can outlive Deepgram's 10s idle timeout.
 *   - PERSISTENT GRAPH (C): one app-lifetime AudioContext + a memoized
 *     worklet module — per-run contexts paid context creation AND a
 *     worklet-module fetch on every start (through the dev server in dev).
 *   - WARM TOKEN (D): pre-minted at page mount and refreshed after every
 *     run (TTL 3min); the click no longer waits on the remote mint. A
 *     stale-token handshake failure self-heals via the reconnect-once
 *     path, which always mints FRESH.
 *   - The honest floor stays: getUserMedia can't be pre-warmed (the mic
 *     indicator would stay lit) — hence the owner's optimistic meter.
 */

/*
 * Deepgram streaming params (the owner's live-tuned dictate config): nova-3,
 * endpointing=300, no interims. Silence streams too (the worklet never
 * pauses), so the socket never idles — no KeepAlive needed.
 */
// URL construction lives in the browser-safe core; only language varies.

/** Meter tuning — the owner's tested values, see the file header. */
const METER_FLOOR_DB = -50;
const METER_CEILING_DB = -10;
export const METER_TICK_MS = 60;
/** Rolling history: 48 cells × 60ms ≈ 2.9s of recent loudness. */
export const METER_CELLS = 48;

/** The Deepgram key's id in the keys store (the env-var name — the Keys
 *  section's openRow state and the PUT /api/keys/:id seam). */
export const DEEPGRAM_KEY_ID = "DEEPGRAM_API_KEY";

/** The client-authored KEYLESS line (zero-keys wave, owner 2026-09-25):
 * the token route's raw 503 message is dev-speak ("add it to auth.json
 * (desktop) or .env.local (dev)") — the surface says the short truth
 * instead. Exported for pins; the errored idle button's click recognizes
 * it and deep-links Settings → Keys → the Deepgram row. */
export const DICTATION_KEYLESS = "To dictate, add a Deepgram speech key";

/** Mint a fresh short-lived token (the route holds the real key
 *  server-side). Module-level: the start path's warm cache and the
 *  reconnect path both bottom out here. The keyless 503 (no
 *  DEEPGRAM_API_KEY) is the route's ONLY 503 — the raw message is
 *  dev-speak, so the error becomes the short client-authored line
 *  (zero-keys wave, owner 2026-09-25). */
async function mintFreshToken(): Promise<string> {
	const res = await fetch("/api/stt/token");
	const data = (await res.json()) as { token?: string; message?: string };
	if (!res.ok || !data.token) {
		if (res.status === 503) throw new Error(DICTATION_KEYLESS);
		throw new Error(data.message ?? `token route ${res.status}`);
	}
	return data.token;
}

/** Warm-token cache (mitigation D, owner 2026-09-27): the click path takes
 *  the cached promise instead of a remote mint. TTL keeps a cached token
 *  from going stale (self-heal anyway: a rejected handshake rides the
 *  reconnect-once path with a FRESH mint); a failed mint resets the cache
 *  so the next call re-mints — the honest error path stays honest.
 *  refresh() re-mints in the background (page mount, run end); its
 *  failures are silently tolerated (a keyless pre-mint just doesn't warm). */
export const WARM_TOKEN_TTL_MS = 3 * 60_000;

export type WarmMinter = { mint: () => Promise<string>; refresh: () => void };

export function createWarmMinter(
	mint: () => Promise<string>,
	now: () => number = Date.now,
	ttlMs: number = WARM_TOKEN_TTL_MS,
): WarmMinter {
	let warm: { p: Promise<string>; at: number } | null = null;
	const m: WarmMinter = {
		mint: () => {
			if (!warm || now() - warm.at > ttlMs) {
				const p = mint().catch((e: unknown) => {
					warm = null; // failed mint: next call re-mints
					throw e;
				});
				warm = { p, at: now() };
			}
			return warm.p;
		},
		refresh: () => {
			warm = null;
			m.mint().catch(() => {}); // background best-effort
		},
	};
	return m;
}

const warmTokens = createWarmMinter(mintFreshToken);

/* Persistent capture graph (mitigation C, owner 2026-09-27): one
 * app-lifetime AudioContext + a module-load memo. Created under the
 * click gesture (autoplay policy) and NEVER closed — per-run nodes
 * (source, worklet) disconnect at teardown instead. */
let sharedCtx: AudioContext | null = null;
let workletModule: Promise<void> | null = null;

function ensureAudioGraph(): { ctx: AudioContext; module: Promise<void> } {
	if (!sharedCtx) sharedCtx = new AudioContext({ sampleRate: 16000 });
	if (!workletModule) {
		workletModule = sharedCtx.audioWorklet.addModule("/worklets/pcm-capture.js").catch((e: unknown) => {
			workletModule = null; // failed load: retry next run
			throw e;
		});
	}
	return { ctx: sharedCtx, module: workletModule };
}

/** RMS (0..1) → normalized 0..1 across the audible dB window. */
export function rmsToMeter(rms: number): number {
	if (rms <= 0) return 0;
	const db = 20 * Math.log10(rms);
	const t = (db - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB);
	return Math.max(0, Math.min(1, t));
}

/**
 * The primary-input registry: at most ONE non-composer input can claim the
 * dictation target while mounted — the pending question's answer/thinking
 * field (question-dock.tsx). The page's `append` (the composer) is the
 * fallback when nobody claims. Module-level by design: the claimant is a
 * sibling subtree far from the hook's owner, and there is exactly one
 * window, one pending question, one target at a time.
 */
type SpeechRetention = () => ((text: string) => void) | undefined;
type SpeechTarget = { append: (text: string) => void; retain?: SpeechRetention };
let questionTarget: SpeechTarget | null = null;
/** Claims stack (round 15, F4): a field the learner picks up (the reading
 *  note while the question is open, say) claims on top and hands the mic
 *  back to the claim beneath when it lets go. The newest claim speaks. */
const claimedTargets: SpeechTarget[] = [];
const settleTarget = () => { questionTarget = claimedTargets.at(-1) ?? null; };
let dictationCancellation = 0;
/** Attach/Submit retain the existing speech owner through finalization. */
export function dictationCheckpoint() {
	const target = questionTarget, cancellation = dictationCancellation;
	return () => target === questionTarget && cancellation === dictationCancellation;
}
let composerTarget: ((text: string) => void) | null = null;

/** File references use the very same default destination as dictation,
 * including claims whose dock is currently collapsed. A focused editor can
 * insert at its caret instead; callers use this only as the fallback. */
export function appendToPrimaryInput(text: string): boolean {
	const target = questionTarget?.append ?? composerTarget;
	if (!target) return false;
	target(text);
	return true;
}

/* The finisher registry: submit paths FAR from the hook's owner (the
 * pending question's dock) need finish() without a prop bridge. Same
 * module-level pattern as questionTarget — one window, one instance,
 * one finisher. Empty registry (no hook mounted) → resolve immediately. */
let dictationFinisher: (() => Promise<void>) | null = null;

/** Finish any live dictation run before continuing (see Dictation.finish). */
export function finishDictation(): Promise<void> {
	return dictationFinisher ? dictationFinisher() : Promise.resolve();
}

/** Join a dictated final onto the current text (shared separator rule). */
export function joinDictation(current: string, final: string): string {
	return current ? current.replace(/\s+$/, "") + " " + final : final;
}

/**
 * Claim the dictation target while mounted (and `claimed` is true). The
 * unmount guard is identity-based so dev-mode double-invoked effects
 * can't clear another claimant.
 */
export function useDictationTarget(append: (text: string) => void, claimed: boolean, retain?: SpeechRetention) {
	const retention = useRef(retain); retention.current = retain;
	useEffect(() => {
		if (!claimed) return;
		const target = { append, retain: () => retention.current?.() };
		claimedTargets.push(target);
		settleTarget();
		return () => {
			const index = claimedTargets.indexOf(target);
			if (index >= 0) claimedTargets.splice(index, 1);
			settleTarget();
		};
	}, [append, claimed]);
}

export type DictationPhase = "idle" | "connecting" | "recording" | "stopping";

export type Dictation = {
	phase: DictationPhase;
	/** Terminal-state explanation, shown inside the wide button (cleared on the next start). */
	error: string | null;
	/** Latest observed RMS, 0..1 — sampled by the meter's own tick, never reset. */
	levelRef: { current: number };
	/** Not idle — from the click until the stop completes (the optimistic window). */
	active: boolean;
	/** End + KEEP the transcript: flush the deferred buffer into the primary
	 *  input (the Stop pill and ⌘D). */
	toggle: () => void;
	stop: () => void;
	/** FINISH, THEN CONTINUE (owner, 2026-10-01 "nothing gets lost" round):
	 *  if a run is live, stop it and resolve only when the run has fully
	 *  ended — Deepgram's last finals have landed in the target field. A
	 *  submit path awaits this before building its payload, so a learner
	 *  who forgets to stop dictation before Enter never loses the spoken
	 *  reasoning. Idle → resolves immediately (the common no-run submit
	 *  pays nothing). Every terminal path runs cleanup(), and cleanup()
	 *  resolves the waiters — cancel (Esc) resolves them too, by its
	 *  discard semantics. */
	finish: () => Promise<void>;
	/** End + DISCARD the transcript: no flush, immediate teardown. The Esc
	 *  semantics (owner, 2026-09-17 round 3): Esc is a cancel, not a stop —
	 *  before, it flushed exactly like the toggle did. */
	cancel: () => void;
	/** Clear the terminal error without starting a run (zero-keys wave):
	 * the keyless click leaves for Settings and the surface must come
	 * back clean. */
	clearError: () => void;
};

/** Shared idle/retry action. Keyless recovery clears the error and opens the
 * Deepgram settings row; other starts retain presentation-specific preparation. */
export function useDictationRecovery(dictation: Dictation | undefined, beforeToggle?: () => void) {
	const { open: openSettings } = useSettingsDialog();
	return () => {
		if (!dictation) return;
		if (dictation.error === DICTATION_KEYLESS) {
			dictation.clearError();
			openSettings("keys", DEEPGRAM_KEY_ID);
		} else {
			beforeToggle?.();
			dictation.toggle();
		}
	};
}

/** Sample the latest RMS into a presentation's rolling history. Callers own
 * activation, history size/reset and any elapsed-time display; return cleanup
 * directly from their effect so sampling ends with that presentation's phase. */
export function sampleDictationMeter(
	levelRef: Dictation["levelRef"],
	setLevels: Dispatch<SetStateAction<number[]>>,
	onTick?: () => void,
) {
	const timer = setInterval(() => {
		onTick?.();
		setLevels(previous => [...previous.slice(1), rmsToMeter(levelRef.current)]);
	}, METER_TICK_MS);
	return () => clearInterval(timer);
}

/**
 * One dictation instance per composer-bearing page. `append` is the
 * composer fallback; the mounted question form's claim wins while a
 * question waits.
 */
export function useDictation({ append, capture, retain }: { append: (text: string) => void; capture?: DictationCaptureAdapter; retain?: SpeechRetention }): Dictation {
	const { getLanguage } = useDictationLanguage();
	const [phase, setPhase] = useState<DictationPhase>("idle");
	useDeploymentActivity("recording-or-finishing-speech", () => phase !== "idle");
	const [error, setError] = useState<string | null>(null);
	/** Latest RMS from the worklet — the meter samples this (dictate pattern). */
	const levelRef = useRef(0);
	/** The page's fallback append — kept fresh per render so a mid-recording
	 *  retarget (composer↔question) is honored on the very next final. */
	const appendRef = useRef(append);
	appendRef.current = append;
	useEffect(() => {
		const target = (text: string) => appendRef.current(text);
		composerTarget = target;
		return () => {
			if (composerTarget === target) composerTarget = null;
		};
	}, []);
	const adapterRef = useRef(capture); adapterRef.current = capture;
	const captureRef = useRef<DictationCaptureRun | null>(null);
	const sendAudioRef = useRef<((packet: DictationAudioPacket) => void) | null>(null);
	const finalizeCutoffRef = useRef<number | null>(null);
	const retainRef = useRef(retain); retainRef.current = retain;
	const finishingOwner = useRef<{ target: SpeechTarget | null; append: (text: string) => void; detached?: (text: string) => void } | null>(null);

	// Live machinery (non-render values). The MediaStream tracks stop and
	// the per-run nodes disconnect on teardown; the socket is recreated per
	// run; the AudioContext is app-lifetime (mitigation C).
	const wsRef = useRef<WebSocket | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	/** Per-run graph nodes — the CONTEXT outlives runs (mitigation C). */
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const workletRef = useRef<AudioWorkletNode | null>(null);
	/** Frames captured before the socket is OPEN (mitigation A): flushed in
	 *  order on open; capped at 256 frames (≈32s) with the oldest dropped;
	 *  cleared at teardown so a dead run's audio can't leak into the next. */
	const pendingRef = useRef<DictationAudioPacket[]>([]);
	const genRef = useRef(0); // stale-handler guard (dictate pattern)
	const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reconnectsRef = useRef(0);
	const stoppingRef = useRef(false);
	const captureFlushedRef = useRef(false);
	const closeSentRef = useRef(false);
	/** The deferred transcript (owner round 2): finals land here during the
	 *  run and flush into the primary input once, at teardown. */
	const bufferRef = useRef<string[]>([]);
	/** Resolvers waiting for the run to fully end (finish(), owner
	 *  2026-10-01): released by cleanup() — every terminal path runs it. */
	const waitersRef = useRef<Array<{ resolve: () => void; reject: (error: Error) => void }>>([]);
	const endingRef = useRef<Promise<void> | null>(null);

	/** Flush the buffered transcript into the primary input — question claim
	 *  first, composer fallback. Called exactly once per run, at cleanup; the
	 *  buffer clears itself so double-cleanup is a no-op. */
	const flush = useCallback(() => {
		if (bufferRef.current.length === 0) return;
		const text = bufferRef.current.join(" ");
		bufferRef.current = [];
		const owner = finishingOwner.current;
		if (owner && owner.target !== questionTarget && owner.detached) owner.detached(text);
		else (owner?.append ?? questionTarget?.append ?? appendRef.current)(text);
	}, []);

	/** Full teardown of one run's machinery. Idempotent; generation-guarded by callers. */
	const cleanup = useCallback((warmNext = true, reason: "stop" | "interrupted" | "cancel" = "interrupted") => {
		genRef.current++;
		const endedGeneration = genRef.current;
		const observer = captureRef.current; captureRef.current = null;
		sendAudioRef.current = null;
		finalizeCutoffRef.current = null;
		stoppingRef.current = false;
		captureFlushedRef.current = false;
		closeSentRef.current = false;
		if (!observer) setDictationActive(false);
		flush(); // the deferred transcript appears when the run ends (owner round 2)
		finishingOwner.current = null;
		if (safetyRef.current) {
			clearTimeout(safetyRef.current);
			safetyRef.current = null;
		}
		pendingRef.current = [];
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
		sourceRef.current?.disconnect();
		sourceRef.current = null;
		workletRef.current?.disconnect();
		workletRef.current = null;
		// The AudioContext is app-lifetime (mitigation C) — nodes die, it stays.
		const ws = wsRef.current;
		wsRef.current = null;
		if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
			try {
				ws.close();
			} catch {}
		}
		if (!observer) setPhase("idle");
		// The finish() waiters ride until NOW — post-flush, post-teardown:
		// a submit path resuming after `await finishDictation()` reads the
		// target field with the dictated tail already in it.
		const waiters = waitersRef.current.splice(0);
		if (observer) {
			const ending = observer.end(reason).then(() => {
				if (reason === "interrupted") throw new Error("Recording interrupted. Review the restored words before sending.");
			});
			endingRef.current = ending;
			void ending.then(() => {
				for (const waiter of waiters) waiter.resolve();
			}).catch((error: unknown) => {
				const failure = error instanceof Error ? error : new Error("Dictation could not be restored");
				if (genRef.current === endedGeneration) setError(current => current ?? failure.message);
				for (const waiter of waiters) waiter.reject(failure);
			}).finally(() => {
				if (endingRef.current === ending) endingRef.current = null;
				if (genRef.current === endedGeneration) { setPhase("idle"); setDictationActive(false); }
			});
		} else for (const waiter of waiters) waiter.resolve();
		// Pre-mint for the next run (mitigation D) — best-effort; a keyless
		// page just doesn't warm.
		if (warmNext) warmTokens.refresh();
	}, []);

	// Only the worklet acknowledgment proves that its partial frame was sent.
	// A connecting socket drains that same queue before CloseStream on open.
	const closeAfterCapture = useCallback(() => {
		const ws = wsRef.current;
		if (!stoppingRef.current || !captureFlushedRef.current || closeSentRef.current || ws?.readyState !== WebSocket.OPEN) return;
		closeSentRef.current = true;
		try { ws.send(JSON.stringify({ type: "CloseStream" })); }
		catch { cleanup(); }
	}, [cleanup]);

	/** Open the Deepgram socket and wire its messages. `gen` guards staleness. */
	const openSocket = useCallback(
		(gen: number, token: string, language: DictationLanguage) => {
			// Minted JWTs authenticate via the "bearer" subprotocol — ["token",
			// jwt] is rejected at the handshake (verified live; "token" is for
			// raw API keys only, as in the owner's pi dictate extension).
			const ws = new WebSocket(deepgramListenUrl(language), ["bearer", token]);
			wsRef.current = ws;
			const timeline = createDictationTimeline(crypto.randomUUID());
			const sendAudio = (packet: DictationAudioPacket) => {
				if (!timeline.sent(packet)) { finalizeCutoffRef.current = null; captureRef.current?.incomplete(); }
				if (packet.contextStart !== undefined) captureRef.current?.audio?.(packet.contextStart, packet.contextStart + packet.buffer.byteLength / 32000);
				ws.send(packet.buffer);
				const cutoff = finalizeCutoffRef.current;
				if (cutoff !== null && !stoppingRef.current && packet.contextStart !== undefined && packet.contextStart + packet.buffer.byteLength / 32000 > cutoff) {
					// A request only rides newly sent PCM, including a handshake queue.
					// This is a latency hint; the observer still requires final coverage.
					finalizeCutoffRef.current = null;
					try { ws.send(JSON.stringify({ type: "Finalize" })); }
					catch { captureRef.current?.incomplete(); }
				}
			};
			sendAudioRef.current = sendAudio;

			ws.addEventListener("open", () => {
				if (gen !== genRef.current || ws !== wsRef.current) return;
				// Mitigation A: everything captured during the handshake (or a
				// reconnect gap) goes out now, in order — Deepgram accepts
				// faster-than-realtime sends.
				for (const packet of pendingRef.current) sendAudio(packet);
				pendingRef.current = [];
				if (stoppingRef.current) closeAfterCapture(); else setPhase("recording");
			});
			ws.addEventListener("message", (ev) => {
				if (gen !== genRef.current || ws !== wsRef.current) return;
				let msg: any;
				try {
					msg = JSON.parse(ev.data as string);
				} catch {
					return;
				}
				if (msg.type === "Results") {
					const text: string | undefined = msg.channel?.alternatives?.[0]?.transcript;
					// Only finals stream (interim_results=false). DEFERRED (owner
					// round 2): they buffer here and reach the input once, at
					// teardown — the meter is the only live feedback.
					if (msg.is_final === true) {
						if (captureRef.current) captureRef.current.final(timeline.final(msg));
						else if (text) bufferRef.current.push(text);
					}
				}
			});
			ws.addEventListener("close", (ev) => {
				if (gen !== genRef.current || ws !== wsRef.current) return;
				wsRef.current = null; // retire identity before the reconnect token await
				sendAudioRef.current = null;
				finalizeCutoffRef.current = null;
				if (ev.code === 1000) {
					// Our own CloseStream landing: finalize now — the stop path's
					// safety net stays as the no-close backstop only.
					cleanup(true, stoppingRef.current && closeSentRef.current ? "stop" : "interrupted");
					return;
				}
				captureRef.current?.incomplete();
				if (stoppingRef.current) { setError(`Deepgram connection lost (${ev.code})`); cleanup(); return; }
				// Abnormal close mid-run: ONE reconnect with a fresh token (the
				// research pass: resume is our job, no SDK to lean on).
				if (reconnectsRef.current < 1) {
					reconnectsRef.current++;
					mintFreshToken() // always FRESH — a stale warm token is the likely culprit
						.then((t) => {
							if (gen === genRef.current) openSocket(gen, t, language);
						})
						.catch(() => {
							if (gen === genRef.current) {
								setError("Deepgram reconnect failed");
								cleanup();
							}
						});
				} else {
					setError(`Deepgram connection lost (${ev.code})`);
					cleanup();
				}
			});
		},
		[cleanup, closeAfterCapture],
	);

	const start = useCallback(async () => {
		const adapter = adapterRef.current;
		setDictationActive(true);
		setError(null);
		setPhase("connecting");
		reconnectsRef.current = 0;
		bufferRef.current = []; // fresh run, fresh buffer (round 2)
		pendingRef.current = []; // fresh run, fresh queue (mitigation A)
		stoppingRef.current = false;
		captureFlushedRef.current = false;
		closeSentRef.current = false;
		finalizeCutoffRef.current = null;
		const gen = ++genRef.current;
		let language: DictationLanguage;
		try {
			language = await getLanguage();
		} catch (e) {
			if (gen !== genRef.current) return;
			setError(e instanceof Error ? e.message : "Dictation language unavailable");
			cleanup();
			return;
		}
		if (gen !== genRef.current) return;

		// Mitigation D: the warm token (pre-minted at mount / after the last
		// run) resolves ~instantly; a cold/keyless mint surfaces below. The
		// mic is the long pole (macOS HAL + APM init) and gates everything —
		// the token runs concurrently with it. 127.0.0.1 is a secure
		// context, so getUserMedia works without TLS; macOS TCC prompts on
		// first use.
		const tokenPromise = warmTokens.mint();
		tokenPromise.catch(() => {}); // surfaced below; no unhandled rejection
		const micPromise = navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
		let stream: MediaStream;
		try {
			stream = await micPromise;
			if (gen !== genRef.current) {
				for (const track of stream.getTracks()) track.stop();
				return;
			}
			streamRef.current = stream;

			// Mitigation C: app-lifetime context + memoized worklet module —
			// per-run costs (context creation, module fetch) are gone.
			const { ctx, module } = ensureAudioGraph();
			await module;
			// Safari can leave the persistent graph interrupted between captures.
			// Opening a socket alone must not leave the next run without audio.
			if (ctx.state === "suspended" || ctx.state === "interrupted") await ctx.resume();
			if (gen !== genRef.current) return;
			if (adapter) {
				const observer = await adapter.begin({ id: crypto.randomUUID(), now: () => ctx.currentTime,
					requestFinalization(cutoff) {
						if (gen !== genRef.current || stoppingRef.current || reconnectsRef.current !== 0 || !Number.isFinite(cutoff)) return;
						finalizeCutoffRef.current = cutoff;
					},
				});
				if (gen !== genRef.current) { await observer.end("interrupted"); return; }
				captureRef.current = observer;
			}

			const worklet = new AudioWorkletNode(ctx, "pcm-capture");
			workletRef.current = worklet;
			worklet.port.onmessage = (e) => {
				if (gen !== genRef.current || worklet !== workletRef.current) return;
				const msg = e.data as { type: string; rms?: number } & DictationAudioPacket;
				if (msg.type === "flushed" && stoppingRef.current) {
					captureFlushedRef.current = true;
					for (const track of streamRef.current?.getTracks() ?? []) track.stop();
					streamRef.current = null;
					sourceRef.current?.disconnect(); sourceRef.current = null;
					worklet.disconnect(); workletRef.current = null;
					closeAfterCapture();
				} else if (msg.type === "level") {
					levelRef.current = msg.rms ?? 0; // never reset to zero (dictate pattern)
				} else if (msg.type === "audio") {
					const ws = wsRef.current;
					if (ws && ws.readyState === WebSocket.OPEN) sendAudioRef.current?.(msg);
					// Mitigation A: not OPEN yet (handshake or reconnect gap) —
					// queue, capped; the open handler flushes in order.
					else {
						pendingRef.current.push(msg);
						if (pendingRef.current.length > 256) { pendingRef.current.shift(); captureRef.current?.incomplete(); }
					}
				}
			};
			const source = ctx.createMediaStreamSource(stream);
			sourceRef.current = source;
			source.connect(worklet);
			// Pull the graph with silence out (the worklet writes no output) —
			// an unconnected worklet node is never clocked.
			worklet.connect(ctx.destination);
		} catch (e) {
			if (gen !== genRef.current) return;
			const msg =
				e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")
					? "Microphone permission denied"
					: e instanceof Error
						? e.message
						: "mic unavailable";
			setError(msg);
			cleanup();
			return;
		}
		if (gen !== genRef.current) return;
		let token: string;
		try {
			token = await tokenPromise;
		} catch (e) {
			if (gen !== genRef.current) return;
			setError(e instanceof Error ? e.message : "token unavailable");
			cleanup();
			return;
		}
		if (gen !== genRef.current) return;
		// Mitigation B: the handshake fires the moment the graph is live,
		// overlapping any remaining token wait — mic-gated, never before it.
		openSocket(gen, token, language);
	}, [openSocket, cleanup, closeAfterCapture, getLanguage]);

	const stop = useCallback(() => {
		const gen = genRef.current;
		if ((phase !== "recording" && phase !== "connecting") || stoppingRef.current) return;
		stoppingRef.current = true;
		finalizeCutoffRef.current = null;
		// Claim before requesting finals: a later question/reveal/unmount cannot
		// redirect this run. Detached field owners retain a target-bound draft.
		finishingOwner.current ??= { target: questionTarget, append: questionTarget?.append ?? appendRef.current, detached: (questionTarget?.retain ?? retainRef.current)?.() };
		setPhase("stopping");
		if (workletRef.current) {
			// The worklet seals capture and sends its remaining PCM before ack.
			// Keep its port attached until then; disconnecting first loses the tail.
			safetyRef.current = setTimeout(() => {
				if (gen === genRef.current) cleanup();
			}, 3000);
			workletRef.current.port.postMessage({ type: "flush" });
		} else {
			// Nothing has captured yet; invalidate microphone/token awaits too.
			cleanup();
		}
	}, [phase, cleanup]);

	const cancel = useCallback(() => {
		dictationCancellation++;
		if (phase === "idle") return;
		// Discard first, teardown second — cleanup() flushes, and the now-empty
		// buffer makes that flush a no-op. Also kills a "stopping" run: the
		// flush already underway is abandoned (its timer is cleared inside).
		bufferRef.current = [];
		cleanup(true, "cancel");
	}, [phase, cleanup]);

	const finish = useCallback((): Promise<void> => {
		if (endingRef.current) return endingRef.current;
		return new Promise((resolve, reject) => {
			if (phase === "idle") {
				resolve();
				return;
			}
			waitersRef.current.push({ resolve, reject });
			finishingOwner.current ??= { target: questionTarget, append: questionTarget?.append ?? appendRef.current, detached: (questionTarget?.retain ?? retainRef.current)?.() };
			// "stopping" is already ending — the waiter just rides to cleanup.
			if (phase === "recording" || phase === "connecting") stop();
		});
	}, [phase, stop]);

	// Publish finish() for the sibling subtrees (the pending question's
	// dock) — registered for as long as this page owns the hook.
	useEffect(() => {
		dictationFinisher = finish;
		return () => {
			if (dictationFinisher === finish) dictationFinisher = null;
		};
	}, [finish]);

	const toggle = useCallback(() => {
		if (phase === "idle") void start();
		else if (phase === "recording" || phase === "connecting") stop();
		// "stopping" presses are ignored — the flush is in flight.
	}, [phase, start, stop]);

	// Shortcut seams (keyboard wave A): ⌘D toggles from anywhere on the
	// page; the Esc chain lands here as a CANCEL (owner, round 3). Each
	// page owns ONE hook instance, and only the mounted page's listener is
	// attached.
	useEffect(() => {
		warmTokens.refresh(); // pre-mint at mount (mitigation D) — silent if keyless
		return () => {
			// Navigation cancels capture: invalidate every pending await before
			// releasing resources, and never append into a different page's input.
			bufferRef.current = [];
			cleanup(false);
		};
	}, [cleanup]);
	useEffect(() => {
		window.addEventListener("lh:kbd-toggle-dictation", toggle);
		return () => window.removeEventListener("lh:kbd-toggle-dictation", toggle);
	}, [toggle]);
	useEffect(() => {
		window.addEventListener("lh:kbd-cancel-dictation", cancel);
		return () => window.removeEventListener("lh:kbd-cancel-dictation", cancel);
	}, [cancel]);

	return {
		phase,
		error,
		levelRef,
		active: phase !== "idle",
		toggle,
		stop,
		finish,
		cancel,
		clearError: () => setError(null),
	};
}

/**
 * The stats-bar dictation slot (owner placement, round 1): the row's middle
 * is one strip that is always the full free width —
 *
 *   idle      a wide, quiet "Dictate" button (mic + label, grayed out — the
 *             whole middle is the affordance, per the owner).
 *   active    optimistic from the CLICK: red stop pill + the fixed-width
 *             meter (no interim text ever shifts it). Spinner while
 *             Deepgram flushes the last final.
 *   error     the wide button again, label swapped for the failure reason
 *             (full text in the tooltip), cleared on the next click.
 */
export function DictationBar({ dictation }: { dictation: Dictation }) {
	const { phase, error, levelRef, toggle, active } = dictation;
	const recover = useDictationRecovery(dictation);
	const [levels, setLevels] = useState<number[]>(() => new Array(METER_CELLS).fill(0));
	/** Adaptive cell count (owner round 2): derived from the meter's
	 *  measured width — narrow rows show fewer bars instead of
	 *  overflowing under neighbors. */
	const [cellCount, setCellCount] = useState(METER_CELLS);
	const meterRef = useRef<HTMLDivElement | null>(null);

	// The meter's own heartbeat — 60ms samples of the level ref into a
	// rolling ring. Only THIS strip re-renders; the page never does.
	useEffect(() => {
		if (!active) return;
		setLevels(new Array(METER_CELLS).fill(0));
		return sampleDictationMeter(levelRef, setLevels);
	}, [active, levelRef]);

	// Fit the cell count to the available width (4px pitch per cell:
	// 2px bar + 2px gap, clamped 8..48). The meter div's width is set by
	// the row's free space — cells carry no minimum width — so measuring
	// it once per activation + on resize keeps the strip honest in the
	// draft/home rows where the slider leaves little middle.
	useEffect(() => {
		if (!active) return;
		const el = meterRef.current;
		if (!el) return;
		const fit = () => {
			const w = el.clientWidth;
			setCellCount(Math.max(8, Math.min(METER_CELLS, Math.floor(w / 4))));
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, [active]);

	if (!active) {
		return (
			<Hint
				// The error line truncates in the button; its tooltip reveals it.
				label={error ?? "Dictate"}
				action={error ? undefined : "toggle-dictation"}
				side="top"
			>
				<button
					type="button"
					onClick={recover}
					aria-label={error ? `Dictation failed: ${error}` : "Start dictation"}
					data-testid="dictation-toggle"
					className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border/50 bg-card/50 text-xs text-muted-foreground/70 shadow-lg backdrop-blur transition-colors hover:border-border hover:text-muted-foreground"
				>
					<MicIcon className="size-3.5" />
					<span className="max-w-full truncate">{error ?? "Dictate"}</span>
				</button>
			</Hint>
		);
	}

	return (
		<div className="flex w-full min-w-0 items-center gap-2" data-testid="dictation-bar">
			<Hint label="Stop dictation (Esc)" side="top">
				<button
					type="button"
					onClick={toggle}
					disabled={phase === "stopping"}
					aria-label="Stop dictation"
					data-testid="dictation-toggle"
					className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-destructive/10 px-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
				>
					{phase === "stopping" ? <Loader2Icon className="size-3.5 animate-spin" /> : <MicIcon className="size-3.5" />}
					Stop
				</button>
			</Hint>
			<span className="size-1.5 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
			<div ref={meterRef} className="flex h-4 min-w-0 flex-1 items-center gap-[2px]" data-testid="dictation-meter">
				{levels.slice(-cellCount).map((v, i) => (
					<span
						key={i}
						className="min-w-0 flex-1 rounded-full bg-foreground/40"
						style={{ height: `${2 + Math.round(v * 14)}px` }}
					/>
				))}
			</div>
		</div>
	);
}
