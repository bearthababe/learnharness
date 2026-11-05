# Zen shortlist: Haiku, Qwen and Luna with reasoning off

2026-11-03. Owner selected **Run all three**: Haiku 5.5, Qwen3.8 Flash and GPT-6
Luna, all through Zen with reasoning off. Same unfinished-expression and targeted
edit cases, at most 12 calls including retries, no speech, isolated data and saved
settings retained. Production prompt and stock adapters used without overrides.

## Results

| Model, off | Unfinished expression | Editor wall time | Targeted edit | Editor wall time |
| --- | --- | ---: | --- | ---: |
| `opencode/claude-haiku-5-5` | Retained `+ 3 × ?` after JSON-format retry; differs from expected `…` | **3,510 ms** | Correct | **812 ms** |
| `opencode/qwen3.8-flash` | Dropped `+ 3 × …` | **1,683 ms** | Correct | **1,464 ms** |
| `opencode/gpt-6-luna` | Clarified; working unchanged | **1,194 ms** | Correct | **1,079 ms** |

These are single-sample **complete editor invocation times**: response, local
validation/application, and any application retry. They are not click-to-visible
timings or median/tail latency estimates. Native cache behavior was retained;
Haiku reported cache writes and the other two no cache reads, so this was not a
controlled cold-versus-warm benchmark.

### Unfinished expression: inspect content, not only the automated verdict

Same instruction and read-only historical context as earlier tests:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

**Haiku** initially emitted explanatory prose followed by a JSON clarification
question, violating the prompt's JSON-only contract. The application rejected it
before editing. The existing format-retry path then returned a valid insert:

```latex
300 \times 50 - 300 \times 3 + 3 \times ? + 6 \times 47
```

Attempt times: **2,402 ms + 1,105 ms**, complete invocation **3,510 ms**.
It retained the interrupted multiplication using a question-mark placeholder.
The unchanged automated fixture accepts the previous `\ldots`/`\cdots`/ellipsis
representation (or an unfinished operator) and returned false for `?`. That is a
**notation mismatch**, not evidence that Haiku deleted the term. The raw result
and false check are retained; no owner decision accepting/rejecting this placeholder
or changing the expected behavior was inferred. The accepted retry created the
expected Undo snapshot.

**Qwen** returned a valid insert in one call, but omitted the unfinished term:

```latex
300 \times 50 - 300 \times 3 + 6 \times 47
```

**Luna** returned a valid clarification:

> Should I add this as a new line, and what should “three, time...” be?

Its state and Undo stack stayed exactly unchanged. The fixture's edit and Undo
creation checks consequently returned false; this is not Undo corruption or a
destructive edit. Time to a clarification is not time to a completed edit; no
learner answer/follow-up was tested.

### Targeted edit

All three changed only denominator `A` to `2A` in
`p = \frac{F}{A} \qquad 3 + 3 = 7`. They preserved the wrong `3 + 3 = 7`, the
separate incorrect `2 + 2 = 5` and unfinished `x =` lines, and created the proper
Undo snapshot. No retry on this case for any model.

## Reasoning and transport

- All engines resolved **off**, without the silent clamp seen for DeepSeek.
- Haiku and Qwen used Zen Anthropic Messages with explicit
  `thinking: {type: "disabled"}`. Luna used Responses with
  `reasoning: {effort: "none"}`. Payloads were observed, not altered.
- **Zero reasoning blocks/content and zero explicit Zen-billed reasoning tokens**
  in all seven responses. Ordinary text can still contain explanatory prose
  (Haiku's first response); that does not make it a reported reasoning block.
- Seven editor attempts matched seven HTTP requests, all 200. The only retry was
  Haiku's counted application JSON retry. No hidden transport retries.
- First final-text token timings per call: Haiku **1,391 / 837 / 601 ms**,
  Qwen **1,052 / 962 ms**, Luna **884 / 767 ms**. These are diagnostic stream
  milestones, not completed usable edits.

## Interpretation

No clearly better replacement emerged from these two cases. Haiku preserves the
unfinished term, with a new placeholder notation and a costly retry in this sample.
Qwen edits it incorrectly; Luna asks instead of completing the edit. DeepSeek/low
remains the candidate that matched both established fixtures without retries
([prior comparison](notebook-zen-low-comparison.md)); its explicit-off variant
also clarified on this difficult case ([off diagnostic](notebook-deepseek-off-trial.md)).

These observations do not settle broader reliability or the owner's preferred
placeholder/clarification behavior. No production setting or prompt change follows
from this trial alone.

## Evidence and accounting

- **7/12 authorized editor calls**, no speech/Tutor calls. Five unused;
  no further trial planned. Cumulative **63 editor calls, 5 Tutor calls,
  at most 865.280 speech seconds**.
- Source auth/settings hashes verified unchanged. Trial-only Zen key copy removed.
  No browser/test server started; existing preview processes retained.
- Outside the repo, `/tmp/opencode/notebook-integration/`:
  `check-28-zen-shortlist.json`, zero-network
  `check-28-zen-shortlist-preflight.json`, and `check-28-zen-shortlist.mts`.
  Request evidence logs controls, endpoint paths, status and timing, not key values.
- Unchanged production prompt SHA-256 matches the prior comparison. No application
  implementation change or code test suite needed; actual trial/evidence assertions
  and documentation whitespace checks performed.
- Candidate rationale/source references:
  [paid Zen catalog research](notebook-zen-speed-catalog.md).
