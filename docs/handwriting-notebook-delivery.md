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

## Standards

Independent review found three items, all corrected in `329677b` and verified
by the original reviewer:

1. Journal reconciliation policy was in the filesystem adapter, contrary to
   `docs/architecture.md`'s core-policy boundary. It now lives in pure core.
2. Undo availability repeated domain interpretation in browser recovery. It now
   comes from the same core replay that derives the visible page.
3. Duplicated drawing dimensions/colour/size values were a possible maintainability
   smell, not a demonstrated failure. Validation and UI now share core constants.

Original report and resolution: `/tmp/opencode/ticket45-review-standards.md`.

## Spec

Independent review found three defects, all corrected in `329677b` and verified
by the original reviewer:

1. An earlier save acknowledgment that blocked recovery could silently discard
   the next already-started stroke at completion. Admitted strokes now complete
   once into recoverable working, including a guarded separate recovery copy
   when the primary device journal cannot safely be replaced.
2. A failed local reconciliation read was mistaken for a write/quota failure,
   allowing editing too soon. Unreadable device truth now blocks editing and
   PUT until Retry successfully reconciles it.
3. Deleting a previously visited session could leave its local journal behind.
   The existing successful deletion callback now clears that session's device
   journal, recovery copy and visibility, invalidating mounted controllers so
   late responses cannot recreate them. Failed deletion retains working.

No scope creep was identified. Original report and resolution:
`/tmp/opencode/ticket45-review-spec.md`.

Review totals: **Standards 3 resolved / 0 remaining** (most significant: domain
policy outside core); **Spec 3 resolved / 0 remaining** (most significant:
accepted-stroke loss). Physical acceptance is a separate open gate.

## Correction verification and preview

- Corrected source: `329677bdcbfd218a0013d745ff21e273d628f567`.
- **123 focused tests passed**, including sixteen handwriting tests. Typecheck,
  lint, diff checks, actual Chromium drawing/recovery/deletion regressions and
  the final production build passed.
- Targeted red/green evidence covers all three recovery/deletion defects. Full
  disposition and log pointers: `/tmp/opencode/ticket45-review-fixes-report.md`.
- Slot 2 now serves the approved temporary handwriting review from
  `/home/bjorn/.cache/opencode/issue45/review-build-329677b/`, using isolated
  `/home/bjorn/.cache/opencode/issue45/review-data/` and isolated auth storage.
  The lesson-navigation preview is paused with its data retained for restoration.
- Review URL: [ordinary teaching session](https://thinkpad.tailfd9bf6.ts.net:8445/chat/handwriting_review_teach).
  Prepared practice/drill sessions are also available in the session list. These
  are writing/reopening fixtures; no live tutor or speech connection is configured.
- Local page and HTTPS teaching/practice/drill pages, session-scoped standalone
  manifests, Apple metadata and touch icons passed. The actual HTTPS UI passed
  Pencil-emulated drawing → **Tools → Reload preview** → exact ink restoration →
  Undo, with zero browser errors and zero tutor requests. The disposable browser
  verification session was deleted. Evidence:
  `/tmp/opencode/issue45-https-verification.json`.
- The initial verification script expected the older
  `apple-mobile-web-app-capable` tag. Installed Next emits
  `mobile-web-app-capable` plus Apple title/status metadata and touch icon; the
  assertion was corrected to inspect the actual supported metadata. No app
  metadata change was needed.

## Device acceptance — pending

Physical iPad, Safari and Home Screen acceptance remains required; Chromium
input emulation does not establish Pencil latency, palm rejection or iOS storage
behavior. Install once in Safari: **Share → Add to Home Screen → Open as Web App
→ Add**, then launch the icon. Slot 2 is temporarily this handwriting review;
other installed destinations at the same host follow its slot ownership.

The physical review must cover completed writing and persistent Undo after
reload, navigation/reopen and Home Screen relaunch, plus the accepted tools,
paper scrolling/pinch, split, Expand/Back and phone keyboard behavior. An
interrupted incomplete stroke has no zero-loss guarantee under the approved
contract. Existing unsent chat text retains its inherited full-reload behavior.

Keep #45 open until its required device acceptance is recorded. Production
handwriting submission and editable diagram/source reopening remain #46/#47.
