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
| V-5 | Permissions and shared run caps are enforced before live dispatch. | No live adapter is admitted. Controlled accounting tests exercise 30 requests, 12 turns and 20 minutes; they do not prove live enforcement. |
| V-6 | Evidence identifies candidate, configuration, expectations and actual environment without credentials/history. | Application/verification/spec fingerprints, isolated synthetic fixtures, local results/records/screenshots. No automatic publication or deletion. |
| V-7 | Selective human acceptance is last, on the reviewed and verified candidate before owner-approved merge. | Handoff below; no auto-merge. A candidate change invalidates affected acceptance. |

## Operator commands

`npm run test:learning` checks reporting, catalog validation and admission
mechanics without models.
`CHROMIUM_PATH=/usr/bin/chromium npm run verify:learning -- run` runs supported
reference workflow portions. Read its local `coverage.md` and `result.json`;
checks-passed does not mean the entire journey is verified. Evidence and fixture
profiles survive owned-process cleanup. Keep runs private and git-ignored.

`npm run verify:learning -- run --live` currently refuses before any credential
access or dispatch. Unlocking it requires owner-approved reference subject and
keys, independent evaluator calibration and an enforceable process/tool boundary
with shared accounting and cancellation. Do not copy normal connection secrets,
fall back to billing, infer an isolated data directory is a sandbox, or substitute
a passing faux-provider run for live tutor evidence.

## Final acceptance handoff

After machine proof and independent review, identify the final candidate SHA,
changed stories and their evidence. Name important residual uncertainty. For each
necessary human/device check give an action, expected result and why automation
cannot establish it; label Electron, iPhone and iPad and actual/emulated target.
Unrelated PRs need no repeated whole-app walkthrough. Ask for owner acceptance
only on affected risk, then for merge approval. A full-stop handoff leaves the PR
open and unmerged. Do not label missing prerequisites a pass or ask the owner to
repeat automated checks without a reason.
