# Complete Notebook model/prompt comparison — approved plan

2026-11-04. Owner requested a fresh complete suite with the new prompt and selected
**Every previous setting**, then **Run complete suite**: the case matrix and live
allowance below are approved. A subsequent explicit decision for case 9 uses the
historical accepted equation, treating the repeated 24 as a false start. Owner
also distinguished meaningful implied multiplication such as `F = ma`; that
preference does not add another live case to this 20-case authorization.

## Fixed treatment

Use the exact speech-error distinction paragraph from
`research/notebook-speech-error-prompt-comparison.md`, added after the production
preserve-mistakes paragraph. Retain every other production rule. Do not combine
the older experimental unfinished-expression paragraph or omit historical context.
No saved prompt, settings, model default or credential ownership changes.

Every setting receives the same complete frozen input for each case, including
current lines, Undo, conversation, selection/cursor and archived entries. Check
the transmitted instruction/context and prompt hashes for every provider adapter.
Independent cases never inherit another model's outputs. The clarification-followup
case uses one fixed prior question, not each model's variable answer.

## All 15 previously tested provider/model/settings

| Provider | Model | Reasoning |
| --- | --- | --- |
| ChatGPT subscription | GPT-6 Luna | medium |
| ChatGPT subscription | GPT-6.1 Terra | low, off |
| Zen | Gemini 3.5 Flash-Lite | minimal, low |
| Zen | DeepSeek V4.1 Flash | low, explicit off |
| Zen | GLM 5.3 Flash | low |
| Zen | Claude Haiku 5.5 | off |
| Zen | Qwen3.8 Flash | off |
| Zen | GPT-6 Luna | off |
| Cerebras | Qwen 3.8 27B | off, low |
| Cerebras | GPT-OSS 120B | low, medium |

Zen Qwen and Cerebras Qwen are distinct catalog models/routes. Preserve both.
DeepSeek explicit off repeats the earlier test-only `thinking: {type: disabled}`
override with `reasoning_effort` removed; stock off otherwise clamps to low.
Verify requested control and reported usage; do not silently substitute models.

## Twenty fixed cases

Existing evidence paths below are relative to `/tmp/opencode/notebook-integration/`.
Copy complete inputs from those records, not merely their instruction text.

| # | Case / instruction | Context and expected behavior |
| --- | --- | --- |
| 1 | `Replace that formula with fresh equals force divided by twice the area.` | Exact `check-28-fresh-frozen.json` input. Recover `p = F/(2A)`; clarification separate from correction. |
| 2 | `Replace that formula with pressure equals force divided by twice the area.` | Exact DeepSeek browser continued input. Replace existing pressure formula with `p = F/(2A)`. |
| 3 | `Right pressure equals force divided by area.` | Exact DeepSeek browser initial input, empty working/context. Produce pressure = force/area without a directional modifier. |
| 4 | `Right pressure equals force in my by area.` | Exact GPT-OSS browser initial input, empty working/context. Same intended pressure formula. |
| 5 | `Right pressure. Equals force divided by area.` | Exact Terra low initial clicked input in `check-28-visible-latency.json`. Same intended pressure formula. |
| 6 | `Write pressure equals force divided by area.` | Clean counterpart of case 3; otherwise identical empty context. Same intended formula. |
| 7 | Original interrupted `300 … plus three, time...` sentence | Exact first DeepSeek input in `check-28-zen-low.json`, including both historical entries. Retain all terms and unfinished multiplication without inventing a factor. |
| 8 | Same interrupted sentence without archived entries | Exact original/no-history input in `check-28-cerebras-history.json`. Same expectation; context differs only in this explicitly separate case. |
| 9 | Original `24 × 13` interrupted/restarted expansion | Exact first input of `check-28-terra-low.json`. Owner explicitly chose historical accepted `24 × 13 = 24 × 10 + 24 × 3`; treat repeated spoken 24 as a false start, without solving/simplifying the equation. |
| 10 | `In the pressure formula on line three, replace the denominator A with 2A.` | Exact second DeepSeek input in `check-28-zen-low.json`: preserve L1 `2 + 2 = 5`, L2 `x =`, and L3's `3 + 3 = 7`. |
| 11 | `Add a new line: y equals seven plus.` | Exact new-unfinished-addition input in `check-28-cerebras-prompt.json`. Keep existing `2 + 2 = 5`; append `y = 7 +` unfinished. |
| 12 | `Write five times eight equals five times ten minus five times.` | Exact new-unfinished-expansion input in that file. Retain `5 × 8 = 5 × 10 − 5 ×` unfinished. |
| 13 | `Change the denominator to 2A.` | Exact ambiguous-denominator-target input in that file: two candidate formulas. Ask; complete state unchanged. |
| 14 | `The second line.` | Same two-formula state as case 13, plus one fixed prior exchange: instruction from case 13, question `Which line's denominator should be changed to 2A?`, unchanged notebookAfter, null selection/cursor. Replace only L2 with `q = Q/(2A)`. |
| 15 | `Rename p to the literal word fresh. I mean the word fresh, not pressure. Keep the rest of the formula unchanged.` | Same pressure working/conversation as case 1. Intentionally rename to fresh, retain denominator A; do not silently undo the explicit request. |
| 16 | `Replace the entire first line with y equals 2.` | L1 `p = \\frac{F}{A} \\qquad q = \\frac{Q}{A}`, L2 `2 + 2 = 5`; otherwise empty history/Undo, null cursor/selection. Replace all of L1, preserve L2 byte-for-byte. |
| 17 | `Copy the first line of Entry 1 as a new line after my current working.` | Current L1 `2 + 2 = 5`, two archived entries copied exactly from case 7, otherwise empty history/Undo and null cursor/selection. Append Entry 1's first line as L2; retain current mistake and archives. |
| 18 | `Copy the first line from an earlier entry into my current working.` | Identical context to case 17. Two possible entries: clarify which; state and archives unchanged. |
| 19 | `Undo the last change.` | Current L1 `p = \\frac{F}{2A}`, Undo contains one prior snapshot L1 `p = \\frac{F}{A}`; otherwise empty context. Return undo, restoring exactly the snapshot. |
| 20 | `Correct only 3 + 3 = 7 on line three to 3 + 3 = 6. Leave everything else as written.` | Exact starting state/context of case 10. Correct only explicitly requested mistake; leave L1's mistake, L2 unfinished and pressure denominator A intact. |

For newly specified LaTeX, doubled backslashes in this table denote JSON/source
escaping; frozen runtime strings use one backslash per LaTeX command. Original
raw input and full transmitted prompt will accompany every result for inspection.

## Classification

- Report actual response and applied lines, not only a pass percentage.
- Separate correct edit, appropriate clarification, clarification instead of an
  expected edit, incorrect edit, unresolved unfinished notation and provider/format
  failure. For the transcription cases, recovery is measured against known audio
  intent; clarifying is non-destructive but not a completed correction.
- Never count question-mark, ellipsis and blank-factor notation as interchangeable
  accepted design choices. Record preservation of the unfinished operator and its
  exact notation separately, with owner acceptance unresolved where applicable.
- Recognize equivalent pressure notation/LaTeX spacing when meaning is unchanged;
  preserve unrelated existing source byte-for-byte. Manual review of apparent
  matcher failures precedes conclusions, without more paid calls.
- Every edit must preserve the correct Undo snapshot; questions/errors leave state
  unchanged; explicit undo restores exactly the preceding snapshot. Supplied
  historical entries are immutable.

## Approved allowance and execution

**15 settings × 20 cases × one fresh run = 300 invocations.** Maximum **600 model
calls including the editor's existing one-format-retry allowance per invocation**.
No automatic provider retries. Zero speech/Tutor calls. These are editor tests;
existing browser timing evidence remains separately labeled.

Run zero-network fixture/prompt/control preflight before live dispatch. Freeze
the complete case manifest before the first call and do not change it mid-suite.
Use bounded sequential requests and provider pacing if necessary, recording
pacing separately from editor latency. Checkpoint results and every dispatched
request; never replay an unknown completion after interruption. Mark unavailable
models explicitly; stop that setting after provider failure rather than silently
retrying. Retain all slow/error observations.

Use isolated API-key copies for Zen/Cerebras and isolated data. Subscription runs
use existing approved credential leases, without copying subscription credentials
or taking over another live owner. Check ownership before running and report any
blocker. Preserve all existing previews and native-app processes.

Deliver one matrix with all actual outputs, classifications, editor and provider
times, retry counts, effort verification, usage/cache evidence and links to the
frozen case context. Per-setting summary includes successful-case count and median/
range across these different workloads, explicitly not a repeated-case latency
distribution. Retain earlier prompt results for comparison; every matrix cell
here is newly run with the new prompt, as requested.

Clean up isolated credentials after execution and verify source settings/prompt
hashes. Any additional repeats, browser/speech trials or production changes require
their own decision.

## Completion

All 300 cells completed; [report and full matrix](research/notebook-complete-model-comparison.md)
and [portable evidence](research/notebook-complete-model-comparison-data.json).
316 actual provider requests, including 16 format retries, plus two local
zero-network Gemini preparation failures = 318 editor dispatch attempts, within
600. Gemini's test harness AbortSignal handling was repaired and verified offline;
only its unmeasured cells then ran. No speech/Tutor calls or production changes.
