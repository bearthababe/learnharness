# Isolated native preview shell

`electron/main.cjs` dispatches `--preview=ABSOLUTE_CONFIG` before importing any
normal desktop modules or choosing its app name, userData, credential ownership,
single-instance lock, backend, subscriptions, IPC or updater. Invalid or empty
preview arguments fail closed, never fall through to normal startup.

This is a trusted current-shell mode, not a shell built from preview source.
The launcher must select an independently accepted packaged executable containing
this implementation. `app.isPackaged` alone is not package provenance validation.
Source-specific code belongs only in the separately sandboxed backend and the
untrusted renderer. Never mount shell control/config/profile directories into
that backend or expose administrative launch/revoke operations over HTTP/IPC.

## Manager interface

Run the local desktop command from the graphical session. The launcher forwards
only allowlisted display/session variables into the otherwise private shell
environment. It explicitly selects `--ozone-platform=wayland` when
`WAYLAND_DISPLAY` is present; X11 sessions retain their default. It never
inherits arbitrary Electron flags, Node options, provider credentials or the
normal profile. A remote CLI without the local graphical session cannot open a
desktop window merely because its backend is reachable over HTTPS.

`PREVIEW_SHELL_READY` records the startup arguments that passed the shell's
strict allowlist, along with source, lease and origin identity. It is a local
diagnostic, not a renderer interface or permission grant. Inspect actual window
and kernel sandbox state separately; a readiness line is not full isolation
proof.

The manager creates a new absolute, canonical private directory for each source
launch. It and both JSON files must be owned by the launching UID; the directory
must have no group/other permissions (0700), files must be regular, single-link,
non-symlink files with no group/other permissions (0600). Maximum file size is
16 KiB. Do not reuse another lease's directory. Atomically replace the control
file when stopping the lease; deleting it also revokes the shell.

Configuration (all fields required; unknown fields rejected):

```json
{
  "version": 1,
  "ticketId": "exploration-name",
  "sourceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "lease": "a-unique-random-lease-at-least-16-chars",
  "origin": "https://preview-1.example.test",
  "normalOrigin": "https://normal.example.test",
  "launch": {
    "started": 1000000,
    "deadline": 1600000,
    "boot": "linux-boot-id"
  },
  "manager": { "pid": 1234, "start": "123456", "boot": "linux-boot-id" },
  "server": { "pid": 5678, "start": "123457", "boot": "linux-boot-id" },
  "controlFile": "/absolute/private-launch/control.json"
}
```

- `ticketId` accepts 1–128 ASCII alphanumeric/period/underscore/hyphen characters,
  starting alphanumeric. It also represents an exploratory name, not necessarily
  a delivery ticket. `sourceId` is the manager's exact source-content SHA-256.
- `lease` accepts 16–128 ASCII alphanumeric/underscore/hyphen characters.
- Both origins are canonical HTTPS origins, with no path, credentials, query or
  fragment. The preview hostname must differ from the normal hostname, regardless
  of port. No certificate exceptions or insecure TLS switches are installed.
  Parent supplies the dedicated private HTTPS hostname and its trusted certificate.
- `previewResponseHeaders(origin)` exports the shell's CSP, Permissions Policy
  and DNS-prefetch headers for optional trusted ingress use. The shell overrides
  source-supplied copies. Connection-Allowlist did not suppress native ICE
  candidates in the tested Electron, even on the wire, and disrupted cancellation
  of external navigation. It is not used; no special ingress header is required.
- `launch` is the original supervisor launch budget, including build time, not a
  fresh window-open budget. `started` and `deadline` are integer milliseconds
  from `/proc/uptime`, exactly 600000 apart. `boot` comes from
  `/proc/sys/kernel/random/boot_id`. Future starts, stale boots and expiry refuse.
- `manager` and `server` pin distinct, live, current-UID host process identities.
  `start` is the string Linux `/proc/PID/stat` field 22; zombies are not live.
  Supply the actual lifetime-owning serving runtime identity, not an unrelated
  stable process. The launcher's process names or PID alone are insufficient.
- `controlFile` must be in the same directory as, but not equal to, the config.

The control JSON has exactly `version`, `ticketId`, `sourceId`, `lease`, `origin`,
`launch`, `manager`, `server`, copied without changes from the configuration,
plus `"status": "running"`. `controlFor(configuration)` exported from
`electron/preview-shell.cjs` constructs it. Set status to `revoked`, remove the
file, or terminate the pinned manager/runtime to close the window. No renderer
capability can renew it. The shell rereads the files/identities every 100 ms and
enforces its original deadline with a separate timer. Replacing both files cannot
extend or replace an already-open shell's pinned budget/lease/source.

Before launching, create private `home`, `config`, `cache`, `data` directories
directly under the config directory. Spawn the accepted executable directly with
only `--preview=CONFIG` and, optionally, `--ozone-platform=wayland` or `x11`.
Use a clean environment from the outset (not a filtered inherited credential map):

```text
HOME=CONFIG_DIRECTORY/home
XDG_CONFIG_HOME=CONFIG_DIRECTORY/config
XDG_CACHE_HOME=CONFIG_DIRECTORY/cache
XDG_DATA_HOME=CONFIG_DIRECTORY/data
```

Only transport/session environment may accompany those: `PATH`, `LANG`, `LC_ALL`,
`DISPLAY`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`,
`XAUTHORITY`, `XDG_SESSION_TYPE`. The shell removes other inherited environment
variables before creating Chromium processes. It rejects `NODE_OPTIONS`,
`ELECTRON_DISABLE_SANDBOX`, `ELECTRON_RUN_AS_NODE`, extra launch switches and
missing/mismatched private HOME/XDG paths. Launcher-side environment isolation is
required because Node/Electron consume some variables before application code.

The shell derives its own app/instance identity and userData directory from
ticket + source digest + lease. It uses a fresh nonpersistent Electron session,
never the normal/default session. No normal preload, electronAPI, native IPC,
backend, credential readers or updater are loaded. No renderer credentials or
administrative capabilities appear in the READY message. stdout emits:

```text
PREVIEW_SHELL_READY {"ticketId":"...","sourceId":"...","lease":"...","origin":"...","identity":"...","userData":"...","diagnostic":false}
PREVIEW_SHELL_STOP lease-or-runtime-ended
```

Invalid startup exits 1; ordinary lease/deadline/window/signal termination exits
0. Renderer failure exits 1. The manager still owns backend/helper termination,
slot release, matching-lease checks and queue advancement; shell exit is not
authority to release another lease. Preserve retained synthetic backend state.

## Boundaries and proof

The window explicitly enables Chromium sandbox/context isolation, disables Node,
preload, webviews, DevTools, dialogs, downloads, device/media/other permissions,
and external navigation/popups. A session request allowlist admits only its pinned
origin and matching websocket. An injected CSP also blocks frames, objects,
workers, external resources, base URLs and cross-origin forms. A trusted
session-owned rejecting loopback proxy handles every destination except the exact
preview host/port, with implicit loopback bypass disabled. The window's
`disable_non_proxied_udp` WebRTC policy prevents direct UDP bypass of that proxy.
The actual runtime proof requires no ICE candidates and zero owned STUN/TURN
traffic, HTTP requests or TCP connections to the external fixture.
The accepted package must use Chromium 152 or later (enforced at startup) and
pass the native runtime attacks. This intentionally
does not grant normal desktop native-feature parity to untrusted preview code.
The shell is a trusted same-UID process, not the backend's OS sandbox. Blocking
renderer filesystem/native access does not replace that separate sandbox.

Run focused startup/config/network tests with:

```sh
node --test tests/deployment/preview-shell.test.mjs
node scripts/prove-preview-shell.mjs
```

The latter needs an actual existing Wayland session and the installed supported
Electron runtime. It uses owned synthetic endpoints/profiles, opens real GUI
windows via a capture-only trusted driver which loads the real main dispatcher,
executes hostile renderer scripts, observes kernel renderer sandbox state, and
saves source hashes, captures, logs, failures and cleanup receipts under a fresh
`.prove-it/runs/` directory. It never reads a production profile or uses live
providers. Failed diagnostics remain alongside later attempts.

Unpackaged proof requires the additional `--preview-diagnostic` argument; that
mode is unavailable to packaged apps and accepts only an explicit synthetic
`http://127.0.0.1:PORT` preview origin with a different normal HTTPS hostname.
Loopback ports are not cookie/security-origin isolation. No diagnostic run or
older packaged artifact proves final packaged delivery. All ten final deployment
acceptance rows remain BLOCKED until the parent rebuilds the final accepted
package and proves the integrated manager/HTTPS/backend/helper flows.
