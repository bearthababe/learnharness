# Main-first worktree workflow

Owner decision: start threads in the project root on `main`. Isolate implementation
in worktrees, return accepted work to `main`, and remove finished worktrees and
branches. Retained exceptions need annotated Git tags with a reason.

## Start

- Check `git status --short --branch` and `git worktree list` before writing.
- Keep the shared project root on `main`. Do not switch it to a task branch.
- If the root is on another branch or has unrelated edits, preserve those edits
  and coordinate with active threads before correcting it. Never reset or clean
  the root to make it look ready.
- New T3 threads use the project's **local** default. For implementation, move
  the thread into a T3-managed worktree based explicitly on `origin/main`, after
  fetching `origin`. Do not inherit an integration branch accidentally.
- Use the orchestration worktree tools so the thread is bound to its checkout.
  A recovery-only worktree is storage, not a substitute for binding a working
  thread. Leave other threads' worktrees alone.

## Finish

- Validate and integrate only the task's accepted changes through the agreed
  review/merge process. This workflow does not grant blanket merge permission.
  Do not merge old experimental branches merely to empty the branch list.
- After the merge, fetch `origin` and fast-forward the root's `main` with
  `git merge --ff-only origin/main`, only when the checkout is safe to update.
- Before removing a task worktree, confirm it is clean and no thread, dev server,
  or owner trial still needs it. Preserve untracked files and ignored artifacts
  that must survive; a clean Git status alone does not prove they are disposable.
- Remove the finished worktree, then delete its local branch. Verify the branch
  is contained in `origin/main`; for a squash merge, verify the merged PR's exact
  head and accepted result instead. Remove the remote task branch only after
  verifying it is merged and no longer in use. Never force-remove a dirty worktree.

## Retain an exception

- Use an annotated tag such as `keep/<task>/<date>` for active work or
  `archive/<experiment>/<date>` for a historical reference.
- The annotation must explain what is retained, why, and when it can be removed.
  Report the tag and any retained worktree path at handoff. Review retained work
  again when its task finishes; retention is not the default completion state.
- A tag on a branch head does **not** preserve uncommitted changes. For recovery,
  preserve tracked and untracked files explicitly, tag the recovery snapshot,
  and verify restoration before cleaning the original checkout.
- Keep recovery tags containing private artifacts local. Do not publish all tags
  or drop a recovery snapshot before its contents have been accepted or archived.
- Preserve local-only retention tags during fetches: keep this repository's
  `fetch.pruneTags` set to `false` and do not use `git fetch --prune-tags`.
  Remote branch pruning is fine; tag pruning can delete these local snapshots.
