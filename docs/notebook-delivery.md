# Conversational notebook — integration delivery

Spec: [#18](https://github.com/bearthababe/learnharness/issues/18).
Branch: `integration/conversational-notebook`, based on `f65d108` (#19).
The owner requested the complete spec through `/implement-spec`, subject to
keeping notebook behavior isolated and app integration as non-intrusive as possible.

The latest owner-approved policy is in `docs/notebook-correction-plan.md`.
Stop never applies or sends; #27 was closed as not planned. The #28 settled
handoffs below supersede the earlier overlapping-action delivery notes.
Current mobile limitations do not authorize redesigning the app-wide sidebar.

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
