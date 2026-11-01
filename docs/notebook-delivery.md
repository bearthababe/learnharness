# Conversational notebook — integration delivery

Spec: [#18](https://github.com/bearthababe/learnharness/issues/18).
Branch: `integration/conversational-notebook`, based on `f65d108` (#19).
The owner requested the complete spec through `/implement-spec`, subject to
keeping notebook behavior isolated and app integration as non-intrusive as possible.

The latest owner decisions are recorded on #18. In particular, optional Stop
application is **Notebook-only**; Tutor keeps its existing submission actions.
Current mobile limitations do not authorize redesigning the app-wide sidebar.

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
