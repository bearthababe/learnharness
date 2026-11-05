# #46 — owner-approved handwriting submission plan

Status: **owner-approved for test-first implementation** on 2026-11-04, based on `integration/handwriting-45` at `e0035d4`. Approval covers the entire final 290-line proposal, including the technical package and resource policy. Approved source: `/tmp/opencode/issue4-submission-plan-proposal.md`, SHA-256 `e26754e627d66028d87cc6601114cb6884f8e271204843aeb67cdb89b0eb1233`. This promoted document preserves that approved contract; proposal-status language is superseded by approval.

Evidence: `/tmp/opencode/issue4-submission-exploration.md`; owner decisions: `/home/bjorn/.cache/opencode/issue4/owner-decisions.md`. Authoritative implementation/delivery evidence: [integration verification](ipad-notebook-integration-verification.md).

**Owner-approved correction, 2026-11-05 (relayed by parent):** normal Send/Submit
is the only submission action, including recovery. Automatically reconcile
uncertain delivery with a status; normal Send reconciles first and, when eligible,
replays the exact original identity/payload. Never send newer edits as that
attempt or infer nonacceptance from a lost ACK. A verified receipt becomes sent
while keeping later edits. Definite refusal returns to ordinary pre-send editing.
Restore drafts/working/history automatically. No separate Check delivery, Retry
saved answer, recovery-panel disclosure or speculative menu. Keep original
attempted text/choices/images inspectable in normal review. This supersedes the
earlier manual submission-recovery UI; immutable data and acceptance invariants
below remain binding.

**Additional narrow owner approval, 2026-11-05 (relayed by parent):** failed
Attach uploads retry their recoverable saved capture automatically on reopening
the session or network reconnection; ordinary Attach retries that saved capture
immediately. Preserve its exact identity, PNG/source and page precondition, and
all newer working/drafts. Show the recovered snapshot for review, never Send it
automatically. This supersedes the separate upload Retry action. Nonretryable
size/conflict/corruption protections and one in-flight transfer per page remain.
No shortcut, Tab change or menu is authorized or needed for this recovery.

## 1. Selected behavior

- Freeze the **entire drawing history**, including Undo and Redo histories and every referenced restore branch. Store imported diagrams as independent lossless background pixels; original SVG remains in the transcript.
- Header **Attach snapshot** first finishes dictation into its existing unsent field, then freezes the current complete page. Save that finalized unsent explanation/draft at Attach so it survives reload. Keep editable working. Phone shows Chat; expanded notebook returns to split; ordinary split stays open with review visible.
- Drawing continues during upload. A recoverable failed capture retries automatically on session reopen/network reconnection or immediately through ordinary **Attach snapshot**; no separate upload Retry action. Reload preserves its stable identity and exact bytes. Attaching unchanged working is a no-op.
- **Attach again replaces only the unsent snapshot of the same working page.** Other pages' pending images and every submitted image/source remain unchanged. Replacement changes which immutable version is pending; it never rewrites bytes. This supersedes the prior inclusion-checkbox proposal entirely.
- Send/Submit remains explicit. **Definitely rejected input is unanswered: return to normal editing and normal Submit**, with durable explanation/choices/confidence and current pending snapshots. The learner corrects text/handwriting and attaches the revised same-page snapshot; no “Use newer draft” action and no frozen-rejection Retry mode. Only uncertain delivery retains an immutable attempted payload and requires acceptance reconciliation before resend. Never overwrite newer edits when resolving the attempt.
- **One Open rule for pending and sent snapshots:** find original working by stable `pageId`. Matching page opens directly. Differing page prompts **Open current working / Restore snapshot / Open snapshot as copy / Cancel**. Restore changes that same working page through an undoable edit; only the copy choice creates an additional independent page. If the original is missing, create it from the exact snapshot without overwriting other working. No notebook-image→separate-resumed-page mapping remains.
- **Restore is undoable and redoable across reload.** Undo first removes any later strokes/edits, then Undo of Restore returns the displaced page and background. Redo reapplies that restore. Neither operation changes prior attached/submitted bytes or automatically attaches.
- **Redo is in scope now**, next to Undo, with both histories persisted. Redo reapplies undone stroke, Clear, import or Restore. A new edit after Undo clears the active redo branch; switching and Attach do not. #44 retains later gesture/polish scope, not this standard control/history behavior.
- **Duplicate** appears in the snapshot action menu (alongside Open in notebook) and notebook header options menu. It immediately opens a **new independent page**: snapshot Duplicate copies that exact snapshot's full history/background; notebook Duplicate copies current working including Undo/Redo. Original working and attachments remain. The copy appears in Pages and is **not attached** until chosen. Its pending snapshot is independent. #47 implements Open/Restore/Copy/Duplicate/Pages UI; #46 supplies the shared complete history/page/attachment contracts and standard Redo control now.
- Reuse existing pending images, viewer, speech transport, normal text/answer/thinking events and real tutor read-tool path. No second attachment system or new notebook speech channel.

## 2. Source contract and journal extension

### Approved technical history package

The earlier unimplemented v2 array proposal is replaced by a **flat event graph**. Only v1 is shipped; no migration for an imagined intermediate v2 is needed. This package specifies history semantics once for #46/#47; it does not reopen the approved UI.

| Name | Fields |
|---|---|
| `HandwritingV1` | Existing `{version:1, operations:[stroke | clear | undo]}`. Continue reading it. |
| `NotebookPageId` | Session-scoped `page_initial` for migrated #45 working; `page_<UUID>` for independently created/copied pages. Stable through edits, Restore, Undo/Redo and switching. |
| `HandwritingV2` | `{version:2,pageId,head:EventId|null,events:Record<EventId,HistoryEvent>,backgrounds:Record<BackgroundId,BackgroundPixels>}`. Records are immutable once keyed; selected head advances by appending an event. |
| `HistoryEvent` common fields | `{id,parent:EventId|null,kind}`. Parent is the immediately preceding chronological event. Kinds: `stroke`, `clear`, `import-background`, `restore`, `undo`, `redo`. |
| `stroke` / `clear` | Existing stroke payload on `stroke`; no extra payload on `clear`. Preserve migrated action IDs. |
| `import-background` | `{backgroundId}` referencing one independent full-page PNG; valid only on empty working. |
| `restore` | `{sourceHead:EventId|null}` referencing the selected snapshot's exact history root in the merged graph. Parent retains displaced working/history; never embed another source/journal/page-state copy. |
| `undo` / `redo` | No embedded drawing/history payload. Replay derives stack transitions; each action itself has a stable event ID for causal saving. |
| `BackgroundPixels` | `{mediaType:'image/png', width:1400, height:1800, data:<base64 PNG bytes>}`. Full-page placement is baked into this independent background raster; no transforms, SVG, remote URLs or ink in this value. |
| `NotebookSource` | `{version:1,page:{width:1400,height:1800},journal:HandwritingV2}`. Self-contained transitive closure from head through parent/restore-source edges, each event/asset stored once. Includes active Undo/Redo and abandoned branches retained in chronological history. |
| `SharedWriting.editableSource` | Optional `{version:1}` capability. Together with existing `chatId` + writing `id`, this is the source reference; no second source identity. Absent for raw external/legacy PNGs. |
| `SharedWriting.notebook` | `{pageId,pageRevision,contentFingerprint}` for notebook captures. Revision is the monotone server attachment-head revision, not drawing-history position. Raw external PNGs have no page binding. |

**Pure history engine:** `src/core/handwriting.ts` validates/replays the graph into `{strokes,background,canUndo,canRedo}`, with memoized event states and persistent linked ink/undo/redo stacks, not copied stroke prefixes. Background IDs are SHA-256 of original PNG bytes. Stroke, Clear, import and Restore each push one edit frame with references to before/after drawing states and clear the active redo stack. Clear empties ink/background; eraser affects ink only. Undo pops an edit to redo and restores its before-state; Redo pops it back to undo and reapplies its after-state. UI does not append unavailable Undo/Redo actions. Switching, opening matching working, Attach, sync and tool changes append no edit and do not clear Redo.

**Restore ordering and full source history:** union the validated source event/asset tables, then append one restore event on the destination. Its restored drawing is replay of sourceHead; before-state is displaced ink/background. The snapshot's exact history, including its Undo/Redo and earlier restores, remains reachable via sourceHead, without flattening or stripping it. Restore is one new edit in destination chronology: source-history edits are not spliced above its undo boundary. Therefore Restore → stroke S → Undo returns restored drawing; next Undo returns displaced working; Redo reapplies Restore; next Redo reapplies S, including after reload. The retained source branch is intact when copying/opening that captured source; destination Undo/Redo follows its chronology including Restore. This technical boundary reconciles full-history retention with Undo Restore returning displaced working.

**Branching:** Undo then new stroke/Clear/import/Restore invalidates active Redo. Old immutable events remain retained for history integrity, not available through the current Redo button. Undo/Redo append chronology events instead of moving the persisted head backward, so stale saves cannot mistake Undo for an old version. Import/Restore and referenced assets commit together through working-save recovery; read/decode/preservation failure commits nothing and never displays an empty substitute.

**Efficiency/validation:** merge tables by ID/hash and exact equality; reject conflicting definitions, missing references, cycles across parent/source edges, invalid dimensions and unknown formats without overwriting. Restoring an earlier snapshot refers to an existing earlier root, never itself/future nodes. One restore adds one event plus previously unseen source records. Repeated restores reuse them. Serialized size is linear in unique referenced events/assets **per working/source document**, not recursively nested or quadratic prefixes; memoized replay processes each event once. Immutable attachment bundles remain individually self-contained; no claim of global cross-bundle deduplication.

**Migration/reconciliation:** normalize v1 to page_initial and a parent-linked event chain preserving action IDs/payloads. Its Undo events gain standard Redo semantics; later legacy edits already invalidate earlier redo branches. Persist v2 only on real history edits. Reconcile only equal page IDs: an incoming head on the current **parent** chain is an old retry; current head on incoming parent chain is an extension. Restore-source reachability is not causal extension. Shared records must be identical; preserve/refuse divergent heads or corrupt/future/missing history. Keep existing device-key namespaces. #47 owns its multi-page working registry and background-heavy working durability, separate from source objects and attachment heads.

### Shared Open/Copy identity contract — owner-selected

`pageId` names original mutable working; writingId names one immutable capture; submissionId names an attempted input. Resolve/preserve current working, then look up `source.journal.pageId` for **both pending and sent** notebook snapshots:

1. Matching editable content: open existing page without an operation, retaining its history/Redo.
2. Different content: show exactly **Open current working / Restore snapshot / Open snapshot as copy / Cancel**. Current opens unchanged; Restore appends the undoable event on the original page; copy creates fresh independent pageId from exact snapshot history; Cancel leaves active/other working untouched.
3. Missing original: create from full source under its original pageId, using create-if-absent. Preserve other active working first. If the original appears during async loading, take the existing/mismatch path; failed read is not absence. Never overwrite another page.

No notebook-image→resumed-copy mapping or pending/sent distinction remains. Repeated Open always follows original page identity/comparison. Open/Restore/Undo/Redo/copy do not touch attachment heads or submit. Restoring/recreating original working keeps pageId and uses its current server attachment-head revision, never resets that counter. A later explicit Attach replaces only its unsent snapshot; sent bytes remain immutable.

Duplicate and **Open snapshot as copy** create fresh independent pageId with the copied head/full event/background closure and no extra edit, preserving copied Redo. Immutable records may share identity, but working heads and subsequent changes are independent. Snapshot Duplicate reads frozen source; notebook Duplicate reads current complete working. Neither attaches or changes original working. Only explicit copy creates an additional page when original exists. Legacy/external images remain clearly labelled flattened backgrounds with no recoverable original ink/history; #47's external-source page creation must preserve other working, not infer a notebook pageId from image bytes.

### Matching versus immutable source identity

`contentFingerprint` hashes canonical replayed **editable content** (ordered stroke payloads plus independent background content, excluding page/history IDs, theme and viewport) for Open matching and same-page unchanged-Attach. It is not merely composite pixels: different editable ink that happens to render identically still differs. Undo→Redo back to the same editable state matches, and Restore immediately matches its target despite adding an undo boundary. Direct Open retains current history; it does not swap histories merely to force equality.

`sourceFingerprint` separately hashes canonical **full source graph**, pageId and referenced assets for immutable bundle verification. Unchanged-content Attach still saves finalized explanation but creates no capture and does not clear Redo. A real Attach freezes the entire then-current history. No-op remains page-local; Duplicate can attach the same content independently. Compare only current attachment head, not arbitrary historical sources.

Rendering in `components/handwriting/render.ts` shares the accepted painter between working/export: white paper → independent background → editable ink. Decode background before edits/export; failure retains current working/source. Theme filters never affect bytes. Standard **Redo** sits next to **Undo**, availability derives from replay, both use accepted Pencil activation and do not disturb controls mid-stroke. #46 implements this control/persistence now; #47 uses the same engine for import/Restore/Open, and #44 retains further gestures/polish.

## 3. Existing shared-writing transport and server storage

### HTTP

Keep current raw-PNG `POST /api/chats/:chatId/writing` and image GET behavior. Extend that same POST with a notebook `multipart/form-data` variant containing exactly:

- `writingId`: `writing_<UUID>`; client mints once per captured attempt.
- `pageId`: originating `NotebookPageId`, equal to `source.journal.pageId`.
- `expectedPageRevision`: nonnegative integer from the last verified attachment head for that page (`0` if none). Immutable for this capture/retry; never silently rebase a stale capture.
- `source`: JSON file, UTF-8 deterministic `NotebookSource` bytes.
- `image`: `image/png` file, exact persisted PNG bytes, 1400×1800.

Approved limits: existing **25 MiB image**, **25 MiB source JSON**, total streamed body ≤ **50 MiB + 64 KiB**. Enforce total before buffering/form parsing, then part limits, strict source graph schema/closure, PNG signature/IHDR and dimensions, canonical base64/hash for each background. No client filesystem paths accepted. Compute immutable source hash and editable-content fingerprint from validated source; never trust a supplied content hash. Background decode fidelity is verified in browser tests; upload does not claim to regenerate the composite server-side.

| Condition | Status / JSON |
|---|---|
| Complete bundle and new pending head committed | `201 {ok:true, writing, pending: true, currentPageRevision, message:'Snapshot attached. Review it before sending.', sessionPath}` |
| Same committed capture identity and same content/precondition | `200`, same `writing`/createdAt plus current `pending` and `currentPageRevision`; **never re-promote** a superseded/submitted capture |
| Same ID but different contents | `409 {code:'capture_conflict', error:'This snapshot identity already belongs to different working.'}` |
| Uncommitted capture's page revision is stale | `409 {code:'page_changed', error:'A newer snapshot of this page is already attached.', currentPageRevision}`; retain exact local capture, no overwrite/rebase |
| Invalid data / wrong type / too large | `400 invalid_capture` / `415 unsupported_image` / `413 capture_too_large` |
| Missing/deleted session | `404 not_found` |
| Storage/format read failure | `503 capture_unavailable`; never replace an existing bundle |

Add `GET /api/chats/:chatId/writing/:imageId/source`, thin route delegating through the server barrel. Returns `NotebookSource`, `Cache-Control: private, no-store`. `404 no_editable_source` for an existing legacy/external image, `404 not_found` for missing image/session, `503 source_unavailable` for a corrupt source-backed bundle. #47 must distinguish missing capability from broken promised source; corruption does not authorize flattened fallback.

Existing `GET /writing` returns `{pending,pageAttachments}`. `pageAttachments` projects `{[pageId]:{revision,writingId,contentFingerprint}}` for current attachment heads; it is **not** #47's Pages registry. Pending metadata includes source capability/page binding. Existing image URL and submission IDs remain unchanged. Image/source lookup works after supersession/submission. This content fingerprint supports unchanged-Attach without transferring full historical source in every refresh.

### Pending-image correction: verified baseline and approved replacement

- `components/shared-writing.tsx:7–42` returns `ids: () => pending.map(...)`; there is no selection/exclusion state. `:45–53,79–89,101–120` provides thumbnail/viewer and refresh/setup controls, **no remove, replace or include control**.
- `components/chat.tsx:509,1234,1778` sends that complete pending-ID list on thinking, conversation and question answers. `:266,756,1219,1700–1705` also derives image eligibility/busy affordances from *all* pending images. Changing only the visible thumbnails would not fix the payload or image-only eligibility.
- `src/server/shared-writing.ts:34–37` defines pending as all stored images minus submitted references; only collection POST and GET are implemented. `app/api/chats/[id]/writing/[imageId]/route.ts:3–6` exports only GET. `src/store/shared-writing.ts:19–38` appends new IDs and supports only whole-session deletion, not per-image removal/replacement.
- Therefore current Attach revised B leaves A pending and sends **A+B**. Stable working-page identity and server-owned supersession are necessary additions; a UI-only filter cannot enforce the approved behavior across reloads/retries.

Approved correction sequence: definite rejection → normal editing → correct page P → Attach B atomically replaces P's unsent A → normal Submit sends B, plus the unchanged pending snapshots of other pages. No checkbox, manual exclusion step or in-place file replacement. To keep A and B as stages, Duplicate creates page Q first: A remains pending on P; attaching Q creates its own independent pending image. Ordinary `ids()` can continue returning all **authoritative pending** IDs; update server derivation/validation rather than substituting a second local pending truth.

Raw external uploads stay unbound individual pending PNGs. #47's flattened-background Open/copy preserves the original; do not infer a notebook page identity or pending replacement relationship from matching bytes. Automatic same-page replacement applies to source-backed notebook captures with stable pageId. A separate external-upload replacement feature is not added by this plan.

### Files / ownership

Under `LH_DATA_DIR/shared-writing/<chatId>/`:

- Existing external files remain `<writingId>.png`.
- Notebook bundle: `<writingId>/image.png`, `<writingId>/source.json`, `<writingId>/manifest.json`.
- Manifest: `{version:1,id,pageId,expectedPageRevision,createdAt,imageSha256,sourceSha256,contentFingerprint,editableSource:{version:1}}`; immutable with PNG/source. Content fingerprint derives from replay; full source hash covers the entire history graph.
- `pending.json`: `{version:1, pages:{[pageId]:{revision,writingId}}, committed:{[writingId]:{pageId,pageRevision}}}`. One atomic file owns current attachment heads and stable commit receipts; submission status still derives from canonical chat messages. This index lives inside the **existing shared-writing store**, not a second attachment system.
- Staging directory: `.<writingId>.<UUID>.tmp/`; complete PNG/source/manifest there, rename to immutable final bundle, then atomically replace `pending.json` to publish the pending transition. Listing/source lookup ignores uncommitted bundles and staging. A collision refuses or verifies exact same immutable request (including page/precondition), never overwrites.

Extend `src/store/shared-writing.ts` behind a typed `SharedWritingStore` port: existing raw `put/read/filePath/deleteChat`, `putNotebook(chatId,{writingId,pageId,expectedPageRevision,image,source})`, `readSource`, and `readSnapshot(chatId)` returning committed image metadata plus index in one synchronous read boundary. Core owns pure `commitNotebookCapture`/pending derivation; adapter applies them and writes files synchronously. `filePath` hides physical layout. Wire only in `src/server/stores.ts`.

**Commit algorithm (existing single-process model):**

1. After body parsing, check session existence and read current store state; no await through commit. If the capture already appears in `committed`, verify identical bundle/request and return its original receipt with current pending status. Never rewrite the head on retry, even if a newer snapshot is now pending or this one was submitted.
2. For a new/uncommitted capture, compare expected revision with **this page's** actual revision. Conflict changes nothing; unrelated pages do not conflict. Initialize an empty index before creating the first notebook bundle. A missing index alongside existing notebook artifacts, or corrupt/future index, is unavailable rather than an empty authoritative state.
3. Complete/reuse the immutable bundle; write a new index containing both `pages[pageId]={revision:r+1,writingId}` and `committed[writingId]={pageId,pageRevision:r+1}`. Preserve every other page/receipt. Temp-file rename of this index is the **single pending publication point**: observers see old A or new B, never both as P's pending version and never no snapshot because half an upload failed.
4. Failure before index publication leaves old A pending; the uncommitted bundle is inert and recoverable by the exact retry. Failure/lost ACK after publication is recognized from `committed`, so retry cannot duplicate/reorder. Retain historical bundles/receipts until session deletion; no new garbage collector.
5. Derive pending as unsubmitted raw PNGs plus **only each page's current head if unsubmitted**. If a head was submitted, the page has no pending snapshot; do not fall back to older superseded captures. Attach later advances that head while all earlier submitted bytes/references remain intact.

Change `resolveSharedWriting` to accept only this derived pending set for a **new** input. Accepted submission receipt lookup runs first for idempotent retries. A stale client sending superseded A is refused as not accepted, not silently upgraded to B. Validate against current record+index immediately before synchronous input write-ahead. If Submit(A) wins before Attach(B), A is submitted unchanged and B becomes pending; if Attach(B) wins first, Submit(A) is refused. Neither interleaving sends both automatically. This defines atomic pending supersession without claiming a cross-store transaction or changing lifecycle deletion ordering.

Emit `writing-changed` only after a new index commit; replaying a receipt emits no duplicate attachment event. No upload ChatStore write/sidebar reorder/tutor turn. Existing session-directory deletion includes bundles, index and staging. Retain immutable source/PNG through supersession and submission. Copying a page is a #47 working-store operation, never an upload or pending-index mutation.

**Retain existing lifecycle ordering.** `src/server/chats.ts:131–133` deletes working before the chat and shared-writing files after chat deletion; this proposal does not reorder it. Bundles live under the directory already removed by `sharedWritingStore.deleteChat`. Existing limitation: a later filesystem cleanup failure can leave image/source files after the chat is gone, and earlier cleanup is not rolled back. No concrete #46-specific defect requiring an ordering change has been demonstrated; record that limit, test the extension's normal deletion/races, and do not add transactional cleanup work. Device cleanup follows the existing successful-deletion callback; a failed response must not be treated as success or silently discard recoverable device state.

## 4. Durable browser capture — precise acceptance boundary

Add one isolated IndexedDB adapter, `components/handwriting/transfer-device.ts`, database **`lh-handwriting-transfer`**, version **1**. No library dependency. Object stores:

| Store / key | Record |
|---|---|
| `captures` / `[chatId, writingId]` | `{version:1,chatId,pageId,writingId,expectedPageRevision,sourceJson,sourceFingerprint,contentFingerprint,capturedAt,explanationDraft:{targetKey,draftId,revision},raster?:{width:1400,height:1800,rgba:ArrayBuffer},png?:Blob,state:'captured'|'ready'|'uploading'|'failed'|'conflicted',error?:string}` |
| `captureReceipts` / `[chatId, pageId]` | Latest observed `{version:1,chatId,pageId,sourceFingerprint,contentFingerprint,writingId,pageRevision,createdAt}`; page-local hint, not server authority. Never replace higher revision with older ACK. |
| `submissions` / `[chatId, submissionId]` | Immutable submission attempt and mutable transport state, §6. |
| `drafts` / `[chatId, targetKey, draftId]` | Durable normal editor state from Attach or image-bearing Send, plus separate newer revisions while delivery is unknown, §6. |
| `sessions` / `chatId` | Device lifecycle tombstone/generation preventing queued writes from recreating a deleted session. |

All writes are transactions checked against the session generation/tombstone. Acknowledge local durability only on transaction completion. Corrupt/future records are retained and visibly blocked, not deleted as empty. Storage-unavailable/quota abort refuses to upload/send; retain memory and current notebook/draft, show honest wording. Do not fall back to an unrecoverable network operation.

`components/handwriting/attachment.ts` controller sequence:

1. Header press claims one Attach action; ignore compatibility-click duplicates. Require restored/reconciled working/pageId and observed attachment-head revision (verified absence = 0, failed read is not 0). If an active stroke or unresolved same-page capture exists, do not begin another for it. Drawing/Undo/Redo remain usable outside active strokes; independent pages are not blocked. One unresolved capture per page is part of the approved technical package.
2. Record chat/page/mount and dictation-target identity. Await existing `finishDictation()` **before** freezing. Keep target mounted until final flush; prevent a concurrent explicit submit while this Attach preparation owns it. On session/page/target change or cancellation, retain text/ink and stop the action; never finish into a newly selected question or capture another active page. Recheck readiness and completed-stroke boundary. If a stroke started during speech finishing, wait for its completion before capture; do not truncate it.
3. In one synchronous browser task, clone full journal, read the finalized existing editor fields/ref mirrors and copy the composited full page into an independent offscreen canvas. Read its exact RGBA pixels. Subsequent drawing cannot modify either clone. Capture the editor's target/draft identity and revision, including reading-thinking/choices/confidence where applicable, so restored explanation cannot drift to another question. Fingerprinting/encoding may be asynchronous but use only these detached values.
4. Compare editable contentFingerprint with this page's current server-confirmed attachment head. If unchanged, save finalized explanation and reveal review without creating a capture or changing Undo/Redo. An unresolved capture is retried using its exact saved full source/PNG, not reconstructed from a current equal-looking page. Duplicate/new page has no head and may attach identical content independently. Never use an older historical receipt as current head.
5. Atomically save pageId+full source graph+RGBA+stable writing ID+expectedPageRevision and finalized explanation/editor snapshot. Preserve newer editor revisions. Until commit show **Preparing snapshot…**, with no upload; this is the local acceptance boundary. Closing before commit may interrupt Attach; completed working retains its recovery. Never claim capture durability early. The copied source includes both history stacks and restore references, even if the learner uses Undo/Redo while upload later runs.
6. Encode that frozen raster, persist the exact PNG Blob in a second transaction, then remove redundant RGBA. On reload, a `captured` record can encode its saved raster; a `ready/uploading/failed` record with PNG always reuses those exact bytes. No upload occurs before PNG commit, so re-encoding after an interrupted pre-upload preparation cannot conflict with an earlier server upload.
7. Upload the saved source+PNG+pageId+expected revision. Failure/unknown ACK retains the exact capture and identity/precondition. On session reopen/network reconnection automatically retry recoverable saved captures; ordinary Attach immediately retries the saved capture before preparing any new capture. Neither path recaptures, rebases or allocates a fresh ID, and concurrent triggers cannot start duplicate transfers for the same page. Show the recovered snapshot in review without sending tutor input or changing newer working. No separate upload Retry action. Oversized, conflicted or corrupt saved captures remain preserved and are not automatically uploaded. A definitive page_changed response marks this capture `conflicted`: keep its exact local bytes, refresh/show the newer pending snapshot, and release its in-flight slot. It cannot ever commit under that stale precondition, so normal explicit Attach of current working may create a fresh capture after reconciliation; do not silently turn recovery of the old one into that new action. Same-device serial Attach ordinarily avoids this conflict; another tab/device or stale request can still cause it.
8. On committed success (including an old receipt now superseded/submitted), retire bulky capture recovery and retain the unsent explanation. Update page-local receipt only monotonically, refresh authoritative pending/pageAttachments, and show actual current status. Never reinsert old A locally after B superseded it. Refresh failure does not justify another capture. Original A remains pending until B's server index commit succeeds; failure of B cannot remove A. A resolved old ACK cannot change active page or clear current working.
9. Reveal review: <768px calls phone Chat; expanded ≥768px exits expansion but keeps split open; ordinary split unchanged. Reveal/scroll only the dock's existing internal review area, not page/history, and do not focus the text field/open keyboard. Defer layout/status changes if a new stroke is active; show after it finishes. Never repaint current working from upload ACK.

Mount/unmount: async completions may settle their own durable capture record while session remains valid, but cannot switch another session/page's pane or edit its working. #47 page switches invalidate view callbacks, not the immutable upload's originating page identity. A matching successful-deletion event invalidates controllers before asynchronous device cleanup. A server 404 stops transfer/retry and reports **This session is unavailable. Your device recovery has been kept.** Do not purge new capture/submission recovery on a generic 404: current `getChat` also returns null for corrupt/future chat files (`src/store/chats.ts:65–80`), so that response alone is not proof of intentional deletion. Explicit successful session deletion purges this session's transfer rows and retains its device tombstone; no transfer request may create a session.

## 5. Submission idempotency on the existing turn path

Image-bearing inputs need stronger identity than guessing from a text match. Add optional **`submissionId: 'submission_<UUID>'`** to existing `text`, `answer`, `thinking` inputs, valid only when `writingIds` is nonempty. Do not add an event type or use this field for model-response Retry. Existing clients without the field continue using existing behavior.

Add record-only `LhMessage.writingSubmission?: {id, inputSha256}` on the same appended message already carrying `sharedWriting`. Hash a fixed canonical serialization of the parsed exact input excluding `submissionId`, including ordered writing IDs, target call ID and complete answer data. Compute on the server; do not trust a client hash. Strip receipt metadata in `toLlmMessages`; custom-marker conversion already explicitly constructs its content. Receipt is part of the same existing write-ahead `saveMessages` as the answer, not a separate ledger.

Add pure canonicalization/receipt matching in `src/core/writing-submission.ts`; small server orchestration in `src/server/writing-submission.ts`:

- At initial record read, before model/key/catalog/compaction gates: same receipt ID+hash → accepted acknowledgment, no new input/model run; same ID+different hash → `422 submission_conflict` (not 409, which the current client auto-retries).
- Repeat the receipt check after awaited gates on the fresh canonical record, immediately before resolving images/appending. This closes the slow request/racing retry window. No await between this last check and current synchronous write-ahead boundary.
- New request retains existing busy, question/problem ownership, selection eligibility and image ownership checks, with notebook IDs additionally required to be the current unsent page head. Persist receipt on both the parallel-question deferred-wake branch and the normal branch.
- Return the existing compatible accepted response on duplicate success; client uses ordinary record/liveness read and reattachment. Receipt presence acknowledges input, **not model completion**. A server crash after write-ahead but before tutor start does not authorize another image input; existing continuation/failed-response behavior owns later tutor activity.
- Same image IDs consumed by another submission, superseded by newer same-page captures, or question resolved differently is a conflict/obsolete target; never infer success for this attempt from optimistic UI or image disappearance alone. Never substitute a new page head for the requested ID.

Transport must expose **accepted / definitely-not-accepted / unknown**, not infer delivery from `SessionModel.send()`'s existing boolean (`components/session-core.ts:780–783` explicitly says false can hide acceptance). Add a scoped optional outcome callback for image-bearing sends; do not repurpose the opening-message `onAccepted` callback. Proven pre-write refusals may carry `inputDisposition:'not_accepted'`; a network error, generic 5xx or failed canonical persistence is not such proof. Roll back only that rejected request's optimistic append for all three input adapters, and return the normal editor. Existing model/key-refusal recovery must delegate this image-bearing draft restoration to one owner rather than applying its older `draftRef` over newer text.

After unknown delivery, a later absent-record read or a retry's rejection alone does not prove the original delayed POST cannot accept. A definitive rejection of the original outstanding request returns to ordinary editing; a rejection of a later retry does not erase unresolved uncertainty about the original. Keep this distinction in the scoped transport outcome. Receipt-based exact retries safely converge on acceptance without a new rejection ledger or request-coalescing subsystem. An in-memory coalescing map would not prove rejection of a request whose body has not arrived yet, so it is not a substitute for durable evidence. This is a limit of negative reconciliation, not a reason to add special UI to an ordinary, definitively rejected answer. Test the delayed-original/retry-refusal case; never unlock a conflicting new payload on false certainty.

This stays within the app's current single-process storage/turn model. It guarantees no duplicate canonical image-bearing input or new tutor turn from replaying an accepted identity; it does not claim transactional/exactly-once model execution.

## 6. Normal durable editing; exceptional handling only for unknown delivery

Add `components/handwriting/submission-recovery.ts` controller and a small session-scoped hook in `components/handwriting/submission.tsx`. It wraps the existing image-bearing `send`/`submitAnswer` paths; ordinary editor UI and question eligibility remain in their current components. Its draft persistence also starts at Attach, before any submission attempt exists.

Durable normal draft fields: `{version:1, chatId, targetKey, draftId, revision, editor}`. `targetKey` is `composer`, `question:<toolCallId>` or `problem:<problemCallId>`; use a distinct `question:<toolCallId>:reading` target when unrevealed reading-thinking owns speech. `editor` contains composer text, practice thinking, or question `{selection:{selected:number[],otherSelected,dontKnow},thinking,other,text,confidenceIndex,readingThinking}` as applicable. Convert Set to sorted array and back; never restore one question's choices into another. Attach saves finalized dictation together with existing text; later edits update the normal durable draft. For a reading target, restore speech into reading-thinking without revealing the question or claiming it was an answer.

`SubmissionAttempt`: `{version:1, chatId, submissionId, input:<exact text|answer|thinking payload>, imageVersions:[{writingId, notebook?:{pageId,pageRevision}}], targetKey, draftId, draftRevision, editor:<snapshot>, createdAt, state:'prepared'|'sending'|'uncertain', lastError?}`. Retain final answer data and exact reviewed pending IDs/page versions; later Attach never rewrites this attempt. It is a short-lived acceptance/recovery record, **not** a separate editable answer and **not** a permanent refused-answer card. Terminal handling transitions/removes it transactionally as below.

### Normal Submit and definite rejection

1. At explicit Send/Submit, capture chat/target and the exact **authoritative pending** image IDs/page versions shown in review. That is one unsent current snapshot per page plus unbound external images, not all historical bundles. Finish dictation through its existing field owner; read current field/selection/confidence ref mirrors. Fix `PracticeDock`'s missing finish first. Recheck target, eligibility, busy/compaction and availability of those exact images; do not gather newly arrived/replacement images after awaits.
2. Persist final input/editor and a fresh identity before optimistic unmount/clear/POST. Persistence failure leaves the normal draft editable and sends nothing. Newer changes while persistence is pending get their own revision; clear only the revision actually submitted. Mark `sending` durably before dispatch.
3. On **definite rejection**, the input did not answer the question. In one device transaction, retain the newest compatible normal draft (or restore the attempted snapshot if there is no newer edit) and retire the attempt. Refresh authoritative pending state; never re-promote an old snapshot from the rejected payload. Restore only that request's optimistic UI. Normal editor/selection/confidence and Submit are usable immediately; no “Use newer draft” or rejected-answer Retry mode. If local cleanup fails, retain recoverable records and the restored live draft.
4. The learner edits explanation, corrects page P (with #47 Open when needed), and attaches B; server commit automatically supersedes P's unsent A. Ordinary Submit builds a **new** identity from current fields and pending IDs, including B and unchanged other-page snapshots. No manual removal. A remains immutable historical source, not pending. When the target was already resolved elsewhere, preserve the draft without inserting it into a different question.
5. On accepted receipt, retire only this attempt and its submitted editor revision; keep later draft revisions and newer same-page captures. A late receipt for submitted A must not consume new B. Model failure after accepted input uses existing model Retry, not learner-input resubmission. Durable attempt cleanup waits for canonical receipt verification.

### Unknown delivery only

- Network loss, interrupted `sending`, or an outcome without a definite acceptance/refusal retains the exact attempt. On reopen/check, read existing `GET /api/chats/:chatId`: matching canonical receipt confirms acceptance; a running turn waits/reattaches; failed read keeps uncertainty. Optimistic messages or disappearance from pending are never receipt evidence.
- No receipt + idle does **not** alone prove a delayed original POST cannot accept. Normal **Send/Submit** first reconciles the previous attempt. If target and original images remain eligible, it may re-POST that same immutable input/identity; durable receipt checks make requests converge with the original. No silent tutor-input POST on reload or background checks, no substitution of current edits. A rejected retry leaves uncertainty about an unaccounted-for original request; retain newer editable drafts without claiming that the original definitely failed. If this Send discovers acceptance, acknowledge sent and preserve newer drafts rather than submitting them in the same action.
- Bind a recovery Send/Submit to its original attempt identity **before** speech finalization or other asynchronous preparation. Automatic acceptance during that wait ends the same action without falling through to a new payload. Apply this to composer, question and practice callers. A valid saved choice answer remains recoverable through ordinary button/keyboard Submit even when newer selections are empty; the empty draft is preserved and remains invalid for a new answer.
- Unknown state gets automatic acceptance checks (mount, connection/visibility recovery, canonical record/attachment events and bounded periodic checks) with an inline status. Normal review exposes original attempted text/choices and actual immutable image previews/viewer independently of current pending snapshots. No Check delivery or Retry saved answer button, collapsed recovery disclosure or dedicated recovery panel. Normal editing, page duplication and Attach remain possible; a conflicting new payload waits for reconciliation. One unknown image-bearing attempt per session, not a lock after every rejection.
- **Replacement during uncertainty:** permit Attach(B) for the same page; preserve the attempted A payload and both immutable sources. Reconcile before any resend. First obtain an authoritative page head with revision **strictly greater** than A's `imageVersions` revision; then fetch fresh canonical chat. If the original receipt exists, A was accepted and B stays pending. If that fresh record has no receipt, A cannot be accepted later because the final server submission gate permanently rejects its superseded ID; retire the unknown attempt as not accepted and return to normal latest draft/B. Order these reads this way (or use one synchronous server snapshot), never use a pre-supersession record read as proof. A failed read remains uncertain. This avoids adding a separate replacement-blocking UI and never silently retries B as A.
- Keep newer editor revisions and independent-page snapshots when resolving A. Missing pending metadata alone is insufficient: prove a newer monotone page head or canonical consumption/target resolution, and verify the corresponding fresh record. External unbound images have no page-supersession proof. Do not infer success from another submission or populate another question with an obsolete draft.

Draft restore uses the newest compatible saved revision in the ordinary field. Do not overwrite it with an older Attach checkpoint or attempted snapshot. If no compatible field exists, retain its target-bound draft and show its content in normal review without inserting it into another question or requiring a recovery disclosure. Emit persistence snapshots on meaningful text/selection/confidence changes, not pointer movement; await them before extension-owned replacement/navigation actions. A device-write failure says **Couldn’t save your latest edits on this device. Keep this page open.** Last committed draft/attempt remains intact.

Durability now begins at Attach for its finalized unsent explanation, and at image-bearing Send for an externally attached image's answer; subsequent edits in those contexts remain durable. Unrelated unsent text does not acquire a blanket app-wide persistence promise. Capture success/failure/cleanup never deletes its unsent explanation. Restore and rejection transitions do not create tutor input, and their UI does not imply any earlier immutable image was modified.

## 7. UI wording and ownership

Use existing pending panel/viewer and ordinary editable fields; same-page replacement needs no selection controls. Show only a compact upload/unknown-delivery notice, mirrored for upload failure in notebook. Definite rejection uses the normal form and existing error/setup explanation. #47 adds snapshot action menu **Open in notebook / Duplicate**, notebook header options **Duplicate**, and Pages thumbnails. Preserve Pencil release-inside, drag-away cancellation and compatibility-click suppression; Duplicate opens the copy without attaching it.

| State/action | Exact text |
|---|---|
| Header | **Attach snapshot** |
| Before local capture commit | **Preparing snapshot…** |
| Upload active | **Attaching snapshot… You can keep writing.** |
| Upload failed, capture durable | **Snapshot saved on this device. Couldn’t attach it.** — automatic reopen/reconnect retry or ordinary **Attach snapshot** |
| Local capture failed | **Couldn’t save this snapshot on this device. It has not been uploaded. Keep this page open and retry.** — ordinary **Attach snapshot** retries local persistence before upload |
| Acknowledged | **Snapshot attached · not sent** |
| Pending refresh failed after upload ACK | **Snapshot attached. Couldn’t refresh review.** — **Refresh review** |
| Unchanged working | **This page version is already attached.**; reveal review, save finalized explanation, no new upload |
| Captured version already submitted | **This version was already sent.**; no new attachment |
| Submission persistence failure | **Couldn’t save this answer on this device. Nothing was sent.** |
| Successful same-page replacement | **Snapshot updated · not sent**; review shows new B instead of A, other pages unchanged |
| Stale uncommitted capture conflict | **A newer snapshot of this page is already attached. Your captured version has been kept on this device.** |
| Idempotent ACK for an already superseded capture | **A newer snapshot of this page is attached.**; show current review, do not restore old capture |
| Duplicate (#47) | **Duplicate** in both approved menus; immediately open independent copy with full Undo/Redo, no attachment |
| Standard history controls | **Undo** and **Redo**, adjacent; disabled only when the corresponding replayed stack is empty or input is not ready |
| Open mismatch (#47, pending and sent) | **Open current working / Restore snapshot / Open snapshot as copy / Cancel** |
| Uncertain submission | **Couldn’t confirm delivery. Your saved answer is kept on this device.**; automatic read: **Checking whether your answer was received…** |
| Exact unknown-attempt replay | Ordinary **Send/Submit** reconciles first; normal review exposes original text/choices/images before replay |
| Confirmed accepted receipt | **Your answer was sent.**; preserve later edits and newer snapshots |
| Definite rejection | **Your answer wasn’t sent. You can edit it and submit again.**; retain existing provider/setup reason and ordinary Submit, no special retry action |
| Obsolete target with recoverable text | **This draft belongs to an earlier question.** — content remains visible in normal review |
| Newer edits while delivery unknown | Normal editor stays visible; original-attempt review says **Later edits are not part of this answer.** |
| Reload help | **Reload keeps your notebook, Undo and Redo, attached snapshots and explanation saved at Attach.** |
| Source failure | **Couldn’t load this snapshot’s editable source. The saved image is unchanged.** (source API caller; Open UI belongs to #47) |

Automatic checks and normal Send always check canonical acceptance first; either may discover the input was already accepted. A definite rejection needs no special reconciliation action before ordinary editing/submission. Never say “nothing was sent” based solely on missing ACK. Upload recovery retries the same exact PNG/source for review; normal corrected Submit creates a new final input after definite rejection. Automatic upload recovery never authorizes automatic Send.

Before requesting final speech, pin the actual target receiver through finalization using existing hooks; a concurrent reveal/dismiss/canonical transition must not redirect the result. If the original field is replaced, retain its late finals in its target-bound durable draft and abort the stale Attach. Abort Attach if speech is explicitly cancelled, retaining ink/current text. This is included in the approved technical package, not a new confirmation dialog.

Preserve owner mobile focus/scroll rules from `/home/bjorn/.config/opencode/docs/preview-workflow.md:33–46`: no outer-page scroll, retain native history/input scroll, keyboard containment, focus-specific release and pinch zoom. Pane changes preserve mounted notebook, field drafts, controls and reading positions.

## 8. File-by-file implementation seams

| Files | Mechanical responsibility |
|---|---|
| `src/core/handwriting.ts`, core barrel | Stable page identity; flat V2 history graph with Undo/Redo/import/Restore; migration, DAG validation, memoized replay, content/source fingerprints |
| `src/core/shared-writing.ts`, `src/core/ports.ts` | Page/version metadata; pure page-head CAS, immutable receipt and pending derivation; typed existing-store extension |
| `src/store/shared-writing.ts`, `src/server/shared-writing.ts`, server barrel, new `app/api/chats/[id]/writing/[imageId]/source/route.ts` | Immutable paired bundles, atomic pending-index publication, bounded upload/source GET, stale/retry responses |
| `src/store/handwriting.ts`, `src/server/handwriting.ts`, `components/handwriting/recovery.ts` | Whole graph/asset recovery; replace operation-count ACK tracking with stable head/parent-ancestry checks; atomic known-v1 normalization/persistence; retain late-ACK/read/deletion protections |
| `components/handwriting/render.ts`, `attachment.ts`, `transfer-device.ts` | Shared rendering; immutable capture/retry controller; IndexedDB I/O |
| `components/handwriting/notebook.tsx`, `toolbar.tsx`, `session.tsx`, `notebook.css` | Adjacent standard Undo/Redo; history-derived enabled state and persistence; header Attach/notices, narrow hooks, speech-first review |
| `src/core/writing-submission.ts`, `src/core/input-events.ts`, `src/core/native-messages.ts`, `src/server/writing-submission.ts`, `src/server/chat-handler.ts` | Input receipt identity, pure matching and exactly one write-ahead acceptance path; strip receipt from model messages |
| `components/handwriting/submission-recovery.ts`, `submission.tsx`; `components/chat.tsx`, `question-dock.tsx`, `practice-dock.tsx`, `shared-writing.tsx` | Normal durable drafts, page-bound pending review, definite-rejection restoration/unknown reconciliation; small adapter callbacks; practice finalization fix |
| `components/session.ts` / `session-core.ts` | Thread optional submission identity/outcome through normal adapters; remove only rejected optimistic appends; preserve stream/409 mechanics |
| Existing `src/server/chats.ts` ordering; `components/handwriting/device.ts` hook | Existing shared-writing directory purge covers bundles; extend device cleanup to new records, do not reorder server deletion |

Any required domain-format version change follows existing repository format conventions after inspecting their tests. Read relevant installed Next route-handler guides before implementation; no training-version API assumptions. Keep all UI imports through the core barrel and app effects through server barrel. The browser IndexedDB adapter is UI/device recovery, not a new server store writer.

## 9. Test gates and delivery order

Implement test-first at behavior boundaries; no new tests merely mirroring helper internals.

1. **History/identity:** deterministic v1 migration and page_initial; stroke/Clear/import/Restore each Undo/Redo through actual save/reopen. Specifically displaced page+background → Restore snapshot → later stroke → reload → Undo stroke → Undo Restore returns exact displaced working → reload → Redo Restore → Redo stroke. New edit after Undo clears active Redo; switching/Attach/matching Open do not. Full source and copies retain both histories and source restore branches; copies evolve independently. Replay/render source keeps erasable original ink independent of backgrounds. Real toolbar Redo is tested now, not deferred to #44. #47 owns mismatch/copy/Pages UI tests on this engine.

   **Efficient restore and causal recovery:** repeat Restore of snapshots that themselves include Restore. Count unique events/assets in serialized source; each repeated restore adds one event and no repeated ancestor journal/PNG. Validate cycles/missing references/conflicting IDs; memoized replay avoids repeated subtree expansion. Test parent ancestry versus restore-source reachability for late ACK/conflict handling, migration, active-stroke admission, local write failure and rapid reload. Source with active Redo freezes that exact full history. Open/content match is true after Restore and Undo→Redo even though sourceFingerprint changed; different editable content with equal-looking pixels still differs. No cross-page source-content deduplication.
2. **Atomic same-page replacement:** attach A(P), attach B(P) → only B pending; attach C(Q) → B+C pending. Submit A before B commits → A unchanged in transcript, B pending; B commits first → stale Submit A refused without accepting B implicitly. Duplicate P to Q does not alter either head; later Attach(Q) coexists independently, even if pixels match P. Test bundle/index write failures and crash windows: old head remains until atomic index publication; uncommitted bundles invisible; exact retry resumes; committed A retry after B never re-promotes A; repeat after B submitted never revives an older image. Same ID/different page/precondition/source rejects. Two unrelated-page commits preserve both; same-page stale CAS refuses. Inspectable superseded/submitted source bytes stay identical. Existing raw external pending behavior and deletion ordering retained.
3. **Local durability:** real IndexedDB/browser and controlled controller transactions. Attach finalizes speech then commits full source graph+RGBA+explanation; reload across encoding/upload/ACK cleanup boundaries. Explanation restores to original field without an attempt; unchanged Attach still saves it. Quota/corrupt data refuses unsafe upload/Send. Later drawing/Undo/Redo/Clear/Restore never changes frozen capture. Undo/Redo state survives reopen; graph/asset and displaced working cannot be partly saved. Wrong-page callbacks/deletion tombstones cannot recreate state.
4. **Submission identity/recovery:** real adapters for conversation, free-text, choice/Other/IDK/confidence, practice, drill. Definite rejection → normal edit → Attach same-page B replaces A → reload → ordinary Submit B plus unchanged other-page snapshots; A/source immutable. No checkbox or special rejected-answer mode. Lost ACK/delayed POST/exact Retry accepts one input. Unknown A plus Attach B: test both original-accepted and superseded-before-acceptance orderings; reconcile newer head **then** fresh record and never delete B on A's ACK. A failed read cannot resolve unknown state. Parallel-question receipt branch, late metadata after page switch, new draft protection and model Retry without new input covered. External unbound unknown attempts do not gain false page-head proof. Document existing partial-deletion limitations without reordering cleanup.
5. **Speech/pixels/UI:** controlled speech emits late finals after explicit Submit/Attach for all field owners; Attach finishes without any tutor POST. Practice/drill Submit includes final words. Offscreen ink/background included in 1400×1800 PNG; theme switch never changes source/PNG bytes. Pencil/touch controls, phone Chat, expanded→split, existing split unchanged, viewer and review remain usable; upload completion while writing changes layout only after stroke completion.
6. **Required sequence:** focused deterministic suites → actual Chromium handwriting/mobile adapter regressions → typecheck, lint, production build and diff check. Broaden only for new failures/unresolved concerns. Extend `tests/handwriting*.test.ts`, `tests/shared-writing.test.ts`, `tests/session-core.test.ts`, controlled speech tests, `scripts/smoke-handwriting.mjs`, `scripts/smoke-mobile-inputs.mjs`.
7. **Physical owner acceptance:** integrated iPad handwriting/speech/Attach/reload/submission, standard Undo/Redo after reload, normal rejected-answer correction, same-page supersession and unknown-delivery recovery. Distinguish scripted/live results. #47 verifies the **same** match/mismatch Open rule for pending/sent snapshots, all four selected options, missing-original create without overwriting other work, Restore→later edit→Undo/Redo across reload, and Duplicate from both menus without auto-attach. Independent stages coexist. Follow preview-slot workflow; this plan grants no slot handoff.

One verification receipt links approved plan, commits, failures/fixes, browser/build checks and physical acceptance. #46 delivers shared history/source mechanics and standard Redo with persistence; #47 supplies Open/import/Restore/copy/Pages interactions and their combined end-to-end gate. This file is the shared technical contract for parent relay to the #47 planner; superseded resumed-page mappings must not be implemented.

## 10. Final consequential approvals — granted

The owner approved the complete shared technical package: flat graph/asset history and migration/causal rules; Restore as one chronological undo boundary while retaining exact referenced source history; content-based editable-state matching distinct from full-source integrity hashing; atomic page-head supersession/receipt protocol; durable capture/submission recovery; one unresolved capture per page; originally manual upload Retry (superseded by the narrow automatic/ordinary-Attach approval above); local-commit durability boundary; no silent stale-capture rebase.

The owner also approved native IndexedDB recovery and **25 MiB source / 25 MiB PNG caps**. A graph over the cap is retained with an honest failure, never trimmed or flattened. Existing deletion ordering/limitations remain as documented. Product choices are settled: do not re-ask Open options, pending/sent parity, undoable Restore, Redo, Duplicate, same-page replacement, ordinary rejected editing or explanation durability. #46/#47 coordinate through §2 without a separate resumed-page mapping or checkbox substitute.
