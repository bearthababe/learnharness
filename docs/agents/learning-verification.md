# Learning-story verification

Use `npm run verify:learning -- list` for the story map and
`npm run verify:learning -- select LJ-RETURN` to exercise a selected story and its
dependencies before implementing a feature. Missing checks, undefined/pending
steps and failures close that gate. This is an additive Cucumber lane alongside
existing lower-level tests, not a product gap implementation or data cutover.
See `verification/learning/reference.feature` and the owner-approved
`specs/2026-11-06-learning-journey-verification.md`.

## Story catalog

`verification/learning/stories.json` is the single canonical catalog. Each story
has a stable `LJ-` ID, a learner goal, approved sources, happy/alternative/
failure-or-return acceptance examples, dependencies, tickets, and three separate
facts: **availability** (`available`, `partial`, `unavailable`, `unknown`, from
source inspection), **verification readiness** (`executable`,
`missing-verification`, `blocked`) and the **run outcome**, which only a run's
`result.json` records. Child stories name a `parent`; never rename or reuse an ID.

`verification/learning/inventory.json` maps every intended behavior in the
reviewed approved sources (the spec, `docs/fork-vision.md`, `GLOSSARY.md`, #49
and the open #15 questions) to stories, or records an explicit exclusion or
deferral with its reason. A `blocked` story must name the owner decision that
blocks it in the catalog's `decisions`. The catalog writer drafts; only the owner
resolves decisions or approves expectations.

`npm run verify:learning -- validate` rejects duplicate or untraceable stories,
unknown sources or dependencies, cycles, missing acceptance examples, executable
stories without a tagged scenario (and tagged scenarios for non-executable
stories), unexplained exclusions and any #49 story that is not accounted for
exactly once. Every other command refuses while the catalog is invalid.
`npm run verify:learning -- report` prints the owner review view.

To add or split a story: add the catalog entry and its inventory trace, add a
Cucumber scenario tagged with the ID only when it really executes, then run
`npm run test:learning` and `validate`.

## Invariants

| ID | Required rule | Enforcement / remaining boundary |
| --- | --- | --- |
| V-1 | Selected stories have executable verification before feature implementation; future stories do not block unrelated work. | `select` resolves and runs required Cucumber scenarios, including dependencies; missing automation refuses. Delivery agents invoke it before feature work. |
| V-2 | Partial journeys and missing/failed/blocked/not-run/incomplete/uncertain evidence never become a pass. | Separate catalog availability and evidence outcomes; conservative aggregation and controlled report probes. |
| V-3 | Expectations are independently approved and never weakened to fit results. | Versioned approved spec fingerprint; subject key/calibration absent, so live execution refuses. Only the owner approves new keys. |
| V-4 | Every required subject/teaching expectation passes; uncertainty is unverified. | Per-step Cucumber aggregation for workflow only; independent tutor evaluator is not implemented and no accuracy claim is made. |
| V-5 | Permissions and shared run caps are enforced before live dispatch. | No live adapter is admitted. Controlled accounting tests exercise the owner's limits (100 learner turns; 1,000-request and 4-hour runaway guards; calibration not counted); they do not prove live enforcement. |
| V-6 | Evidence identifies candidate, configuration, expectations and actual environment without credentials/history. | Application/verification/spec fingerprints, isolated synthetic fixtures, local results/records/screenshots. No automatic publication or deletion. |
| V-7 | Selective human acceptance is last, on the reviewed and verified candidate before owner-approved merge. | Handoff below; no auto-merge. A candidate change invalidates affected acceptance. |

## Operator commands

`npm run test:learning` checks reporting, catalog validation and admission
mechanics without models.
`CHROMIUM_PATH=/usr/bin/chromium npm run verify:learning -- run` runs supported
reference workflow portions. Read its local `coverage.md` and `result.json`;
checks-passed does not mean the entire journey is verified. Evidence and fixture
profiles survive owned-process cleanup. Keep runs private and git-ignored.

### Live tutor exercise (LJ-TUTOR)

`npm run verify:learning -- run --live` refuses before any dispatch unless
`LH_LIVE_AUTHORIZATION=initial-exercise-2026-11-10` is set. That value covers the
owner-authorized initial exercise only; later live runs need a new owner
authorization. The answer key must be owner-approved and both the `claude` and `codex` CLIs present.

The run keeps a fixed order (`scripts/lib/learning-live-run.mjs`):

1. **Calibration.** GPT Sol (through the owner's Codex login, read-only sandbox) must
   reproduce every §7 outcome (56 in key v1.0.5) from a copy of the key with the outcomes and hinting
   labels removed. One mismatch blocks the run before any tutor session.
2. **Session.**
   - The tutor is an owned app copy on the Claude Code route. Its chat route,
     `verification/learning/live/chat-route.ts`, allows only teaching, question and
     planning tools (D-8) and refuses anything else.
   - The learner is Claude with no tools, in an empty directory, seeing only the brief
     and the visible screen. It drives the real learner UI.
   - No credential is copied. The app gets an allowlisted environment with no API keys;
     the CLIs use their own logins.
   - Turns and requests are admitted against `runLimits` before each dispatch. Every tutor
     model call passes a shared gate (`scripts/lib/live-gate.mjs`) inside the tutor's route,
     so a tool loop cannot dispatch past the request guard or the deadline. A deadline aborts
     the running turn.
   - Compaction calls outside the tutor's agent are not gated.
   - A CLI's own transport reconnects after a failed connection (for example Codex's
     bounded "Reconnecting… n/5") produce no model work and are not harness retries; the
     harness never re-sends a request.
3. **Grading.** If the guard refuses the grading request, the run stays
   *incomplete (stopped)* with its evidence, and nothing more is dispatched. Otherwise GPT Sol grades the full transcript. The run verdict is recomputed from
   the grader's per-expectation findings in key §5 order, and a disagreement with the
   grader's own verdict is recorded.

Evidence stays in the run folder: `calibration.json`, the `learner-*.json` turns,
numbered snapshots and screenshots, `transcript.md`, `grading.json`, `result.json`.
A faux-provider pass is never live tutor evidence.

## Final acceptance handoff

After machine proof and independent review, identify the final candidate SHA,
changed stories and their evidence. Name important residual uncertainty. For each
necessary human/device check give an action, expected result and why automation
cannot establish it; label Electron, iPhone and iPad and actual/emulated target.
Unrelated PRs need no repeated whole-app walkthrough. Ask for owner acceptance
only on affected risk, then for merge approval. A full-stop handoff leaves the PR
open and unmerged. Do not label missing prerequisites a pass or ask the owner to
repeat automated checks without a reason.
