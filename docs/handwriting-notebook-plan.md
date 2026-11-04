# Saved handwriting notebook — #45

**Owner-approved implementation plan, 2026-11-04.**

Issue: [#45](https://github.com/bearthababe/learnharness/issues/45), part of [#4](https://github.com/bearthababe/learnharness/issues/4).

## Baseline and change

The inherited application owns resumable sessions through `src/core/ports.ts`,
`src/store/chats.ts` and `src/server/chats.ts`. The fork's reviewed PNG upload
path (`src/server/shared-writing.ts`) creates pending attachments. Neither path
stores unfinished editable handwriting.

The accepted local prototype is
`prototype/in-app-notebook-component-sized-card` (`c663dcecd22a`). It establishes
the canvas, Pencil controls and responsive notebook card. Its in-memory-only
concession does not apply to this integration.

The smallest extension is an isolated handwriting module with a small session UI
hook, dedicated session-owned storage and deletion integration. It preserves the
current committed application's mobile inputs (`5aefba9`). The prototype branch
must not be merged wholesale over that newer baseline.

## Owner decisions

- Add **Write** in ordinary teaching, practice and drill sessions. Start in
  normal chat; remember open/closed per session on this device.
- **Close notebook** returns tablet/desktop to full chat. Phones retain
  **Write/Chat** switching. Hiding preserves the mounted writing surface.
- Retain the accepted rounded four-corner frame, gaps, adjustable tablet split,
  wide side-by-side layout, independently scrolling paper and Expand/Back.
- Retain the accepted corner-arc tools, pressure-aware pen, four pen colours,
  remembered tool sizes during use, translucent highlighter, eraser, Undo and
  undoable Clear. Preserve Pencil release-inside activation, drag-away
  cancellation, compatibility-click suppression, finger/palm non-drawing and
  native pinch zoom. Only ink changes during a stroke.
- Restore editable working **and Undo history**, including undoing Clear,
  after reload, navigation away/back and reopening. The page continues across
  question/problem transitions and is isolated by session.
- Record each completed stroke, Undo and Clear locally immediately, then sync
  automatically to the computer running LearnHarness. The local recovery copy
  protects work while server saving is pending or fails. No Save/Attach/Send
  action is required. An interrupted incomplete stroke has no zero-loss promise.
- Failed saves retain work and offer Retry, with automatic retry too. Distinguish
  device-only saved work from work that neither location has saved. Show failures
  after a stroke, without changing writing controls during it.
- Restore/reconcile before permitting edits; a failed read must never become an
  empty page that overwrites existing work. Delayed requests/acknowledgments must
  not replace newer work or discard newer recovery data.
- Preserve tool settings, unsent text and reading positions during view switches.
  Full reload may use existing tool/layout defaults apart from remembered
  notebook visibility. This ticket does not add persistence to existing chat text.
- Saving handwriting does not reorder the sidebar, start a tutor turn, create or
  consume pending attachments, or mutate submitted images/conversation.
- Deleting a session deletes its handwriting. Pending saves must not recreate
  deleted session data. Unrelated session writes must preserve the notebook.

## Storage and compatibility boundary

Use the app's storage port / filesystem adapter / composition-root conventions
and `LH_DATA_DIR`. Keep handwriting in a separately versioned session-owned
record, with atomic replacement, guarded IDs and explicit corrupt/future-format
handling. Bulk strokes and Undo data do not belong in sidebar summaries or every
conversation refresh.

Represent editable strokes and history without quadratic persisted copies of
shared stroke prefixes. Keep local recovery writes off the pointer-move paint
path. Server-checked ordering and stable retry identity distinguish an actual
new edit from an old retried request; a timestamp or mount-reset counter alone
is insufficient. Genuine divergent histories must be retained and refused rather
than silently overwritten.

The conversational equation notebook in [#18](https://github.com/bearthababe/learnharness/issues/18)
is separate work. This ticket does not assume a shared representation, editor
commands or replacement architecture. Its storage/route names must remain
distinct so later integration can coordinate explicit hooks.

The ordinary integrated notebook in #45 delivers writing and recovery.
Production attachment/submission and diagram import/reopening are #46/#47;
additional tools, redesign, smoothing and native Pencil delivery are #44.
There is no offline-app or simultaneous multi-device-editing feature.

## Verification and completion

Use TDD with deterministic actual save/reopen interfaces and drawing controls.
Cover rapid reload before acknowledgment, failed/reordered saves, lost
acknowledgment, local storage failure, Clear/Undo after reopen, invalid/newer
formats, deletion races, session isolation, unrelated updates and no tutor or
attachment side effects. Exercise accepted layout and input behavior in a real
browser, plus existing mobile regressions, typecheck, lint and build checks.

Implementation uses its own branch/worktree, merges to
`integration/handwriting-45`, then receives standards/spec review. Record physical
iPad writing/reopen acceptance separately from browser emulation. Keep #45 open
until its required physical acceptance is obtained.

The owner approved temporarily using preview **slot 2**, port **3001** at
`https://thinkpad.tailfd9bf6.ts.net:8445/`, for device review, pausing the existing
lesson-navigation preview and restoring it afterward. Preserve its launch details
and data. Check the actual HTTPS page, manifest, touch icon and Reload action
before handoff. Existing Home Screen icons at that host share this temporary
slot change. The owner performs physical installation/review.
