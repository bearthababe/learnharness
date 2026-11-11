---
name: ticket-to-main
description: Preview exploratory LearnHarness worktrees or deliver an approved ticket on a T3-managed worktree directly to main. Both use the same three queued isolated preview slots. Use when previewing an exploration or starting, delivering, or completing a ticket. Keep delivery optional, the shared root on main, and existing preview owners safe.
---

# Ticket to main

The approved ticket controls product behavior. The selected installed delivery
skill controls the stopping point. This wrapper adds neither merge authority nor
a shared human approval or preview gate.

## Preview exploratory work

Exploration does not require an approved delivery ticket, a PR, a delivery mode
or a new branch. Use an existing non-root worktree, including dirty/detached work:

```sh
node scripts/ticket.mjs preview my-experiment --worktree "$PWD"
node scripts/ticket.mjs status
node scripts/ticket.mjs release my-experiment
```

Initialize the shared registry once with `init` if necessary. The preview name
identifies retained synthetic state, not a delivery ticket. It uses the same
three slots, queue, snapshot refresh and profile isolation as ticket previews.
No installed delivery skill, GitHub authentication or T3 attachment is needed.
Repeat `preview my-experiment` to reopen it; keep its worktree/dependencies intact.
Never use `finish` to clean exploratory worktrees. Delivery steps below apply only
when the user actually wants to deliver a ticket. A matching named branch can
optionally associate its PR using `pr NAME --pr NUMBER` for merge-based release;
this never grants delivery or worktree-cleanup authority. Runtime expiry/sandbox changes
belong to the coordinated deployment follow-up, not this entrypoint.

## Start or resume

1. Inspect `git status --short --branch`, `git worktree list` and
   `node scripts/ticket.mjs status`. Keep the shared root on `main`; preserve its
   unrelated edits and all other worktrees. Read `docs/agents/git-workflow.md`.
2. If not initialized, run `node scripts/ticket.mjs init`. This creates a private
   external registry, not a preview. Defaults use separate loopback slots
   3800–3802; the existing owner-held 3000–3002 previews are never adopted.
   For tailnet use, read `docs/agents/ticket-workflow.md` before initialization.
3. If the ticket is new, run `node scripts/ticket.mjs prepare TICKET --delivery
   full-stop` or `--delivery full-send`, according to the user's request. Do not
   infer merge permission from an approved design. `prepare` resolves the actual
   installed skill and fetches `origin/main`; use its returned `handoff` object
   with `t3_worktree_handoff`, adding this ticket's approved spec to the
   continuation. Call the handoff last. It binds this thread, not another thread.
   Never replace this with shell-created implementation worktrees.
4. After handoff, attach with `node scripts/ticket.mjs attach TICKET --worktree
   "$PWD" --thread THREAD_ID`. Use the current T3 thread's actual ID, not the
   literal marker. Read status on resume; do not attach a second worktree or
   silently change the stored mode. Run `npm ci` in this checkout.

## Build and deliver

1. Implement, review, fix and verify on the attached ticket branch.
2. When ready to try, automatically run `node scripts/ticket.mjs preview TICKET`.
   It starts the manager, claims a free slot, or queues only the preview request.
   Read `status` for `reviewUrl`, stable `origin`, `revision` and errors. Open the
   review URL; it redirects to the ticket's persistent browser origin. Do not
   advertise a queued/starting/error preview as ready. The running app serves an
   isolated source snapshot. Release and request the preview again to include
   source edits; its synthetic state survives.
3. Run `node scripts/ticket.mjs delivery TICKET`. **Read and execute the returned
   installed `skill` now**, not just the JSON summary. Use `prove-learnharness`
   for its proof step. `full-stop` commits/pushes/reviews and hands back the open,
   unmerged PR; it never merges, queues or enables auto-merge. `full-send` follows
   its CI/review/merge gate and authorized merge without another shared approval
   question. Both target the repository in the returned JSON, base `main`.
   A preview queue is not a delivery blocker. Required proof may independently
   need an isolated app; run that proof without taking over another preview.
4. After creating the PR and after head-changing pushes, associate it using
   `node scripts/ticket.mjs pr TICKET --pr NUMBER`. It checks branch, exact HEAD,
   repository and base. In T3 link the PR immediately after creating/pushing it,
   before this command. The observer polls associated PRs; only a verified MERGED
   state releases that ticket's slot. The manager never merges a PR itself.
5. Follow the selected skill's review/watch/handoff instructions. Before handoff,
   include the verifier receipt, PR head, review verdict and preview status.

## Completion

After remote merge, use `observe` then `status` to confirm release. Profiles are
retained outside the checkout. For cleanup, first confirm through T3 that no
thread, owner trial or server still needs this worktree. The attached thread can
then run `idle TICKET --thread THREAD_ID`; this is an ownership attestation, not a
way to override another active thread. Run `finish TICKET` from a different safe
checkout. Dirty/untracked/in-use worktrees are refused. Ignored artifacts require
`--archive OUTSIDE_DIRECTORY` to preserve them before removal. Root main updates
only when safe. Squash cleanup requires the exact observed head and merge commit,
plus matching accepted files; otherwise the branch is retained.

Use `release TICKET` to free only its preview without deleting its profile, and
`stop` to stop this registry's own manager/apps. Never kill by process name,
replace an occupied port/mapping, copy credentials, or delete retained profiles.
