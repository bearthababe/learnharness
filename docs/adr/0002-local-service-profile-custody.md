# ADR 0002: Linux local-service profile custody

Status: accepted implementation direction; full deployment verification blocked.

The managed Linux path has one long-lived packaged Electron-Node process. It
initializes the existing production standalone Next request handlers behind an
admission gate in the same process, rather than exposing a second private HTTP
listener. It owns learning files, API keys and native subscription credential
managers. The packaged GUI attaches explicitly; it does not own those managers,
start another server, or update the package through the upstream desktop updater.
The existing private desktop protocol remains separate.

## Architectural invariants

- **LD-1 External custody:** the managed learning/credential root is external to
  checkout/package/release code. Shell Chromium userData and Unix runtime sockets
  are separate siblings. Chromium Singleton symlinks never enter the backup tree.
- **LD-2 Single writer:** a Linux process-start/profile lease is acquired before
  recovery or credential manager initialization. Profile administration uses the
  same exclusion mechanism. A GUI is an admitted client, never a fallback owner.
  Linux private-desktop compatibility claims its three durable credential files
  separately from the private child data/auth lease, so it cannot refresh a
  managed service's files before that child discovers a profile conflict.
  Unmanaged web owners also claim those credential files atomically with data/auth.
- **LD-3 History preservation:** rollback is code-only, subject to compatibility.
  Automatic history restoration is forbidden. Explicit local restore requires a
  verified current-profile copy. The previous package probes current owned
  formats before a code-only rollback; unknown/newer data stops the updater.
- **LD-4 Preview isolation:** preview build/runtime must not access personal
  profile/credentials, sessions or unrelated services. Strong sandbox/helper/expiry
  enforcement uses the namespace sandbox, lease-scoped helper and external hard
  deadline. Origin/session separation alone does not enforce it; full independent
  deployment acceptance remains blocked.
- **LD-5 Explicit ingress:** only configured loopback/tailnet hosts are served;
  all application requests require an origin-bound session. Local Unix-socket
  admission creates one-use links; HTTP only exchanges those links, never issues
  them. Unsafe HTTP methods require an exact Origin. Forwarded identity is not
  authentication. The service never provisions routes or enables Funnel.
- **LD-6 Honest release identity:** service, shell and Settings report the build's
  commit, source fingerprint and build ID. Mismatched shells refuse attachment.
  Local upstream updater paths are disabled end-to-end. The explicitly configured
  private supervisor publishes measured activity/lifecycle/liveness; absent or
  stale supervision is reported rather than inferred to be running.

The same-user filesystem/socket contract is not an OS-user malware sandbox.
Normal browser sessions live in service memory. An idle updater cutover transfers
only origin-bound admissions through a private local handoff; an ordinary restart
requires readmission. Attached shells obtain a fresh admission when reconnecting.
Admission links expire after 60 seconds; provider credentials never enter these
links, configuration, status, renderer or logs. Independent proof of all ten
deployment flows remains required; builder tests cannot promote this decision.
