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
commit. Integration of corrections remains pending.

Final independent review gates for `a771556`:

- **Standards approved:** S1, H1 and H2 closed; no new findings or blockers.
  Report: `/home/bjorn/.cache/opencode/issue4/46-final-review-standards.md`.
- **Spec blocked on C1:** R1 (Send/finalization race) and R2 (empty newer choice
  selections) passed. Reopening during an outstanding capture upload can start
  an overlapping transfer; a late old failure can resurrect a retired capture
  and block newer Attach. No handwriting loss or duplicate tutor input is
  asserted. Report and reproduction:
  `/home/bjorn/.cache/opencode/issue4/46-final-review-spec.md` and
  `/home/bjorn/.cache/opencode/issue4/46-final-review-remount-boundary.log`.
  C1 correction and lifecycle/native-device regression coverage have been
  dispatched to the implementer. Integration remains gated on its delivery and
  independent incremental review.

C1 correction delivered as `d357b54fbaac2798aa046b38fe349cf1e045e2ec`, including
integration documentation commit `1946bcb`. Implementer reports 187 tests,
native-IDB lifecycle regressions, both browser suites, typecheck, lint and build
completed successfully with a clean tree. Independent **Standards PASS** for
this exact hash: S1/H1/H2 remain closed, with no new findings. Report:
`/home/bjorn/.cache/opencode/issue4/46-c1-review-standards.md`.
Independent **Spec BLOCK** at `d357b54`: original C1 overlap/resurrection is
fixed and R1/R2 remain passed, but a precommit remount can read zero captures,
miss A's later durable failure, and become stuck trying to persist newer B.
Original capture and newer drafts remain preserved. Exact controller/native-IDB
reproduction and report:
`/home/bjorn/.cache/opencode/issue4/46-c1-review-spec.md` and
`/home/bjorn/.cache/opencode/issue4/46-c1-review-native-boundary.mjs`.
The implementer has the reproduction and instructions to correct discovery and
ownership across preparation, durable save, upload and remount, with regression
coverage for the previously untested precommit timing. Integration remains gated
on the next correction and independent review.

Precommit discovery correction delivered as
`ea74759e2ca2a681e6069ce8ba2b399533d5b827`. Implementer reports 189 focused
tests, 13 native lifecycle cases, both browser suites, typecheck, lint and build
completed successfully, with a clean tree. Independent **Standards PASS** for
this exact commit; S1/H1/H2 remain closed, with no new findings. Report:
`/home/bjorn/.cache/opencode/issue4/46-precommit-review-standards.md`.
Independent **Spec PASS** for this exact commit. Four independent native-IDB
cases and five targeted tests passed: exact A recovers before B without another
remount, duplicate upload or automatic Send, while newer drafts remain intact.
R1/R2 and original C1 approvals stand; no new blocker was found. Report:
`/home/bjorn/.cache/opencode/issue4/46-precommit-review-spec.md`.
Both final independent gates are now approved; integration of this delivery is
the next step, followed by the owner-approved #47 implementation.

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

### Precommit discovery correction after independent review of `d357b54`

The parent-owned `46-c1-review-spec.md` confirms the original C1 overlap and
terminal-resurrection fix, R1/R2 and Standards pass at
`d357b54fbaac2798aa046b38fe349cf1e045e2ec`, but withholds Spec approval for an
adjacent P2. Reopening while A awaits fingerprints can read zero rows; A later
commits and fails upload, but the replacement's empty map misses A on reconnect
and attempts obstructed B on ordinary Attach. The preceding receipt's preparation
claim was too broad: its remount tests began after POST entry. This section records
the additional boundary and correction without changing any owner approval.

**Exact independent feedback loop:** ran the unmodified
`46-c1-review-native-boundary.mjs` against the clean reviewed code. Its defect
assertions passed again (`46-precommit-exact-repro.log`): zero rows at reopen,
undiscovered A on reconnect, `local_failed` for B, recovery only on another remount.
The original report/script/log and controlled-device `46-c1-review-precommit.log`
remain intact under `/home/bjorn/.cache/opencode/issue4/`.

**Correction:** recovery discovers the union of current session/page preparations,
fresh durable captures and locally retained captures. It observes shared ownership
before and after the device read, so an empty snapshot cannot hide a preparation
that settles during discovery. Ordinary Attach acquires page ownership and reads
durable recovery **before** finalizing/freezing any new input. Retry also reloads
under ownership; a saved A replaces stale view-local assumptions. A failed first
local write retains its original frozen capture in that controller until actual
conflict/terminal evidence retires it. Disposal still cancels unfinished pre-freeze
preparation and preserves genuinely unresolved captures; no precommit durability
guarantee or automatic tutor Send is added.

Maintained regression: `scripts/check-handwriting-precommit.mjs`, derived from the
independently written native repro. The initial regression failed on reviewed code
with `discoveredOnReopen: false` and `recoveredWithoutRemount: false`
(`46-precommit-native-red.log`). After correction, all **13 cases pass**
(`46-precommit-native-green.log`). Its synchronization starts replacement `open()`
without awaiting completion until the held preparation is released: correct
recovery now joins that preparation. Native IndexedDB and native WebCrypto remain
real; transport/PNG preparation are controlled test boundaries, as in the original
repro. No application server or public preview is used by this narrow runner.

| Boundary actually exercised | Evidence / assertion |
|---|---|
| Pre-freeze asynchronous preparation | Actual-controller test disposes while `finish()` waits; no invented capture/upload or stuck uploading notice; next Attach can proceed. |
| WebCrypto fingerprints, before first capture save | Native browser holds the digest boundary; replacement reads zero rows, joins A, then discovers A after durable upload failure. Both reconnect and ordinary Attach recover exact A before B. |
| First capture save entry | Gate before invoking native `saveCapture`; zero rows at reopen, same discovery/recovery assertions. This is not an artificial pause inside an IndexedDB transaction. |
| PNG encoding and PNG save entry | Gate each separately with the initial capture already durable; exact source/PNG/identity/precondition replay, maximum one active request, eventual revision-2 B. |
| Upload | Hold controlled transport after saved capture; retain/discover real failure and recover through both ordinary triggers. Existing real-HTTP success/failure/lost-ACK remount checks also rerun in the mobile suite. |
| Terminal save entry | Hold before native `finishCapture` after a valid transport receipt; replacement waits for retirement, then B succeeds. Every native scenario also attempts a stale A write with a revision-99 draft and verifies terminal receipt/capture/draft preservation. |
| Already-open empty replacement | A is committed by another controller after the replacement opened; reconnect and ordinary Attach each freshly discover/recover A without another remount. |
| Failed first local persistence | Actual-controller test verifies rereading zero durable rows does not discard its locally retained frozen A or prepare B, and preserves the newer draft. |

The native cases assert exact replay, review completion, newer draft/working-value
preservation, no remaining capture after success and subsequent revision-2 Attach.
These are controller/native-boundary tests, not physical iPad navigation claims.
Full UI/HTTP regression coverage below supplies the existing real notebook/speech/
image-review paths. Both browser suites were rerun because discovery now precedes
every Attach/retry, including notebook focus/reveal and same-page replacement.

| Final correction check | Completed result / cache-root evidence |
|---|---|
| Focused suites | **189 passed, 0 failed**, `46-precommit-focused.log` |
| Native lifecycle matrix | **13 passed**, `46-precommit-native-green.log`; run with `LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4 node scripts/check-handwriting-precommit.mjs` |
| Typecheck / lint | Passed, `46-precommit-typecheck.log`, `46-precommit-lint.log` |
| Full mobile browser | Passed including existing postcommit C1 and R1/R2 regressions; `46-precommit-browser-mobile.log`, fixture `mobile-input-browser-46-precommit` |
| Full handwriting browser | Passed, `46-precommit-browser-handwriting.log`, fixture `handwriting-browser-XNTxKG` |
| Production build | Passed, `46-precommit-build.log`, disposable `build-46-precommit`; environment-only `turbopack.root`, four existing dynamic filesystem tracing warnings |
| Integration / whitespace | Merge of committed `integration/handwriting-45` tip `1946bcb7071a4cecaf874de7e6425867cfbfa4f1` reports already up to date; `git diff --check` passed |

All required checks completed before delivery. Parent's uncommitted review-status
notes were not edited. **Independent incremental re-review of this changed delta
and its final hash remains parent-owned and pending.** No live calls, public-preview
changes, pushes or issue closure occurred; physical acceptance remains separate.

### #46 integration completed; #47 ready — 2026-11-05

Reviewed source `ea74759e2ca2a681e6069ce8ba2b399533d5b827` is integrated by
normal merge commit `8b0000a88007fb90a7a312617da5827d01ee9972`. Its first parent
is the approval receipt `cd4ac3dc05793c5d5a8e14427ddaa04dc5cc002e`; its second
parent is the exact independently approved source above. Both worktrees were
clean at their pinned tips before the merge.

The sole conflict was adjacent receipt additions. Resolution preserved the
complete source implementation evidence and the parent's diagnostic/approval
history, including the parent's updated status sentence. Exact combined-content
verification passed; the merge differs from the reviewed source only in this
receipt. Both independent final review gates remain **PASS** for `ea74759`.

Post-merge verification at `8b0000a`:

- `~/.local/bin/agent-integration-check integration/handwriting-45 ea74759e2ca2a681e6069ce8ba2b399533d5b827`
  passed, reporting the merge tip and reviewed source as integrated.
- `git merge-base --is-ancestor cd4ac3dc05793c5d5a8e14427ddaa04dc5cc002e HEAD`
  passed; both merge parents and their ordering were verified.
- `git diff --check` passed; the integration worktree was clean.

This completion entry is a separate documentation commit after the merge; its
commit is the final receipt tip, not the merge commit. The historical pending
integration/re-review statements above describe their earlier checkpoints and
are superseded by this completion. **#47 is ready for its owner-approved
implementation.** Physical iPad acceptance remains open as recorded above.

### #47 Pages / Open / Restore / Duplicate / import delivery — 2026-11-05

Implementation follows [the promoted owner-approved contract](handwriting-pages-plan.md),
whose source SHA-256 is
`7f1c846802e295d53d1007ef9c44ca4c0221f53a9cc52278fe82e3d812cc2c65`.
Base: `117bdcf75efb70dd53604940485873c553a4c924` on
`implement/handwriting-47`. Historical #45/#46 approvals and limitations above
remain intact; this entry records implementer verification, not independent review.

Delivered surfaces and persistence boundaries:

- Pages with derived thumbnails, current-page navigation and independent copies;
  one pending/sent snapshot Open flow with the exact four approved choices.
  Restore is one destination-history edit; copies retain the frozen source graph.
- Tutor SVG annotation and explicit external PNG flattening use independent
  full-page backgrounds, the existing painter and native Undo/Redo. Import requires
  an empty page and never changes the original tutor figure or attachment.
- Separate native working-IDB assets/pages/actions/selection with transactional
  acceptance, compact synchronous graph recovery and generation/terminal fencing.
  Completed-stroke recovery and postcommit background sync remain local-first.
- Thin page routes and filesystem page wrappers reuse #46 graph/source contracts.
  Frozen creation retries precede later tails; concurrent originals are retained.
  Compatible creation responses adopt authoritative metadata only after causal
  reconciliation. Divergent candidates remain preserved and visibly blocked.
- #46 attachment identity, automatic recovery, ordinary Send/Attach behavior and
  immutable submitted bytes are preserved. Late reveal callbacks are scoped to
  the captured page; page actions do not send tutor input or finalize speech.

Additional regression findings during implementation:

- A controller retired during offscreen concurrent-original preparation could
  still commit metadata. The public-controller regression failed before the fix
  (`47-retired-red.log`); both recovery commit paths now use the existing native
  commit lifecycle guard. `47-controller-expanded.log` verifies retirement,
  compatible/divergent creation and local-only original recreation.
- Native `showModal()` overrode the mismatch heading's initial neutral focus.
  The real sent-snapshot UI assertion caught it (`47-ui-expanded-2.log`); the viewer
  now restores the neutral heading focus after opening its native modal.
- First-use annotation reached a controller retired by an effect remount while
  lazy notebook initialization yielded (`47-ui-expanded-3.log`). The session now
  follows the current registered controller before accepting the action. The same
  handoff protects snapshot actions that first mount the notebook.
- Restore from another page reused the destination's former reading position
  (`47-reading-position-red.log`, `120 !== 0`). The existing Restore-to-top rule
  now also applies when selecting a previously visited page; Open current retains
  its per-page reading position.
- A persistent postcommit canvas-paint fault exposed the obsolete "source
  unchanged" error (`47-paint-red-2.log`). The notebook now reports the approved
  device-saved notice, blocks drawing while rendering is unavailable, and repaints
  the same accepted page on Retry. Repaint callbacks are fenced on effect cleanup.
  `47-paint-green.log` verifies the notice, unchanged history during the fault,
  unchanged accepted page identity after Retry and restored background pixels.
  The preceding one-shot fault run (`47-paint-red.log`) automatically repainted
  before its error assertion; the retained regression holds the fault until Retry.

Failed-run artifacts are retained. The parallel full-browser attempts
`47-handwriting-final.log` and `47-mobile-delivery.log` stopped at 30-second
navigation/response timeouts; their servers recorded slow page loads. Host
contention is suspected, not asserted as a confirmed product diagnosis. Final
full-browser verification is run sequentially with the same behavioral assertions.

All evidence filenames in this entry are relative to
`/home/bjorn/.cache/opencode/issue4/`. Final check results and integration status
are recorded below before the delivery commit.

| Check | Result / cache-root evidence |
|---|---|
| Handwriting graph/store/route/controller, shared-writing and turn recovery | **105 passed**, `47-focused-final.log`; includes deletion during request parsing, concurrent creation, local-only recreation, exact frozen retries, precommit rollback, committed mirror failure and remount cancellation |
| Adjacent chat/practice/drill, dictation, SVG, Enter/Escape | **96 passed**, `47-adjacent-final.log` |
| Session core / source projection | **85 passed**, `47-session-final.log` |
| Native #47 working IDB | Passed, `47-native-pages-final.log`; actual atomic abort, pointer/action, stale heads, Restore reload Undo/Redo, assets/corruption, hashing cancellation, immediate strokes and offline copy remount |
| Inherited #46 native lifecycle | **13 cases passed**, `47-native-46-final.log`; exact capture discovery/replay, newer drafts, one-flight ownership and terminal fencing |
| Targeted real import / cross-page capture UI | Passed, `47-import-green.log`; actual SVG placement, empty-only admission, independent eraser, reload Undo/Redo, external PNG containment/one-origin map and frozen Attach through page switch |
| Full Chromium handwriting / Pages / import | **Passed**, `47-handwriting-complete.log`; fixture `handwriting-browser-AHsqsG`; includes both cross-page reading-position and postcommit-paint regressions |
| Full Chromium mobile / input / recovery | **Passed**, `47-mobile-complete.log`; fixture `mobile-input-browser-47-complete`; actual scripted conversation/question/practice/drill Send, speech/focus/gesture, native recovery and all inherited #46 remount/refusal/uncertainty checks |
| Typecheck / lint | **Passed** after all production corrections, `47-typecheck-final.log`, `47-lint-final.log` |
| Production build | **Passed**, `47-build-final.log`, disposable `build-47-final`; all 357 copied application files verified byte-identical to the final working source. Only the established environment-specific `turbopack.root` fixture setting differs; four existing dynamic filesystem tracing warnings remain. |
| Whitespace / integration ancestry | `git diff --check` and `git merge-base --is-ancestor integration/handwriting-45 HEAD` passed; committed integration tip at verification is `117bdcf75efb70dd53604940485873c553a4c924` |

Reproduction commands (from the #47 worktree; fixture paths are isolated):

```sh
LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4 NODE_ENV=test node --import tsx --test tests/handwriting*.test.ts tests/shared-writing.test.ts tests/turn-*.test.ts tests/retry-failed-turn.test.ts
NODE_ENV=test node --import tsx --test tests/chat-flow.test.ts tests/practice-flow.test.ts tests/drill-flow.test.ts tests/dictation-flow.test.tsx tests/svg-image.test.tsx tests/svg-native-render.test.ts tests/enter-submits.test.ts tests/esc-layering.test.ts
NODE_ENV=test node --import tsx --test tests/session-core.test.ts
LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4 node scripts/check-handwriting-pages-device.mjs
LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4 node scripts/check-handwriting-precommit.mjs
LH_HANDWRITING_TEST_ROOT=/home/bjorn/.cache/opencode/issue4 LH_HANDWRITING_TEST_PORT=3127 node scripts/smoke-handwriting.mjs
LH_MOBILE_TEST_DIR=/home/bjorn/.cache/opencode/issue4/mobile-input-browser-47-complete LH_MOBILE_TEST_PORT=3128 node scripts/smoke-mobile-inputs.mjs
npm run typecheck
npm run lint
# In the disposable, byte-verified build-47-final fixture:
NEXT_TELEMETRY_DISABLED=1 npm run build
```

All automated checks above have completed: **286 focused/adjacent/session tests**,
both native runners, both full browser suites, typecheck, lint, build and diff/
ancestry checks. No test execution remains pending. Browser suites were run
sequentially on the final production changes; the full handwriting suite includes
the final render-failure regression. No behavioral assertion was relaxed to pass
the earlier timeouts.

The full repository suite was not rerun; the documented #45 baseline failures
are not claimed fixed. Browser checks use isolated fixtures and scripted
providers/speech. Physical iPad #47/#48 acceptance and parent-owned independent
Standards/Spec review remain separate gates. No live provider/speech calls,
public-preview changes, pushes, PRs or issue closure were performed.

#### #47 committed integration check

Implementation, approved plan and completed verification are committed as
`e92962ae78aa99b51bbd3d9b3c3efa5056da072b` on `implement/handwriting-47`.
After that commit, `git merge --no-edit integration/handwriting-45` completed
with **Already up to date**. The latest committed integration tip was still
`117bdcf75efb70dd53604940485873c553a4c924`.

Post-commit checks passed:

- `git merge-base --is-ancestor integration/handwriting-45 HEAD` — exit 0.
- `git diff --check` — exit 0.
- `git status --porcelain=v1 --untracked-files=all` — empty, clean worktree.

This final receipt addition is documentation-only after the verified implementation
commit. The final delivery hash is returned with a fresh clean-tree and ancestry
check in the handoff. Parent-owned independent Standards/Spec review should pin
that final hash; physical #48 acceptance remains pending.

### #47 independent-review corrections — 2026-11-05

Correction work is isolated in `ticket-47-fixes`, branch
`implement/handwriting-47-fixes`, based on delivered
`56a26fc6ed81e19c87db21ceac51a6d168242666`. The original `ticket-47` worktree
remains pinned for independent review. Reports: `47-review-standards.md` and
`47-review-spec.md` under the cache root above. Original review artifacts and
all earlier approval/verification history are retained.

**Owner scope decision:** S1 keyboard reachability is **deferred, not fixed, and
not blocking #47/#48**, to [#51](https://github.com/bearthababe/learnharness/issues/51).
The [recorded #47 clarification](https://github.com/bearthababe/learnharness/issues/47#issuecomment-6657588270)
is promoted into the plan. No new keyboard binding, Tab cycle or menu-arrow
navigation is part of these corrections. S2's existing Escape priority is retained.

Corrections and focused evidence:

- **R1, assets before edits:** cold server backgrounds are committed and verified
  in native recovery before editable activation. Compatible remote extensions
  likewise prepare/commit before mirroring or activating; failed acceptance does
  not advance the acknowledged remote head. Native tests assert blocked admission
  while the initial asset transaction is held, followed by immediate stroke/remount
  with exact recovery. Red: `47-fixes-r1-red.log`; green: native final run below.
  The extra adoption test initially constructed an invalid import over ink; that
  fixture now uses the required Clear→import sequence. Its timeout logs are retained
  and are not claimed as a valid behavioral red.
- **R2, cold reads:** successful cached remote pages participate in subsequent
  reconciliation instead of being treated as absence. Native tests exercise
  thumbnail-read→switch and all four cold-original choices; the full browser
  check removes only an acknowledged copy's local records and drives the actual
  mounted thumbnail and Pages button. Red: `47-fixes-r2-red.log`.
- **R3, cancellation:** the session captures cancellation identity before lazy
  initialization and checks it before starting the controller action. Native
  tests mount the real session hook, delay initial GET, cancel Open/Duplicate,
  and verify zero source preparation, accepted snapshot pages or server mutations.
  Cancellation after native commitment still returns the accepted action rather
  than rolling it back. Red/green: `47-fixes-r3-{red,green}.log`.
- **S2, Escape:** a visible notebook surface claims Escape at document capture,
  independently of focus, while deferring to an open native modal. Actual Pencil
  Pages/options opening retains focused chat input; Escape closes once, restores
  the trigger, preserves typed text and live scripted dictation, and stops the
  underlying cancellation events. A second Escape resumes the existing chain.
  Red/green: `47-fixes-s2-{red,green}.log`.
- **H1, activation intent:** typed `ReadingPosition` replaces English notice
  equality in navigation. Restore/copies request top even when a compact-mirror
  failure replaces the success notice; current working and edits preserve position.
  Red/green: `47-fixes-h1-{red,green}.log` plus actual browser reading-position checks.
- **S3, superseded recovery:** reference search confirmed `HandwritingRecovery`
  had no production consumer. Its controller and obsolete tests are removed only
  after porting the regression guarantees to the active Pages seam, as mapped below.
  The #46 plan's historical file-path reference is retained as approval history;
  legacy keys remain read/reconciled by Pages and retained on failure.

| Retired recovery regression guarantee | Active coverage retained or ported |
|---|---|
| Redo/Clear across reopen; new edit abandons Redo; exhausted Undo no-op | Pages test “active page Redo, Clear and exhausted Undo…”; native working-IDB history/remount and full handwriting browser |
| Immediate leave during held save, editable Undo after remount | Pages test “immediate remount before a held save…”; native immediate-stroke/copy remount |
| Old/lost ACK never erases newer synchronous recovery | Pages test “held and lost working ACKs…”; existing lost frozen-creation ACK test |
| Honest device-only / neither / server-only status and repair | Pages test “active recovery honestly distinguishes…”; full browser quota/save/retry checks |
| Failed remote/device reads, corrupt/future/divergent records, generic 404 retain recovery | Pages test “legacy recovery remains readable…”; native corrupt asset/deletion checks |
| Delayed GET rereads newer/unknown/denied device truth and blocks unsafe PUT | Pages test “a delayed initial GET reconciles…”; existing full browser unreadable reconciliation check |
| Admitted stroke survives blocking ACK even when secondary write also fails | Pages test “an admitted stroke survives…”; red/green `47-fixes-s3-admitted-{red,green}.log`; full browser mid-stroke ACK cases |
| Successful deletion fences idle/held ACK and admitted completion; other session retained | Pages test “deletion invalidates both idle and held-ACK…”; native generation tombstone and actual sidebar deletion browser check |

Porting the admitted-stroke regression found a real active-controller omission:
Retry loaded an older IDB row over a newer retained in-memory completion after
both recovery writes failed. Load now causally reconciles retained working with
the device row before reading compact/legacy recovery. The red lost the second
stroke; the green retains it through repair, server sync, reload and Undo.

The unmodified reviewer repro was rerun against the pinned original source before
correction; all three defect assertions reproduced (`47-fixes-native-exact-repro.log`).
Maintained native regressions now exercise the corrected application seams from
the correction worktree. The original review files were not modified.

| Final correction check | Completed result / cache-root evidence |
|---|---|
| Focused handwriting/active recovery/pages/store/routes/shared-writing/turn suites | **102 passed**, `47-fixes-focused-final.log`; obsolete-controller tests have been replaced by the mapped active coverage above |
| Adjacent chat/practice/drill/session, dictation, SVG, Enter/Escape suites | **181 passed**, `47-fixes-adjacent-final.log` |
| Native Pages/controller/session boundaries | Passed, `47-fixes-native-pages-final.log`; existing atomicity/history/deletion cases plus R1 cold/adopted assets, R2 thumbnail/navigation/all choices and R3 real lazy-hook cancellation before/after acceptance |
| Inherited #46 native lifecycle | **13 cases passed**, `47-fixes-native-46-final.log` |
| Full Chromium handwriting | Passed, `47-fixes-handwriting-final.log`, fixture `handwriting-browser-6BqrY4`; includes actual cold Pages thumbnail→switch, exact four choices, typed-intent reading positions and postcommit paint recovery |
| Full Chromium mobile | Passed, `47-fixes-mobile-final.log`, fixture `mobile-input-browser-47-fixes-final`; includes S2 focused-chat/Pencil/live-scripted-speech Escape and all inherited input/Send/remount recovery assertions |
| Typecheck / lint | Passed, `47-fixes-typecheck-final.log`, `47-fixes-lint-final.log` |
| Production build | Passed, `47-fixes-build-final.log`, disposable `build-47-fixes`; 356 copied application files verified byte-identical to corrected source. Only the established fixture `turbopack.root` setting differs; four existing dynamic filesystem tracing warnings remain. |
| Diff / original-review isolation | `git diff --check` passed. Read-only verification confirmed original `ticket-47` still clean at `56a26fc6ed81e19c87db21ceac51a6d168242666`. |

All **283 focused/adjacent tests**, native runners, both full browser suites,
typecheck, lint, build and diff checks completed before the correction commit.
The full browsers ran sequentially after the production corrections settled;
no required execution is pending. Reproduction commands are the earlier delivery
commands, with `tests/handwriting-recovery.test.ts` retired, both adjacent/session
groups combined, and mobile fixture `mobile-input-browser-47-fixes-final`.
The dedicated S2 feedback loop uses `LH_NOTEBOOK_MENUS_ONLY=1` with the mobile
runner; native R1–R3 cases are maintained in `scripts/check-handwriting-pages-device.mjs`.

S2/S3/H1 and R1/R2/R3 are corrected in this implementation; **S1 remains explicitly
deferred to #51**. Independent Standards/Spec rereview remains parent-owned and
pending for the final pinned correction hash. These implementer checks do not
grant overall #47 approval or physical #48 acceptance. No live provider/speech
calls, public-preview changes, push, PR or issue closure occurred. The documented
#45 broad-suite limitations remain unchanged; a whole-repository pass is not claimed.

### #47 keyboard follow-up — owner scope decision

Independent Standards review of delivery
`56a26fc6ed81e19c87db21ceac51a6d168242666` identified S1: new notebook,
snapshot and annotation actions are not keyboard-reachable under the existing
custom Tab model. The owner explicitly declined the proposed local Tab/menu
navigation extension and requested an app-wide keyboard-interaction overhaul,
including key bindings and shortcuts, as a separate feature.

Created [#51 — Overhaul keyboard interactions, key bindings and shortcuts](https://github.com/bearthababe/learnharness/issues/51),
including the exact deferred S1 actions, current evidence and required owner
planning/approval. S1 is deferred by owner decision, not fixed or keyboard-ready,
and is not a blocker for continuing #47/#48. No new keyboard bindings or Tab
navigation are authorized in this delivery. Existing Escape-priority regressions
and other non-deferred review findings still require correction and verification.
Review: `/home/bjorn/.cache/opencode/issue4/47-review-standards.md`.

### #47 independent review and correction handoff

Initial delivery `56a26fc6ed81e19c87db21ceac51a6d168242666` remains pinned in
`/home/bjorn/.cache/opencode/issue4/ticket-47`. Corrections are isolated in
`/home/bjorn/.cache/opencode/issue4/ticket-47-fixes` on
`implement/handwriting-47-fixes`.

- Standards: S1 keyboard reachability is owner-deferred to #51 above. S2
  focus-independent Escape ownership and S3 retirement of the replaced recovery
  controller require correction. H1 notice-text-driven scroll state is also
  included in the correction pass.
- Spec **BLOCK**: R1 cold remote backgrounds become editable before referenced
  assets are durable, blocking immediate-reload recovery; R2 a successful cold
  page read poisons subsequent navigation/choice reads; R3 cancellation during
  lazy notebook initialization is lost before snapshot preparation begins.
  All three were independently reproduced with actual controllers/session hook
  and native IndexedDB. Existing focused tests passed 15/15 but do not cover
  these boundaries. Report:
  `/home/bjorn/.cache/opencode/issue4/47-review-spec.md`; reproduction:
  `/home/bjorn/.cache/opencode/issue4/47-review-native-boundaries.mjs`.

The implementer has the reports and exact reproduction. Corrections, completed
verification, and independent re-review of the resulting commit remain required
before #47 integration. #46's existing approvals remain intact.

Correction delivery: `eeef5d3c6db9daa8789f7266a6a3302626ea6f9c` on
`implement/handwriting-47-fixes`, including integration documentation `674e3da`.
Implementer reports S2/S3/H1 and R1–R3 corrected, 283 tests plus native runners,
both browser suites, typecheck, lint and build passed, and a clean tree. S1 remains
explicitly deferred to #51. Both independent reviewers are assigned this exact
commit for re-review; approval and integration remain pending.

Standards re-review at `eeef5d3`: S3/H1 closed, original S2 focus defect fixed;
S1 remains owner-deferred. One N1 blocker remains: notebook capture steals
Escape from a newer nonmodal Snapshot actions menu, closing underlying Pages
and moving focus behind the open menu. Narrow Chromium event-order reproduction:
`/home/bjorn/.cache/opencode/issue4/47-rereview-escape-boundary.log`; report:
`/home/bjorn/.cache/opencode/issue4/47-rereview-standards.md`.
Correction is dispatched in isolated worktree
`/home/bjorn/.cache/opencode/issue4/ticket-47-menu-fix`, branch
`implement/handwriting-47-menu-fix`, preserving `ticket-47-fixes` at the exact
commit still under independent Spec review. No new keyboard binding/navigation
is authorized; this corrects existing topmost-Escape ownership.

The owner subsequently **approved the narrow N1 implementation plan**: a small
shared Escape-ownership stack for notebook and nonmodal snapshot menus; newest
open surface dismisses first regardless of focus, native dialogs retain priority,
and focus returns to the closed surface's trigger. Verify overlapping menus and
existing Pencil/dictation behavior. This does not change the #51 navigation
deferral or authorize new bindings.

Spec re-review at `eeef5d3` independently closed R1/R2/R3, but found P2 R4:
aborted durable adoption of a known compatible newer server head releases editing
on its stale ancestor; a subsequent stroke creates an avoidable persistent
conflict. Report: `/home/bjorn/.cache/opencode/issue4/47-rereview-spec.md`;
native reproduction:
`/home/bjorn/.cache/opencode/issue4/47-rereview-extra-boundaries.mjs`.
R4 and the approved N1 correction are dispatched together. Known incoming
working must remain recoverable and unsafe edits gated until adoption succeeds;
no new product behavior is required beyond existing reconciliation guarantees.

N1/R4 correction delivered as `fa8c2aa25bc2cf17844e841127e3835b359ae901` on
`implement/handwriting-47-menu-fix`, including integration `674e3da`.
Implementer reports a clean tree and completed passes for 65 focused tests,
native checks, affected browser checks, typecheck, lint and production build.
Independent Standards and Spec incremental reviews are dispatched against this
exact commit. Independent **Standards PASS** at `fa8c2aa`: N1/S2 closed,
S3/H1 remain closed, no new findings. Independent Chromium checks covered both
menu opening orders, focus-independent dismissal, trigger restoration and native
modal priority. Report:
`/home/bjorn/.cache/opencode/issue4/47-menu-review-standards.md`; evidence:
`/home/bjorn/.cache/opencode/issue4/47-menu-review-escape-boundary.log`.
S1 remains owner-deferred to #51, not fixed or blocking.

Spec at `fa8c2aa`: **R1–R4 CLOSED; BLOCK on P2 R5**. Repaired creation-response
adoption changes page metadata while a creation action remains outstanding; the
next retry rebuilds the seed using adopted metadata and receives persistent 400
responses from actual server validation. Newer strokes remain local across reload
but cannot sync. Report:
`/home/bjorn/.cache/opencode/issue4/47-adoption-review-spec.md`; actual server/store
and native-IDB reproduction:
`/home/bjorn/.cache/opencode/issue4/47-adoption-review-creation.mjs`.
The implementer is correcting frozen creation metadata/identity through safe
retirement and queued-tail sync, with real-handler regression coverage replacing
the insufficient unconditional-POST stub. Integration remains gated on correction
and independent review; no source loss or tutor-input defect is asserted.

R5 correction delivered as `86dff1dd55d757fe34b334d0e8c45e36753a8ce7` on
`implement/handwriting-47-menu-fix`. Implementer reports atomic metadata adoption
and creation-action retirement, clean tree, 39 focused tests, 13 actual-server/
native lifecycle cases, existing native checks, handwriting browser, typecheck,
lint and build completed successfully. Independent Spec and Standards incremental
reviews are dispatched against this exact commit. Independent **Standards PASS**
at `86dff1d`: no new breaches or heuristic findings; N1/S2/S3/H1 remain closed.
Report: `/home/bjorn/.cache/opencode/issue4/47-creation-review-standards.md`.
Independent **Spec PASS** at the same exact commit: R5 closed, R1–R4 remain
closed; independent reproduction, 13 actual-server/native lifecycle cases,
existing native checks and two targeted contract tests passed. No new blocker
found. Report: `/home/bjorn/.cache/opencode/issue4/47-creation-review-spec.md`.
Both independent gates approve `86dff1d`; integration is next. S1 remains
owner-deferred to #51, not fixed or blocking; physical #48 acceptance remains
separate.

#### #47 correction integration and pinned handoff

Corrections and completed verification were committed as
`6d9fa375c28e1adb72e92e798c19713ad6fb975a`. The latest committed integration tip,
`674e3da638d87e4d6405fa34db785568fca70a1f`, was then merged as
`ab5294b7a8228c02eaa803691c22dbd7d038be18`.

The sole conflict was this appended receipt. Exact-content verification confirmed
both complete histories were preserved byte-for-byte, with their shared base
retained once. The merge changes only this receipt relative to the tested
correction commit; production source, tests and runners are identical. No broad
test rerun was needed for this documentation-only integration.

Post-merge ancestry, diff checks and clean-tree verification passed. The merge's
first parent is the correction commit; its second parent is the integration tip
above. This final receipt addition is a separate documentation commit. Its exact
hash is returned after fresh clean-tree, integration-ancestry and original-worktree
isolation checks in the handoff for parent-owned Standards/Spec rereview.
S1 remains owner-deferred to #51; independent rereview and physical #48 acceptance
remain pending.

### #47 second correction pass — N1 and R4, 2026-11-05

Isolated worktree `ticket-47-menu-fix`, branch `implement/handwriting-47-menu-fix`,
starts at `eeef5d3c6db9daa8789f7266a6a3302626ea6f9c`. The independent rereviews
at that pin are `47-rereview-standards.md` and `47-rereview-spec.md` under
`/home/bjorn/.cache/opencode/issue4/` (the root for evidence filenames below).
They close **S3/H1 and original R1/R2/R3**. The original S2 focus defect is fixed,
but Standards found **N1**, topmost nonmodal Escape ownership; Spec found **R4**,
unsafe edit admission after failed compatible incoming adoption. **S1 remains
owner-deferred to #51, not fixed and not blocking #47/#48.**

The owner explicitly approved the N1 question: “May we fix Escape ordering with
a small shared stack that tracks open notebook and snapshot menus, so the most
recently opened menu closes first regardless of focus? Native dialogs keep
priority, focus returns to the closed menu’s trigger, and we’ll verify overlapping
menus alongside the existing Pencil/dictation behavior.” Answer: **Approve**.
This narrow amendment is promoted into `docs/handwriting-pages-plan.md`; it adds
no Tab/menu navigation or new binding. R4 enforces the existing
reconciliation-before-edit invariant rather than changing owner behavior.

- **N1:** `components/menu-escape.ts` shares opening-order ownership between the
  notebook surfaces and SnapshotMenu. Stable callback updates do not reorder
  open menus. Document capture still protects focused chat/Pencil input; only the
  newest registered menu dismisses, native dialogs retain priority, and the
  component restores its own trigger focus. Actual UI red: `47-menu-n1-red.log`
  reproduces Pages→snapshot actions stealing Escape while the original S2 test
  passes. The final targeted browser run covers Pages/options, both opening orders,
  focus in menu/chat, two successive dismissals, live scripted speech, unchanged
  draft/history, zero Open/Duplicate action requests, and viewer/decision modals.
- **R4:** incoming history is retained separately from acknowledged remote state.
  A shared adoption path blocks stale editing before asynchronous preparation,
  reconciles retained/device/incoming history, and only activates after native
  page/asset commitment. Abort keeps the incoming candidate and existing recovery;
  Retry resumes adoption without requiring another GET or entering a retry/sync
  wait cycle. Creation responses use the same path. Inspection also found the
  existing-page GET path could skip adoption when its cached server head extended
  local working; that path now uses the same gate. Native red evidence:
  `47-menu-r4-red.log`, `47-menu-r4-creation-red.log`,
  `47-menu-r4-known-get-red.log`. Maintained coverage is
  `scripts/handwriting-adoption-checks.mjs`, invoked by the existing native runner.
  It proves abort→refused edit→storage repair with GET unavailable→durable incoming
  head/assets→successful next stroke, server reconciliation and reload, for PUT,
  creation, cold load and existing-page discovery. An already-admitted stroke is
  still completed and retained; a genuinely divergent incoming branch cannot
  overwrite it. Existing active-controller durability tests retain ordinary
  device-first editing when there is no unresolved incoming state.

The unmodified independent R4 repro was rerun before correction:
`47-menu-r4-exact-repro.log`. A separate `47-menu-native-feedback.mjs` changes
only the source pin and expected success assertions, preserving the original
review scripts/logs. Its final run confirms all three abort/repair scenarios and
the real session-hook cancellation during controller handoff. Diagnostic logs
are retained: the creation fixture's unrelated initial-page PUT was corrected;
an early menu run timed out awaiting scripted speech, and a reused browser profile
duplicated its saved draft. Final menu checks wait for the visible idle microphone
and use a fresh profile; those diagnostic failures are not claimed as behavioral reds.

| Final check after production changes settled | Completed evidence |
|---|---|
| Affected Pages/controller/routes/store, handwriting/history, shared-writing, Escape/sidebar keyboard and dictation-flow suites | **65 passed**, `47-menu-focused-final.log` |
| Maintained native Pages runner | Passed all existing R1–R3/transaction/recovery cases plus the five R4 boundaries, `47-menu-native-final.log` |
| Independent scenario feedback | Passed, `47-menu-native-feedback-final.log`; `admittedNewStroke:false`, repaired incoming head and asset, cancelled handoff with zero mutations |
| Full handwriting Chromium suite | Passed, `47-menu-handwriting-final.log`; fixture `handwriting-browser-9gfXRh`; includes accepted-stroke ACK, recovery, Pages/import, immutable Attach and postcommit paint retry |
| Focused actual menu/dictation Chromium suite | Passed, `47-menu-menus-final.log`; fixture `mobile-input-browser-47-menu-final`; original S2 plus N1 overlap/native-modal/decision cases, no runtime errors |
| Typecheck / lint | Passed, `47-menu-typecheck-final.log`, `47-menu-lint-final.log` |
| Production build | Passed, `47-menu-build-final.log`, fixture `build-47-menu`; 357 application files verified byte-identical, only established fixture `turbopack.root` variation; four existing filesystem tracing warnings |
| Diff and isolation | `git diff --check` passed; original `ticket-47` clean at `56a26fc6ed81e19c87db21ceac51a6d168242666`, first correction `ticket-47-fixes` clean at `eeef5d3c6db9daa8789f7266a6a3302626ea6f9c` |

The two browser runs were sequential. All checks above have completed. The full
mobile/transfer and whole-repository suites were not rerun for this delta; their
prior evidence/limitations remain recorded above. Reproduce the focused browser
with `LH_NOTEBOOK_MENUS_ONLY=1 LH_MOBILE_TEST_DIR=<fresh mobile-input-browser-*>
LH_MOBILE_TEST_PORT=3128 node scripts/smoke-mobile-inputs.mjs`; the full handwriting
and native commands are unchanged. No live provider/speech calls, public-preview
changes, push, PR or issue closure occurred. N1/R4 are implemented corrections,
not independent approval: parent-owned Standards/Spec rereview must pin the final
clean commit. Physical #48 acceptance remains pending.

#### N1/R4 committed integration handoff

Implementation, owner amendment, regressions and completed evidence were committed
as `c84d71a708c6c160aee38323b8c635646ce0be60`. Then
`git merge --no-edit integration/handwriting-45` reported **Already up to date**:
the latest committed integration tip remains
`674e3da638d87e4d6405fa34db785568fca70a1f`, already inherited with both earlier
receipt histories. Integration ancestry, `git diff --check` and empty
`git status --porcelain=v1 --untracked-files=all` passed after the commit.

This last receipt entry is documentation-only. The handoff supplies its exact
final clean hash after fresh ancestry and pinned-worktree isolation checks.
Parent-owned independent rereview must assess N1/R4 at that hash; no overall #47
approval is claimed. S1 remains deferred to #51 and physical #48 remains open.

### #47 R5 frozen creation lifecycle correction — 2026-11-05

Continued in `ticket-47-menu-fix` / `implement/handwriting-47-menu-fix` from clean
`fa8c2aa25bc2cf17844e841127e3835b359ae901`, after both independent reviewers
finished. Parent reports **Standards PASS**: N1/S2 fixed, S3/H1 closed, S1 still
owner-deferred to #51. `47-adoption-review-spec.md` closes **R1/R2/R3/R4** and
reports **R5 P2**: metadata adoption followed by failed/outstanding creation
retirement could regenerate an invalid recovery seed, leaving its queued tail
unsynced. Earlier owner approvals, review files and verification history remain
intact. Evidence filenames below are relative to `/home/bjorn/.cache/opencode/issue4/`.

The unmodified actual-server/native reproduction passed its bug assertions before
changes (`47-r5-exact-repro.log`). Maintained regression red
`47-r5-native-red.log` likewise recorded a valid recovered-origin POST returning
200 followed by working-origin retries returning 400, an outstanding action after
remount and an unsynced tail. This reaches the real `handwritingPagesResponse`,
`sharedWritingSourceResponse`, shared-writing/filesystem stores, native IDB and
WebCrypto; it does not stub creation acceptance.

**Correction:** the original page wrapper remains part of the frozen seed while
its creation action exists. Compatible server metadata adoption and retirement of
that accepted creation now share one native transaction. A page-write or action-
deletion abort rolls back both; the original metadata/identity and seed closure
remain available for exactly the same request after remount. Only transaction
completion updates controller metadata and removes the in-memory action. Queued
tails then use ordinary PUT with reconciled metadata. When metadata adoption is
unnecessary, a failed ordinary retirement leaves the unchanged wrapper available
for the same idempotent POST retry. No server-validation relaxation or 400-as-
acceptance path was introduced.

The internal `PageCommit.retireAction` transaction argument uses the existing
pageActions store. Persisted page/action schemas and IDB version remain unchanged;
there is no new persisted seed shape. The promoted plan clarifies the existing
immutable-seed/safe-retirement invariant. No UI or keyboard behavior changes.

`scripts/check-handwriting-creation-device.mjs` maintains **13 real-handler/native
lifecycle cases**: concurrent source recovery with adoption abort, retirement
abort or lost response; absent-original recovery, working copy, snapshot copy,
external original and local-only recovery with retirement abort/lost response.
Every case forces multiple actual POSTs across a remount and compares the full
parsed request against the original (including origin, createdAt, page identity,
creation ID/from, frozen graph closure and assets), not merely the head or kind.
Assertions verify retirement, unchanged immutable snapshot source, one noninitial
page, zero tutor messages, successful subsequent tail PUT and exact reload.
Reconciled working accumulates a queued tail while creation is pending; concurrent
metadata adoption remains guarded. Known incoming state repairs with GET disabled.

The permissive creation POST branch in `handwriting-adoption-checks.mjs` is removed
and its coverage replaced by this actual-server runner. PUT/cold/known-GET/admitted-
stroke boundaries remain in the existing native Pages runner. A separate external
`47-r5-creation-feedback.mjs` changes only the independent reproduction's expected
success assertions, preserving its original artifact. Its final result has zero
remaining actions, no 400s, null notice, and identical local/server/reloaded tail.

| Final check after production changes settled | Completed evidence |
|---|---|
| Affected Pages/controller/route/store, handwriting/history and shared-writing suites | **39 passed**, `47-r5-focused-final.log` |
| Actual-handler/native creation lifecycle | **13 cases passed**, `47-r5-creation-final.log` |
| Existing native Pages/R1–R4 boundaries | Passed, `47-r5-pages-native-final.log`; genuine cold reads/assets, cancellation, atomicity, recovery and admitted-stroke preservation retained |
| Independent exact scenario with success assertions | Passed, `47-r5-feedback-final.log` |
| Full handwriting Chromium suite | Passed, `47-r5-handwriting-final.log`, fixture `handwriting-browser-chZGS3`; real Pages/Open/Restore/Duplicate/import, immutable Attach, recovery and postcommit retry |
| Typecheck / lint | Passed, `47-r5-typecheck-final.log`, `47-r5-lint-final.log` |
| Production build | Passed, `47-r5-build-final.log`, fixture `build-47-r5`; 357 application files verified byte-identical, established fixture `turbopack.root` variation only; four existing filesystem tracing warnings |
| Diff and original-tree isolation | `git diff --check` passed; `ticket-47` remains clean at `56a26fc6ed81e19c87db21ceac51a6d168242666`, `ticket-47-fixes` clean at `eeef5d3c6db9daa8789f7266a6a3302626ea6f9c` |

New reproduction command:
`NODE_ENV=test node --import tsx scripts/check-handwriting-creation-device.mjs`.
Existing native/full-handwriting commands remain as recorded above. All checks
have completed. Unrelated keyboard/mobile/transfer and whole-repository suites
were not rerun for this persistence-only delta; their earlier approvals/evidence
remain recorded. No live provider/speech calls, public-preview changes, push,
PR or issue closure occurred. R5 is an implemented correction awaiting parent-owned
independent review at the final clean hash; overall #47 and physical #48 acceptance
are not claimed.

#### R5 committed integration handoff

R5 implementation, maintained real-server/native regressions and completed
verification were committed as `0ac7ea70328cb10ecd00c7360030a28240cfcdfa`.
`git merge --no-edit integration/handwriting-45` then reported **Already up to
date** at the latest committed integration tip
`674e3da638d87e4d6405fa34db785568fca70a1f`. Both earlier receipt histories remain
inherited. Integration ancestry, diff checks and empty porcelain status passed
after that commit.

This final receipt-only commit supplies the clean delivery pin in the handoff,
after fresh ancestry and original-worktree isolation verification. R1–R4 and the
prior Standards approvals remain recorded above; R5 awaits parent-owned
independent review. S1 remains deferred to #51; physical #48 remains pending.

### #47 integration completed; #48 ready — 2026-11-05

The exact independently approved source
`86dff1dd55d757fe34b334d0e8c45e36753a8ce7` from
`implement/handwriting-47-menu-fix` is integrated by normal merge commit
`099d4b28b70f32e8b93ce18705f8f7baa719a453`. Its first parent is the complete
parent review/approval receipt `f1ab3d034abf183ca6b211aaa8ba4ba49ca227ae`; its
second parent is the exact approved source. Both worktrees were clean at those
pinned tips before merging. The approved source includes original #47 delivery
and its corrections, including prior integration `674e3da`.

The only conflict was this receipt's appended histories. Exact byte-content
verification confirmed the resolved receipt equals the complete source receipt
with the parent's complete independent review/approval history inserted. All
other tracked files are byte-identical to the approved source; application code,
tests and runners have no merge-specific changes.

Both final independent gates are **PASS** at `86dff1d`:

- Standards: `/home/bjorn/.cache/opencode/issue4/47-creation-review-standards.md`;
  N1/S2/S3/H1 remain closed, with no new findings.
- Spec: `/home/bjorn/.cache/opencode/issue4/47-creation-review-spec.md`;
  R1–R5 closed, with no new blocker.

Post-merge verification at `099d4b2` completed successfully:

- `~/.local/bin/agent-integration-check integration/handwriting-45 86dff1dd55d757fe34b334d0e8c45e36753a8ce7`
  reports the exact source integrated.
- Parent ancestry check for `f1ab3d034abf183ca6b211aaa8ba4ba49ca227ae`
  passed; both merge parents and their ordering were verified.
- The full tracked-tree comparison against the approved source, excluding only
  this receipt, passed with no differences.
- `git diff --check` passed and the integration worktree was clean.

This completion entry is a separate receipt-only commit after the merge. Earlier
pending correction, independent-review and integration statements are historical
checkpoints superseded by this final completion entry. **#48 is ready.** S1
keyboard reachability remains explicitly owner-deferred to #51, not fixed and
not blocking. Physical iPad acceptance remains open; automated evidence above
does not replace owner device acceptance.

### #48 composition and handoff preflight — 2026-11-05

Integration tested at `10ec0d0c999c6d88615f771e2271eb0fc24c32c9`; reviewed production
source remains `86dff1dd55d757fe34b334d0e8c45e36753a8ce7`. The complete tracked-tree
comparison differs only in this receipt. Independent Standards/Spec approvals
above apply without a merge-specific production delta; S1 remains deferred to
[#51](https://github.com/bearthababe/learnharness/issues/51).

All filenames in this section are under `/home/bjorn/.cache/opencode/issue4/`.
Machine preflight: `48-preflight.json`, produced by `48-preflight.py`. It verifies
all **357 application files** against retained production `build-47-r5`, build ID
`FK05t14TT6OZj5Z_ygK_h`. The only configuration variation is the documented
disposable `turbopack.root: "/"`; the build has no `.env*`. No rebuild or blanket
suite rerun is needed. Earlier completed logs are fingerprinted in that record.

#### Composition acceptance matrix

| #48 acceptance | Automated evidence / boundary |
|---|---|
| Writing + speech → Attach → review → explicit Send, ordinary/teaching/practice/drill | Focused #48 composition runner adds actual canvas capture and Attach-finalized speech to each ordinary adapter, including reload before explicit submission. Final result recorded below. |
| Choice eligibility and tutor access | #48 includes image+speech with an empty choice still ineligible, then explicit selection. Actual handler/store persists intended reasoning, image reference and receipt; scripted provider only. Real tutor understanding is an owner gate. Earlier adapter coverage: `47-fixes-mobile-final.log`. |
| Actual tutor read-tool byte access | `47-r5-focused-final.log` includes the passed real `read` tool image-bytes test and question/practice model/transcript projections. This proves intended bytes are available through the actual tool seam, not that a live tutor understood them. |
| Pending/sent Open, exact four choices, undoable Restore, Redo, Duplicate and independent stages | `47-r5-handwriting-final.log` / `scripts/handwriting-pages-checks.mjs`: actual pending/sent controls, four-choice order/neutral focus, Restore/reload/Undo/Redo, exact snapshot versus working copies, independent pending heads and same-page replacement. Native graph/adoption/creation cases: `47-r5-pages-native-final.log`, `47-r5-creation-final.log`. |
| Figure import → unfinished leave/reload → continued editing → Attach/Send; immutable older submission | Focused #48 composition runner connects the previously tested import and Send paths and exercises sent Open/save-switch, return to set-aside working, and revised submission. Existing geometry, empty-only admission, independent eraser and background fidelity: `47-r5-handwriting-final.log`. |
| Empty/older sessions, repeated reopen and session separation | #48 includes empty other-session navigation during unfinished annotation. Final handwriting suite covers V1 recovery, repeated reopen and actual session isolation/deletion; native Pages runner covers missing/local-only/cold originals and retained corrupt/future data. |
| Save/upload/submission failure and retry composition | `47-fixes-mobile-final.log`: exact saved capture recovery through Attach/reopen/online without Send, newer draft preservation, definite rejection→edit/replace/reload/Submit, both uncertain-A/replacement-B orderings, exact ordinary Send recovery and speech/acceptance races. `47-fixes-native-46-final.log`: 13 precommit/remount ownership cases. Final #47 native and handwriting logs add page commitment/adoption/creation failures and postcommit rendering recovery. |
| Mobile layout, focus, keyboard and gestures | Existing scripted full handwriting/mobile suites plus `47-menu-menus-final.log` cover phone focus containment, paper/history scrolling, Expand/Back, Pencil-emulated activation and topmost Escape. Physical palm contact, Pencil feel, orientation, software keyboard and iOS pinch/scroll behavior remain owner gates; S1 reachability is explicitly deferred. |
| HTTPS normal launch, Home Screen identity/assets and Reload | Staged integrated production is checked against the retained #45 HTTPS launch identity, with actual Reload on the isolated local production copy. Final endpoint/handoff result recorded below. Physical Home Screen install/launch remains distinct. |
| Regression/type/lint/build and review | Completed exact-delta `47-r5-{focused-final,creation-final,pages-native-final,handwriting-final,typecheck-final,lint-final,build-final}.log`; prior broader affected suites and independent final reports above. No app-code change in #48. Existing #45 whole-suite limitations are not claimed fixed. |
| Actual learning verdict and broader scope | Pending owner trial; neither #4, #44 nor physical #48 is closed by automation. |

#### Slot-2 readiness and concrete configuration blocker

Owner approval to replace #45 at the same `:8445` remains valid. Preflight verified
slot 2 PID3484369 at `/home/bjorn/.cache/opencode/issue45/review-build-329677b`,
with existing `review-data` and `review-isolated-auth.json` paths. Slot 1 PID4152830
and slot 3 PID4154558 are unrelated. All existing Tailscale mappings, including
443/8443/8444/8445/8446/8447, remain tailnet-only and unchanged.

The review data has a byte-verified reversible backup at
`48-review-data-before-handoff`; file hashes are in `48-preflight.json`. Original
#45 build/data and lesson-navigation restoration instructions at
`/tmp/opencode/issue45-preview-slot.md` are retained. Local production readiness
uses **only a separate copy** `48-production-readonly-data`, with empty isolated
`48-production-readonly-auth/auth.json`, and port 3130.

**Handoff blocker requiring parent/owner decision:** main settings at
`/home/bjorn/repo/teach/learnharness/data/settings.json` select ChatGPT subscription
models (`gpt-6.1-sol` strong; `gpt-6-luna` cheap/vision). Slot 2 has no auth JSON or
settings file; its subscription store has no registrations. Read-only projection
of `/home/bjorn/repo/teach/learnharness/chatgpt-credentials.json` found one saved
registration but **no active registration**. No credential content is recorded.
The separate native app store
`/home/bjorn/.config/LearnHarness/chatgpt-credentials.json` does have an active
refreshable registration, with no explicit `allowBackgroundUse` field. This is
not the isolated review owner and was inspected only as booleans/counts; its
credentials and consent were not copied or changed.

`src/server/web-subscriptions.ts:100` derives the writable subscription-owner
directory from `dirname(LH_AUTH_FILE)`; `electron/chatgpt.cjs` owns token refresh
and credential writes there. Pointing this preview at the main auth directory
would share a writable owner with other services. Copying refreshable credentials
would create competing owners. Neither is authorized. Copying only ordinary API
keys would not configure the selected ChatGPT tutor. Parent must resolve isolated
owner sign-in or an explicitly coordinated credential-owner handoff, including
background-role consent, before this can be described as live-trial-ready.

No main credentials/settings were changed, copied, refreshed, revoked or tested
with inference. No live tutor/speech/extraction call was initiated. The #48 scripted
fixture has empty isolated auth, fake speech and faux tutor; its server fetch guard
(`48-no-external.cjs`) refuses non-loopback destinations, and browser interception
blocks external requests. Readiness browsing allows only same-origin GET/HEAD and
blocks speech/extraction paths and all non-read requests. The public slot has not
been replaced while this decision is unresolved.

#### Completed production/identity readiness

`48-production-readiness.json` and `48-production-browser-c.log` pass:

- The retained #47 production build served all three intended review sessions
  from a copied data directory on strict `127.0.0.1:3130`. Actual **Pages** controls
  established integrated app identity. The real **Notebook options → Tools and
  help → Reload preview** action retained exact saved ink pixels.
- Existing HTTPS `:8445` teaching/practice/drill pages returned 200. Each page's
  manifest, stable session `id`, `start_url`, session-limited `scope`, standalone
  display, Apple metadata and touch icon match staged production exactly. Icon
  SHA-256 is recorded in machine evidence. This is **readiness comparison**, not
  a claim the integrated build has replaced #45 on HTTPS.
- Browser runtime errors: zero. The interceptor actually blocked automatic
  `/api/stt/token` GETs and the local copy's attempted working PUTs. The resulting
  local save-warning is expected under this read-only check, not a persistence
  failure claim. No public learning-data mutation or inference was allowed.
- Local readiness task `sh_1ac0f5bab001URHztofP6Au8Oq` used PID19447; after completed
  checks its exact cwd/data/auth identity was reverified, then only that PID was
  stopped. Build, copied data and rollback data remain available. No public slot
  was stopped or remapped.

Retained harness diagnostics: `48-production-browser{,-b,-diagnostic}.log` and
`48-reload-diagnostic.png`. The locator-based Reload attempt delivered **zero
click events**. A direct selector pointer click on the same visible button
performed Reload and passed all assertions. The initial composition harness
also waited for network idleness despite persistent event streams; its successor
uses document-load and explicit hydrated/visible UI readiness. No production
change or weakened behavioral assertion was used for these harness corrections.
`48-composition-{a,b,c}.log` retain those initial runs: the first timed out at
network-idle, the second clicked reveal before hydrated readiness, and the third
assumed question reveal itself persisted across reload. The durable answer/image
assertions had passed; the final harness uses the existing reveal control again
after reload and requires the same restored answer before explicit submission.

#### Remaining handoff and owner acceptance

1. Parent/owner resolves isolated subscription sign-in/ownership and explicit
   background-role consent. Preserve the selected model/thinking settings and
   authorized dictation key in the isolated configuration; do not silently
   substitute another provider. No agent inference test is authorized.
2. Recheck all listeners/cwd/env paths and mappings; refresh the data backup if
   the owner has written more working. Replace only verified #45 slot2 with the
   retained reviewed build using the supported background lifecycle and strict
   `127.0.0.1:3001`, existing review data, and resolved isolated auth owner.
3. Verify **actual integrated HTTPS** app identity, manifests/icon and Reload
   with non-read/live paths blocked, then record deployment task/PID/log/data/
   build/source and update the ledger/handoff record. Intended URL remains
   `https://thinkpad.tailfd9bf6.ts.net:8445/chat/handwriting_review_teach`.
4. Owner installs/opens via **Safari → Share → Add to Home Screen → Open as Web
   App → Add**, if needed; existing installed identity is retained. Review on the
   physical iPad Air/Pencil 2: ordinary/teaching/practice/drill speech+writing,
   Attach/review/explicit Send; sent Open/set-aside/reload/revise; Restore Undo/
   Redo and independent stages; figure annotation/reload/submit; palm/tools,
   portrait/landscape layout, Expand/Back, keyboard/dictation Stop/review, scrolling
   and pinch zoom. Record actual tutor understanding and learning verdict.

Do not mark physical #48 or broader #4/#44 complete from these automated results.

#### Completed #48 adapter composition

All five real input paths passed with scripted tutor/speech:

| Path | Completed case evidence |
|---|---|
| Ordinary conversation / teaching free-text question | `48-composition-d.log` |
| Practice | `48-composition-e.log` |
| Drill / teaching choice question | `48-composition-f.log` |

Each case draws an actual pen stroke, finalizes scripted speech through **Attach**,
checks visible image review and durable finalized explanation after reload, and
asserts **zero tutor POSTs before explicit Send** and exactly one on Send. The
real handler/store records the intended image plus explanation and submission
receipt, retires pending state, and preserves the frozen source. The choice case
also refuses a new answer until a choice is selected despite image+speech.
`48-composition-completed-adapters.json` additionally verifies every retained
canonical input and immutable PNG/source against its bundle SHA-256 manifest.

Successful cases were retained rather than rerun after later harness failures.
The `d` run's next case typed before draft initialization; `e` completed practice
then timed out on network-idle for drill; `f` completed drill/choice and reached
figure/session reopening, where the harness clicked Write after automatic notebook
restoration had already hidden it. The corrected helper waits for the existing
visibility-restoration contract and uses actual notebook readiness before editing.
These are retained test-harness diagnostics, not reported production defects.

`48-fixture-equivalence.json` verifies all 357 application files in the composition
fixtures: the sole application substitution is the explicit **faux provider route**
from the established mobile runner; the real chat handler, stores, adapters and
notebook remain exact reviewed production. The extra native-adapter fixture and
environment-only Turbopack root are recorded. No live credentials or `.env` files
are present. Runner source: `48-{generate-runner,composition-runner,composition-body}.mjs`.

#### Completed figure composition and software-check disposition

**Software composition checks are complete.** Machine summary:
`48-composition-results.json`, combining the five adapter cases above with
`48-composition-h.log` and the successful `48-figure-continuation.log` /
`48-figure-continuation.mjs`. The actual fixture is
`mobile-input-browser-48-composition-h`, with the same byte-verified production
modules and scripted provider boundary.

The real figure flow imported a tutor SVG, drew actual ink, left for an empty
other session, reopened/reloaded, verified the same head and original figure,
continued ink, then attached and explicitly submitted. The first frozen source
contains an independent background and **two actual stroke events**. Further
working and an independent copy were then created through the ordinary UI.
The completed continuation uses that retained native-IDB/server fixture: sent
snapshot Open shows all four exact choices; Open current selects the original
working; reload and Pages restore the exact set-aside copy head; a later Attach/
Send submits the revised original page. Both canonical submissions, both immutable
PNG/source manifest hashes, and the unchanged original SVG are verified.

The initial figure runs `g`/`h` timed out entering the sent image menu. A narrow
read-only actual-pointer check (`48-menu-isolation.{mjs,json,log}`) successfully
opened it and recorded the button as the actual click target. The continuation
waits for the actual image to decode and verifies hit geometry before clicking;
the full remaining flow passed with zero runtime errors. The earlier missed
activation's exact cause is not established; no production defect or fix is
claimed. Original failures/screenshots remain retained.

The final isolated fixture server was task `sh_1ac2980250017p3ynYiiRxvKOt`,
PID38680, strict localhost3129. Its exact cwd/data/auth identity was verified and
only that process stopped after the checks; final check task
`sh_1ac2b849b001jIRPu0jxZ3kxf0` completed successfully. No required test remains
running. Application source is unchanged, no live calls were made, and no issue
was closed or branch pushed. **Public deployment/live configuration remains
blocked on the parent/owner decision above; physical iPad acceptance remains
pending.** The retained #45 HTTPS launch is not advertised as the new integration.

### #48 approved isolated sign-in and completed slot-2 deployment — 2026-11-05

This entry supersedes the earlier configuration/deployment blocker. The owner
approved the exact question: **“May I publish the integrated preview to the
approved slot 2 with its own isolated configuration, then have you complete a
separate ChatGPT sign-in on the host laptop? Your chosen models and dictation
setup will be retained, with background model use disabled for the trial.”**
Answer: **“Approve separate sign-in.”** No new application code was needed.

#### Deployed identity and preservation

- **Tested integrated launch:**
  [teaching review](https://thinkpad.tailfd9bf6.ts.net:8445/chat/handwriting_review_teach).
  Practice and drill remain in the session list at the same origin.
- Independently approved source `86dff1dd55d757fe34b334d0e8c45e36753a8ce7`;
  predeployment integration receipt `29ccc91ecb142c205776778c5316f766be37bac3`.
  Fresh equivalence check: all **357 application files** match retained
  `/home/bjorn/.cache/opencode/issue4/build-47-r5`, build
  **`FK05t14TT6OZj5Z_ygK_h`**. Established build-only Turbopack root variation;
  no `.env` files or application delta.
- Production: strict **`127.0.0.1:3001`**, PID **66702**, background shell task
  **`sh_1ac3e5a89001FQJqIIUVxdR6bS`**, cwd the retained build above. Log:
  `/home/bjorn/.cache/opencode/issue4/48-slot2-production.log`.
- `LH_DATA_DIR=/home/bjorn/.cache/opencode/issue45/review-data`;
  `LH_AUTH_FILE=/home/bjorn/.cache/opencode/issue4/48-review-auth/auth.json`.
  Launch uses `npm run start -- --hostname 127.0.0.1 --port 3001` in a clean
  environment containing those paths, HOME/PATH and disabled Next telemetry.
- Immediately before stopping, all three listeners, cwd/config paths and
  Tailscale mappings were rechecked. Only verified #45 PID3484369 was stopped.
  Slot1 PID4152830 and slot3 PID4154558 remain unchanged, as do all tailnet-only
  mappings on 443/8443/8444/8445/8446/8447.
- Refreshed byte-verified rollback copy:
  `/home/bjorn/.cache/opencode/issue4/48-review-data-handoff-backup`.
  All original review files remain byte-identical after deployment/verification;
  the only added review file is the authorized `settings.json`. The old #45
  build, earlier backups and lesson-navigation restoration instructions remain
  preserved at `/tmp/opencode/issue45-preview-slot.md`. Do not overwrite newer
  owner working with a historical backup during any later rollback.

#### Isolated configuration and sign-in gate

The new subscription owner is exclusively
`/home/bjorn/.cache/opencode/issue4/48-review-auth` (0700); credential files are
0600. **No ChatGPT/native refreshable credentials were copied or shared.** The
actual supported `createChatGPT().consent(false)` operation initialized and
validated the isolated store with **`allowBackgroundUse:false`**, no registrations
and no active account, using a refusing network adapter. Persisted file state
and both local/HTTPS read-only subscription status confirm background is off,
sign-in is available, and no login is pending. No sign-in was initiated.

The existing model/thinking settings were copied byte-for-byte from the owner's
main settings: strong ChatGPT `gpt-6.1-sol` / medium; cheap `gpt-6-luna` / medium;
vision `gpt-6-luna` / high. There are no background-role overrides or review-session
model overrides. The actual resolver verifies all six helper roles resolve to
ChatGPT and are therefore subject to the disabled background consent. No model
API keys or other subscription credentials were installed. Main settings and
credentials were not changed.

Only the authorized **Deepgram dictation key** was securely copied into isolated
auth and verified present/equal without displaying it. Dictation configuration is
present; **no live speech or model test was made**. The app is intentionally
disconnected pending the owner's host-laptop login, not yet a verified live tutor.

**Owner host-laptop steps:** open the tested HTTPS link in a browser on the machine
running LearnHarness, then **Settings → Providers → ChatGPT → Connect**. Leave
**“Allow background use for all ChatGPT accounts” off**, select **“Continue with
ChatGPT”**, and complete the provider sign-in in that host browser. The current
connection notice explicitly requires the same machine; do not perform this
callback step on the iPad. Labels/behavior are grounded in
`components/settings/settings-dialog.tsx`, `chatgpt-connection.tsx:11,273–310,317–322,336`.
The owner then resumes iPad review. Background helper calls remain disabled for
this trial even after foreground sign-in.

#### Completed actual HTTPS verification

Authoritative machine handoff: `/home/bjorn/.cache/opencode/issue4/48-deployment.json`.
Supporting evidence in that cache: `48-review-configuration.json`,
`48-handoff-{before,after}.json`, `48-handoff-{before,after}.log`; reproducible
read-only browser runner `48-handoff-browser.mjs`.

The **actual new HTTPS app** passed Pages identity, teaching/practice/drill page
responses, session-scoped manifests (`id`, `start_url`, `scope`, standalone),
Apple metadata and all icon responses. Identity/assets equal the immediately
preceding #45 HTTPS baseline. Owner saved ink pixels match before/after deployment
and after the real **Notebook options → Tools and help → Reload preview** action.
No service workers were registered. Browser runtime errors: zero.

Browser interception allowed same-origin GET/HEAD only and blocked speech-token,
extraction and non-read paths; evidence records blocked automatic STT requests
and a working PUT. This intentionally read-only check leaves original server data
unchanged; it does not substitute for owner writing/dictation/tutor trials.
All assigned checks have completed; only the intended production preview remains
running. Ledger/restoration records now identify this deployment.

Physical iPad Air/Pencil2/palm/tool/orientation/keyboard/dictation and actual
tutor-learning verdict remain pending under #48. Existing Home Screen identity
is retained; if installation is needed use **Safari → Share → Add to Home Screen
→ Open as Web App → Add**. Reload retains saved working. #4/#44/#48 remain open;
S1 keyboard reachability remains owner-deferred to #51. No push or live inference
acceptance is claimed.
