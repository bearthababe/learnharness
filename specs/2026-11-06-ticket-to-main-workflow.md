# Ticket-to-main workflow: implementation specification

Status: requirements approved by the owner on November 6, 2026; implementation
pending.

**Implementation handoff:** when asked to implement this specification, build the
working ticket-to-main workflow, preview management, and delivery-skill integration
described below. Updating documentation alone does not satisfy this specification.
The workflow decisions are already approved; the implementation agent chooses
the technical mechanisms within these constraints. Current implementation status
is not a restriction on what the implementation must deliver.

## 1. Starting point

The owner needs 3–5 tickets moving independently from approved work to remote
`main`, with reusable previews and a selectable stopping point. The missing piece
is an operational workflow: agents must be able to claim previews, preserve each
ticket's state, work through CI, and release slots without manual redeployment
for every revision or a blanket human merge-approval gate.

Facts checked November 6, 2026:

- [Development configuration](../docs/development.md) supports separate data and
  auth locations. Subscription files follow the auth directory, with one server
  per credential directory. Ambient credentials can still apply; an empty data
  directory alone is not credential or filesystem isolation.
- [Mobile preview checks](../docs/verification/mobile-preview-checks.md) require
  an explicitly selected running preview and ownership checks. The command does
  not allocate slots or start servers. Live slot availability was not verified.
- The owner described existing PR-boundary and end-to-end delivery skills as
  “full stop” and “full send.” Their exact installed names and entrypoints were
  not verified. The required modes are defined below, independently of spelling.

First implementation task: inspect the existing workflow tools, delivery skills,
preview ownership, and data/credential seams. Reuse working mechanisms where
possible and identify the concrete integration points. Recheck these source facts
before changing runtime behavior. Preserve existing owner-held previews and
profiles; this specification does not authorize taking them over.

## 2. Goals and non-goals

Goals:

1. Deliver a usable workflow for approximately 3–5 independent tickets in
   progress, each with its own branch and managed worktree and a PR targeting
   `main` directly.
2. Integrate the selected delivery skill so PR-boundary mode hands back at the
   PR, while end-to-end mode continues through CI work and merge under that
   skill's instructions.
3. Implement three reusable review-preview slots, automatic claiming of free
   slots, queuing when full, and automatic release on merge. A ticket preview
   serves its worktree without a new deployment for every revision.
4. Implement persistent, isolated per-ticket preview profiles that start empty,
   survive slot changes and worktree cleanup, and remain separate from everyday
   learning data and other tickets.
5. Expose enough operational status for agents and the owner to identify each
   slot's ticket, source revision, preview address, and queued requests, without
   exposing credentials.

Non-goals of the implemented workflow:

- Introduce a shared integration branch, mandatory human merge approval, or a
  new universal preview gate.
- Replace unrelated previews, change everyday learning data, copy live profiles
  or credentials, expose previews to the public Internet, or delete retained
  ticket profiles automatically.
- Introduce a new merge method or reviewer policy. Preserve the selected skill's
  and repository's applicable checks and delivery policy.

## 3. Constraints

### Ticket ownership and delivery

1. Keep the project root on `main`. Give each ticket its own task branch and
   T3-managed worktree, based explicitly on freshly fetched `origin/main`.
2. Target `main` directly with each ticket's PR by default. Handle dependencies
   through explicit ordering rather than accidental inheritance from another
   task or a shared integration branch.
3. Run implementation, review, fixes, and verification on the ticket branch.
   The selected skill owns the stopping point: PR-boundary mode hands back at
   the PR; end-to-end mode may continue through CI work and merge under that
   skill's instructions. This workflow adds no blanket human merge-approval gate
   and grants no merge authority independently of the selected skill.
4. Treat the requirements in this file as approved, not as questions to reopen.
   Approval of a ticket's design is distinct from permission for its selected
   delivery skill to merge. Resolve actual skill entrypoints during discovery
   and wire both delivery modes into the workflow; do not substitute a second,
   conflicting approval policy.
5. After remote integration, fetch and fast-forward the root's `main` only when
   safe. Preserve unrelated work and verify that task worktrees are clean and
   unused before removing them. Local `origin/main` is refreshed by fetching;
   the PR merges into the remote repository's `main`.

### Preview slots and profiles

- A ticket's agent automatically claims a free review slot when it has something
  ready to try. Each slot serves its assigned worktree at a reusable address;
  an occupied slot is not replaced by another ticket. Concurrent claim attempts
  must not assign the same slot to different tickets.
- When all three slots are occupied, queue only the preview request.
  Implementation, review, and CI continue. Whether the ticket can merge remains
  governed by the selected skill, not by this queue.
- Each ticket owns a persistent preview profile containing its learning
  sessions, settings, and sign-in state. Store it outside the worktree, keep it
  separate from the everyday profile, and retain it when the ticket moves slots.
- Initialize a new ticket profile empty, with no copied learning history,
  settings, or credentials. Provider setup and sign-in may be needed. Resolving
  ambient credentials is an implementation concern, not something an empty
  profile automatically accomplishes. Provisioning must prevent a supposedly
  empty preview from silently using the everyday profile's credentials.
- Merging the ticket's PR automatically releases its slot. Releasing a slot is
  separate from deleting the profile; no automatic profile-deletion policy has
  been authorized.

### Implementation responsibility and safety

The implementation agent owns technical choices: file/module names, storage
layout, claim synchronization, queue ordering, process management, merge
observation, browser-state isolation, and integration adapters. These are work
to implement, not reasons to stop at another documentation deliverable. Keep
these choices consistent with existing repository conventions and the approved
behavior above.

The ticket workflow owns its branch, worktree, PR association, and selected
delivery mode. The preview manager owns slot allocation, queuing, and the
processes it starts. Merge handling releases only that ticket's slot; repeated
handling must not release a slot subsequently assigned to someone else. Profile
data belongs to the ticket, not the slot or process. Only the selected delivery
skill's authority permits a merge; slot management grants no additional authority.

Preserve another owner's processes, mappings, profiles, and unrelated checkout
edits. A clean Git status is not permission to discard ignored data. Keep preview
access within the existing trusted-local/tailnet boundary. Separate data/auth
paths are not a general filesystem sandbox, and browser-saved state must not
leak from a previous slot occupant to the next ticket.

Stop and report a concrete conflict if implementation would require taking over
an occupied preview, copying credentials, deleting retained data, or overriding
the chosen skill's authority. Missing tooling requires implementation; a changed
source fact requires investigation, not silently weakening the requirements.

## 4. Proof

**Verifies on:** disposable Git repositories/remotes and test worktrees, isolated
ticket profiles, and explicitly allocated previews running the real app. Use test
credentials or fake providers where model calls are unnecessary; personal data
and another owner's previews are not fixtures. Read the repository's mobile
verification instructions before browser checks.

The implementation must supply executable checks for the cases below. Verify
the actual workflow entrypoints and running app, not only mocked helper calls.

| # | Proves | Surface and check | Pass signal |
| --- | --- | --- | --- |
| 1 | Parallel delivery | Exercise ticket setup and PR targeting against test Git state. | Independent branches/worktrees use the intended base; root stays on `main`; PRs target remote `main`. |
| 2 | Selectable stopping point | Run the PR-boundary and end-to-end skill integrations against a test delivery flow. | The first hands back at the PR; the second performs authorized CI work and merge without an extra shared approval gate. |
| 3 | Safe allocation | Request previews concurrently through the real allocation entrypoint. | Three tickets receive distinct slots; occupied owners and processes remain unchanged. |
| 4 | Nonblocking queue | Request a fourth preview with all slots occupied, then continue its ticket workflow. | Only the preview queues; implementation, review, and CI proceed, and merge eligibility follows the selected skill. |
| 5 | Empty isolated profile | Start a new ticket preview and inspect its actual settings, sessions, and credential resolution. | It has no borrowed history, settings, or credentials; everyday and existing ticket profiles remain unchanged. |
| 6 | Preview from worktree | Edit the selected ticket and load its allocated preview, including through its configured review address. | The correct ticket's running app shows the change without a per-revision deployment or a change to root `main`. |
| 7 | Persistent ticket state | Save synthetic state, move the ticket between slots, and reopen it; then assign its old slot to another ticket. | The original ticket retains its state; neither ticket sees the other's server-side or browser-saved state. |
| 8 | Automatic release | Observe a test PR merging through the implemented merge-handling path, including repeated handling. | Only its slot is released, queued requests can progress, and the retained profile is not deleted or inherited by the next occupant. |
| 9 | Safe completion | Exercise integration and worktree cleanup using clean and dirty test checkouts. | Root updates only when safe; unrelated work and retained profiles survive; an in-use worktree is preserved. |

Run the repository's applicable typecheck, tests, and lint commands, plus the new
workflow integration checks and relevant browser checks. Record exact commands,
source revisions, outcomes, and any environmental blockers. A blocked or skipped
case is not a pass. Do not claim physical-device acceptance from emulation.

**Done means:** working tooling and delivery-skill integration satisfy these
requirements, acceptance checks pass, and agents and the owner have documented
entrypoints for using and inspecting the workflow. A policy document, another
plan, or passing documentation checks alone is not completion. Implementation
evidence is pending until a thread builds and verifies this specification.
