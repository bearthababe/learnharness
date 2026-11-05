# Cerebras Qwen 3.8 27B/off: correctness and latency

2026-11-03. Owner added a Cerebras key and selected **Run the comparison**:
two preservation fixtures followed by the two established full-browser speech
cases **only if correctness passes**, at most eight editor calls including retries
and 80 speech seconds, isolated data and saved settings unchanged.

## Follow-up: low reasoning

Owner then selected **Run low comparison**, approving the same two cases and
conditional browser stage, up to eight editor calls including retries and 80
speech seconds. **Low still clarified on the unfinished expression.**

| Case | Off editor wall time | Low editor wall time | Low result |
| --- | ---: | ---: | --- |
| Unfinished multiplication | 538 ms, clarification | **1,602 ms** | Clarification; state unchanged |
| Targeted denominator | 456 ms, correct | **442 ms** | Correct; preservation checks passed |

Low response on the difficult case:

> You said "plus three, time…" — what number does 3 multiply by, or was that a
> false start and the expression is just 300 × 50 − 300 × 3 + 6 × 47?

This is a clarification, not a destructive edit. It did not demonstrate completing
the agreed unfinished-expression fixture in one turn; no answer/follow-up was
tested. The input state and Undo stack were unchanged. The targeted edit again
preserved wrong equations, unfinished unrelated working and its Undo snapshot.

Both actual requests sent `reasoning_effort: low`. They reported **1,559/124
reasoning tokens**, respectively, and nonempty reasoning stream content (only
character counts, not reasoning text, were captured). One HTTP 200/model attempt
per case, no retries. The stock production prompt, engine and adapter were used;
no override or source/config change. Both-cases completion gate remained false,
so the conditional full-browser stage was not run.

These are single-sample editor-only times. The 14 ms difference on the simple
case is not evidence that low is generally faster than off. Low added reasoning
time on the difficult case without changing its clarification outcome.

Usage: **2/8 authorized editor calls, 0/80 speech seconds**, zero Tutor calls.
Source auth/settings hashes verified unchanged; isolated key copy removed.
Cumulative verification **69 editor calls, 5 Tutor calls, at most 887.888 speech
seconds**. Six calls/80 seconds unused, no further trial planned. Evidence:
`/tmp/opencode/notebook-integration/check-28-cerebras-low-correctness.json`,
its zero-network preflight, and `check-28-cerebras.mts --low`.

DeepSeek/low remains the candidate that completed both fixtures and the
full-browser comparison. No default or prompt change was approved here.

## Outcome

**Fastest observed targeted-edit response so far: 456 ms, correct.** The difficult
unfinished-expression fixture instead returned a clarification in 538 ms, so
the two-edit correctness gate did not pass and the conditional browser tests
were not run.

| Case | Cerebras Qwen/off editor wall time | Result |
| --- | ---: | --- |
| Unfinished multiplication | **538 ms** | Clarification; working and Undo unchanged |
| Targeted pressure denominator | **456 ms** | Correct edit; mistakes/unrelated source preserved |

Single samples, no retries. These are **complete editor times**, not full
click-to-visible latency. Response-to-clarification time is not time to a completed
edit. No one-second full-browser completion claim follows from these numbers.

## Exact behavior

The first case reused the same real-dictation instruction, empty current Notebook
and read-only historical entries as previous comparisons:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

Response:

> Which part do you want to write exactly as "plus three" and "time ..." vs the
> corrected version from the notebook history (L1 of Entry 2:
> `300 \times 50 - 300 \times 3 + 6 \times 4 = 7`)?

It asked instead of inserting the unfinished multiplication. Its wording calls
an older historical entry a “corrected version”; that interpretation is not an
owner-approved correction. No edit was applied and input state was retained
exactly. The automated edit/Undo-creation checks returned false because this was
a question, not because any existing working or Undo was lost. No clarification
answer/follow-up was tested.

The second case changed only denominator `A` to `2A` in:

```latex
p = \frac{F}{A} \qquad 3 + 3 = 7
```

It preserved `3 + 3 = 7`, separate lines `2 + 2 = 5` and `x =`, their IDs and the
proper Undo snapshot. One valid replacement operation, no format retry.

## Transport and timing verification

- Stock production `runNotebookEditor` prompt/parser/retry policy and
  `piEngineForSpec`; installed Pi 1.5.0 `cerebras/qwen-3.8-27b`.
- Engine resolved **off**. Both actual Chat Completions payloads sent
  `reasoning_effort: "none"` to `https://api.cerebras.ai/v1/chat/completions`.
  No payload override or adapter/application change.
- Both responses had **zero explicit reasoning tokens and zero reasoning-content
  characters**. Two editor attempts matched two HTTP requests, both 200.
- First final-text token: **430 ms in each case**; total editor **538/456 ms**.
  Complete model responses were then parsed/validated/applied locally. No speech,
  HTTP application queue, persistent learner session or browser display is included.
- Usage: first case **982 input/73 output**, second **709 input/72 output**;
  both reported zero cached tokens. No actual billed-cost field was returned in
  captured usage, so no measured dollar spend is claimed.

## Interpretation

The measured speed makes Cerebras worth further consideration, but off has not
shown the same two-case single-turn fidelity as DeepSeek/low. A separately
approved low-reasoning comparison was subsequently run, as recorded above; it
still clarified on the difficult case. Neither trial changes the gate or the
Notebook prompt/default.

DeepSeek/low remains the candidate with passes on both preservation fixtures and
the [full-browser checks](notebook-deepseek-browser-trial.md). Its ~2-second visible
times are a different measurement from this editor-only table.

## Isolation and accounting

- **2/8 authorized editor calls**, zero retries, **0/80 speech seconds**, zero
  Tutor calls. Six calls/80 seconds unused; no further trial planned.
- Cumulative verification **67 editor calls, 5 Tutor calls, at most 887.888 speech
  seconds**. No browser/test server started in this trial; occupied previews kept.
- Isolated private auth file contained only Cerebras/speech keys, no subscription
  credentials. Source auth/settings hashes verified unchanged; trial key copy
  removed after the correctness gate closed.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-cerebras-correctness.json`, zero-network preflight, and
  `check-28-cerebras.mts`. Prompt hash matches the preceding model comparisons.
  Request records contain endpoint/model/effort/status/timestamps, no keys/headers.
