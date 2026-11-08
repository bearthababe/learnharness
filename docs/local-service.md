# Managed Linux shared service

Build privately using `npm run build`, `node scripts/smoke-provider-runtime.mjs`,
`node scripts/build-server.mjs`, `node scripts/smoke-server.mjs --electron`, then
`npx electron-builder --linux AppImage --x64 --publish never`. This does not
install a launcher, configure an updater, initialize preview slots or edit routes.

With a disposable/external `LH_PROFILE_DIR`, run:

```sh
node scripts/local-deployment.mjs service-start --electron /absolute/package/learnharness --port 3810 --runtime /private/short/runtime --browser-origin https://approved-host:8452
node scripts/local-deployment.mjs service-status --config /private/short/runtime/service.json
node scripts/local-deployment.mjs service-admit --config /private/short/runtime/service.json --origin https://approved-host:8452
/absolute/package/learnharness --local-service=/private/short/runtime/service.json
```

Service start is foreground (suitable for a future owned process supervisor).
Closing/reopening the shell does not stop it. SIGTERM/SIGINT stop the service;
normal sessions must then be readmitted. One-use browser links are capabilities:
open privately, do not save them in receipts. No provider credential is included.
The browser origin must already have an approved private mapping to that port.
No origin is inferred from forwarding headers, and no route is provisioned.

The private `service.json` holds schema version, deployment UUID, build commit /
source hash / build ID, Linux process-start identity, profile hash/root, runtime
socket and exact origins; it contains no provider or browser-session secret.
The mode-0600 Unix socket admits only matching deployment/profile/build requests.
The socket also coordinates updater observation, client freeze, writer drain,
private admission handoff and matching-shell attachment. There are no HTTP
administrative operations. HTTP `/__local/session` consumes, but cannot create,
an admission. `/__local/activity` only reports admitted document activity; it
cannot request maintenance, updates, retry or restore.

The shell requires its own packaged build identity to match the running service.
An explicit `LH_PROFILE_DIR` must match too; legacy overrides and desktop-private
capabilities conflict with attachment. Shell browser state is `<profile>-shell`,
runtime defaults to `<profile>-runtime`, outside the backup root. The native
browser helper uses `<profile>-helper` and does not inherit provider-key or
managed-profile environment variables. This is separation, not a preview sandbox.
Use a short
runtime path for Unix sockets. Never place either inside the profile or code.

`GET /api/runtime` is admitted, read-only, no-store, and shared by web and shell
Settings General. It reports `mode`, `revision`, `sourceHash`, `buildId`, profile /
deployment identifiers and actual process ID; never credentials or profile paths.
Without a configured supervisor it reports `not-configured` / `updater-not-running`.
Activity is measured from admitted documents and actual server/credential work.
Unregistered, unreachable or disconnected unfinished documents are unknown, not
idle. Settings reports supervisor liveness, lifecycle, reason and candidate.
There is no HTTP start/check/install endpoint.

## Explicit local updater

Optional preview subscriptions use the same normal credential owners. Start the
packaged service with `--preview-helper-directory RUNTIME/preview-subscriptions`
and include the identical `previewHelperDirectory` in its updater JSON. The runtime
must be short enough for Unix socket paths. Omission leaves subscriptions denied;
a mismatch is refused, never silently enabled or dropped at candidate cutover.
Connect the stopped ticket manager using `configure-helper`; local per-lease
grant/revoke commands are in `docs/preview-subscriptions.md`.

Normal-service shutdown drains and revokes its helper endpoints. Existing
previews cannot inherit new authorization after service replacement: release and
reopen a preview for a fresh denied lease, then explicitly grant it if desired.
No automatic restart extends an old preview deadline. An old mount or cached
model cannot dispatch through the replacement helper.

Create a private mode-0600 JSON file in a mode-0700 directory containing
`profileRoot`, `runtime`, `releases`, `sourceRoot`, `repository` (`owner/repo`),
`port`, `browserOrigins` (an array), and `initialElectron` (an absolute packaged
Linux executable). The three roots must be separate and outside the profile.
This is an explicit local configuration, not installation or a launcher change.
Rehearsals must use synthetic HOME/profile/Git/upstream, never personal data.

```sh
node scripts/local-deployment.mjs updater-start --config /private/updater.json --approve-local-update
node scripts/local-deployment.mjs updater-status --config /private/updater.json
node scripts/local-deployment.mjs updater-retry --config /private/updater.json --sha EXACT_FAILED_SHA
```

The foreground supervisor polls every 60 seconds. Stopping it cancels owned
preparation and retains the current service. Stop that backend by its verified
PID, not its wrapper's process group. The updater socket is private/local-only.
Failed candidates and observations survive restart. A retry must match the
currently suppressed candidate; blocked/ambiguous lifecycles require local
inspection, not a force-idle or skip-lock option.

The build runs from a detached disposable clone of exact fetched main with its
upstream preserved, using the documented private packaging sequence. A new
preparation directory and private log retain each attempt. Client activity
cancels its process group, including signal-resistant descendants. There is no
preview sandbox in this trusted-main builder.

Cutover freezes acknowledged idle clients, closes new work admission and drains
credential queues without aborting returned token rotation. It stops the exact
backend PID before `backupProfile` acquires its ordinary exclusive lease, then
creates/verifies/rotates the same mixed latest-ten backup pool. Backup failure
resumes the previous release. Sessions transfer only through a private local
handoff file; the new service stays maintenance-gated while the supervisor
health-checks real admitted application routes. Matching packaged shells
reattach before resume; browsers reload the newly built client after resume.
Wrong-origin and wrong-build admission is not relaxed. No second backend exists.

On candidate startup failure the previous package's own compatibility reader
probes current chat (v2), graph (v1), settings, handwriting, shared-writing and
credential formats under an exclusive lease. Unknown paths/versions/nested
format tags refuse rollback. The manifest is built from actual contract
constants and fingerprints; it is not a configurable compatibility flag.
This intentionally conservative reader can refuse unusual but readable data.
It never restores history. Incompatibility stops for explicit local resolution;
the existing backup/restore commands remain the only history-restoration path.

These implemented interfaces still require the independent ten-flow deployment
gate. Builder tests/rehearsals alone do not authorize production cutover.

The server uses the installed Next standalone router initializer behind the one
gated HTTP listener. Before publishing readiness or opening the optional helper,
it completes an admitted loopback runtime request to await Next's application
instrumentation. That temporary health session is revoked even on failure and
does not create browser activity. This internal Next integration must be re-proved on upgrades.
Web subscription transport owns credentials in the managed profile. The attached
renderer reuses that transport and same-origin one-use browser actions; private
desktop IPC failure never enables it. See ADR 0002 for stable invariant IDs and
the remaining preview sandbox/helper/lifetime boundaries.
