# Golden fixtures — real user data, read through production paths

**The law (owner ruling, 2026-10-10):** this directory is a REAL data dir —
verbatim records written by the real application code, never hand-edited. Any
intentional on-disk format change updates these fixtures IN THE SAME COMMIT;
an unintentional change fails `tests/golden-fixtures.test.ts`. When schema
stamps land (Wave D), the stamping commit updates these files with it.

`tests/golden-fixtures.test.ts` copies this dir to a temp dir, points the
production stores at it via the `LH_DATA_DIR` seam, and reads EVERYTHING
through the real read paths — chat records (contract folds + the LLM wire
flattening), graph ledgers (shape guards + the full derivation), jobs,
settings. It also pins marker COVERAGE: every custom-marker kind and the
core tool surface must appear in real data here.

## What's inside

- `chats/chat_mv27rrra_feff23b6.json` — the teach-side master (owner-built,
  2026-10-10): probe-handoff, plan-block, compaction, subagent-steer,
  subagent-abort, and every teach tool (quiz, ask_user_question, plan_init,
  probe, probe_done, recall, explain, research, demo, visual, pdf, find,
  grep, ls, read, list_sessions, list_propositions). Plan tree + 25 turn
  records + a per-chat model override.
- `chats/chat_mv293wv5_10656952.json` — the practice lifecycle (owner-built,
  2026-10-10): graph-context (the bracketed preamble), problem ×2,
  practice-thinking ×2, conclude ×2, practice-next, problem-dismissed — the
  full marker cycle of a practice session, including the dismissal.
- `chats/chat_mvtz9itw_457ccdbb.json` — the focused drill (app-written,
  2026-10-29): stamped practice record with `practiceMode: "drill"`, a
  conversion problem, learner reasoning, ratio-cancellation help, helped
  conclusion and a two-step final turn. All three turn-usage entries carry
  `drillPromptContext` with the actual constructed instruction size and all
  assistant IDs from that run. Provider usage is nonzero and synthetic.
- `graph/` — the real ledgers: nodes (282 lines), chains (160), sessions (8),
  coverage (93), sources (4), render-settings, positions.
- `jobs/` — five records covering kind × status: research done + aborted by
  learner, demo done, visual done, pdf error.
- `settings.json` — the stamped settings record (version 1, model slots).

## Regenerating / extending

Run the app (`npm run dev`), exercise the feature against `data/`, then copy
the produced record in verbatim. Do not hand-edit content; if a record needs
pruning, re-run the flow instead.

### Focused-drill capture provenance — 2026-10-29

Captured by `tests/fixtures/capture-drill-golden.ts` in the final-review
worktree based on `f2d5bbdd6a91e1f1ad476a0fa611a9fe777ac830`, with the approved
prompt-accounting extension applied. Exact command from the worktree root:

```sh
env PATH=/home/bjorn/.local/share/mise/installs/node/26.7.0/bin:$PATH NODE_ENV=test TMPDIR=/tmp/opencode node_modules/.bin/tsx tests/fixtures/capture-drill-golden.ts
```

The script launched **Next.js 16.3.2 / Node 26.7.0**, using `next dev
--webpack --hostname 127.0.0.1 --port 44233` (a freshly allocated localhost
port, not a preview slot). `POST /api/chats` created the record at
`2026-10-29T20:10:12.500Z`. A separate scripted execution in the capture
process used the real `handleChatRequest`, normal practice-agent construction,
practice tools, `persistTurn` and `appendTurnUsage` against that same isolated
`LH_DATA_DIR`. The Next HTTP route has no scripted-engine injection; this is
the owner-permitted scripted-model adaptation, not a live-model HTTP run.
The registered Pi faux provider handled four model calls (pose, help,
conclude, closing text), using `openrouter:offline-drill-golden` only as an
offline model identity. No live model or private credentials were used;
model-network fetches were blocked and HOME/auth paths were isolated.

`GET /api/chats/chat_mvtz9itw_457ccdbb` then reopened the completed record over
real Next HTTP and verified its saved drill identity and usage metadata.
The script copied the JSON file **byte-for-byte** from the application's
data directory, asserted byte equality, stopped only its own Next process,
and removed the temporary profile. No fixture JSON was authored, pruned or
edited. SHA-256 of the captured file:

`03ba23c358f070f84876e56a5a9699dfc8746d5c8a77bb3cf4b4a16f26730fcf`

The capture worktree linked dependencies and `.next` output into owned cache
directories to avoid temporary-filesystem quota pressure; the cache output
also had a `node_modules` link for Node's runtime resolution. Re-running the
script produces a new ID/timestamps and an additional record: replace the
intended captured fixture deliberately and update this provenance rather
than editing its contents. Run it from an idle worktree so its Next build
output is not shared with another running app.

## Stamps

These files are deliberately the UNSTAMPED legacy shape (schema-stamp wave,
2026-10-10): lazy v1 means absence reads as current-valid, so this set pins
the pre-stamp read path forever. Stamped writes (chat `version: 1`, the
`graph/format.json` sidecar) are pinned by `tests/schema-stamps.test.ts`.
New records copied in after their first post-stamp write will carry the
stamps — that shape is equally current-valid.
