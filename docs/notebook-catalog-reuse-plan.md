# Notebook catalog reuse

Owner approved **Implement and measure**, 2026-11-03.

Status: implemented and verified. Warm Apply no longer requests provider model
discovery; full-browser results are **3.428 s** (silent click) and **2.995 s**
(replacement during continued dictation), using isolated Terra/low settings.

## Change

Use the existing in-memory, account-bound catalog when Notebook's selected model
has a valid subscription scope. Add `ensureConnectionModel(provider, id)` in the
server catalog module and call it from Notebook's production engine resolver.
It checks the existing ChatGPT/native-subscription scope functions and refreshes
on a missing/invalidated selected model. API-key models continue to use Pi's
local catalog. No new persistent cache, timer or expiry policy is introduced.

Account/authorization changes keep their existing invalidation behavior. Every
generation still takes its normal credential lease, including refresh-token
handling, scope checks and no API-key fallback. Explicit catalog/Providers
refresh still fetches fresh state. A remote model rejection is surfaced through
the existing failure and explicit refresh/retry flow; no automatic replay or
silent model/account substitution is introduced. Other catalog callers keep
their explicit-refresh behavior.

## Checks

Exercise actual Notebook request parsing, production engine resolution, web
credential owner and provider transport with isolated fixture credentials and
mock HTTP. Count discovery and generation separately: cold lookup once, repeated
Apply without discovery, fresh credential admission every time, explicit refresh,
account switch, removed/unknown model, failed refresh and explicit retry.
Retain existing desktop IPC authority/lease and native-subscription tests.

Then typecheck, lint, relevant Notebook/catalog/subscription tests, production
build and payload curation. Reuse the actual-browser timing harness for two
isolated Terra/low cases: silent clicked Apply, then continuation with the known
pressure formula seeded. Same audio as the previous successful cases; record
click → visibly changed working and correctness, including retries. Count any
provider catalog requests during Apply independently of the model generation.

Live authorization: **at most four editor calls including retries and 80
additional speech seconds**, zero Tutor calls. Normal settings and occupied
preview listeners remain under their existing owners. Cold startup discovery
remains necessary and is not claimed as eliminated.

## Verification results

The production-path regression reproduced two catalog HTTP requests for two
Applies before the change. Afterward it observed one cold discovery, two
generations and two independent credential leases. Additional checks covered
explicit refresh, account switching, removed models, failed refresh, authorization
failure without retry/fallback, paused authorization, and native catalog reuse.
**117 relevant tests**, typecheck, lint, production build, payload curation and
whitespace checks passed.

The live harness's external, metadata-only fetch probe observed five successful
startup/settings/page-load catalog requests (740–1,001 ms each), establishing that
the probe was active. It observed **zero catalog requests during either Apply**.
No auth headers, tokens or provider payloads were logged by the probe.

| Case | Earlier visible wait | New visible wait | Speech ready | Ready → model start | Model | Result → visible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Silent click | 4.570 s | **3.428 s** | 0.294 s | 0.006 s | 2.837 s | 0.291 s |
| Replacement while dictating | 4.147 s | **2.995 s** | 0.298 s | 0.004 s | 2.413 s | 0.279 s |

Outputs expressed pressure = force/area and `p = \frac{F}{2A}`. The later
instruction “Keep this instruction for later.” remained in the next draft.
One editor attempt and one speech Finalize per case; complete recordings, normal
socket closure, no browser errors or Tutor sends. These are single samples with
generated audio through the real browser transport, not physical-microphone or
iPhone acceptance. Model/recognition variability remains; normal saved model
settings were not changed.

Evidence under `/tmp/opencode/notebook-integration/`:
`check-28-visible-catalog-reuse.json`, its zero-generation preflight,
`check-28-visible-latency.mjs --catalog-reuse`, and the test-only
`check-28-catalog-fetch-preload.mjs`. Trial servers/browsers closed afterward.
Usage: **2/4 authorized editor calls**, **23.968/80 authorized speech seconds**,
zero Tutor calls. No retries or repeats. Cumulative verification: **45 editor
calls, 5 Tutor calls, at most 865.280 speech seconds**.
