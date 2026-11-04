# Compact conversation input — #39 verification

## Authority and scope

- Owner-authorized completion of #39 against prerequisite `fc71bd2`; implementation baseline `5aefba9` already includes compact inputs.
- [#37 owner revision](https://github.com/bearthababe/learnharness/issues/37#issuecomment-6629353085) and later revisions in [the spec](../mobile-learning-ui-spec.md) govern acceptance: omit the plus menu; preserve automatic handwriting review/enlargement and deliberate Send. Photo/PDF entry remains #5/#36.
- Approved seam: real browser UI plus HTTP submission/persistence, with isolated session data and controlled speech/tutor responses. Existing #40/#41 flows are regression coverage, not new work in this ticket.
- Initial clean branch `implement/mobile-input-39` had merge-base `5aefba922956aa4733fceb04475ac7965e6fc41b`, equal to the integration tip. No reset was needed.

## Reproduction

Node 26.7.0, installed Next 16.3.2, system Chromium, existing repository dependencies:

```sh
export PATH=/home/bjorn/.local/share/mise/installs/node/26.7.0/bin:$PATH
LH_MOBILE_TEST_DIR=/home/bjorn/.cache/opencode/issue39/mobile-input-browser-acceptance \
  node scripts/smoke-mobile-inputs.mjs
npm run typecheck
npx eslint scripts/smoke-mobile-inputs.mjs components/composer.tsx \
  components/compact-learning-input.tsx components/chat.tsx \
  components/stats-bar.tsx components/use-mobile-chat-focus.ts
npm test
```

The browser script owns a disposable app on `127.0.0.1:3109`, closes its browser and terminates its server in `finally`. Public preview slots and mappings are untouched. Fixture builds live on the home filesystem because `/tmp` reached its per-user quota; small run logs remain under `/tmp/opencode/issue39/`.

## Browser acceptance additions

**PASS:** complete expanded browser runs in `panels-native-scroll.log` and `final-browser.log` (2026-11-04), including the existing teaching/reveal, question, practice/drill and wide-layout regressions. The final run covers the script committed in `08f55c2`. These additions close verification gaps in an already-implemented baseline; no production correction was justified by the observed results.

| #39 boundary | Observable acceptance |
| --- | --- |
| Conversation layout | 12 combinations: 320/375/430px × 550/350px height × normal/enlarged text (125% root and 24px draft). Long drafts scroll internally; mic/Send and recording/finalizing Cancel/Stop/Send remain in-bounds, ≥44px and pass `elementFromPoint` hit tests. Grown field height remains stable. |
| Speech lifecycle | Real Chromium capture/worklet with fake device audio and scripted recognition; level bars and elapsed time progress, status is announced. Stop appends early/late finals once without sending. Cancel restores draft/selection/scroll and rejects late finals. |
| Submission | Mixed typed/spoken and empty-draft active-dictation Send finish recognition before submission, persist once through the real handler and survive reload. |
| Recovery/navigation | Permission denial → Retry; missing-key error → actual Deepgram Settings editor → saved test key → capture. Same-document Sessions navigation during pending permission, connecting, recording and finishing ends capture and rejects late results in the destination draft. |
| Uploaded working | Another session's upload remains isolated. Matching upload appears automatically. A disposable server-side SSE cut proves native EventSource reconnect resync. A genuinely hidden tab returns to foreground while notifications remain unavailable and recovers another missed image. No arrival/recovery sends a turn; deliberate Send includes all three images once. |
| Supporting panels | Real Model menu retains the entire installed catalog and a long-label entry. Model/thinking selections persist via the session API; every supported thinking level remains available. At 320/375/430 × 350, Model/Thinking/Usage/Plan fit; all 24 usage turns remain present and the overflowed final row passes a visible hit test. Actual Plan content and Fit remain available. Existing 550px panel checks remain. |
| Focus/modal ownership | Focused input → panels → dismissal retains draft and native-wheel reading position; blur releases the focus lock. Focused input → enlarged writing releases the focus lock while retaining the native modal's separate body lock/focus/inertness; Escape releases that lock and preserves draft/reading. Existing history/input edge, header/composer, pinch-event allowance, reduced-motion status and mounted desktop-transition checks pass. |

The fixture uses the production event handler and native EventSource; only its disposable route adds a transport-cut control. Chromium's offline emulation did not terminate an existing SSE stream, so that ineffective fault setup was replaced rather than counted as recovery evidence. Browser-generated audio and scripted transcripts establish integration, not live speech recognition quality.

Tests were extended and run in successive geometry, speech/navigation, upload-recovery and panel slices before considering production edits. Initial panel instrumentation set `scrollTop` while the inherited stick-to-bottom animation still owned scrolling; that produced a false reading-position failure (`panels.log`). Native wheel input, which actually expresses the learner's intent to stop following the bottom, passes per-panel position assertions (`panels-native-scroll.log`). No scrolling implementation was changed to accommodate the fixture.

## Baseline checks and diagnoses

- Typecheck and targeted lint passed (`typecheck.log`, `lint.log`).
- Relevant component/handler regressions: **70/70 passed** (`targeted-regressions.log`): dictation flow/warm tokens, handwriting submission, server notifications, composer actions/rendering, stats rendering/meter and menu placement.
- Full suite, initial and final runs: **2544 passed, 2 failed, 2546 total** (`full-suite.log`, `final-full-suite.log`). Both failures reproduce the audit's baseline; neither is introduced by this acceptance work.
  - `provider-runtime-payload.test.ts`: its positive control treats the checkout as a self-contained payload. The worktree's `node_modules` symlink resolves outside that payload, correctly tripping the confinement assertion. Running this worktree's `scripts/smoke-provider-runtime.mjs --standalone /home/bjorn/repo/teach/learnharness` passes all real installed Google/OpenCode/Copilot/xAI initialization probes with zero network attempts (`provider-installed-root.log`). No confinement rule was weakened.
  - `render-drill-entry.test.tsx`: the fixture provides `AppRouterContext` but no `PathnameContext`; `usePathname()` returns null and `AppShell` calls `startsWith`. These files predate #39's compact-input commit. The other session's uncommitted fixture correction was not copied and this unrelated test was not edited.
- Integration recheck at `3730a75` with a real, in-worktree dependency copy: **2545 passed, 1 failed, 2546 total** (`/home/bjorn/.cache/opencode/issue39/integration-full-suite.log`). The provider-payload positive control passes once dependencies are physically inside the payload root; only the previously diagnosed drill-render fixture fails. This resolves the environment-dependent provider failure without changing its confinement rule or production code.

## Remaining external acceptance

The coordinating session completed [HTTPS page/manifest/icon and actual Tools → Reload preview checks](mobile-input-39-https.md), then restored the prior slot-2 app. This implementation work never used either public preview slot. Physical iPhone keyboard clearance, safe areas, rubber-band containment, actual pinch zoom, VoiceOver, live microphone and a real-tutor learning walkthrough remain owner acceptance under #42. Chromium touch/keyboard-size simulation is not physical iOS acceptance.

Integration commit `e9b13bd` was merged into this branch as `ead364b`. Final cleanup confirmed no listener on the fixture port `3109`; the test-owned browser/server exited. The worktree remains `/tmp/opencode/issue39/implement` on `implement/mobile-input-39`.
