# Independent ticket delivery and previews

## Trusted helper and desktop preview

An unconfigured manager denies subscriptions. To connect an existing normal
service's trusted helper, stop this registry's manager, then run
`node scripts/ticket.mjs configure-helper --helper-directory /private/helper`.
No service/profile credentials are copied into the registry or preview. Local
grant/revoke commands and the in-app model picker are described in
`docs/preview-subscriptions.md`; every new lease starts denied.

For an already-running private HTTPS preview, open the accepted normal package's
isolated shell with explicit normal-service identity:

```sh
node scripts/ticket.mjs desktop NAME --service-config /private/runtime/service.json --normal-origin https://normal.tailnet.ts.net:8452
```

Include the registry's explicit `--root` and `--state-dir` when needed. The command
checks the live normal service/build/executable, distinct hostnames, actual
manager/runtime identities, prepared source fingerprint and original deadline.
Its initial result is `starting`, not proof of readiness; inspect the returned
`shell.log` for `PREVIEW_SHELL_READY` or a refusal. It never builds/runs preview
shell code or passes normal preload/native authority. Manager release/recovery,
runtime death and expiry close only the matching preview window. See
`docs/native-preview-shell.md` for the private control and launch contracts.

Use the project-local `ticket-to-main` skill for exploratory previews or approved
ticket delivery. Only delivery needs an approved spec and explicit `full-stop`
(ready PR) or `full-send` (authorized end-to-end merge) request. Installed delivery
skills are resolved at ticket preparation; no global skill is modified. Neither
an approved design nor preview setup grants merge authority. The manager never
merges anything.

## Entry points

For exploratory work, use an existing worktree directly; no ticket preparation,
delivery mode, PR, installed delivery skill or GitHub authentication is required.
Initialize the shared registry once with `init` if it does not already exist:

```sh
node scripts/ticket.mjs init
node scripts/ticket.mjs preview my-experiment --worktree /path/to/worktree
node scripts/ticket.mjs status
node scripts/ticket.mjs release my-experiment
```

The source may contain uncommitted changes or a detached HEAD. It must be the exact
root of a non-root worktree from this repository, with dependencies installed and
no dotenv files. Its allowlisted source is snapshotted without Git metadata and
built inside a filesystem/network namespace; the checkout is not modified.
The name owns its retained synthetic profile and cannot be reassigned
to another worktree or adopted over an existing ticket. Repeat `preview NAME` to
reopen it. Release stops only the preview; it never removes exploratory source.
The existing JSON `tickets` collection also holds records marked
`kind: "exploration"`; this is shared preview bookkeeping, not a delivery ticket.

Both entrypoints share the same three slots and FIFO queue. Exploration does not
require PR association or ticket delivery and never uses automatic worktree
cleanup. If it later has a matching named branch/direct-main PR, optionally run
`pr NAME --pr NUMBER` to release its preview automatically on merge. Sandboxed
build/runtime and ten-minute lifetime are implemented; trusted-helper integration,
native parity and independent deployment acceptance remain blocked. See
`docs/preview-sandbox.md` before opening a preview in a browser.

For approved ticket delivery:

```sh
node scripts/ticket.mjs init
node scripts/ticket.mjs prepare example --delivery full-stop
# Apply the returned handoff object using T3's t3_worktree_handoff tool.
# In the resulting bound checkout, attach using the actual T3 thread ID:
node scripts/ticket.mjs attach example --worktree "$PWD" --thread "$T3_THREAD_ID"
npm ci
node scripts/ticket.mjs preview example
node scripts/ticket.mjs status
node scripts/ticket.mjs delivery example
# Read and execute the returned installed skill; do not stop at its summary.
node scripts/ticket.mjs pr example --pr 123
```

`T3_THREAD_ID` above denotes the ID exposed by your agent environment; the tool
does not invent or export it. The CLI emits JSON; failures are nonzero and emit an
`error` to stderr. `--root` accepts any checkout in the project. `--state-dir`
allows a separate external registry for disposable verification. Normal usage
shares one root-derived registry under `~/.local/state/learnharness/tickets/`.
Private permissions protect registry/profile directories; status never reads or
prints credential contents. It does show local paths, branch, PR and PID metadata.

The registry has exactly three slots, FIFO preview requests and a detached
manager. It allocates only bindable loopback ports, leaves external listeners
untouched, and reports conflicts. A manager/registry lock serializes concurrent
claims. Preview shortage does not block implementation, review, CI or delivery.
`status` reports source revision at inspection time, not just the initial claim.
The running snapshot's exact identity is `sandbox.revision` and
`sandbox.sourceHash`; worktree edits require release/reopen to change that build.

## Stable origins and isolation

The default slot addresses are `http://127.0.0.1:3800/` through `:3802/`, separate
from existing owner-held 3000–3002 previews. Each is a no-cache redirect to a
ticket-specific persistent port, assigned once from 18100 upward. The slot is
reusable; the ticket origin is not reassigned. This preserves localStorage and
IndexedDB across slot moves and prevents the next occupant inheriting them.
Browser cookies ignore ports. Trusted HTTP filtering namespaces cookies but cannot
stop arbitrary preview JavaScript reading/writing normal same-host cookies.
The app's JavaScript cookie bootstrap is not a security boundary. Browser security
acceptance is BLOCKED for this loopback mode; use a dedicated synthetic browser
context rather than an everyday session. Stable per-ticket origins must not
collapse to slots.

For private remote previews, explicitly provision three review HTTPS mappings
to this registry's existing loopback slot ports. Record and verify those mappings
without changing them:

```sh
node scripts/ticket.mjs configure-tailnet --tailnet-host YOUR-NODE.YOUR-TAILNET.ts.net --https-ports 8453,8454,8455
node scripts/ticket.mjs preview my-experiment --worktree /path/to/worktree --tailnet-socket /private/preview-node/tailscaled.sock
```

For unattended enrollment, configure the one-time trusted OAuth credential with
`ticket configure-enrollment --secret-file /private/file` after configuring review
routes and stopping this registry's manager. Subsequent sources use the ordinary
`preview` command without a per-PR login or `--tailnet-socket`. The credential and
persistent daemon state stay outside previews. See `docs/preview-enrollment.md`.
Explicit manual socket bindings remain supported and are not replaced.

Use the actual previously authorized ports and hostname, not these illustrative
values. Every source needs a distinct explicitly provisioned node/HTTPS hostname;
different ports on the normal or another preview's hostname are refused. The
private daemon socket and node identity are pinned to that source. Reopening
reuses them and retained state, even in another slot. The manager creates/removes
only its matching private HTTPS443 mapping on the dedicated node; it never
changes the normal machine's existing routes or enables Funnel. Provisioning or
authentication failures block the preview instead of weakening isolation. See
`docs/preview-sandbox.md` for ownership, recovery and proof limitations.

Profiles live in the registry's `profiles/TICKET/`, outside every worktree, with
separate `data`, `auth`, and `home` directories. New profiles copy nothing. App
processes run under bubblewrap with separate filesystem, network, PID, user and
other namespaces. No host home, Git metadata, ambient environment or unrelated
Unix services are mounted. Only explicit source/dependencies, required shared
libraries and retained synthetic home/data/auth are present. No provider
credentials belong in those mounts. Missing prerequisites fail closed.

The manager supervises the project's default `next build`, then a documented custom Next
server over a private Unix socket. The trusted loopback proxy forwards HTTP and
streaming, not arbitrary WebSocket upgrades. There is no untrusted host-network
listener. Source edits require release/reopen to make another snapshot. Keep the
worktree/dependencies present. A hard 600000ms lifetime includes build time and
cannot be refreshed by interaction. Stop/expiry retains synthetic state.

## Optional tailnet review

BLOCKED pending scoped authority for stable per-ticket 18100+ HTTPS origins and
browser hostname isolation. The manager refuses tailnet allocation and never
adds, removes or adopts Serve mappings. Existing owner-authorized mappings
8452→3810, 8453→3800, 8454→3801 and 8455→3802 are not authority for per-ticket
ports. Do not create a second production registry, reuse unrelated mappings or
enable Funnel. Loopback builder evidence is not tailnet/mobile acceptance.

## Delivery integration verification

`node scripts/prove-ticket-delivery.mjs setup` creates disposable local Git state
and prints its `run` path. Source `RUN/use-env.sh` in each test shell. Its `ticket`
entrypoint drives the real ticket CLI, resolving the actual installed delivery
skills, and its `gh` entrypoint accepts **only** the synthetic `zz-prove-it/project`
repository. No real GitHub API or PR is involved. A fresh checker reads the wrapper
and both returned installed skills, then executes each test flow; this is not a
script that replaces the skills with its own merge policy.

In each returned worktree, commit/push the initial answer 41, create a test PR with
`gh pr create --repo zz-prove-it/project --base main`, and observe
`gh pr checks NUMBER --repo zz-prove-it/project` fail. Fix to 42, run
`node check.mjs`, commit/push the ticket branch and observe passing checks. Use
`ticket pr TICKET --pr NUMBER` to associate it. The services supply deterministic
APPROVED review; they do not prove real review-model quality or hosted CI.
The full-stop flow leaves its PR open. Only the explicitly selected full-send
test flow calls `gh pr merge NUMBER --repo zz-prove-it/project`, which advances
only the disposable file remote. There is no extra shared approval step.
`node scripts/prove-ticket-delivery.mjs verify RUN` checks both end states,
failed-to-passed CI histories, unchanged skill hashes and root, and stops the
owned observer. Always run `node scripts/prove-ticket-delivery.mjs stop RUN` in
failure cleanup. Retain `result.json`, command logs and a receipt under RUN.

## Merge observation, stopping and recovery

Associated PRs are observed through authenticated `gh pr view --repo OWNER/REPO`
every 30 seconds by default (`init --observe-ms` changes this). PR number, base main, branch and exact worktree HEAD must agree
before merge release. Observer failures remain visible in status; they are never
interpreted as merged. Replay is idempotent, and release checks the ticket/claim
token before clearing a slot. No profile is automatically deleted.

```sh
node scripts/ticket.mjs observe
node scripts/ticket.mjs release example
node scripts/ticket.mjs stop
```

The manager handles TERM/INT/HUP, closes its HTTP/WebSocket servers, stops only
identity-matched supervisors/namespaces, without changing Serve mappings. Its
logs and profiles remain. If it exits unexpectedly, a new request restarts it and
reconciles recorded claims before allocation; it does not restart their lifetime
or silently resurrect expired previews. An interrupted registry transaction
can leave `registry.lock/owner.json`: inspect the recorded process identity and
all owned processes before manually archiving a stale lock. There is no timed
lock stealing while a live owner may still be writing.

## Safe completion

After confirming no T3 thread/server/owner trial still needs the worktree, release
the matching thread lease with `idle example --thread ACTUAL_ID`. From a separate
checkout, run `finish example`. It refreshes origin/main and fast-forwards root
main only if clean and no ignored file would be overwritten. It never stashes or
resets unrelated edits. Dirty/untracked/in-use worktrees are preserved. Ignored
artifacts require `finish example --archive /outside/archive-parent`; they are
moved, not deleted. Profiles are not in the worktree and are always retained.
Local branch deletion requires a head contained in origin/main, or the observed
PR's exact head and reachable squash merge commit with identical accepted files.
Mismatches retain the branch. Process-use checks require Linux `/proc`; automatic
cleanup on another host is blocked rather than assuming it is unused. Remote
branch deletion is intentionally left to the selected delivery skill after its
own merged/unused checks.

## Verification

Run `/prove-learnharness`. Workflow CLI checks use disposable Git repositories,
fake app processes and a fake GitHub transport; these do not claim live app or
GitHub acceptance. `npm run test:workflow:browser` separately drives real Next
previews with Chromium and isolated synthetic records. The verifier's references
map all nine approved cases and record the T3/external-service boundaries.
Also run `npm run typecheck`, `npm test`, `npm run lint`, and the standard
`npm run test:mobile` gate. A failed/skipped case is not a pass. No physical-device
acceptance is inferred from Chromium.
