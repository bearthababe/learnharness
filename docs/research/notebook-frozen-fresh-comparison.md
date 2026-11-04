# Frozen “fresh” transcription: five-setting comparison

2026-11-04. Read-only audit followed by three explicitly approved gap-filling
invocations: GPT-OSS medium, DeepSeek low, Cerebras Qwen low, in that order.
Maximum six calls including format retries, zero speech/Tutor calls, no saved
settings changes. Valid Terra low/GPT-OSS low evidence reused, not rerun.

## Result

**None of the three new invocations corrected the known “pressure” → “fresh”
transcription mistake or asked for clarification.** More GPT-OSS reasoning did
not resolve this case. Terra low is the only successful correction among these
five single observations; this is not a broad reliability estimate.

| Setting | Actual stored LaTeX | Classification | Editor time | Provider-attempt time | Evidence |
| --- | --- | --- | ---: | ---: | --- |
| Terra low | `p = \frac{F}{2A}` | Correction | Not separately recorded | 2,413 ms | Reused browser record |
| GPT-OSS 120B low | `fresh = \frac{F}{2A}` | Incorrect edit | Not separately recorded | 309 ms | Reused browser record |
| GPT-OSS 120B medium | `fresh = \\frac{F}{2A}` | Incorrect edit | **572 ms** | 570 ms | New frozen-input test |
| DeepSeek V4.1 Flash low | `\text{fresh} = \frac{F}{2A}` | Incorrect edit | **18,557 ms** | 18,556 ms | New frozen-input test |
| Cerebras Qwen 3.8 27B low | `fresh = \frac{F}{2A}` | Incorrect edit | **453 ms** | 453 ms | New frozen-input test |

GPT-OSS medium's stored string contains **two literal backslashes before `frac`**,
not just JSON escaping. No browser rendering was tested in this run. All three
responses were valid operation JSON; none triggered the application's format
retry. The parser permits unfinished/invalid LaTeX by design. Classifications
refer to recovering the known original spoken intent, not to a general rule that
an editor must silently correct every unusual word.

The table separates complete editor wall time (new direct tests) from the saved
provider-attempt timing (available for all five). These are **not in-app delays**.
The prior browser click-to-visible times were 2,995 ms for Terra and 859 ms for
GPT-OSS low; neither is substituted for editor time here.

## Exactly frozen input and criterion

Instruction, copied from the GPT-OSS browser execution input:

> Replace that formula with fresh equals force divided by twice the area.

Current state:

```json
{"lines":[{"id":"L1","latex":"p = \\frac{F}{A}"}],"undo":[[]]}
```

No cursor target or explicit selection, no archived Notebook entries. One prior
conversation exchange:

- Instruction: `Right pressure equals force divided by area.`
- Selection/cursor null.
- Response: insert `L1` with `p = \frac{F}{A}`, `after: null`.
- Working after that exchange: the same `L1` formula.

The original generated audio said **pressure**, not fresh. Expected correction
is replacement of `L1` with `p = \frac{F}{2A}` and the correct Undo snapshot.
A question would be classified separately as clarification and must leave state
unchanged. Keeping `fresh` is an incorrect edit for this known spoken intent.
The expected answer was not added to any model prompt.

All new invocations used the normal production prompt, without the experimental
unfinished-expression clause or history filtering. Full initial transmitted prompt
strings were asserted byte-identical across all three HTTP requests. The complete
source input also compares equal to Terra's earlier saved input. Production-prefix
hash matched the earlier GPT-OSS browser wire probe. Provider-specific wrappers,
models and reasoning effort naturally differ; input, conversation and app prompt
do not.

## What the audit established

- **Terra low and GPT-OSS low already had identical complete browser inputs** in
  both latest scenarios. Their replacement instruction contained `fresh`.
- **DeepSeek low and Qwen low previously received `pressure`**, not `fresh`.
  Their prior successes did not test this mistranscription. Qwen additionally
  used the revised prompt; DeepSeek used production wording.
- All four replacement contexts excluding instruction were equal. Independent
  Deepgram runs over identical audio caused the transcript differences.
- Initial-formula transcripts likewise differed: Terra/GPT-OSS received
  `Right pressure equals force in my by area.`; DeepSeek/Qwen received
  `Right pressure equals force divided by area.`
- The direct preservation fixtures already used frozen text and context. Eighteen
  rows across Zen low/off/shortlist and Cerebras off/low were checked against
  GPT-OSS low for exact input and initial prompt equality. Those comparisons do
  not need repeating because of browser transcription variability.
- No GPT-OSS medium result existed before this approved focused test. Unfinished
  `?` versus ellipsis notation remains unresolved; it was not tested here.

This new test changes DeepSeek's “fresh” handling status from **untested** to
**tested once, incorrect edit**. It does not retroactively change what input the
earlier browser run received.

## Reasoning, timing and validation

| New setting | Wire effort | Reported reasoning tokens | Cached input tokens |
| --- | --- | ---: | ---: |
| GPT-OSS medium | medium | 267 | 0 |
| DeepSeek low | low | 942 | 0 |
| Qwen low | low | 159 | 0 |

Each completed in one HTTP 200/model invocation, no transport or format retries.
DeepSeek's long response and reported reasoning are recorded; the evidence does
not isolate generation, queueing and network contributions or establish typical
latency. GPT-OSS medium's 570 ms provider attempt versus the prior low 309 ms was
261 ms longer in these samples and still retained `fresh`.

All edits created the expected Undo snapshot. Inputs were cloned afresh for each
model; prior test outputs never became the next model's context. A zero-network
preflight verified model resolution, effort and frozen input construction first.

## Accounting and evidence

- **3/6 calls**, zero retries, zero speech/Tutor calls. Three calls unused, no
  further test planned. No browser/app server launched.
- Cumulative **106 editor calls, 5 Tutor calls, at most 930.968 speech seconds**.
- Isolated Cerebras/Zen API-key file removed after execution. Source auth/settings/
  production prompt hashes unchanged. No subscription or speech credentials copied.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-fresh-frozen.json`, zero-network preflight and
  `check-28-fresh-frozen.mts`. Original baselines:
  `check-28-visible-catalog-reuse.json` and
  `check-28-visible-cerebras-gpt-oss-low.json`.

No saved model change, prompt revision, automatic transcription correction policy
or wider medium/browser trial follows from this result.
