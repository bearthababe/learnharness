# Preview sandbox and lifetime integration

Deployment acceptance is **BLOCKED** until an independent final checker accepts
the complete deployment rehearsal. These modules implement the preview slice,
not native GUI parity, trusted subscription grants or production provisioning.

## Boundaries

`scripts/lib/preview-sandbox.mjs` snapshots allowlisted regular source files and
records revision/source hash. It does not mount the source checkout, `.git`, the
personal home, normal profiles or ambient Unix sockets. Installed dependencies
are an explicit read-only mount, inspected for dotenv/credential files, escaping
symlinks and sockets. Required ELF libraries are discovered with `readelf`, not
by executing PR binaries with `ldd`; the host `/usr/lib` is not mounted wholesale.
Dependency installation/provisioning is outside this launcher. Arbitrarily named
secrets intentionally placed in code/dependency files cannot be classified by a
filename denylist: only synthetic, audited dependency/source trees may be used.
CLI `revision` remains the inspected checkout HEAD; `servingRevision` and
`servingSourceHash` identify only a running snapshot, and are null while queued,
building or stopped. The recorded sandbox identity also survives for diagnosis.

Both build and runtime use bubblewrap `--unshare-all --unshare-net`, dropped
capabilities, a private proc/dev/tmp/run, synthetic passwd and a cleared environment.
Only retained synthetic `home`, `data`, `auth` and the lease's source/build output
are mutable. State belongs to the preview, not the reusable slot. Missing Linux,
bubblewrap, namespaces, libraries or dependencies fails closed. There is no
unsandboxed fallback, network access, native bridge or credential forwarding.

The trusted proxy connects to an inode-pinned Unix socket (`O_PATH|O_NOFOLLOW`
and `/proc/self/fd/N`), preventing malicious socket-path symlinks from redirecting
trusted traffic to unrelated host services. It allowlists request headers, strips
normal/private cookies, authorization and bridge/forwarding headers, and accepts
only strictly parsed per-preview Set-Cookie values. Domain and escaping Path
attributes are refused; accepted cookies receive Path=/, SameSite=Strict,
HttpOnly and Secure for HTTPS. Arbitrary upgrades, foreign redirects and dangerous
response headers are not forwarded. HTTP streaming remains supported.

**Ports are not browser-origin security.** Cookie scope ignores ports. In a real
browser, arbitrary preview JavaScript successfully read and overwrote a synthetic
normal cookie on the same hostname, despite HTTP filtering and restrictive CSP.
JavaScript cookie monkey-patching cannot fix hostile code. Same-site requests and
normal-session CSRF need independent evaluation too; CSP is defense in depth,
not an accepted substitute for site isolation. Do not use a personal browser
context for untrusted previews until separately isolated hostnames/sites or an
approved separate context are established. Tailnet allocation therefore requires
a distinct dedicated HTTPS hostname per source; a normal-host port is refused.

**Owner-approved preview compatibility (2026-11-07).** Untrusted previews require
a verified Chromium engine or the isolated desktop preview app. Firefox and
iPhone/iPad Safari are not supported for untrusted previews. This restriction
does not apply to normal daily-use app access. The owner approved this narrower
preview compatibility after independent testing found a browser network escape;
it does not waive any deployment isolation, native-parity or lifetime checks.

**Preview browsers fail closed.** A real Firefox159 probe escaped the network
policy despite the production response headers. The proxy now refuses untrusted
content before opening its upstream socket unless the browser supplies a
`Sec-CH-UA` declaration for a verified Chromium engine: currently majors152/155.
Unverified clients, including Firefox and iPhone/WebKit, receive only inert
trusted text with HTTP403, no source code, no preview cookies and no-store caching.
New engine versions require an actual isolation proving run before admission.

User-Agent alone never admits a browser. Page scripts cannot set the reserved
Sec-* request header; the declaration is also stripped before reaching preview
source. This is a browser-compatibility guard, not authentication or attestation
against a malicious HTTP client, browser extension or manually modified browser.
Those clients must not be counted as supported personal-browser environments.
The response still enforces the network policy and separate HTTPS origins for
admitted browsers; the build/runtime namespace and isolated native-shell checks
remain mandatory. A refusal is not functional Firefox/Safari preview support.
Normal daily-use browser access has no such guard and remains unchanged.

The trusted isolated Electron process supplies the declaration from its actual
`process.versions.chrome` through its dedicated session's request hook. The
renderer cannot choose it or invoke that hook. This avoids depending on
Electron's absent default Client Hints without a native bypass token or a
User-Agent exception. Unknown engine versions still fail admission.

## Private hostname transport

The three familiar review addresses remain redirects owned by the existing sole
manager. `configure-tailnet --tailnet-host HOST --https-ports PORT,PORT,PORT`
verifies their already-authorized HTTPS-to-loopback mappings and records them in
the existing registry. It creates no routes, adopts no occupied listener, and
requires all of this registry's previews to be released first.

Each preview source additionally needs its own explicitly provisioned Tailscale
node/socket. Pass `preview NAME --tailnet-socket /private/path/tailscaled.sock`
(and `--worktree PATH` when registering an exploration). This is not automatic
node provisioning: account authentication, DNS and HTTPS prerequisites must exist.
The daemon socket directory must be private and user-owned. A binding pins the
node identity and hostname, differs from the normal/review host and every other
source, and persists across slot changes and reopening. It cannot silently adopt
a different node or replace its source's origin. An existing nonempty Serve
configuration is refused; the normal machine's mappings are read-only.

`scripts/lib/preview-tailnet.mjs` installs only the dedicated node's private
HTTPS443-to-source-loopback mapping. A private adjacent owner record binds it to
the exact lease. Stop/recovery removes only that matching configuration; changed
external mappings or a stale lease are preserved and reported as errors. Funnel
is never enabled. Daemon authentication/state is outside every preview mount.
These daemons are transport endpoints, not another slot manager. Missing nodes
block their requested previews rather than falling back to same-host ports.

## Supervisor and lease contract

`newLaunch()` returns `{ started, deadline, boot, launchedAt }`. Deadline minus
started is always **600000ms**. Linux uptime is the monotonic launch clock; boot
identity mismatch expires the launch. The supervisor's timer is outside the
sandbox, covers preparation/build/runtime and is never refreshed by requests.
The manager independently checks the same deadline every lifecycle pass. The
supervisor kills bubblewrap; PID-namespace teardown kills detached descendants.
Manager recovery stops recorded identities instead of granting a fresh lifetime.

The supervisor uses the project's default `next build` (Turbopack), not a forced
Webpack build. JetBrains Mono and Source Sans 3 are bundled with their upstream
licenses, so this build requires no font-download network exception. The source
snapshot includes the one existing research case module imported by a build-time
TypeScript script; it does not mount the docs tree or private owner specs.

`scripts/prove-preview-browser.mjs` is the local HTTPS browser diagnostic. HTTPS
normal admission and trusted preview response cookies use `__Host-` names to
prevent sibling-domain session injection. This is defense in depth alongside
separate preview hostnames; it does not make same-host ports safe. Its fixtures
are not real tailnet DNS/certificate or full LearnHarness/helper/native proof.

`scripts/prove-preview-tailnet.mjs RUN OWNED_NODE_JSON NORMAL_HTTPS_ORIGIN
NORMAL_LOOPBACK_PORT` separately exercises an authorized disposable node and an
already-provisioned synthetic normal route with actual trusted HTTPS. It checks
DNS/TLS, shared-context browser admission, host-bound cookies, sibling-host
session injection and same-site CSRF, then confirms normal service still works.
It uses no certificate/DNS bypass and removes only its temporary dedicated route.
This remains scoped synthetic-backend evidence, not whole-app manager, helper,
native, concurrent-host provisioning or physical-iOS acceptance.

State events are private JSON `{ lease, status, launch, sandbox?, error? }` under
`REGISTRY/leases/LEASE/`, never mounted into the sandbox. Events with a stale lease
are ignored. `clearLease(state, ticketId, lease)` clears only a matching ticket and
slot. The sole manager advances its existing FIFO after stop/expiry/failure; no
second manager, pool, renewal command or production expiry option is introduced.
`release NAME --lease LEASE` rejects stale manual notifications. Retained profiles
are never deleted by stop, expiry, build failure or recovery.

## Trusted helper adapter for the parent

The unconfigured worker calls `runManager(directory)` with no helper: no helper socket
or provider credential is exposed. Parent integration can call:

```js
await runManager(directory, {
  helper: {
    issue: async ({ ticketId, lease, launch }) => null,
    revoke: async ({ ticketId, lease, reason }) => {},
  },
});
```

`issue` may return `{ socketPath }` before approval, but the endpoint must deny
every model/status/dispatch request until an explicit local grant for that exact
active lease. An inert transport is not subscription authority. This permits
granting a running preview without replacing or extending its launch. The path
must be a dedicated per-lease Unix capability socket, never the shared helper
administration endpoint. It is mounted alone at `/capability/helper.sock`; only this
sandbox path and `LH_PREVIEW_LEASE` reach untrusted code. No credential payload
belongs in return values, config, environment, logs or any mounted file.

`revoke` is called for manual stop, expiry, failed startup, runtime failure,
manager shutdown and recovery, before the matching lease is freed. It must be
idempotent and scoped to the supplied lease so stale revocation cannot revoke a
replacement. It must finish revocation or fail closed. The helper itself must
bind authorization to the endpoint/lease, honor `launch.deadline` independently
and deny after expiry even if the manager is killed. A caller-supplied lease
header alone is not authentication. No per-model or per-call restrictions are
introduced here. `supervise(config, { revokeHelper })` additionally exposes the
same trusted callback contract for a helper-aware supervisor wrapper; the plain
CLI supervisor has no helper administration authority.

For the CLI worker, first stop this registry's manager, then configure an already
running trusted owner's private helper directory:

```sh
node scripts/ticket.mjs configure-helper --helper-directory /private/helper-directory
```

Use the registry's explicit `--root` and `--state-dir` when appropriate. The
command refuses a live manager, occupied/queued slots, symlinks, non-private
sockets and overlap with source or preview profiles. The worker receives only
the local control path; each sandbox receives only its individual denied socket.
New leases always start denied. Grant and revoke remain the separate local
commands documented in `docs/preview-subscriptions.md`, never browser controls.

## Builder checks

```sh
node --test tests/deployment/preview-sandbox.test.mjs
node --experimental-test-module-mocks --test tests/deployment/preview-manager.test.mjs
node scripts/prove-preview-sandbox.mjs
```

The manager check uses the real manager and bwrap processes with a small fake
Next transport and a test-only backdated monotonic launch (not a production
expiry flag). It checks FIFO, manual release, helper revocation, retention,
reopen/stable origin and stale lease replay. The last command separately runs
real Next build/runtime probes and waits an actual ten minutes under ongoing
HTTP interaction. Its fixture is a minimal Next app, not full LearnHarness.
Receipts, logs, copied source and synthetic profiles remain for independent review.

The initial full-app sandbox build failed fetching Google Fonts with networking
denied. Bundled licensed local fonts now permit the actual LearnHarness build and
HTTP runtime without a network exception; the earlier failure remains evidence.
The older workflow/browser harness assumes `next dev` in-place and tailnet
mapping ownership, so it must be reconciled with these changed boundaries before
being counted as acceptance. Packaged Electron, physical mobile, simultaneous
source-specific tailnet hostnames and trusted-helper end-to-end checks remain
separate requirements; none is inferred from the scoped diagnostics.
