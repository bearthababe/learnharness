# Notebook + mobile acceptance — 2026-11-04

Authoritative combined verification record for #28/#18. Review baseline:
`d161c0d707e605e2a6ea5761b4f40bbd78dc0c58`. Notebook checkpoint: `2d43b41`.

**Control cleanup verified and deployed.** Application source `48224b9`, production
build `fHPXoJTBmay2lBmcEUHGR`, at **https://thinkpad.tailfd9bf6.ts.net:8444/**.
The current fork's native Electron app remains open; use **Reload preview** to
load the update. Physical phone and owner-learning acceptance are still pending.

## Card-content cleanup follow-up

Owner accepted the overall layout, rejected the crowded contents, and approved
the [compact controls/menu arrangement](notebook-ipad-layout-plan.md#approved-card-content-cleanup--2026-11-04).
The new controls are implemented, verified and deployed. Commits: `4223cdf`
(cleanup) and `48224b9` (shared styling scales). This supersedes the earlier
layout-only deployment without changing the URL or installed Home Screen identity.

- New header has icon Undo/Expand and one options menu; instruction/microphone
  and small Apply occupy one row. Secondary controls are portaled through the
  shared menu shell; clarification/error detail is expandable.
- Full suite passed **2,693 tests /499 suites** (`check-28-cleanup-tests.log`),
  including updated mounted model/history/speech controls. Typecheck/lint passed
  (`check-28-cleanup-{types,lint}.log`). Combined browser and layout flows passed
  (`check-28-cleanup-browser.log`): model save/locks, menu Enter/Escape, recording
  ownership, Stop/Apply/Send, notices, retained editors/scroll and phone geometry.
- Cleanup review: Spec found no implementation defect. Standards identified
  off-ladder font sizes and spacing in copied compact-input styling. Corrected
  these to shared typography tokens and the existing 4px spacing/radius scales.
  Standards reviewer confirmed both resolved in `48224b9`. **Open implementation
  findings: Standards 0; Spec 0.** The pending delivery steps are now complete.
- Final CSS geometry/notice/menu check passed (`check-28-cleanup-geometry.log`),
  including shared 16px input typography, >60% phone-card working area, menu bounds,
  native notice Enter, split/full/Close reading positions and keyboard gestures.
- Production build, payload curation and Electron bundled-Node smoke passed:
  `check-28-cleanup-{build,payload,electron-smoke}.log`. Offline provider smoke
  reached all initialization gates with **zero network attempts**.
- Final actual HTTP/HTTPS identity, compact controls, model-menu persistence after
  **actual Reload preview**, manifest/icons/Apple metadata and phone gestures
  passed: `check-28-combined-preview.json`, `check-28-cleanup-preview.log`.
- Build was staged from exact committed source with installed dependencies in
  `/home/bjorn/.cache/opencode/notebook-28-build-48224b9`, preserving the prior
  server during compilation. Production serves its `.next/standalone/server.js`.
  Server observed PID **3559293**, shell task `sh_1a888a8a7001AZsgOFrg3gMAx9`;
  launch log `notebook-cleanup-production.log`. Recheck identity before restart.
- Existing main-repo data/auth paths remain in use; production UI checks blocked
  owner writes and used in-memory Notebook responses. Native current-fork window
  PID **3540725** remains mapped. Slots 2/3 retain PIDs **3484369**/**3458594** and
  all Tailscale mappings remain unchanged. No new live comparisons were performed.
- For HTTPS re-verification of this deployment, set
  `LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-48224b9`
  when running `/tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.

Earlier whole-suite and deployment evidence below documents the layout build.

Current tracker receipt: [#28 cleanup](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6642995415),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6642997600).
Earlier layout receipt: [#28](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6642418525).

## Approved behavior

- Tutor Send A: finalize its recording, then submit once.
- Notebook capture, Apply and handoffs settle before Tutor submission.
- Stop alone never Applies or Sends; switching never starts recording.
- Notebook has compact microphone controls inside its instruction input.
- Preserve accepted mobile layout, independent drafts and immutable snapshots.

## Earlier layout-build software evidence

Logs below are under `/tmp/opencode/notebook-integration/`.

| Check | Result | Evidence |
| --- | --- | --- |
| Full automated suite | PASS: 2,693 tests / 499 suites, including layout integration | `check-28-layout-tests.log` |
| Typecheck | PASS | `check-28-layout-types.log` |
| Lint | PASS | `check-28-layout-lint.log` |
| Production build (`LH_NOTEBOOK_PREVIEW=1`) | PASS | `check-28-layout-build.log` |
| Standalone payload curation | PASS | `check-28-layout-payload.log` |
| Baseline mobile browser flows | PASS under new layout integration | `check-28-layout-browser.log` |
| Combined Notebook browser flow | PASS under new layout integration | `check-28-layout-browser.log` |
| iPad-style layout geometry/transitions | PASS, including corrected Close/reopen scroll regression | `check-28-layout-geometry.log` |
| Electron bundled-Node standalone smoke | PASS, including offline provider initialization | `check-28-layout-electron-smoke.log` |
| Standards/spec review against mobile baseline | Complete; all concrete findings corrected and verified | Findings below |
| Combined slot 1 deployment and HTTPS/reload verification | PASS | `check-28-combined-preview.json` |

Browser checks use disposable data and scripted providers. Baseline coverage:
conversation, teaching/reading/reveal, free-text/selection/Other answers, practice
and drills, speech recovery, image review, phone geometry and gesture containment.
Repeated Send/Submit during recording finalization persists final words once.
Combined snapshot/handwriting tests verify that both reach the model and transcript.

## Final review against `d161c0d`

### Standards

One documented boundary violation: `SessionModel.submitAnswer` and
`dismissQuestion` spread attachment objects after native request discriminants.
Corrected to copy only `submission` and answer `writingIds`, as required by the
approved correction plan. Existing callers had sanitized their objects.

One judgment-call duplication finding: Notebook and ordinary mobile focus hooks
duplicate viewport/gesture handling, with 768px versus 979px touch coverage.
Asked the owner about the behavior difference. Owner instead requested the iPad
notebook's overall page design, with equation Notebook below Tutor on phones and
split/full-page views. Layout adaptation is now awaiting the exact iPad-session
handoff and an approved concrete plan.

### Spec

One defect: a practice/drill image-only follow-up could resend already-consumed,
invisible thinking from the legacy field reference. A mounted real-draft
regression reproduced the duplicate; corrected the image-only path to submit
empty text when the owned draft has no content. All 30 targeted UI/activity/input
tests, typecheck and lint passed: `check-28-review-tests.log`,
`check-28-review-types.log`, `check-28-review-lint.log`.
No substantiated scope-creep findings. Physical-device and learning acceptance
remain separate open gates.

Initial review totals: Standards 1 boundary violation + 1 judgment call; Spec 1
defect. These and the later reading-position defect are resolved. The corrected
production payload has been rebuilt and deployment verification passed.

Follow-up Standards review through `f3d1c63`: clean. Earlier attachment copying
and touch coverage findings are resolved. Separate presentation follows the
owner's explicit direction to make later common-shell extraction straightforward.

Follow-up Spec review found one layout defect: effect cleanup read zero scroll
position after Close hid the card. Corrected to capture outgoing positions while
visible and never overwrite them from hidden cleanup. The real-browser suite now
explicitly asserts the 300px reading position survives Close/reopen; prior checks
already covered independent split/full positions and mounted editor identity.
The regression passed, and the Spec reviewer confirmed the correction in
`19e80dc`: no concrete remaining flaw. **Final open findings: Standards 0; Spec 0.**

## Approved iPad-style layout adaptation

Owner approved [the adaptation plan](notebook-ipad-layout-plan.md), including
implementation and deployment. Presentation follows handwriting source `329677b`
and the coordinating session's exact handoff; its module structure deliberately
keeps layout separate from equation editing for later common-shell extraction.

Notebook now has the rounded card and 16px gaps, below-Tutor layout until 980px
available workspace width, adjustable divider, and Expand/Back/Close without
remounting either editor. Starting proportions and focused-phone allocation
remain as approved. Touch focus protection includes 768–979px. The complete
automated suite, typecheck/lint, production build/payload, full baseline and
combined browser flows, targeted layout checks and final review passed. The
isolated browser harness required two setup corrections: retain viewport
emulation flags during width transitions, and seed localStorage only in the app's
top frame. Extra layout checks cover actual frame geometry, divider, mounted
identity, reading positions, keyboard and available-width rules. Browser screenshots
are in `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-20261104/`
as `notebook-{phone-split,phone-full,tablet-split,wide-split}.png`.

## Earlier layout-only deployment receipt (superseded above)

- Slot 1: localhost **3000** / HTTPS **8444**. Build identity confirmed in both
  local and HTTPS responses; `check-28-combined-preview.json` records all checks.
- Source `19e80dc`; build `P8NS9Q-Wp6wmWMML-2LhS`. Server observed PID **3540268**;
  shell task `sh_1a86d6776001IwvWoMIzkGinpz`. Log `notebook-combined-production.log`.
- Existing `/home/bjorn/repo/teach/learnharness/data` and `auth.json` paths retained.
  Automated production UI checks block owner writes and use in-memory Notebook
  responses. No credentials or saved learning data were copied/reset.
- Native current-fork Electron observed PID **3540725**, mapped `learnharness`
  window. Executable and working directory resolve to this checkout. Launch log
  `notebook-combined-electron.log` confirms `window open: http://127.0.0.1:3000`.
  Shell task `sh_1a86e3425001C2Op7x6lk0Izph` owns the launch.
- Actual Reload preview restores the fixture's saved model/draft. Page, manifest,
  icons and Apple metadata passed. Stable manifest identity `/notebook-integration`,
  root start/scope, standalone mode and original touch icon remain intact.
- HTTPS phone emulation passed instruction visibility and history/edge/header/input
  gesture containment, then lock release on blur/desktop transition. This is not
  physical iOS acceptance.
- Other preview processes remained: slot 2 PID **3484369**, slot 3 PID **3458594**.
  All existing Tailscale mappings, including 443/8443/8445/8446/8447, were retained.

Existing installed icon: use **Reload preview** (also available under Tools).
First installation: Safari → Share → Add to Home Screen → Open as Web App → Add,
then launch the icon. Reload restores saved working/drafts and interrupts active
recording; no offline service worker is added.

## Acceptance boundary

Physical iPhone/Home Screen and owner real-learning acceptance remain pending.
No additional live model comparison was run during integration. Prior cumulative
verification remains 512 editor dispatch attempts (510 reached providers), five
Tutor calls and at most 930.968 speech seconds. Software and emulated-mobile checks
do not establish physical iOS behavior or learning usefulness.
