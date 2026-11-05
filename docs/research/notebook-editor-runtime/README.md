# Notebook editor through LearnHarness's runtime — #19

## Decision and result

**Use the existing Cheap model setting. No notebook-specific chooser or override.**
The owner selected the existing ChatGPT connection, approved the bounded run plan,
then selected **Use Cheap**, adding “let's do that to avoid unnecessary modification.”
Decision: [#19 comment](https://github.com/bearthababe/learnharness/issues/19#issuecomment-6549703197).

The saved Cheap setting resolved to **chatgpt / gpt-6-luna / medium**. The live
run completed **29/29 reviewed correct turns**, using **31 requests** because two
history edits needed the one permitted format retry. No rejected attempt changed
working. **Recommendation: keep the selected Cheap setting for integration.**
No Sol comparison or model-setting change was needed. The editor follows future
changes to Cheap; these results only validate the setting recorded in this run.

This is runtime/editor evidence, not an implemented notebook UI or evidence of
learning benefit. The next slice is [#20](https://github.com/bearthababe/learnharness/issues/20).

## Recorded run

Artifacts are in [run-01-cheap](run-01-cheap/):

- `manifest.json`: resolved model, complete prompt, fixture expectations kept
  outside model input, source hashes and measurement limits.
- `turns.json`: each instruction, original/resulting state, response, full
  request prompt, attempts, timings, reported normalized usage and mechanical score.
- `summary.json`: completion status and mechanical-match count.
- `review.md`: correctness review of edits, undo and clarification behavior.

| Measure | Observed |
| --- | ---: |
| Frozen cases | 17 turns in 10 conversations |
| Added targeting/history/long-notebook cases | 12 turns in 7 conversations |
| Correct after validation/retry | 29/29 |
| First-request correct, valid response | 27/29 |
| Edits / clarifications / undo | 22 / 4 / 3 |
| Format-retry turns | 2 |
| Provider failures | 0 |
| Changes to unrelated lines | 0 |
| Median complete turn | 3.845 s |
| Median edit turn | 3.949 s |
| Turn range | 1.682–8.970 s |
| Sum of measured call time | 110.207 s |
| Reported input tokens | 29,991 |
| Reported output tokens | 1,593 |
| Reported reasoning tokens (subset of output) | 571 |
| Reported cache read/write tokens | 0 / 0 |
| Attempts missing normalized usage | 0 |
| API-dollar cost | **Unpriced: ChatGPT subscription** |

Timing covers the app engine call through final response, including the visible
format retry where needed. It excludes voice capture, transcription and UI
rendering. This one short run does not establish general accuracy or a stable
latency distribution. The SDK-reported identity was `chatgpt:gpt-6-luna`; the
effective reasoning setting was medium. No independent backend model-version
attestation was available.

## What was exercised

- The app's existing settings store/resolution selected Cheap. The existing
  connection catalog and `piEngineForSpec` resolved the selected model and level.
- The app's web subscription owner and ChatGPT stream performed account catalog,
  lease and request handling. Notebook editing was an explicitly user-requested
  foreground call. There was no API-key fallback or OpenCode model transport.
- The desktop app was closed with owner approval during the run, so only one
  process owned credential refresh. It was reopened afterward using the existing
  AppImage and Wayland session; startup logged server readiness and window open.
- The reusable editor adapter accepts current working, undo, earlier exchanges,
  optional selection/cursor and read-only Notebook history. It returns a new
  state only after validating a complete edit/undo response. Clarification and
  failures preserve working; one failed format/application result may be retried.
- Seven deterministic public-interface tests cover targeted editing, clarification
  continuation, immutable historical source, undo, atomic multi-operation
  rejection, successful/failed format recovery, usage on provider failure,
  truncation/cancellation, literal broken source and in-flight input ownership.

The tests inject only the external model stream. No real account is used by the
automated tests. They do not require the future session UI or durable queue.

## Differences from the frozen prototype evaluation

1. **Transport:** the original used OpenCode's stateless text endpoint. This run
   used the app's selected ChatGPT engine. Subscription accounting is unpriced;
   normalized token usage is now available.
2. **Editing approach:** only the owner-selected affected-line replacement
   approach was rerun. The alternative substring-patch experiment was not added
   to the application adapter.
3. **Prompt:** carry forward the frozen instructions for preserving mistakes,
   unrelated working and unfinished LaTeX, clarification, undo and strict JSON.
   Add the owner-pinned whole-line versus individual-equation targeting rule and
   read-only saved Notebook history. Remove the obsolete “both approaches”
   wording from insertion instructions.
4. **Conversation:** prior exchanges supply validated responses, working and
   recoverable errors rather than the prototype's entire attempt arrays. A
   rejected reply and its error are supplied explicitly for the one format retry.
5. **Validation:** strict Zod response schemas replace prototype assertions;
   operations still apply atomically to a copy. A normal completed text response
   is required. Provider failure, truncation or cancellation cannot commit even
   valid-looking partial JSON, and transport errors are not automatically retried.
6. **Fixtures:** all 17 original turns were reused unchanged, followed by 12 new
   turns covering multi-equation lines, references across history entries,
   absent history, 100-line working and ten historical entries.

All affected behavior was included in this run. After the live run, the adapter
also gained a request-entry `structuredClone(input)` with a red-to-green
concurrent-caller test. This prevents a caller mutating the request during a held
model response; it changes neither the prompt nor results for the immutable
fixture inputs. The manifest retains the hash of the pre-copy adapter actually
used in the live run; no additional model calls were made for this offline fix.

## Reproduce

Run offline tests first:

```sh
node --import tsx --test tests/notebook-editor.test.ts
```

For an authorized live run, ensure the desktop app (and any other credential
owner for the same account directory) is closed. Point the runner at the app's
existing data/auth locations and use a **new** output directory:

```sh
LH_DATA_DIR="$HOME/.config/LearnHarness/data" \
LH_AUTH_FILE="$HOME/.config/LearnHarness/auth.json" \
node --import tsx scripts/eval-notebook-editor.ts --live \
  --out=docs/research/notebook-editor-runtime/run-02-cheap
```

On this machine, prefix the command with `mise x node --` where Node is not on
the shell's PATH. The runner uses the saved Cheap slot and does not write settings.
It permits at most two requests per turn: 29 turns, maximum 58 requests. A
provider error stops the run with partial artifacts retained. Expected results
never enter the model request; mechanical matching ignores whitespace only,
and all clarification text requires review. Reopen the app afterward.

The adapter is ready to be composed into the in-app notebook slice. That slice
must resolve Cheap afresh using existing settings and pass the resulting engine;
it must not pin this run's model or add an independent editor setting. Persistence,
UI, dictation, durable queue execution and tutor snapshots belong to later tickets.

## Completion checks and review

- Full suite: **2,542 tests passed**, no failures or skips.
- `npm run typecheck`, `npm run lint`, and staged whitespace checks passed.
- Owner selected baseline `8150aaac21a5fbc9ac677635e9f90be3990227ae` for the
  ticket-only staged review. Two independent reviewers examined the changes.

### Standards

Pass: no documented-standard breaches or actionable smell findings. The adapter
is isolated, uses the existing engine boundary and preserves original working.

### Spec

Pass: no missing implementation requirements, scope creep or incorrect behavior
found against #19 and the subsequent Cheap/ChatGPT decision. The reviewer verified
effective reasoning forwarding, reported totals and the documented source-hash
difference. Final owner acceptance of the evidence remains pending before closure.

Summary: **Standards 0 findings; Spec 0 findings.**
