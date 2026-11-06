<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI experiments

In an authorized UI experiment, ordinary UI design and implementation choices are delegated to implementers, and independent reviewers decide promotion. Existing interface mechanics are baseline evidence, not settled design requirements. Approved product requirements, teaching policies and explicit technical constraints remain binding.

## Ticket delivery

Keep the shared root on `main`. Before ticket implementation or cleanup, read
`docs/agents/git-workflow.md` and use `.agents/skills/ticket-to-main/SKILL.md`.
After changes to ticket tooling, app launch/auth, or previews, run
`.agents/skills/prove-learnharness/SKILL.md` before saying done.

## Browser verification

Before running mobile browser checks or integrating UI changes, read
`docs/verification/mobile-browser-checks.md` for the standard command and result receipt.
