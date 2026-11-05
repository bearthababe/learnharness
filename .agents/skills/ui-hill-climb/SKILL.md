---
name: ui-hill-climb
description: Run a reviewer-led UI hill climb through bounded implementation rounds, independent scoring and whole-app comparisons. Use when planning or running iterative UI improvements toward a quality target.
---

# UI hill climb

Run a **reviewer-led** hill climb. The owner steers through criteria and explicit requirements; the implementer chooses the design; independent reviewers decide promotion; the coordinator runs the process and records their decision.

Keep one **incumbent**: the best evidenced complete UI. Build a **challenger** from it and compare both under the same conditions.

## 1. Set up the run

Start with the request and existing approved decisions. A prior run plan is optional input, not required background. Inspect relevant project instructions, product docs, routes and UI, source/worktree state, startup/test scripts and available review/capture tools. Follow historical references only where needed to resolve a current source, constraint or known blocker.

Look for optional `.ui-hill-climb.md` at the project root, falling back to the main checkout if a linked worktree lacks it, or use the owner's explicit context-file path. Record its path and read the shared guidance and selected target. Several listed targets are alternatives; ask which to optimize for only if none is selected. A target name is enough to derive checks. If the file is absent, continue discovery; [the context template](assets/project-context.template.md) is optional.

Build a compact **run brief** from what is supplied or discovered:

- **Goal and target:** the experience to improve and the selected device/input conditions. A whole-app request includes every app surface; discovered workflows form an evidence checklist, not an implementation boundary.
- **Starting source:** the exact candidate, including relevant uncommitted changes. Identify concurrent work separately; resolve competing baselines instead of silently combining them.
- **Evaluation:** the shared rubric, owner-supplied additions and reference qualities. Expand criteria into observable checks from actual workflows. Record each hard requirement with its owner-provided source; use inferred concerns as review considerations.
- **People and limits:** implementer, independent reviewers, model settings and finite candidate/review limits. State whether the baseline review is additional and calculate total reviewer calls, including failed calls. Confirm model/tool support; resolve unavailable settings rather than substituting silently.

An execution request delegates ordinary UI decisions to the implementer and reviewers. Layout, navigation, controls, typography, palettes, motion and gestures are open to change within the requested experiment. Existing implementation choices are starting points, not additional requirements. Carry settled choices forward and resolve ordinary design trade-offs through the rubric. Ask only for missing inputs that prevent execution, conflicting explicit requirements or additional execution permission, such as spending beyond the budget. Label references by their actual provenance rather than assuming owner endorsement.

**Ready when:** the brief records the source, goal, target, rubric, explicit requirements and finite budget, and the requested run can execute. Publish it as a setup record, not a new approval gate for settled choices. For a planning-only request, hand it back here. For execution, use an isolated worktree and preserve the previous candidate and preview.

At authorized setup, read [the history protocol](references/history.md) and allocate the run archive under the main project's `.scratch/ui-hill-climb/runs/`, outside disposable worktrees. Freeze the actual skill/context inputs and retain instructions, reviewer responses, implementation records, evidence and decisions as they occur. Supply reviewers only their neutral packs, not earlier verdicts or the complete history.

## 2. Fix the rubric

Use these shared criteria and append the application's own criteria:

| Criterion | Assess |
| --- | --- |
| Navigation & orientation | Finding actions, understanding location and returning without losing context. |
| Typography & reading comfort | Hierarchy, contrast, labels, long-form reading and enlarged text. |
| Layout & space management | Useful working space and accessible content under the declared screen and input conditions. |
| Interaction & state clarity | Discoverable controls, usable input, focus, feedback, transient states and understandable motion. |
| Visual coherence & finish | Consistent controls, spacing, colours and visual language across the app. |
| Functional continuity | Preserve what users can accomplish: intended tasks and outcomes, unfinished work and data. The route, interaction sequence, controls and underlying implementation may change. A particular mechanism is required only when the owner explicitly specifies it. |

Score each criterion from 1–10:

- **1–2:** core tasks are effectively unusable.
- **3–4:** substantial obstacles.
- **5–6:** usable, but recurring friction.
- **7–8:** good, with identifiable weaknesses.
- **9:** excellent across the inspected conditions; only minor polish remains.
- **10:** no worthwhile improvement identified within the inspected scope, not universal perfection.

**Target:** every reviewer scores every criterion at least 9/10 on the same candidate, with required coverage assessed. This is the completion target, not the threshold for promoting an intermediate improvement. Report the full scorecard; neither the average nor the lowest score selects the winner. Mark unsupported judgments **not assessed**; required gaps block target success.

**Ready when:** criteria, anchors, references and coverage are fixed before the first review. Treat later changes as a new evaluation setup rather than a comparable score history.

## 3. Establish the incumbent

Prepare a runnable baseline using the project's existing startup, fixture and validation tooling. Identify required data/auth and service access; use disposable test data and keep paid calls, credential use or infrastructure changes within the authorized bounds. Record existing test failures separately from new regressions. If a known blocker needs repair before judging, preserve the original evidence and name the repaired source as the actual baseline.

Record source, fixtures, runtime configuration and capture-script identities. Build a coverage inventory from the declared workflows, including relevant empty, loading, error and transient states. Derive target-specific interaction checks rather than requiring the owner to enumerate them. Exercise tasks and verify postconditions before capture: an image saved is not proof of a state reached. Separate screenshot observations, interaction tests, emulation and actual-device observations; name unavailable paths as gaps.

Before reviewer calls, prove a trial evidence pack reaches its named states, displays its images and matches its source. Record task completion, wrong turns, lost work/context, inaccessible controls and clipping alongside visual evidence. Include test results, failures and known baseline defects. These are evidence for reviewers, especially functional continuity, rather than a separate coordinator promotion gate. Run the baseline audit through the council contract below.

**Ready when:** the starting candidate has an evidence-backed scorecard from every reviewer, with coverage gaps explicit. Repair faulty evidence before using it to drive edits.

### Council review contract

Use [council](../council/SKILL.md) in the existing coordinator for every review pass. Reuse its model resolution, parallel read-only delegation, response collection and synthesis; an additional orchestration delegate is unnecessary. Reviewers decide promotion under this skill's rule; the coordinator manages implementation, evidence, budget and history. Council's general pre-audit repair prerequisite does not apply: the hill-climb loop controls repair timing and supplies known defects as review evidence.

Supply council with the run brief and these explicit boundaries:

- **Named panel:** use exactly the approved reviewers and settings. This replaces council's default three-member/provider panel; report an unavailable member instead of adding or substituting one.
- **One pass:** return the separate reviews and a synthesis, then stop. The hill-climb loop owns fixes and subsequent passes; council's until-satisfied loop does not apply inside a pass.
- **Budget counters:** track candidate rounds (challenger iterations), review passes (panel assessments) and reviewer calls (individual invocations, including failed or partial calls) separately under the run brief's limits. Baseline reviews, retries and rebaselining consume reviewer calls without resetting any limit.
- **Independent evidence:** give fresh reviewer contexts identical verified evidence, rubric and references, with neutral build labels. Withhold prior grades, other reviewers' verdicts and the editor's preferred result.
- **UI verdicts:** request scores for every criterion, named states/conditions, reasons, strengths, regressions, missing coverage and blockers to the next grade. For comparisons, require an explicit **promote** or **retain** verdict for the complete challenger against the incumbent, with trade-offs and compliance with explicit owner requirements. Reviewers weigh test failures, distinguishing real regressions from baseline defects or assertions tied to an obsolete design. Missing evidence sufficient to prevent a decision means **unable to judge**, not an assumed promotion. A single overall code-review grade does not replace this scorecard.

Archive council's exact briefing, each delegate's raw response and available transcript, and the coordinator's synthesis separately. Preserve missing scores as missing; synthesis must not turn disagreement into unanimity or trigger an unbudgeted re-score.

## 4. Challenge the incumbent

1. **Improve.** Use weak criteria and existing strengths to guide exploration; reviewers resolve whole-app trade-offs. Category-leading alternatives are references, not interchangeable pieces: borrowing an idea creates a new candidate, and its old score does not transfer.
2. **Gather evidence.** Run relevant tests and workflow checks, then capture the challenger and incumbent with matched data, states and conditions. Include failures and their investigation in the review pack. If the capture protocol changes, recapture both. Keep timing-sensitive checks separate from capture load.
3. **Compare.** Run one council pass under the review contract above, comparing challenger with incumbent. Confirm suspected visual defects in full-resolution evidence before acting on downscaled images.
4. **Apply the verdicts.** Promote when every reviewer explicitly recommends **promote**; otherwise retain the incumbent and record disagreement, missing verdicts or inability to judge. The coordinator executes this decision without adding acceptance gates. Give reviewers explicit owner requirements and all known defects before they judge. If material new evidence appears afterwards, archive it and request fresh verdicts within the remaining budget; those reviewers decide any subsequent promotion. At the cap, report the issue and preserve the reviewed incumbent. Operational limits remain in force regardless of a design verdict.

**Round complete when:** both source snapshots, their evidence, separate reviewer verdicts and the promotion decision are recorded. Use the resulting incumbent in the next comparison; keep the original baseline as a historical reference.

## 5. Stop and hand back

Stop when the incumbent meets the score and coverage target, the authorized budget is exhausted, or an execution blocker prevents progress. Report which condition ended the run; a below-target result is a valid outcome, not permission to extend the budget.

Deliver the incumbent's source identity, separate scorecards and promotion verdicts, accepted/rejected changes, test/workflow evidence, coverage gaps and remaining risks. Provide a preview reachable from the declared target device and comparison images tied to the named source; verify access and image delivery. Preserve the reviewed incumbent when making post-review repairs: record them as an unreviewed challenger until reviewers promote it. Label that source **not re-reviewed** if no review remains.

**Done when:** the owner can inspect the best evidenced candidate and distinguish reviewed results from pending checks. Adoption, commit, push and merge remain separate owner decisions.
