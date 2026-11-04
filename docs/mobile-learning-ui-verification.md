# Compact phone learning inputs — implementation evidence

2026-11-04 · #37 / #39 / #40 / #41; physical acceptance remains #42.

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

#42 remains open for the physical-iPhone retry and acceptance: actual
keyboard/safe areas, edge gestures, pinch zoom, VoiceOver, live microphone,
foreground/reconnect image recovery and a seated learning session with a real
tutor response. The owner has not accepted those physical-device checks yet.
