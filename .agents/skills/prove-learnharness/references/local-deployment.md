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

### Backup pruning failure coverage

For custody changes, run `node --test tests/deployment/profile.test.mjs`, then
drive the actual local-administration CLI on synthetic profiles. A fault that
throws before recursive deletion is insufficient: change disposable storage
permissions after deletion starts, for both backup and approved restore. Repair
permissions and inspect current bytes, the selected historical contents and
the inventory through the public `backups` command; retry the failed operation.
The selected history must remain recoverable, inventory verification must work
again, and a successful retry must return to the same mixed latest-ten pool.
Also kill an owned pruning process after its first deletion and verify recovery
before the next administration operation. Never repair a failed proof by
deleting its damaged inventory or its only retained recovery copy.
Place a dormant synthetic profile at each recovery/committed-cleanup path with
missing, malformed and foreign transaction records; administration must refuse
it without changing any byte. Directory ownership and mode alone are not proof
that recursive cleanup is authorized.
Schedule new synthetic contents immediately after empty-directory or transaction
validation. Empty cleanup must use nonrecursive removal; identified cleanup must
not adopt newly enumerated names. Inspect the added bytes after refusal/warning.

A post-commit garbage-cleanup warning is not a failed data restore. Check the
reported retained path, actual current/pre-restore bytes and later cleanup;
do not accept a silent rollback after successful restore or silently ignore
`pruningCleanup`. Temporary recovery material is not a protected backup class.

### Browser cookie-boundary diagnostic

For changes to preview origins/proxy cookies or normal admission, run:

```bash
RUN=".prove-it/runs/$(date -u +%Y-%m-%dT%H-%M-%SZ)-preview-browser-boundary"
CHROMIUM_PATH=/absolute/path/to/lockfile-supported/chrome node scripts/prove-preview-browser.mjs "$RUN"
```

The exercised script creates real local HTTPS endpoints, a synthetic backend,
the production preview proxy and normal admission boundary, and one shared
incognito Chromium context. It first reproduces same-host/different-port cookie
read/overwrite as a negative control. It then checks distinct hosts, `__Host-`
session cookies, sibling-domain cookie injection, both ingresses' refusal of
actual cookie-bearing same-site POST and originless image requests, WebRTC
egress refusal versus a working owned STUN negative control, and normal admission
after the attacks. Inspect `result.json` and `normal-after-attacks.png`; ten
scoped steps and owned-browser/listener cleanup must pass. Compare the behavior
to the owner's isolation requirement, not just the script's exit code.

For only the ingress diagnostic, the synthetic server removes
Connection-Allowlist on one exact diagnostic document path and Chromium bypasses
CSP. Require that explicit exception in the receipt and actual incoming requests
with 403 and zero writes. Browser policy blocking a request before ingress does
not prove the ingress refused it. Cookie and WebRTC probes use the primary
document with unchanged production policy. Chromium proof does not establish
that another browser enforces those network controls.

The script explicitly pins only its generated fixture TLS key in Chromium.
That is not real tailnet certificate/DNS proof, full-app/browser/native/helper
parity, or a passing deployment row 7/10. Those remain blocked until exercised
through the real manager and separately provisioned private HTTPS identities.
Never substitute separate ports or a document-cookie monkey patch for those
identities, and never weaken TLS checking on the actual tailnet drive.

### Cross-engine network isolation

For preview proxy/network-policy changes, run the Chromium diagnostic above and
an actual Firefox probe using externally installed Playwright tooling. Keep that
tooling and its browser cache outside repository dependencies:

```bash
node .agents/skills/prove-learnharness/scripts/browser-egress.mjs --engine firefox --tooling "$PLAYWRIGHT_MODULE" --spec "$PRIVATE_SPEC" --run "$NEW_RUN"
```

The module path names Playwright's `index.mjs`; its browser cache must already be
installed. Set `PLAYWRIGHT_BROWSERS_PATH` for a non-default cache.
`--executable` selects an explicit browser binary. `--engine webkit`
can diagnose an available Linux WebKit, but is not physical iOS Safari proof.
Missing browser/libraries are BLOCKED, not a reason to infer Chromium parity.

Require a working owned non-loopback STUN control. For unverified Firefox/WebKit,
require HTTP403, zero upstream PR requests, zero PR execution and zero packets,
including a Chrome User-Agent spoof and an actual attempt to forge Sec-CH-UA.
The latter probe explicitly bypasses CSP only on the already-refused trusted
plain-text page; the server must observe that the browser stripped the forbidden
header. Do not inject an attack into a refused page and call it PR execution.

Use `--engine chromium --executable "$CHROMIUM_PATH"` to prove the admitted
case: actual source inline JavaScript must execute with zero network escape,
while the control sends packets. The script binds only its own temporary
HTTP/Unix/UDP endpoints and uses empty browser profiles. Read `result.json` and
`receipt.md`, including engine version and cleanup. These are HTTP boundary
diagnostics, not the trusted-HTTPS/full-app proof below. A refusal proves safety,
not functional preview support; report the compatibility limitation explicitly.

Could fool you: an earlier loopback probe blocked its control too. A later real
Firefox probe sent packets through the production policy. Preserve such an
escape as BROKEN; Chromium-only success cannot accept the browser boundary.
The owner explicitly approved verified Chromium or the isolated desktop app for
untrusted previews on 2026-11-07; normal daily-use access remains unchanged. See
`docs/preview-sandbox.md` for this supplemental compatibility decision. Compare
refused Firefox/WebKit clients against that decision, not a claim of functional
support. Keep the original private specification unchanged. New engine admission
still requires real isolation proof; this decision waives no other acceptance
check. Any further compatibility change requires an explicit owner decision.

### Private tailnet HTTPS diagnostic

After scoped owner authorization and authentication of a disposable dedicated
node, run the exercised trusted-TLS diagnostic with its owner-metadata JSON, the
synthetic normal service's already-authorized HTTPS origin, and its exact free
loopback backend port:

```bash
node scripts/prove-preview-tailnet.mjs "$RUN" "$OWNED_NODE_JSON" "$NORMAL_HTTPS_ORIGIN" "$NORMAL_LOOPBACK_PORT"
```

The metadata file is created by the run's identity-checked disposable-node driver;
it is not an arbitrary existing personal-daemon state file. Inspect `result.json`
and `normal-after-attacks.png`. Require five observed scoped checks: actual DNS
and trusted TLS on both hosts, browser admission, sibling-host cookie/session
isolation, same-site CSRF refusal with the diagnostic CSP bypass, and normal
service usability afterward. Node certificate authorization must be true; Chrome
has no certificate exceptions, SPKI pin or host-resolver overrides. The browser
context is shared across both origins. Cookie values and admission fragments do
not belong in receipts.

The script verifies the existing normal route before starting its synthetic
backend and changes only the dedicated node's initially empty HTTPS443 route.
Require original route configuration unchanged, dedicated route removed and owned
browser/listeners stopped. Its authenticated daemon is deliberately retained for
subsequent proof and must be stopped by its owner driver when no longer needed.
This proves only the named browser transport boundary. Complete LearnHarness,
actual manager/FIFO, concurrent per-source host provisioning, helper, packaged
preview and physical Safari remain separate checks. Do not promote deployment
rows 7/10 from this diagnostic alone.

### Actual managed app and packaged preview

After confirming the dedicated node and existing normal/review mappings belong
to this rehearsal, exercise the real full-app manager and helper:

```bash
node scripts/prove-managed-preview.mjs --spec "$PRIVATE_SPEC" --node "$OWNED_NODE_JSON" --run "$NEW_MANAGER_RUN"
node scripts/prove-packaged-preview.mjs --spec "$PRIVATE_SPEC" --node "$OWNED_NODE_JSON" --run "$NEW_PACKAGED_RUN"
```

Run them serially: both need the authorized 3810 and 3800–3802 listeners and the
dedicated source route. These recipes currently target the scoped normal host
and existing 8452–8455 mappings named in the drivers; inspect those prerequisites
instead of adapting or overwriting an unrelated mapping. The real manager alone
creates/removes the dedicated source node's matching HTTPS443 mapping. Never
provision another node implicitly. Retain the authenticated daemon for further
proof, then stop it through its identity-checked owner driver.

The manager drive exercises actual browser model switching, synthetic chat,
revocation and a real elapsed ten-minute deadline despite interaction. The
packaged drive exercises normal native Home, two-way visible edits, the one
writer, the actual ticket desktop command, packaged preview startup, kernel
sandbox state, manual stop/reopen and helper stream cancellation. Inspect its
real screenshot and `PREVIEW_SHELL_READY` record; require `diagnostic: false`,
matching source/lease/origin and accepted startup arguments. Linux may rewrite
`/proc/PID/cmdline`; retain that observation separately rather than pretending
it still contains the original argv. The trusted shell reports only arguments
already checked by its strict startup allowlist. Kernel process inspection and
unsafe-launch refusal remain separate security checks.

Could fool you: a compositor-listed, mapped, apparently visible window produced
only the desktop lock screen in the captured PNG. The driver originally reported
all automated checks passed; direct image inspection caught the false positive.
`loginctl`'s unlocked hint and a missing traditional lock-process name did not
rule it out. Native HTTPS runs now remain `blocked-pending-visual-review` with a
nonzero exit until a separate caller actually inspects the screenshot and records
the visual verdict. Never infer app visibility from capture success, window
metadata, or the raw automated-check count. If locked, ask the owner to unlock
the desktop; do not kill, dismiss or bypass the lock surface.

The desktop CLI must inherit the local graphical session's allowlisted display
variables, not the user's profile, credentials or arbitrary Electron flags.
Wayland requires the explicit ozone-platform argument selected by the launcher.
A verifier that strips the display variables cannot diagnose a product startup
failure. Production still rejects loopback desktop origins; do not enable a
packaged diagnostic or certificate exception to make this recipe pass.

By default the package stamp must match current source. An explicitly supplied
`--expected-package-source-hash` permits an honestly identified older-package
diagnostic only; it never qualifies as final-source acceptance. Expired-action
refusal does not prove successful native provider-page opening. One source host
does not prove multi-source browser identity or the full three-slot FIFO.

### Actual client and worker activity

```bash
node scripts/prove-deployment-activity.mjs
node scripts/prove-deployment-notebook.mjs
```

These drive actual packaged-service/browser inputs and worker/executor paths on
synthetic profiles, plus real preparation subprocess cancellation. Inspect exact
package/source identity, client activity reports, retained input and owned-group
cleanup. Stale or unknown clients must continue refusing cutover. A later passing
attempt does not erase the retained Home-navigation idle timeout or browser
crash; diagnose recurring failures with the recorded departed-client reports.
Navigate Home while an actual tutor request is held and the composer is empty.
Server work must keep refusing preparation/freeze after the old page departs;
completing that work must return to idle with only the Home client remaining.
Contrast departure with real drafts, dictation or attachments, which must keep
refusing cutover. A transient tutor busy flag is not an unsent learner draft.
The scoped activity matrix is not handwritten-snapshot transfer, actual package
cutover, physical iOS or live-provider proof. Complete all required row surfaces
independently before accepting the row.

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
