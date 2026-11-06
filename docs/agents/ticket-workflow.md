# Independent ticket delivery and previews

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
no dotenv files. It is served in place, without commits, checkout changes or
deployment. The name owns its retained isolated profile and cannot be reassigned
to another worktree or adopted over an existing ticket. Repeat `preview NAME` to
reopen it. Release stops only the preview; it never removes exploratory source.
The existing JSON `tickets` collection also holds records marked
`kind: "exploration"`; this is shared preview bookkeeping, not a delivery ticket.

Both entrypoints share the same three slots and FIFO queue. Exploration does not
require PR association or ticket delivery and never uses automatic worktree
cleanup. If it later has a matching named branch/direct-main PR, optionally run
`pr NAME --pr NUMBER` to release its preview automatically on merge. Runtime
expiry, stronger sandboxing and subscription-helper integration remain deployment
work; this command does not implement those capabilities.

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

## Stable origins and isolation

The default slot addresses are `http://127.0.0.1:3800/` through `:3802/`, separate
from existing owner-held 3000–3002 previews. Each is a no-cache redirect to a
ticket-specific persistent port, assigned once from 18100 upward. The slot is
reusable; the ticket origin is not reassigned. This preserves localStorage and
IndexedDB across slot moves and prevents the next occupant inheriting them.
Browser cookies ignore ports, so the app's managed-preview bootstrap and proxy
also namespace document/server cookies by ticket. Only managed previews use this
bootstrap; ordinary app/desktop behavior is unchanged.

Profiles live in the registry's `profiles/TICKET/`, outside every worktree, with
separate `data`, `auth`, and `home` directories. New profiles copy nothing. App
processes get an environment allowlist, isolated HOME/XDG/CLI configuration paths,
`LH_IGNORE_ENV_KEYS=1` and explicit data/auth paths. Dotenv-bearing worktrees are
refused because Next loads those files after process launch. Do not add one later
or intentionally paste credentials from another profile. Native Claude Code is
unavailable in managed previews: a relocated HOME alone cannot isolate OS
keychain authentication. File-key and web-subscription sign-in use ticket auth
storage, and may need setup. These controls are not a general filesystem sandbox.

The manager runs `next dev` from the actual ticket worktree on an owned internal
loopback port, forwards HTTP/streaming/WebSocket traffic through the stable
origin, and redirects the slot to it. Keep its worktree and dependencies present
until release. New source edits reload normally; no per-revision copy or deploy.

## Optional tailnet review

Use only unused ports, after reading the existing preview ownership registry,
checking listeners and `tailscale serve status --json`. Never use Funnel.

```sh
node scripts/ticket.mjs init --ports 3800,3801,3802 \
  --tailnet-host thinkpad.tailfd9bf6.ts.net --https-ports 8450,8451,8452
```

This is an alternative initial configuration, not an update to an existing
registry. The owner must have Tailscale Serve permission and tailnet access. On
claim, the manager adds only absent mappings for the selected slot and persistent
ticket origin. Existing mappings cause a conflict, even if their target looks
familiar. On release it removes only mappings it recorded and whose exact target
is unchanged. The three review URLs redirect to distinct persistent HTTPS ports;
the existing 443/8443–8447 and 3000–3002 owners remain untouched. Different hosts
need to be the machine's own `.ts.net` name. No public Internet exposure is added.

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
identity-matched child process groups, and removes only its exact mappings. Its
logs and profiles remain. If it exits unexpectedly, a new request restarts it and
reconciles recorded claims before allocation. An interrupted registry transaction
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
