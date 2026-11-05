# Notebook clicked-Apply finalization diagnostic

Date: 2026-11-03. Status: two diagnostic rounds complete; app integration approved,
implemented and verified through the full browser path.

## Question and authority

The full browser benchmark measured about 5.2 seconds between clicking Apply and
the instruction becoming transcription-ready. The owner asked to investigate
immediate finalization, then approved three baseline/Finalize pairs: silence,
crossing word, continued dictation; at most 120 seconds from the unused speech
allowance, zero editor/Tutor calls. This authorizes a diagnostic, not replacing
the existing finalized-prefix policy.

## Existing path

- `components/notebook-speech.ts`: `apply()` reserves a capture-time cutoff and
  `updateIntents()` waits for continuous finalized coverage strictly past it and
  through the end of every included word. Words belong by start time.
- `components/dictation.tsx`: streams PCM continuously and accepts final Results;
  currently sends no `Finalize` on Apply. Stop drains capture then `CloseStream`.
- `src/core/dictation-capture.ts`: maps provider sample time to capture time;
  missing audio/timing cannot certify coverage.
- `tests/notebook-click.test.ts`: seven existing tests passed, including whole
  crossing words, delayed command absorption and rejection of gaps/timeouts as
  completion evidence. These verify preservation, not improved speed.

The earlier actual-browser reproduction is
`/tmp/opencode/notebook-integration/check-28-visible-latency.{mjs,json}`. All three
clicked trials waited roughly 5.2 seconds for an empty final result to bridge
coverage beyond the click, although recognized text arrived much earlier.

## Provider contract

[Deepgram Finalize](https://developers.deepgram.com/docs/finalize) flushes buffered
audio without ending the stream. The documentation says a `from_finalize: true`
response **is not guaranteed** when little audio remains. It does not guarantee
that the returned span reaches the application's click or that forcing a boundary
mid-word preserves recognition. Neither the flag nor a timer proves completeness.

## Experiment

External diagnostic:
`/tmp/opencode/notebook-integration/check-28-finalize.mts` and matching `.json`.
Run with `mise x node -- node_modules/.bin/tsx <script>` from this checkout.
Single-use output prevents accidental repeat; `--resume` skips completed streams.
Preflight used no speech or generation calls.

Each pair used the same SHA-256-verified 16 kHz mono PCM recording, streamed in
real time in 128 ms packets. The candidate sent one Finalize immediately after
the first packet covering the simulated click, keeping subsequent audio flowing.
It used the actual production timeline and Notebook speech coordinator with an
inert persistence/editor boundary. The endpoint was that coordinator's ready
Apply dispatch, not edited working in a browser. This isolates transcription
behavior; these are **not new full user-visible Apply timings**.

| Case | Baseline speech-ready wait | One Finalize | Preservation observation |
| --- | ---: | ---: | --- |
| Silent click | 5.214 s | 0.259 s | Same recognized instruction |
| Click inside “pressure” | 2.751 s | 3.335 s | Whole crossing word retained; punctuation/timestamp changed |
| Continued dictation | 4.565 s | 4.552 s | Initial instruction and later draft remained separate |

One sample per case/variant. The generated “Write” was recognized as “Right” in
both short-recording baselines; recognition quality remains separate from routing
and latency. These runs do not prove general mid-word safety.

### Why it helped only one case

- **Silence:** click at sample-time 5.720 s; Finalize sent after audio through
  5.760 s; its empty final spanned 5.650–5.760 s. This bridged the cutoff in 259 ms.
- **Crossing word:** click at 2.650 s; Finalize sent through 2.688 s; response
  ended at 2.560 s with “Right.” The guard kept Apply pending. A later natural
  final supplied “Pressure” at 2.560–2.880 s, preserving the whole word in the
  earlier instruction. Treating `from_finalize` as ready would have omitted it.
- **Continuation:** click at 8.215102 s; Finalize sent through 8.320 s; returned
  coverage ended at 8.192 s, **23.102 ms before the cutoff**, despite more audio
  having been sent. Only the later instruction's final bridged the gap. It was
  correctly assigned to the next draft, but the earlier Apply still waited.

Thus sending audio before Finalize does not itself prove that the returned final
will cover all that audio. The observed shortfall must not be patched by extending
timestamps or accepting the flush flag as an acknowledgment of the click.

### Harness limitation and accounting

The first baseline received all transcription results but Node's experimental
HTTP/2 WebSocket did not emit close within five seconds after CloseStream. Its
pre-close timing and complete recording were retained. The harness closed the
client and exited, then resumed only the remaining five streams. Those closed
normally (code 1000). No recordings were repeated, and all six became ready before
CloseStream. This is a transport diagnostic limitation, not observed application
Stop behavior.

Usage: **96 speech seconds**, zero editor/Tutor calls, no automatic retries.
Only a short-lived Deepgram token was minted using the saved non-rotating speech
key. No ChatGPT account was opened and no saved settings or preview server changed.
Cumulative verification: 40 editor calls, 5 Tutor calls, at most 769.616 speech
seconds. The visible-latency authorization has 44.184 unused speech seconds;
24 of those are also unused within this diagnostic's 120-second sub-cap. Unused
allowance is not permission to add scenarios automatically.

## Bounded follow-up experiment

The owner subsequently approved two additional 16-second recordings, using 32 of
the remaining 44.184 speech seconds, zero editor/Tutor calls. The candidate sends
at most one more Finalize after the first `from_finalize` response if continuous
coverage still ends at/before the cutoff and additional audio has been sent.
No flag or timeout substitutes for the existing coverage/whole-word check.

Evidence: `check-28-finalize-followup.json`; same runner with `--followup`.

| Case | Saved baseline | Bounded follow-up | Result |
| --- | ---: | ---: | --- |
| Crossing word | 2.751 s | **0.580 s** | Whole “Pressure” retained in earlier instruction |
| Continued dictation | 4.565 s | **0.591 s** | Later instruction retained in next draft |

PCM hashes match the earlier baselines. Word sequences on both sides of the
cutoff match after normalizing capitalization/punctuation. Finalization changed
punctuation in the crossing-word case (`Right. Pressure.`), so this is not a claim
of byte-identical transcripts or general recognition guarantees.

- Crossing-word first response covered through 2.560 s; follow-up response
  covered through 2.94400006 s, including the word at 2.560–2.880 s. First and
  second requests were 38 ms and 294 ms after the click.
- Continuation first response covered through 8.19200056 s; follow-up covered
  through 8.44799957 s, beyond the click at 8.215102 s. Requests were 105 ms and
  362 ms after the click.
- Both became ready before CloseStream, with one Apply identity each, and closed
  normally (1000). No retries, no editor/Tutor calls, 32 speech seconds.

The two diagnostic rounds total **128 speech seconds**. Cumulative verification:
40 editor calls, 5 Tutor calls, at most **801.616 speech seconds**. The original
visible-latency allowance has **12.184 speech seconds** and five editor calls
unused; further full-app trials need an explicitly authorized speech extension.

## Recommendation and next decision

The bounded follow-up is now promising enough to propose a small app integration.
Keep the existing readiness rule and recording. Never synthesize coverage,
release on timeout, or retry indefinitely. See the
[approved implementation plan](../notebook-apply-finalization-plan.md).
Subsequent actual-browser measurements were **4.570 s** from silent click to
visible pressure formula and **4.147 s** from click to visibly replaced formula
while dictation continued. Speech-ready waits were 0.401/0.584 s. See the
[full-path results and retained failed fixture](../notebook-delivery.md#actual-browser-result-after-implementation).
These used generated audio through the actual browser worklet/WebSocket;
physical-microphone/iPhone acceptance remains separate.
