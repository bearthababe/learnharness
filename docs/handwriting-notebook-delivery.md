# Saved handwriting delivery — #45

Implementation branch: `integration/handwriting-45`.
Scope and owner decisions: [approved plan](handwriting-notebook-plan.md).

## Implementation

The ordinary session header exposes **Write**. The isolated
`components/handwriting/` module carries the accepted canvas, corner-arc tools,
responsive split, Expand/Back and phone Write/Chat behavior.

Completed strokes, Clear and Undo enter a local recovery journal and synchronize
through `/api/chats/[id]/handwriting` to a separate session-owned record under
`LH_DATA_DIR/handwriting/`. Stable operation identities and causal-prefix checks
prevent late writes from replacing newer work. Editable strokes and Undo survive
reload; saving never submits tutor input or creates an attachment.

Read/reconciliation failures refuse blank replacement. Save errors retain working
and distinguish device-only, server-only and neither-copy-saved outcomes. During
a stroke, asynchronous status updates wait until writing finishes.

## Automated evidence — 2026-11-04

Implementation source `2a0deae`, merged with approved plan at `caab049`:

- Typecheck, lint and `git diff --check` passed.
- Twelve new deterministic handwriting tests passed; the final focused run passed
  **119 tests**, including session, shared-writing, drill, format and recovery
  regressions.
- `scripts/smoke-handwriting.mjs` passed actual Chromium controls and save/reopen
  requests: ink fidelity; Clear/Undo after reload; rapid/failed/held saves;
  automatic/manual retry; device storage failure; restore failure; session
  separation; ordinary teaching/practice/drill entry; Pencil-emulated activation;
  finger rejection; quiet writing; highlighter replay; split/Expand/Close and
  draft retention; phone focus containment; and Tools reload.
- Existing `scripts/smoke-mobile-inputs.mjs` passed with scripted tutor/speech
  fixtures, preserving mobile input, question, practice/drill and image behavior.
- Production build completed, including the handwriting route. The disposable
  build snapshot used an environment-only Turbopack root adjustment to resolve
  the external installed-dependencies symlink. Source configuration was unchanged.
- A full-suite run passed **2,553 / 2,555 tests** before three additional recovery
  cases were added and passed in the final focused run. Both failures reproduced
  on unchanged `5aefba9`: provider-runtime payload containment with external
  symlinked dependencies, and the existing drill-entry fixture's null
  `usePathname()`. They are not claimed as passing or fixed by this ticket.

All checks used isolated data. No live tutor/model calls were made. Evidence
logs are `/tmp/opencode/ticket45-{focused-tests,handwriting-browser,mobile-browser,production-build,tests,baseline-failures}.log`.
Detailed implementation report: `/tmp/opencode/ticket45-implementation-report.md`.

## Review and device acceptance

Independent standards/specification review is in progress. Physical iPad,
Safari and Home Screen acceptance remains required; Chromium input emulation
does not establish Pencil latency, palm rejection or iOS storage behavior.

The physical review must cover completed writing and persistent Undo after
reload, navigation/reopen and Home Screen relaunch, plus the accepted tools,
paper scrolling/pinch, split, Expand/Back and phone keyboard behavior. An
interrupted incomplete stroke has no zero-loss guarantee under the approved
contract. Existing unsent chat text retains its inherited full-reload behavior.

Keep #45 open until its required device acceptance is recorded. Production
handwriting submission and editable diagram/source reopening remain #46/#47.
