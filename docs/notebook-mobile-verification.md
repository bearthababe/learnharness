# Notebook + mobile acceptance — 2026-11-05

Authoritative combined verification record for #28/#18. Review baseline:
`d161c0d707e605e2a6ea5761b4f40bbd78dc0c58`. Notebook checkpoint: `2d43b41`.

**Menu review and input-toolbar toggle verified and deployed.** Source `dedc04f`,
production build `-z6WGr6Dicog2N6G3hDO1`, at **https://thinkpad.tailfd9bf6.ts.net:8444/**.
The current fork's native Electron app remains open; use **Reload preview** to
load the update. Physical phone and owner-learning acceptance are still pending.

Current tracker receipt: [#28 menu review](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6644717383),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6644720461).

Earlier tracker receipt: [#28 continuation fix](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6643703927),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6643706613).

## Current-line, attachment indicator and clarification-close follow-up — verification in progress

Owner approved the exact additional current-line paragraph in
`src/agent/notebook-editor.ts`, a small non-clickable paperclip beside the Notebook
toggle (accessible name **Working attached**) for the current activity, and both
close controls completing while a clarification is retained. Closing finishes the
original recording, snapshots the last completed revision once, and preserves the
unanswered instruction/question for reopening. Ordinary, question/all-channel and
practice activity scope is shared between review and indicator.

Saved operation `05150765-f32b-49f5-91df-5703f95e136d` in “Handwriting trial” asked
“line 2, line 3, or both?” after the learner created line 3 and requested removal
of the multiplication sign in `p × A`. The request contained all 13 prior exchanges,
including the immediately preceding line-3 insertion; no explicit cursor was set.
Offline replay reproduced the exact clarification. The earlier wording emphasized
“that”/“set that equal to”; the approved paragraph covers ordinary follow-up edits
and says repeated expressions elsewhere do not alone justify clarification.

**4/4 newly authorized DeepSeek/low Zen checks passed**, one attempt each:
current-line edit affected L3 only; explicit switch affected L2 only; all-occurrences
edited L2/L3 while preserving `600 × 10`; no-history/no-target ambiguity asked and
preserved source. Receipt and copied inputs/raw responses:
`/tmp/opencode/notebook-integration/current-line-check-20261105/receipt.json`;
log `check-28-current-line-live.log`. Exactly **four** new provider calls, no retries,
Tutor calls, speech capture or learner-record writes. This new budget is exhausted;
the six calls from 2026-11-04 remain separately recorded.

An isolated real service/session reproduction also showed why Close failed:
`settle()` rejected the clarification before visibility could be saved. The new
named close handoff permits clarification only, captures by completed working
revision rather than the unresolved operation, and uses the existing persistence
and deduplication paths. Regression went red (`check-28-close-red.log`) and green
(`check-28-close-green.log`), covering original recording ownership, no Apply/Send,
retained question/instruction, repeated close, and durable reopening.

Verification before deployment:
- **126 affected tests passed** (`check-28-line-close-tests.log`). An additional
  running-edit→clarification close race was then added; both close tests passed
  (`check-28-close-green.log`), giving **127 distinct affected tests** covered.
- Typecheck/lint passed (`check-28-line-close-{types,lint}.log`).
- Scripted-browser Notebook and layout checks passed (`check-28-line-close-browser.log`):
  paperclip absent before attachment, present beside the toggle after capture,
  removed after accepted Send; actual icon and menu Close with clarification;
  one completed snapshot across repeated close; question/instruction retained on
  reload; original dictation ownership, review editing, keyboard/gestures, and
  phone/tablet/wide layouts retained. Artifacts:
  `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-line-close-20261105/`.
- Self-review: exact approved prompt wording; existing snapshot revision boundary
  and deduplication reused; only the named close handoff tolerates clarification;
  ordinary speech switching and other error handling retain their existing gates.
  The indicator and optional review use one activity filter.

## Menu review and input-toolbar follow-up — verified and deployed

Owner approved removal of inline previews, menu-only **Review attached working**,
editable explanation text (including current continuation), immutable ordered
snapshots, and review scoped to the current activity. Questions include Answer,
Thinking and Thinking while reading. Approved plain scrollable menu with Back and
“No working attached yet” empty state; opening inspects only, selecting a text
field uses existing Tutor handoff. The open/close icon moves below the active
Tutor input through `StatsBar.leadingSlot`; card Close remains in ⋯.

Implementation reuses `MenuShell` and the existing draft save/attachment paths.
Portaled review inputs carry their workspace identity, participate in the existing
Tutor handoff and mobile focus lock, and use a keyboard-aware menu viewport cap.
Closing an edited review releases its stale input reference. Input Enter inserts
a newline; menu Enter/Escape never applies or submits.

Full suite on the new application code: **2,694 / 2,695 passed**, with only the
new scope test failing on linkedom's lack of textarea defaultValue→value mirroring.
A standalone DOM reproduction confirmed that harness limitation. After correcting
the test to inspect React's initialized defaultValue, the affected UI/viewport/menu
tests passed; application code did not change for that correction. Logs:
`check-28-review-all-tests.log` and `check-28-review-final-targeted.log` under
`/tmp/opencode/notebook-integration/`. Browser checks also verify actual textarea
values and reload, rather than relying on the DOM emulator.

Final affected checks on source `dedc04f`: **135 tests / 3 suites passed**,
including Notebook UI/history/speech/activities, viewport locking, menu placement
and reading-thinking; **typecheck and lint passed**. Logs:
`check-28-review-final-targeted.log`, `check-28-review-types.log`,
`check-28-review-lint.log`. This follow-up made **zero live provider calls**.

Full scripted-browser run passed ordinary conversation, reading/reveal,
free-text/selection/Other answers, practice/drills, persisted submissions, speech
recovery, images/panels, phone focus/gesture checks, and the combined Notebook
flow including recording handoff into an earlier review field. Its final layout
check caught review dismissal refocusing the composer and retaining the keyboard
lock. The dismissal now updates future speech ownership without restoring input
focus; the browser regression explicitly requires release on Escape. Final
Notebook/layout re-verification **passed** in `check-28-review-browser-final.log`:
toolbar placement, no inline snapshots, earlier/current text editing and newline,
ordered explicit submission, reload, recording retained in its original Notebook
instruction when selecting review prose, no new capture/implicit Send, phone review
viewport/gestures, Escape release, tablet/wide layouts and retained split/scroll.
Artifacts: `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-20261105/`,
including `notebook-phone-attachment-review.png` and `notebook-phone-split.png`.
These are Chromium touch/keyboard emulation, not physical iOS acceptance.

Self-review against the approved follow-up and `docs/architecture.md`: UI changes
reuse the existing draft writer and speech handoff; no server/schema/model changes.
Review scope is current activity, snapshot order/source stay immutable, and the
shared menu's keyboard viewport option is opt-in for this editable review.

### Current deployment receipt

- Feature `ecb2afb`, focus correction **`dedc04f`**, build **`-z6WGr6Dicog2N6G3hDO1`**.
  Built from exact committed source in
  `/home/bjorn/.cache/opencode/notebook-28-build-dedc04f`; serves its standalone
  payload on the existing **3000/8444** slot. Prior builds retained.
- Production build, payload and Electron bundled-Node smoke passed:
  `check-28-review-build-final.log`, `check-28-review-payload.log`,
  `check-28-review-electron-smoke.log` under `/tmp/opencode/notebook-integration/`.
- Actual local/HTTPS build identity, single toolbar icon, menu-only review/empty
  state, actual **Reload preview** restoring fixture model/draft, manifest/icons,
  phone keyboard/gestures and desktop/blur release passed with **zero owner writes**:
  `check-28-combined-preview.json`, `check-28-review-preview.log`.
- Observed server PID **3638595**, task `sh_1a8d798bc001z04ZoQ0MDIOrkO`, log
  `notebook-menu-review-production.log`. Same existing data/auth paths. Native
  current-fork Electron PID **3540725** retained. Other slot PIDs **3484369** and
  **3458594**, all Tailscale mappings and the Home Screen identity retained.
  Recheck process identities before any lifecycle action.
- Verification command:
  `env LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-dedc04f node /tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.
- Use **Reload preview** in the existing app. Physical-device and owner-learning
  acceptance remain pending; #28/#18 remain open.

### Latest saved latency evidence

Read-only inspection of “Handwriting trial”, operation
`8126e5bc-d4db-41c5-88a0-1a60b3e76622`, instruction “Great. So that's equal to 600
times five, over a thousand.” Accepted `2026-11-04T22:40:39.077Z`, response finished
`2026-11-04T22:41:00.345Z`: **21,268 ms** accepted-to-result, **20,738 ms** in one
DeepSeek V4.1 Flash/low Zen call, approximately **530 ms** beforehand, **1,428
reasoning tokens**, no retry. Adjacent model calls took **3,068 ms** and **4,999 ms**.
Existing logs cannot distinguish provider waiting from generation time. No
latency model/reasoning change, new live calls or further instrumentation approved.

The oversized preview contained the pending ordinary Tutor draft's frozen
revisions **2, 8 and 11**, oldest first, with empty intervening text parts. The
latest version was present; this was an attachment review, not live Notebook state.

## Continuation interpretation correction — verified and deployed

Owner reported DeepSeek replacing the right side instead of extending an equality
and failing to identify the line currently being continued. The saved execution
inputs confirm full current Notebook and prior Notebook exchanges were supplied
(5 and 7 exchanges respectively); Tutor conversation is not part of this editor
context. The saved raw response itself replaced `p = F/A` with `p = 600/…`.
An offline replay through `runNotebookEditor` reproduced that removal.

Owner approved an exact continuation paragraph, regression checks and up to **3
DeepSeek/low via Zen calls** on isolated copies, with deployment conditional on
passing. First-round results (before the approved refinement):

- Append incomplete fraction: PASS, preserved `p = F/A` and appended `= 600/…`.
- Continue recently edited line: FAIL, asked whether line 1 or 2 and demanded
  the missing denominator, despite the recent correction and unfinished-work rule.
- Explicit replacement control: PASS, replaced only the final unfinished term
  with the dictated `200000`, preserving earlier expressions and the other line.

First round: exactly **3 provider calls**, no format retries. Overall semantic
check **failed**. Owner subsequently approved the two additional recent-line and
unfinished-expression rules in [the prompt plan](notebook-model-picker-plan.md),
plus up to three more targeted calls. **The refined second round passed 3/3**:
preserved `p = F/A` while appending the incomplete fraction; continued the recently
edited line with `= 600 × 3 ÷` without asking for its missing operand; and replaced
only the last term when explicitly instructed. The other line remained exact in
all cases. The refined prompt is now deployed in source `0370c06`, retaining the
owner-accepted compact controls from `48224b9`.
No learner records or settings were written.

First-round targeted receipt:
`/tmp/opencode/notebook-integration/continuation-check-20261104/receipt.json`;
that directory contains copied inputs, prompt hash, raw responses, usage and
per-attempt timing. Logs: `check-28-continuation-live.log` and
`check-28-continuation-replacement.log`. The first harness import failed before
any provider dispatch; it was corrected before the bounded run.

Final targeted receipt:
`/tmp/opencode/notebook-integration/continuation-check-20261104-r2/receipt.json`;
log `check-28-continuation-r2-live.log`. Exactly **3 additional provider calls**,
no retries; **6 total newly authorized editor calls**, all DeepSeek/low through
the production Zen engine. Each response was also inspected for preserved source,
unchanged unrelated working and requested unfinished/explicit-replacement behavior.

Offline context/application regressions: **14 tests passed**, typecheck/lint
passed (`check-28-continuation-{tests,types,lint}.log`). The new automated test
protects full-history transmission, whole-line application, unrelated source and
Undo; it does **not** establish model comprehension. The new frozen live-evaluation
case covers equality extension, unfinished working and explicit replacement.
Earlier trial totals remain separately recorded; this check adds **6** editor
dispatches/provider calls and no Tutor calls or speech capture.

Independent incremental review of `0370c06` within the owner-selected `d161c0d`
baseline: **Standards 0 findings; Spec 0 findings.** Review confirmed the two
paragraphs match the approved wording exactly, expected evaluation answers never
enter the production prompt, and no routing/state behavior changed.

### Earlier continuation deployment receipt

- Build **`bPCDlh2I36j3OP5uQhKBA`**, source **`0370c06`**, staged from exact
  committed source in `/home/bjorn/.cache/opencode/notebook-28-build-0370c06`.
  Production serves that directory's `.next/standalone/server.js` on3000/8444.
- Production build, payload and Electron bundled-Node smoke passed:
  `check-28-continuation-{build,payload,electron-smoke}.log`.
- Built server chunks contain both new continuation rules, and the source prompt
  hash equals the final live-checked prompt:
  `cc1ef0a555178a452681d8bc0953440f6b3438b47f25cf4d9309d8c7c05fd268`.
  Artifact: `check-28-continuation-bundle.json`.
- Actual local/HTTPS build identity, compact controls, model/draft persistence after
  Reload, manifest/icons and emulated phone focus/gestures passed:
  `check-28-combined-preview.json`, `check-28-continuation-preview.log`.
- Server observed PID **3582340**, task `sh_1a8a983ad001y5DtZBlJJoLyJc`, log
  `notebook-continuation-production.log`. Existing main-repo data/auth paths remain.
  Recheck process identity before lifecycle changes. Native current-fork Electron
  PID **3540725** remains mapped. Slots2/3 retain **3484369**/**3458594** and all
  Tailscale mappings are preserved. Saved learning data was not corrected/reset.
- Re-verification command uses
  `LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-0370c06`
  with `/tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.
- Owner accepted the compact controls for now; physical-device and real-learning
  acceptance remain pending. Use **Reload preview** in the existing app.

## Earlier card-content cleanup delivery

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

Earlier cleanup receipt: [#28 cleanup](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6642995415),
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
