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
Independent Standards review **remains pending**: the code-review skill's
subagent call was refused with `Subagent depth limit reached (1)`.

#### Spec review

Self-review against the complete approved plan found and corrected the three
boundary defects above and missing speech target/review-freezing guards.
No additional product choices were introduced. #47 retains Pages/Open/Restore/
Duplicate/import UI ownership, using the supplied graph/source contracts.
Independent Spec review **remains pending** for the same harness depth limit.
The parent should review `git diff e0035d4...implement/handwriting-46` before
declaring the integration review gate complete.

Existing partial server-deletion cleanup limitations are retained as approved;
normal bundle deletion and late-upload refusal pass. The full repository suite
was not rerun: #45's documented baseline failures are not claimed fixed. Automated
checks used isolated data and deterministic providers/speech; no live spending.

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
