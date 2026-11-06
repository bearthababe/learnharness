# LearnHarness proof methods

Chosen under the unattended full-stop grant: public CLI scenarios, real HTTP and
Chromium drives, stored-state comparison, process/log checks, existing CI gates.
The approved spec is the answer key for new workflow behavior, never its tests.

| Method | Catches here | Misses | Setup / run | Answer key |
| --- | --- | --- | --- | --- |
| Disposable Git + real ticket CLI | base/PR errors, concurrent allocation, merge replay, unsafe cleanup | real GitHub entitlement | none / seconds | spec §4, 1–4, 8–9 |
| Installed delivery skills + disposable flow | wrong stopping point, preview/approval gate, failure-to-fix CI progression | live GitHub protections or review-model quality | installed skills + fresh checker / minutes | spec §4, 2 |
| Real Next + Chromium + storage | credentials borrowed, wrong source, lost profiles, cross-ticket browser leaks | physical iPhone | npm ci + Chromium / minutes | spec §4, 5–7 |
| HTTP round trips | empty profile, false writes, invalid requests | hidden UI controls | Next / seconds | pre-change snapshot |
| Existing aggregate mobile suite | chat handler, Notebook, Reveal, mobile layout regressions | device acceptance | Chromium / minutes | independent existing suite |
| Logs/process inspection | orphan servers, swallowed startup failures | silent logic bugs | none / seconds | ownership requirements |
| CLS ≤0.1 (proposal) | startup jumps | workflow correctness | browser / seconds | unapproved budget: not selected |
| Warm load ≤5 seconds (proposal) | slow redirects | cold compiler variance | browser / seconds | unapproved budget: not selected |
| Accessibility ≥90 (proposal) | unlabeled controls | profile isolation | Lighthouse setup / seconds | unapproved budget: not selected |
| Zero uncaught console errors (proposal) | runtime exceptions | swallowed errors | browser / seconds | unapproved budget: diagnostic only |

No new performance/product budgets are imposed without owner approval. Record
diagnostics, but do not confuse proposed numbers with approved acceptance.

## Nine cases

1. `prepare` fetches origin/main; handoff parameters explicitly name it. `attach`
   checks the worktree/branch and prepared base. Disposable worktrees model the
   external T3 tool; this thread's actual T3 binding supplies real-tool evidence.
2. `delivery` resolves the installed full-stop/full-send entrypoints. The local
   ticket-to-main skill invokes them, keeping their different stopping authority.
   Run `node scripts/prove-ticket-delivery.mjs setup`; a fresh checker reads the
   wrapper and actually executes both selected installed skills. Observe initial
   CI failure, fix/push, passing CI, then OPEN/unmerged versus authorized local
   MERGED with no shared approval prompt. `verify RUN` asserts histories and
   stops the observer. See the workflow doc for test-service commands. Merely
   reading skill text or checking authority JSON is not acceptance.
3. Concurrent `preview` requests exercise the real locked registry/process manager.
4. Fourth request queues while `delivery` and PR/CI progression remain available.
5. Empty settings/chats/key status through real HTTP; synthetic ambient secrets and
   dotenv probes must not resolve. Do not record secret values.
6. Change a worktree source, fetch through the slot redirect and stable ticket
   origin, observe new content without root changes or redeployment.
7. Save settings/session/browser state; release, occupy old slot with another
   ticket, reopen original elsewhere and compare original and new state.
8. Feed merged PR status through the real observer using a disposable GitHub
   transport; prove queued allocation and replay safety. Live GitHub is not merged.
9. Clean/dirty/ignored/in-use checkouts and root updates on disposable repositories.

## Existing surfaces and setup

`runtime.mjs start/health/smoke/stop` uses a unique evidence directory and isolated
profile, calls the real installed Next CLI, and refuses dotenv files. No fixture
is copied from a learner profile. `smoke` asserts state before and after writes;
the snapshot comes from unchanged origin/main before product implementation.
The snapshot does not assert model-generated content. The standard aggregate
mobile suite supplies deterministic faux-provider model flow coverage.

An unavailable native Electron session or physical phone is an explicit coverage
limit, not emulated acceptance. Missing GitHub access is BLOCKED for live PR checks;
offline transports cover behavior only. Tailnet proof uses only manager-owned
mappings and ports: never replace the existing 3000–3002 owner previews.
