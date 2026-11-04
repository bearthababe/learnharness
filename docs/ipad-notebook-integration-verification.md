# iPad notebook integration — #4

Integration branch: `integration/handwriting-45`.
Task graph: #45 (complete) → #46 → #47 → #48.
Broader #4 and #44 have scope beyond this integration.

## Approved baseline

- #45 source: `329677bdcbfd218a0013d745ff21e273d628f567`.
- #45 owner acceptance: `8148bb93fc71c4621b0bcbb5b32629ba7ea97040`.
- Both commits passed local integration ancestry checks on this branch.
- Prior evidence: [#45 delivery](handwriting-notebook-delivery.md) and
  `/tmp/opencode/issue45-https-verification.json`.

## #46 implementation approval

The owner approved the concrete #46 implementation plan in this session after
reviewing its behavior, history/recovery boundaries, native IndexedDB and
25 MiB each image/source limits. Plan source at approval:
`/tmp/opencode/issue4-submission-plan-proposal.md` (final 290-line proposal).
Promote that approved content to `docs/handwriting-submission-plan.md` with the
implementation. Owner decisions are also retained at
`/home/bjorn/.cache/opencode/issue4/owner-decisions.md`.

Selected contracts include same-page unsent snapshot replacement, immutable sent
versions, persistent Undo/Redo, exact capture retries, explanation durability at
Attach, ordinary editing after definite rejection and acceptance reconciliation
for uncertain delivery. Unified Open/undoable Restore/explicit Duplicate are
carried into #47.

## #47 implementation approval

The owner also approved `/tmp/opencode/issue4-reopening-plan-proposal.md` for
implementation after #46 lands. Promote it to
`docs/handwriting-pages-plan.md` with that implementation. It adds Pages,
the unified Open/four-choice flow, undoable Restore, explicit Duplicate and
diagram import. Page switching commits durable device state first, then syncs
in the background, preserving the accepted layout and shared history contract.

Approved proposal SHA-256 values:

- #46: `e26754e627d66028d87cc6601114cb6884f8e271204843aeb67cdb89b0eb1233`.
- #47: `7f1c846802e295d53d1007ef9c44ca4c0221f53a9cc52278fe82e3d812cc2c65`.

## Verification and delivery

#46 implementation/checks have not yet run. Record exact delivery commits,
commands/results, reviews and integration ancestry here as they become available.
Use deterministic provider/speech fixtures and isolated data for automated checks.
Live-provider spending and preview-slot replacement need separate coordination.

Physical iPad acceptance remains distinct from browser emulation. Keep required
device gates open until owner confirmation. No push or remote merge is claimed.
