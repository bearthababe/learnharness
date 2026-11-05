# Paid Zen catalog: fast conversational Notebook edits

Researched **2026-11-03** against OpenCode **V2** documentation, its unauthenticated
public model metadata, official model-provider documentation, and the installed
**Pi 1.5.0** catalog/adapters. Research only: no credentials, authenticated API
requests, generations, configuration changes, or package changes. This note is
the sole file produced by this investigation.

## Recommendation

**Latest browser evidence:** DeepSeek V4.1 Flash/low completed the two full-path
cases correctly in **2.099/1.979 s**, versus Terra/low **3.428/2.995 s**, without
retries. It is now the strongest tested external candidate; see the
[browser trial](notebook-deepseek-browser-trial.md). The research priority ranking
below is historical; subsequent shortlist trials are also linked here.

**Subsequent live shortlist trial:** the owner approved all three off candidates;
see [results](notebook-zen-shortlist-trial.md). Haiku retained unfinished `3 × ?`
after a JSON retry (**3.510 s**), Qwen dropped the term (**1.683 s**), Luna clarified
(**1.194 s**). Targeted edits all passed (**0.812/1.464/1.079 s**). Off controls and
zero returned reasoning verified. This qualifies the research-priority shortlist
below; it is no longer an entirely untested list. No new default was accepted.

**Subsequent parent-session trial:** [DeepSeek explicit off](notebook-deepseek-off-trial.md)
returned in **933/895 ms**, with explicit disabled, no reasoning content and zero
reported reasoning tokens. It clarified on unfinished multiplication and passed
the targeted edit; low had edited both correctly. A test-only payload override
was necessary because stock Pi clamps off to low. These are editor-only samples,
not a full-path speed result or a change to the untested shortlist below.

**Next untested paid-Zen candidates: Haiku 5.5/off, Qwen3.8 Flash/off, and GPT-6
Luna/off.** This is an **evaluation-priority ranking**, not a measured speed ranking.
All three are in both the public Zen catalog and the installed Pi catalog; their
documented no-thinking controls have corresponding installed adapter paths.
None has a published benchmark for this exact Zen route, prompt, and approximately
100-token JSON edit. [Z1–Z3, A1–A3, Q1–Q3, O1, L1–L4]

1. **`opencode/claude-haiku-5-5` / off.** Best first additional comparison:
   Anthropic explicitly positions it for latency-sensitive extraction/routing,
   calls it its fastest standard-speed model, and documents a real disabled mode.
   Zen charges **$0.10/$0.50 per million input/output tokens** up to 100K prompt
   tokens. Pi sends `thinking: {type: "disabled"}` with no effort field, so the
   documented default medium effort satisfies the provider's high-or-below
   restriction. This is static transport evidence, not a successful Zen request.
   If fidelity fails, adaptive/low is a separate comparison, not equivalent to off.
   [Z1–Z3, A1–A3, L1–L4]
2. **`opencode/qwen3.8-flash` / off.** Explicit fast/cost-effective positioning,
   **$0.15/$0.47**, and hybrid thinking. Zen/Pi use **Anthropic Messages** for this
   model; Pi's off path sends `thinking: {type: "disabled"}`, supported by Alibaba's
   Messages documentation. Do not copy `enable_thinking` from a direct Alibaba
   Chat Completions example into this transport. No numerical TTFT or task-complete
   latency was established. [Z1–Z3, Q1–Q3, L1–L4]
3. **`opencode/gpt-6-luna` / off.** **$0.10/$0.50** up to 272K prompt tokens;
   officially aimed at focused high-volume work. Pi explicitly maps off to
   Responses `reasoning.effort: "none"`. Earlier Luna/medium results do not measure
   this mode or establish this Zen route's speed. Prefer this current model to the
   deprecated Nano alternatives. [Z1–Z3, O1–O3, L1–L4, L6]

**Keep DeepSeek/low as the existing correctness-positive comparator.** Its
no-reasoning trial belongs to the parent session, not this research. The public
Zen catalog advertises a toggle, but installed Zen metadata has `off: null`;
an ordinary requested off can therefore clamp to low. A no-reasoning claim must
be based on the actual outgoing control and result, not the UI label or direct
DeepSeek documentation. [Z3, L1–L4, L5]

Conditional reserves: **MiniMax M3 with explicitly verified disabled thinking**
(cheap, but the installed stock Zen off path does not itself send that switch),
then **Mistral Large 4/off** (explicit installed `none` mapping, higher price and no
task-comparable speed evidence). Gemini 3.6 Flash/minimal is a later fidelity
comparison rather than the strongest cheap-speed candidate. [Z1–Z3, M1, L1–L4]

## What counts as fast here

The [Notebook](../../GLOSSARY.md) is the learner's continuing mathematical working,
distinct from the Tutor conversation. The editor must preserve intentional
mistakes, unfinished expressions and unrelated source; solving the mathematics
can be a failure. Its target is **time to a complete, correct, validated edit**,
including retries, rather than coding-benchmark strength. [L3]

- **Decode tokens/s** measures generation throughput after generation starts.
  MiniMax explicitly defines TPS as output tokens divided by last-token minus
  first-token time; it excludes the wait for the first token. [M2]
- **TTFT** must identify the milestone: first reasoning token, first final-text
  token, or first event are different. A ping/header is not usable JSON. [A2, Q3]
- **Complete response time** includes the final JSON token and stream termination.
  The current editor waits for `done`, then parses, validates and applies. Its
  per-attempt `elapsedMs` ends before parsing/application and the persistence
  hook; full editor wall time and browser-visible time are separate. [L3]
- **Visible Apply latency** additionally includes speech readiness, application
  processing, persistence and rendering. Current Terra/low browser results were
  **3.428/2.995 s**, with generation **2.837/2.413 s**. [L6]
- Arithmetic only: 100 tokens at 100 tokens/s needs roughly one second of decode;
  at 1,000 tokens/s it needs roughly 0.1 seconds. Neither predicts total latency.
  Hidden reasoning, prefill, gateway routing, queueing and retries can dominate.
  Zen bills output including reasoning. [Z2, M2]

Existing **editor-only**, two-case evidence: [L5]

| Paid Zen model / low | Unfinished multiplication | Targeted edit | Interpretation |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | Fail, **3.885 s**, includes retry | Pass, **0.687 s** | Fast successful simple case does not overcome preservation failure. Earlier minimal also failed, **2.327 s** including retry. [L7] |
| `deepseek-v4.1-flash` | Pass, **2.893 s** | Pass, **1.591 s** | Reported reasoning **527/83 tokens**; only this candidate passed both cases. |
| `glm-5.3-flash` | Fail, **2.023 s** | Pass, **1.015 s** | Low is not off; reported reasoning **81/0 tokens**. |

These samples are not distributions and are not directly comparable to browser
timings. No new latency measurements were made here.

## Catalog reconciliation and availability

The public `GET https://opencode.ai/inference/v1/models` returned **80 entries**:
**70 priced chat entries and 10 zero-priced chat entries**. The installed Pi
`opencode.json` contained **81 entries**, including two System One decision models.
These counts describe metadata, not confirmed account access or successful
generation. Public response SHA-256 at inspection:
`ae91e2d9019d7a73f1e09e6ae1e4ab263eb24a26138ba111e66a9a78c9cca061`. [Z3, L1]

- **Public-only:** `gpt-5.3-codex-spark`, `pulse-alpha-free`,
  `crouton-alpha-free` are absent from installed Pi's Zen catalog.
- **Installed-only:** `gemini-3-flash`, `gemini-3.1-pro`, `jev-1.13`,
  `jev-1.13-free` were absent from that public response. V2 docs still list them;
  this is an unresolved catalog discrepancy, not proof every endpoint is shut down.
- V2 docs also list `nemotron-3-ultra-free`; it was in neither inspected catalog.
- **Free-tier chat models require the OpenCode client. Other clients receive 403,
  even with a key.** A paid Zen balance does not make a `*-free` ID usable from
  LearnHarness. The paid `deepseek-v4.1-flash` and `glm-5.3-flash` are different IDs
  from their free counterparts. [Z1–Z3]
- A listed entry can still be deprecated: V2 docs and public metadata retain
  several IDs whose retirement/deprecation is separately documented. Prefer the
  explicit lifecycle notices over assuming that membership proves support. [Z1, O3]

### Viable and near-viable alternatives

Prices are **Zen USD per million uncached text input / output tokens**, at the
base context tier. All IDs below use provider `opencode`; `opencode/<id>` is the
full selection reference. All are installed unless explicitly stated. Prices
are not direct-provider substitutions or measured bills. [Z1–Z3, L1]

| Exact model ID | Zen input / output | Reasoning and installed path | Triage |
| --- | ---: | --- | --- |
| `claude-haiku-5-5` | $0.10 / $0.50 | Off explicitly disabled; low uses adaptive thinking + effort. Default upstream medium. | First shortlist; above 100K prompt tokens $0.50/$2.50. [A1–A3] |
| `qwen3.8-flash` | $0.15 / $0.47 | Off explicitly disabled through Messages. Hybrid; upstream default on. Pi enabled modes use a token budget, not its newly documented effort control. | Second shortlist; verify route behavior. [Q1–Q3, L2] |
| `gpt-6-luna` | $0.10 / $0.50 | Off → `none`; low/medium/high/xhigh/max available. | Third shortlist; above 272K $0.20/$0.75. [O1] |
| `minimax-m3` | $0.30 / $1.20 | Upstream accepts `thinking: {type: "disabled"}`; public Zen toggle true. Installed off does not send it: see below. | Conditional reserve, not ready to call stock Pi off verified. [M1] |
| `mistral-large-4` | $0.68 / $2.09 | Public effort none/high; Pi off → `reasoning_effort: "none"`. | Reserve; V2 lists 50% promotional price, no duration established. |
| `qwen3.5-plus` | $0.20 / $1.20 | Hybrid; Pi Messages explicitly disabled on off. | Cheap optional fallback if Flash fails; no evidence it is faster. [Q2–Q3] |
| `qwen3.6-plus` | $0.50 / $3.00 | Same installed off pathway. | More expensive than Flash; no speed case for prioritizing. [Q2–Q3] |
| `claude-haiku-4-5` | $1.00 / $5.00 | Off/default upstream; enabled uses manual thinking budget. | Available legacy control, ten times Haiku 5.5 base prices. [A2–A3] |
| `gpt-5-nano` | $0.05 / $0.40 | Minimal is lowest; installed off unsupported. | Cheapest input/output pair here, but upstream shutdown **2026-12-11**; poor new dependency. [O3] |
| `gpt-5.4-nano` | $0.20 / $1.25 | Upstream and public Zen allow none; installed Zen off is null, lowest low. | Deprecated, shutdown **2027-04-01**; catalog/control mismatch. [O2–O3] |
| `gpt-5.6-luna` | $0.20 / $1.20 | Public Zen none; installed Zen off null, lowest low. | Current Luna is cheaper and has explicit installed off. |
| `gpt-5.4-mini` | $0.75 / $4.50 | Public Zen none; installed Zen off null, lowest low. | Secondary fidelity control, not a leading cheap/off candidate. |
| `gemini-3.5-flash-lite` | $0.30 / $2.50 | Minimal/low/medium/high; no off. | Already failed preservation at minimal and low. [G1, L5, L7] |
| `gemini-3.6-flash` | $1.50 / $7.50 | Minimal supported, no off. | Stable larger Flash fallback; no Zen short-edit speed result. [G1–G2] |
| `gemini-3.5-flash` | $1.50 / $9.00 | Installed/public minimal supported, no off. | More expensive; no established advantage over 3.6. |
| `gemini-3.7-flash`, `gemini-3.8-flash` | $1.50 / $7.50 | Installed/public low minimum, no minimal/off. | 3.8 positioned for long-horizon engineering; “Flash” alone does not prove low complete-edit latency. [G1–G2] |
| `gemini-3-flash` | $0.50 / $3.00 | Installed minimal; absent public response. | Resolve availability before trial. |
| `minimax-m2.7`, `minimax-m2.5` | $0.30 / $1.20 | M2.x thinking cannot be disabled; upstream disabled accepted but ignored. | M2.5 also Zen-deprecated **2026-08-05**. Do not infer non-thinking from Pi's offered off. [M1, Z1] |
| `deepseek-v4.1-flash` | $0.30 / $1.20 | Public toggle; installed off null, low/high/max. | Existing positive low comparator; parent handles off experiment. |
| `glm-5.3-flash` | $0.15 / $0.50 | Public/installed low/high/max, off unsupported. | Cheap paid Flash, but observed preservation failure. [L5] |
| `kimi-k2.6` | $0.95 / $4.00 | Public toggle; installed `thinkingFormat: "deepseek"` and no effort field, explicit disabled on off. | Optional non-thinking reserve; higher price and no task-specific speed evidence. [L2] |

### Broad triage of the rest

This covers the remaining catalog families so a fast-sounding name is not silently
missed. Exclusion means lower evaluation priority for this task, not a claim that
the model is objectively slower. IDs, prices, capability labels and presence here
come from [Z1–Z3, L1]; lifecycle exceptions also use [O3].

| Remaining exact IDs | Assessment |
| --- | --- |
| `gpt-5.3-codex-spark` | Speed-oriented name worth noticing, but **$1.75/$14**, no none effort in public metadata, and **not installed**. Not a cheap drop-in comparison. |
| `gpt-5`, `gpt-5.1`, `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-astra` | Larger/general/coding candidates; no exact-route short-edit speed evidence to displace the shortlist. Do not confuse `gpt-5.6-terra` in Zen with the separately measured Terra connection. GPT-5 shuts down Dec 11; GPT-5.1 and 5.3 Codex Apr 1, 2027 upstream. |
| `gpt-5.4-pro`, `gpt-5.5-pro` | **$30/$180**, lowest effort medium; public metadata says structured output false. Poor cost/latency fit. |
| `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.2-codex` | Still listed, but V2 deprecation date and OpenAI shutdown are **2026-07-23**. Exclude rather than promoting cheap Codex Mini. |
| `claude-fable-5`, `claude-fable-5-1`; `claude-opus-4-5`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`; `claude-sonnet-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5` | More expensive than Haiku. Anthropic's relative standard-speed positioning supports starting with Haiku, but is not a cross-provider Zen latency benchmark. [A1, A3] |
| `gemini-4-argon`, `gemini-3.1-pro` | Larger reasoning choices; Argon promotional **$2/$10** through Nov 30; 3.1 Pro absent public response. |
| `grok-4.5`, `grok-4.6`, `grok-4.7`, `grok-build-0.1` | Grok 4.x **$2/$6**, low minimum. Build is **$1/$2**, described as fast coding but no advertised effort control; installed off unsupported. No evidence to rank above cheap off-capable models. |
| `muse-spark-1.2`, `muse-spark-1.3`, `muse-wonder-1.0` | Spark **$1.25/$4.25**, Wonder **$4/$20**; minimal, not off. Coding/long-horizon positioning is not short-JSON evidence. |
| `qwen3.8-max`, `deepseek-v4-pro`, `glm-5.1`, `glm-5.2`, `glm-5.3`, `glm-5` | Larger alternatives; Qwen Max $2/$6, DeepSeek Pro $1.74/$3.48, GLM 5.1–5.3 $1.40/$4.40. GLM 5 $1/$3.20 but Zen-deprecated May 14. No price/speed reason to prioritize over their Flash variants without fidelity results. |
| `kimi-k2.5`, `kimi-k2.7-code`, `kimi-k3` | K2.5 Zen-deprecated Aug 5; K2.7 Code $0.95/$4 with no toggle advertised; K3 $3/$15. K2.6/off is the more relevant reserve. |
| `big-pickle`, `beam-free`, `flint-40b-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-lightning-free`, `nemotron-3.5-super-vl-free`, `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `pulse-alpha-free`, `crouton-alpha-free` | All ten live zero-price entries: **OpenCode-client-only**, not paid LearnHarness candidates. No paid MiMo/Lightning alternative appeared in the inspected Zen catalog. |
| `jev-1.13`, `jev-1.13-free` | V2 docs describe typed decisions (yes/no, choice, score), **not text generation**. Cannot generate arbitrary Notebook LaTeX edits. Present locally but absent public response. |

Also **not present as paid Zen IDs**: Cerebras/Groq `qwen-3.8-27b`, GPT-OSS
20B/120B, MiniMax `M3.1-Flash` or `M2.5-Lightning`, Qwen older Flash/Turbo/Coder
Flash variants, Gemini 2.5 Flash/Flash-Lite and 3.1 Flash-Lite, GPT-4.1 nano/mini,
and Mistral Small/Ministral. Their direct-provider availability or speed does not
make them Zen choices. GPT-4.1 nano shut down Oct 23; Gemini 2.0 Flash and
Flash-Lite are shut down; 2.5 access is restricted to existing users and 2.5 Flash
will route to 3.5 Flash-Lite Dec 1. [Z1–Z3, O3, G2, M1]

## Reasoning: distinguish native capability from this app's request

Pi's `getSupportedThinkingLevels` excludes explicit `null` entries. Missing off
metadata usually leaves off selectable; that alone does **not** prove the adapter
will send an effective disabling switch. The app clamps the requested level and
maps off to undefined Pi reasoning. [L2, L4]

- **Haiku 5.5/Qwen Flash/Haiku 4.5/Qwen Plus:** the Messages adapter translates no
  reasoning to `thinkingEnabled: false`, then explicitly sends disabled when off
  is not null. Haiku's `forceAdaptiveThinking` flag applies to enabled requests;
  it does not override off. Qwen's enabled path is older budget-based behavior;
  Alibaba now deprecates `budget_tokens` in favor of effort. [L1–L2, Q3]
- **Luna 6:** explicit off → none mapping agrees with current OpenAI and Zen
  metadata. **Nano 5.4, Mini 5.4 and Luna 5.6** are different: public none support
  does not remove their installed off-null restriction. [Z3, O1–O2, L1–L4]
- **MiniMax M3:** native disabled is real, and public Zen advertises a toggle.
  However its installed Zen entry has neither a `thinkingFormat: "deepseek"`
  override nor an off string mapping. The generic OpenAI-compatible branch sends
  neither `thinking: disabled` nor `reasoning_effort: none` when off is requested.
  Upstream omission defaults to thinking on. A future trial must first resolve
  this transport gap; no implementation change is authorized by this note.
  **M2.x cannot disable thinking even with that native field.** [M1, L1–L2]
- **DeepSeek Flash:** public toggle and installed off-null disagree. Direct
  `deepseek` provider behavior is not proof about provider `opencode`.
  **GLM Flash:** public and installed metadata expose low/high/max, not a toggle.
  [Z3, L1–L4]
- **Gemini:** minimal is not fully off, and 3.7/3.8 remove minimal in Zen/Pi.
  Google's current thinking examples use Interactions; installed Zen transport is
  `google-generative-ai`/generateContent, not that API. [G1, Z2–Z3, L1]

## Structured output: potential capability, not an active guarantee

**The current editor requests JSON in a prompt and validates locally. It supplies
neither a native response schema nor a tool schema.** Switching models leaves
that true. Pi's `supportsStrictMode` means tool-schema compatibility, not that
the text response is currently constrained. [L2–L3]

| Family | Official capability and relevant caveat |
| --- | --- |
| Haiku 5.5 / 4.5 | Anthropic supports constrained JSON via `output_config.format`, separately from strict tools, with a JSON Schema subset and streaming. Initial schema compilation can add latency; schema validity does not guarantee the intended edit. Zen public metadata explicitly marks 5.5 structured output true but omits that flag for 4.5; omission is not a negative capability statement. [A4, Z3] |
| Qwen3.8 Flash | Alibaba documents JSON object and strict JSON Schema support. Its Messages reference includes `output_config.format` strict support for Qwen3.8; Zen metadata also says structured output true. The separate Chat Completions guide has region restrictions and an outdated summary saying only selected Plus models, followed by a newer list including 3.8 Flash. Verify the actual Zen Messages route/schema before promising strictness. [Q3–Q4, Z3] |
| Luna / Nano / Mini | OpenAI Luna and Nano pages list structured outputs; Zen metadata agrees for these small GPTs. This is a future native-schema option, not the current prompt-only behavior. [O1–O2, Z3] |
| Gemini Flash | Google supports constrained JSON Schema and streaming, with a supported subset; Zen metadata marks the live Flash variants true. Current Interactions examples are not drop-in request shapes for Pi's generateContent adapter. [G3, Z3, L1] |
| MiniMax | Inspected Zen metadata does not advertise `structured_output` for M3 or M2.x; the reviewed MiniMax OpenAI API reference does not establish strict response-schema support. Installed `supportsStrictMode: true` is insufficient evidence. Treat as prompt-only here and native schema **unverified**, not definitively unsupported. [M1, Z3, L1–L3] |
| Mistral Large 4, GLM Flash, DeepSeek Flash | Zen metadata marks structured output true; that boolean does not specify constrained response schema versus JSON mode, every accepted keyword, or behavior through API translation. No strict route/schema probe was done. [Z3] |

## What the speed evidence actually establishes

- **Haiku:** first-party relative standard-speed claim and task positioning;
  no applicable absolute TTFT, decode rate or ~100-token Zen completion figure.
  Anthropic's announcement qualifies “fastest” as standard speed, excluding Opus
  Fast Mode. Customer testimonials on the announcement are different workloads,
  not independent measurements of this editor. [A1, A3]
- **Qwen Flash / Luna / Gemini:** relevant first-party efficiency/latency
  positioning, but no exact-route complete-correct-edit benchmark found in the
  reviewed sources. This is evidence to test, not evidence to announce a winner.
  [Q1, O1, G1–G2]
- **MiniMax:** its M2.5 launch distinguishes **50 tokens/s standard** from
  **100 tokens/s M2.5-Lightning**, with different output prices. The same article's
  broad 100-token/s wording must not be transferred to Zen `minimax-m2.5`, to M3,
  or to TTFT. Lightning is not in the inspected paid Zen catalog, and M2.5 is
  Zen-deprecated. The current API docs describe a native priority admission tier,
  but do not establish availability or speed gains through Zen. [M1–M3, Z1–Z3]
- Zen describes benchmarking model/provider combinations for **coding agents**,
  not this Notebook workload, and publishes no per-candidate short-JSON latency
  distribution in the reviewed V2 pages/public metadata. [Z1–Z3]

### Remaining evidence needed before choosing a default

For the three shortlisted combinations, verify resolved effort and outgoing
payload, then compare identical production prompts/Notebook snapshots. Include
unfinished multiplication, incorrect equations, unrelated source, ambiguous
target/clarification continuation, insert/replace and undo. Count valid-but-wrong
edits as failures. Report first final-text token, complete response, validation/
application completion, retries, reasoning tokens, actual cost when available,
and subsequent browser-visible latency separately. Repeat representative cases
before making median/tail claims. These are proposed evaluation requirements,
not an approved generation budget or model-setting change. [L3, L5–L6]

## Sources

All public sources accessed **2026-11-03**. Upstream capabilities do not establish
Zen account access; local metadata does not establish upstream lifecycle status.

### OpenCode V2 and public metadata

- **Z1:** <https://opencode.ai/v2/docs/console/models> — endpoints, full documented catalog, prices/context tiers, free-client restrictions, deprecations, Jev, benchmark scope. Credit purchases add 4.6% + $0.31 processing fee; token tables exclude this purchase fee.
- **Z2:** <https://opencode.ai/v2/docs/console/api/inference> — native API families, paid authentication, other-client free-model 403, billed usage including reasoning.
- **Z3:** <https://opencode.ai/inference/v1/models> — unauthenticated full metadata snapshot: exact IDs, native APIs, costs, reasoning controls, structured-output flags. Counts/set differences above were calculated from the entire response and L1.

### Anthropic

- **A1:** <https://platform.claude.com/docs/en/models/haiku-5-5/overview> — positioning, default medium/adaptive thinking, tiered price, active lifecycle.
- **A2:** <https://platform.claude.com/docs/en/build-with-claude/thinking> — per-model enabled/disabled behavior, Haiku 5.5 high-or-below restriction, hidden thinking and streaming distinction.
- **A3:** <https://www.anthropic.com/claude-haiku-5-5> — official launch and qualified standard-speed comparison; <https://platform.claude.com/docs/en/models/overview> — relative latency and still-available legacy Haiku 4.5.
- **A4:** <https://platform.claude.com/docs/en/build-with-claude/structured-outputs> — supported Haiku models, response JSON versus tools, schema subset, streaming and compilation.

### Alibaba/Qwen

- **Q1:** <https://www.alibabacloud.com/help/en/model-studio/models> — current Qwen3.8 Flash fast/cost-effective positioning.
- **Q2:** <https://www.alibabacloud.com/help/en/model-studio/deep-thinking> — hybrid Qwen3.8 Flash/Qwen Plus, default thinking and direct API controls.
- **Q3:** <https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages> — supported Qwen IDs, explicit disabled, effort/budget behavior, Messages structured outputs and streaming.
- **Q4:** <https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output> — JSON object versus strict schema, supported models and region caveats.

### OpenAI, Google and MiniMax

- **O1:** <https://developers.openai.com/api/docs/models/gpt-6-luna> — none effort, medium default, efficiency positioning, structured outputs.
- **O2:** <https://developers.openai.com/api/docs/models/gpt-5.4-nano> — native none/default, structured outputs and deprecated status.
- **O3:** <https://developers.openai.com/api/docs/deprecations> — exact GPT-5 Nano, GPT-5.4 Nano, older Codex and GPT-4.1 Nano shutdown dates.
- **G1:** <https://ai.google.dev/gemini-api/docs/thinking> — current thinking levels and non-equivalence of reasoning summaries and reasoning cost.
- **G2:** <https://ai.google.dev/gemini-api/docs/models> — current Flash positioning, 2.5 restrictions/rerouting, retired 2.0 variants, direct-only candidates.
- **G3:** <https://ai.google.dev/gemini-api/docs/structured-output> — constrained schema and streaming, API-specific examples.
- **M1:** <https://platform.minimax.io/docs/api-reference/text-openai-api.md> — M3 explicit off, M2.x ignored off, M3.1 Flash always thinking, defaults/priority tier. <https://platform.minimax.io/docs/guides/models-intro> — current direct model catalog.
- **M2:** <https://platform.minimax.io/docs/faq/about-apis.md#q-how-is-tps-tokens-per-second-calculated-for-llms> — exact TPS definition and reference-value qualification.
- **M3:** <https://www.minimax.io/news/minimax-m25> — standard versus Lightning 50/100 tokens/s and differing price; historical launch claim, not current Zen timing.

### Local primary evidence and prior trials

- **L1:** Installed `node_modules/@earendil-works/pi-ai/dist/providers/data/opencode.json` — all 81 installed entries and complete thinking maps/API groups; `package.json` — Pi 1.5.0 pin.
- **L2:** Installed `dist/models.js:693–723`; `dist/api/anthropic-messages.js:732–765,898–900,959–995`; `dist/api/openai-completions.js:654–708,1217–1279`; `dist/api/openai-responses.js:284–304` beneath the same Pi package — available levels, clamps and request construction.
- **L3:** [`src/agent/notebook-editor.ts`](../../src/agent/notebook-editor.ts), especially prompt lines 8–22 and call/validation lines 90–134 — semantics, prompt-only JSON, timing and retries.
- **L4:** [`src/agent/models.ts`](../../src/agent/models.ts), especially lines 108–123 — app level resolution and off → undefined Pi reasoning.
- **L5:** [Zen low comparison](notebook-zen-low-comparison.md) — two-case correctness/timings and verified outgoing low controls.
- **L6:** [Earlier model research](notebook-editor-fast-models.md) and [delivery record](../notebook-delivery.md#catalog-reuse-full-path-follow-up) — current Terra browser baseline and prior Luna/medium context.
- **L7:** [Gemini minimal trial](notebook-zen-flash-lite-trial.md) — preservation failure and complete editor timing.
