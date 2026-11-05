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
| Standards S1: manual recovery controls unreachable under the Tab trap | Submission Check/Retry/disclosures removed per owner approval. App-controlled Tab + ordinary Enter/Send now reconcile/retry the original payload and retain newer edits. **Remaining clarification:** existing upload Retry/Refresh and image-thumbnail viewer entry still have no approved keyboard-only entry route; parent guidance requested, no shortcut or Tab contract invented. |
| Standards H1: English notice substrings determine controls | Typed attachment notice kinds expose explicit retry/refresh capabilities; one mapping owns wording. Source/image size errors and changed-review failures use typed errors, not English matching. |
| Standards H2: duplicated full-page PNG validation | One browser-safe core byte predicate is used by import and multipart upload; canonical base64, hash, transport limits and error responses stay at their boundaries. |

Red/green evidence: `46-review-fixes-red.log` reproduces speech retargeting,
normal-Send retry rejection and missing canonical-obsolescence handling;
`46-review-fixes-green-progress.log` passes those boundaries. Added coverage also
proves Send discovering an already-accepted receipt dispatches nothing and
retains newer edits. Browser corrections use actual target replacement and the
app keyboard path, native IndexedDB, actual HTTP/store handlers, scripted speech
and deterministic providers.

Correction verification:

| Check | Result / cache-root evidence |
|---|---|
| Focused actual-hook/controller/store/server tests | **182 passed, 0 failed**, `46-review-focused-final.log` |
| Typecheck, lint, diff whitespace | Passed; `46-review-typecheck-final.log`, `46-review-lint-final.log`; `git diff --check` |
| Disposable production build | Passed; `46-review-build-final.log`. Existing dynamic tracing warnings; environment-only `turbopack.root` in the disposable copy. |
| First correction mobile browser run | Passed; `46-review-browser-mobile-1.log` |
| Final mobile browser rerun | **Passed**, `46-review-browser-mobile-3.log`, including original A review/viewer while B is pending and canonical reads fail. Previous run timed out before transfer scenarios: 30-second ready wait versus 31-second cold compilation; retained in `46-review-browser-mobile-final.log`, `mobile-input-browser-46-review2/server.log`. |
| Final handwriting browser run | First nine scenarios passed; exported-background assertion failed because captured source contains two **pen** strokes, not pen then eraser. Offscreen background pixel is correct. Five targeted tool-activation runs passed (`46-eraser-click-diagnostic.log`). Test now waits for Eraser's selected state before the next stroke; full rerun in progress. Original evidence: `46-review-browser-handwriting-final.log`, `handwriting-browser-VcaswB/`. |

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
