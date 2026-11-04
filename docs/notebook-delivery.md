# Conversational notebook — integration delivery

Spec: [#18](https://github.com/bearthababe/learnharness/issues/18).
Current branch: `notebook/28-acceptance`; original integration started from
`f65d108` (#19) on `integration/conversational-notebook`.
The owner requested the complete spec through `/implement-spec`, subject to
keeping notebook behavior isolated and app integration as non-intrusive as possible.

The latest owner-approved policy is in `docs/notebook-correction-plan.md`.
Stop never applies or sends; #27 was closed as not planned. The #28 settled
handoffs below supersede the earlier overlapping-action delivery notes.
Current mobile limitations do not authorize redesigning the app-wide sidebar.

## Latest: clean card controls deployed (2026-11-04)

Owner accepted the overall card layout, rejected its crowded controls, and
approved **Implement this cleanup**. Header now has small Undo/Expand icons and
one ⋯ menu; Model, History, Start fresh, Usage and Close are in that menu. The
compact instruction/microphone and small Apply leave the working area dominant.
Clarifications/errors are expandable. Model selection remains per session.

Source `48224b9`, build `fHPXoJTBmay2lBmcEUHGR`, is deployed to the existing
**https://thinkpad.tailfd9bf6.ts.net:8444/**. Use **Reload preview**, including in
the still-open native current-fork Electron app. Full **2,693 tests /499 suites**,
typecheck/lint, browser flows, final geometry, review, build/payload, Electron
smoke and actual HTTPS/Reload checks passed. Physical phone and owner-learning
acceptance remain pending. The authoritative [verification record](notebook-mobile-verification.md)
contains the current build location, process identity and evidence links.

## Notebook candidate picker and prompt adoption (2026-11-04)

**Combined-build progress:** owner approved checkpointing Notebook (`2d43b41`),
integrating mobile baseline `d161c0d`, checking and redeploying slot 1 before their
learning walkthrough. Owner then chose **A**: explicit Tutor Send finalizes its
recording and submits once. Notebook recording, Apply and handoffs must settle
before submission; Stop alone never applies or sends. Compact Notebook microphone
controls sit inside its instruction input. The comparison prototype is archived
at `prototype/notebook-send-comparison-v1` (`63d0cc2`); no further decision is pending.

Owner subsequently approved the [iPad layout adaptation](notebook-ipad-layout-plan.md).
The exact handoff came from the #45 implementation session at source `329677b`.
Implemented in `f3d1c63`, with a Close/reopen reading-position correction in
`19e80dc`. Presentation follows the iPad structure to ease later common extraction:
rounded card/gaps, below-Tutor phone/tablet split, available-width wide split,
adjustable divider and Expand/Back/Close, retaining equation-specific behavior.

The full suite passed **2,693 tests / 499 suites**, plus typecheck and lint.
Baseline and combined Notebook browser checks passed. New layout checks passed
geometry, divider, full/split/close, retained editors/reading positions, keyboard
and touch containment. Review corrections, final production build/payload and
Electron bundled-Node smoke passed. The combined build is **deployed and ready
for owner review** at **https://thinkpad.tailfd9bf6.ts.net:8444/**, source
`19e80dc`, build `P8NS9Q-Wp6wmWMML-2LhS`. Actual HTTPS identity, Home Screen assets
and Reload passed; the current fork's native Electron window is open. Saved
data/auth paths and other previews are retained. Physical-phone and owner-learning
acceptance remain pending. The authoritative combined acceptance
record is [notebook-mobile-verification.md](notebook-mobile-verification.md).

**Owner acceptance resumed (2026-11-04):** the owner confirmed the mobile interface
works well enough and explicitly selected **Yes, resume** for Notebook real-learning
acceptance. The earlier mobile-usability pause is lifted. The combined-build plan
and handoff are approved; verification and deployment precede the walkthrough.
Physical-phone and owner-learning
acceptance remain incomplete.

Owner approved the [picker implementation plan](notebook-model-picker-plan.md):
**DeepSeek / low · Zen** and **Terra / off · ChatGPT**, now selected under
**⋯ → Model** and remembered per learning session. The initial choice
is DeepSeek/low. Shared Cheap and Tutor settings remain independent.

Each new Apply stores its candidate at acceptance, including speech reservations;
replays and restart recovery keep it. Previously accepted operations without a
candidate retain legacy shared-Cheap routing. Switching saves only the choice,
preserving working, drafts, history, Undo and snapshots. Recording, Apply, handoff
and pending saves lock the picker; clarification/failure allows a new choice for
the next explicit Apply. Unavailable candidates fail without substitution.

Production now includes the **exact tested speech-error paragraph**. Byte equality
against the completed comparison's revised prompt was verified offline, preserving
all other rules and full context. Earlier research reports describe historical
trial-only behavior; this approval supersedes their no-adoption status.

Validation: **155 Notebook/dictation tests passed**, typecheck, lint, production
build, payload curation and standalone smoke using Electron's bundled Node passed.
Mocked wire checks verify DeepSeek `reasoning_effort: low`, Terra `effort: none`,
independent model routing and subscription credential admission. Four existing
dynamic-trace build warnings remain; payload checks passed. No new paid calls:
cumulative live verification stays **512 editor dispatch attempts (510 reached
providers), 5 Tutor calls, at most 930.968 speech seconds**.

### Earlier Notebook-only deployment (superseded by combined delivery above)

Owner then approved **Deploy and launch**. Slot 1 served this
checkout's verified standalone production build **`zPmtJgWVuIviq4AnjA6kv`** on
127.0.0.1:3000 (PID 3313959), at
**https://thinkpad.tailfd9bf6.ts.net:8444/**. It retains the previous slot's
`/home/bjorn/repo/teach/learnharness/data` and `auth.json` paths, with no credential
copy. The current fork's native Electron shell is open against that server
(PID 3314860, `learnharness`, mapped window); the installed old AppImage was not
used. Slot 2's lesson-navigation preview remains owned by PID 1550620.

The first development-server launch exhausted temporary-storage quota in its
generated Turbopack cache. Stopped that owned server, removed only this session's
`.next/dev/cache` and `.next/cache`, and served the already verified production
payload instead. Native shell was reopened against the production server.

Deployment checks: local/HTTPS HTTP 200; both exact candidate/provider/level entries
available in the current catalog; manifest, 512px icon and Apple touch icon HTTP
200; standalone metadata present. Headless Chromium exercised the real HTTPS UI
with intercepted, in-memory Notebook fixtures (zero owner-session writes): picker,
reload retaining saved choice/draft, emulated phone keyboard visual viewport,
history gestures including both edges, header/input gestures, and release on
blur/desktop transition passed. `Reload preview` uses ordinary network reload,
restores saved work and ends active recording. No offline service worker added.
Physical iPhone/Home Screen and owner-learning acceptance remain open.

Evidence: `/tmp/opencode/notebook-integration/check-28-picker-preview.{mjs,json}`,
`notebook-picker-production.log`, `notebook-picker-electron-production.log`.
Native launch: `WAYLAND_DISPLAY=wayland-1 LH_DEV_URL=http://127.0.0.1:3000
node_modules/.bin/electron . --ozone-platform=wayland` from this checkout.

### Three-session preview coordination

At the owner's request, contacted mobile, #45 handwriting/iPad and #39 input
sessions through OpenCode's session API. All acknowledged the assignments:
Notebook **3000/8444**, #45 **3001/8445** after its approved ready handoff, mobile
**3002/8446**. #39 has no public-slot claim and uses disposable local 3109 checks.
The owner restored 8444 after it had temporarily pointed to 3002. All three local
and HTTPS endpoints returned 200 with the intended current app identities. #45
is not ready for takeover, so lesson-navigation remains on its reserved slot.

Shared ownership is recorded in `/home/bjorn/.local/share/opencode/preview-slots.md`,
linked from the updated global agent instructions. Mobile confirmed that its
default data/auth paths are the same main-repo paths used by this Notebook
deployment. Coordinate data/credential ownership before concurrent write trials;
port isolation does not isolate those stores. Notebook owner acceptance remains
paused pending mobile fixes. No storage migration or additional live trial was
performed during coordination.

## Owner-trial Apply latency follow-up (2026-11-03)

### Pi catalog upgrade and desktop packaging

The owner's latency goal is **roughly one second**, aspirational rather than a
hard cutoff. Investigation confirmed that the saved ChatGPT account exposes
Terra 6.1 but Pi 1.4.0's missing model definition filtered it out. The owner
approved upgrading both Pi packages to 1.5.0, updating the affected compatibility
fixtures, and fixing the discovered desktop packaging exclusions.

Terra now reaches the real picker projection from the saved account. The upgrade
includes a regression for this account/catalog intersection, retains rejection of
unknown models, and preserves the existing subscription metadata projection.
The approved fixture updates account for upstream catalog changes and corrected
fake-provider prompt-cache accounting. Runtime application behavior needed no
migration for the new schema validator in the exercised test suite.

Packaging now includes Pi's newly required OAuth `trusted-url.js`, and filters
local data/credentials from Next's separately copied instrumentation trace using
the documented post-compilation hook. The final refusal guard remains active;
source records and Notebook restart recovery are preserved. Clean production
build, payload curation and Electron-runtime standalone smoke checks passed.
Final validation: **2,664 tests / 499 suites passed**, plus type checking, lint
and whitespace checks. Logs: `check-28-pi15-verified-tests.log`,
`check-28-pi15-trace-{types,lint}.log`, `check-28-pi15-build-filtered.log`, and
`check-28-pi15-desktop-smoke.log` under `/tmp/opencode/notebook-integration/`.
See [catalog investigation and implementation](research/notebook-terra-catalog.md)
for evidence and check paths. The initial Terra trial is recorded below.
The upgrade is local to this checkout. At handoff, slot 1 was occupied by a server
from `/home/bjorn/repo/teach/learnharness`; that process was not replaced, and this
checkout's upgraded native app was not launched over it.

### Terra 6.1 / low speed trial

Following the upgrade, the owner approved two isolated replays of the same
instructions with **Terra 6.1 / low**, capped at four additional editor calls
including retries. The direct production editor and ChatGPT transport used **two
calls total**, both format-valid edits on the first attempt. No Tutor or speech
calls were made and no model settings were changed.

| Original operation | Luna/medium with updated prompt | Terra/low | Result difference |
| --- | --- | --- | --- |
| 1 | 12,838 ms, two calls | 3,917 ms, one call | Terra retained repeated `24` from the recognized transcript |
| 7 | 6,469 ms, clarification | 3,767 ms, one call | Terra edited, retaining the unfinished `3 \times` term |

Terra editor wall times were 3,920 ms and 3,768 ms. Separate catalog discovery
took 3,057 ms and is excluded from those timings; recording, HTTP, rendering and
command recognition were not exercised. This is a two-case directional result,
not a latency distribution or an equivalent-quality benchmark. The first output
was `24 \times 13 = 24\ 24 \times 10 + 24 \times 3`; the second was
`300 \times 50 - 300 \times 3 + 3 \times + 6 \times 47`.
Both differ from earlier saved working and require owner quality review. The
roughly-one-second goal remains unmet. Evidence and per-attempt checkpoints:
`/tmp/opencode/notebook-integration/check-28-terra-low.{mts,json}`.

The interactive server on port 3000 uses a separate empty ChatGPT registration
store; the trial used the regular saved connection exclusively and closed its
owner afterward. Cumulative agent verification now totals 31 editor calls,
5 Tutor calls and at most 573.800 speech seconds, including this separately
approved trial. Two of the trial's four calls remain unused.

### Terra reasoning-off follow-up

The owner approved the same two-case test with reasoning off and requested
research into faster alternative models, including DeepSeek. The off trial used
**two calls**, no retries, with outgoing payloads verified as
`gpt-6.1-terra` / `reasoning.effort: none`.

| Original operation | Terra/low | Terra/off | Off result |
| --- | --- | --- | --- |
| 1 | 3,917 ms | 3,470 ms | Same repeated `24` as low |
| 7 | 3,767 ms | 2,693 ms | Dropped the unfinished multiplication after `+ 3` |

The second result was `300 \times 50 - 300 \times 3 + 3 + 6 \times 47`.
It is format-valid but fails the requirement to preserve unfinished working.
Reasoning off is therefore not accepted as an editor configuration on this
evidence. Times are direct production-editor completion times, not spoken Apply
latency; wall times were 3,473 and 2,694 ms. Catalog discovery took **3,045 ms**
separately. These two samples cannot establish typical or tail latency.

Code inspection found a separate hot-path cost: `src/server/notebook.ts` awaits
engine resolution for each queued edit, whose production factory unconditionally
awaits `refreshConnectionCatalog(cheap.provider)`. ChatGPT discovery in
`electron/chatgpt.cjs` performs its authenticated model-list request each time.
Thus discovery is additional work before the model call, not part of the editor
numbers above. A separate metadata-only check measured **1,128 ms** on initial
refresh and **1,035 / 881 ms** on two warm refreshes, with zero generations;
the earlier roughly-three-second discovery timings are not a fixed cost.
Evidence: `check-28-catalog-latency.json` in the external integration directory.
Reusing valid catalog state would require a separate approved
plan preserving account changes, authorization invalidation and explicit retry.

Evidence: `/tmp/opencode/notebook-integration/check-28-terra-off.json`, generated
by `check-28-terra-low.mts --reasoning=off`. No saved model settings changed;
zero Tutor calls and speech seconds. Cumulative agent verification now totals
33 editor calls, 5 Tutor calls and at most 573.800 speech seconds. The separate
four-call off-trial allowance has two unused calls.

### Full-path browser latency: action to visible working

The owner explicitly requested the wait they experience, including all stages,
and approved six real-browser trials: spoken and clicked Apply for Luna/medium,
Terra/low and Terra/off, capped at 12 editor calls and 240 speech seconds.

The test launched the production standalone payload under Electron's bundled
Node on a temporary loopback port, with isolated settings/chats, and drove the
actual desktop UI in headless Chromium. The same generated instruction recording
went through the app's real AudioWorklet and Deepgram. Spoken timing starts at
the last audible sample of “Apply changes” (waveform threshold 100/32768); clicked
timing starts at the actual button click during recording, about half a second
after the instruction's audible end. The endpoint is the new working's DOM update
followed by two animation frames. This observes a browser rendering opportunity,
not physical display scanout, a physical microphone, or iPhone acceptance.

| Configuration | Spoken Apply → visible edit | Button Apply during dictation → visible edit |
| --- | --- | --- |
| Luna / medium | **5.820 s** | **18.663 s**, including a format retry |
| Terra / low | **No edit: clarification** (response observed at 7.242 s) | **9.627 s** |
| Terra / off | **4.345 s** | **9.278 s** |

These are individual observed samples, not averages or a fair identical-text
model ranking. Deepgram sometimes recognized “Write pressure equals force divided
by area” as “Right pressure equals force in my by area.” Luna's spoken output
included `Right pressure`; its clicked output stored the malformed transcript as
text. Terra/low correctly requested clarification in its spoken case. Terra/off
inferred the intended formula from malformed speech. Fast display therefore does
not establish correct interpretation; the earlier off-mode preservation failure
also remains relevant.

The stage breakdown identifies a delay independent of model generation:

| Case | Action → transcript-ready request | Ready request → provider start | Provider response(s) | Last response → visible working |
| --- | ---: | ---: | ---: | ---: |
| Luna spoken | 0.847 s | 1.148 s | 3.545 s | 0.280 s |
| Luna clicked | 5.250 s | 1.001 s | 12.122 s | 0.288 s |
| Terra low spoken | 0.844 s | 0.978 s | 5.159 s | No edit |
| Terra low clicked | 5.220 s | 1.033 s | 3.093 s | 0.281 s |
| Terra off spoken | 0.807 s | 0.898 s | 2.363 s | 0.277 s |
| Terra off clicked | 5.255 s | 1.018 s | 2.726 s | 0.279 s |

Provider-start times are reconstructed from saved attempt completion timestamps
minus `elapsedMs`; rounding/checkpoint time can cause small discrepancies.
The ready-to-provider interval includes catalog resolution and persistence, not
an isolated catalog-only measurement. In every clicked case, speech text arrived
roughly 0.2–0.3 s after the click, but the Apply did not become transcript-ready
until a finalized empty speech result about **5.2 s** after the click. This is the
contiguous finalized-coverage requirement waiting for provider evidence, not a
model delay. Any improvement must preserve the accepted cutoff/crossing-word
policy; elapsed time alone cannot establish transcript completeness.

The harness initially stopped after the first completed case because it counted
reserve/ready requests sharing the same operation ID as two Applies. The saved
operation was applied once. It was retained and the other five cases resumed;
none were repeated. Final usage: **7 editor calls**, **99.816 speech seconds**,
zero Tutor calls. All six had one accepted edit operation; one resolved to a
clarification. Browser logs had no page errors. Ordinary settings and existing
preview servers were not changed. The isolated server and browser were closed.

Evidence: `/tmp/opencode/notebook-integration/check-28-visible-latency.{mjs,json}`,
with zero-generation/zero-speech preflight evidence in
`check-28-visible-latency-preflight.json`. Cumulative agent verification now totals
40 editor calls, 5 Tutor calls and at most 673.616 speech seconds, accounting for
the separately approved trials. **The earlier direct editor timings must not be
presented as the user's full Apply wait.**

### Bounded clicked-Apply finalization

Speech-finalization follow-up: the owner approved six isolated speech-only
streams (no editor/Tutor calls). One Finalize reduced silent-click speech
readiness from **5.214 s to 0.259 s**, but did not improve the crossing-word or
continued-dictation cases. Actual finalized coverage checks prevented premature
release; the flush flag alone is insufficient. Usage: **96 speech seconds**,
cumulative at most **769.616 s**, still 40 editor and 5 Tutor calls. These are
transcription diagnostics, not full visible Apply timings. See
[experiment, limitations and proposed next step](research/notebook-speech-finalize.md).

The subsequently approved two-stream follow-up used **32 additional speech
seconds** and at most one extra flush per click. Speech readiness improved to
**0.580 s** for a crossing word and **0.591 s** before continued dictation, with
whole recognized words retained on both sides of the cutoff. Cumulative speech
verification is now at most **801.616 s**, still 40 editor/5 Tutor calls. These
remain provider diagnostics. The
[small app integration plan](notebook-apply-finalization-plan.md) was subsequently
approved with **Implement and measure**, including full click-to-visible browser
checks and an 80-second speech-budget extension.

Implemented through the existing capture hook: clicked intents request Finalize
after sent PCM covers their cutoff, with at most one follow-up after a short
flush response and additional sent audio. Readiness still requires continuous
finalized coverage and whole-word ownership. Pending hints are discarded on
Stop/cancel/interruption/reconnect/teardown. No timer certifies completeness.
Flush counters remain transient; persisted Apply/recovery semantics are unchanged.

Seven new regressions failed before implementation, then passed. The complete
Notebook/dictation selection passed **167 tests / 2 suites**, plus typecheck,
lint, production build and server-payload curation. Tests exercise the mounted
Apply → real capture hook → PCM/control ordering → speech coordinator → scripted
editor path, crossing words, duplicate/missing/short flags, the one-follow-up cap,
handshake buffering, busy Apply and termination/replacement cleanup. Existing
recovery, delayed command absorption and Tutor/activity tests remain green.

#### Actual browser result after implementation

Production standalone payload on Electron's bundled Node, isolated data/settings,
headless Chromium desktop UI, actual AudioWorklet and Deepgram, same generated
audio methodology as the earlier baseline. Terra/low is selected only in the
isolated settings. The saved normal Cheap selection remains Luna/medium.

| Case | Click → visibly changed working | Speech ready | Ready → provider start | Provider | Last response → visible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Silent click, write pressure formula | **4.570 s** | 0.401 s | 1.417 s | 2.452 s | 0.300 s |
| Continued dictation, replace existing formula | **4.147 s** | 0.584 s | 1.004 s | 2.281 s | 0.277 s |

The comparable earlier Terra/low silent-click sample took **9.627 s**, including
5.220 s for speech readiness. Both successful new cases used one editor call,
without a format retry. Outputs were `p = \frac{F}{A}` and
`p = \frac{F}{2A}` respectively. The replacement retained “Keep this instruction
for later.” in the next draft and left recording active until the test stopped
it. One and two Finalize messages respectively; normal socket closure, complete
speech runs, no page errors or Tutor sends. These are individual measurements,
not a latency distribution or physical-microphone/iPhone acceptance. The short
instruction was still recognized as “Right pressure”; Terra inferred the intended
formula, so this is not evidence that transcription recognition has improved.

The first continuation fixture was empty despite asking to replace a formula.
Terra correctly clarified at **5.372 s** instead of editing; speech readiness was
1.276 s. That failed fixture/result is retained. The harness then hit a final
assertion using `draft` instead of persisted `notebookDraft`, after saving both
results. The owner explicitly approved one corrected continuation case using
the first successful formula as isolated seed working. Its DOM endpoint required
a changed formula, not initial rendering of that seed. No other trial was replayed.

Evidence under `/tmp/opencode/notebook-integration/`:
`check-28-visible-finalization.json`,
`check-28-visible-finalization-repair.json`, their no-generation preflights, and
`check-28-visible-latency.mjs --finalization[-repair]`. Aggregate validation of all
three recorded cases confirms at most two flushes, one Apply identity, complete
recordings, no Tutor sends and retained later words. The original fixture/harness
error remains in its evidence file rather than being overwritten.

Usage including the faulty fixture: **3/4 authorized editor calls**,
**39.696/80 additional speech seconds**, zero Tutor calls. Cumulative verification:
**43 editor calls, 5 Tutor calls, at most 841.312 speech seconds**. The regular
profile had no active app owner; the other checkout's active ChatGPT token values
were privately verified distinct. All trial servers/browsers closed. Existing
preview listeners and saved settings were not replaced. This implementation is
in the integration checkout, not deployed to the occupied owner preview/native app.

At this stage the remaining measured wait was chiefly model generation plus
approximately 1–1.4 seconds between speech readiness and provider start. The
subsequently approved catalog reuse change below removes that repeated discovery.

### Catalog reuse: full-path follow-up

Owner approved **Implement and measure** for the
[catalog reuse plan](notebook-catalog-reuse-plan.md), with four editor calls
including retries and 80 additional speech seconds. Notebook now calls
`ensureConnectionModel(provider, id)`: reuse the existing valid account scope,
refresh if the selected model is missing/invalidated. Each generation still
obtains its normal credential lease. Explicit Providers refresh and failure/retry
behavior remain; no extra persistent cache or expiry policy was introduced.

The production-path regression first failed with two discovery requests for two
Applies, then passed with one cold discovery and two independent generation
leases. **117 relevant tests**, typecheck, lint, production build and payload
curation passed, including account/authority invalidation, unknown/removed model,
failed refresh, authorization failure, no automatic retry/fallback, and native
subscription catalog checks.

Actual browser click → changed working, same generated audio and isolated
Terra/low settings as the previous successful cases:

| Case | Before catalog reuse | After | Speech readiness | Ready → provider start | Provider | Response → visible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Silent click | 4.570 s | **3.428 s** | 0.294 s | 0.006 s | 2.837 s | 0.291 s |
| Replacement while dictating | 4.147 s | **2.995 s** | 0.298 s | 0.004 s | 2.413 s | 0.279 s |

The external metadata-only probe observed five successful catalog HTTP requests
during startup/settings/page loading and **none during either Apply**. The
earlier 1–1.4-second pre-generation gap became **4–6 ms**. Cold/explicit discovery
still occurs and was not removed. The remaining measured wait is now dominated
by generation (2.4–2.8 s), plus about 0.3 s each for speech readiness and display.

Both edits completed without retries: pressure = force/area, then the seeded
formula replaced by `p = \frac{F}{2A}`. Later dictated text remained in its next
draft. Complete recordings, one Apply and one Finalize each, normal socket closes,
no page errors or Tutor sends. Single samples, not a distribution or physical
microphone/iPhone acceptance; recognition variability remains. Saved Cheap
settings and occupied previews were not changed. Integration checkout only.

Evidence: `check-28-visible-catalog-reuse.json` and preflight under
`/tmp/opencode/notebook-integration/`; runner `check-28-visible-latency.mjs
--catalog-reuse`, external probe `check-28-catalog-fetch-preload.mjs`. Only request
timestamps/status were logged, no credentials or content. All trial processes
closed. Usage: **2 editor calls / 23.968 speech seconds**, zero Tutor calls;
cumulative **45 editor calls, 5 Tutor calls, at most 865.280 speech seconds**.

### Faster-model research

**Qwen high / completed four-level comparison (2026-11-04):** all 20 high cells
complete, 20 calls/no retries; same frozen inputs/new prompt. High made two wrong
edits, asked twice instead of editing, and had median **0.648 s** (range 0.328–5.871 s).
Fresh recovery correct at 5.499 s; history-bearing unfinished term dropped, and
punctuated initial formula retained unwanted Right. Off/low/medium/high wrong
edits 3/3/1/2 and extra questions 3/1/3/2; none achieved all intended outcomes.
[Full four-level report](research/notebook-qwen-reasoning-comparison.md) and portable
data retain all 80 observations and exact frozen context. Cumulative **512 editor
attempts (510 reached providers), 5 Tutor calls, at most 930.968 speech seconds**.
Source settings/prompt unchanged, isolated key removed, no further trial planned.

**Higher reasoning follow-up (2026-11-04):** same 20 frozen cases/new prompt on
Cerebras Qwen medium, OSS high and Zen Gemini medium, all 60 calls complete with
no retries. [Full comparison and actual outputs](research/notebook-higher-reasoning-comparison.md).
Wrong edits decreased **3→1 / 5→2 / 2→0**, but questions instead of edits increased
**1→3 / 2→5 / 0→4**. Median editor times **0.5485 / 0.6975 / 1.986 s**. Qwen stayed
fast with fewer wrong edits; OSS high regressed on fresh, Gemini became more
hesitant. DeepSeek low retains the stronger observed balance in the existing suite
(zero wrong edits, one extra question, 1.654 s median). No saved model/prompt change.
Cumulative **492 editor attempts (490 reached providers), 5 Tutor calls, at most
930.968 speech seconds**. Private keys removed, source hashes unchanged.

**Complete new-prompt suite (2026-11-04):** owner approved all 15 previous
provider/model/effort settings ×20 frozen cases; all **300 cells completed**.
[Full report](research/notebook-complete-model-comparison.md) includes exact
inputs/context/prompt, all actual outputs, classifications and timings; portable
JSON evidence alongside it. **DeepSeek low and Terra off had zero incorrect edits**
and one clarification instead of desired edit each; median editor **1.654/3.5225 s**.
Terra low made two wrong edits; Cerebras Qwen low three, GPT-OSS low/medium five
each despite much faster 0.370–0.497 s Cerebras medians. Fresh recovered 12/15,
clarified once, wrong twice. Intentional rename and targeted mistake preservation
15/15. Unfinished notation tracked separately, not a blanket acceptance score.
**316 actual provider calls** including 16 format retries; two zero-network
Gemini harness errors repaired offline, then remaining Gemini cells completed.
318 editor attempts/600 authorized, zero speech/Tutor. Cumulative **432 editor
attempts (430 reached providers), 5 Tutor calls, at most 930.968 speech seconds**.
Source prompt/settings unchanged; private keys removed. No default/prompt adoption
or further live trial authorized by these results. Timings are editor-only.

**General speech-error distinction prompt (2026-11-04):** owner-approved eight-
invocation test added the proposed paragraph only at the trial request boundary.
Frozen “fresh” corrected to `p` by GPT-OSS medium **529 ms** and DeepSeek low
**2,046 ms**; both retained genuine mistakes in the targeted fixture. Both asked
on unfinished multiplication (OSS original/revised 495/423 ms; DeepSeek revised
2,922 ms versus prior original successful edit 2,893 ms). Thus a useful fresh-case
improvement, not a complete acceptance or proven overall prompt upgrade. See
[comparison](research/notebook-speech-error-prompt-comparison.md). Eight calls,
no retries/speech, source settings/prompt unchanged, keys removed. Cumulative
**114 editor calls, 5 Tutor calls, at most 930.968 speech seconds**.

**Frozen “fresh” comparison (2026-11-04):** audit established Terra low already
corrected the exact complete input that GPT-OSS low mishandled; DeepSeek/Qwen
browser runs had received “pressure” and were untested on this error. Owner
approved three gap-filling invocations with original input/context/production
prompt byte-identical: GPT-OSS medium **572 ms**, DeepSeek low **18,557 ms**,
Cerebras Qwen low **453 ms**. All retained `fresh`, none clarified; medium OSS
also returned an extra literal slash before `frac`. See
[frozen comparison](research/notebook-frozen-fresh-comparison.md). Reused Terra
and OSS low provider-attempt times **2,413/309 ms**, not editor/browser totals.
Three calls, no retries/speech; cumulative **106 editor calls, 5 Tutor calls, at
most 930.968 speech seconds**. Source settings/prompt unchanged, keys removed.

**GPT-OSS 120B/low on Cerebras (2026-11-04):** normal production prompt/context,
two direct-editor cases then owner-approved browser timing despite unresolved
`3 × ?` notation. Direct times **518/15,377 ms**; targeted preservation correct.
Browser **882/859 ms**: first correct, replacement produced `fresh = F/(2A)`
after speech heard “pressure” as “fresh.” Later draft retained, no retries. Fast
browser output but no two-case end-to-end correctness pass or consistent-latency
claim. See [GPT-OSS trial](research/notebook-cerebras-gpt-oss-trial.md). Four calls,
21.392 speech seconds; cumulative **103 editor calls, 5 Tutor calls, at most
930.968 speech seconds**. Credentials removed, processes closed, settings unchanged.

**Latest full-browser Cerebras comparison (2026-11-04):** approved revised-prompt,
archived-entries-omitted Qwen 3.8 27B/low setup reached changed working in
**1,161/944 ms**. Replacement correct and later draft retained; first output
incorrectly added `P_{right}` after Deepgram heard “Write pressure…” as “Right
pressure…”. DeepSeek previously received the same transcript and produced plain
`p`. Thus first timing is visible-output latency, not a correct-edit success.
See [browser comparison](research/notebook-cerebras-browser-trial.md) for the
Terra **3,428/2,995 ms** and DeepSeek **2,099/1,979 ms** baselines and breakdown.
Both trials already had empty archived entries; current working/conversation
preserved, actual revised-prefix/low verified. Two calls, no retry,
**21.688 speech seconds**, normal closure/no browser errors. App/settings unchanged;
cumulative **99 editor calls, 5 Tutor calls, at most 909.576 speech seconds**.
No default switch, history-filtering policy or transcript correction approved.

**Low-reasoning history/prompt follow-up:** owner approved repeating the four
Cerebras conditions twice with low. Eight calls, no retries. Revised prompt with
old entries absent preserved the intended unfinished expression **2/2**, at
**750/933 ms**; revised with entries **1/2**; original prompt **0/2** with or
without entries. Actual low/nonzero reasoning verified. See
[low comparison](research/notebook-cerebras-history-low-comparison.md).
Promising exact-fixture result, not broader/default/context-policy acceptance;
history-dependent requests and browser latency remain untested for this variant.
No app/settings change. Cumulative **97 editor calls, 5 Tutor calls, at most
887.888 speech seconds**.

**History isolation follow-up:** owner approved four Cerebras/off conditions
(old entries present/absent × original/revised prompt), two runs each. Eight runs
used **12 calls**, including four JSON-envelope retries. History present produced
three questions/one preserved edit; absent produced one preserved edit and three
changed expressions. Manual source review recognized valid `\\dots`/spacing
variants that the narrow automatic checker missed. Neither context removal nor
wording yielded a consistent complete edit. See
[history comparison](research/notebook-cerebras-history-comparison.md).
No application/context/prompt/default change. Cumulative **89 editor calls,
5 Tutor calls, at most 887.888 speech seconds**; no speech used in this follow-up.

**Prompt diagnosis:** owner-approved original/revised Cerebras/off comparison used
eight calls across four fixtures per prompt. The revised unfinished-expression
clarification handled the two new unfinished cases and retained clarification
for an ambiguous target, but did not fix the original history-bearing dictation:
both variants asked questions proposing unwarranted math changes. No edit/state
loss there. Original addition retained `+` with an extra dot, an exact-source
mismatch; not deletion. See
[prompt comparison](research/notebook-cerebras-prompt-comparison.md).
No production prompt/settings change, retries, speech or browser calls.
Cumulative **77 editor calls, 5 Tutor calls, at most 887.888 speech seconds**.

**Cerebras low follow-up:** owner-approved Qwen 3.8 27B/low still clarified on the
unfinished fixture (**1,602 ms**), with state unchanged. Targeted edit passed in
**442 ms**. Actual low and **1,559/124 reasoning tokens** verified; two calls, no
retries/speech. The conditional browser gate remained unmet. See
[Cerebras follow-up](research/notebook-cerebras-trial.md#follow-up-low-reasoning).
No prompt/default/settings changes; cumulative **69 editor calls, 5 Tutor calls,
at most 887.888 speech seconds**.

**Preceding off screen:** owner-approved Cerebras **Qwen 3.8 27B/off**
returned a correct targeted edit in **456 ms**, but clarified on the unfinished
expression in **538 ms** with state unchanged. Both payloads explicitly disabled
reasoning and both responses reported zero reasoning tokens. Two calls, no
retries. The owner-approved browser stage was conditional on both correctness
cases passing; it was therefore not run. See
[Cerebras trial](research/notebook-cerebras-trial.md). These are editor-only times,
not visible latency. No app/prompt/settings changes; cumulative **67 editor calls,
5 Tutor calls, at most 887.888 speech seconds**.

**Latest full-path result:** owner-approved Zen **DeepSeek V4.1 Flash/low** browser
comparison completed both actual-speech-transport cases correctly, without retries:
silent click **2,099 ms** and seeded replacement during continued dictation
**1,979 ms**, versus Terra/low **3,428/2,995 ms**. Later speech preserved; one
Finalize/model call each, complete recordings, normal socket closure, no errors
or Tutor sends. Breakdown and methodology:
[DeepSeek browser trial](research/notebook-deepseek-browser-trial.md).
These are single-sample click-to-visible results, not physical-phone acceptance.
Two calls/22.608 speech seconds used; cumulative **65 editor calls, 5 Tutor calls,
at most 887.888 speech seconds**. Trial processes closed, private key copy removed,
saved settings and previews unchanged. No default-model change approved.

Before that, owner approved the three research candidates with **reasoning off**
through Zen: Haiku 5.5, Qwen3.8 Flash, GPT-6 Luna. All outgoing controls and zero
reported reasoning verified. Haiku retained interrupted multiplication as `3 × ?`
after a JSON-format retry (**3,510 ms**); this differs from the fixture's `…` and
is not a dropped term. Qwen dropped it (**1,683 ms**); Luna clarified with state
unchanged (**1,194 ms**). All three passed the targeted edit in **812/1,464/1,079 ms**.
See [shortlist trial](research/notebook-zen-shortlist-trial.md). Seven calls,
no speech; no new default, placeholder policy or full-browser comparison approved.
Cumulative **63 editor calls, 5 Tutor calls, at most 865.280 speech seconds**.

Earlier follow-up: owner approved a **trial-only explicit DeepSeek reasoning-off
request**, because installed Pi maps this Zen model's off selection to low.
Both calls sent `thinking: disabled`, returned no reasoning content and reported
zero reasoning tokens. Response/editor times **933/895 ms**: the unfinished
expression asked a clarification with state unchanged; the targeted edit passed.
The former is not a completed edit and cannot be treated as a faster correctness
pass. See [off diagnostic](research/notebook-deepseek-off-trial.md). No production
adapter/settings change. **2/4 calls**, no retries/speech/Tutor calls; cumulative
**56 editor calls, 5 Tutor calls, at most 865.280 speech seconds**.

The requested [paid Zen catalog research](research/notebook-zen-speed-catalog.md)
covered the 80 live public entries and installed support. Next untested priorities:
**Haiku 5.5/off → Qwen3.8 Flash/off → GPT-6 Luna/off**. These are research priorities,
not measured speed rankings; exact-Zen short-edit benchmarks were not established
by that research. They were subsequently tested under the separate authorization
recorded above.

The preceding trial was a **three-model low-reasoning Zen comparison** (12-call
cap, no speech): Gemini 3.5 Flash-Lite, DeepSeek V4.1 Flash, GLM-5.3-Flash. Six
cases used **seven calls**, including Gemini's application retry. DeepSeek alone
passed both preservation cases, at **2,893/1,591 ms editor wall time** (unfinished
expression / targeted edit). Gemini low (**3,885/687 ms**) and GLM low
(**2,023/1,015 ms**) dropped the unfinished multiplication term but preserved the
targeted-edit fixture correctly. Actual low settings and HTTP counts verified;
no hidden transport retries. See [comparison](research/notebook-zen-low-comparison.md).
These are editor-only samples, not full-path timings or default-model acceptance.
Saved settings retained. Cumulative **54 editor calls, 5 Tutor calls, at most
865.280 speech seconds** at that stage; browser measurement was subsequently
approved and completed as recorded above.

Before that comparison, the owner approved a Zen-credit trial of **Gemini 3.5 Flash-Lite /
minimal**, with correctness checked before browser timing. Authentication and
the existing adapter worked, but the first unfinished-working case failed:
the model dropped `+ 3 × …`. Its initial response also tried to replace a line
in an empty Notebook; the existing one-retry loop corrected insertion only.
Two calls at **1,146/1,178 ms**, **2,327 ms** editor wall time, no speech/browser
trial. This is not visible-latency evidence or an accepted model setting.
See [Zen trial](research/notebook-zen-flash-lite-trial.md). Usage **2/8 editor
calls, 0/80 speech seconds**, zero Tutor calls; cumulative **47 editor calls,
5 Tutor calls, at most 865.280 speech seconds**. Saved settings retained.

The owner's requested primary-source investigation is recorded in
[fast Notebook editor models](research/notebook-editor-fast-models.md).
The suggested first external candidate is **Cerebras Qwen 3.8 27B / off**,
followed by **Gemini 3.5 Flash-Lite / minimal** and **DeepSeek Flash / off**.
Groq offers a same-Qwen/different-host comparison. All candidate catalog IDs
already ship in Pi 1.5.0; account access, credentials and live performance are
not verified. Provider token-throughput claims are not complete-edit timings.
No additional calls or configuration changes were made for this research.
Native structured JSON support is not automatically used by the current
prompt-only editor and would need a separate contract/transport assessment.

### Luna prompt correction experiment

The owner reported slower spoken Apply than the accepted prototype. Saved owner
trial operations 1 and 7 in `chat_mvzugs31_f0e10e6d` each required a format retry:
Luna/medium returned top-level `action: insert` instead of `action: edit`.
Offline replay reproduced both retries and their saved results. The owner approved
a complete edit-response example and explicit action/op distinction in the editor
prompt, retaining Luna/medium, strict validation and the existing retry limit.

Two isolated real-provider replays through the preview server used **3 editor
calls**, no Tutor calls and no speech. The server was restarted with the updated
prompt; its generated server chunks contain the new example.

- `chat_mvzvf87s_d77d2d96` (original operation 1): the same malformed top-level
  action recurred. Two calls totaled **12,838 ms** versus **11,107 ms** originally;
  request-to-observed-settlement was **15,298 ms**. The retry applied the edit.
- `chat_mvzvfk3e_b260a130` (original operation 7): one format-valid clarification
  response in **6,469 ms**, asking what follows “plus three times”. No edit was
  applied. Request-to-observed-settlement was **9,166 ms**. The harness assertion
  expecting an applied edit failed; saved evidence remains intact, with no rerun.

**The prompt correction has not reliably eliminated retries or demonstrated an
equivalent-result speedup.** These are typed replays of previously recognized
speech, not microphone/command-recognition timing measurements. All 8 existing
editor regression tests passed. A deterministic mocked response cannot establish
live prompt compliance; the live failure is retained rather than treated as a
passing regression. Evidence: external `check-28-prompt-live.{mts,json}` and
`check-28-prompt-tests.log` under `/tmp/opencode/notebook-integration/`.

The current app catalog for the saved ChatGPT connection lists GPT-6-Luna and
GPT-5.6-Terra, but not GPT-6.1-Terra. No model or reasoning setting was changed.
Agent verification allowance now totals **29/30 editor calls**, **5/10 Tutor
calls**, and at most **573.800/900 speech seconds**; owner-directed interactive
usage is separate. One editor call remains, insufficient to reserve a full
two-attempt editor run. Further model/prompt changes require an owner decision.

## #28 — settled handoffs and combined acceptance (2026-11-02)

Software implementation and automated acceptance are complete. **Physical iPhone,
installed Home Screen behavior and owner-learning acceptance remain open**;
#28 and parent #18 must remain open pending those checks.

### Delivered policy

- Each recording has one destination. Switching finalizes it, interprets its
  final commands in that destination, waits for requested work, then switches.
- One Apply at a time. Busy spoken Apply is consumed with the approved retry
  notice; later instructions remain in the draft. Undo and Start fresh also wait
  for explicit use after the edit finishes. Legacy accepted queues still recover.
- Return inserts completed immutable working. Interruption, clarification and
  failed Apply requests retain content for review and do not complete the return.
- Send is never queued. Its content stays fixed through acceptance/failure;
  receipt acceptance unlocks without waiting for Tutor's response stream.
  Keyboard-triggered recording cannot bypass that lock.
- Native ordinary Send, steering, written answers, reading thoughts, practice
  and drills keep their own actions. Notebook preparation supplies content only.
- Focus is restored after the rendered handoff lock is removed. Native history
  and multiline scrolling remain available while focused mobile outer containers
  stay stationary.

The superseded overlap implementation remains at local ref
`prototype/notebook-overlap-experiment` (`3d82ff4`), and the accepted prototype at
`prototype/math-notebook-live-apply-v1` (`8ee472b`). Neither is merged as the
settled-handoff implementation.

### Verification

- **2,662 tests / 499 suites passed**, plus typecheck, lint and production build.
  Coverage includes actual Chat/native parser/persistence paths, exact retries,
  interrupted capture, late-command absorption, legacy paused queues, disposal,
  Strict Mode, shortcut lock bypass and post-lock focus restoration.
- Independent spec and standards reviews found four concrete issues: legacy
  correction gating, failed-request handoffs, Strict Mode subscriptions and
  recording during Send. Each was reproduced and fixed with regressions; targeted
  re-review reported no remaining concrete findings. Final browser emulation
  subsequently exposed and verified the post-lock focus fix.
- App-written golden fixture `chat_mvzsbob5_3a6d3a3b.json` captures fixed-destination
  speech, saved drafts, Undo and immutable submitted working. Scripted providers,
  zero live calls; provenance/hash are in the fixture README.
- Actual HTTPS Chromium checks passed both interrupted and successful returns,
  earlier-prose focus, no implicit Send, restored drafts and preview assets.
- Real Deepgram + subscription editor/Tutor flows completed in all five contexts:

  | Context | Isolated chat | Editor calls | Tutor calls |
  | --- | --- | ---: | ---: |
  | Ordinary | `chat_mvzjfqll_da20ba0f` | 2 | 2 |
  | Written answer | `chat_mvzjfqln_d5e8ca63` | 2 | 0 |
  | Reading thoughts + answer | `chat_mvzjfqln_4e92c542` | 3 | 0 |
  | Practice | `chat_mvzjfqlo_22cf7205` | 2 | 1 |
  | Drill | `chat_mvzjfqlo_18080d28` | 2 | 1 |

  Each flow used separate recordings, spoken and clicked Apply, two completed
  snapshots interleaved with explanation, retained later instructions, explicit
  native submission and reload. Question flows left a separate native question
  pending, so no Tutor generation was due. Synthetic audio is real-provider
  integration evidence, not human microphone or learning acceptance. Recognition
  errors were preserved; one genuine clarification required an explicit typed
  correction. No keyword tuning or speech-provider changes were made.
- Total allowance used across integration: **26/30 editor calls, 5/10 Tutor
  calls, at most 573.800/900 speech seconds**. The written-answer run lost its
  speech counter on reload and is conservatively charged its entire 300-second
  command bound. Remaining: 4 editor calls, 5 Tutor calls, at least 326.200 seconds.
- At 390×844, HTTPS phone emulation passed 50/50 panes; simulated keyboard focus
  gave the active pane two-thirds. Both panes passed history top/bottom/interior,
  multiline top/bottom/interior, header/backdrop containment, pinch allowance,
  stationary page, blur unlock and desktop unlock. Desktop measured 864/576
  columns (60/40). This is Chromium touch emulation, not physical iOS evidence.

Detailed logs and browser harnesses are retained in
`/tmp/opencode/notebook-integration/`: `check-28-settled-{all,types,lint,build}.log`,
`check-28-settled-browser.json`, `check-28-settled-phone.json`,
`check-28-settled-live-*.json`, ordinary/reading resume evidence, and
`live-budget.md`. Harness-only interruptions (selectors, response shape/status,
hydration waits) resumed saved content rather than repeating accepted live work.

### Owner acceptance preview

Stable slot 1: **https://thinkpad.tailfd9bf6.ts.net:8444/** (localhost 3000).
Dedicated isolated preview data; slot 2 remains another session's app.
Page, manifest, Apple icon and manifest icon returned 200 over HTTPS.
**Reload preview** uses ordinary reload and preserved saved drafts; it ends any
active recording, whose known content is restored for review. No offline cache.

One-time installation: **Safari → Share → Add to Home Screen → Open as Web App
→ Add**, then launch that icon. Tailnet connection and an awake host are required.
Standalone removes browser chrome; keyboard accessory chrome may remain.

Owner still needs to check real keyboard opening/closing, gestures at history
and multiline edges, header/backdrop containment, pinch zoom, input handoffs and
Home Screen reload, then use Notebook for an actual learning exercise. Keep
app-wide mobile sidebar limitations separate; the sidebar was closed for pane
checks, not redesigned. These are acceptance gates, not claims already passed.

## #20 — saved typed working

Merged at `334fd4b`, including implementation `f7596bb` and recovery fix `fa5e592`.

Delivered one session-owned notebook with on-demand responsive layout, numbered
rendered working/source fallback, typed Apply, clarification, direct Undo,
visibility/draft restoration, durable accepted edits, restart recovery, and
separate reported editor usage. Notebook operations do not submit to Tutor.

Integration hooks are an optional chat field/scoped storage operation, atomic
replacement at the existing chat-write boundary, one change notification, a thin
route, startup/deletion hooks, and session UI/keyboard/focus integration. Dedicated
notebook files own the state, execution and presentation. Shared editor contracts
are browser-safe; the accepted prompt/output behavior remains unchanged.

### Verification — 2026-11-01

- Worker: 200 relevant regression tests passed; 66 lifecycle/recovery checks and
  22 final focused checks passed after fixes. Typecheck and lint passed.
- Merge: 13 notebook flow/UI tests, typecheck and whitespace checks passed.
- Actual app, separate test data: **four ChatGPT Luna-medium editor calls**,
  no retries, no Tutor calls/messages. Creation preserved an intentionally wrong
  equality and unfinished expression; ambiguity produced a question; the answer
  changed only the targeted line; another unfinished expression used source fallback.
- The fourth reply added one trailing space to newly requested literal source.
  The strict-source assertion failed. Review accepted the same unfinished source
  under #19's whitespace-equivalence criterion; the application did not trim it.
  This is not claimed as an exact literal match.
- Reported usage: 3,510 input and 306 output tokens, including 102 reasoning
  tokens; cache read/write zero. Subscription API-dollar cost is unpriced.
- Direct Undo, unsent draft reload, working restoration and visible controls
  passed in real Chromium. No further model calls were made for these checks.
- Desktop 60/40 and phone 50/50 geometry passed with the existing sidebar closed.
  Focus containment activated/released on phone focus/blur and desktop transition;
  the instruction field stayed inside the emulated viewport. No browser errors.
- The browser's default/open 288px inline sidebar leaves too little space at
  390px. It overflows even without Notebook (425px versus 566px with the added
  control). This existing app-wide mobile limitation is recorded, not fixed by
  hiding controls or changing sidebar policy. Phone notebook checks use the
  existing **Close sidebar** control.
- Localhost and the intended private HTTPS endpoint returned the app successfully.
  Preview installation assets and final owner handoff belong to #28.

Browser checks do not establish physical iOS keyboard/gesture acceptance or
learning usefulness. Those remain #28 gates, along with the final integrated
build/review. Detailed local browser evidence and scripts are retained under
`/tmp/opencode/notebook-integration/check-20*`; the reproducible automated tests
are in `tests/notebook-*` and `tests/session-input-viewport.test.tsx`.

## #21 — Start fresh and history

Implemented on `notebook/21-history`; live/model acceptance is pending parent
verification. Start fresh uses #20's existing durable pump, waits visibly for
earlier work, and pauses behind failures/clarifications until corrected. It
archives settled nonempty source once and opens a new empty context. Notebook
drafts and other aggregate fields are retained. Older records without history
remain readable.

History shows numbered, timestamped read-only entries with the existing exact
source fallback. The existing editor input receives actual entries and matching
numbered labels; the editor prompt/output contract is unchanged. Reuse edits
current working through the existing validation/undo behavior. Cursor selection
is scoped to its working context.

### Worker verification — 2026-11-01

- 28 focused history/UI/flow/editor/viewport checks passed, including six new
  mounted-control and real-session-storage history tests with scripted providers.
- Covered archive/browse/reuse/undo/reopen, duplicate historical line numbers,
  whole-line and individual-equation scripted outputs, invalid edits, held work,
  failed/clarification barriers, lost acknowledgments, legacy records, and cursor
  isolation. Scripted responses establish app behavior, not real-model accuracy.
- Typecheck, lint and whitespace checks passed. No live/provider/browser calls
  or preview processes were started by this worker.
- Pending: chosen-model history-reference evaluation, actual desktop/mobile
  browser review, physical iOS/learning acceptance, and combined #22 draft/snapshot
  retention verification once that slice is integrated.

Core impact is additive notebook contracts plus changes inside the existing
notebook service/client/panel. No additional general app hooks, persistence
system, executor or dependencies. Plugin migration would carry these notebook
extensions with #20's existing boundary.

## #21 — history and Start fresh

Merged at `fc4f53a` (implementation `3bb79cc`). Immutable numbered/time history
and a waiting Start fresh barrier extend the existing notebook pump. Earlier
failures/clarifications pause the barrier; legacy records without history load.

- Worker: 28 focused tests; merger: 19 focused tests, typecheck, lint and diff checks passed.
- Combined actual-app #21/#22 flow used three Luna-medium editor calls and one
  Tutor call in separate test data. Start fresh archived the settled two-line
  working, cleared current working/Undo, and preserved both owned drafts and two
  immutable snapshots. Reload retained all of these; history was browsable.
- The real editor then copied only the requested pressure equation from Entry 1
  into blank working, exactly preserving its source. History and earlier snapshots
  stayed unchanged. No Tutor message existed until explicit Send.
- Scripted storage/UI coverage includes waiting/clarification barriers, duplicate
  command IDs, failed edits, history disambiguation, reuse/Undo/reopen and legacy
  records. Physical-device/learning acceptance remains #28.

## #22 — ordinary explanations and snapshots

Merged at `d23020b`. Worker: 256 targeted tests, typecheck/lint/diff checks passed;
merger: 46 focused tests, typecheck/diff checks passed.

Actual-app checks passed explanation → snapshot → continuation ordering, editing
earlier prose, immutable older working after later edits, separate unsent drafts,
Start fresh/reload retention, history reuse and explicit submission. The saved
native user message contains the full ordered explanation, three working snapshots
and approved assistance wording, excluding editor instructions. The live Tutor
acknowledged receiving these as assisted steps.

The actual-app check exposed a hidden learner-message defect: Chat's generic
data-marker branch intercepted the new explanation part before its learner
renderer. Fix `a186551`, merged at `3323fa7`, narrows that one predicate. The new
complete-Chat regression failed before the fix and passed after it (worker: 57
targeted tests, typecheck/lint; merger: 2 actual-Chat tests, typecheck/diff checks).
The exact no-provider-call browser replay now passes: one learner explanation,
all three immutable working snapshots and ordered prose visible after reopen.
Saved content had remained intact throughout. Evidence:
`/tmp/opencode/notebook-integration/check-21-22.json`, `check-22-reopen.mjs` and
`22-reopen-diagnostic.json`. The live scenario was not repeated to fix rendering.

Total authorized live allowance consumed so far: seven editor calls, one Tutor
call, zero speech minutes. No physical-device acceptance is claimed.

## Clicked Apply mechanism — owner follow-up

The owner selected continuous-stream finalized-prefix tracking: record the click
on the capture timeline, wait until finalized audio coverage passes that cutoff,
then apply complete words whose start precedes it. Post-click words remain in the
next instruction, even in the same returned result. This does not require later
speech or recording to finish. Verify clock mapping, whole crossing words,
delayed/missing coverage, repeated cuts, silence and formatting. Provider timestamps
are estimates; a timer is never proof that missing transcription is complete.
Keep ordering and notebook behavior in the notebook module behind the existing
speech hook. A different completion mechanism requires evidence and owner review.

## Remaining graph

#21 (history) and #22 (ordinary snapshots) follow #20 independently. Then
#22 → #23 → #24; #21 + #24 → #25; #25 → #26 and #27; #26 + #27 → #28.
Each later slice must verify its behavior before combined acceptance.

## #22 — ordinary explanations and working snapshots

Implemented on `notebook/22-snapshots`, including integration of #21 history.
The ordinary composer now keeps a session-owned ordered draft once Notebook is
used. Settled return captures immutable working at the continuation; earlier
prose is editable above the continuing composer, with no reorder/remove controls.
Per-change revisioned saves and local write-ahead recovery preserve unfinished
work. Older conflicting local copies remain visible for review.

Explicit ordinary send and live steer retain native user roles and carry the
ordered explanation through validation, durable messages, rendering, model
context, compaction summary input and Markdown. Assisted working uses the approved
label and evidence distinction. Notebook commands stay outside learner input.
Notebook submissions atomically consume only their accepted draft revision;
logical receipts and a parked-steer outbox reconcile against saved native ids.
Text-only sessions retain their existing send/steer path.

Integration is additive: optional input/message fields, one scoped atomic store
operation, ordinary-input validation/commit hooks, and notebook-only live-steer
acceptance/restoration hooks. Notebook modules own draft recovery, snapshots,
serialization and receipts. No provider transport, tool authority, general job
queue, sidebar policy or preview-server change was needed.

### Verification — 2026-11-01

- **256 targeted tests passed**, including #20/#21 regressions, real filesystem
  storage and session handlers with scripted external model context, compaction,
  mounted Apply/return/review/Send controls, ordinary/live-steer delivery and its
  settle race, snapshot-only content, duplicate requests, lost acknowledgments,
  conflicting local recovery, atomic write failure, and canonical UI deduplication.
- Typecheck, lint and whitespace checks passed.
- No paid/live provider calls or preview changes were made for this slice.
- Pending-cutoff/multiple-edit return remains #25: this slice captures settled
  working and reports a pending edit rather than claiming its cutoff is complete.
- Physical iOS keyboard/gesture checks, browser layout and actual-learning
  acceptance remain pending parent/#28 review. Phone checks use the existing
  closed-sidebar setup. Full integration build/review remains a parent gate.

### #22 reopen-rendering follow-up

Parent live acceptance found that submitted explanations disappeared from Chat
on reopen despite intact native messages and successful Tutor delivery. The
generic data-only marker branch intercepted `data-learner-explanation` and
returned nothing before the learner's **You** row could render it. The correction
excludes that part from marker-card routing; storage, projection and deduplication
are unchanged.

The exact no-call browser reproduction reported zero snapshots instead of three.
A new regression renders the complete `Chat` component from a JSON-round-tripped
native record and reproduced that failure, then passed with all three snapshots
in one learner row. It also covers working-only input alongside plain text and an
existing practice marker. Read-only replay of the parent's actual saved session
through the corrected full renderer likewise reports three snapshots. **57
targeted tests, typecheck, lint and whitespace checks passed.** The parent must
merge and rerun its exact browser check against the live endpoint before #22
display acceptance; no new model calls or preview-server changes were made.
