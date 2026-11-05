# Compact phone learning inputs — implementation evidence

2026-11-04–05 · #37 / #39 / #40 / #41 / #42.

**Final owner acceptance — 2026-11-05:** the owner accepted the integrated phone
learning experience at `47887cd`: **“It's good enough to accept.”** This supersedes
the earlier pending-acceptance entries below. Closure was verified for
[#42](https://github.com/bearthababe/learnharness/issues/42#issuecomment-6660266480)
and parent [#37](https://github.com/bearthababe/learnharness/issues/37#issuecomment-6660270703).

The accepted corrections include `49f34f4` (actual frozen-opener anchoring and
retired sheet code) and `b4e200d` (owner-selected keyboard-docked search with
covered-opener hit-target/aperture protection). Independent correction re-review
reported zero documented Standards breaches and zero remaining Spec findings;
two nonblocking maintainability advisories remain. Overall card polish, a ~200ms
trial and raised-opener Usage placement remain in #50. Historical intermittent
browser/dictation findings are retained; acceptance does not claim every manual
check was individually performed.

## Actual main integration — 2026-11-05

The owner explicitly requested merging into the branch named `main`, then
approved adapting the phone/Notebook integration to main's file-aware editors.
`0348296` (upstream v0.5.0) and accepted source `47887cd` diverged in 29 files.
Resolution was performed in the isolated `integration/accepted-mobile-main`
checkout, retaining both histories. Merge resolution: `d335a37`.

Compatibility preserves upstream attachment/path editing, exact question
occurrence identity, CLI context/cache accounting, provider features and atomic
storage alongside Notebook persistence, compact dictation and the accepted
400ms card/4px blur behavior. Notebook checkpoints and image snapshots both stay
out of the ordinary chat response. The concurrent approved browser-receipt
improvement `eb47384` is included.

Validation on the isolated merged candidate:

- Deterministic suite: **3,760 passed, 4 skipped, 0 failed**;
  `/home/bjorn/.cache/opencode/accepted-mobile-main-tests-final.log`.
- Typecheck and lint passed. Production build passed;
  `/home/bjorn/.cache/opencode/accepted-mobile-main-build.log`.
- Offline standalone provider-runtime gate passed: all ten native chat
  implementations evaluated, 593 modules confined to the standalone payload,
  zero network attempts;
  `/home/bjorn/.cache/opencode/accepted-mobile-main-provider-runtime.log`.
- Original checkout preservation inventory: all **316** inventoried modified or
  untracked files unchanged; branch `integration/focused-drills`, HEAD `eb47384`.
  Inventory: `/home/bjorn/.cache/opencode/accepted-mobile-main-original-before.json`.

Retained browser attempts under
`/home/bjorn/.cache/opencode/accepted-mobile-main-runs/`:

- `mobile-input-browser-aXVdYQ`: exposed the missing file-editor focus lock;
  corrected to recognize `[data-file-path-input]` for locking and native scrolling.
- `mobile-input-browser-eHhOR0`: intermittent speech readiness timeout during
  geometry checks; cause unconfirmed. The unchanged next run passed that stage.
- Run 3 (`accepted-mobile-main-browser-3.log`): passed card/keyboard/Plan/image
  checks; stopped at an obsolete Other-answer input selector, now corrected.
- `mobile-input-browser-vELsEy`: passed inputs, both Notebook suites and Reveal;
  layout stopped at the old direct-import chooser assumption. The check now opens
  upstream's Files/Folder menu and chooses Files before awaiting the chooser.

Supplementary file-path checks initially encountered a too-long Chromium socket
path, then the desktop test selected the hidden phone Reveal button. The test now
targets the desktop Reveal control explicitly; app behavior is unchanged by this
selector correction. Final browser receipt and handoff are recorded below.

Aggregate run 5 passed **all three suites**, including the two Notebook checks:
`/home/bjorn/.cache/opencode/accepted-mobile-main-runs/mobile-input-browser-r0tTAC/result.json`.
This verifies compact path-aware input, immutable Notebook snapshots, saved
drafts/reload, dictation destination ownership, 400ms linear cards and blur,
keyboard-docked search, Plan pinch/pan, image/modal locking, Reveal and the full
phone layout/scroll-containment checks. This is browser emulation evidence;
physical phone acceptance remains the owner's accepted `47887cd` experience.

The supplementary Chromium path smoke passed home/new-session native editing,
chips and full-source clipboard, explicit Enter submission, reading/question/
practice drop routing and collapsed-draft preservation. Its first post-selector
run exposed a click before Notebook draft loading released `inert`; navigation
now waits for that release. Linux Electron startup also required retaining only
the display/auth-display environment alongside the otherwise isolated profile.
Retained logs: `accepted-mobile-main-file-paths-3.log` through `-5.log` under
`/home/bjorn/.cache/opencode/`.

### Verified mobile compatibility handoff

Product correction **`887496b`** preserves the accepted mobile focus lock with
upstream's file-aware editors. It also updates the Other-answer and import-menu
browser selectors. All product changes were exercised by the passing aggregate.

**Authoritative mobile browser receipt:**
`/home/bjorn/.cache/opencode/accepted-mobile-main-runs/mobile-input-browser-vbjX9v/result.json`
reports **passed** for `inputs-notebook`, `reveal` and `layout`, completed
2026-11-05 15:44:35 UTC. Recorded source is `e3437fb` plus working changes,
SHA-256 `224c0193005fa4d6481f7843525e43b3246884502f07e17f0f254c3537c8f470`.
Only the supplementary file-path harness changed after this snapshot; its final
run is recorded separately below. The combined handwriting integration must run
its own final aggregate against its combined source.

**Supplementary Chromium + actual Electron gate: passed**, all eleven checks,
zero visual/coverage failures. Receipt:
`/home/bjorn/.cache/opencode/accepted-mobile-main-file-paths-final-2.log`.
This includes the production sandboxed preload resolving an OS-backed Unicode/
backtick filename, virtual File returning empty, and a real DataTransfer drop
staging the exact full path at the caret without submitting or reading file bytes.

Earlier Electron failures were fixture-environment failures: stripped display
variables prevented startup, and stripped UTF-8 locale caused the Unicode file
selection to remain empty. A minimal upstream-preload probe reproduced zero files
under the stripped environment and one correctly resolved file under `C.UTF-8`.
The harness now retains display access and sets UTF-8; it also waits for the
controlled Send button to enable before the explicit Enter assertion. Failed
attempts remain in `accepted-mobile-main-file-paths-desktop*.log` and
`accepted-mobile-main-file-paths-final.log`; no application/preload change was
needed. Script syntax and diff whitespace checks passed.

**Integration coordination:** the owner's iPad session is combining accepted
handwriting `58280c9` with this candidate in its separate `integrate/main-ipad`
worktree. That session owns the final actual-`main` fast-forward and publish; this
branch supplies committed mobile compatibility corrections and verification.

Latest completion pass: [integrated #39 merge and #40/#41 regression evidence](verification/mobile-input-37-integration.md).

## Delivered and reviewed

- `fc71bd2`: owner-approved mobile groundwork and retained B prototype.
- `5aefba9`: compact conversation, reading, teaching and practice inputs;
  existing Model/Usage panels constrained to phone widths.
- `d22e714`: owner-approved practice correction: scrolling collapses the problem
  statement while keeping the compact input and recording controls available.
  The editor stays mounted, preserving its draft and recording timer.
- Photo/file uploads and the plus menu are deferred to #5/#36. Existing uploaded
  PNG review, enlargement and deliberate submission remain available.
- Independent standards review found no documented-standard violations and one
  nonblocking duplication advisory about the phone/desktop meter samplers. No
  additional speech abstraction was introduced for this presentation delivery.
- Independent spec review found the collapsed-practice recording-control gap.
  The owner selected the correction above; follow-up review confirmed it resolved
  without a new concrete regression. Existing submission contracts are preserved.

## Automated evidence

- Full suite against an exported committed tree at `d22e714`: **2,546 passed,
  zero failed** (499 suites). Dependencies were copied into that tree so the
  standalone-provider containment gate tested its actual expected boundary.
- Typecheck passed in the working checkout and committed-tree export. Targeted
  ESLint passed for changed production components and DOM test fixtures.
- `scripts/smoke-mobile-inputs.mjs`: passed using disposable sessions, actual
  request handlers/stores, scripted tutor responses, controlled speech and uploads.
  Coverage includes typed/spoken composition, finish-before-Send, persisted
  results, cancellation during finalization with selection/scroll restoration,
  connection/permission/retry feedback, automatic image arrival/session isolation,
  enlargement and deliberate Send; reading→reveal→answer ownership, selection/
  confidence/Other payloads; practice and drills, collapsed recording controls,
  preserved elapsed time and cancellation/retry while collapsed.
- The same browser suite checks 320/375/430px, long drafts, target hit-testing,
  keyboard-sized viewports, real Plan/Model/Usage panels, reduced-motion status,
  focus/gesture containment and wide-layout transition draft preservation.
- `scripts/smoke-mobile-layout.mjs`: passed against this checkout on port 3002
  with an existing session containing scrollable history. The harness now waits
  for the navigation opener's animation using a stable locator, selects the
  current session by `aria-current`, and avoids injecting storage access into
  sandboxed tutor-visual frames.
- `scripts/smoke-question-reveal.mjs`: passed against port 3002; speech finishes
  into reading thoughts before the check opens with a separate empty answer.
- Local page, root/session manifests, PNG touch icon and Apple metadata checked.
  Tools → Reload preview reloads the same URL and resets unsent local text.

The working checkout also contains separate uncommitted notebook code whose CSS
imports fail in the Node-only suite. Those files were preserved. The full green
result above is for the committed mobile tree, not the combined dirty checkout.
Chromium emulation/scripted speech is not physical iOS or live-tutor evidence.

## First physical-iPhone feedback and corrections

The owner reported two failures during the first iPhone walkthrough:

1. The empty reading-thought placeholder painted underneath the microphone.
   Reproduced visually in Chromium too. The phone input now reserves a real
   48px microphone lane rather than relying on textarea padding to clip text.
   Browser checks assert the editor ends before the microphone target; the
   corrected empty field was also checked on HTTPS 8446.
2. After Stop, a second recording appeared to start but had flat level bars and
   produced no text. Normal repeated Chromium capture passed. Simulating Safari's
   `interrupted` AudioContext state between captures reproduced a second run
   labeled Recording with zero PCM frames. The start path previously resumed
   only `suspended`; it now also resumes `interrupted`.

The audio start code was unchanged by the compact-input commits (`git diff
fc71bd2..0d82912 -- components/dictation.tsx public/worklets/pcm-capture.js` is
empty). This identifies a reproducible recovery gap, **not proof of the exact
state on the owner's phone** or a complete explanation of why it appeared now.
The owner approved both bounded corrections and a subsequent iPhone retry.

The real-UI regression now requires actual PCM frames from the browser microphone
and worklet on both reading-thought captures, with the second graph deliberately
paused and exposed as interrupted. Before the correction that run had zero
frames; afterward both captures produced audio and appended once. Speech
recognition remains scripted, with no provider/live-model trial. The full browser
suite, 13 targeted dictation/reading tests, typecheck and targeted lint passed.
Local WebKit could not launch because its installed runtime lacks
`libicudata.so.74`; this is not Safari/iPhone verification.

Reference: [MDN: resuming interrupted play states in iOS Safari](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state#resuming_interrupted_play_states_in_ios_safari).

## Preview ownership and remaining handoff

During verification another session moved the notebook integration build into
slot 1 (3000/8444). Slot 2 (3001/8445) is also occupied. The owner requested a
third slot rather than interrupting either session.

- This mobile checkout is running at `http://127.0.0.1:3002` using
  `next dev --hostname 127.0.0.1 --port 3002`.
- Private destination: `https://thinkpad.tailfd9bf6.ts.net:8446/`.
- Administrator mapping is now installed. Correct mobile app identity, page,
  standalone manifest and PNG touch icon were verified over HTTPS 8446.
- Shared slot assignments are recorded at
  `/home/bjorn/.local/share/opencode/preview-slots.md`. Notebook and mobile share
  the main-repo data/auth paths; coordinate agent-initiated writes and credential
  changes. Automated submission tests continue to use disposable data.

Keep the existing 443/8443/8444/8445 mappings and tailnet-only access. Do not
reassign this third slot while its Home Screen installation is in use.

8446 is a new launch destination. The owner can install:
**Safari → Share → Add to Home Screen → Open as Web App → Add**. Existing icons
for 8444 still open that slot's app. Reload resets unsent local work; saved history
persists. No service worker/offline caching was added.

**Subsequent owner retry, 2026-11-04:** the owner confirmed two consecutive
reading-thought recordings work on the iPhone after being asked to reload the
8446 preview: both show live levels and append text once after Stop.

#42 remains open for the other physical-device acceptance checks: actual
keyboard/safe areas, edge gestures, pinch zoom, VoiceOver, remaining microphone
paths, foreground/reconnect image recovery and a seated learning session with a
real tutor response. The specific recording retry does not establish those checks.
See the [final integration and phone handoff](verification/mobile-input-37-handoff.md)
for review results, HTTPS/reload verification and remaining acceptance scope.
