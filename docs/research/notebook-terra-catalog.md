# GPT-6.1 Terra: upstream Pi catalog availability

Investigated **2026-11-03**, against the public npm registry and the upstream
`earendil-works/pi` repository. Scope: package availability, shipped metadata and
upgrade compatibility. The owner subsequently approved the upgrade and packaging
fixes recorded in the implementation follow-up below.

## Result

**Both packages have a published `1.5.0` release newer than the installed/pinned
`1.4.0`. The actual `pi-ai@1.5.0` npm tarball includes `gpt-6.1-terra` for both
`openai` and `openai-codex`; the `1.4.0` tarball does not.** This was verified by
reading the packaged catalog, not inferred from the `latest` tag. [1–6]

An upgrade would supply the missing upstream metadata, but **1.5.0 includes
explicit breaking changes to tool-schema typing and validation**. It is not a
catalog-only update. Neither package metadata nor this investigation establishes
that the application's ChatGPT connection exposes Terra or that the user's
account can generate with it. Local filtering and account availability are a
separate investigation. [7–8]

## Local account and filtering verification

The separate local check on 2026-11-03 confirmed that the saved ChatGPT account
**does expose `gpt-6.1-terra`**, named `GPT-6.1 Terra`, with no catalog error.
With no LearnHarness server or desktop credential owner running, the production
`createChatGPT` / `fileStore` adapter performed catalog discovery and was closed
afterward. Only availability, catalog error and model IDs/names were printed;
no credentials or account identifiers were captured. This was discovery, not a
generation or latency test.

The filtering point is
[`src/agent/chatgpt-bridge.ts`](../../src/agent/chatgpt-bridge.ts),
`refreshChatGPTModels`: an account model is retained only when the installed
OpenAI `openai-responses` catalog has the same ID. An offline replay through that
actual function supplied account entries `gpt-6.1-terra` and `gpt-6-luna`;
the resulting picker catalog contained only `gpt-6-luna`. Both assertions passed.
The account list comes from the production discovery implementation in
[`electron/chatgpt.cjs`](../../electron/chatgpt.cjs), `models()`.

Together with the upstream tarball evidence, this establishes the installed
catalog as the reason Terra is absent from the current picker. Upgrading the
catalog can address discovery; successful generation, editing quality and the
owner's aspirational roughly-one-second Apply target remain unmeasured.

## Published versions

| Package | Installed and pinned | npm `latest` | Publication time (UTC) |
| --- | --- | --- | --- |
| `@earendil-works/pi-ai` | `1.4.0` | `1.5.0` | 2026-11-02 10:57:51.240 |
| `@earendil-works/pi-agent-core` | `1.4.0` | `1.5.0` | 2026-11-02 10:57:12.137 |

At inspection, `1.5.0` was the **only published version above `1.4.0`** for each
package. Both also had `legacy-node20: 0.74.2`; neither had a newer prerelease
dist-tag. Registry manifests identify the official repository as
`https://github.com/earendil-works/pi`, with package directories `packages/ai`
and `packages/agent`. [1–4]

Local baseline: [`../../package.json`](../../package.json) and
[`../../package-lock.json`](../../package-lock.json) pin both to `1.4.0`;
the installed packages' `package.json` files also reported `1.4.0`.

## Concrete Terra metadata in `pi-ai@1.5.0`

Read from `package/dist/providers/data/openai.json`, `openai-codex.json` and
`azure.json` inside the integrity-verified npm tarball. Each contains
`chat:gpt-6.1-terra` in its API group, with `id: "gpt-6.1-terra"`,
`name: "GPT-6.1 Terra"`, `type: "chat"`, `reasoning: true`, text/image inputs,
and `maxTokens: 128000`. [5]

| Provider | API | Base URL | Catalog context window | Thinking map |
| --- | --- | --- | ---: | --- |
| `openai` | `openai-responses` | `https://api.openai.com/v1` | 272,000 | off → `none`; minimal → `null`; low/medium/high/xhigh/max → same string |
| `openai-codex` | `openai-codex-responses` | `https://chatgpt.com/backend-api` | 500,000 | off → `none`; minimal → `low`; low/medium/high/xhigh/max → same string |
| `azure` | `azure-openai-responses` | empty string (deployment configuration required) | 272,000 | same map as `openai` |

The upstream OpenAI catalog source explicitly caps Terra's default context at
the short-context pricing tier; **272,000 is Pi's default, not a claim about the
model's absolute backend limit**. The Codex source explicitly lists Terra at
500,000. The upstream family rules distinguish Terra's supported `off` effort
from GPT-6.1 Sol's unsupported `off`. [9–11]

Compatibility flags actually shipped:

- `openai`: `supportsStrictMode`, `supportsOpenAIGrammarTools`,
  `supportsAdditionalTools`, `supportsToolSearch`,
  `supportsMidConvoSystemMessages`, `supportsExplicitPromptCacheMode`, and
  `supportsMidConvoEffort` are all `true`.
- `openai-codex`: grammar tools, additional tools, tool search, and
  mid-conversation system messages are `true`. It does **not** declare the
  OpenAI entry's `supportsMidConvoEffort` flag.
- `azure`: `supportsOpenAIGrammarTools: true`.

OpenAI and Codex cost metadata (USD per million tokens): input **1**, output
**5**, cache read **0.05**, cache write **1.25**. Their tier above **272,000 input
tokens** is input **2**, output **7.5**, cache read **0.1**, cache write **2.5**.
Azure has the same base rates but no `tiers` property in this tarball. These are
catalog estimates, not evidence of subscription charges. [5,11]

The same tarball also contains Terra references in GitHub Copilot, Cloudflare AI
Gateway, OpenRouter, Vercel AI Gateway and Amazon Bedrock catalog files; those
other routing paths were not evaluated. No Terra string appeared in the
inspected `.json`, `.js`, `.ts`, or `.md` files of `pi-ai@1.4.0`. [5–6]

The tagged upstream AI changelog explicitly announces Terra in **1.5.0** for
OpenAI, Azure OpenAI Responses and OpenAI Codex, consistent with the published
artifact. [7]

## Upgrade compatibility assessment

### Dependency and runtime boundary

- Both versions of both packages require **Node >=22.19.0**: no new minimum
  Node version in this upgrade. The npm export maps are unchanged. [3–4,12–13]
- Agent core `1.4.0` depends on **exactly** pi-ai `1.4.0`; agent core `1.5.0`
  depends on **exactly** pi-ai `1.5.0`. Upgrading only the application's direct
  pi-ai pin would leave agent core requesting the old version; an aligned pair
  should be evaluated rather than assuming one bump updates both. [4,13]
- Both `1.5.0` packages replace their direct `typebox` dependency with
  `@earendil-works/pi-schema: 1.5.0`. Pi-ai also updates pi-telemetry from `1.4.0`
  to `1.5.0`; its OpenAI SDK remains `7.19.0`. The app independently depends on
  `typebox`, so removing the SDK dependency does not itself require dropping
  TypeBox from app tools. [3–4,12–13; local `package.json`]

### Explicit upstream breaking changes

1. **Removed re-exports:** pi-ai's root no longer exports TypeBox `Type`,
   `Static`, or `TSchema`. Direct imports from `typebox` remain an upstream
   documented migration path. [7]
2. **Tool argument types:** `Tool`/`AgentTool` accept any JSON Schema object.
   Agent-tool argument inference now uses pi-schema. Common TypeBox kinds
   retain inference; other kinds including Enum, Tuple and Intersect become
   `unknown`. `AgentTool<any>` remains `any`. [7–8]
3. **Validation semantics:** validation now uses
   `compile(schema, { coerce: true }).parse()`. Coercion applies to plain JSON
   Schema tools too, and validation error wording changes. TypeBox refinements,
   codecs and custom registered formats no longer supply their previous
   behavior; upstream documents further `$ref` and property-conversion changes.
   This is a runtime behavior change even if TypeScript passes. [7]
4. **Grammar streaming helper:** `appendGrammarToolInputJsonDelta()` takes
   only the delta and needs a separate `closeGrammarToolInputJson()` call. [7]

Other relevant changes include a shared incremental tool-argument parser,
partial arguments in faux-provider streams, and keeping raw parser state off
partial content blocks/transcripts. The catalog generation source also moves to
models.dev v2, changing the model inventory beyond Terra. [7–8]

### Evidence from this application's source

- A static import scan of `src`, `tests`, `scripts` and `components` found no
  named `Type`, `Static` or `TSchema` imports from the pi-ai root. For example,
  [`src/agent/tools/find.ts`](../../src/agent/tools/find.ts) already imports
  `Type` directly from `typebox`.
- A targeted scan of `src/**/*.ts` found no use of `Type.Enum`, `Type.Tuple`,
  `Type.Intersect`, `Type.Refine`, `Type.Codec`, `Type.BigInt`, `Type.Undefined`,
  `Type.Void`, `Format.Set`, `StringEnum`, or the changed grammar helper.
  This reduces obvious migration work; it is not a completed compatibility test.
- [`src/agent/tool-execute.ts`](../../src/agent/tool-execute.ts) explicitly
  relies on upstream structural argument validation and carries TypeBox
  generics. Its runtime contract and existing tool-validation tests warrant
  review with the new validator.
- [`next.config.ts`](../../next.config.ts) and
  [`scripts/smoke-provider-runtime.mjs`](../../scripts/smoke-provider-runtime.mjs)
  have explicit SDK packaging/tracing assumptions. A future approved upgrade
  should check those alongside type checking, tool validation, stream handling,
  subscription adapter tests, and catalog resolution. This investigation did
  not install or type-check `1.5.0` against the app, so compatibility remains
  **plausible but unverified**, not certified drop-in.

## Method and boundaries

Fetched public npm metadata and the `1.4.0`/`1.5.0` tarballs for both packages
using unauthenticated read-only HTTP. Verified each tarball against its registry
SHA-512 `dist.integrity`, then extracted with safe tar filtering into the unique
scratch directory `/tmp/opencode/terra-upstream-5ix7uet2`. Compared package
manifests, catalog JSON and declarations; read the upstream tagged changelogs
and catalog implementation. GitHub's tree API resolved `v1.5.0` to
`f9a26365568127461c47a07a37dcb42c140a3ac5`. [14]

The upstream research itself performed no installation, credential access or
generation. The separate account-discovery check is described above.

## Approved implementation follow-up

The owner approved the aligned upgrade to **pi-ai / pi-agent-core 1.5.0**, then
approved updating compatibility fixtures and fixing desktop trace exclusions.
`package.json` and the lockfile now use the aligned releases, with pi-schema and
pi-telemetry 1.5.0. Changed dependency directories were detached before install
because this checkout shared hardlinked dependency files with other worktrees.

The first full run found 24 failures out of 2,662 tests. Investigation identified
changed catalog prices/windows, OpenCode Go transport paths and its renamed
Google model, and corrected faux-provider cache accounting (prompt tokens are no
longer double-counted as fresh input and cache writes). Approved fixture updates
preserve the validation, credential isolation, usage persistence and compaction
boundary assertions. The updated suite passed all 2,663 tests, including a new
Terra catalog regression; type checking and lint also passed.

Production packaging exposed two concrete issues:

1. Pi 1.5's GitHub Copilot OAuth adapter imports `trusted-url.js`. Add that file
   to the existing narrow runtime trace includes. The offline runtime gate now
   initializes all tested provider/OAuth paths successfully.
2. Next 16.3.2 copies `instrumentation.js.nft.json` separately from the route
   exclusion pass. It included repository-local test sessions in standalone.
   The owner approved a documented `compiler.runAfterProductionCompile` hook
   that filters project-root `data/`, credential files and `.env*` out of this
   trace before copying. The regression first failed without the hook, then
   passed through the real config hook, retaining recovery chunks, prompt assets
   and SDK data/auth files, preserving source records, and checking idempotence.
   The existing final payload refusal guard remains active.

A clean production build, payload curation and `smoke-server.mjs --electron`
passed: Electron's bundled Node loaded the standalone SDKs offline and served
`/`, `/api/graph`, `/api/models`, and `/api/settings` with HTTP 200. A subsequent
full run exposed only the old exact include-list expectation; that fixture was
updated to include `trusted-url.js` and the final run is recorded in delivery.
The final full suite passed **2,664 tests / 499 suites**, zero failures.
The standalone instrumentation trace and payload contain no project-root data.

Authenticated discovery through the upgraded production picker projection
confirmed `chatgpt/gpt-6.1-terra`, supporting off/low/medium/high/xhigh/max.
**No model selection, reasoning setting, generation call or speed benchmark was
changed/performed during this upgrade.** The Notebook remains configured for
Luna/medium until the owner chooses the Terra trial.

Subsequent owner-approved Terra/low trial: two direct editor calls completed in
3,917 ms and 3,767 ms without retries. Editing quality needs review and the
roughly-one-second goal remains unmet; see
[delivery evidence](../notebook-delivery.md#terra-61--low-speed-trial).
The trial did not change saved model settings.

Detailed check logs: `/tmp/opencode/notebook-integration/check-28-pi15-*.log`.
Next-specific evidence: installed `next/dist/build/collect-build-traces.js`
(route include/exclude loop), `next/dist/build/utils.js` (separate instrumentation
copy), and the documented compiler hook in
`next/dist/docs/03-architecture/nextjs-compiler.md`.

## Primary sources

1. [npm pi-ai full registry metadata](https://registry.npmjs.org/@earendil-works%2fpi-ai) — versions, tags and publication timestamps.
2. [npm pi-agent-core full registry metadata](https://registry.npmjs.org/@earendil-works%2fpi-agent-core) — versions, tags and publication timestamps.
3. [npm pi-ai 1.5.0 manifest](https://registry.npmjs.org/@earendil-works%2fpi-ai/1.5.0).
4. [npm pi-agent-core 1.5.0 manifest](https://registry.npmjs.org/@earendil-works%2fpi-agent-core/1.5.0).
5. [Published pi-ai 1.5.0 tarball](https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-1.5.0.tgz) — `package/dist/providers/data/*.json`, `package/dist/**/*.d.ts`, `package/package.json`.
6. [Published pi-ai 1.4.0 tarball](https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-1.4.0.tgz) — baseline catalogs and declarations.
7. [Upstream pi-ai 1.5.0 changelog](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/CHANGELOG.md#150---2026-11-02).
8. [Upstream pi-agent-core 1.5.0 changelog](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/agent/CHANGELOG.md#150---2026-11-02).
9. [OpenAI catalog provider rules](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/catalog/providers/openai.ts).
10. [OpenAI Codex catalog provider rules](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/catalog/providers/openai-codex.ts).
11. [OpenAI family rules and cost metadata](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/catalog/families/openai.ts).
12. [npm pi-ai 1.4.0 manifest](https://registry.npmjs.org/@earendil-works%2fpi-ai/1.4.0).
13. [npm pi-agent-core 1.4.0 manifest](https://registry.npmjs.org/@earendil-works%2fpi-agent-core/1.4.0).
14. [GitHub v1.5.0 source-tree API](https://api.github.com/repos/earendil-works/pi/git/trees/v1.5.0?recursive=1).
