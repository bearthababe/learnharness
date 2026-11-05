# Cerebras revised/low: full-browser timing

2026-11-04. Owner requested in-app timing before deeper investigation and clarified
**Two speech scenarios**, using the promising Cerebras/low setup. Approved at most
four editor calls including retries and 80 speech seconds, isolated data and no
saved settings/application prompt changes. No repeated baseline calls authorized.

## Result

**Visible output appeared in about one second. Only the replacement case was
fully correct.** The first case added an unwanted `right` subscript after speech
recognition confused “write” with “right.”

| Same browser scenario | Earlier Terra/low | Earlier DeepSeek/low | Cerebras Qwen/low, revised prompt |
| --- | ---: | ---: | ---: |
| Silent clicked Apply | 3,428 ms, correct | 2,099 ms, correct | **1,161 ms, unintended `right` subscript** |
| Replacement during continued dictation | 2,995 ms, correct | 1,979 ms, correct | **944 ms, correct** |

All figures are **click → visibly changed working**, including speech finalization,
model response, persistence and render opportunity. The first Cerebras number is
time to visible output, **not time to a correct edit**. The correct replacement
was 1,035 ms faster than DeepSeek (~52%) and 2,051 ms faster than Terra (~68%) in
these samples. One sample per setup/case, not a latency distribution.

The model/provider and prompt setup differ from the baselines. This demonstrates
the measured experience of the approved Cerebras setup, not a controlled
model-only speed ranking or a successful default replacement.

## First case: “write” versus “right”

Generated audio says:

> Write pressure equals force divided by area.

Deepgram returned:

> Right pressure equals force divided by area.

Cerebras inserted:

```latex
P_{right} = \frac{F}{A}
```

The fraction is correct, but the directional subscript was not requested in the
audio. This is an end-to-end mismatch, not a failed JSON/operation format.
DeepSeek's earlier browser run received **the exact same transcript** and returned
`p = \frac{F}{A}`. Terra's earlier transcript differed slightly (“force in my by
area”), so that baseline is not text-identical despite using the same audio.

No instruction/transcript was manually corrected, no repeated trial was run, and
no keyword-specific prompt rule was added. This sample shows a transcription
ambiguity plus different editor interpretation, not a general claim that either
speech provider or Cerebras always behaves this way.

## Second case: successful replacement and draft preservation

Same seeded formula/current conversation as the preceding successful baselines.
Transcript:

> Replace that formula with pressure equals force divided by twice the area.

Output:

```latex
p = \frac{F}{2A}
```

The next draft retained **“Keep this instruction for later.”** Seed rendering
could not satisfy the endpoint; it required visibly changed working.

## Full-path breakdown

| Case | Speech ready | Ready → provider start | Provider response | Response → visible | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Silent click, output mismatch | 249 ms | 5 ms | 619 ms | 288 ms | **1,161 ms** |
| Continued dictation, correct | 278 ms | 3 ms | 381 ms | 282 ms | **944 ms** |

Provider times include the actual complete response path. Reported reasoning
tokens **151/33**, zero cached input tokens. Two editor attempts matched two
HTTP 200 requests; both explicitly used `reasoning_effort: low`. No application
or transport retry and no artificial pacing delay in this browser run.

## Trial implementation and comparison controls

- Same generated audio, actual AudioWorklet/Deepgram transport, 1440×1000 headless
  Chromium browser and click endpoint as the Terra/DeepSeek trials. Endpoint is
  changed DOM followed by two animation frames, not physical display scanout.
- Same production standalone build `FmYE-07xbhcFEH_3Nbwvj`, running on Electron's
  bundled Node at an ephemeral localhost port. Application-source timestamps
  verified no newer code than the build. This is not a native-window or physical
  microphone/iPhone acceptance test.
- Trial-only request preloader applied exactly the already-tested revised prompt
  and set only the `NOTEBOOK HISTORY` block to `[]`. Exact original prefix required;
  current working/selection/Undo availability and ongoing conversation/instruction/
  retry feedback checked byte-for-byte preserved. Six offline transformations,
  including actual baseline seeded working/conversation, passed before live use.
- **Both browser fixtures already had zero archived entries.** The preloader
  removed zero entries in each case. This measurement therefore does not validate
  real historical-context filtering or history-dependent requests.
- Current working and one previous conversation exchange were retained in the
  replacement request. Wire evidence records revised-prefix hash, model/effort,
  retained synthetic context and entry count, without credentials/headers.
- Production editor's saved prompt/input records remain the original construction;
  preloader trace documents the actual transmitted variant. No app source,
  packaged prompt, normal profile or saved model selection was changed.

Both recordings had exactly one Apply identity, model call and Finalize. One
capture/socket per case, complete placed speech, normal close code 1000, no forced
stop, browser errors or Tutor sends. Transport checks passed independently of
the first output's correctness mismatch.

## Accounting and handoff

- **2/4 authorized editor calls**, **21.688/80 speech seconds**, zero Tutor calls.
  Silent 7.048 s, continuation 14.640 s; no retries/repeats. Two calls/58.312 speech
  seconds unused, no further test planned under this authorization.
- Cumulative verification **99 editor calls, 5 Tutor calls, at most 909.576 speech
  seconds**. Trial browser/server closed; isolated Cerebras/speech key copy removed;
  source auth/settings/production prompt hashes unchanged. Existing previews kept.
- Evidence in `/tmp/opencode/notebook-integration/`:
  `check-28-visible-cerebras-low-revised.json`, its zero-call/speech preflight,
  `check-28-visible-latency.mjs --cerebras-low`, and
  `check-28-cerebras-browser-preload.mjs`.
- Baselines: [DeepSeek full-browser](notebook-deepseek-browser-trial.md) and
  [Terra catalog-reuse results](../notebook-catalog-reuse-plan.md).

Cerebras now has a measured in-app speed advantage, but this setup did not pass
both end-to-end correctness checks. DeepSeek/low remains the stronger accepted-test
candidate on the existing production prompt; no production default/prompt/context
decision follows automatically from this speed result.
