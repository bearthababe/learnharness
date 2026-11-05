# Mobile input #37 — integration and phone handoff

2026-11-04. The owner approved completing the existing mobile implementation on
`integration/focused-drills`, preserving the later iPhone corrections and
concurrent notebook work. Implementation evidence is in
[the integrated verification record](mobile-input-37-integration.md).

## Integration and review

The completed #39 branch (`690c58f`) was merged with the existing teaching,
practice and iPhone fixes (`d161c0d`) in `36d8d5d`. The verified result reached
`integration/focused-drills` at `5f7121a` by fast-forward. All eight modified
tracked files and 279 untracked files present during integration were preserved:
status, staged/unstaged diffs, local index entries, content hashes, modes and sizes
matched the pre-merge snapshot. No push was performed.

The owner-approved test-helper correction was committed as `c1ab8fd` and
fast-forwarded into the same integration branch. The full affected browser suite,
syntax and diff checks passed; production code was unchanged by that correction.

The owner selected `fc71bd2` as the fixed review baseline. Independent reviews of
`fc71bd2...5f7121a` reported:

### Standards

No documented-standard violations. One low-priority heuristic advisory identified
duplicated geometry/hit-target checks in the browser acceptance script. The owner
approved consolidating those checks through the existing helper. Follow-up review
of `c1ab8fd` confirmed preserved assertions and resolved the advisory: **zero hard
breaches, zero remaining advisories, zero new findings**.

### Spec

No actionable findings. Review confirmed primary dictation ownership, safe
Reveal ordering, retained question controls/eligibility, persistent collapsed
practice input, existing submission policies, the approved microphone corrections,
and phone-only presentation. The later owner decision omits the plus menu and new
upload pickers while retaining existing image review and deliberate submission.

## Public preview

The existing slot 3 process serves the main checkout at `127.0.0.1:3002`, with
HTTPS 8446 proxying to that listener. Other preview slots and Tailscale mappings
were preserved; access remains tailnet-only.

Verified after integration:

- The intended LearnHarness HTTPS page returned 200 with mobile-capable metadata,
  Apple title/status metadata and the touch-icon link. Next renders
  `mobile-web-app-capable` for the configured capability.
- Root manifest returned 200 with stable `/` identity/start/scope and
  `display: standalone`; the touch icon returned 200 with a valid PNG signature.
  An existing teaching-session page and its session-scoped standalone manifest
  also returned 200 with the intended start URL and scope.
- At 375×667 in touch-emulated Chromium, **Sessions → Tools → Reload preview**
  loaded a fresh 200 document at the same URL and cleared the unsent Home-composer
  test draft. Non-read HTTP requests were blocked throughout this check.

No learner data or credentials were changed. The public preview includes the
preserved concurrent notebook edits in the working checkout. The full-suite
result applies to the isolated committed mobile tree, not that combined dirty
checkout. Browser checks do not establish physical iOS acceptance.

## Owner handoff

Stable destination: <https://thinkpad.tailfd9bf6.ts.net:8446/>.

For a first installation: **Safari → Share → Add to Home Screen → Open as Web App
→ Add**, then launch the icon. An existing 8446 installation can use **Tools →
Reload preview**. Reload resets unsent local work; saved history persists. Tailnet
access and a running host are required.

#40 and #41 were closed against the implementation and integrated verification
evidence. #37 and #42 remain open for the remaining owner acceptance.

**Physical-iPhone retry confirmed by owner in this session:** after being asked to
reload the 8446 preview, record reading thoughts, Stop, then record and Stop again,
the owner selected **“Both recordings work”**—both show live levels and append text
once after Stop. This is physical-device feedback for that specific repeated
recording path, distinct from the controlled browser evidence.

Still pending: the remainder of #42's seated learning, keyboard/safe-area,
scroll/gesture, VoiceOver, image-arrival/review and live-tutor acceptance. The
recording confirmation does not establish these other checks. The previous
interrupted-AudioContext reproduction establishes a recovery gap, not the exact
cause of the owner's original phone failure.
