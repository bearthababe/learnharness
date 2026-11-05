# iPad notebook integration — #4

Integration branch: `integration/handwriting-45`.
Task graph: #45 (complete) → #46 → #47 → #48.
Broader #4 and #44 have scope beyond this integration.

## Approved baseline

- #45 source: `329677bdcbfd218a0013d745ff21e273d628f567`.
- #45 owner acceptance: `8148bb93fc71c4621b0bcbb5b32629ba7ea97040`.
- Both commits passed local integration ancestry checks on this branch.
- Prior evidence: [#45 delivery](handwriting-notebook-delivery.md) and
  `/tmp/opencode/issue45-https-verification.json`.

## #46 implementation approval

The owner approved the concrete #46 implementation plan in this session after
reviewing its behavior, history/recovery boundaries, native IndexedDB and
25 MiB each image/source limits. Plan source at approval:
`/tmp/opencode/issue4-submission-plan-proposal.md` (final 290-line proposal).
Approved content is promoted to [the submission plan](handwriting-submission-plan.md).
Owner decisions are also retained at
`/home/bjorn/.cache/opencode/issue4/owner-decisions.md`.

Selected contracts include same-page unsent snapshot replacement, immutable sent
versions, persistent Undo/Redo, exact capture retries, explanation durability at
Attach, ordinary editing after definite rejection and acceptance reconciliation
for uncertain delivery. Unified Open/undoable Restore/explicit Duplicate are
carried into #47.

## #47 implementation approval

The owner also approved `/tmp/opencode/issue4-reopening-plan-proposal.md` for
implementation after #46 lands. Promote it to
`docs/handwriting-pages-plan.md` with that implementation. It adds Pages,
the unified Open/four-choice flow, undoable Restore, explicit Duplicate and
diagram import. Page switching commits durable device state first, then syncs
in the background, preserving the accepted layout and shared history contract.

Approved proposal SHA-256 values:

- #46: `e26754e627d66028d87cc6601114cb6884f8e271204843aeb67cdb89b0eb1233`.
- #47: `7f1c846802e295d53d1007ef9c44ca4c0221f53a9cc52278fe82e3d812cc2c65`.

## Verification and delivery

### #46 implementation delivery — 2026-11-04

Branch: `implement/handwriting-46`.

- `51f82e6`: persistent graph/Redo, immutable source+PNG bundles and atomic
  same-page pending replacement, native IndexedDB capture/draft/submission
  recovery, speech-first Attach and existing input-adapter integration.
- `c71291f`: receipt wire canonicalization, definite pre-dispatch failure
  recovery, speech target/cancellation guards, large-background validation and
  expanded browser boundaries.
- `68f81c4`: merged integration tip `b19eea2`; ancestry check passed. The #47
  approval and future preview authorization below are preserved.

All log/artifact paths below are relative to
`/home/bjorn/.cache/opencode/issue4/`. This document is the authoritative receipt.

| Check | Result / evidence |
|---|---|
| Focused actual-store/server/controller/session/speech regressions | **176 passed**, `46-focused-final.log`; command: `NODE_ENV=test node --import tsx --test tests/handwriting*.test.ts tests/shared-writing.test.ts tests/session-core.test.ts tests/dictation-flow.test.tsx tests/chat-flow.test.ts` |
| Chromium handwriting | **Passed**, `46-browser-handwriting-final.log`; `LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4/ LH_HANDWRITING_TEST_PORT=3118 node scripts/smoke-handwriting.mjs`; fixture `handwriting-browser-J3OIxK` |
| Chromium mobile/adapters/recovery | **Passed**, `46-browser-mobile-final.log`; `LH_MOBILE_TEST_DIR=/home/bjorn/.cache/opencode/issue4/mobile-input-browser-46e LH_MOBILE_TEST_PORT=3117 node scripts/smoke-mobile-inputs.mjs` |
| Typecheck / lint | **Passed** on merged source, `46-typecheck-final.log`, `46-lint-final.log` (`npm run typecheck`, `npm run lint`) |
| Diff / integration ancestry | **Passed**, `git diff --check`; `git merge-base --is-ancestor integration/handwriting-45 HEAD` |
| Production build | **Passed** on merged source, including source GET route; `46-production-build-final.log`, disposable `build-46-68f81c4`. Same environment-only Turbopack root workaround as #45 for external dependency symlinks; four tracing warnings in existing modules, no build errors. |

Browser coverage includes real Redo/reload; independent background decode,
erasable foreground and offscreen full-page export; exact capture source/Retry;
speech-finalized Attach with no tutor POST; failed-capture reload while notebook
is closed; ordinary rejected-answer editing/replacement/reload/Submit; both
unknown-A/Attach-B orderings preserving B and newer text; conversation,
free-text, selection/Other, practice/drill image-bearing inputs; native IndexedDB
atomic abort, newer-revision protection, monotone receipts, deletion tombstones
and retained corrupt/future rows. Phone gesture/focus tests remain emulation.
The last two pure/controller corrections (large-base64 and pre-dispatch failure)
were verified by focused red/green tests after the browser snapshots were copied.

#### Failures, corrections and test discipline

- `46-canonical-{red,green}.log`: reproduced accepted question answers remaining
  uncertain because `undefined` optional fields disappeared on the JSON wire;
  receipt canonicalization now hashes the same wire value on both sides.
- `46-presend-{red,green}.log`: a failed `sending` transaction dispatched nothing
  but locked the ordinary editor as uncertain. Definitely-unsent/prepared
  attempts now retire back to normal editing; later retry uncertainty is kept.
- `46-background-size-{red,green}.log`: the grouped base64 regexp overflowed
  V8's stack on a 4 MiB field. Linear character/length validation accepts large
  fields; import/upload retain independent canonical-byte/hash/PNG checks.
- Earlier red/green history/recovery/attachment/transfer logs are retained in
  this cache. The first history red run was a syntax error, not a behavioral
  red. Some UI/integration coverage was added after implementation; strict
  red-first coverage is not claimed for every change.
- One mobile rerun (`mobile-input-browser-46c`) refused Send after recovery
  failed to open; no unsafe POST occurred. Its exact native error was not
  captured, so no root cause is asserted. Subsequent runs added an explicit
  native-open assertion and cache-owned browser profiles and passed.
- Putting a browser profile inside the disposable source caused CSS scanning
  to read Chromium's `SingletonSocket` and panic. Profiles now live beside the
  apps, outside source scanning. Failed-run artifacts are retained.

#### Standards review

Self-review used `AGENTS.md`, `docs/architecture.md`, the approved plan's
explicit browser-recovery seams and surrounding conventions. No outstanding
documented-standard breach was identified; lint enforces import boundaries.
The implementation session's delegated review was blocked by `Subagent depth
limit reached (1)`; the parent subsequently completed independent Standards
review of `12f444a`. Findings and correction status are recorded below.

#### Spec review

Self-review against the complete approved plan found and corrected the three
boundary defects above and missing speech target/review-freezing guards.
No additional product choices were introduced. #47 retains Pages/Open/Restore/
Duplicate/import UI ownership, using the supplied graph/source contracts.
The parent subsequently completed independent Spec review of `12f444a`.
Its findings and correction status are recorded below; independent correction
re-review remains parent-owned.

Existing partial server-deletion cleanup limitations are retained as approved;
normal bundle deletion and late-upload refusal pass. The full repository suite
was not rerun: #45's documented baseline failures are not claimed fixed. Automated
checks used isolated data and deterministic providers/speech; no live spending.

### Independent #46 review corrections — 2026-11-05

Parent-owned reviews of `12f444a`:
`46-review-spec.md` (three findings) and `46-review-standards.md` (one documented
violation, two heuristics), under the cache root above. Full evidence was read.

**Superseding owner approval, relayed by parent:** normal Send/Submit is the only
submission action, including retry after uncertainty. Automatically reconcile
with status; Send reconciles first and replays only the original immutable
identity/payload when eligible. A verified receipt becomes sent without deleting
later edits. Definite failure restores ordinary pre-send editing. No separate
Check delivery, Retry saved answer, recovery disclosure or speculative menu.
Original attempted data remains available in normal review. This amendment is
also recorded in [the approved plan](handwriting-submission-plan.md).

| Independent finding | Implementation correction / evidence |
|---|---|
| Spec P1: late speech retargeted before Attach's post-finish guard | Speech finalization pins the actual receiver before requesting finals. A replaced/unmounted field retains late finals in its original target-bound durable draft; stale Attach aborts. The regression uses actual speech hooks and the browser test replaces the question through the real canonical parallel-question path. |
| Spec P2: another input consumes image/resolves target, leaving uncertainty stuck | Pure canonical-obsolescence evidence handles image consumption and resolved question/problem targets, after exact receipt matching. Missing pending data, missing targets and failed reads alone remain insufficient. Newer drafts stay intact. |
| Spec P2: original images represented only by IDs | Normal unconfirmed-answer review reuses actual immutable image thumbnails and the existing viewer, independently of current pending B. Browser assertions cover retained A while canonical reads fail and B is pending. |
| Standards S1: manual recovery controls unreachable under the Tab trap | Submission Check/Retry/disclosures removed per owner approval. App-controlled Tab + ordinary Enter/Send now reconcile/retry the original payload and retain newer edits. Residual upload/image-entry reachability is documented below for parent/reviewer scope assessment; no keyboard design change is authorized. |
| Standards H1: English notice substrings determine controls | Typed attachment notice kinds expose explicit retry/refresh capabilities; one mapping owns wording. Source/image size errors and changed-review failures use typed errors, not English matching. |
| Standards H2: duplicated full-page PNG validation | One browser-safe core byte predicate is used by import and multipart upload; canonical base64, hash, transport limits and error responses stay at their boundaries. |

Historical residual keyboard evidence at correction commit `17c70d9` (source
reachability, not a claim of a new keyboard-browser reproduction; subsequently
resolved/scoped by the approval and independent findings below):

- **Upload Retry:** `components/handwriting/submission.tsx:105` and
  `components/handwriting/notebook.tsx:263`. Reachable scenario: Attach persists
  its immutable capture, upload fails, and the user reloads with the notebook
  closed. The restored capture displays Retry; normal Send does not publish
  that failed capture. `attachment.ts:48–58` restores without uploading, and
  `:61–63` prevents a replacement Attach while the saved capture exists. These
  upload controls were introduced by #46 relative to baseline `8148bb9`.
- **Refresh review:** the same two locations display this action after an
  acknowledged upload whose pending-review read fails (`attachment.ts:140–143`),
  or a failed pre-Attach review (`notebook.tsx:138`). Automatic writing refreshes
  already exist on focus, visibility and server events
  (`components/shared-writing.tsx:34–46`), so lack of direct button access does
  not establish a permanent recovery dead end for this action.
- **Original image enlargement:** `submission.tsx:107` reuses
  `components/shared-writing.tsx:50–58`, whose thumbnail's entry is `onClick` at
  line 53. Scenario: A is uncertain, revised B is pending, canonical reads fail,
  and the user wants to enlarge A. A's thumbnail is visible independently of B;
  entering the viewer still needs a pointer. This click-only viewer entry
  already existed in baseline `8148bb9`; original-attempt placement is new.
- **Common reachability mechanism:** `components/keyboard-shortcuts.tsx:66–76`
  suppresses native Tab. `components/chat.tsx:703–710` cycles only textareas;
  `src/core/keyboard.ts:22–39,57–88` has no upload-retry/review/image-entry action.
  Parent requested independent assessment of changed-scope versus inherited
  behavior before any owner question. Normal-Send recovery remains approved.

Red/green evidence: `46-review-fixes-red.log` reproduces speech retargeting,
normal-Send retry rejection and missing canonical-obsolescence handling;
`46-review-fixes-green-progress.log` passes those boundaries. Added coverage also
proves Send discovering an already-accepted receipt dispatches nothing and
retains newer edits. Browser corrections use actual target replacement and the
app keyboard path, native IndexedDB, actual HTTP/store handlers, scripted speech
and deterministic providers.

Verification of first correction `17c70d9` (predates the final delta below):

| Check | Result / cache-root evidence |
|---|---|
| Focused actual-hook/controller/store/server tests | **182 passed, 0 failed**, `46-review-focused-final.log` |
| Typecheck, lint, diff whitespace | Passed; `46-review-typecheck-final.log`, `46-review-lint-final.log`; `git diff --check` |
| Disposable production build | Passed; `46-review-build-final.log`. Existing dynamic tracing warnings; environment-only `turbopack.root` in the disposable copy. |
| First correction mobile browser run | Passed; `46-review-browser-mobile-1.log` |
| Final mobile browser rerun | **Passed**, `46-review-browser-mobile-3.log`, including original A review/viewer while B is pending and canonical reads fail. Previous run timed out before transfer scenarios: 30-second ready wait versus 31-second cold compilation; retained in `46-review-browser-mobile-final.log`, `mobile-input-browser-46-review2/server.log`. |
| Handwriting browser diagnostics | Initial run failed after nine scenarios: captured source contained two pen strokes, with a correct offscreen background. Adding selected-tool assertion exposed an unactivated Eraser click (`46-review-browser-handwriting-2.log`). Pointer tracing caught a nominal drawing gesture landing on Page options during layout movement (`46-eraser-event-diagnostic.log`); a subsequent run failed in sidebar traversal after viewport change (`46-review-browser-handwriting-3.log`). Smoke-test locators now wait for stable canvas/button geometry and enabled controls at these boundaries, and source assertions require actual pen + eraser strokes. Original failed artifacts are retained. |

### Final correction delta after independent re-review of `17c70d9`

Read full parent-owned `46-rereview-standards.md`, `46-rereview-spec.md` and
`46-rereview-boundaries.log` under the cache root. Independent Spec review closed
the original three findings, but reproduced the two caller defects below.
Standards closed H1/H2 and submission recovery's S1 portion, while identifying
failed capture-upload Retry as the remaining changed-scope S1 blocker. Refresh
already has ordinary/automatic paths; shared viewer keyboard entry predates
baseline and is not a blocker for this correction.

**Additional owner approval, 2026-11-05, relayed by parent:** retry recoverable
failed Attach uploads automatically on session reopen/network reconnection;
ordinary Attach immediately retries the saved snapshot. Preserve exact original
identity, PNG/source and expected page revision, plus newer working/drafts. Show
the recovered snapshot for review, never automatically Send. No separate upload
Retry action, new keyboard binding, Tab change or menu. Preserve nonretryable
size/conflict/corruption safeguards and one in-flight transfer per page. The
approved plan records this amendment without changing its original approval hash.

| Re-review finding | Final implementation / regression |
|---|---|
| S1 remaining: failed capture needs inaccessible upload Retry | Session reopen and online events recover saved captures; ordinary Attach routes to their exact transfer before preparing new working. Separate upload Retry buttons removed. Controller coverage checks coalesced concurrent triggers, original identity/bytes/source, newer drafts, and refusal to upload oversized/conflicted/corrupt records. Real-browser coverage exercises Attach, reopen and online with native IDB and actual HTTP/store adapters, checks PNG SHA-256/source/identity and newer working, and proves zero tutor POSTs. |
| R1 P1: automatic acceptance during speech finalization makes Send fall through to fresh text | Capture an identity-bound recovery action before the first await in composer, question and practice callers. The action terminates if that original identity has retired; it cannot create a new input. The regression executes Chat's exact source-extracted Send closures with the actual controller and accepts A during finalization, then asserts no POST and preserved newer text. Browser regression drives the same speech/acceptance race. |
| R2 P2: empty newer choice selection disables valid original replay | Existing attempt permits ordinary button/keyboard recovery; the captured recovery action runs before new-answer validation. Empty NEW choices remain invalid. Actual QuestionDock rendering checks both gates; browser Enter replay checks exact original input and preservation of newer empty selections in native IDB. |

Red evidence: `46-attach-auto-red.log` (old reopen behavior) and
`46-rereview-fixes-red.log` (unexpected newer-text POST and disabled ordinary
choice Submit). Green: `46-rereview-fixes-green.log` and final focused suite.
Production changes after `17c70d9` require parent incremental re-review; this
receipt does not grant independent approval.

| Final-code check | Result / cache-root evidence |
|---|---|
| Focused suites | **186 passed, 0 failed**, `46-final-correction-focused.log` |
| Typecheck and lint | Passed, `46-final-correction-typecheck.log`, `46-final-correction-lint.log` |
| Mobile browser | **Passed**, `46-final-correction-browser-mobile-3.log`; disposable app `mobile-input-browser-46-final6`. Includes all three upload-recovery triggers, original-image review, actual Send/speech/background-acceptance race, ordinary Tab/Enter choice recovery with empty newer selections, target-bound speech and native IDB fault boundaries. |
| Handwriting browser | **Passed**, `46-final-correction-browser-handwriting-2.log`; disposable app `handwriting-browser-Avtd5C`. All drawing/recovery/deletion/export scenarios completed; background export asserts actual pen + eraser source events as well as pixels. |
| Production build | **Passed**, `46-final-correction-build.log`; disposable `build-46-final-correction`, existing dependency symlink and environment-only `turbopack.root`. Four existing dynamic filesystem tracing warnings. |

Retained final-pass diagnostics: `46-final-correction-browser-mobile.log` and
`46-final-correction-browser-mobile-2.log`; the helper now awaits actual pending
image review and settled uncertainty rather than merely the upload response or
early attempt markup. Recording uses the visible Send button; keyboard choice
recovery enters rows through the app's Tab path before Enter. Narrow source-
extracted browser scenarios and logs are `46-send-boundary-browser-focused.log`
and `46-send-boundary-browser-focused-2.log`. These expose invalid harness
activation/precondition assumptions; final full-suite assertions remain intact.

`46-final-correction-browser-handwriting.log` caught a false-positive export
precondition: scrolling the full canvas for hover left test coordinates outside
visible paper and produced no strokes. The test now waits on the visible paper
viewport, draws clear of overlays, and requires both real stroke types.
`46-background-export-focused.log` passes the isolated exact export scenario;
the final full handwriting run also passes it.

All required automated checks have completed. No detached required check is
running. Final production changes after `17c70d9` are upload recovery routing and
the identity-bound Send/Submit caller/controller fixes; other final changes are
regressions, browser synchronization and this approval/evidence record. The
committed integration tip `12f444a` is already an ancestor; merging it reports
already up to date. Parent-owned uncommitted integration diagnostics were not
edited. No live provider/speech calls, public-preview changes, pushes or issue
closure were performed.

One focused run hit filesystem quota (`EDQUOT`) in
old `/tmp/opencode` fixtures (`46-review-focused-edquot.log`); the handwriting
fixtures now accept `LH_HANDWRITING_TEST_ROOT` and run under the cache root.
No source/data deletion or public-preview change was used to bypass that limit.

These are implementer corrections and automated evidence, **not independent
re-review approval**. Parent reviewers retain that gate. Physical iPad acceptance
also remains open.

### Coordinated preview and physical acceptance

The owner subsequently approved replacing the existing #45 handwriting review
in slot 2 (`:8445`) when the integrated build is ready, preserving review data
and the recorded lesson-navigation restoration details. Recheck live slot
ownership, listeners and mappings before the actual handoff.

The owner approved using their existing tutor/dictation configuration for calls
they initiate during the physical iPad trial. Automated checks remain scripted:
no agent-initiated live model/speech calls are authorized. Keep review data and
configuration isolated, and never include credential contents in evidence.

Physical iPad acceptance remains distinct from browser emulation. Keep required
device gates open until owner confirmation. No push or remote merge is claimed.

### Parent coordination: resolved hidden-question wait — 2026-11-05

At 07:39 UTC, explicit-server inspection on `127.0.0.1:4096` found child
`ses_e57783d6fffeVnwk66Xqs146kN` waiting inside its `question` tool since
2026-11-04 22:46:21 UTC. Message `msg_1a8bdb3a4001xPAyw4MajU4vQH` asked
for a recovery-panel keyboard route. The question had not reached the parent
conversation; the worktree was still clean at `12f444a`. This was a pending
decision, not a hung model request. No interrupt or service restart was needed.

The owner superseded the manual panel with automatic recovery and ordinary Send:
definite nonacceptance returns to pre-send editing; uncertain delivery is checked
automatically; Send reconciles and safely retries the original attempt without
duplicate acceptance or accidental submission of newer edits. The decision was
relayed and accepted as the custom answer to pending form
`frm_1a8bdec380016yew53fAHv5yfp`, clearing the wait.

After independent re-review, the owner also approved automatic saved-capture
retry on reopen/reconnection and immediate retry through ordinary Attach,
preserving newer working and stopping at review without automatic Send.
Delivery `a7715563170f2877b336699991472caf091aff2c` includes those corrections;
final independent Standards/Spec re-review is dispatched against that exact
commit. Integration of corrections and those final review outcomes remain pending.

### C1 remount correction after independent final review of `a771556`

Parent reported **R1 PASS, R2 PASS and Standards S1/H1/H2 APPROVED** at
`a7715563170f2877b336699991472caf091aff2c`. The independent Spec report
`46-final-review-spec.md` withheld overall approval for one new P2, **C1**.
Its `46-final-review-remount-boundary.log` reproduces two overlapping uploads
after dispose/reopen, followed by a late failure resurrecting retired A and
blocking newer Attach B. These reports and all logs below are under
`/home/bjorn/.cache/opencode/issue4/`.

The correction implements the already-approved one-flight/retention invariants:

- Transfer ownership is shared across controllers using the same device port,
  session and page. Application remounts share `handwritingTransferDevice`.
  A replacement waits for the original owner's preparation/transport/cleanup,
  then reloads durable state. It only retries a genuinely unresolved capture,
  with its exact identity, source, PNG and revision precondition.
- Native `IndexedTransferDevice.saveCapture` checks the page's terminal receipt
  **inside the write transaction**. The same completed identity or an advanced
  page revision rejects a stale capture write before either capture or draft
  can change. The controller recognizes terminal rejection and reloads recovery
  instead of reporting a new failed capture. Monotone receipts and identity-only
  capture deletion preserve B when A's old success arrives late.
- Disposal retains unresolved work; recovery still stops at review. Newer drafts
  and working remain intact, and no automatic tutor Send is introduced.

**Red/green evidence:** the actual-controller remount test failed before the fix
with `2 !== 1` overlapping POSTs (`46-c1-controller-red.log`), then passed
(`46-c1-controller-green.log`). Native browser/IndexedDB assertions failed before
the fix with `resurrectedCaptures: 1`, `nextCaptureSaved: false` and
`retiredWriteBlocked: false` (`46-c1-native-red.log`). The corrected adapter and
real-controller browser fixture pass (`46-c1-native-green.log`). Native assertions
also cover old failure after a newer identity's terminal receipt, atomic draft
preservation and late old success while B remains saved.

The disposable browser fixture constructs the real old/new attachment controllers
against native IndexedDB, holds the original transport across dispose/reopen,
and uses actual HTTP/store receipts. It checks success, failure before acceptance
and lost accepted ACK: one concurrent request, exact replay when needed, retired
A, revision-2 Attach B, persisted receipts, preserved newer draft/working and no
tutor input. This is controller-lifecycle coverage in a browser, distinct from a
physical iPad navigation acceptance claim.

| C1 final-code check | Completed result / cache-root evidence |
|---|---|
| Focused suites | **187 passed, 0 failed**, `46-c1-focused.log` |
| Typecheck / lint | Passed, `46-c1-typecheck.log`, `46-c1-lint.log` |
| Native-IDB remount and adapter regression | Passed, `46-c1-native-green.log`; fixture `mobile-input-browser-46-c1-green` |
| Full mobile browser suite | Passed including all three remount outcomes, existing R1/R2 and upload-recovery checks; `46-c1-browser-mobile.log`, fixture `mobile-input-browser-46-c1-full` |
| Full handwriting browser suite | Passed, `46-c1-browser-handwriting.log`, fixture `handwriting-browser-bJV9cx` |
| Production build | Passed, `46-c1-build.log`, disposable `build-46-c1`; environment-only `turbopack.root` and four existing dynamic filesystem tracing warnings |
| Integration / whitespace | Committed integration tip `1946bcb7071a4cecaf874de7e6425867cfbfa4f1` merged cleanly; both receipt histories retained; `git diff --check` passed |

No required check remains running. Parent's uncommitted integration review notes
were not edited. This C1 production delta requires **parent-owned independent
incremental re-review of the final delivery hash**; implementer checks do not grant
Spec approval. Earlier approval hashes and physical acceptance gates remain as
recorded. No live provider/speech calls, public-preview changes, pushes or issue
closure occurred during this correction.
