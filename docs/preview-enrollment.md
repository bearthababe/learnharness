# Unattended private preview enrollment

Normal preview use must not require signing in to Tailscale for each PR. Configure
one restricted OAuth credential on the trusted host; `ticket preview NAME` then
registers a separate private node for a new source and reuses its saved node state
when reopening that source. This is opt-in local administration, not a browser
or preview-code capability. The existing three-slot manager remains the only pool.

## One-time owner setup

An owner/admin performs the account-side steps, not every PR author:

1. In [Access controls](https://console.tailscale.com/admin/acls), select
   **Tags → Create tag** if the tag does not exist. Enter `learnharness-preview`
   without the `tag:` prefix, choose your account as owner and select **Save tag**.
   This defines the tag's ownership; do not replace the policy or add broad
   network grants. Review who can reach previews under the existing policy.
2. Open [Trust credentials](https://console.tailscale.com/admin/settings/trust-credentials).
   Select **Credential → OAuth**, choose **Auth keys: Write** only and the dedicated
   preview tag. Do not select `all`, policy/DNS writes or unrelated device scopes.
   Copy the client secret once. Account UI and available roles may vary; stop if
   the required tag/scope is unavailable instead of widening permission.
3. Supply that secret through the coding agent's private secret card, or save it
   in a private owned file outside every checkout/profile. Never paste it into
   chat, a command argument, `.env`, the repository or a preview's environment.

The configuration command refuses credential input inside any project worktree,
including unregistered worktrees, or any registered preview profile. Refusal
preserves that file; if a real credential was already exposed to source code,
revoke it and create a fresh one rather than moving and trusting the exposed key.

The agent can perform all remaining local steps. With the registry's own previews
released and its manager stopped, and existing review routes already configured:

```sh
node scripts/ticket.mjs configure-enrollment --secret-file /private/oauth-secret
node scripts/ticket.mjs preview my-source --worktree /path/to/worktree
```

Use the intended `--root` and `--state-dir` for nondefault registries. Configure
once, then use the normal preview command for subsequent PRs. Explicitly bound
manual `--tailnet-socket` nodes remain supported and are not adopted or replaced.
Rotating the credential uses the same configuration command and preserves node
identity; changing the established tag is refused.

A new exploratory source's profile ownership is saved before enrollment starts.
If enrollment fails, repair the configuration and retry the same preview name;
the retained profile is reused, never silently adopted or erased.

## Custody and recovery

The credential lives at `REGISTRY/preview-enrollment/credential`, mode 0600 under
private directories. Only a nonsecret enabled flag enters the ticket registry.
The CLI passes a file path to Tailscale, not the secret in arguments/environment,
and suppresses raw enrollment failure output. It uses OAuth-assisted registration
with `ephemeral=false` and `preauthorized=true`, under the configured tag. No
normal-node setting, DNS/route acceptance, SSH or public Funnel is enabled.

Each source's daemon state, process owner and pinned node identity live under
`REGISTRY/preview-enrollment/nodes/NAME`. Private Unix sockets live under
`~/.local/state/lh-pv/` with registry/source-derived names. This short persistent
socket directory also preserves matching route-owner records across host reboots.
These trusted
paths are outside all preview mounts. The manager restores a managed daemon before
source startup or matching-route recovery. Daemon state survives process restarts;
the endpoint daemons are intentionally retained independently of preview expiry.
No new runtime or helper permission survives the existing ten-minute preview lease.

Different sources never share a hostname. A restart must reconnect the same node
and hostname; missing saved state, a changed identity, an unowned socket or foreign
mapping causes refusal, not replacement or interactive login. Pinned nodes that
are revoked or require renewed authorization are not silently re-enrolled. The
operator must inspect that exceptional condition locally. Unrecognized directories
are preserved. Do not delete saved node state to try to repair a bound source.

OAuth avoids periodic replacement of manually reusable registration keys, but
owner revocation, credential-policy changes, lost storage, tailnet limits or
device authorization/expiry policy can still require owner intervention. It is
not a promise that account authorization can never be needed again.

## Evidence boundaries

`tests/deployment/preview-enrollment.test.mjs` covers enrollment/reuse/restart,
redaction, custody, refusal and actual configuration CLI behavior with synthetic
credentials and transport. It does not prove live Tailscale enrollment. Final
setup requires two genuinely distinct source nodes to enroll without login, one
to restart with the same identity, and actual browser/native/sandbox boundary
checks with unchanged normal routes. Until those run, report the setup as BLOCKED
or scoped builder-tested, not ready or fully accepted.

Provider references: [OAuth clients](https://tailscale.com/kb/1215/oauth-clients),
[auth keys](https://tailscale.com/kb/1085/auth-keys), and
[trust credential scopes](https://tailscale.com/docs/reference/trust-credentials).
