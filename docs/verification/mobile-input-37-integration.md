# Integrated compact mobile inputs — #37 completion checks

2026-11-04. Implementation evidence for #39/#40/#41; physical acceptance remains
#37/#42. The owner approved this completion pass in
[#37](https://github.com/bearthababe/learnharness/issues/37#issuecomment-6633685128).

## Integration boundary

- Starting branch: `integration/focused-drills` at `d161c0d`.
- Incoming branch: `integration/mobile-input-39` at `690c58f`.
- Confirmed common ancestor: `5aefba9`.
- Integration commit: `36d8d5d`, with both tips as parents, on
  `implement/mobile-input-37-completion`.
- Isolated worktree:
  `/home/bjorn/.cache/opencode/mobile-input-37-completion/implement`.
  Dependencies are a physical worktree-local copy, not an external symlink.
  The home filesystem avoids the limited `/tmp` capacity.

The only conflicts were two browser-fixture hunks in
`scripts/smoke-mobile-inputs.mjs`. Resolution retains both the incoming unique
practice/drill titles and existing scrollable lesson history; it also retains
both native EventSource reconnect instrumentation and interrupted-AudioContext
instrumentation. No design choice or production conflict required resolution.

The resulting tree preserves the `d161c0d` microphone lane, interrupted-graph
resume and actual-PCM regression, plus `d22e714` practice-collapse behavior and
its recording-timer/cancellation/retry checks. It incorporates #39's shared
recovery operation and meter sampler with the complete expanded acceptance
script. Production changes relative to `d161c0d` are confined to
`components/dictation.tsx` and `components/compact-learning-input.tsx`.

Concurrent notebook edits in the main checkout were not copied into this tree.
No learner data, public preview process, slot assignment or Tailscale mapping was
changed. No push or issue closure was performed in this implementation pass.

## Reproduction and automated results

Environment: Node 26.7.0, Next 16.3.2, system Chromium 155.0.8059.84.
Logs and disposable fixtures are retained under
`/home/bjorn/.cache/opencode/mobile-input-37-completion/`.

Run from the isolated worktree:

```sh
export PATH=/home/bjorn/.local/share/mise/installs/node/26.7.0/bin:$PATH
LH_MOBILE_TEST_DIR=/home/bjorn/.cache/opencode/mobile-input-37-completion/mobile-input-browser-integrated \
  node scripts/smoke-mobile-inputs.mjs
npm run typecheck
npx eslint components/compact-learning-input.tsx components/dictation.tsx \
  components/reading-thinking.tsx components/question-dock.tsx \
  components/practice-dock.tsx components/chat.tsx components/composer.tsx \
  components/stats-bar.tsx components/use-mobile-chat-focus.ts \
  tests/render-drill-entry.test.tsx
NODE_ENV=test node_modules/.bin/tsx --test tests/dictation-*.test.* \
  tests/zero-keys.test.tsx tests/reading-thinking-field.test.tsx \
  tests/shared-writing.test.ts tests/server-events.test.tsx \
  tests/composer-actions.test.tsx tests/render-composer.test.tsx \
  tests/render-stats-bar.test.tsx tests/stats-meter-interaction.test.tsx \
  tests/render-practice-surface.test.tsx tests/render-drill-entry.test.tsx \
  tests/practice-flow.test.ts tests/practice-record.test.ts \
  tests/question-core.test.ts tests/question-tools.test.ts
npm test
```

| Check | Result | Local log |
| --- | --- | --- |
| Complete integrated real-browser flow | Passed | `browser.log` |
| Dedicated Reveal + mobile-layout browser regressions | Passed | `extra-browser-final.log` |
| Typecheck | Passed | `typecheck.log` |
| Targeted component/fixture ESLint | Passed | `lint.log` |
| Relevant regressions | 248 passed, 0 failed; 56 suites | `targeted.log` |
| Full suite | 2,546 passed, 0 failed; 499 suites | `full-suite.log` |

The browser script is ignored by repository ESLint; its coverage is execution,
not lint. `node --check scripts/smoke-mobile-inputs.mjs` and merge diff whitespace
checks passed. The earlier #39 full-suite limitation is resolved in this combined
tree: `d22e714` already supplies `PathnameContext` in
`tests/render-drill-entry.test.tsx`. The local dependency copy also satisfies the
standalone-provider containment test without weakening its boundary.

The combined browser run used disposable storage and the actual request handlers
with scripted tutor/recognition responses on localhost `3109`. It passed the
expanded #39 cases (12 width/height/text-size combinations, real hit testing,
empty-draft finish-before-Send, Settings recovery, navigation cleanup in all
capture phases, native EventSource reconnect and real foreground return, full
Model/Thinking/Usage/Plan content, modal/focus ownership) together with the later
teaching and practice corrections. In particular:

- Reading-thought capture produced actual PCM frames on both runs, including
  after an injected interrupted AudioContext; each transcript appended once.
  The mic-lane checks passed for conversation and reading thoughts.
- Reveal held the question closed while finalizing reading speech. The newly
  revealed answer was empty and ineligible until populated, took over dictation,
  survived collapse/reopen, and persisted typed/spoken answers with the separate
  reading thoughts. Selection confidence and multi-select/Other payloads passed.
- Both practice and drills retained visible recording controls while collapsed,
  preserved elapsed time on reopening, retained earlier text after Cancel,
  recovered permission errors through Retry/Connecting, finalized once and
  persisted the deliberate thinking submission.
- Existing history/input edge containment, native interior scrolling allowance,
  composer/header containment, pinch-event allowance, reduced-motion status and
  mounted transition to wide layout passed. These remain Chromium simulations,
  not physical iOS checks.

The dedicated `scripts/smoke-question-reveal.mjs` and
`scripts/smoke-mobile-layout.mjs` also passed against the same disposable app
restarted on localhost `3110`. The wrapper seeds a separate unrevealed teaching
fixture and enough disposable session rows to exercise navigation scrolling;
it then runs the repository scripts and stops the server. Reproduce with:

```sh
node /home/bjorn/.cache/opencode/mobile-input-37-completion/run-extra-browser.mjs
```

The initial dedicated layout run timed out reopening Sessions immediately after
selecting the current session (`extra-browser.log`). A narrowed replay captured
the click landing on the moving session title, not the opener, despite its
bounding box appearing stable (`layout-debug-repeat.log`). This was a browser
test synchronization gap: the layout test now waits for a real centre-point hit
on the opener before tapping. The corrected replay passed 10 reopen cycles
(`layout-debug-hit-ready.log`), followed by both complete dedicated scripts.
No production navigation behavior changed. Both fixture ports had no listener
after completion; no public slot was used.

The final full-suite result above applies to the final production tree.
Subsequent executable changes are limited to the browser-test hit-readiness wait
and the owner-approved shared target-check cleanup below, each verified by its
complete affected browser run and `node --check`.

## Independent review and bounded test cleanup

Independent review of `fc71bd2...5f7121a` reported **Spec: 0 actionable findings**
and **Standards: 0 hard breaches, 1 low-priority duplication advisory**. Reports
are retained beside the worktree as `standards-review.md` and `spec-review.md`.
The advisory identified duplicated touch-target geometry/hit assertions in
`checkPhoneInput` and `hitTargets` in `scripts/smoke-mobile-inputs.mjs`.

After confirming the clean worktree and latest integration tip were both
`5f7121a`, the owner approved only consolidating those checks into the existing
helper. Question/practice checks now call `hitTargets` for every button in their
compact field; the conversation path retains its existing first-match selectors.
Both paths use the same minimum 44px, viewport-boundary and centre-point hit
assertions. Missing matches still fail, and the nonempty-target requirement is
retained. No production code or new test abstraction was introduced.

Validation after this review-stage refactor:

- `node --check scripts/smoke-mobile-inputs.mjs`: passed.
- Complete affected browser suite: passed, including all 12 conversation geometry
  combinations, teaching-answer and practice/drill target checks, speech/recovery,
  interrupted-audio PCM, uploads/reconnect/foreground, submission persistence,
  panels and focus/gesture containment. Log: `browser-review-fix.log`.
- Disposable fixture: `mobile-input-browser-review-fix`, using localhost `3109`;
  no listener remained after completion. Public previews were untouched.
- `git diff --check`: passed. Full-suite/typecheck reruns were not required for
  this test-script-only correction; their production-tree evidence above remains
  applicable.

```sh
LH_MOBILE_TEST_DIR=/home/bjorn/.cache/opencode/mobile-input-37-completion/mobile-input-browser-review-fix \
  node scripts/smoke-mobile-inputs.mjs
```

## Acceptance interpretation

The governing #37 revision omits the plus menu and new upload pickers; the older
#40/#41 attachment-menu wording is superseded. Existing automatic uploaded-PNG
review, enlargement and deliberate submission remain in scope.

- #40 retains reading-thought ownership before Reveal, finish-before-Reveal,
  separate answer ownership afterward, existing question submit eligibility,
  collapsed-question input, choices/Other/confidence and submitted payloads.
- #41 retains the practice/drill submission policy and primary input ownership.
  Collapsing the problem keeps the mounted phone input and recording controls;
  reopening preserves draft and elapsed capture time.
- `tests/shared-writing.test.ts` exercises retained question/practice image
  references through the actual submission and transcript/model contracts.

These checks establish controlled browser/handler integration. They do not
establish physical iPhone keyboard/safe-area behavior, rubber-band gestures,
actual pinch zoom, VoiceOver, live recognition, or a seated learning session with
a live tutor. The owner's second-recording retry remains necessary under #42.
Prior HTTPS/Home Screen/reload evidence is recorded in
`../mobile-learning-ui-verification.md` and `mobile-input-39-https.md`; this pass
does not claim to have redeployed or reverified a public preview.
