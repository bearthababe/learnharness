# Fast hosted models for conversational Notebook editing

Investigated **2026-11-03** using current official provider documentation and the
installed **Pi 1.5.0** catalog/source. This is a research shortlist, not a measured
winner or an approved configuration change. No credentials were read, authenticated
catalogs queried, generations run, or packages changed.

## Recommendation

**Qwen high / all supported levels (2026-11-04):** high completed the same 20 cases
with two incorrect edits/two extra clarifications, median 0.648 s, range 0.328–5.871 s.
Fresh corrected in 5.499 s, but the history-bearing unfinished term was dropped.
[Four-level comparison](notebook-qwen-reasoning-comparison.md): off/low/medium/high
wrong edits 3/3/1/2, extra questions 3/1/3/2. No all-correct reasoning level found;
high is not a clean upgrade over medium. No saved setting/prompt change.

**Higher-reasoning extension (2026-11-04):** Qwen medium, GPT-OSS high and Gemini
medium completed the same 20 cases. [Results](notebook-higher-reasoning-comparison.md):
wrong edits decreased to 1/2/0, while extra clarifications increased to 3/5/4;
medians 0.5485/0.6975/1.986 s. No net increase in completed expected tasks for the
two Cerebras models, fewer for Gemini. Qwen medium is the stronger observed fast
Cerebras trade-off, but DeepSeek low still has the stronger overall balance here.
No saved default or prompt adoption; 60 calls/no retries/no speech.

**Complete 15-setting ×20-case suite (2026-11-04):** all 300 frozen-input cells
completed with the new general speech-error paragraph. See the
[complete report](notebook-complete-model-comparison.md). DeepSeek low is the
strongest observed speed/correctness balance: zero wrong edits, one clarification
instead of intended unfinished edit, median editor 1.654 s. Terra off also made
zero wrong edits, but clarified fresh versus pressure, median 3.5225 s. Cerebras
remained fastest (0.370–0.497 s medians) with more wrong edits. These are single
observations per case and mixed-workload medians; unfinished notation separately
recorded, no in-app latency or broad/default acceptance claim. All exact contexts,
prompt, raw outputs, retries and usage retained. Production prompt/default unchanged.

**Prompt distinction follow-up (2026-11-04):** the general speech-error-versus-
math-mistake paragraph corrected the frozen “fresh” input for both GPT-OSS medium
(529 ms) and DeepSeek low (2,046 ms), with targeted mistake preservation intact.
Both clarified on unfinished multiplication; DeepSeek's original prompt had
completed that fixture. See [controlled prompt comparison](notebook-speech-error-prompt-comparison.md).
Promising prompt-level improvement on the known error, with an unfinished-case
trade-off and no production change approved.

**Identical “fresh” input follow-up (2026-11-04):** normal prompt/original context
replayed first at GPT-OSS medium, then DeepSeek low and Cerebras Qwen low. All
kept `fresh` rather than recovering pressure; no clarification. Editor times
**572/18,557/453 ms**. Terra low had already corrected this exact input; GPT-OSS
low had not. Earlier DeepSeek/Qwen browser successes used “pressure,” so did not
test this error. See [frozen comparison](notebook-frozen-fresh-comparison.md).
Extra OSS reasoning did not fix this case, and DeepSeek's older two-case browser
pass must not be generalized to transcription-error correction.

**GPT-OSS 120B/low on Cerebras (2026-11-04):** stock prompt/context reached visible
output in **882/859 ms**, first formula correct, replacement wrote `fresh` from
a “pressure”→“fresh” transcription error. Direct preservation retained `3 × ?`
(notation unresolved) and passed targeted edit, but the latter took **15.377 s**.
See [GPT-OSS evidence](notebook-cerebras-gpt-oss-trial.md). Promising speed, no
consistent-subsecond or full end-to-end acceptance claim; saved model unchanged.

**Cerebras full-browser follow-up (2026-11-04):** the revised/low setup measured
**1.161/0.944 s click-to-visible**, compared with DeepSeek **2.099/1.979 s** and
Terra **3.428/2.995 s**. Only replacement was fully correct: first output added
an unwanted `right` subscript from the “Write”→“Right” transcript ambiguity.
See [full-browser evidence](notebook-cerebras-browser-trial.md). Real speed benefit
observed, but no two-case end-to-end correctness pass or default change.

**Cerebras low/context follow-up (2026-11-03):** revised prompt with old entries
absent completed the original unfinished expression twice correctly in
**750/933 ms**; revised with entries passed once, original failed both repeats
with/without entries. See [low history/prompt comparison](notebook-cerebras-history-low-comparison.md).
This is a promising isolated combination, not approval to drop history or change
the production prompt/default. DeepSeek/low still has the production-prompt and
full-browser passes.

**Historical-context follow-up (2026-11-03):** removing old Notebook entries made
Cerebras/off edit more often, but three of four no-history edits changed the
unfinished expression. Four conditions repeated twice used 12 calls with four
format retries; no condition was consistently successful. See
[history isolation](notebook-cerebras-history-comparison.md). This is not a
validated prompt/context fix; production remains unchanged.

**Prompt follow-up (2026-11-03):** a trial-only general clarification about
unfinished expressions did not fix Cerebras/off's original history-bearing
dictation case. It handled two new unfinished examples and correctly asked on
an ambiguous target. See the [four-case old/new comparison](notebook-cerebras-prompt-comparison.md).
No production prompt change; neither a complete prompt fix nor model incapability
is established by this limited evidence.

**Cerebras low follow-up (2026-11-03):** actual low reasoning still clarified on
unfinished multiplication (**1,602 ms**, 1,559 reasoning tokens) and passed the
targeted edit (**442 ms**, 124 reasoning tokens). No retry; browser gate remained
unmet. See [follow-up](notebook-cerebras-trial.md#follow-up-low-reasoning).
DeepSeek/low remains the two-fixture/full-browser correctness-positive candidate.

**Cerebras now measured (2026-11-03):** owner-approved Qwen 3.8 27B/off completed
the targeted edit correctly in **456 ms**, but returned a clarification on
unfinished multiplication in **538 ms**, with state unchanged. Actual outgoing
none and zero returned reasoning verified. The conditional browser gate did not
pass; no full-path claim or default change. See [Cerebras trial](notebook-cerebras-trial.md).
This replaces the earlier “untested candidate” status below while leaving the
original research rationale intact. DeepSeek/low remains the two-case and
full-browser correctness-positive candidate.

**Latest full-browser measurement (2026-11-03):** Zen DeepSeek V4.1 Flash/low
completed the same two cases correctly in **2.099/1.979 s click-to-visible**, down
from Terra/low **3.428/2.995 s**. No retry; later dictation preserved. This follows
its two correctness-fixture passes and makes it the strongest tested external
candidate so far. See [browser evidence](notebook-deepseek-browser-trial.md).
Single samples, saved settings unchanged; broader/default acceptance is separate.

**Latest shortlist trial (2026-11-03):** Haiku 5.5/off, Qwen3.8 Flash/off and GPT-6
Luna/off were tested through Zen. Haiku kept the unfinished term as `3 × ?` after
a JSON retry (**3,510 ms**), Qwen dropped it (**1,683 ms**), Luna clarified
(**1,194 ms**). All targeted edits passed (**812/1,464/1,079 ms**). See the
[trial record](notebook-zen-shortlist-trial.md); the question-mark output differs
from the existing ellipsis fixture and was not automatically accepted/rejected
as a design policy. No new default emerged from this limited evidence.

**Further follow-up (2026-11-03):** [DeepSeek through Zen with explicit thinking
disabled](notebook-deepseek-off-trial.md) returned in **933/895 ms** with zero
reported reasoning. The difficult unfinished expression clarified rather than
editing; targeted edit passed. This used an approved test-only payload override
because ordinary installed off clamps to low. Also see the broader
[paid Zen speed catalog](notebook-zen-speed-catalog.md): next untested candidates
are Haiku 5.5/off, Qwen3.8 Flash/off and GPT-6 Luna/off, with no measured Zen
speed ranking. DeepSeek/low remains the two-case correctness-positive setting.

**Latest live comparison (2026-11-03):** Zen low-reasoning tests of Gemini
Flash-Lite, DeepSeek V4.1 Flash and GLM-5.3-Flash found **DeepSeek alone passed
both preservation cases**, in **2,893/1,591 ms** complete editor time without
retries. Gemini and GLM dropped the unfinished term. See the
[comparison record](notebook-zen-low-comparison.md). DeepSeek/low is now the
evidence-backed next candidate for browser timing; it has not had full-path
measurement or default-model acceptance. The Cerebras recommendation below
remains an untested research candidate.

**Subsequent live evidence (2026-11-03):** the owner-approved Zen trial of
`opencode/gemini-3.5-flash-lite` / minimal authenticated successfully, but failed
the first unfinished-working preservation case. Its two attempts took
1,146/1,178 ms; browser timing was not run. See the
[trial record](notebook-zen-flash-lite-trial.md). This is evidence about the Zen
route and this fixture, not a direct-Google latency measurement.

**First external-provider trial: Qwen 3.8 27B on Cerebras with thinking off.** It
combines an explicitly supported non-thinking mode, strict JSON Schema output,
public shared-inference availability, and a provider-advertised ~1,850 tokens/s.
Those are good reasons to test it; they do **not** establish a one-second complete
Notebook edit. [C1–C4]

Keep the initial comparison small:

1. **Cerebras / Qwen 3.8 27B / off** — strongest speed-oriented first candidate.
2. **Google / Gemini 3.5 Flash-Lite / minimal** — stable model expressly positioned
   for low-latency extraction and simple processing; minimal is not fully off.
3. **DeepSeek / DeepSeek Flash / off** — inexpensive, current DeepSeek candidate;
   test semantic fidelity and blank/invalid output frequency carefully.
4. **Groq / Qwen 3.8 27B / off** — useful same-model/different-provider comparison,
   but currently a preview and more expensive than Cerebras. Alternatively, use
   **Groq / GPT-OSS 20B / low** for a cheap production-model comparison, accepting
   that reasoning cannot be disabled. [C1–C4, G1–G3, D1–D5, Q1–Q3]

The independently approved Terra/off experiment is the immediate local baseline.
Parent-session result: **3.470 and 2.693 seconds**, no retries, with outgoing
`reasoning.effort: none` verified. The second edit dropped an unfinished
multiplication, so it fails preservation and is not an accepted editor setting.
The application also refreshes its model catalog before each Apply; a separate
metadata-only check measured **1.128 seconds cold and 1.035 / 0.881 seconds warm**.
Those costs are outside the direct editor timings. Full evidence is in
[the delivery note](../notebook-delivery.md#terra-reasoning-off-follow-up).

Subsequent full-path browser measurements changed the practical picture:
button Apply during dictation took **9.627 s on Terra/low**, **9.278 s on
Terra/off**, and **18.663 s on Luna/medium** (with a retry). All clicked cases
waited about **5.2 s for finalized speech coverage** before provider resolution.
Spoken Apply took 5.820 s on Luna/medium and 4.345 s on Terra/off; Terra/low
requested clarification instead of editing. Recognition differed, and each is
one sample, so this is not an equal-input model ranking. It demonstrates that
model-only speed gains cannot remove the dominant clicked-speech wait. See
[full-path evidence](../notebook-delivery.md#full-path-browser-latency-action-to-visible-working).

After the approved bounded speech-finalization change, a comparable Terra/low
silent-click trial took **4.570 s** to visible working, with speech ready in
0.401 s. A separate replacement while dictation continued took **4.147 s**, speech
ready in 0.584 s. Both used one editor call; normal saved model settings remain
unchanged. See [new full-path measurements](../notebook-delivery.md#actual-browser-result-after-implementation).

The next approved optimization reused valid account catalog state. Repeating the
two Terra/low cases measured **3.428 s** and **2.995 s** click-to-visible, with
zero provider catalog requests during Apply and only **4–6 ms** between speech
readiness and provider start. Model processing was **2.837/2.413 s**, now the
dominant wait. See [catalog reuse results](../notebook-delivery.md#catalog-reuse-full-path-follow-up).

**Luna/off** is also a verified non-reasoning *mode* of the current efficient OpenAI
model, not a new inherently non-reasoning model. Its previous medium-effort result
does not measure off. Do not substitute the obsolete recommendation “GPT-4.1 nano”:
it shut down on October 23, 2026. GPT-4.1 mini remains a verified non-reasoning small
model, but is deprecated for January 14, 2027; it is a short-lived optional control,
not a preferred new dependency. [O1–O4]

## What the latency numbers do and do not mean

The supplied baseline is Terra 6.1/low **3.917 and 3.767 seconds**, complete direct
editor calls with valid results and no retries; Luna 6/medium was **6.5–12.8 seconds**
including a retry. Terra's trial is also recorded in
[the existing catalog note](notebook-terra-catalog.md#approved-implementation-follow-up).
These small samples do not establish a latency distribution. The approximately
one-second goal remains aspirational.

- **TTFT** is time to first token. First reasoning token, first final-answer token,
  first SSE event, and a keep-alive are different milestones.
- **Decode tokens/s** concerns generation throughput. It omits some or all network,
  queueing, prefill, reasoning, schema preparation, validation, retry and application
  work. Even identical model names on different inference providers can have very
  different latency.
- **Time to complete usable JSON** includes the final closing token and successful
  parsing/validation. **Time to visible applied state** additionally includes the
  application's queue, persistence, delivery and rendering.
- **None of the provider speed claims below is comparable to this app's complete
  validated-edit or visible-state measurements.** The reviewed primary pages do
  not establish a one-second Notebook completion for any candidate.
- As arithmetic only: 100 generated tokens at 1,850 tokens/s would require about
  54 ms of steady-state decoding. It says nothing about the rest of the request,
  whether the actual JSON is 100 tokens, or whether the published rate holds with
  this prompt/schema. Short answers make fixed overhead especially important.

Local detail: `runNotebookEditor` waits for the stream's `done`, extracts text,
then parses, validates and applies it. Its per-attempt `elapsedMs` is finalized
**before** schema parsing/application and the `onAttemptFinished` persistence hook.
Report that field as attempt/response time, not total user-visible Apply latency.
The loop permits one format/application retry, and transport retries are disabled.
[L2]

## Candidates, controls and price

Prices below are **USD per million text tokens, uncached input / output**, standard
shared/online pricing unless stated. They are documented prices, not measured
spend. Thinking tokens can add to billed output; caches and service tiers change
the bill. Availability means advertised in public docs, not verified for this
owner's account or region.

| Model and inference provider | Lowest relevant thinking setting | Native JSON support | Published speed evidence | Input / output price and availability |
| --- | --- | --- | --- | --- |
| **Qwen 3.8 27B — Cerebras** (`qwen-3.8-27b`) | `reasoning_effort: "none"`; default is **high**, so explicitly disable it | `json_schema`, `strict: true`, plus JSON object mode | Catalog ~**1,850 tokens/s**; no Notebook TTFT/full-completion measurement | **$0.99 / $1.49**; Shared Inference Free Trial and paid; free trial 5 RPM; paid Developer 300 RPM. [C1–C4] |
| **Gemini 3.5 Flash-Lite — Google** (`gemini-3.5-flash-lite`) | **minimal**, also the documented default; no fully-off level in current table | Constrained JSON Schema subset; structured streaming supported | Officially “low-latency”/high-throughput; no comparable numeric Notebook measurement found | **$0.30 / $2.50**; stable, free and paid tiers. Priority is $0.54 / $4.50; no measured benefit here. [G1–G4] |
| **DeepSeek Flash — DeepSeek** (`deepseek-flash`) | `thinking: {type: "disabled"}`; default is **enabled/high** | JSON object mode; strict **tool-argument** schemas via beta endpoint, not the same as ordinary text response schema | No applicable TTFT or complete-JSON latency guarantee found; docs explicitly allow waiting before inference | Peak **$0.30 / $1.20**; off-peak **$0.15 / $0.60**. Current backend is **DeepSeek-V4.1-Flash-1017**; prepaid/granted balance. [D1–D6] |
| **Qwen 3.8 27B — Groq** (`qwen/qwen3.8-27b`) | `reasoning_effort: "none"`; Groq's documented default also produces no reasoning tokens | Strict response JSON Schema; **not with streaming or tools** | Catalog **450 tokens/s** | **$0.80 / $4.00**; **preview**, intended for evaluation, potentially short-notice discontinuation. [Q1–Q3] |
| **GPT-OSS 20B — Groq** (`openai/gpt-oss-20b`) | **low**, not off; hiding reasoning does not disable it | Strict response JSON Schema; **not with streaming or tools** | Catalog **1,000 tokens/s** | **$0.075 / $0.30**; production model. Useful cheap fallback, not a non-reasoning model. [Q1–Q3] |
| **GPT-OSS 120B — Cerebras** (`gpt-oss-120b`) | **low**, not off; default medium | Strict JSON Schema | Catalog/model page ~**3,000 tokens/s** | **$0.35 / $0.75**; shared free/paid. Optional quality fallback if Qwen fails; highest decode rate does not imply lowest total latency. [C1, C3–C5] |
| **GPT-6 Luna — OpenAI API** (`gpt-6-luna`) | `reasoning.effort: "none"` on Responses; default medium | Structured outputs supported | No task-comparable numerical speed guarantee found | **$0.10 / $0.50**; current API model. Fast tier is 2× applicable rates. API pricing is not ChatGPT subscription billing. [O1, O5] |
| **GPT-4.1 mini — OpenAI API** (`gpt-4.1-mini`) | Inherently non-reasoning | Structured outputs supported | Officially low latency without reasoning; no task-comparable number | **$0.40 / $1.60**; deprecated, shuts down **2027-01-14**. Optional temporary control only. [O3–O4] |

DeepSeek peak hours are **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday**, excluding
Chinese public holidays; all other hours are off-peak. Flash input cache-hit prices
are $0.006 peak / $0.003 off-peak. Its legacy `deepseek-v4-flash` and
`deepseek-v4-flash-vision-exp` aliases now route to the current Flash backend; use
`deepseek-flash` for new comparisons. [D1–D2]

Other stale recommendations to avoid: Google's 2.5 Flash access is limited to
existing users and scheduled to route to 3.5 Flash-Lite on December 1, 2026;
2.5 Flash-Lite access is also limited to existing users. Groq's Llama 3.1 8B and
3.3 70B are now marked **Enterprise / Contact Sales**, not the easy self-serve
choices suggested by older examples. [G5, Q1]

## JSON constraints and fidelity to unfinished mathematics

**Schema validity is not editing correctness.** A provider can guarantee the
shape of an edit that incorrectly solves the equation. No reviewed primary source
demonstrates that these models preserve this application's deliberate math mistakes,
unfinished equations, ambiguity handling and exact unrelated source. Those remain
application-specific evaluation requirements. [Q2, G3; local contract L2–L3]

The current editor uses a prompt requesting JSON and local Zod validation. Its call
does **not** supply a native response schema or tool schema. Therefore choosing a
provider with strict JSON support does not automatically enable it here. [L2]

- **Cerebras:** strict constrained decoding supports a subset with an object root,
  no root union, `additionalProperties: false` on every object, and non-root
  `anyOf`. Optional fields are allowed. `minItems`, `maxItems`, string `pattern`
  and `format` are unsupported; Qwen strict tool schemas also exclude string
  length bounds. The Notebook's top-level discriminated union and its nonempty
  operations, ID pattern and trimmed nonempty question need an explicit compatibility
  assessment, not blind schema forwarding. [C3, L3]
- **Groq:** `strict: true` uses constrained decoding; every field must be required
  and every object closed. Strict response schemas currently exclude streaming and
  tool use. The current streaming editor would need a separately approved transport
  adaptation to use that feature; a model-only trial still tests prompt-only JSON.
  [Q2, L2]
- **Google:** native structured outputs constrain generation, including supported
  array bounds, but ignore several keywords including string length constraints.
  Semantic validation still belongs in the app. Current docs illustrate the
  **Interactions API**, while installed Pi selects `google-generative-ai`;
  do not copy the Interactions request shape into Pi's existing transport. [G3, L1]
- **DeepSeek:** `response_format: {type: "json_object"}` requires “json” in the
  prompt, a format example and sufficient output budget. Docs explicitly say
  unrecognized output is replaced with spaces, potentially producing blank content
  even with `finish_reason: "stop"`. It is not schema conformance. Strict function
  arguments are documented as beta at `https://api.deepseek.com/beta`, in both
  thinking and non-thinking modes. Pi's `supportsStrictMode` catalog flag alone
  does not turn the current text-only editor into this beta tool pathway. [D4–D5, L1–L2]

Any future constrained-output proposal should preserve `question`, `undo`, and
`edit` alternatives and treat LaTeX as an unconstrained string. Constraining it to
valid equations/LaTeX would contradict the existing accepted editor behavior. This
is an evaluation requirement derived from the current prompt, not a proposed new
wire format. [L2–L3]

## Installed Pi 1.5 support: read-only verification

Read `node_modules/@earendil-works/pi-ai/dist/providers/data/{provider}.json`
with Python's standard-library JSON parser. These exact **provider + model ID**
pairs are already shipped; no package upgrade is needed to obtain their metadata.
This does not prove picker visibility, configured authentication, account access,
or a successful request. [L1]

| Pi provider | Pi model ID | Pi API | Relevant local thinking mapping |
| --- | --- | --- | --- |
| `cerebras` | `qwen-3.8-27b` | `openai-completions` | `off` → `none`; low/medium/high supported |
| `cerebras` | `gpt-oss-120b` | `openai-completions` | `off` explicitly unsupported; low/medium/high |
| `groq` | `qwen/qwen3.8-27b` | `openai-completions` | `off` → `none`; low/medium/high |
| `groq` | `openai/gpt-oss-20b` | `openai-completions` | `off` explicitly unsupported; low/medium/high |
| `groq` | `openai/gpt-oss-120b` | `openai-completions` | `off` explicitly unsupported; low/medium/high |
| `google` | `gemini-3.5-flash-lite` | `google-generative-ai` | `off` unsupported; minimal/low/medium/high |
| `google` | `gemini-3.6-flash` | `google-generative-ai` | `off` unsupported; minimal/low/medium/high |
| `google` | `gemini-3.8-flash` | `google-generative-ai` | `off` and minimal unsupported; low/medium/high |
| `deepseek` | `deepseek-flash` | `openai-completions` | off supported by omitted-map/default rule; low/high/max; minimal/medium explicitly unsupported |
| `openai` | `gpt-6-luna` | `openai-responses` | `off` → `none`; low/medium/high/xhigh/max |
| `openai` | `gpt-4.1-mini` | `openai-responses` | `reasoning: false` → off only |
| `openai` | `gpt-4.1-nano` | `openai-responses` | Catalog entry exists **despite upstream shutdown** |

DeepSeek deserves the explicit source check: Pi's `getSupportedThinkingLevels`
excludes `null` map entries, not an absent `off` property; its DeepSeek request
branch sends `thinking: {type: "disabled"}` when no reasoning effort is set and
`off !== null`. The application engine maps its `off` level to undefined Pi
reasoning. Thus static source supports the off pathway; no live request verified
it in this investigation. [L4–L5]

## Authentication and practical setup

All external candidates have official hosted APIs; no local model serving is
required. Existing Pi adapters/catalog entries cover them. Actual app connection
setup and a paid trial still need the owner's chosen provider/account.

| Provider | Obtain credentials / endpoint | Installed Pi environment name |
| --- | --- | --- |
| Cerebras | Create API key in [Cloud Console](https://cloud.cerebras.ai); Bearer auth; `https://api.cerebras.ai/v1`. Free Trial or paid Shared Inference. [C1, C6] | `CEREBRAS_API_KEY` |
| Groq | Create key in [Groq Console](https://console.groq.com/keys); Bearer auth; `https://api.groq.com/openai/v1`. Model availability depends on free/developer/enterprise access. [Q1, Q4] | `GROQ_API_KEY` |
| DeepSeek | Create key in [DeepSeek Platform](https://platform.deepseek.com/api_keys), fund balance; Bearer auth; `https://api.deepseek.com`. [D1–D2] | `DEEPSEEK_API_KEY` |
| Google | Create Gemini key/project in [AI Studio](https://aistudio.google.com/apikey); `x-goog-api-key`; `https://generativelanguage.googleapis.com/v1beta`. New AI Studio keys are service-account-bound authorization keys; paid usage uses project billing. [G4, G6] | `GEMINI_API_KEY` |
| OpenAI API | Dashboard API key and API credits/billing; Bearer auth; `https://api.openai.com/v1`. This is a distinct route from the app's ChatGPT connection. [O5, L1] | `OPENAI_API_KEY` |

Names above come from installed `env-api-keys.js`; no environment values were
inspected. The app may provision credentials through its connection UI rather
than environment variables; that integration is outside this research. [L6]

## Suggested decision experiment (requires separate approval)

Compare the existing production prompt/contract on Terra/low, the observed
Terra/off failure, and the four external
entries above, using the same representative notebook/history snapshots. Keep
model-only/prompt-JSON results distinct from any later native-schema experiment.
Measure each provider/model/effort/tier as a separate combination.

Score at least: literal math mistakes retained; unfinished `p =` retained; invalid
LaTeX retained; no unsolicited simplification or tutoring; unrelated source
byte-for-byte preservation; whole-line versus equation-within-line targeting;
genuine unresolved ambiguity → question/no mutation; clarification continuation;
valid stable IDs; insert/replace/undo; nonempty atomic edit; no duplicate application
after rejection. These are existing Notebook requirements, not mathematics benchmark
questions. [L2–L3]

For each case record first final-text token where available, complete response,
parse/apply completion, persisted/visible completion, retry count, input/output/
reasoning tokens, billed cost when reported, and semantic pass/fail. Report median
and tail latency across repeated representative cases rather than promoting a best
single call. For Groq strict non-streaming calls, TTFT is not observable through
that interface; record full-response latency instead. Select by **time to correct,
validated edit**, including retries. No provider documentation can choose the
winner on that metric without this application-level evaluation.

## Primary sources

All public pages below were read on **2026-11-03**. Prices/model routing may change.

### Cerebras

- **C1:** [Shared model catalog](https://inference-docs.cerebras.ai/models/overview) — model IDs, availability, advertised tokens/s.
- **C2:** [Qwen 3.8 27B](https://inference-docs.cerebras.ai/models/qwen-3.8-27b.md) — price, quotas, capabilities, thinking default/off.
- **C3:** [Structured outputs](https://inference-docs.cerebras.ai/capabilities/structured-outputs.md) — strict constrained decoding and supported schema subset.
- **C4:** [Reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning.md) — model-specific disabling; hidden reasoning still generates tokens.
- **C5:** [GPT OSS](https://inference-docs.cerebras.ai/models/openai-oss.md) — 120B price, speed and limits.
- **C6:** [Quickstart](https://inference-docs.cerebras.ai/quickstart.md) — console, API key, endpoint and Bearer auth.

### Google

- **G1:** [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) — stable ID, positioning and capabilities.
- **G2:** [Thinking](https://ai.google.dev/gemini-api/docs/thinking#thinking-levels) — current defaults and levels.
- **G3:** [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — constrained decoding, streaming, JSON Schema subset and ignored keywords.
- **G4:** [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) — free/paid, standard and priority pricing.
- **G5:** [Model catalog](https://ai.google.dev/gemini-api/docs/models) — current and restricted/deprecated models.
- **G6:** [API keys](https://ai.google.dev/gemini-api/docs/api-key) — AI Studio project/key setup, new authorization keys and request authentication.

### DeepSeek

- **D1:** [First API call](https://api-docs.deepseek.com/) — current model names/backend aliases, endpoint, key and Bearer auth.
- **D2:** [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing) — version, peak/off-peak rates and prepaid balance.
- **D3:** [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) — explicit disabled mode and default high thinking.
- **D4:** [JSON output](https://api-docs.deepseek.com/guides/json_mode) — object mode and blank-output behavior.
- **D5:** [Tool calls](https://api-docs.deepseek.com/guides/tool_calls) — strict beta function schemas, endpoint and limitations.
- **D6:** [Rate limit and isolation](https://api-docs.deepseek.com/quick_start/rate_limit) — account concurrency and waiting/keep-alive behavior.

### Groq

- **Q1:** [Supported models](https://console.groq.com/docs/models) — model IDs, production/preview/enterprise status, token speeds and prices.
- **Q2:** [Structured outputs](https://console.groq.com/docs/structured-outputs) — strict model support, streaming/tool restriction, schema versus semantic accuracy.
- **Q3:** [Reasoning](https://console.groq.com/docs/reasoning) — Qwen off and GPT-OSS low/medium/high; hiding is not disabling.
- **Q4:** [Quickstart](https://console.groq.com/docs/quickstart) — API key setup. Current model catalog takes precedence over older example model choices.

### OpenAI

- **O1:** [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) — none effort, default medium, structured outputs, pricing and tiers.
- **O2:** [GPT-4.1 nano](https://developers.openai.com/api/docs/models/gpt-4.1-nano) — shut-down status; low latency without reasoning.
- **O3:** [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) — non-reasoning behavior, deprecated status, pricing and schema support.
- **O4:** [Deprecations](https://developers.openai.com/api/docs/deprecations) — October 23, 2026 nano shutdown; January 14, 2027 mini shutdown.
- **O5:** [API quickstart](https://developers.openai.com/api/docs/quickstart) — API keys, endpoint and API credits.

### Local primary evidence

- **L1:** [`package.json`](../../package.json) and installed `node_modules/@earendil-works/pi-ai/dist/providers/data/{cerebras,groq,google,deepseek,openai}.json` — Pi 1.5 pin, IDs, API groups, thinking maps and URLs. These are SDK metadata, not upstream availability proof.
- **L2:** [`src/agent/notebook-editor.ts`](../../src/agent/notebook-editor.ts) — prompt, stream invocation, timing boundary, validation, application and retries.
- **L3:** [`src/core/contracts/notebook.ts`](../../src/core/contracts/notebook.ts) — response discriminated union and operation constraints.
- **L4:** Installed `node_modules/@earendil-works/pi-ai/dist/models.js` (`getSupportedThinkingLevels`) and `dist/api/openai-completions.js` (DeepSeek thinking branch, lines 654–664).
- **L5:** [`src/agent/models.ts`](../../src/agent/models.ts) — engine maps off to undefined Pi reasoning.
- **L6:** Installed `node_modules/@earendil-works/pi-ai/dist/env-api-keys.js`, lines 77–89 — credential variable names only.
