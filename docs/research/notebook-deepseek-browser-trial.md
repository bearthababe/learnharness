# DeepSeek/low: full-browser Apply timing

2026-11-03. Owner selected **Run both cases**, approving at most four editor calls
including retries and 80 speech seconds, no Tutor sends, isolated data and
unchanged saved settings/previews.

## Result

**Both edits completed correctly in about two seconds, without retries.**

| Case | Earlier Terra/low | DeepSeek Flash/low through Zen | Reduction |
| --- | ---: | ---: | ---: |
| Silent clicked Apply | 3,428 ms | **2,099 ms** | 1,329 ms (~39%) |
| Replacement during continued dictation | 2,995 ms | **1,979 ms** | 1,016 ms (~34%) |

This is **click → visibly changed working**, including speech finalization,
application setup, generation, persistence and browser rendering. One sample per
case; different model/provider routes and run times, so not a controlled latency
distribution. Native caching retained: DeepSeek reported 512 cached input tokens
in each case. These results support a useful observed improvement, not a promise
that every edit will finish in two seconds.

## Same full-path methodology

Reused `check-28-visible-latency.mjs` with a new `--deepseek-low` mode. Same
generated audio clips, 1440×1000 headless Chromium renderer, actual AudioWorklet
and Deepgram socket transport, clicked Apply cutoffs and seeded continuation
formula as the successful Terra catalog-reuse checks. Endpoint is changed working
in the DOM followed by two animation frames, not physical screen scanout.

Production standalone server ran on Electron's bundled Node on an ephemeral
localhost port. Build ID `FmYE-07xbhcFEH_3Nbwvj` already contained the finalization
and catalog-reuse fixes; source timestamps verified no newer application files.
This was an automated-browser check against the production payload, **not a
native Electron window, physical microphone or iPhone acceptance test**.

The isolated fixture selected only Notebook's Cheap slot:
`opencode/deepseek-v4.1-flash`, `low`. Other model slots were unset in that fixture;
the real profile and saved connections were unchanged. No subscription credentials
were copied or second account owner started. Zero-generation/speech preflight
verified both browser setups before the live run.

## Breakdown and correctness

| Case | Speech ready | Ready → provider start | Provider response | Response → visible | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Silent click | 253 ms | 5 ms | 1,557 ms | 284 ms | **2,099 ms** |
| Continued dictation | 306 ms | 8 ms | 1,389 ms | 276 ms | **1,979 ms** |

Provider times include the actual request/complete response path, not only token
decode. Setup is derived from saved attempt timestamps and browser marks. A
separate metadata-only HTTP probe verified exactly two Zen requests, both model
`deepseek-v4.1-flash`, `reasoning_effort: low`, HTTP 200. No hidden transport retry.
Saved attempts reported **75/94 reasoning tokens**, respectively.

Silent click inserted:

```latex
p = \frac{F}{A}
```

Continued-dictation case began with the previously successful formula and replaced
it with:

```latex
p = \frac{F}{2A}
```

The next draft retained **“Keep this instruction for later.”** Exactly one Apply
identity, one model call and one speech Finalize in each case; each recording had
one capture/socket, complete placed speech, normal close code 1000, no forced
stop, browser error or Tutor send. Initial rendering of the seed could not satisfy
the changed-working endpoint.

## Accounting and handoff

- **2/4 authorized editor calls**, **22.608/80 speech seconds**, zero Tutor calls.
  Silent recording 7.976 s; continuation 14.632 s. No retries/repeats.
- Cumulative verification **65 editor calls, 5 Tutor calls, at most 887.888 speech
  seconds**. Two calls/57.392 speech seconds remain unused; no further trial planned.
- Trial browser/server closed. Source auth/settings hashes verified unchanged;
  private Zen/speech key file deleted. Occupied previews retained.
- Evidence under `/tmp/opencode/notebook-integration/`:
  `check-28-visible-deepseek-low.json`, its preflight,
  `check-28-visible-latency.mjs --deepseek-low`, and
  `check-28-zen-browser-preload.mjs`. Probe logs model/effort/count/timestamps/status,
  not prompt bodies, authorization headers or keys.

DeepSeek/low is now the strongest tested external candidate: it passed the two
[editor preservation fixtures](notebook-zen-low-comparison.md) and these two
full-browser cases, with better observed visible latency than Terra/low.
Broader reliability, physical-device/owner-learning acceptance and any saved
model change remain separate decisions. No default changed in this trial.
