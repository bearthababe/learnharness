# Trusted preview subscription helper

Deployment acceptance remains **BLOCKED**. This helper slice is not a packaged
Electron preview, a full LearnHarness browser UI proof, a real ten-minute expiry
receipt, live subscription compatibility, or authorization to use personal data.
All ten acceptance rows in the approved private deployment specification remain
**BLOCKED** until independent final proof; scoped composition tests do not promote
any row.

## Packaged normal-service option

The packaged Linux `local-service.cjs` accepts an optional
`previewHelperDirectory` in its existing private launch-options JSON. It must be
exactly the `preview-subscriptions` child of that service's `runtime`, for example:

```json
{
  "port": 39110,
  "runtime": "/run/user/1000/lh",
  "previewHelperDirectory": "/run/user/1000/lh/preview-subscriptions"
}
```

Use the actual service user's UID and a short, owner-only runtime; this example
does not provision a runtime or authorize launching against a personal profile.
Omit the option to keep the existing normal path: no helper directory, sockets,
owner bridge, or eager subscription-manager initialization is added. Null, empty,
relative, arbitrary, symlinked, profile-overlapping, browser-state-overlapping,
application-overlapping and overlong paths are refused. Existing non-private
helper directories and occupied control sockets are refused, never adopted.

With the option, the service installs an in-process
`Symbol.for("learnharness.web-subscription-owner.v1")` bridge **before** Next
initialization. The server-only web-subscription module registers its lazy
`getOwner` function there. After Next's instrumentation has initialized, the
service calls that function and passes the **same** `chatgpt` and `native`
managers to the helper backend. No second credential manager/store is created.
This trusted process-local bridge is not an HTTP, client, Electron IPC, or
preview-native API. Missing bridge registration fails startup instead of falling
back to a separate credential owner. No helper/provider credentials or manager
objects are added to service control replies, `service.json`, or public status.

Authorized helper reads and dispatches enter the existing service activity
counter before parsing their bodies and remain active through backend work and
stream completion. Active helper work prevents updater freeze/preparation; a
freeze or boot-handoff maintenance state refuses new helper work, including
catalog reads. Teardown closes helper admission, aborts/destroys its lease
connections, and **awaits backend handlers**, not just socket closure, before
quiescing the normal credential managers. Credential refresh draining stays with
those existing managers. If manager quiescence refuses shutdown, the service
remains alive but its helper stays closed; do not treat that degraded state as a
healthy preview capability. A later explicit service restart is required.

Packaging copies `preview-subscription-owner.cjs` alongside the service and only
three ESM modules under `resources/scripts/lib`: `preview-subscription-helper.mjs`,
`preview-sandbox.mjs` and `ticket-state.mjs`. The latter two satisfy the helper's
current static import closure; this does not ship the scripts tree or start a
manager, sandbox, or shell. A fresh package still needs serialized parent proof.

Parent integration must forward this optional launch field through local-service
and updater launches and separately configure the sole existing slot manager's
`previewHelperHooks` with that exact directory. Do not publish it as a route or
mount its parent/control socket into previews. Service restart revokes existing
helper capabilities; there is no automatic regrant or live-lease reattachment in
this composition slice. Coordinate manager/runtime restart or explicit fresh
default-deny lease issuance, without retaining approvals across replacement
leases. Packaged startup/Next bridge registration, updater restart continuity,
real-manager coordination and native/browser parity remain independent proof
obligations.

## Trusted composition

The existing credential-owning process supplies its existing ChatGPT and native
subscription managers; do not start another writer against their credential
directory. No credential path, token, refresh token or provider auth object is
passed to the slot manager, supervisor, preview source, environment, profile,
logs or Electron bridge. The helper uses the same managers' model catalogs,
OAuth refresh and background-consent checks. There is no API-key fallback.

```js
import { createRequire } from "node:module";
import { startPreviewSubscriptionHelper } from "../scripts/lib/preview-subscription-helper.mjs";

const require = createRequire(import.meta.url);
const { createPreviewSubscriptionBackend } = require("../electron/preview-subscription-owner.cjs");
const helper = await startPreviewSubscriptionHelper({
  directory: privateShortAbsoluteDirectory,
  backend: createPreviewSubscriptionBackend({ chatgpt: existingChatGPT, native: existingSubscriptions }),
});
```

Use a new owner-only directory with a short absolute path (Linux Unix sockets
have a pathname length limit). Startup refuses symlinks, non-private directories
and an occupied control socket. Do not mount that directory into a preview.
On trusted-owner shutdown, await `helper.close()` before closing its managers.
The helper does not read any credential file itself, install a daemon, own a
profile, listen on TCP, provision a hostname or allocate preview slots.

## Sole-manager integration

```js
import { previewHelperHooks } from "./lib/preview-subscription-helper.mjs";
await runManager(registryDirectory, {
  helper: previewHelperHooks(privateShortAbsoluteDirectory),
});
```

`previewHelperHooks(directory)` supplies the existing `issue` and `revoke`
callbacks. `issue({ ticketId, lease, launch })` registers exactly the manager's
existing launch and sends that caller's PID to the trusted helper. It returns
`{ socketPath }`. Only that individual socket is mounted by the existing sandbox
at `/capability/helper.sock`; `LH_PREVIEW_HELPER_SOCKET` and `LH_PREVIEW_LEASE`
are routing metadata, not provider credentials or administrative authority.
The direct `helper.issue` method also accepts `managerPid` for separate-process
embedding; supply the actual manager PID, not the helper's PID in that case.

**Required contract clarification for the manager owner:** `issue` returns a
default-deny *transport* socket before subscription approval. That socket grants
no model/status/dispatch access. Keeping this inert transport mounted is what
allows an explicit grant to a running preview without restarting it under a new
lease. The earlier `docs/preview-sandbox.md` wording that permits mounting only
after approval must be reconciled with this behavior before final acceptance.
There is no ambient approval and no grant in `issue`. Running the manager with
no helper still exposes no socket and denies subscriptions entirely.

`revoke({ ticketId, lease, reason })` closes only the matching lease, aborts
in-flight upstream requests, destroys existing connections and is idempotent.
An old ticket/lease cannot revoke or approve a replacement. A revoked lease
identifier cannot be reissued within the helper process. Every newly issued
lease begins denied, even when its ticket, source or reusable slot matches.

## Local administration

Read the exact current ticket and lease from the sole manager's local status,
then use an explicit local command:

```sh
node scripts/preview-subscriptions.mjs grant HELPER_DIRECTORY TICKET LEASE
node scripts/preview-subscriptions.mjs revoke HELPER_DIRECTORY TICKET LEASE
```

These commands use a distinct owner-only Unix `control.sock`, never a browser
HTTP/UI route. It is never mounted into a preview. There is no grant-by-ticket
wildcard, per-model approval, revision approval or workflow call-count quota.
Model choice remains in the normal in-app catalog/picker. Existing provider
catalog membership and existing account background-consent rules still apply.
Request-size bounds protect parsing; they are not model/call quotas.

Direct APIs: `previewHelperCommand(directory, command)` and
`helper.command(command)` support `issue`, `grant` and `revoke`; `issue` includes
the original `launch` and actual `managerPid`. Successful replies contain only
socket paths, lease identities and deadline/approval status, never provider auth.

The helper validates Linux boot identity and the manager's PID/start identity
on each request, watches manager death independently, and applies its own
monotonic timer at the unchanged ten-minute launch deadline. Grant, catalog
reads, requests and interaction never extend it. The endpoint itself, not a
caller-supplied lease header, identifies its session. A wrong header is refused.
No preview data-plane operation can administer approval or other leases.

## Application adapter

`src/agent/preview-subscription-runtime.ts` routes subscription metadata and
prepared model HTTP bodies through the Unix capability when
`LH_PREVIEW_PROFILE=1`. No helper, denied helper, helper death and revocation
clear the available catalog on refresh; dispatch always fails closed. Ordinary
web/desktop dispatch is unchanged. Preview mode never creates a local web
credential owner or permits login/account-administration controls.

The existing ChatGPT/native stream adapters still construct the normal SDK
payload, use the normal selected-model scope, run payload hooks and parse the
normal provider stream. Their local auth-shaped values are a fixed nonsecret
placeholder, not a credential or independent permission. The trusted backend
revalidates scope, resolves the real credential and chooses the destination from
its own catalog and auth endpoint. It ignores preview-supplied URLs and auth/host
headers, refuses redirects and forwards only protocol headers plus trusted auth.
Provider response headers and upstream error bodies are not forwarded.

This does **not** wire a packaged Electron preview's native/preload features.
Those callers still require actual sandboxed packaged-process proof and safe
native-bridge integration by the deployment owner; an undefined browser bridge
does not count as that proof.

## Scoped verification

```sh
node scripts/prove-preview-helper.mjs --spec /absolute/private/approved-spec.md
```

The rehearsal uses synthetic credentials in a separate trusted process, a real
loopback synthetic upstream, the real app catalog/validation/stream adapters and
the existing bubblewrap sandbox, without a Next build, personal profile, provider
network access or package installation. It exercises default denial with and
without a socket, local approval, normal model switching, all three native API
routes, auth/destination/header injection attempts, in-flight revoke, stale
revoke, replacement lease, accelerated deadline and manager death. Focused
existing subscription tests and typecheck are separate recorded checks.

Receipts record exact scoped source file hashes, source revision, source-tree
fingerprints before/after, spec hash, commands, cleanup and limitations. All ten
deployment acceptance rows stay BLOCKED pending fresh independent final checks.
An accelerated deadline is not an actual elapsed ten-minute run. Runtime
catalog/selection/stream proof is not a full browser picker interaction.
