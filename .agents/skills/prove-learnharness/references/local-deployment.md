# Local deployment and reusable-preview proof

## Authority and initial state

The answer key is the owner's approved `2026-11-06-local-deployment-and-previews.md`, supplied as a path when this skill is invoked. Find it using SKILL.md's Find the spec procedure; ask for it if inaccessible. Record its path and SHA-256 without publishing the private document or editing it to agree with code. Its section 4 fixes the ten mandatory checks below. Existing behavior additionally compares against the base revision, not the new implementation's own expectations.

This extension was created before deployment implementation. All ten deployment flows below start **PLANNED**. Existing web/API/preview proof does not promote any of them. Executable deployment commands must come from the actual implementation and be exercised before they are documented as usable. There are deliberately no invented deployment commands here.

The primary user surfaces are the daily-use web UI and packaged Electron. The other surfaces are the updater/local-administration CLI, stored profile/backups, background activity coordination, sandboxed build/runtime, trusted subscription helper, and PR60's existing preview manager. Profile, auth, activity and process-lifecycle changes reach every caller of those shared contracts.

## Preflight before product implementation

1. Read repository instructions and `docs/agents/git-workflow.md`. Fetch `origin`; record exact main SHA, exact-SHA CI runs and eligibility. Use `gh --repo` for the repository selected from origin. Red, pending, cancelled, missing or incomplete CI is ineligible; never use an older undeployed green SHA instead.
2. Confirm integrated PR60 supports `node scripts/ticket.mjs preview NAME --worktree PATH` and inspect the actual manager/state interface. Reuse its pool, queue, leases and retained profiles. Use disposable fixture state for rehearsal; never create a second production pool or adopt owner-held previews.
3. Inspect profile/config/launcher locations and ownership without reading personal data or credential values. Record conflicting configuration as BLOCKED. Repository and desktop profiles must not be assumed identical. Only synthetic legacy profiles may be copied for rehearsal.
4. Establish actual Linux server and packaged Electron processes, independent synthetic daily/preview profiles and the actual manager. Follow `docs/desktop-release.md` for non-publishing Linux packaging. `LH_DEV_URL`, development Electron, standalone HTTP boot and successful unit tests do not prove packaged shared-service native parity.
5. Exercise namespace construction, not just executable discovery. Prove the eventual build and runtime boundaries separately. A whitelist environment, new port, or profile variable alone is not a filesystem/network/native sandbox.
6. Inventory current listeners and Tailscale routes without modifying them. Tailnet-only HTTP proof must use an authorized isolated address; do not replace existing mappings, enable Funnel or assume provisioning permission. Record unavailable authority as BLOCKED with the precise unlock.
7. Drive the actual trusted helper against a synthetic upstream that can succeed and fail. Do not use live credentials or paid requests. Presence of an account is not proof of authentication; separately approved live-provider claims need an actual authenticated test and their own receipt.

Stop on the spec's prerequisite/policy/custody blockers. Approval to implement does not authorize installing a service, replacing the daily launcher, migrating real data, restoring learning history, or exposing a new route. Keep real learner profiles out of every rehearsal command.

## Required flow map

Each row needs a real surface drive, before/after evidence and comparison with the original spec section 4 row of the same number (rung 4). Rows 3 and 10 also need unchanged/base behavior and cross-surface parity (rungs 1–3). Status remains PLANNED until the row's real implementation and executable proof recipe exist.

| # | Flow and surfaces | Required observations and break-it probes | False confidence to reject |
| --- | --- | --- | --- |
| 1 | Updater CLI/background + Settings | Successful/pending/red/cancelled/missing exact-SHA CI; rapid main advances; recheck at cutover; failed candidate stops until newer SHA or explicit retry; compare actual process revision with web/desktop status | An older green candidate, matching display text without process identity, or repeatedly retrying a known-bad SHA |
| 2 | Real client input + server/background activity | Open course idle versus drafts, handwriting, recording, upload, tutor and jobs; start activity during actual preparation; prove build cancellation, no orphan child and no busy cutover; unknown client state must not force restart | A boolean unit fixture standing in for the real editor or a build that keeps running invisibly |
| 3 | Packaged Electron + browser + native bridge | Same synthetic profile edits visible through both surfaces; only one writer/backend; consistent running revision/status; affected subscription/native controls work; upstream update entrypoints cannot bypass private updating | Treating `LH_DEV_URL` as native parity, checking only a URL, or sharing files between independent backends |
| 4 | Configuration/server/Electron startup + filesystem | Synthetic repository and old-desktop source profiles; default external root, explicit profile override, existing data/auth callers, conflicting roots; source bytes unchanged and no silent merge | Copying a real profile, precedence invented by the verifier, or asserting paths without observing writes |
| 5 | Backup/restore CLI + all writers + filesystem | Private consistent backups including synthetic credentials; create/verify before pruning; mixed update/pre-restore copies in one latest-ten pool; explicit local restore approval and verified current-profile preservation; space/create/verify failures produce no destructive change | Protected backup exemptions, pruning to make room first, or a successful restore that lost the current state |
| 6 | Real candidate startup + current profile | Compatible failed candidate rolls back code without losing progress written by the candidate; incompatible format stops; compare profile bytes and visible progress before/after | Restoring old history, dropping an unfamiliar record, or a mock startup replacing the failed real process |
| 7 | Actual PR build + server/Electron preview | Denied personal-file/environment/credential probes, unrelated host-service calls, wrong cookies/sessions, wrong native origin/bridge; normal service remains usable; no public route; build and runtime separately exercised | Same-user separation called a sandbox, probing only a trusted fixture instead of PR scripts, or a broken normal app hiding interference |
| 8 | Actual preview UI + helper + synthetic upstream | Default refusal; local per-preview grant; normal in-app model choice/switching; upstream failure surfaced; revocation/stop/expiry denial; wrong session/preview and reused slot denied; no secret copied into files/env/logs/native bridge | Global grant, per-model/call-count gating, credential-bearing environment, or claiming already-sent upstream requests were undone |
| 9 | External supervisor + helper + sole manager | Actual elapsed ten-minute lifetime during continuing interaction; manual stop; matching lease release/FIFO advancement; delayed stale notification cannot release replacement; stopped helper capability; reopen retained synthetic state | Fake-clock-only proof, a shortened test timeout, idle expiry, deleting profiles to simulate isolation, or a timer the preview controls |
| 10 | Existing suites + packaged desktop + private HTTP | Required automated checks; standard aggregate mobile receipt; affected native behavior; daily/preview URL identity/status; private reachability and unchanged unrelated routes before/after | Chromium emulation called physical Safari acceptance, a skipped suite called passing, or synthetic provider proof called live subscription compatibility |

## Execution and machine-readable evidence

Use SKILL.md's existing start/health/smoke/stop commands for the unchanged app baseline. For affected UI, read `docs/verification/mobile-browser-checks.md` and run `CHROMIUM_PATH=/usr/bin/chromium npm run test:mobile` from the task checkout after `npm ci`. Preserve its authoritative `result.json`; diagnostic reruns do not turn a failed aggregate green. Record actual Chromium/Puppeteer versions and dependency identity. Use cache-backed artifact storage when temporary storage is insufficient.

For the existing Linux packaging prerequisite, follow `docs/desktop-release.md` through native tests, fresh build, provider smoke, server curation and Electron server smoke. Then run `npx electron-builder --linux AppImage --x64 --publish never` and `node .agents/skills/prove-learnharness/scripts/packaged.mjs`. The latter drives the actual packaged executable through CDP with an empty private profile, creates a synthetic session and saves `result.json`, `electron.log` and `home.png` in its new run directory; it stops its own process group. It selects the available Wayland/X11 session or headless fallback, whitelists environment variables and redirects upstream update checks to a closed loopback endpoint. It never starts the installed launcher or uses the real profile. This is baseline packaged launch/persistence proof, not shared-service/native-subscription parity or preview sandbox proof.

Observed setup limits on the original Linux rehearsal: both Linux targets build an AppImage before `.deb` fails when the builder's bundled Ruby cannot load `libcrypt.so.1`. The explicit AppImage-only command avoids claiming the `.deb` target passed and does not install a system library. Headless packaged Electron exited before Home on that machine; the actual Wayland session passed. If a machine has no usable display, record the native proof as BLOCKED instead of substituting web proof. Browser suite failures with an unsupported system Chromium require preserving the failed receipt and retrying the lockfile-supported browser, not relaxing assertions.

Install the exact browser supported by the installed lockfile dependencies with:

```bash
BUILD=$(node --input-type=module -e 'import { PUPPETEER_REVISIONS } from "puppeteer-core"; console.log(PUPPETEER_REVISIONS.chrome)')
node node_modules/@puppeteer/browsers/lib/main-cli.js install "chrome@$BUILD" --path "$HOME/.cache/puppeteer"
```

The runtime browser drive resolves that cache automatically and records executable/build identity. For the aggregate mobile runner, supply the resolved path as CHROMIUM_PATH; the original system-browser failure remains failed evidence. Run large browser/package checks serially when the shared machine is under memory/resource pressure. A resource failure is BLOCKED, not a missing assertion to remove.

When each deployment entrypoint becomes available, record the exact exercised start, health/identity, scenario and cleanup commands here, including synthetic profile and owned port selection. This section is not complete while any required recipe remains planned. Health must expose target/profile and running revision; drive the serving public entrypoint after launch rather than an internal helper.

Every run writes `.prove-it/runs/<UTC timestamp>-<slug>/receipt.md` plus `deployment.json` incrementally and atomically. The JSON must contain:

- `schemaVersion: 1`, start/finish timestamps, overall status and independent checker identity;
- exact source revision plus dirty/source fingerprint, spec path/SHA-256, base revision and environment;
- exactly ten numbered `checks`, each with status, concrete flow/surface, independent answer key, executed commands, expected/observed comparison, timestamps and artifact paths;
- owned processes/ports/profile roots, cleanup outcome, every failed/retried step and explicit limitations;
- separate diagnostics for optional CLS/load/accessibility/console measurements. Proposed numbers are not approved acceptance gates.

Begin required checks as `not-run`, transition through `running`, and finish as `passed`, `failed`, `blocked` or `interrupted`. Missing or planned implementation is `blocked`, never `passed`. Overall success requires all ten passing checks, evidence reviewed by an independent checker, source identity matching the target, and successful owned-process cleanup. Fully mocked tests do not satisfy these rows. Script status is not an agent's PROVED verdict.

## Verifier proving run and blind audit

First prove one named existing flow against its pre-change snapshot/suite and exercise at least one refusal. Explicitly list the new deployment rows as pending; that scoped baseline is not a deployment pass. Run Scope/Sort against the last real product diff and inspect whether shared caller flows were selected. Check the core verdict/report blocks remain in SKILL.md.

Use `/audit-prove-it` on baseline-PROVED existing flows, then again on the new deployment flows once implemented. Plan 4–8 plausible, small user-visible faults across layers, including shared code. Back up every original, plant one at a time, and give each fresh checker only flows/surfaces/checks/answer keys. The blind checker must not inspect diff/status/log or `.prove-it/audits/`. Score the actual symptom, separately counting script catches and off-script catches. Restore exact bytes after every probe and confirm with `cmp`; never commit/push a mutation. Finish with a clean proving run and unchanged pre-audit product status. A blocked baseline cannot produce a meaningful audit score.

## Cleanup and limits

Stop only identity-checked owned processes and listeners. Retain synthetic preview profiles and evidence. Verify stopped/expired capabilities and matching manager lease release without touching another occupant. Compare unrelated route configuration to the preflight inventory. Physical iPhone/iPad Safari and live-provider compatibility require separately exercised, explicitly authorized receipts; this rehearsal does not certify either.
