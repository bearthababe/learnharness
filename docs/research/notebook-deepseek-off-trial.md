# DeepSeek through Zen: explicit reasoning-off diagnostic

2026-11-03. Owner requested DeepSeek without reasoning and approved **Run the off
trial**: the same two correctness cases, at most four calls including retries,
no speech, a trial-only explicit disabled request and unchanged saved settings.

## Outcome

**Reasoning was disabled in the observed responses.** Responses completed in
under one second, but the unfinished-expression case became a clarification
rather than the successful single-turn edit seen with low reasoning.

| Same fixture | Earlier DeepSeek low | Explicit off | Outcome with off |
| --- | ---: | ---: | --- |
| Unfinished multiplication | 2,893 ms, correct edit | **933 ms** | Clarification; working unchanged |
| Targeted pressure denominator | 1,591 ms, correct edit | **895 ms** | Correct edit; mistakes and unrelated working preserved |

These are **complete editor invocation times**, not click-to-visible measurements.
One sample per case/setting, no distribution. The off targeted-edit response
reported 512 cached input tokens; cache state/routing/timing are not controlled
enough to attribute every millisecond of improvement solely to reasoning.

The unfinished instruction was the same real-dictation fixture:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

Response:

> Should I insert this as a new line, and is the intended expression
> “300 × 50 − 300 × 3 + 3 + 6 × 47”?

It did not preserve the unfinished multiplication in its proposed interpretation,
and asked about inserting into an empty current Notebook. It made **no edit**:
the original empty state and Undo stack were exactly retained. The fixture's
single-turn edit/Undo-creation checks consequently failed; this is not evidence
of Undo corruption. Unlike the earlier Gemini/GLM cases, no incorrect edit was
applied. A learner clarification answer would add another turn and has not been
tested or counted as a completed edit.

For the targeted edit, output changed only `A` to `2A` in
`p = \frac{F}{A} \qquad 3 + 3 = 7`. It retained the incorrect `3 + 3 = 7`, the
separate `2 + 2 = 5` line, the unfinished `x =` line, and the proper Undo snapshot.

## Why this needed a trial override

The public [Zen model catalog](https://opencode.ai/inference/v1/models) advertised
`capabilities.reasoning.toggle: true` for `deepseek-v4.1-flash`, with efforts
low/high/max. The installed Pi 1.5.0 `opencode` entry instead has `off: null`.
Its `getSupportedThinkingLevels` removes null levels, and `clampThinkingLevel`
maps requested off to low. A local engine-resolution probe confirmed
`requested: off`, `resolved: low`, supported `[low, high, max]`, without a call.

DeepSeek's official [thinking guide](https://api-docs.deepseek.com/guides/thinking_mode)
documents Chat Completions `thinking: {type: "disabled"}`. Omitting reasoning
controls is not the same as disabled: its documented native default is enabled.

The approved diagnostic kept the production Notebook prompt, parser, model,
transport and existing one-application-retry policy. A **test-only `onPayload`
hook** removed the stock `reasoning_effort: low` and added
`thinking: {type: "disabled"}` immediately before transport. The trace records
stock resolution and the override separately. No production catalog, engine,
prompt or settings file was changed; this mode is not yet exposed through the
ordinary LearnHarness model selector.

## Wire and returned evidence

Both outgoing requests used `opencode/deepseek-v4.1-flash` at Zen's documented
Chat Completions endpoint, with explicit disabled and no leftover effort field.
Both returned HTTP 200, no reasoning-content characters, and explicit zero
reasoning tokens in standard `completion_tokens_details` **and** Zen's
`usage.opencode.tokens.reasoning` billing metadata. These observations support an
off-mode result for these calls, not an inference based solely on the UI label.

| Case | First final-text token | Full editor | Reported reasoning tokens | Zen reported cost |
| --- | ---: | ---: | ---: | ---: |
| Unfinished expression | 636 ms | 933 ms | 0 | $0.00032430 |
| Targeted edit | 762 ms | 895 ms | 0 | $0.00010867 |

First-text timing is measured at the provider stream callback. The complete
editor time includes local validation/application. Cost is the gateway's reported
balance charge, per [Zen inference usage](https://opencode.ai/v2/docs/console/api/inference#cost),
not an estimate from public token prices. No reasoning text was logged.

## Accounting and next interpretation

- **2/4 approved editor calls**, exactly two observed HTTP requests, no retries,
  zero speech/Tutor calls. Total reported cost **$0.00043297**.
- Source auth/settings hashes verified unchanged; isolated Zen-only key copy
  deleted. No browser/server process or occupied preview was touched.
- Cumulative verification **56 editor calls, 5 Tutor calls, at most 865.280 speech
  seconds**. Two remaining authorized calls unused; no further trial planned.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-deepseek-off.json`, zero-network preflight, and
  `check-28-deepseek-off.mts`. Prior comparison:
  [DeepSeek low and peers](notebook-zen-low-comparison.md).

DeepSeek/low remains the two-case correctness-positive setting; off is faster in
these samples but did not finish the difficult edit in one turn. The accompanying
[paid Zen catalog research](notebook-zen-speed-catalog.md) recommends Haiku 5.5/off,
Qwen3.8 Flash/off and GPT-6 Luna/off as the next untested candidates. No new model
trial, production off-mode wiring or default change is approved by this record.
