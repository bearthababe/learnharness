# Cerebras historical-context isolation

2026-11-03. Owner selected **Run history comparison**: unchanged difficult spoken
sentence and current working, old entries present/absent crossed with the original
and already-clarified prompts, two runs per condition. Cap 16 editor calls including
retries, no speech, isolated data and no application changes.

## Finding

**History influenced the observed behavior, but removing it did not make editing
reliable.** With history, three of four runs asked questions. Without it, all four
runs edited, but three changed the intended unfinished expression.

| Historical entries | Questions | Edits retaining unfinished term | Edits changing its meaning |
| --- | ---: | ---: | ---: |
| Present | 3 | 1 | 0 |
| Absent | 0 | 1 | 3 |

Each row combines two prompts × two runs. Small sample, not a statistical estimate
or proof of the sole cause. No single prompt/context condition produced the intended
edit consistently across its two runs. Removing history changes willingness to edit
in these samples; it does not establish a safe context-selection policy.

## Conditions held fixed

Model `cerebras/qwen-3.8-27b`, off, identical production editor/parser and one-format-
retry policy. Current Notebook empty, no cursor/selection, conversation history
empty. Instruction unchanged:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

For absent-history conditions only `notebookHistory` changed from the same two
saved entries to `[]`. Exact transmitted entries, instruction, state and
conversation history were checked. Both prompt texts and hashes are identical to
the preceding [prompt comparison](notebook-cerebras-prompt-comparison.md); no new
wording or examples introduced.

Run order interleaved context conditions and prompt order:
present repeat 1 (original/revised), absent repeat 1 (revised/original),
absent repeat 2 (original/revised), present repeat 2 (revised/original).

## Individual outcomes

Times below are **complete editor time excluding deliberate rate-limit pacing**,
including model response and application-format retries. Raw wall time with retry
pacing is retained in evidence; no full-browser/user-visible latency measured.

| Context | Prompt | Repeat | Outcome | Calls | Editor time |
| --- | --- | ---: | --- | ---: | ---: |
| Present | Original | 1 | Question about editing/adding to old `+ 6 × 4` | 1 | 1,073 ms |
| Present | Revised | 1 | Kept unfinished `+ 3 ×` with LaTeX spacing before `+ 6 × 47` | 2 | 898 ms |
| Absent | Revised | 1 | Merged terms into `+ 3 × 6 × 47` | 1 | 311 ms |
| Absent | Original | 1 | Kept `+ 3 × \dots + 6 × 47` | 2 | 717 ms |
| Absent | Original | 2 | Merged terms into `+ 3 × 6 × 47` | 2 | 677 ms |
| Absent | Revised | 2 | Wrote `+ 3 × \text{time} + 6 × 47` | 2 | 595 ms |
| Present | Revised | 2 | Asked whether to add a new line or edit a line | 1 | 335 ms |
| Present | Original | 2 | Asked to confirm an expression omitting the unfinished multiplication | 1 | 331 ms |

All three questions left state and Undo unchanged. All five edits created the
expected Undo snapshot. The concern is the content of three accepted edits,
not loss of Undo or failure to parse their final JSON.

### Automated checker limitation and manual content review

The raw, unchanged fixture checker reported false for all unfinished-expression
checks. Two are **false negatives caused by narrow LaTeX matching**:

1. Revised/present/repeat 1 returned
   `300 \times 50 - 300 \times 3 + 3 \times \; + 6 \times 47`.
   `\;` is spacing, not an invented operand; the unfinished multiplication remains.
2. Original/absent/repeat 1 returned
   `300 \times 50 - 300 \times 3 + 3 \times \dots + 6 \times 47`.
   `\dots` represents the same ellipsis intent as the fixture's accepted
   `\ldots`/`\cdots` spellings.

Those two outputs are classified above by their actual retained mathematical
content. The raw checks/results are preserved; no paid call was repeated or
expected output secretly rewritten. Neither notation introduces a new math value
or changes the learner's terms. This review is distinct from broad UI/default
acceptance. The other three edits genuinely changed content by joining terms or
turning the interrupted word into the literal text `time`.

### Format retries

Four first responses used top-level `action: "insert"`, instead of the required
`action: "edit"` with an operations array. Existing local validation rejected them;
one counted application retry corrected the envelope each time. It did not correct
the wrong mathematics in the merged/literal-text cases. No hidden transport retries.

Every network request explicitly sent `reasoning_effort: none` and returned HTTP
200, zero reasoning-content characters and zero explicit reasoning tokens. Actual
HTTP request count equaled 12 editor attempts.

## Timing, isolation and accounting

- Calls spaced at least 13 seconds for the provider's trial-tier request limit.
  Between-case waits occurred outside editor timing. Retry pacing of
  **12,444/12,707/12,697/12,714 ms** is separately recorded and subtracted from
  reported editor times above. Raw retry-run wall times were
  **13,342/13,424/13,374/13,309 ms**. These pacing waits are harness behavior, not a
  measured provider delay or proof of real-app response time.
- **12/16 authorized editor calls**, including four application retries, no
  speech/Tutor calls. Four unused; no further experiment planned.
- Cumulative verification **89 editor calls, 5 Tutor calls, at most 887.888 speech
  seconds**. Original auth/settings and production editor hashes verified unchanged;
  private Cerebras-only key copy deleted. No app server/browser started.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-cerebras-history.json`, its zero-network preflight, and
  `check-28-cerebras-prompt.mts --history`. Actual prompt/context records contain
  no credentials or authorization headers.

## Conclusion

The results support historical entries being one source of confusion in this
fixture, but do not isolate a single fix. The spoken fragment itself and the
model's inconsistent handling of it remain relevant; explicitly telling it to
preserve unfinished operators did not consistently resolve that. No production
history removal, prompt change or default switch is justified by these samples.
DeepSeek/low retains the strongest existing fixture/full-browser result, with
the earlier small-sample reliability caveat still applicable.
