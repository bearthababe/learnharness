# Notebook + mobile acceptance — 2026-11-04

Authoritative combined verification record for #28/#18. Review baseline:
`d161c0d707e605e2a6ea5761b4f40bbd78dc0c58`. Notebook checkpoint: `2d43b41`.

## Approved behavior

- Tutor Send A: finalize its recording, then submit once.
- Notebook capture, Apply and handoffs settle before Tutor submission.
- Stop alone never Applies or Sends; switching never starts recording.
- Notebook has compact microphone controls inside its instruction input.
- Preserve accepted mobile layout, independent drafts and immutable snapshots.

## Software evidence

Logs below are under `/tmp/opencode/notebook-integration/`.

| Check | Result | Evidence |
| --- | --- | --- |
| Full automated suite | PASS: 2,692 tests / 499 suites | `check-28-mobile-tests.log` |
| Typecheck | PASS | `check-28-mobile-types.log` |
| Lint | PASS | `check-28-mobile-lint.log` |
| Production build (`LH_NOTEBOOK_PREVIEW=1`) | PASS | `check-28-mobile-build.log` |
| Standalone payload curation | PASS | `check-28-mobile-payload.log` |
| Baseline mobile browser flows | PASS | `check-28-mobile-browser.log` (baseline PASS precedes combined-scenario failure) |
| Combined Notebook browser flow | PASS | `check-28-notebook-browser.log` |
| Electron bundled-Node standalone smoke | PASS, including offline provider initialization | `check-28-mobile-electron-smoke.log` |
| Standards/spec review against mobile baseline | Completed; corrections being verified | Findings below |
| Combined slot 1 deployment and HTTPS/reload verification | Pending | — |

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

Review totals: Standards 1 boundary violation + 1 judgment call; Spec 1 defect.
The corrections and requested layout adaptation supersede the previously built
payload; rebuild and deployment verification remain required.

## Acceptance boundary

Physical iPhone/Home Screen and owner real-learning acceptance remain pending.
No additional live model comparison was run during integration. Prior cumulative
verification remains 512 editor dispatch attempts (510 reached providers), five
Tutor calls and at most 930.968 speech seconds. Software and emulated-mobile checks
do not establish physical iOS behavior or learning usefulness.
