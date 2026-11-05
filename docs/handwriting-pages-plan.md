# #47 — approved Pages, Open, Restore, Duplicate and import plan

**Owner-approved for test-first implementation under #4.** Approved source:
`/tmp/opencode/issue4-reopening-plan-proposal.md`, SHA-256
`7f1c846802e295d53d1007ef9c44ca4c0221f53a9cc52278fe82e3d812cc2c65`.
[Recorded approval](https://github.com/bearthababe/learnharness/issues/47#issuecomment-6643146989).
The source proposal's planning-only/proposed/final-approval-pending language is
historical and superseded by this approval. This promoted contract carries its
settled decisions, implementation boundaries and acceptance gates below.

Dependency #46 is integrated: `ea74759` via `8b0000a`, with all final independent
Standards/Spec gates passing. #47 starts at `117bdcf`. The authoritative receipt
is [integration verification](ipad-notebook-integration-verification.md); retain
all earlier delivery and approval history there. #48 owns integrated physical
iPad acceptance. #44 gestures, polish, smoothing and native work are separate.

## 1. Authority and latest amendments

Follow root `AGENTS.md`, `docs/architecture.md`, `docs/keyboard.md`, installed
Next guides and the global preview/mobile workflow. Retain #45 recovery and
mounted layout/input behavior. Reuse [#46's shared source/history contract and
latest owner amendments](handwriting-submission-plan.md), with no second schema.

- Automatic submission reconciliation/status and ordinary Send/Submit only.
  Definite refusal returns to normal editable fields; preserve newer edits.
- Capture a recovery action's identity before speech finalization. Resolution
  during the wait ends that action; it cannot fall through to new input. Saved
  choice recovery remains eligible despite a newer empty selection.
- Saved Attach captures recover automatically on reopen/reconnect; ordinary
  Attach retries exactly the existing capture before any new freeze. Stop at
  review, never automatically Send. No upload Retry control.
- Shared remount ownership spans precommit preparation and durable discovery.
  The native terminal fence prevents retired captures from being resurrected.
  Page/session changes invalidate view callbacks, not frozen capture identity.
- #47 working-page background sync Retry remains distinct from those controls.

### Owner clarification after independent review — 2026-11-05

Standards finding **S1 is deferred, not fixed, and does not block #47/#48**.
The owner assigned new keyboard reachability/navigation, bindings and shortcuts
to the app-wide overhaul in [#51](https://github.com/bearthababe/learnharness/issues/51),
recorded on [#47](https://github.com/bearthababe/learnharness/issues/47#issuecomment-6657588270).
No new binding, Tab cycle or menu-arrow navigation is authorized in this delivery.
The existing one-Escape/topmost-surface dismissal contract remains in scope:
Pages/options own dismissal independently of chat focus, preserve Pencil/typing
behavior, and restore trigger focus. This clarification does not reopen the
approved storage, activation, cancellation or #46 recovery contracts.

### Owner-approved N1 correction amendment — 2026-11-05

The owner explicitly approved a small shared Escape-ownership stack for open
notebook and snapshot menus: the most recently opened nonmodal menu closes first
regardless of focus. Native dialogs retain priority; focus returns to the closed
menu's trigger. Verify overlapping menus alongside the existing Pencil/dictation
behavior. This is the narrow topmost-dismissal correction, with S1 still deferred
to #51 and no new bindings, Tab cycle or menu navigation.

R4 applies the existing reconciliation-before-edit rule: a known compatible
incoming history must remain retained after failed native adoption, and the stale
ancestor must not accept new edits until reconciliation and durable adoption
succeed. This includes compatible creation responses; genuinely reconciled
device-first working and already-admitted completed strokes retain their existing
guarantees.

## 2. Settled behavior

One Open flow for pending and sent source-backed snapshots finds the original
working page by stable pageId. Equal canonical editable content opens existing
history unchanged, including Redo. Different content offers exactly, in order:
**Open current working / Restore snapshot / Open snapshot as copy / Cancel**.
No automatic replacement or per-writingId resumed-page mapping exists.

Restore appends one undoable destination edit, preserving displaced working and
the source's entire graph. Undo later edits first, then Restore; reload and Redo
retain those boundaries. Copy/missing-original creation select the exact source
head with its native Undo/Redo. Only explicit copy/Duplicate creates another page
when the original exists. Snapshot Duplicate copies the exact snapshot; header
Duplicate copies current working. Both open independent Pages without Attach.

Attach replaces only the same working page's unsent head. Other pages' pending
images and all submitted bytes remain unchanged. Stable page identity survives
editing, import, Clear, Undo/Redo, Restore, Attach and navigation. No page action
sends tutor input or implicitly finalizes/retargets dictation.

## 3. Page identity and shared history

`NotebookPageId = page_initial | page_<UUID>`. V1 normalizes to page_initial.
`HandwritingPage = {version:1,id,origin,createdAt,journal:HandwritingV2}` with
`id === journal.pageId`. Initial metadata is always working/null, including safe
recreation. Other pages get one ISO creation time at local commitment, retained
by the server; it orders display only, never causal precedence.

`PageOrigin` is working; recovered `{writingId}`; external
`{writingId,seedHead,seedFingerprint}`; or duplicate
`{from:{kind:'working',pageId}|{kind:'snapshot',writingId},seedFingerprint}`.
`PageSummary = {id,origin,createdAt}`. Titles, thumbnails and order are derived.
Only unbound external PNGs map by external origin writingId: zero matches allows
creation, one identifies the original flattened page, multiple means corruption.
No separate mapping file; duplicate never becomes that external mapping.

Use #46 V2 `{version:2,pageId,head,events,backgrounds}` unchanged. Events retain
stable IDs and causal parent; kinds stroke, clear, import-background, restore,
undo, redo. Restore sourceHead refers into unioned immutable tables; conflicting
definitions fail. Validate complete closure, finite DAG and exact assets. No
recursive journal copies, frame snapshots, pruning or invented V2-array/V3
migration. Parent-only ancestry determines retries/extensions; source reachability
does not. Shared sourceFingerprint covers canonical complete source; separate
contentFingerprint covers ordered editable strokes/background, excluding IDs,
history, theme and viewport. Different editable structures can differ despite
identical-looking raster pixels. Copies rebind only pageId.

## 4. Open and guarded actions

Bind preparation to exact chatId/writingId and validate immutable source and
metadata agreement. Reconcile original device primary/recovery/IDB and known
server state before comparison. Failed/corrupt reads are never absence. Preserve
outgoing working too. Loaded reconciled pages switch locally while sync is pending.
Cold targets require successful reads. A source page_initial is not virtual blank.

Mismatch decisions bind to the examined original head. Refresh/re-prompt if it
changes; never rebase Restore silently. Prepare one stable event or seed. Genuine
absence on both device and successful server read permits same-pageId recovery;
recheck absence at both commits. Local-only working is an existing original and
must be preserved. Concurrent server creation returns existing working intact,
then reconciles/compares; retain conflicting local candidates visibly blocked.

External Open creates/finds its unique flattened original and compares against
its immutable retained seed using the same choices. External Duplicate need not
create the mapping. A promised-but-corrupt editable source never falls back.

## 5. Server persistence

Retain `handwriting/<chatId>.json` for initial V1/V2 journal; synthesize its wrapper.
Other pages: `handwriting/<chatId>/page_<UUID>.json`, full wrapper/closure. Atomic
exclusive-temp→rename updates; no per-stroke catalog rewrite. List summaries only.
Permanent corrupt files fail explicitly; ignore only owned temporary filenames.

Extend HandwritingStore with listPages/readPage/createPageIfAbsent/savePage. Core
owns policy, adapter owns filesystem, existing composition wires it, routes stay
thin. Existing GET/PUT handwriting remains initial-only. Add GET pages and GET/PUT
pages/:pageId; POST pages receives `{page:<frozen seed>,creation:{id,kind:
'duplicate'|'recover'|'external',seedFingerprint,from}}`. Return 201 created,
200 `{existing:true,page}` unchanged or 409 conflicting identity. PUT extends
existing causal history, never recreates noninitial pages. Restore uses ordinary
ordered PUT, no separate mutating protocol. Snapshot seeds validate against
authoritative source or validated flattened preparation. Working-copy seeds may
be ahead of source server ACK. Retry frozen seed before queued tail, never recapture.

Private/no-store responses and existing session guards; recheck session after
awaited parsing/validation immediately before synchronous effects. Statuses 400
invalid, 404 session/image unavailable or explicit page_not_found, 409 conflict,
413 bounded import/source payload, 503 unavailable. Preserve working capacity:
25 MiB source attachment limits do not silently cap autosave/Restore/Duplicate.

## 6. Device durability and transitions

Native IDB `lh-handwriting-working`, version 1, separate from transfer recovery:
backgrounds `[chatId,backgroundId]` immutable verified full-page PNG Blobs; pages
`[chatId,pageId]` compact wrapper/full graph with asset IDs; sessions chatId with
version/generation/deleted/activePageId; pageActions `[chatId,actionId]` with
kind/pageId/writingId?/expectedHead?/eventId?/seedHead/seedFingerprint and state
local-committed/syncing/failed. Frozen seed closure stays reachable in page graph.

Synchronous compact keys `lh:handwriting:pages:v1:<chatId>:<pageId>` and guarded
secondary `lh:handwriting:pages:recovery:v1:<chatId>:<pageId>` contain no PNG base64.
Persist/verify assets before referencing edits. Hydration validates hashes,
dimensions and closure; missing/corrupt data blocks editing/capture. Completed
stroke/Clear/Undo/Redo writes and rereads primary immediately, then checkpoints
IDB/server. Keep admitted strokes through late blocking ACKs using secondary
recovery. Never erase newer tails. Legacy keys continue to be checked and retained.

Actions are admitted at completed-stroke boundaries after short #46 capture
preparation settles. Prepare/decode offscreen. Suspend controller mutations,
check compact recovery, then atomically recheck generation, active pointer and
causal heads; store outgoing/target/assets/action/selected pointer together.
Transaction completion is acceptance, not request success. Before commit failure
leaves page set/display unchanged and starts no server mutation. After commit,
mirror compact storage, activate and unlock; mirror/render failures report honest
device-saved status. Background sync retries the same immutable operation/seed.
Never mint another copy or Restore on retry. No per-switch network ACK gate.

R5 lifecycle clarification: the frozen creation seed includes its original
descriptive metadata and identity, not only its graph closure. If a compatible
existing original changes that metadata, adopt it and retire the accepted
creation action in one native transaction. Abort retains both the original
wrapper and outstanding action for identical retries; committed adoption leaves
no stale creation to regenerate. Queued tails then save with reconciled metadata.
This uses the existing persisted page/action schemas and server validation.

Sync failure: **Saved on this device; couldn’t save to LearnHarness**, with Retry;
automatic 5-second/online/focus/visible retry remains. Local divergence retains
both versions and blocks unsafe edits. Reload uses committed pointer/history,
including unacknowledged Restore Undo/Redo. Precommit interruption has no action.
After commitment cancellation cannot undo acceptance; ordinary Undo reverses Restore.
Losing browser storage before sync can lose local-only work; no concurrent/offline
app guarantee. Generic 404 keeps recovery. Successful deletion invalidates first,
tombstones and purges all owned old/new data. Retain existing server deletion order.

## 7. Import and rendering

Successful tutor caption exposes **Annotate in notebook**. Decode via
svgImageSource as an image document, never application DOM. Original SVG/download
unchanged. Rasterize lossless independent background on 1400×1800 white paper,
scale min(1240/naturalWidth,760/naturalHeight), centred x, y=80. Empty admission
requires no replayed strokes AND no background, before prep and at commit:
**Import needs an empty page. Clear this page first, or choose an empty page in
Pages. Clear can be undone.** Import/Clear are undoable/redoable. Eraser affects
ink only. Malformed/tainted/decode/export failures leave working unchanged.

External PNG is whole-image centred aspect-contain with white letterbox/no crop;
same size is 1:1. Resampling is not original-resolution preservation. Display
**Flattened image · original marks cannot be erased**. Seed has one import event,
no invented original strokes. Original upload remains immutable and unbound.
Source-backed copies/restores retain exact coordinates/pressure/colours. Shared
renderer paints white→background→ink/highlighter (.35/multiply), including
offscreen content. Theme filters never enter PNG/source/thumbnail bytes.

## 8. Exact minimal UI

Header: Notebook | Attach snapshot | Pages | Expand / Back to question |
Close notebook (phone Chat) | ⋯. **Notebook options** menu: Duplicate, separator,
Tools and help. Adjacent Undo/Redo retain Pencil release-inside/cancel/click
suppression. Help: **Working, Undo and Redo save automatically. A new edit clears
Redo.** No new shortcuts. Options/Tools/Pages mutually exclusive; narrow wrapping.

Pages panel: Pages, Close pages, bounded internal scroll; 140×180 thumbnails,
Page N (initial first, then createdAt/ID), Current; Copy of Page N / Copy of
snapshot / Recovered from snapshot / Flattened image subtitles. In-memory
head/graph thumbnail cache, no persisted ledger. Failed reads are retryable.

Snapshot card sibling **Snapshot actions** outside image button; viewer header
Handwritten working | ⋯ | Close. Menu: Open in notebook, Duplicate; helper
**Duplicate opens an editable copy. It is not attached.** Dialog: **This page has
changed**; **The current editable working differs from this snapshot. Choose what
to open.** Four full-width choices from §2. Restore helper: **Keeps this page. Undo
can bring back the working it replaces.** Copy helper: **Creates a separate page
without changing the original.** Neutral initial focus, Escape/backdrop cancels
before commit. Reuse viewer modal ownership, no competing stacked dialogs.

Successful snapshot action reveals phone Write/tablet split, closes viewer, no
automatic Expand. Header Duplicate/Pages retain expansion. Copy/Restore starts
at top; current working returns to per-page split/full reading positions. Retain
mounted tools/canvas/drafts/dictation and mobile native focus/scroll/pinch rules.
Close menus returns focus to trigger; no repaint/layout changes mid-stroke.

Progress: Opening page… / Restoring snapshot… / Duplicating page…. Precommit:
**Couldn’t save the current page on this device. It is still open. Retry before
switching.** / **Couldn’t load this snapshot’s editable history. Your current page
is unchanged.** Postcommit activation failure: **Page saved on this device.
Couldn’t finish opening it.** Retry same committed action. Success: **Snapshot
restored · Undo available** / **Copy opened · not attached**. Keep existing
Keep-this-page-open warning when neither location saved work.

## 9. Approved implementation seams

Shared core handwriting engine plus handwriting-pages/barrel/ports; existing
store/server handwriting and thin page routes; pages-device plus recovery/device;
notebook/session/pages/CSS; shared-writing card/viewer and existing figure caption
through small Chat context hook; shared #46 renderer/capture/source. No second
matching/history/attachment system. Tests use these owner-approved public seams.

## 10. Required acceptance gates

1. Pending/sent Open original; content match leaves history/Redo untouched;
   history-only versus editable-structure differences; all exact four choices;
   no resumed-page accumulation or submitted-byte changes.
2. Displaced background/history Restore S→stroke X→Undo X→Undo Restore→reload→
   Redo Restore→Redo X. Destination stack semantics; retained source native
   copy history; repeated/empty/earlier Restore, eraser/highlighter.
3. Undo/Redo stroke/Clear/import/Restore across reload/navigation; exhausted
   no-ops and abandoned redo branches; navigation/Attach/menus/Expand no edits;
   admitted stroke retained through late blocking ACK.
4. Iterative deep graph validation/replay; collisions/cycles/references/assets;
   parent-only ancestry; linear unique records; V1/late save/unknown formats.
5. Safe missing original versus local-only/corrupt/failed read; concurrent create;
   missing initial versus virtual blank; external one-origin map and independent
   Duplicate; promised corrupt source never flattened.
6. Exact snapshot versus current copy; independent pending heads/stages;
   Restore keeps attachment pageId; frozen uploads across switch; preserve all
   latest #46 automatic recovery and ordinary Send identity guarantees.
7. Real route/store/controller/native IDB failures: quota/abort/read/decode
   precommit rollback/no mutation; held/failed/lost server ACK after local commit;
   reload pointer and Restore Undo/Redo; immediate stroke before checkpoint;
   mirror failure; stale head/concurrent create/divergence; old ACK/deletion/remount
   cannot replace newer recovery, select pages, recreate rows or mint copies.
8. SVG geometry/empty-only/eraser/full offscreen export; exact UI, Escape/focus,
   Pencil controls, phone/tablet wrapping, independent scrolling and draft/speech.
9. Focused handwriting/shared-writing/source/turn suites; native lifecycle;
   Chromium handwriting/mobile scripted providers/speech; typecheck/lint/build/
   diff checks. Preserve documented #45 full-suite baseline failures. One receipt.
10. Owner-driven real iPad #47/#48 figure→annotate→reload→Attach/review;
    pending/sent four choices, Restore Undo/Redo reload, stage Duplicate and
    same-page replacement, spoken explanation/explicit Send in all session modes.
    Emulation is not physical acceptance. Parent owns separately approved future
    slot2 deployment; no agent live provider/speech calls or public slot changes.
