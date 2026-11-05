# Clicked Apply: bounded speech finalization

Status: owner selected **Implement and measure** (2026-11-03). Approved as written,
including at most four editor calls from the unused allowance and 80 additional
speech seconds for the two full-path trials. Implemented and verified; see
[delivery results](notebook-delivery.md#actual-browser-result-after-implementation).
Owner separately approved correcting the empty continuation fixture within the
same allowance. Three calls/39.696 speech seconds including that faulty fixture;
successful visible edits took 4.570 s and 4.147 s on isolated Terra/low.

## Goal and evidence

Shorten the measured wait for speech readiness while preserving complete words,
source-time draft ownership, one Apply identity, and continued recording.
[Diagnostics](research/notebook-speech-finalize.md) found:

- One flush: silent click 5.214 → 0.259 s.
- At most one follow-up flush: crossing word 2.751 → 0.580 s;
  continuation 4.565 → 0.591 s.

These are transcription-only samples. Acceptance must include the actual app's
click → visible edited working measurement.

## Proposed behavior

1. A clicked Apply reserves its existing source-time cutoff immediately.
2. If it still needs transcript coverage, request Deepgram Finalize after sending
   a captured audio packet whose end is beyond that cutoff. Continue recording.
3. If a flush result arrives and continuous coverage still ends at/before the
   cutoff, allow **one** follow-up request after additional audio has been sent.
   Maximum two Finalize messages per clicked Apply; no timer/repeated retry loop.
4. Only existing continuous finalized coverage, complete included words and
   unambiguous ownership can mark the Apply ready. A flush flag is merely a hint
   to consider the one follow-up. Missing flags/results retain normal waiting.
5. Cancel outstanding flush work on Stop, cancel, interruption, run replacement
   or teardown. Stop retains its existing drain/CloseStream and recovery path.

## Implementation boundary

- `src/core/dictation-capture.ts`: add an optional
  `requestFinalization(cutoff: number): void` capability to the begin clock, and
  optional `fromFinalize` metadata on final results. Map Deepgram's
  `from_finalize` flag without changing timestamps or inventing coverage.
- `components/notebook-speech.ts`: clicked intents own the initial request and
  at-most-one follow-up counter. They use the existing `finalizedThrough()` and
  `updateIntents()` logic. Spoken Applies still follow finalized command evidence.
  A duplicate result carrying the flush flag may signal the bounded follow-up
  without duplicating text or reinterpreting commands.
- `components/dictation.tsx`: own sending the control message, after newly sent
  PCM, on the active socket. Tie queued requests to the capture generation;
  discard stale requests on interruption/reconnect/cleanup. A request made during
  connection setup waits for the applicable audio to be sent on that socket.
  Keep credentials and microphone lifecycle here.
- No persisted flush counters or provider-completion claims: existing pending
  Apply and speech recovery remain the durable facts.

This is a speech-path change. Catalog reuse remains a separate later design
decision; saved model selection is not part of this plan.

## Verification

Add focused regression coverage at the production coordinator/transport seams:

- Real captured packet before control-message ordering, including handshake queue.
- Silent coverage released quickly only by a returned span beyond the click.
- First flush stops short: no premature Apply; exactly one follow-up after more
  audio; missing/duplicate flush flags do not produce unbounded requests.
- Crossing word stays whole; later speech remains in the next draft; delayed
  spoken Apply remains absorbed into the same clicked operation.
- Busy/repeated Apply, Stop/cancel, disconnect, run replacement and recovery
  cannot leak flushes or trigger extra edits.
- Existing Notebook/dictation tests, typecheck, lint and production build.

Then run two isolated Terra/low browser trials (silent click and continued
dictation), using the existing full-path harness methodology and saved baselines.
Measure actual click → visible working; retain exact speech, recognized text,
readiness, provider calls, correctness and retry count. Verify the real worklet,
browser WebSocket, persistence and rendering path. Any recognition/quality failure
is reported alongside latency, not counted as a successful equivalent edit.

Proposed live allowance: **at most four editor calls including format retries**
from the five unused visible-latency calls, plus **80 additional speech seconds**
(two recordings capped at 40 s each), zero Tutor calls. Isolated settings/data,
exclusive credential ownership, preserve existing preview listeners, close the
test server/browser afterward. Confirm account ownership before launch. Physical
microphone/iPhone and owner-learning acceptance remain separate.
