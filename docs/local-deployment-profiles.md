# Local profile administration

The Linux normal server resolves `~/.config/learnharness`, or `LH_PROFILE_DIR`, with
`data/` and `auth.json` beneath it. Read-only assets still ship with the code.
No startup copies or merges an old repository or desktop profile.

Existing `LH_DATA_DIR` and `LH_AUTH_FILE` overrides remain supported, including
synthetic verification profiles inside a checkout. An unset counterpart uses
the external default, never an old repository file. When `LH_PROFILE_DIR` is
explicit, overrides must match its `data/` and `auth.json` exactly. Managed roots
inside a checkout, package or release are refused. Symlink paths are refused.

This local deployment path targets Linux. Other platforms retain their existing
unmanaged defaults and startup behavior; an explicit managed deployment there
is refused rather than pretending Linux ownership enforcement is available.

## Ownership

`electron/deployment-profile.cjs` is synchronous and uses only Node builtins.
`resolveProfile` has no write/migration effects. `acquireProfile` returns
`{ profile, filename, record, assertOwner, release }`. `ownServerProfile` keeps
one process-global lease and releases it on process exit. Next instrumentation
acquires this before importing notebook recovery, excluding production builds.

All participating writers use a private Linux registry at
`CANONICAL_ACCOUNT_HOME/.local/state/learnharness-profile-writers`. The account
home comes from the operating system's UID record, not environment variables.
Only small ownership metadata lives there; profiles and backups do not. Its
location is independent of `HOME`, XDG and temporary-directory overrides, so
callers with different environments still exclude each other. Persistent state
avoids temporary-directory cleanup invalidating a live lease. Locks remain
outside the profile during atomic restoration.
Managed owners exclude the entire profile tree. Legacy owners exclude both the
configured data tree and auth file, including overlapping managed roots.
Administration also locks the sibling backup inventory and its temporary
pruning/recovery directories against other configured profile writers.
`acquireProfile(profile, { additionalDirectories })` acquires
these resources together, not through an unchecked lock-bypass flag.

Ownership records contain PID, Linux start ticks, boot identity and a random
lease. Registry operations serialize behind an exclusive directory guard. Only
a complete, demonstrably stale identity is reclaimable; release requires the
exact acquired identity and lease. An incomplete record or abandoned guard
fails closed and requires local inspection, never an automatic unsafe unlock.
No delegated-owner or skip-lock environment flag is supported. Packaged parent
ownership and native-writer parity are separate integration work.

## Local commands

Run these with the intended external `LH_PROFILE_DIR` and all its writers stopped:

```bash
node scripts/local-deployment.mjs profile
node scripts/local-deployment.mjs migrate --source-repository /selected/repository
node scripts/local-deployment.mjs backup --reason update
node scripts/local-deployment.mjs backups
node scripts/local-deployment.mjs restore COPY_ID --approve-local-restore
```

Migration is explicit, requires the selected repository's `.git` marker,
`data/` and `auth.json`, refuses any existing target, copies without changing
source bytes, and never combines a desktop profile. Rehearsals must select only
synthetic fixtures, not real profiles. Profile administration refuses legacy
split-path layouts rather than guessing a migration or backup boundary.

Backups are sibling directories at `PROFILE.backups`, mode 0700 with mode 0600
files, including every native credential file generically. A deterministic
manifest verifies content and profile identity. Every inventory member is
verified before pruning. Update and pre-restore copies share one sequence and
the latest ten slots; there are no protected exemptions. Space, copy and
verification failures do not prune to make room. Local commands never print
file contents or credential values.

A pruning failure reports failure and leaves verified copies available; it can
temporarily retain more than ten rather than discard the new safety copy. A
later successful operation applies the same latest-ten rotation, with no
exemptions. Failed restore pruning exchanges the current data back and retains
the verified pre-restore copy. Resolve the storage error before retrying.

Before recursive pruning, administration makes space for and verifies a private
recovery copy of every expiring backup. `PROFILE.backups.pruning` journals these
copies before deletion begins. The profile-bound transaction manifest is durable
before any preparation copy; a separate hash-bound prepared marker precedes
deletion. Missing, malformed, foreign or unrecognized nonempty journals are
preserved and refused, not recursively cleaned based on their name or ownership.
Empty unjournaled roots are removed only with nonrecursive `rmdir`; concurrent
new contents cause refusal. Identified cleanup uses its validated name snapshot,
never a fresh listing that could adopt unrelated files added after validation.
Failed or interrupted deletion never makes a
partial directory an accepted backup: the next administration command recovers
the exact originals under the same writer lease before reading the inventory.
If storage permissions prevent immediate recovery, the error names the retained
recovery directory. Repair the storage error and retry; do not delete that
directory. This also preserves the selected historical copy when restore
pruning fails and the current profile is exchanged back.

Successful rotation atomically renames that journal to
`PROFILE.backups.pruning.committed` before removing recovery garbage. A later
cleanup failure is reported as `pruningCleanup.retainedRoot` and
`pruningCleanup.cleanupError` on the successful backup/restore result. It does
not falsely fail a completed restore or roll history back. Subsequent local
administration retries this cleanup. These temporary transaction copies are
not a protected backup class or a second rotation pool; successful cleanup
leaves the same latest ten verified backups.

Restore requires explicit local approval, stages and verifies the selected copy
before rotation, and verifies a current-profile backup before changing the root.
It uses Linux atomic directory exchange through GNU `mv --exchange --no-copy`;
older coreutils or filesystems without exchange fail closed, with no two-rename
fallback. The previous root remains available through verification and can be
exchanged back if the operation fails. Rotation commits only after verification;
temporary staging is not a permanent protected backup class. No automatic
history restoration or installed-launcher cutover is implemented. The explicit
local updater in `docs/local-service.md` safely hands ownership off by stopping
its drained backend before acquiring this same administration lease.
If deleting the old staging tree fails after commit, the result explicitly
reports `retainedRoot` and `cleanupError`; it does not falsely report a failed
data restore or attempt rollback through a partially deleted old tree.

The library's `profileIO` interface supplies real copy, verification, space and
atomic-exchange operations. Tests can inject failures through an in-process
argument; there is no CLI/environment bypass. Run `npm run test:deployment` for
filesystem, real-process and actual Next startup coverage. These builder checks
are not independent deployment proof or packaged desktop/native parity.
