# Notebook candidate picker and prompt adoption

Owner-approved 2026-11-04 after the controlled model comparisons.

- A **Notebook model** dropdown above the instruction offers **DeepSeek / low ·
  Zen** (`opencode/deepseek-v4.1-flash`, low) and **Terra / off · ChatGPT**
  (`chatgpt/gpt-6.1-terra`, off).
- Persist the choice per learning session. Sessions without a choice start with
  DeepSeek/low. Keep shared Cheap and Tutor settings independent.
- Switching saves only the choice. Preserve working, drafts, history, Undo and
  snapshots. Disable switching during recording, Apply, handoff or pending saves;
  allow it when idle or responding to clarification/failure.
- Snapshot the candidate on each accepted Apply, including speech reservations.
  Reject stale-client choices rather than silently using a different candidate.
  Replays retain the original candidate. Previously accepted operations without
  a candidate retain the legacy shared-Cheap routing.
- Use the existing catalog, provider authentication and credential leases. An
  unavailable candidate fails explicitly, without fallback or automatic retry.
- Adopt exactly the comparison suite's speech-error paragraph after the existing
  preserve-mistakes rule; retain all other prompt rules and complete context.
- Validate with mocked-provider routing/persistence/recovery/UI checks, existing
  Notebook regressions, typecheck, lint and production build/payload checks.
  Coordinate current-fork native-app/preview ownership before deployment.

Implementation: candidate definitions in browser-safe core; selection on the
Notebook record and its learner view; selection command through the existing
serialized session endpoint; candidate snapshot on operations; executor resolution
from that snapshot. Existing saved results commit without a provider call.

## Implementation verification

Completed locally: 155 Notebook/dictation tests, typecheck, lint, production build,
payload curation and Electron-runtime standalone smoke passed. The new tests cover
session isolation, reload persistence, untouched drafts/snapshots/Undo, stale
requests, busy-state UI, failed-candidate recovery, accepted-operation model
snapshots and legacy routing. Mocked production transports verify exact provider
and reasoning controls. Prompt equality with the frozen revised suite is exact.
No additional live trials. Owner then approved **Deploy and launch**: slot 1 now
serves the verified standalone production build with the existing slot's data and
auth paths; the current fork's native Electron shell is open against it. HTTPS,
manifest/icons, reload and fixture-backed browser/mobile-emulation checks passed.
See [delivery](notebook-delivery.md#notebook-candidate-picker-and-prompt-adoption-2026-11-04)
for runtime ownership and remaining physical-phone/owner-learning acceptance.
