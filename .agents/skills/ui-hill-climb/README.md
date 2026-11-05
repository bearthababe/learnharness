# Developing the UI hill-climb skill

**Status:** project-local draft under development, not globally installed. A subsequent iPhone run reached setup under the earlier instructions; the reviewer-led rewrite below has not yet been exercised.

We are testing whether a skill can make this workflow repeatable. A better-looking UI is an experiment outcome; it is not, by itself, evidence that the skill is well written or reusable.

## Document boundaries

- [SKILL.md](SKILL.md) is the agent-facing procedure: setup, shared rubric, independent scoring, reviewer-led promotion and bounded stopping. A short execution request delegates ordinary design choices; the agent gathers the remaining inputs rather than seeking another design mandate.
- [Council](../council/SKILL.md) supplies review orchestration for one bounded pass with the run's named panel. Reviewers decide promotion; the coordinator manages implementation, evidence, budget and history. This integration does not change the shared council skill.
- This README records why we are developing the skill, what remains unproven and what to learn from trials. It is not required reading for an ordinary hill-climb run.
- Optional project context lives in [`.ui-hill-climb.md`](../../../.ui-hill-climb.md); [the copyable template](assets/project-context.template.md) defines its sections. It supplies application criteria, target alternatives, reference qualities, review considerations and sourced owner requirements, not a run budget.
- [The history protocol](references/history.md) defines retained local archives under `.scratch/ui-hill-climb/runs/` in the main checkout. Freeze the skill/context used by each run so later skill audits do not confuse current wording with earlier instructions. Archives are git-ignored, not disposable or automatically backed up.
- The local session-2 plan (`docs/research/mobile-ui-hill-climb-session-2-plan.md`) is a superseded planning record, not startup instructions. Use current owner decisions and the skill for new runs; preserve earlier plans for auditing rather than inheriting obsolete constraints.
- The local session-1 retrospective (`docs/research/mobile-ui-hill-climb-retrospective.md`) records the earlier experiment's evidence and failures. That run informed this draft; it did not validate this skill or its new scoring system.

The historical research records named here remain in the development checkout; they are not included in this skill package.

## Current trial

The trial targets LearnHarness on a small-screen iPhone, with browser emulation supporting iteration and actual-device observations recorded separately. Learning-content usability is its application-specific addition to the shared rubric. Touch, small-screen, keyboard and orientation checks belong to this trial's conditions, not to every future use of the skill.

The owner selected up to five challenger rounds after baseline, with GPT-6.1 Sol/high and Opus 5.5/high reviewers, capped at twelve calls including failures. The subsequent execution request selected clean `origin/main`. These are trial decisions, not reusable defaults. The 9/10 target applies to every criterion from every reviewer; intermediate promotions may remain below it.

## Reviewer-led rewrite — 2026-11-05

Review of the subsequent session found excessive setup questioning, overlapping design authority and preservation rules that could freeze existing interaction mechanics. The owner approved reviewer-led promotion and removal of the repository's blanket human-design-approval section. The rewrite adds functional continuity to the shared rubric, routes tests and workflow checks to reviewers as evidence, and keeps only sourced owner requirements separate from preferences. Implementers explore; reviewers select; coordinators apply the verdicts and manage the run.

This changes the evaluation setup. Keep earlier frozen inputs and scorecards intact, record any adoption as a dated amendment, and score the current incumbent under the revised rubric before continuing comparable rounds. Editing these documents does not steer an already-running agent or retroactively validate its work.

In the development checkout, available session-1 evidence was imported into `.scratch/ui-hill-climb/runs/2026-11-05T143122Z-session-1-import/`, with its original layout preserved and baseline/round/role indexes added. The local archive-root README is the entry point. Original files remain in the old worktree; neither the archive nor those originals are included in this package. The import labels condensed reviews, missing raw transcripts and intermediate source gaps; it is not a retroactive run of this skill or the new rubric.

The local council source re-check (`docs/research/theo-council-orchestration-recheck.md`) confirms Theo used the skill for separate read-only reviews. The local council matches the pinned public text; the video shows a customized panel. Reuse its orchestration, not its default third reviewer or open-ended satisfaction loop. That research note records the earlier integration; the current skill is authoritative for reviewer-led promotion.

## What to learn about the skill

During the next authorized trial, record where the instructions succeed or need interpretation:

| Question about the skill | Evidence to retain |
| --- | --- |
| Can an agent begin from a short request without this history or a supplied plan? | What it discovers itself, which unresolved decisions it asks about, its compact run brief and any invented defaults or unnecessary questions. |
| Do reviewers apply the rubric usefully? | Separate scores, supporting observations, disagreements and ambiguous criterion boundaries. Agreement alone does not establish correctness. |
| Does council composition preserve the run contract? | Exactly the approved panel/settings, one pass per invocation, separate raw verdicts and synthesis, and no nested review loop or free retry. |
| Does the loop preserve one coherent incumbent? | Promotion decisions, rejected trade-offs and any attempted use of stale or transplanted category scores. |
| Do reviewers actually decide promotion? | Each explicit verdict, the resulting incumbent and any coordinator-created acceptance gate or withheld test evidence. |
| Are grades grounded in the experience actually inspected? | State checks, source/capture identities, interaction/device coverage and unsupported claims caught. |
| Does project guidance steer through criteria rather than freeze the design? | Criterion additions, sourced owner requirements, implementation choices mistaken for requirements and unnecessary approval questions. |
| Can a later skill audit reconstruct the run? | Frozen instructions/context, exact requests, available raw responses/transcripts, source/evidence identities, decisions and explicit omissions. |
| Does the agent stop and hand back honestly? | Budget accounting, below-target outcomes, unresolved checks and whether the owner can inspect the named build. |

These are observations to collect within the planned trial, not an additional review budget. Afterwards, revise instructions for demonstrated ambiguities or failures; keep application defects and capture-script bugs out of the general method unless they reveal a reusable decision rule. Report structural validation separately from observed agent behaviour.

## Before global reuse

The rewrite separates the text; it does not prove the workflow generalizes. Keep these checks open until supported by trials:

- [ ] **Application-specific additions:** verify that another run can add its own criteria and explicit owner requirements through project context without editing the shared procedure. Learning-content usability and LearnHarness product decisions stay outside the shared skill.
- [ ] **Device/input conditions:** verify that another screen or input setup can supply its own evidence requirements without inheriting iPhone, touch or narrow-screen assumptions. So far, actual-device acceptance for this trial is still pending.
- [ ] **Run configuration:** verify that optional Markdown context, discovery and focused questions produce a sufficient brief without requiring a long supplied plan. Keep model lineup, budgets, source/reference paths and project tooling in that brief, not hardcoded in the procedure. No machine-readable configuration parser is needed for this draft.
- [ ] **Behavioural validation:** record which skill version each trial used, what the agent actually did, changes needed and remaining untested cases. Do not describe a successful frontmatter/link check as a validated workflow.

The owner decides whether and when to make the skill global. No further experiment, generalization test, installation or publication is authorized by this checklist.
