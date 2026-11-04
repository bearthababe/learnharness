# Cerebras: original versus clarified unfinished-working prompt

2026-11-03. Owner approved **Run prompt comparison**: trial-only wording change,
Cerebras Qwen 3.8 27B/off, four cases with each prompt, at most 16 editor calls
including retries, no speech. Production prompt and saved settings unchanged.

## Finding

**The narrow wording change did not fix the original difficult case.** The revised
prompt handled both new unfinished examples and still asked on a genuinely
ambiguous target, but both variants asked confused questions on the original
interrupted dictation with historical entries. No production change made.

| Case | Original prompt | Revised prompt |
| --- | --- | --- |
| Original interrupted multiplication with history | Clarification suggesting an unwarranted edit, **2,634 ms** | Clarification suggesting unwarranted math changes, **664 ms** |
| New unfinished addition | `y = 7 + .`, **2,710 ms**; retained operator but extra dot | `y = 7 +`, **308 ms**, pass |
| New unfinished expansion | Ends `− 5 ×`, **679 ms**, pass | Same unfinished ending, **284 ms**, pass |
| Two possible denominator targets | Asked which line, **283 ms**, pass | Asked which line, **290 ms**, pass |

Each cell is one complete editor invocation; no retries. Timings exclude deliberate
rate-limit pacing between calls. These are single samples, not controlled
median/tail estimates or evidence that the extra wording causes lower latency.
Original-prompt calls varied substantially from the earlier off trial's subsecond
times. All reported zero cached tokens and zero reasoning tokens; neither fact
controls provider load/routing.

The automated checker yields original **2/4**, revised **3/4**. The old addition
case is an exact-source/punctuation mismatch, **not a dropped unfinished operator**.
Its dot must not be equated with the earlier models' deletion of entire terms.
Likewise, the hard-case responses were questions: state and Undo stayed unchanged.
Their failure here is not completing the agreed fixture in one turn and proposing
unsupported mathematical interpretations, not corrupting saved working.

## Only wording changed

The revised variant inserted this owner-approved clarification immediately before
the existing “After an answer…” sentence:

> An unfinished expression is not, by itself, a reason to ask a question. Preserve
> the unfinished operator without filling in the missing value. Ask only when you
> cannot tell what to write or where to put it.

Everything else stayed fixed: production prompt, input/history per case, model,
reasoning off, response validation and existing one-application-retry policy.
No expected answer, fixture-specific numbers, special keyword rule or output
schema was added to the prompt. The test-only `onPayload` hook substitutes only
the instruction prefix; it never edits the input, context or result.

Exact transmitted prompts and hashes are saved in request evidence for both
variants. The editor's own `attempt.prompt` remains its original constructed
prompt; the transmitted `requests[].prompt` is authoritative for this experiment.
This distinction is explicit because the production editor was not modified.

## Cases and observed responses

### 1. Existing interrupted dictation, historical entries retained

Instruction:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

Current working is empty; the earlier saved entries are read-only context,
identical to all preceding trials. Expected single-turn working retains the
unfinished `+ 3 × …` term.

Original response:

> Do you want me to correct line L1 to read
> “300 × 50 - 300 × 3 + 3 × 6 × 47”?

Revised response:

> Did you mean 'plus 300 times 3' (instead of 'minus'), and did you mean
> '3 times 4' or '3 times 7' for the last term? Also, should I add this as a
> new line in the current notebook?

Both are valid JSON questions and neither changes state. They still do not
demonstrate preserving the learner's interrupted working as requested. The
references to an absent current L1/alternative old numbers make historical
context interference plausible, but this experiment **did not remove history**,
so it cannot establish that cause.

### 2. New unfinished addition with unrelated incorrect working

Input line `L1: 2 + 2 = 5`. Instruction:

> Add a new line: y equals seven plus.

Both variants preserved L1 exactly and inserted L2 with a proper Undo snapshot.
Original inserted `y = 7 + .`; revised inserted the intended `y = 7 +`.

### 3. New unfinished expansion

Empty working. Instruction:

> Write five times eight equals five times ten minus five times.

Both inserted:

```latex
5 \times 8 = 5 \times 10 - 5 \times
```

No arithmetic was performed, missing factor invented or unfinished operator
removed; Undo snapshot preserved.

### 4. Genuinely ambiguous target

Current working has `p = \frac{F}{A}` and `q = \frac{Q}{A}`, no cursor/selection
or conversational target. Instruction: “Change the denominator to 2A.”
Both returned “Which line's denominator should be changed to 2A?” and retained
the complete input state. The revised rule did not force a guess in this example.

## Method and limits

The existing replay command had already reproduced the original symptom at off
and low. This approved diagnostic retained the full fixture rather than spending
additional calls minimising it: only the prompt changed. Hypotheses considered
before running were (1) incomplete-expression/ambiguity rule conflict, (2) ambiguous
spoken wording, and (3) interference from old entries. The test directly probes
(1); the other two remain unresolved. No causal claim is made from this small run.

Prompt order was counterbalanced: original→revised for cases 1/3, revised→original
for 2/4. Every request was paced at least **13 seconds** after the preceding one
to respect published trial-tier request limits. Pacing occurs outside measured
editor invocations; a retry wait would be recorded/subtracted separately, but no
retries happened. No test-case tuning or second wording revision was performed.

All eight outgoing requests explicitly used `reasoning_effort: none`, all returned
HTTP 200 and explicit zero reasoning usage; no reasoning-content characters were
observed. Eight editor attempts matched eight network requests, with no transport
retries. This was a real-provider, direct-editor experiment—not a browser,
microphone or physical-device test.

## Accounting and next interpretation

- **8/16 authorized editor calls**, no speech/Tutor calls. Eight unused; no further
  calls planned under this comparison.
- Cumulative verification **77 editor calls, 5 Tutor calls, at most 887.888 speech
  seconds**. Saved auth/settings and production editor file hashes unchanged;
  isolated Cerebras-only key copy removed. No app server/browser launched.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-cerebras-prompt.json`, its zero-network preflight, and
  `check-28-cerebras-prompt.mts`. This runner/evidence is retained as a diagnostic
  artifact outside the repository, not shipped application instrumentation.

The wording is not a demonstrated solution for the original failure. A useful
next bounded investigation would separate interrupted speech from historical
context while keeping the expected behavior and model fixed. That would require
its own approval; neither changing the production prompt nor declaring the model
incapable follows from these samples. DeepSeek/low's prior passes remain the
strongest current complete-edit evidence.
