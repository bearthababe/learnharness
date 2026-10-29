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

## Owner acceptance and real-model summary check

After the desktop walkthrough and reasoning-effort comparison, the owner
confirmed: **“The experience was good, no mobile testing.”** The desktop
experience is accepted. Mobile testing is excluded from this release's
acceptance gate; physical iOS behavior has not been verified.

The real walkthrough demonstrated focused problems, learner reasoning, useful
mental-model/method explanations, side questions, explicit continuation and
honest helped versus independent outcomes. The subsequently inspected final
turns also show a Medium-effort trial and a wrap-up recommendation: stop here,
recognize independent setup versus prompted arithmetic correction, and try a
fresh conversion next time without reviewing first. The tutor explicitly
distinguished current usability from retention after a break.

The owner-approved effort sweep compared Low, Medium, High and Extra High on
the same model across five fixed-history cases, twice each (40 replies). All
completed without model/tool failures. Median completion times were 14.7,
15.2, 21.3 and 28.3 seconds respectively. The owner's saved drill now uses
Medium; global defaults were not changed by this evaluation. This is not
evidence of equal capability on harder material. The initial drill policy
remains the accepted wording.

The owner-requested real-model summary review passed on 2026-10-29 using
`chatgpt:gpt-6.1-sol` at Medium:

- Summarized the first 31 messages of the actual 33-message drill using the
  production serializer, drill-aware prompt builder, exact server summarizer
  system prompt and zero-tool model runner. Retained the wrap-up exchange.
- Reviewed the summary against its source: goal, preferred block mental model,
  repeatable method, independent versus assisted work, unresolved arithmetic,
  retest flags and untested transfer/retention all survived. The current moment
  correctly waits for permission before another problem.
- Saved/reopened an isolated rehearsal record, projected summary plus retained
  messages, then ran a real continuation through the application chat handler.
  It accurately recalled all three conversions, actual help and the next-time
  recommendation. No new problem was posed. Fresh drill instructions were
  confirmed through the saved prompt-token metadata.
- The original learner record remained byte-for-byte unchanged. The local app
  server was restored and returned HTTP 200 after the isolated check.

Scope: this was a short real-record summary-quality and continuation rehearsal
with a manual cut, not an automatic long-history threshold/cut-selection test.
The latter is covered by the existing regression suite. The first rehearsal
stopped on a test-script assertion comparing raw multiline text against JSON;
correcting the assertion and reusing the same generated summary passed. No
application change was needed.

Private source, prompt, summary, continuation, runner and result evidence:
`~/.local/share/learnharness/evaluations/drill-summary-20261029/`.

The parent [specification #11](https://github.com/bearthababe/learnharness/issues/11)
now awaits the delivery decision: approval to merge/push and close it.

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
