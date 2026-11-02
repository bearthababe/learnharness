# Notebook #28 — bounded architecture correction

Status: owner approved this complete plan and authorized implementation on 2026-11-02 ("Approve and implement").

Scope: correct the integrated Notebook delivered through #26, then finish #28 acceptance. The baseline is `274f2a9`; the original combined review compared against `f65d108`. #27 (Apply on Stop) was removed by the owner.

## Agreed design

### Superseding policy — settled handoffs (owner approved 2026-11-02)

The owner approved simplifying the interaction instead of supporting arbitrary
overlap. This section supersedes conflicting queue/pending-return requirements
below and in the earlier speech-context extension.

- A recording belongs to one destination. Switching finalizes it before the
  destination changes; recording never starts automatically in the new pane.
- Finalization still interprets commands in that original destination. A delayed
  spoken Apply runs under the same one-edit-at-a-time rule before the switch
  completes; an earlier command covered by a clicked Apply is absorbed as usual.
  The owner explicitly approved the potentially longer finalization wait.
- One Apply at a time; recording may continue in Notebook during that edit.
  Further spoken Apply commands are consumed but never queued. Preserve later
  instructions and show “Still applying. Apply again when finished”.
- Undo and Start fresh also require the current edit to finish; neither queues
  behind it. This explicitly supersedes the earlier Start fresh waiting rule.
- Returning to Tutor waits for transcription and requested work to settle,
  then inserts a completed immutable snapshot. Failures return the learner to
  review rather than silently completing a handoff.
- No queued Send. Dictation and editing finish first. Keep the submitted draft
  fixed until acceptance/failure, preserving exact retries after unknown ACKs.
- Interruption restores known words and completed working for explicit review.
  Stop never authorizes an edit or Tutor submission.

Implementation reuses the existing capture finalization, session observable,
executor and native submission seams. Replace live cross-destination routing,
new pending-return checkpoints and waiting Send preparation with these gates.
Read legacy accepted operations/recordings without replaying new commands.
Exercise actual controls, request parsing, persistence and capture interfaces.

The superseded experiment is retained at local source ref
`prototype/notebook-overlap-experiment` (`3d82ff4`). It is historical evidence,
not a pending implementation to merge.

- Notebook owns mathematical working and edits. Tutor owns native messages, answers, practice thinking and steering.
- A small integration module owns Tutor draft preservation, chronological snapshots and preparation for explicit Send. Reuse the substantial existing draft implementation rather than wrap it in another layer.
- One source-time timeline determines speech ownership. Focus changes and Apply cutoffs are separate facts; returning to Notebook must not freeze an obsolete draft identity.
- Persist resolved words and pending requests using existing recovery checkpoints. Reload interrupts recording and restores known words; historical speech replay is outside this correction. Return any demonstrated checkpoint-evidence gap to the owner before implementation.
- Keep one Apply action. Simplify its existing internal steps and centralize existing state rules; preserve continuous recording, queued edits, Undo and recovery.
- Acceptance exercises actual controls and request parsing through saved Tutor context, with deterministic external providers followed by bounded real-provider checks.

The interview rulings are recorded in `/tmp/opencode/notebook-integration/owner-decisions.md`. Earlier accepted behavior remains authoritative: word-start ownership, clicked Apply absorbing a delayed earlier spoken Apply, finalized-prefix coverage, immutable snapshots, explicit retry after unknown provider completion, and Stop revealing remaining text without requesting an edit.

## 1. Content preparation and native submission

Refactor `components/notebook-tutor-drafts.ts` in place as the draft/snapshot integration module. It already owns reservation, persistence, pending-working waits, frozen submission identities and acknowledgment reconciliation.

Proposed results:

- `PreparedNotebookContent`: `{ text, explanation, submission }`, using existing explanation and submission-reference contracts.
- `PreparedNotebookAnswer`: `{ answer, submission? }`, preserving distinct answer and reading-thinking content and the existing single submission ID plus optional `additionalDrafts`.

These results contain content and references, not native action discriminants or destination routing. `chat.tsx`, `practice-dock.tsx`, `question-dock.tsx` and `session-core.ts` retain native action construction and eligibility. At request construction, copy the specific attachment fields rather than spreading an arbitrary prepared object. A narrow TypeScript parameter alone does not strip runtime properties.

Keep exact retry content and identity. Internally distinguish frozen content from frozen answers with a content-only discriminant. Decode existing locally saved `type: text` / `type: answer` frozen records into the new representation, preserving IDs, owners, revisions, answer fields and pending draft consumption. Retain the existing recovery storage keys. Verify legacy saved records as well as new ones; opening recovery never authorizes Send.

Done when actual ordinary Send, busy steering (including settle-race fallback), teaching answer/reading and practice/drill controls reach the real parser with the correct native type and preserve submitted content and receipt identity.

## 2. One live speech ownership timeline

Add `src/core/notebook-speech-timeline.ts` for the deterministic ownership calculation; `components/notebook-speech.ts` keeps capture callbacks and persistence coordination. The existing provider/microphone implementation stays authoritative.

Inputs are the initial Notebook draft, source-timed focus destinations, Apply draft transitions and timed transcript results. Tutor destinations retain their explicit owner/draft/part identity; Notebook focus events refer to Notebook rather than copying its current draft ID. Resolve the active Notebook draft from Apply cutoffs at each word's start time.

Use that same calculation for fragment placement, selecting Apply instructions and identifying the click covering an earlier spoken command. Remove the parallel mutable current-draft interpretation. Keep finalized-prefix coverage and command recognition consistent with ownership before releasing an instruction for execution. Preserve existing source-time boundary semantics and stable capture order for tied events; any uncovered conflicting same-time behavior requires a concrete owner question rather than an invented precedence rule.

Follow-up owner decision: spoken commands take effect only after preceding audio is finalized and their destination is known. This replaces provisional spoken-Apply reservation before earlier audio arrives. Recording continues, clicked Apply stays explicit/immediate, and affected returns/Send visibly wait. Checkpoint requirements for a return while speech context remains unresolved must be verified before implementing that part.

Save the resulting owned fragments and accepted Apply checkpoints in existing shapes. Historical persisted data retains its saved ownership; unavailable original timing is not reconstructed by inference.

Done when the delayed Apply → Tutor → Notebook reproduction retains later words in the next Notebook draft, and event-order checks cover crossing words, focus roundtrips, mixed/repeated Apply, silent/gapped coverage, command exclusion, snapshot placement, duplicate delivery and supported interruption points. Tests must distinguish the approved delayed-command click absorption from cases where separate edits were already accepted.

## 3. Small, owned Apply implementation

Add `src/core/notebook-operations.ts` to own existing operation predicates and deterministic transitions, including retaining failed instructions and completed-working checkpoints. Keep scheduling, store transactions and provider calls in `src/server/notebook.ts`. Split its overloaded handling into clearly named internal functions for reservation, transcript updates, completion and recovery; retain the public Apply action and existing saved statuses.

Distinguish outstanding work, runnable work and paused work. Awaiting transcription blocks later execution and cannot be treated as settled by direct snapshot capture. Returning while requested work is outstanding uses the established pending-snapshot path.

Preserve subtle existing distinctions: a paused queue head can coexist with later outstanding work; waiting Undo/Start fresh survive failure recovery; saved results commit without a new provider call; unknown completion needs explicit retry; finalized empty Apply can complete without an editor call.

Move pure draft/snapshot transformations and `NotebookDraftConflict` from `src/server/notebook-drafts.ts` to `src/core/notebook-drafts.ts`. Move pure speech placement from `src/server/notebook-speech.ts` into existing `src/core/notebook-speech.ts`. Update imports and remove obsolete server implementations. Storage remains session-colocated and atomic. The Notebook editor/executor does not acquire Tutor action semantics.

Done when all consumers use the shared lifecycle rules and existing failure, pending-Send cancellation, recovery, Undo and Start fresh checks pass through those transitions.

## 4. Bounded maintenance

- Coalesce event-triggered refreshes with the documented approximately 250ms trailing debounce; retain immediate mount/reconnect refresh and POST-receipt adoption. In the session module, allow one refresh request in flight and track invalidation during it so a trailing refresh cannot be lost. Cancel pending timers at cleanup and preserve revision rejection.
- Add an application-written Notebook golden fixture with saved working, a retained draft, snapshots and a submitted explanation. Proposed capture uses an isolated data/auth profile and scripted external providers, exercising production writers; copy the resulting file byte-for-byte and record provenance. Preserve legacy fixtures. This capture method is part of the plan requiring approval.

Done when burst/in-flight notification tests prove eventual current state with bounded concurrent reads, and the production read path validates both legacy data and the new Notebook fixture. Storage-volume optimization is not justified without measurement.

## Execution and acceptance

1. Reproduce the two confirmed bugs as failing regression tests. Practice tests must exercise Chat's actual callback; steering tests must reach the actual route parser. Existing tests that reconstruct corrected requests or bypass parsers are insufficient.
2. Implement one failing slice at a time. Keep external provider substitutes at their existing seams; retain real controls, request construction, parsing, persistence and context rendering. Reuse existing mounted React, SessionModel, route, isolated-store and faux-provider harnesses.
3. Cover each native activity plus meaningful failure/race cases: lost acknowledgment and exact retry, pending Send, edit failure/clarification, navigation/reload, later drafts surviving earlier receipts, delayed speech and Stop during an already-requested edit. Speech-order tests exercise deterministic permutations of relevant events and assert ownership/content invariants.
4. Run the full suite, typecheck, lint, production build and diff checks after focused regressions pass. Review the combined correction for standards, approved behavior and reduced caller responsibilities.
5. Reuse existing delivery evidence and run the remaining combined actual-app flows under the shared allowance in `/tmp/opencode/notebook-integration/live-budget.md`. Record software, real-provider, emulated-mobile, physical-phone and learning results separately. Preserve the preview's URL, data and ownership.

Completion requires actual-path evidence for every activity and compatibility/recovery checks, not merely a passing aggregate test count. #28/#18 remain open until physical iPhone/Home Screen and owner learning acceptance occur. Any new behavioral ambiguity or missing durable evidence returns to the owner before implementation continues.
