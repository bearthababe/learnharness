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
`status` and `admit` are its only operations. There are no HTTP administrative
operations. HTTP `/__local/session` consumes, but cannot create, an admission.

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
`updateState: not-configured`, `updater: updater-not-running`, `activity: unknown`
are intentional. The future updater must supply real lifecycle/activity state,
not infer idleness from this snapshot. There is no start/check/install endpoint.

The server uses the installed Next standalone router initializer behind the one
gated HTTP listener. This internal Next integration must be re-proved on upgrades.
Web subscription transport owns credentials in the managed profile. The attached
renderer reuses that transport and same-origin one-use browser actions; private
desktop IPC failure never enables it. See ADR 0002 for stable invariant IDs and
the unimplemented rollback/sandbox boundaries.
