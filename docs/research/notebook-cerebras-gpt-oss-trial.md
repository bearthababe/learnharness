# Cerebras GPT-OSS 120B/low: preservation and in-app timing

2026-11-04. Owner approved the unchanged production prompt and normal context:
two preservation fixtures, then the same two browser speech cases if both passed;
maximum eight editor calls including retries and 80 speech seconds. After the
unfinished output used `?`, owner explicitly approved **Continue speed tests**
while leaving the notation difference unresolved, not accepted.

## Findings

**Both browser outputs appeared in under a second: 882/859 ms.** First formula
correct; replacement used `fresh` instead of pressure after speech recognition
heard “pressure” as “fresh.” This is not a two-case end-to-end correctness pass.
One earlier editor invocation took **15,377 ms**, so these four calls do not
establish consistent subsecond performance.

| Same generated-audio browser case | Terra/low | DeepSeek/low | Qwen/low, revised prompt | GPT-OSS 120B/low, production prompt |
| --- | ---: | ---: | ---: | ---: |
| Initial formula | 3,428 ms, correct | 2,099 ms, correct | 1,161 ms, unwanted `right` subscript | **882 ms, correct** |
| Replacement during dictation | 2,995 ms, correct | 1,979 ms, correct | 944 ms, correct | **859 ms, `fresh` instead of pressure** |

Times measure click → changed working in the DOM followed by two animation frames,
including speech readiness, provider, persistence and rendering. Incorrect outputs
are time-to-visible-output, not successful-correct-edit latency. Baselines are
previous runs, not fresh calls; one observation per model/case. Qwen used a different
prompt. Identical audio does not guarantee identical speech transcripts.

## Direct-editor preservation fixtures

| Case | Complete editor time | Result |
| --- | ---: | --- |
| Unfinished multiplication with two historical entries | **518 ms** | Retained `+ 3 × ?`; notation unresolved |
| Targeted denominator, unrelated unfinished working and deliberate mistake | **15,377 ms** | Correct targeted edit; unrelated lines and `3 + 3 = 7` preserved |

The first output was:

```latex
300 \times 50 - 300 \times 3 + 3 \times ? + 6 \times 47
```

It did not delete the unfinished term or invent a numerical factor. The strict
fixture expects an unfinished operator/ellipsis and rejected `?`. The owner
pointed out that question marks and ellipses convey different meanings, then
authorized timing with that difference unresolved. The original machine gate
remains false in the raw evidence; no checker was loosened to claim acceptance.

Both edits created the correct Undo snapshot; no format or transport retry.
The slow second call received its first stream event at **15,330 ms**, first text
at 15,352 ms. Most of its delay preceded streaming; the cause is not established.
No deliberate pacing was used. Reported reasoning tokens **196/53**, cached input
tokens **0/640**. This slow call is retained, not removed as an outlier.

## Browser correctness review

### Initial formula

Audio: “Write pressure equals force divided by area.”

Transcript: “Right pressure equals force in my by area.”

GPT-OSS returned the intended `p = \frac{F}{A}` despite those transcription errors.

### Seeded replacement during continued speech

Audio: “Replace that formula with pressure equals force divided by twice the area.”

Transcript: “Replace that formula with fresh equals force divided by twice the area.”

GPT-OSS returned:

```latex
fresh = \frac{F}{2A}
```

The denominator was correctly changed, but the left-hand side did not match the
spoken intent. The output follows the mistranscribed word; this is an end-to-end
failure, not evidence of a wrong edit from the same text as the other models.
The earlier DeepSeek and Qwen runs received “pressure” for this scenario.
The later draft remained **“Keep this instruction for later.”**

## Full-path timing

| Case | Speech ready | Ready → provider start | Provider response | Response → visible | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial, correct | 250 ms | 5 ms | 337 ms | 290 ms | **882 ms** |
| Replacement, transcript mismatch | 267 ms | 6 ms | 309 ms | 278 ms | **859 ms** |

Reported reasoning tokens **50/65**; cached input tokens **640/0**. The first
browser run therefore included provider-reported prompt-cache reuse. No caching
policy was changed, and neither run is claimed as a controlled cold-cache result.

## Verification and isolation

- Installed adapter supports `cerebras/gpt-oss-120b`, low → `reasoning_effort: low`.
  All four requests verified that model/effort, HTTP 200, exactly one request per
  editor invocation. No application/transport retries or hidden extra generations.
- Direct fixtures copied unchanged from the prior DeepSeek screen, production
  prompt hash matched. Browser probe asserted the exact production prompt prefix
  and forwarded the original request without modifying payload/context.
- Same standalone production build `FmYE-07xbhcFEH_3Nbwvj`; application timestamps
  checked against build. Ephemeral localhost server using Electron's Node and
  headless desktop Chromium, generated audio through actual AudioWorklet/Deepgram.
  This is browser/real-provider evidence, not native-window, physical microphone,
  physical iPhone or owner-learning acceptance.
- Two zero-call preflights passed. Both browser recordings had one capture/socket,
  one Apply identity and Finalize, complete placed speech, no forced stop, no
  browser errors, normal WebSocket close 1000, no Tutor sends. Seeded working
  cannot satisfy the changed-output endpoint.
- Browser cases have no archived entries by construction; current working and
  ongoing conversation retained. Preservation fixture exercised historical entries.
- **4/8 calls**, **21.392/80 speech seconds** (6.752 + 14.640), zero Tutor calls.
  Four calls/58.608 speech seconds unused; no further trial planned.
- Cumulative **103 editor calls, 5 Tutor calls, at most 930.968 speech seconds**.
  Source auth/settings/production prompt hashes unchanged; isolated key file
  deleted and trial browser/server processes closed. Saved model unchanged.

Evidence under `/tmp/opencode/notebook-integration/`:

- `check-28-cerebras-gpt-oss-low-correctness.json` and zero-call preflight.
- `check-28-visible-cerebras-gpt-oss-low.json` and zero-call/speech preflight.
- `check-28-cerebras.mts --gpt-oss`, `check-28-visible-latency.mjs --gpt-oss-low`,
  and verification-only `check-28-oss-browser-preload.mjs`.

GPT-OSS is a promising speed candidate with the normal app prompt. Unfinished
notation remains unresolved, one browser result missed spoken intent after a
transcription error, and the 15-second direct call needs to remain part of the
reliability picture. No automatic default switch follows from this comparison.
