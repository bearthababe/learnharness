# Zen low-reasoning editor comparison

2026-11-03. Owner approved **Compare all three** after the Gemini minimal trial:
Gemini 3.5 Flash-Lite, DeepSeek V4.1 Flash and GLM-5.3-Flash, all with low reasoning.
Two correctness cases per model; at most 12 editor calls including retries,
no speech, isolated data and unchanged saved settings.

## Results

**Follow-up:** owner-approved full-browser DeepSeek/low checks subsequently passed
at **2.099/1.979 s click-to-visible**, with no retries and later speech retained.
See [browser trial](notebook-deepseek-browser-trial.md). The table below remains
the original editor-only comparison.

**DeepSeek V4.1 Flash / low was the only candidate to pass both checks.** It is
the next candidate for full-path browser measurement, not an accepted default.

| Zen model, low reasoning | Unfinished multiplication | Editor wall time | Targeted edit | Editor wall time | Calls |
| --- | --- | ---: | --- | ---: | ---: |
| Gemini 3.5 Flash-Lite | **Fail:** dropped `+ 3 × …` | 3,885 ms, includes retry | Pass | 687 ms | 3 |
| DeepSeek V4.1 Flash | **Pass:** retained unfinished term | 2,893 ms | Pass | 1,591 ms | 2 |
| GLM-5.3-Flash | **Fail:** dropped `+ 3 × …` | 2,023 ms | Pass | 1,015 ms | 2 |

These are single-sample **complete editor invocation times** (production prompt,
transport, response validation/application, and any format/application retry).
They exclude speech, HTTP app handling, persistence to a learner's session and
browser rendering. They are not Apply-to-visible measurements or a latency
distribution. Prior Terra browser times cannot be compared directly to this table.

### Case 1: unfinished multiplication

The existing real-dictation fixture used in earlier Luna/Terra/Gemini checks:
empty current working, historical entries as read-only context, instruction:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

DeepSeek returned:

```latex
300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47
```

Gemini and GLM returned:

```latex
300 \times 50 - 300 \times 3 + 6 \times 47
```

Gemini also initially tried `replace L1` in an empty Notebook. The existing
application retry corrected the operation to `insert` but did not restore the
unfinished term. That repeats the earlier minimal-level failure, even though
the low-level retry reported reasoning tokens.

### Case 2: preserve mistakes and unrelated unfinished working

Input lines:

```latex
2 + 2 = 5
x =
p = \frac{F}{A} \qquad 3 + 3 = 7
```

Instruction: “In the pressure formula on line three, replace the denominator A
with 2A.” All three replaced only the denominator, preserving the first two
lines byte-for-byte and the unrelated incorrect equation on the affected line.
All accepted edits kept the expected Undo snapshot. This tests snapshot creation,
not a live Undo UI action. Clarification, longer histories, broader editing
coverage and physical-phone acceptance are not established by these two cases.

## Reasoning and transport evidence

| Model | Case 1 reported reasoning tokens | Case 2 reported reasoning tokens | Outgoing setting |
| --- | ---: | ---: | --- |
| Gemini | 0 first attempt + 518 retry | 0 | Google `thinkingLevel: LOW` |
| DeepSeek | 527 | 83 | OpenAI-compatible `reasoning_effort: low` |
| GLM | 81 | 0 | OpenAI-compatible `reasoning_effort: low` |

Low was verified both in the resolved Pi engine and on each actual HTTP payload.
Reported token counts are provider/adapter usage, not an independent view of
internal reasoning. Setting low does not guarantee a nonzero reported count.
All seven requests returned HTTP 200; seven editor attempts matched seven HTTP
requests, so no hidden transport retries were observed. The production editor's
one application retry remained enabled and counted.

## Isolation, accounting and evidence

- Production `runNotebookEditor` and `piEngineForSpec`, Pi 1.5.0, real Zen key.
- No application/prompt/settings change. A private trial-only auth file contained
  only the Zen API key; no speech or subscription credentials copied. Its copy
  was removed after the trial. Source auth/settings hashes verified unchanged.
- No test app servers/browsers started or existing preview processes replaced.
- **7/12 approved calls**, zero speech/Tutor calls; five unused, no additional
  trial planned under this comparison. Cumulative verification **54 editor calls,
  5 Tutor calls, at most 865.280 speech seconds**.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-zen-low.json`, zero-network `check-28-zen-low-preflight.json`, and
  runner `check-28-zen-low.mts`. Requests log only paths, reasoning controls,
  status and timing; no API key/header values.

Recommendation: measure DeepSeek/low on the two established full-browser cases
under a separately approved allowance before considering a saved-model change.
