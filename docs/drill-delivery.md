# Focused drills — implementation delivery

Implemented on `integration/focused-drills`, based on `b577ec5`.
Application changes through `37fcbbc` implement the approved initial plan and
the owner's subsequent instruction-size accounting fix.

## Delivered

- Home and sidebar Drill entry points, start-on-first-send, saved labels and
  existing practice filtering.
- Saved `kind: "practice"` / `practiceMode: "drill"` identity, validation,
  retry separation, graph subject context, settings changes and reopening.
- Dedicated, freshly loaded drill policy with applicable shared overrides;
  adaptive assistance through existing practice tools and recorded outcomes.
- Existing one-problem, reasoning, discussion, solution reveal and explicit
  Next flow.
- Drill-aware summaries, full original transcript preservation and continued
  drill instruction selection after summarization.
- Instruction-size adjustments to provider-based context estimates, using
  saved per-turn `drillPromptContext`. Older drill replies without matching
  metadata use the current text-based estimate. Ordinary sessions retain
  their existing estimate behavior.

The separately editable policy is `src/agent/prompts/drill/10-drill.md`.
Changes apply to the next constructed tutor response, including saved drills;
an already-running response retains the instructions it started with.

## Verification

- Final combined regression suite after review fixes: **2,535 passed**, no
  failures/skips (`npm test`, isolated `LH_DATA_DIR`, `NODE_ENV=test`).
- Review-fix checks: **71 targeted tests passed**, typecheck and lint passed.
- Production build passed before the accounting-review fix. It reported four
  filesystem-tracing warnings in unchanged `headless.ts`, `pdf-read.ts` and
  `store/graph.ts`; no baseline build was run to establish warning history.
- Real Next/Chromium smoke passed home creation, persisted identity, header,
  reload, sidebar draft and a 390px viewport. It used isolated records and
  made no live-model calls.
- The golden drill was created/reopened through real Next HTTP, with the
  real chat handler, tools and persistence driven by four offline scripted
  model calls. Capture details are in `tests/fixtures/golden-data/README.md`.
- Independent standards and specification reviews found a missing fixture
  and stale instruction-size accounting. Both findings were fixed and the
  follow-up reviews reported no remaining actionable findings.

## Remaining acceptance

Implementation checks do not establish teaching quality. The parent
[specification #11](https://github.com/bearthababe/learnharness/issues/11)
retains these acceptance steps:

- Owner's unit-conversion walkthrough: useful help/mental model, fresh
  application, side question, chosen pacing, resume and wrap-up recommendation.
- Review a representative real-model summary for preservation of drill
  context and honest distinctions between assistance, immediate success and
  delayed retention.
- Physical iOS keyboard/scrolling acceptance. The browser smoke checked a
  mobile-sized viewport, not physical touch gestures or keyboard behavior.

The two existing phone previews retain their owners and processes. No drill
preview endpoint has been published.

## Exact shared-code footprint and plugin exposure

Sixteen existing production files changed, plus two drill-owned files:

| Area | Existing production files | Maintenance and likely plugin work |
| --- | --- | --- |
| Saved identity and creation | `src/core/contracts/chat.ts`, `src/core/ports.ts`, `src/store/chats.ts`, `app/api/chats/route.ts` | Follow upstream record and creation changes. Storage bridge and optional usage metadata may need adaptation/migration. |
| Launch and drafts | `components/home.tsx`, `components/sidebar.tsx`, `components/new-session.tsx`, `components/start-session.ts`, `app/chat/new/page.tsx` | Follow navigation/draft changes. Plugin launch registration may replace these hooks. |
| Saved labels | `app/chat/[id]/page.tsx`, `components/chat.tsx`, `components/sidebar.tsx` | Follow view props and saved-row rendering. Host display hooks may replace this wiring. |
| Agent and tools | `src/agent/teacher-agent.ts`, `src/agent/tools/practice.ts`, `src/server/chat-handler.ts` | Follow agent construction, tool contracts and settlement. Plugin instruction/tool hooks would replace or adapt host integration. |
| Summaries and estimates | `src/core/compaction.ts`, `src/server/compaction.ts`, `src/server/chat-handler.ts` | Follow compaction lifecycle and usage-anchor semantics. Plugin lifecycle/estimation hooks remain unknown. |

Drill-owned additions: `src/agent/drill-instructions.ts` and
`src/agent/prompts/drill/10-drill.md`. The policy is plausibly reusable; its
loader will depend on the eventual plugin interface. Shared-core integration
is small but distributed, and migration is not guaranteed to be drop-in.

Implementation commits: `40b2f6f` (approved documents/initial flow), `7eb877f`
(complete drill flow), `f2d5bbd` (long-session continuity), `37fcbbc` (review
fixes and application-written fixture).
