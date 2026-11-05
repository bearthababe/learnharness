# Zen Gemini Flash-Lite trial

2026-11-03. Owner selected **Test through Zen** after saving the OpenCode API key
in LearnHarness. Approved Gemini 3.5 Flash-Lite / minimal, correctness first, then
the two established browser cases, with a maximum of eight editor calls including
retries and 80 additional speech seconds. Saved settings retained.

## Result

**The key and installed adapter work; this model/setting failed the preservation
gate.** It is not accepted as the Notebook editor on this evidence.

The first case reused the actual unfinished-working fixture previously tested
with Luna and Terra. Current working was empty; saved historical entries were
included as read-only context. Instruction:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

The expected working retains the unfinished `+ 3 × …` term:

```latex
300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47
```

Both responses instead returned:

```latex
300 \times 50 - 300 \times 3 + 6 \times 47
```

| Attempt | Time | Result |
| --- | ---: | --- |
| First | 1,146 ms | `replace L1`, rejected because the current notebook is empty; unfinished term also dropped |
| Existing application retry | 1,178 ms | Valid `insert L1`; unfinished term still dropped |

Whole editor invocation: **2,327 ms**, including the application retry and local
validation. This is **not click-to-visible latency**: it excludes speech and
browser display. A semantically wrong edit can pass the local JSON/operation
validator, so shape validity alone is insufficient.

The second correctness case (targeted pressure denominator change while retaining
mistakes and unrelated unfinished working) and both browser/speech cases were
not run after this failure. One failed fixture does not establish the model's
overall ability, but it fails the agreed acceptance gate for this trial.

## Transport and isolation

- Production `runNotebookEditor` prompt/parser, `piEngineForSpec`, installed Pi
  1.5.0 Google adapter and real Zen API; no application behavior changed.
- Model: `opencode/gemini-3.5-flash-lite`, reasoning `minimal`.
- Two HTTP requests observed at the approved Zen `streamGenerateContent`
  endpoint; both sent `thinkingLevel: MINIMAL`. No hidden transport retries.
- An isolated private auth file held only Zen/speech API keys. No subscription
  credentials were copied or account owner started. Source profile settings and
  credentials were not modified. Trial credential copy removed after completion.
- No trial app server/browser needed; occupied preview/native processes retained.
- **2/8 authorized editor calls**, **0/80 speech seconds**, zero Tutor calls.
  No further calls planned. Cumulative verification: **47 editor calls, 5 Tutor
  calls, at most 865.280 speech seconds**.

Evidence outside the repository under `/tmp/opencode/notebook-integration/`:
`check-28-zen-correctness.json` and `check-28-zen.mts`. Request instrumentation
recorded only endpoint path and thinking configuration, never key/header values.
The result includes the model output, usage and individual attempts.
