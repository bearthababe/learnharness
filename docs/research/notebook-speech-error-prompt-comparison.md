# Distinguishing transcription errors from mathematical mistakes

2026-11-04. Owner approved GPT-OSS 120B/medium and DeepSeek V4.1 Flash/low on
three frozen cases, using the proposed general wording. Reuse matching original
results; run the two missing GPT-OSS medium preservation baselines. Eight new
invocations, maximum 16 calls including retries, no speech or saved app changes.

## Result

**Both models recovered `p` from the exact same “fresh” transcript with the revised
prompt.** Both retained deliberate mathematical mistakes in the targeted-edit
fixture. However, both asked for clarification on the unfinished expression;
DeepSeek had previously written that expression using the original prompt.

| Case | GPT-OSS medium original | GPT-OSS medium revised | DeepSeek low original | DeepSeek low revised |
| --- | --- | --- | --- | --- |
| “fresh” replacement | Incorrect `fresh`, 572 ms | **Correct `p`, 529 ms** | Incorrect `fresh`, 18,557 ms | **Correct `p`, 2,046 ms** |
| Target denominator; preserve mistakes | Pass, 299 ms | **Pass, 349 ms** | Pass, 1,591 ms | **Pass, 1,411 ms** |
| Interrupted multiplication | Clarification, 495 ms | Clarification, 423 ms | Preserved unfinished expression, 2,893 ms | Clarification, 2,922 ms |

Times are complete **editor wall times**, not full in-app delays. Original fresh
results and DeepSeek preservation results are reused; original OSS medium
preservation rows were newly measured. One observation per setting/case, not a
reliability rate or proof that the wording caused the timing differences.

This supports the prompt distinction as a useful hypothesis. It does not prove
the old preserve-mistakes clause alone caused the earlier failures, nor that this
addition is a reliable general fix. The unfinished-case change needs to remain
visible rather than counting all non-destructive questions as successful edits.

## Exact prompt treatment

Added this exact paragraph immediately after the normal preserve-mistakes/no-
unsolicited-mathematical-correction paragraph, retaining every existing rule:

> Preserve the learner’s mathematical mistakes and unfinished working. Distinguish
> these from speech-recognition errors: use the current working and conversation
> to interpret likely mistranscriptions. Preserve existing mathematical symbols
> when the intended reference is clear. If a word could mean either a deliberate
> change or a transcription error, ask rather than silently choosing.

No example answer, `fresh`, pressure-specific mapping or fixture numbers were
added. No earlier experimental unfinished-expression clause was combined with it.
The production prompt file was not edited. Trial-only `onPayload` substitution
changed only the prefix; every transmitted context/instruction suffix was checked
against the corresponding frozen original prompt. Saved `attempt.prompt` remains
the original editor construction; `requests[].prompt` records actual wire text.

## Inputs and actual outputs

### 1. Recover pressure from “fresh”

Exact instruction:

> Replace that formula with fresh equals force divided by twice the area.

Original `L1: p = \frac{F}{A}`, Undo `[[]]`, no selection/cursor or archived
entries, one previous exchange linking “Right pressure equals force divided by
area.” to that exact formula. Full input copied from the
[frozen comparison](notebook-frozen-fresh-comparison.md), not generated afresh.

Both revised responses were exactly:

```json
{"action":"edit","operations":[{"op":"replace","id":"L1","latex":"p = \\frac{F}{2A}"}]}
```

GPT-OSS original had retained `fresh` and an extra literal backslash before `frac`;
DeepSeek original had used `\text{fresh}`. Neither revised response had that issue.

### 2. Preserve genuine mistakes and unrelated unfinished working

Exact instruction:

> In the pressure formula on line three, replace the denominator A with 2A.

Current lines:

```text
L1: 2 + 2 = 5
L2: x =
L3: p = \frac{F}{A} \qquad 3 + 3 = 7
```

Empty conversation/history/Undo, no cursor/selection. Every compared response
replaced only L3 with `p = \frac{F}{2A} \qquad 3 + 3 = 7`. L1 and L2 remained
byte-identical; the deliberate mistake on L3 also remained. All edit responses
created the exact expected Undo snapshot.

### 3. Preserve interrupted multiplication

Exact instruction:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

Empty current working/Undo and conversation, null cursor, same two historical
entries as the earlier preservation fixture. No historical entries were removed.

New original GPT-OSS medium response:

> Do you want to write 300 \times 50 - 300 \times 3 + 3 \times ... + 6 \times 47,
> and if so, what should go after the "plus three, time" part?

Revised GPT-OSS medium response:

> Could you clarify the term after "plus three"? Do you want "plus three times ..."
> and what should be multiplied by three?

Revised DeepSeek low response:

> What should be multiplied by the 3 in “plus three times …” before “plus six times 47”?

All questions retained complete state/Undo unchanged. They did not delete a term
or silently fill in a value, but did not complete the intended unfinished edit.
DeepSeek's reused original response was:

```latex
300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47
```

The separate owner question about `?` versus ellipsis notation is still unresolved;
these three new responses do not settle it.

## Controls, usage and limitations

- All eight initial HTTP requests matched expected model, reasoning effort and
  complete transmitted prompt/context. GPT-OSS medium and DeepSeek low verified
  on wire; baseline input/prompt hashes verified before dispatch.
- Eight invocations, eight HTTP 200 requests, zero format/transport retries.
  Zero-call preflight passed all eight jobs before live execution.
- Reported reasoning tokens: fresh revised OSS/DeepSeek **216/173**; targeted OSS
  original/revised and DeepSeek revised **135/118/59**; unfinished OSS original/
  revised and DeepSeek revised **423/180/337**.
- Provider cache read **640 tokens** for DeepSeek targeted revised, OSS unfinished
  revised and DeepSeek unfinished revised; zero for the other new calls. Cache
  state is not controlled across historical/current results. No deliberate pacing.
- The fixtures do not include an explicit intentional variable rename, another
  novel mistranscription or repeated samples. The added caution about deliberate
  changes therefore has not been established as reliable by this experiment.
- **8/16 authorized calls**, zero speech/Tutor calls. Eight unused, no further
  trial planned. Cumulative **114 editor calls, 5 Tutor calls, at most 930.968
  speech seconds**.
- Source auth/settings/production prompt hashes unchanged. Isolated Cerebras/Zen
  keys deleted; no speech/subscription credentials copied or browser server started.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-speech-error-prompt.json`, zero-network preflight and
  `check-28-speech-error-prompt.mts`. Reused originals:
  `check-28-fresh-frozen.json`, `check-28-zen-low.json`.

No production prompt, saved default or context policy change is authorized by
these trial results.
