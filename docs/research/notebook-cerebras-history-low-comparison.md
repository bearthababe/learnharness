# Cerebras low: repeated history/prompt comparison

2026-11-03. Owner clarified “lite” meant low and approved **Run low comparison**:
same four prompt/history conditions as the off experiment, twice each, maximum
16 editor calls including retries, no speech and no application changes.

## Finding

**The revised prompt with historical entries absent preserved the intended
unfinished expression in both runs, at 750/933 ms.** This is promising evidence
for that exact combination, not a reliability estimate or approved context policy.

| Prompt | Historical entries | Intended edit | Editor times | Outcomes |
| --- | --- | ---: | --- | --- |
| Original | Present | 0/2 | 649 / 2,335 ms | Dropped unfinished term; then clarification |
| Revised | Present | 1/2 | 2,551 / 1,465 ms | Dropped unfinished operator; then preserved it |
| Original | Absent | 0/2 | 849 / 953 ms | Both reduced unfinished `3 × …` to `3` |
| Revised | Absent | **2/2** | **750 / 933 ms** | Both retained `+ 3 × \ldots + 6 × 47` |

All eight invocations used one model call, no application/transport retries.
Times include complete editor response plus local validation/application and
exclude deliberate pacing between calls. These are not browser-visible timings.

## Fixed input and treatment

The same instruction, empty current working, empty conversational history,
selection/cursor, historical entries and two prompt texts as the
[off comparison](notebook-cerebras-history-comparison.md). Input/prompt structures
were checked equal between evidence files. The only experiment-wide change was
reasoning **off → low**, with old entries still varied present/absent per condition.

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

The revised prompt adds exactly the already-approved general clarification:

> An unfinished expression is not, by itself, a reason to ask a question. Preserve
> the unfinished operator without filling in the missing value. Ask only when you
> cannot tell what to write or where to put it.

It contains no fixture answer, numbers or explicit historical-context workaround.
Historical entries were excluded only from isolated no-history trial inputs; no
saved records were removed and no production context-selection code changed.

## Output review

- Original/present first run omitted `+ 3 × …` altogether; second asked what
  follows “three times,” retaining state unchanged.
- Revised/present first run kept `+ 3` but removed the unfinished multiplication;
  second returned `+ 3 \times + 6 \times 47`, preserving the unfinished operator
  without inventing a factor. The existing fixture allows that unfinished form.
- Original/absent both returned `+ 3 + 6 \times 47`, losing the unfinished operator.
- Revised/absent both returned the desired
  `300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47`.
- All edits created the expected Undo snapshot; the one question retained the
  original complete state. None failed JSON validation. No LaTeX-matcher false
  negative was found in these eight results.

### Verified reasoning

Every outgoing request used `cerebras/qwen-3.8-27b` with `reasoning_effort: low`,
HTTP 200, and nonempty returned reasoning. Reported reasoning tokens by paired
run order: original/present **381/840**, revised/present **314/715**,
original/absent **425/531**, revised/absent **445/847**. Only reasoning character
counts and usage were retained, not reasoning text.

## Interpretation and limits

In these samples, low alone was insufficient, and the clearer prompt alone with
all historical context was inconsistent. Combining low with the clearer prompt
and omitting old entries was the first Cerebras condition to complete this exact
fixture twice correctly. The off experiment did not show that same consistency.

However, **two repeats of one difficult sentence are not broad acceptance**.
The history-free condition cannot establish whether requests to copy/refer to
historical work, clarification continuations or ambiguous targets would behave
correctly. Removing all history in production would discard useful context for
those existing requirements. No default/prompt/context change is authorized here.
Timing/provider variability also limits causal speed comparisons across runs.

If pursued, the next design question is how to make current work and optional
historical context unambiguous while preserving legitimate history-dependent
requests. That requires owner approval and broader checks; this trial does not
choose automatic filtering/routing or a new prompt on the owner's behalf.
DeepSeek/low still has the existing production-prompt preservation and full-browser
passes; Cerebras now has a concrete alternative worth further investigation.

## Accounting and isolation

- **8/16 authorized editor calls**, exactly eight HTTP requests, zero retries,
  speech or Tutor calls. Eight unused; no further trial planned.
- Cumulative verification **97 editor calls, 5 Tutor calls, at most 887.888 speech
  seconds**. Source auth/settings/production editor hashes unchanged; isolated
  Cerebras-only key copy deleted. No app browser/server launched.
- Minimum 13-second request spacing verified; waits between invocations excluded
  from editor time. No retry wait occurred.
- Evidence in `/tmp/opencode/notebook-integration/`:
  `check-28-cerebras-history-low.json`, its zero-network preflight, and
  `check-28-cerebras-prompt.mts --history --low`. Transmitted prompt/context/effort
  verified without recording credentials or authorization headers.
