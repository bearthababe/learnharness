# Notebook + mobile acceptance — 2026-11-05

Authoritative combined verification record for #28/#18. Review baseline:
`d161c0d707e605e2a6ea5761b4f40bbd78dc0c58`. Notebook checkpoint: `2d43b41`.

**Terra/Sol reasoning controls and numbered, selectable expressions verified and deployed.**
Source `73878eb`, production build `_Hk4ZaeJveuA2XxOX61c3`, at **https://thinkpad.tailfd9bf6.ts.net:8444/**.
The current fork's native Electron app remains open; use **Reload preview** to
load the update. **Owner acceptance, reviewed main integration and #28/#18 closure
completed 2026-11-05.** See the final combined integration receipt below.

Current tracker receipt: [#28 expression/picker deployment](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6657245951),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6657248245).

Earlier tracker receipt: [#28 current-line/Close](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6652921783),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6652925481).

Earlier tracker receipt: [#28 menu review](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6644717383),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6644720461).

Earlier tracker receipt: [#28 continuation fix](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6643703927),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6643706613).

## Terra/Sol controls and expression references — 2026-11-05

### Owner acceptance and final review

The owner confirms the physical-phone/real-learning walkthrough is done: “I have
been using it for a while and it works decently enough.” This is owner-reported
acceptance after continued use, not a claim of newly instrumented device measurements.
They authorized final review, integration into the main combined app, and closure
of #28/#18. Prompt tuning is explicitly deferred to
[#52](https://github.com/bearthababe/learnharness/issues/52).
Acceptance receipt: [#28](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6657651662).

Two independent review axes examined `3376401...ad48115`:
- **Standards:** missing golden capture for new persisted fields; model policy in
  the server rather than core; duplicated KaTeX fallback (maintainability suggestion).
- **Spec:** delimiter aliases/Unicode groups and annotated relations could produce
  incorrect expression addresses.

Corrections move picker migration/eligibility policy into core, share rendering
fallback, and capture new application-written picker/selection data with provenance.
Grouping aliases now remain intact; annotated relations conservatively use whole-line
addressing and rendering. Parser regression went red before the fix; targeted
expression/model/UI/golden checks passed (`check-28-review-grouping-red.log`,
`check-28-review-fixes-final.log`). Both reviewers rechecked the corrections:
**zero unresolved Standards findings, zero unresolved Spec findings**. No live calls.

The owner approved staging the combined merge separately, preserving/backing up the
main checkout's local work and restoring it as uncommitted changes after integration.

### Final combined integration — 2026-11-05

Combined merge `270bc35` joins reviewed Notebook `030bfc3` with the main app's
`36550e7` mobile baseline. Shared-menu resolution retains main's existing viewport
implementation; the browser runner retains main's process cleanup and all mobile
suites plus Notebook editing/layout checks.

The combined tree passed **2,717/2,717 deterministic tests**, typecheck, lint,
production build, packaged-server and Electron smoke checks. Browser integration
exposed one actionable-error regression: recording recovery replaced a missing
Deepgram key's Settings action with a generic interruption error. The owner approved
preserving the original error while retaining recovery. Correction `6b8f597` has a
mounted red→green regression and a passing browser reproduction. Both review axes
confirmed zero unresolved findings after that correction. Browser waits also now
distinguish fresh sockets from a deliberately reopened cancelled fake socket, and
wait for durable Send rather than optimistic rendering.

Further combined checks reproduced an initial-draft hydration race. The owner chose
to wait for saved drafts before editing: `ad3cac9` gates Tutor inputs and submission
until loading completes, displays loading/Retry, restores ordinary text before
paint, and gates global question keyboard actions and recording. Five mounted
activity tests hold the initial response before exercising Send; a keyboard test
verifies blocked selection/submission before loading and normal behavior afterward.
A browser check deliberately delays loading, fails it, retries, and confirms restored
text is present before editing becomes available. All targeted regressions pass.
The owner also approved single-line ellipsis for the narrow-phone Tutor model label
to stabilize its menu anchor with the added Notebook control; full picker names
remain available. Both reviewers cleared the completed corrections.

Main's existing local work is backed up in
`/home/bjorn/.cache/opencode/notebook-main-preservation-20261105/` (original manifest,
tracked patch and archive: nine modified tracked files, 282 untracked files).
An isolated overlay reconciles the glossary, page metadata and chat wrappers while
retaining the opt-in handwriting prototype. Overlay typecheck/lint and browser
layout checks at 390/820/1440px, including tablet/desktop expand and return, passed.
Unrelated local work remains uncommitted; concurrent updates to the mobile evidence
document are retained in place.

Final corrected source `ad3cac9` passes **2,719/2,719 deterministic tests** (500
suites, zero failures/skips), lint, production build, payload/Electron smoke, and
preserved-local-work overlay typecheck. Build identity: `nFQu1OeJMoR3j8LvYFnsp`.
All constituent browser suites passed: main mobile input/panel/gesture checks plus
Notebook editing and layout in `browser.log`; downstream reveal and mobile layout
in `reveal.log` and `layout-final.log`. The downstream scripts were adapted to
explicitly scoped disposable Notebook writes and timestamped speech, because real
recording now persists recovery state. An initial cold-navigation timeout was
resolved with the existing fixture warmed and a bounded navigation timeout.
No additional live calls were made; the accepted six-call budget remains exhausted.

**Landed:** `integration/focused-drills` fast-forwarded to `3f241c3`. Main's current
nine modified tracked files and 284 untracked files were preserved as local work;
this includes two new files and research/evidence edits added concurrently after
the first backup. Four overlaps match the verified overlay byte-for-byte; the other
289 local files match the immediate pre-landing snapshot. Original and pre-landing
archives/patches remain in the preservation directory, with the four-file backup
stash `466f5e5e5e2b253cf02b1fccae2fe10e07c0483f`. Receipt: `landing.json` there.
Main typecheck passes; its dev server additionally regenerated `next-env.d.ts` as
an uncommitted generated-file change. Main's existing slot-3 HTTPS endpoint serves
the integrated Notebook (read-only `main-serving.json` check).

**Deployed:** existing slot1/Home Screen URL
`https://thinkpad.tailfd9bf6.ts.net:8444/`, application source `ad3cac9`, build
`nFQu1OeJMoR3j8LvYFnsp`, standalone
`/home/bjorn/.cache/opencode/notebook-final-build-ad3cac9`, observed PID4152830.
Local and actual HTTPS build identity, Reload, model choice/draft recovery,
manifest/icon responses, expression controls and keyboard/gesture layout checks
pass with zero owner writes (`production-preview.json`). Settings, API-key and
ChatGPT credential fingerprints are unchanged. Other preview ownership and
tailnet mappings are retained.

**Closed:** [#28 receipt](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6659062320)
and [#18 receipt](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6659062253).
Prompt tuning remains the separately deferred [#52](https://github.com/bearthababe/learnharness/issues/52).

Evidence logs under `/tmp/opencode/notebook-integration/`:
`check-28-merge-all-tests.log`, `check-28-key-recovery-{red,green}.log`,
`check-28-key-browser-green.log`, `check-28-final-{build,lint,payload,electron}.log`,
`check-28-overlay-{types,lint}.log`, and `check-28-overlay-hit.log`.
Loading evidence: `check-28-draft-loading-{red,green,browser}.log` and
`check-28-loading-keys-{red,focused}.log`. Final combined logs are in
`/home/bjorn/.cache/opencode/notebook-final-logs/`; an intermediate build/test run
produced truncated `/tmp` logs and was not counted as a pass. Old owned build caches
were archived to disk before the successful rerun with disk-backed logs.

Owner approved the complete implementation and deployment plan: separate Model
and Reasoning under ⋯ → Model; Terra/medium default for new and existing sessions;
Terra and Sol through ChatGPT only; session-specific subsequent choices and frozen
accepted operations. Terra/Off switches to Sol/Medium. Small numbered expressions
span outer-level relations, include the leftmost/empty trailing slot, renumber by
position, and support tapping “this”; whole-line selection remains available.
Changed lines clear expression selection while retaining the current line. The
source-preserving map is shared by rendering and model context, with conservative
whole-line fallback for uncertain segmentation. Vocabulary is in `GLOSSARY.md`.

### Six bounded live checks

**6/6 passed, zero retries; this approval's call budget is exhausted.**
Both models used medium reasoning through the existing native ChatGPT subscription.
Outgoing requests verified model, effort and byte-identical frozen per-case prompt.
All cases preserved unrelated working (including `2+2=5`), unfinished slots and Undo.

| Model | Numbered substitution | Tapped-source substitution | Mixed-relation edit |
| --- | ---: | ---: | ---: |
| Terra 6.1 / medium | Pass, 3.439 s | Pass, 2.955 s | Pass, 3.153 s |
| Sol 6.1 / medium | Pass, 4.049 s | Pass, 5.357 s | Pass, 3.499 s |

These are isolated editor timings, not phone click-to-visible timings or general
learning acceptance. Full frozen inputs, raw outputs and projected checks:
`/tmp/opencode/notebook-integration/expression-model-check-20261105/`
(`manifest.json`, `results.json`, `summary.json`). Runner:
`/tmp/opencode/notebook-integration/check-28-expression-models.mjs`.
Prompt SHA-256: `fcaef585d4625865663fecd823f94073ef5bd7439119307a44507a699fa38faa`.
The owner explicitly approved another native pause/reopen for credential ownership.
No subscription credentials copied; browser preview sign-in remains an owner action
through Providers. Native window reopening confirmed in `native-restored.log`.

### Software and mobile verification

- 136 Notebook regressions passed (`check-28-expression-regressions-final.log`),
  plus the additional queued DeepSeek migration case: all 8 model/recovery tests
  passed in `check-28-expression-legacy-final.log` (137 distinct cases total).
- Typecheck and lint passed (`check-28-expression-types-final.log`,
  `check-28-expression-lint-final.log`). Scanner checks include mixed relations,
  fractions/grouping, unfinished slots, source preservation and conservative fallback.
- Production-transport fixtures verify Terra/medium independently of shared Cheap;
  existing catalog reuse, account changes and no-fallback admission checks pass.
- Scripted real-browser Notebook/layout checks passed (`check-28-expression-browser.log`):
  separate model/reasoning, Off→Sol/Medium, 10px labels and expression/line taps,
  empty slots, frozen clicked selection, renumbering, selection clearing and reload.
  Existing original-recording ownership, Stop, Tutor Send, snapshots, clarification
  Close, independent drafts, phone/tablet/wide layouts and keyboard/gesture checks pass.
  Artifacts: `/home/bjorn/.cache/opencode/mobile-input-browser-28-expressions/`.
  Phone split/full screenshots inspected: muted labels remain outside mathematical
  notation, with working dominant. Physical iPhone acceptance remains pending.
- A later verification rerun encountered the `/tmp` per-user quota (`EDQUOT`,
  confirmed by a direct write probe and `usrquota` mount option). The branch's older
  `.next` cache was retained at
  `/home/bjorn/.cache/opencode/notebook-28-worktree-next-archive-20261105`; generated
  type declarations were retained locally. No learner files removed. Affected
  checks then passed.

### Production package

- Source **`73878eb`**, build **`_Hk4ZaeJveuA2XxOX61c3`**, staged from exact committed
  source at `/home/bjorn/.cache/opencode/notebook-28-build-73878eb`.
- Production build, payload packaging and Electron bundled-Node smoke passed:
  `check-28-expression-{build,payload,electron-smoke}.log`. Provider runtime checks
  made zero network attempts.
- Compiled Notebook prompt equals the six-call frozen prompt byte for byte:
  `check-28-expression-bundle.json`.
- Replaced only verified slot1 PID3757905 after confirming no pending Notebook
  operations. New server PID4045168, task `sh_1ab89e6b8001eUNDXkrrpUkYbL`, log
  `notebook-expression-production.log`. Existing main-repo data/auth paths retained.
  Native dev-shell PID4029903 reopened at the original local URL. Slot2 PID3484369,
  slot3 PID3458594 and all Tailscale mappings retained.

### Actual deployment verification

`check-28-expression-preview.json` and `check-28-expression-preview.log` verify
local/HTTPS HTTP200 and exact build identity, curated model/reasoning choices,
Off→Sol/Medium, fractional/mixed-relation expression taps, and actual **Reload
preview** retaining fixture choice/draft. Stable manifest/Apple metadata/icons,
phone-emulated keyboard visibility, history/edge/header/input gestures and
blur/desktop release passed with zero owner writes and no page errors. Production
phone/picker screenshots inspected in `check-28-expression-production-{phone,picker}.png`.
Pre/post fingerprints confirm main-repo auth and settings files unchanged.

Use the existing Home Screen icon and **Reload preview**; no reinstall required.
If installing for the first time: Safari → Share → Add to Home Screen → Open as Web
App → Add. Reload preserves saved Notebook work, choices and drafts. Live preview
editing requires connecting ChatGPT through Providers; no subscription credentials
were copied. The six isolated checks used the separately authorized native account.
Physical-device and owner real-learning acceptance remain pending; #28/#18 stay open.

## Owner follow-up: interpretation and latency — 2026-11-05

Owner reports the interaction feels better, but conversational mathematical edits
still hesitate and sometimes take too long; wants to consider stronger models.
Read-only inspection of the latest “Handwriting trial” operations found:

- `491358d7-597f-419b-9bdb-202994098fdc`: “Take the equation. In line one and
  insert in line two. Yeah.” → question about copying/replacing/appending.
- `2d48edcc-7d33-4e61-97ad-c5a8ffaacd89`: the answer explicitly says line one is
  for p and to insert p into line two. The model again asks copying-versus-substitution.
  The recorded speech fragments match the instruction. Input includes all three
  equations and 21 prior exchanges, including its preceding clarification question.
  Raw model output is already the repeated question; local application preserves
  state correctly. No missing-context or downstream-rewrite evidence in this case.
- Offline replay through `runNotebookEditor`, using the captured response, reproduces
  question/unchanged state and fails the edit-action check:
  `node --import tsx /tmp/opencode/notebook-integration/replay-latest-substitution.mjs`.
  This proves handling of the saved output, not repeatability of fresh model generation.
  No specific substitution expression is assumed: L1 contains several expressions,
  so clarification of which expression could still be warranted.
- The current prompt heavily emphasizes preservation/clarification and has no
  specific substitution guidance. Prompt-induced caution and model interpretation
  limits remain hypotheses; existing logs cannot separate them causally.
- Separate contract limitation: “Revert the revert” (`3ce2581f-359a-4603-9492-33bc3279f803`)
  returned another `undo`. The editor exposes Undo, not Redo, and expressly forbids
  reconstructing historical source for Undo. Its observed restored expression happened
  to match the earlier expression because of the preceding remove/reinsert sequence;
  this is not evidence of general Redo support.

All eight latest operations used DeepSeek V4.1 Flash/low, one attempt each:

| Request | Model-call elapsed | Accepted → attempt recorded | Reasoning tokens |
| --- | ---: | ---: | ---: |
| Remove multiplication sign + last expression | 16.315 s | 17.522 s | 1,492 |
| Revert the revert | 10.174 s | 10.793 s | 1,440 |
| Substitution clarification answer | 14.033 s | 15.037 s | 1,885 |

The other five model calls took 1.434–2.702 s. Long waits occur chiefly inside
the model call, with larger reported reasoning counts and no retries. These are
not measured click-to-visible times; logs do not separate provider waiting from
generation. A more capable model might reduce total task time by avoiding repeated
clarifications even with a slower individual response; this is not yet measured.

The prior 20-case suite favored DeepSeek/low but did not establish reliability
on this real substitution conversation. Recommend a bounded same-prompt comparison
on recorded tasks before changing the prompt, scoring intended edits, unnecessary
clarifications, preservation and response time. Live app catalog lists GPT-6 Astra
and Claude Opus 5.5 through Zen with medium reasoning available. No new live model
calls, app changes or model selection changes were made during this diagnosis.

### Approved stronger-model experiment

Owner subsequently approved **15 calls, no retries**: the exact saved substitution
follow-up, targeted removal and equality-continuation inputs on DeepSeek V4.1
Flash/low and Claude Opus5.5/medium through **Zen**, and GPT-6 Astra/medium,
GPT-6.1 Sol/medium and GPT-6.1 Terra/medium through **ChatGPT**. The owner corrected
the proposed Astra/Sol routing to ChatGPT and retained Zen for Opus. Astra/Opus
serve as higher-cost reference points. No app-model or prompt change approved.

Frozen complete inputs, conversation, current prompt and hashes:
`/tmp/opencode/notebook-integration/stronger-model-check-20261105/manifest.json`.
Runner: `compare-28-stronger.mjs` in the parent directory. Native LearnHarness
pause/reopen explicitly approved for ChatGPT credential ownership. No subscription
credentials copied. Isolated data directory; actual request bodies checked for
identical prompts, intended model and reasoning. Per-case dispatch and network
caps block retries. Offline fixture/catalog/wire preflight passed. Two harness
preparation runs failed before dispatch (`Request.url` treated as a method);
zero provider calls, archived receipts, corrected to the property before live runs.

### Stronger-model results — completed

**15/15 provider requests completed, one per cell, zero retries; budget exhausted.**
All transmitted prompts matched the frozen per-case hashes. Requested reasoning
was verified in outgoing bodies and all returned model IDs matched. Full inputs,
raw outputs, request controls, usage and timing: `zen.json`, `chatgpt.json`, and
projected `summary.json` in `stronger-model-check-20261105/` above.

| Model / reasoning / connection | Substitution follow-up | Remove last expression | Continue equality |
| --- | --- | --- | --- |
| DeepSeek V4.1 Flash / low / Zen | **Malformed edit**, 30.237 s | Correct, 1.944 s | Correct, 3.191 s |
| Claude Opus5.5 / medium / Zen | Clarification, 6.973 s | Correct, 1.740 s | Correct, 3.326 s |
| GPT-6 Astra / medium / ChatGPT | Targeted clarification, 12.271 s | Correct, 8.859 s | Correct, 6.735 s |
| GPT-6.1 Sol / medium / ChatGPT | Targeted clarification, 10.909 s | Correct, 3.907 s | Correct, 4.594 s |
| GPT-6.1 Terra / medium / ChatGPT | Targeted clarification, 4.499 s | Correct, 4.159 s | Correct, 4.595 s |

Times are editor wall times, including response validation and local evidence
checkpointing, not speech/click-to-visible. Account discovery excluded. One sample
per task/model, differing providers and uncontrolled prompt cache; no broad ranking
or tail-latency claim. All 15 preserved unrelated lines and correct Undo behavior.

**Actual substitution outputs:**

- DeepSeek replaced L2 with
  `F = \frac{F}{A} = \frac{600}{0.005} = \frac{600 \times 5}{1000} \times A`.
  It spliced the equality chain into p's position without distributing the existing
  multiplication across its expressions: only the last expression retains `× A`.
  This introduces a new structural error; it is not merely preserving the learner's
  existing deliberate numerical mistake. The same input previously produced a
  redundant copying-versus-substitution question, illustrating variability.
- Astra and Terra: “Which expression for p from line 1 should replace p in line 2:
  F/A, 600/0.005, or (600 × 5)/1000?” Sol asked the same selection question without
  “for p”. These recognize substitution and target correctly. L1 actually contains
  three expressions, not numerically equivalent; selecting one remains unresolved.
  They preserve the working rather than silently correcting it. This is a narrower,
  defensible clarification, but **none completed substitution in one call**.
- Opus: “Which expression for p should I substitute into line 2: 600/0.005 or
  (600 × 5)/1000? Should I extend line 2 as F = p × A = … × A, or replace p in the
  existing expression?” It recognizes substitution but omits the symbolic F/A
  option and additionally asks replace-versus-extend.
- All five produced exactly `p = \frac{F}{A} = \frac{600}{0.005}` for removal,
  and exactly `p = \frac{F}{A} = \frac{600}{0.005} = \frac{600 \times 5}{1000}`
  for continuation. The latter preserves the dictated mathematical mistake.

**Latency evidence:** DeepSeek's substitution response had headers at 574 ms,
first provider event at 851 ms, first answer text at 30.046 s, and 4,211 reported
reasoning tokens. Thus this run was not a 30-second wait to start receiving a
response; nearly all time preceded the answer text after streaming began. This
does not establish how much of that interval was computation versus server pacing.

**Recommendation:** Terra/medium is the most promising next in-app candidate from
this small sample: it gave the same focused substitution question as Astra/Sol,
with all three tasks around 4–5 seconds. More expensive reference models did not
resolve the remaining source-expression choice automatically. A default for choosing
from a chained equality remains an owner behavior decision, not an approved prompt
patch. Existing app choices/default remain unchanged (Terra is currently **off**).

Zen usage at recorded catalog rates estimates **$0.0059 DeepSeek + $0.0878 Opus**
for six calls, including cache usage; this is a token-price estimate, not an invoice.
Astra/Sol/Terra used ChatGPT subscription routing, dollar cost unpriced.

Native app restored with its original `LH_DEV_URL=http://127.0.0.1:3000` Wayland
launch. Log confirms window opened; observed **PID3911906**, task
`sh_1ab2a8563001kJxXRYgfaY5l8H`, log `stronger-model-check-20261105/native-restored.log`.
Slot1/2/3 server PIDs3757905/3484369/3458594 and Tailscale mappings retained.
No learning-record, app configuration, application code or prompt changes were made.

## Current-line, attachment indicator and clarification-close follow-up — verified and deployed

Owner approved the exact additional current-line paragraph in
`src/agent/notebook-editor.ts`, a small non-clickable paperclip beside the Notebook
toggle (accessible name **Working attached**) for the current activity, and both
close controls completing while a clarification is retained. Closing finishes the
original recording, snapshots the last completed revision once, and preserves the
unanswered instruction/question for reopening. Ordinary, question/all-channel and
practice activity scope is shared between review and indicator.

Saved operation `05150765-f32b-49f5-91df-5703f95e136d` in “Handwriting trial” asked
“line 2, line 3, or both?” after the learner created line 3 and requested removal
of the multiplication sign in `p × A`. The request contained all 13 prior exchanges,
including the immediately preceding line-3 insertion; no explicit cursor was set.
Offline replay reproduced the exact clarification. The earlier wording emphasized
“that”/“set that equal to”; the approved paragraph covers ordinary follow-up edits
and says repeated expressions elsewhere do not alone justify clarification.

**4/4 newly authorized DeepSeek/low Zen checks passed**, one attempt each:
current-line edit affected L3 only; explicit switch affected L2 only; all-occurrences
edited L2/L3 while preserving `600 × 10`; no-history/no-target ambiguity asked and
preserved source. Receipt and copied inputs/raw responses:
`/tmp/opencode/notebook-integration/current-line-check-20261105/receipt.json`;
log `check-28-current-line-live.log`. Exactly **four** new provider calls, no retries,
Tutor calls, speech capture or learner-record writes. This new budget is exhausted;
the six calls from 2026-11-04 remain separately recorded.

An isolated real service/session reproduction also showed why Close failed:
`settle()` rejected the clarification before visibility could be saved. The new
named close handoff permits clarification only, captures by completed working
revision rather than the unresolved operation, and uses the existing persistence
and deduplication paths. Regression went red (`check-28-close-red.log`) and green
(`check-28-close-green.log`), covering original recording ownership, no Apply/Send,
retained question/instruction, repeated close, and durable reopening.

Final verification before deployment:
- **129 affected tests passed**, zero failures (`check-28-line-close-tests-final.log`),
  including all four close regressions.
- Typecheck/lint passed (`check-28-line-close-{types,lint}.log`).
- Scripted-browser Notebook and layout checks passed (`check-28-line-close-browser-final.log`):
  paperclip absent before attachment, present beside the toggle after capture,
  removed after accepted Send; actual icon and menu Close with clarification;
  one completed snapshot across repeated close; question/instruction retained on
  reload; original dictation ownership, review editing, keyboard/gestures, and
  phone/tablet/wide layouts retained. Artifacts:
  `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-line-close-20261105/`.
- Self-review: exact approved prompt wording; existing snapshot revision boundary
  and deduplication reused; only the named close handoff tolerates clarification;
  ordinary speech switching and other error handling retain their existing gates.
  The indicator and optional review use one activity filter.

Close edge-case review also found that immediately after reload there may be no
selected speech destination. A close now independently settles and deduplicates
the attachment after selecting Tutor, so it cannot silently skip the snapshot.
The reload case went red in `check-28-close-reload-red.log`; the browser now reloads
with clarification before clicking the close icon and passed in
`check-28-line-close-browser-final.log`. A recording already owned by Tutor is also
explicitly finalized on Close, even though its destination need not change.
Both paths, the running-edit race and original Notebook recording are covered by
`tests/notebook-close.test.ts`. No further live calls were made.

### Final follow-up deployment receipt — 2026-11-05

- Feature `82e0916`, final close refinement **`eee28e1`**, build
  **`bwOO-o-0BGBnIxGb30hd1`**, staged from exact committed source at
  `/home/bjorn/.cache/opencode/notebook-28-build-eee28e1`.
- Production build, payload packaging and Electron bundled-Node smoke passed:
  `check-28-line-close-{build,payload,electron-smoke}-final.log` under
  `/tmp/opencode/notebook-integration/`. Provider runtime smoke made zero network attempts.
- Built prompt matches the four-call live receipt: SHA-256
  `278e7d2f5fb02014ab8081dd0d62c54cf3c21a426e6bf5b9f38dfde9eaa35fd3`.
  Identity receipt: `check-28-line-close-bundle-final.json`.
- Actual local/HTTPS build identity, toolbar/review/empty indicator, **Reload preview**,
  retained fixture choice/draft, stable Home Screen manifest/icons, emulated phone
  keyboard/gestures and blur/desktop release passed with **zero owner writes** and
  no page errors: `check-28-combined-preview.json`, `check-28-line-close-preview-final.log`.
- Replaced only verified intermediate slot-1 PID3748703. Final observed server
  **PID3757905**, task `sh_1aaba8cef001ot712VBzdDtsj6`, log
  `notebook-line-close-production-final.log`; serves the final standalone directory.
  Existing main-repo data/auth paths retained. Native current-fork Electron
  PID3540725 was confirmed running; **Reload preview** loads this update.
- Slot2 PID3484369, slot3 PID3458594 and all Tailscale mappings retained.
  Same **3000/8444** URL and Home Screen identity. Physical iOS and owner real-learning
  acceptance remain pending; #28/#18 stay open. All authorized live-call budgets exhausted.

## Menu review and input-toolbar follow-up — verified and deployed

Owner approved removal of inline previews, menu-only **Review attached working**,
editable explanation text (including current continuation), immutable ordered
snapshots, and review scoped to the current activity. Questions include Answer,
Thinking and Thinking while reading. Approved plain scrollable menu with Back and
“No working attached yet” empty state; opening inspects only, selecting a text
field uses existing Tutor handoff. The open/close icon moves below the active
Tutor input through `StatsBar.leadingSlot`; card Close remains in ⋯.

Implementation reuses `MenuShell` and the existing draft save/attachment paths.
Portaled review inputs carry their workspace identity, participate in the existing
Tutor handoff and mobile focus lock, and use a keyboard-aware menu viewport cap.
Closing an edited review releases its stale input reference. Input Enter inserts
a newline; menu Enter/Escape never applies or submits.

Full suite on the new application code: **2,694 / 2,695 passed**, with only the
new scope test failing on linkedom's lack of textarea defaultValue→value mirroring.
A standalone DOM reproduction confirmed that harness limitation. After correcting
the test to inspect React's initialized defaultValue, the affected UI/viewport/menu
tests passed; application code did not change for that correction. Logs:
`check-28-review-all-tests.log` and `check-28-review-final-targeted.log` under
`/tmp/opencode/notebook-integration/`. Browser checks also verify actual textarea
values and reload, rather than relying on the DOM emulator.

Final affected checks on source `dedc04f`: **135 tests / 3 suites passed**,
including Notebook UI/history/speech/activities, viewport locking, menu placement
and reading-thinking; **typecheck and lint passed**. Logs:
`check-28-review-final-targeted.log`, `check-28-review-types.log`,
`check-28-review-lint.log`. This follow-up made **zero live provider calls**.

Full scripted-browser run passed ordinary conversation, reading/reveal,
free-text/selection/Other answers, practice/drills, persisted submissions, speech
recovery, images/panels, phone focus/gesture checks, and the combined Notebook
flow including recording handoff into an earlier review field. Its final layout
check caught review dismissal refocusing the composer and retaining the keyboard
lock. The dismissal now updates future speech ownership without restoring input
focus; the browser regression explicitly requires release on Escape. Final
Notebook/layout re-verification **passed** in `check-28-review-browser-final.log`:
toolbar placement, no inline snapshots, earlier/current text editing and newline,
ordered explicit submission, reload, recording retained in its original Notebook
instruction when selecting review prose, no new capture/implicit Send, phone review
viewport/gestures, Escape release, tablet/wide layouts and retained split/scroll.
Artifacts: `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-20261105/`,
including `notebook-phone-attachment-review.png` and `notebook-phone-split.png`.
These are Chromium touch/keyboard emulation, not physical iOS acceptance.

Self-review against the approved follow-up and `docs/architecture.md`: UI changes
reuse the existing draft writer and speech handoff; no server/schema/model changes.
Review scope is current activity, snapshot order/source stay immutable, and the
shared menu's keyboard viewport option is opt-in for this editable review.

### Earlier menu-review deployment receipt

- Feature `ecb2afb`, focus correction **`dedc04f`**, build **`-z6WGr6Dicog2N6G3hDO1`**.
  Built from exact committed source in
  `/home/bjorn/.cache/opencode/notebook-28-build-dedc04f`; serves its standalone
  payload on the existing **3000/8444** slot. Prior builds retained.
- Production build, payload and Electron bundled-Node smoke passed:
  `check-28-review-build-final.log`, `check-28-review-payload.log`,
  `check-28-review-electron-smoke.log` under `/tmp/opencode/notebook-integration/`.
- Actual local/HTTPS build identity, single toolbar icon, menu-only review/empty
  state, actual **Reload preview** restoring fixture model/draft, manifest/icons,
  phone keyboard/gestures and desktop/blur release passed with **zero owner writes**:
  `check-28-combined-preview.json`, `check-28-review-preview.log`.
- Observed server PID **3638595**, task `sh_1a8d798bc001z04ZoQ0MDIOrkO`, log
  `notebook-menu-review-production.log`. Same existing data/auth paths. Native
  current-fork Electron PID **3540725** retained. Other slot PIDs **3484369** and
  **3458594**, all Tailscale mappings and the Home Screen identity retained.
  Recheck process identities before any lifecycle action.
- Verification command:
  `env LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-dedc04f node /tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.
- Use **Reload preview** in the existing app. Physical-device and owner-learning
  acceptance remain pending; #28/#18 remain open.

### Latest saved latency evidence

Read-only inspection of “Handwriting trial”, operation
`8126e5bc-d4db-41c5-88a0-1a60b3e76622`, instruction “Great. So that's equal to 600
times five, over a thousand.” Accepted `2026-11-04T22:40:39.077Z`, response finished
`2026-11-04T22:41:00.345Z`: **21,268 ms** accepted-to-result, **20,738 ms** in one
DeepSeek V4.1 Flash/low Zen call, approximately **530 ms** beforehand, **1,428
reasoning tokens**, no retry. Adjacent model calls took **3,068 ms** and **4,999 ms**.
Existing logs cannot distinguish provider waiting from generation time. No
latency model/reasoning change, new live calls or further instrumentation approved.

The oversized preview contained the pending ordinary Tutor draft's frozen
revisions **2, 8 and 11**, oldest first, with empty intervening text parts. The
latest version was present; this was an attachment review, not live Notebook state.

## Continuation interpretation correction — verified and deployed

Owner reported DeepSeek replacing the right side instead of extending an equality
and failing to identify the line currently being continued. The saved execution
inputs confirm full current Notebook and prior Notebook exchanges were supplied
(5 and 7 exchanges respectively); Tutor conversation is not part of this editor
context. The saved raw response itself replaced `p = F/A` with `p = 600/…`.
An offline replay through `runNotebookEditor` reproduced that removal.

Owner approved an exact continuation paragraph, regression checks and up to **3
DeepSeek/low via Zen calls** on isolated copies, with deployment conditional on
passing. First-round results (before the approved refinement):

- Append incomplete fraction: PASS, preserved `p = F/A` and appended `= 600/…`.
- Continue recently edited line: FAIL, asked whether line 1 or 2 and demanded
  the missing denominator, despite the recent correction and unfinished-work rule.
- Explicit replacement control: PASS, replaced only the final unfinished term
  with the dictated `200000`, preserving earlier expressions and the other line.

First round: exactly **3 provider calls**, no format retries. Overall semantic
check **failed**. Owner subsequently approved the two additional recent-line and
unfinished-expression rules in [the prompt plan](notebook-model-picker-plan.md),
plus up to three more targeted calls. **The refined second round passed 3/3**:
preserved `p = F/A` while appending the incomplete fraction; continued the recently
edited line with `= 600 × 3 ÷` without asking for its missing operand; and replaced
only the last term when explicitly instructed. The other line remained exact in
all cases. The refined prompt is now deployed in source `0370c06`, retaining the
owner-accepted compact controls from `48224b9`.
No learner records or settings were written.

First-round targeted receipt:
`/tmp/opencode/notebook-integration/continuation-check-20261104/receipt.json`;
that directory contains copied inputs, prompt hash, raw responses, usage and
per-attempt timing. Logs: `check-28-continuation-live.log` and
`check-28-continuation-replacement.log`. The first harness import failed before
any provider dispatch; it was corrected before the bounded run.

Final targeted receipt:
`/tmp/opencode/notebook-integration/continuation-check-20261104-r2/receipt.json`;
log `check-28-continuation-r2-live.log`. Exactly **3 additional provider calls**,
no retries; **6 total newly authorized editor calls**, all DeepSeek/low through
the production Zen engine. Each response was also inspected for preserved source,
unchanged unrelated working and requested unfinished/explicit-replacement behavior.

Offline context/application regressions: **14 tests passed**, typecheck/lint
passed (`check-28-continuation-{tests,types,lint}.log`). The new automated test
protects full-history transmission, whole-line application, unrelated source and
Undo; it does **not** establish model comprehension. The new frozen live-evaluation
case covers equality extension, unfinished working and explicit replacement.
Earlier trial totals remain separately recorded; this check adds **6** editor
dispatches/provider calls and no Tutor calls or speech capture.

Independent incremental review of `0370c06` within the owner-selected `d161c0d`
baseline: **Standards 0 findings; Spec 0 findings.** Review confirmed the two
paragraphs match the approved wording exactly, expected evaluation answers never
enter the production prompt, and no routing/state behavior changed.

### Earlier continuation deployment receipt

- Build **`bPCDlh2I36j3OP5uQhKBA`**, source **`0370c06`**, staged from exact
  committed source in `/home/bjorn/.cache/opencode/notebook-28-build-0370c06`.
  Production serves that directory's `.next/standalone/server.js` on3000/8444.
- Production build, payload and Electron bundled-Node smoke passed:
  `check-28-continuation-{build,payload,electron-smoke}.log`.
- Built server chunks contain both new continuation rules, and the source prompt
  hash equals the final live-checked prompt:
  `cc1ef0a555178a452681d8bc0953440f6b3438b47f25cf4d9309d8c7c05fd268`.
  Artifact: `check-28-continuation-bundle.json`.
- Actual local/HTTPS build identity, compact controls, model/draft persistence after
  Reload, manifest/icons and emulated phone focus/gestures passed:
  `check-28-combined-preview.json`, `check-28-continuation-preview.log`.
- Server observed PID **3582340**, task `sh_1a8a983ad001y5DtZBlJJoLyJc`, log
  `notebook-continuation-production.log`. Existing main-repo data/auth paths remain.
  Recheck process identity before lifecycle changes. Native current-fork Electron
  PID **3540725** remains mapped. Slots2/3 retain **3484369**/**3458594** and all
  Tailscale mappings are preserved. Saved learning data was not corrected/reset.
- Re-verification command uses
  `LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-0370c06`
  with `/tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.
- Owner accepted the compact controls for now; physical-device and real-learning
  acceptance remain pending. Use **Reload preview** in the existing app.

## Earlier card-content cleanup delivery

Owner accepted the overall layout, rejected the crowded contents, and approved
the [compact controls/menu arrangement](notebook-ipad-layout-plan.md#approved-card-content-cleanup--2026-11-04).
The new controls are implemented, verified and deployed. Commits: `4223cdf`
(cleanup) and `48224b9` (shared styling scales). This supersedes the earlier
layout-only deployment without changing the URL or installed Home Screen identity.

- New header has icon Undo/Expand and one options menu; instruction/microphone
  and small Apply occupy one row. Secondary controls are portaled through the
  shared menu shell; clarification/error detail is expandable.
- Full suite passed **2,693 tests /499 suites** (`check-28-cleanup-tests.log`),
  including updated mounted model/history/speech controls. Typecheck/lint passed
  (`check-28-cleanup-{types,lint}.log`). Combined browser and layout flows passed
  (`check-28-cleanup-browser.log`): model save/locks, menu Enter/Escape, recording
  ownership, Stop/Apply/Send, notices, retained editors/scroll and phone geometry.
- Cleanup review: Spec found no implementation defect. Standards identified
  off-ladder font sizes and spacing in copied compact-input styling. Corrected
  these to shared typography tokens and the existing 4px spacing/radius scales.
  Standards reviewer confirmed both resolved in `48224b9`. **Open implementation
  findings: Standards 0; Spec 0.** The pending delivery steps are now complete.
- Final CSS geometry/notice/menu check passed (`check-28-cleanup-geometry.log`),
  including shared 16px input typography, >60% phone-card working area, menu bounds,
  native notice Enter, split/full/Close reading positions and keyboard gestures.
- Production build, payload curation and Electron bundled-Node smoke passed:
  `check-28-cleanup-{build,payload,electron-smoke}.log`. Offline provider smoke
  reached all initialization gates with **zero network attempts**.
- Final actual HTTP/HTTPS identity, compact controls, model-menu persistence after
  **actual Reload preview**, manifest/icons/Apple metadata and phone gestures
  passed: `check-28-combined-preview.json`, `check-28-cleanup-preview.log`.
- Build was staged from exact committed source with installed dependencies in
  `/home/bjorn/.cache/opencode/notebook-28-build-48224b9`, preserving the prior
  server during compilation. Production serves its `.next/standalone/server.js`.
  Server observed PID **3559293**, shell task `sh_1a888a8a7001AZsgOFrg3gMAx9`;
  launch log `notebook-cleanup-production.log`. Recheck identity before restart.
- Existing main-repo data/auth paths remain in use; production UI checks blocked
  owner writes and used in-memory Notebook responses. Native current-fork window
  PID **3540725** remains mapped. Slots 2/3 retain PIDs **3484369**/**3458594** and
  all Tailscale mappings remain unchanged. No new live comparisons were performed.
- For HTTPS re-verification of this deployment, set
  `LH_NOTEBOOK_BUILD_DIR=/home/bjorn/.cache/opencode/notebook-28-build-48224b9`
  when running `/tmp/opencode/notebook-integration/check-28-combined-preview.mjs`.

Earlier whole-suite and deployment evidence below documents the layout build.

Earlier cleanup receipt: [#28 cleanup](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6642995415),
linked from [parent #18](https://github.com/bearthababe/learnharness/issues/18#issuecomment-6642997600).
Earlier layout receipt: [#28](https://github.com/bearthababe/learnharness/issues/28#issuecomment-6642418525).

## Approved behavior

- Tutor Send A: finalize its recording, then submit once.
- Notebook capture, Apply and handoffs settle before Tutor submission.
- Stop alone never Applies or Sends; switching never starts recording.
- Notebook has compact microphone controls inside its instruction input.
- Preserve accepted mobile layout, independent drafts and immutable snapshots.

## Earlier layout-build software evidence

Logs below are under `/tmp/opencode/notebook-integration/`.

| Check | Result | Evidence |
| --- | --- | --- |
| Full automated suite | PASS: 2,693 tests / 499 suites, including layout integration | `check-28-layout-tests.log` |
| Typecheck | PASS | `check-28-layout-types.log` |
| Lint | PASS | `check-28-layout-lint.log` |
| Production build (`LH_NOTEBOOK_PREVIEW=1`) | PASS | `check-28-layout-build.log` |
| Standalone payload curation | PASS | `check-28-layout-payload.log` |
| Baseline mobile browser flows | PASS under new layout integration | `check-28-layout-browser.log` |
| Combined Notebook browser flow | PASS under new layout integration | `check-28-layout-browser.log` |
| iPad-style layout geometry/transitions | PASS, including corrected Close/reopen scroll regression | `check-28-layout-geometry.log` |
| Electron bundled-Node standalone smoke | PASS, including offline provider initialization | `check-28-layout-electron-smoke.log` |
| Standards/spec review against mobile baseline | Complete; all concrete findings corrected and verified | Findings below |
| Combined slot 1 deployment and HTTPS/reload verification | PASS | `check-28-combined-preview.json` |

Browser checks use disposable data and scripted providers. Baseline coverage:
conversation, teaching/reading/reveal, free-text/selection/Other answers, practice
and drills, speech recovery, image review, phone geometry and gesture containment.
Repeated Send/Submit during recording finalization persists final words once.
Combined snapshot/handwriting tests verify that both reach the model and transcript.

## Final review against `d161c0d`

### Standards

One documented boundary violation: `SessionModel.submitAnswer` and
`dismissQuestion` spread attachment objects after native request discriminants.
Corrected to copy only `submission` and answer `writingIds`, as required by the
approved correction plan. Existing callers had sanitized their objects.

One judgment-call duplication finding: Notebook and ordinary mobile focus hooks
duplicate viewport/gesture handling, with 768px versus 979px touch coverage.
Asked the owner about the behavior difference. Owner instead requested the iPad
notebook's overall page design, with equation Notebook below Tutor on phones and
split/full-page views. Layout adaptation is now awaiting the exact iPad-session
handoff and an approved concrete plan.

### Spec

One defect: a practice/drill image-only follow-up could resend already-consumed,
invisible thinking from the legacy field reference. A mounted real-draft
regression reproduced the duplicate; corrected the image-only path to submit
empty text when the owned draft has no content. All 30 targeted UI/activity/input
tests, typecheck and lint passed: `check-28-review-tests.log`,
`check-28-review-types.log`, `check-28-review-lint.log`.
No substantiated scope-creep findings. Physical-device and learning acceptance
remain separate open gates.

Initial review totals: Standards 1 boundary violation + 1 judgment call; Spec 1
defect. These and the later reading-position defect are resolved. The corrected
production payload has been rebuilt and deployment verification passed.

Follow-up Standards review through `f3d1c63`: clean. Earlier attachment copying
and touch coverage findings are resolved. Separate presentation follows the
owner's explicit direction to make later common-shell extraction straightforward.

Follow-up Spec review found one layout defect: effect cleanup read zero scroll
position after Close hid the card. Corrected to capture outgoing positions while
visible and never overwrite them from hidden cleanup. The real-browser suite now
explicitly asserts the 300px reading position survives Close/reopen; prior checks
already covered independent split/full positions and mounted editor identity.
The regression passed, and the Spec reviewer confirmed the correction in
`19e80dc`: no concrete remaining flaw. **Final open findings: Standards 0; Spec 0.**

## Approved iPad-style layout adaptation

Owner approved [the adaptation plan](notebook-ipad-layout-plan.md), including
implementation and deployment. Presentation follows handwriting source `329677b`
and the coordinating session's exact handoff; its module structure deliberately
keeps layout separate from equation editing for later common-shell extraction.

Notebook now has the rounded card and 16px gaps, below-Tutor layout until 980px
available workspace width, adjustable divider, and Expand/Back/Close without
remounting either editor. Starting proportions and focused-phone allocation
remain as approved. Touch focus protection includes 768–979px. The complete
automated suite, typecheck/lint, production build/payload, full baseline and
combined browser flows, targeted layout checks and final review passed. The
isolated browser harness required two setup corrections: retain viewport
emulation flags during width transitions, and seed localStorage only in the app's
top frame. Extra layout checks cover actual frame geometry, divider, mounted
identity, reading positions, keyboard and available-width rules. Browser screenshots
are in `/home/bjorn/.cache/opencode/mobile-input-browser-notebook-28-20261104/`
as `notebook-{phone-split,phone-full,tablet-split,wide-split}.png`.

## Earlier layout-only deployment receipt (superseded above)

- Slot 1: localhost **3000** / HTTPS **8444**. Build identity confirmed in both
  local and HTTPS responses; `check-28-combined-preview.json` records all checks.
- Source `19e80dc`; build `P8NS9Q-Wp6wmWMML-2LhS`. Server observed PID **3540268**;
  shell task `sh_1a86d6776001IwvWoMIzkGinpz`. Log `notebook-combined-production.log`.
- Existing `/home/bjorn/repo/teach/learnharness/data` and `auth.json` paths retained.
  Automated production UI checks block owner writes and use in-memory Notebook
  responses. No credentials or saved learning data were copied/reset.
- Native current-fork Electron observed PID **3540725**, mapped `learnharness`
  window. Executable and working directory resolve to this checkout. Launch log
  `notebook-combined-electron.log` confirms `window open: http://127.0.0.1:3000`.
  Shell task `sh_1a86e3425001C2Op7x6lk0Izph` owns the launch.
- Actual Reload preview restores the fixture's saved model/draft. Page, manifest,
  icons and Apple metadata passed. Stable manifest identity `/notebook-integration`,
  root start/scope, standalone mode and original touch icon remain intact.
- HTTPS phone emulation passed instruction visibility and history/edge/header/input
  gesture containment, then lock release on blur/desktop transition. This is not
  physical iOS acceptance.
- Other preview processes remained: slot 2 PID **3484369**, slot 3 PID **3458594**.
  All existing Tailscale mappings, including 443/8443/8445/8446/8447, were retained.

Existing installed icon: use **Reload preview** (also available under Tools).
First installation: Safari → Share → Add to Home Screen → Open as Web App → Add,
then launch the icon. Reload restores saved working/drafts and interrupts active
recording; no offline service worker is added.

## Acceptance boundary

Physical iPhone/Home Screen and owner real-learning acceptance remain pending.
No additional live model comparison was run during integration. Prior cumulative
verification remains 512 editor dispatch attempts (510 reached providers), five
Tutor calls and at most 930.968 speech seconds. Software and emulated-mobile checks
do not establish physical iOS behavior or learning usefulness.
