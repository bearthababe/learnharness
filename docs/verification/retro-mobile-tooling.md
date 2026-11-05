# Mobile implementation retrospective — tooling changes

2026-11-04. The owner approved the five improvements from the #37 implementation
retrospective, including global setup, isolated implementation worktrees, review,
and commits on `integration/focused-drills`. The starting commit was `c6433c6`.
This record is the completion/evidence entry point; command details live in the
linked references.

## Repository delivery

- [Mobile browser checks](mobile-browser-checks.md): `npm run test:mobile` creates
  fresh disposable fixtures and dependency copies, runs inputs, Reveal and layout
  checks, and retains diagnostics. It replaces the external cached wrapper.
- [Mobile preview checks](mobile-preview-checks.md): an explicit-URL, read-only
  command verifies launch metadata, manifests/icons and the real Reload action.
  HTTP reads and browser operations have bounded waits; response bodies are
  consumed and browser cleanup runs on failure as well as success.
- The Linux CI job installs the lockfile-installed Puppeteer's supported Chrome,
  runs the browser checks, and retains failure diagnostics. The existing workflow
  policy caught the initially selected artifact v4; final delivery uses v7,
  matching the inherited release workflow, with the strict action checks retained.

The runner and preview branches were merged without conflicts in `0bb7607` and
`2831a2b`; `f58bf39` aligns the artifact action with the existing policy. These
changes affect verification tooling and documentation, not learning behavior.

## Global environment and workflow

Global files are installed locally, outside this repository:

- `~/.local/bin/agent-integration-check` checks final delivery-commit ancestry
  against an explicitly supplied integration ref. Both implementation skills
  point to `~/.agents/references/integration-delivery.md` for resumed-work checks,
  completion receipts and separate publication/owner-acceptance status.
- `~/.local/bin/agent-tool-check` reports Node/npm/GitHub CLI locations and
  versions from the intended project. `20-tool-path.conf` under
  `~/.config/systemd/user/opencode.service.d/` preserves system tool directories
  and adds stable mise-shim/local-tool resolution for future service starts.
- Detailed preview instructions now live in
  `~/.config/opencode/docs/preview-workflow.md`, reached by short global triggers
  for preview operations and chat-UI changes. Every original preview/mobile rule
  is retained verbatim except the document heading.
- Global discovery instructions select explicitly named skills directly and
  request only needed API fields. Completion reports link their verification
  record. PATH operation/activation details are in
  `~/.config/opencode/docs/tool-environment.md`.

Original global files were backed up under
`~/.cache/opencode/retro-mobile-37/global-before/`. While work was paused, the
service was independently updated to a new launcher and already gained a working
PATH. This pass preserved that launcher, validated the drop-in and reloaded unit
definitions. **It did not restart OpenCode.** The persistent override applies at
the next coordinated service restart; current shell tools already resolve.

## Verification

Local detailed logs are under `~/.cache/opencode/retro-mobile-37/` unless noted.

| Boundary | Evidence |
| --- | --- |
| Fresh runner | All three browser suites passed twice, including a rerun after deleting the first fixture (`run-1.log`, `run-2.log`). |
| Runner failure/cleanup | Directory preservation, failure propagation and SIGINT/SIGTERM/SIGHUP cleanup passed, including interruption during real UI execution (`harness-lifecycle.log`, `runner-signal.log`, `failure-probe.log`). |
| Preview command | Disposable real-app root/session launch and Reload passed; missing-session failure cleaned up; all three command tests covering required URL, HTTP failure and hanging headers/body passed. Evidence: `/tmp/opencode/retro-mobile-37-preview/`. |
| Real HTTPS preview | The new command passed against the intended 8446 app: metadata, root manifest, decoded PNG and actual Reload/draft reset; two non-read requests were blocked (`https-preview.log`). The optional session check was skipped in this HTTPS run. |
| Combined repository at `f58bf39` | Full suite: **2,549 passed, zero failed**; typecheck, targeted lint, script syntax and workflow-policy checks passed (`integration-verification.md` and linked logs). The subsequent cleanup correction has the focused follow-up evidence below. Remote CI was not run. |
| Integration helper | Temporary Git histories reject missing commits, accept integrated commits without changing user work, distinguish invalid arguments, and report mixed delivery sets. `bash ~/.agents/tests/integration-check.sh` passes. |
| Command PATH | Original minimal PATH fails with all three missing tools identified. A transient user service using the final PATH resolves Node 26.7.0, npm 11.19.0 and gh 2.103.0. Unit and Bash syntax checks pass. |
| Global instructions | Original preview rules compared byte-for-byte after the heading; links and global changes independently reviewed with no actionable Standards/Spec findings. |

### Independent Spec follow-up: forced browser cleanup

The final combined Spec review of `c6433c6...e90c9d4` found one P2: the preview
check's five-second fallback killed only Chromium's launcher, allowing descendants
to survive. The preview branch first incorporated `e90c9d4`, then changed that
fallback to signal Puppeteer's owned POSIX process group, following the disposable
runner's platform handling. `ESRCH` is tolerated; other signaling errors reject
cleanup. Windows retains the existing direct-child fallback and was not exercised.

The separate [Linux/Chromium regression command](mobile-preview-checks.md) calls the
public CLI with a real-Chrome wrapper and owned sleeper against a disposable local
failure page. **Red:** Chrome closed and the launcher was killed, but the sleeper
survived. **Green:** the command failed within its cleanup deadline and neither
launcher nor sleeper remained running. The test contains its own processes even
when red; it is outside the browser-free default test glob.

Follow-up evidence is retained in `/tmp/opencode/retro-mobile-37-preview/`:

- `cleanup-red.log` and `cleanup-green.log`: the regression failed for the exact
  leaked-descendant assertion before the fix, then passed; each links its retained
  wrapper/process-marker/command-log directory.
- `cleanup-cli-tests.log`: all three existing CLI tests passed.
- `cleanup-real-ui.log`: root/session metadata, manifests, decoded PNG and actual
  Reload/draft reset passed against the isolated development app on localhost 3117.
- `cleanup-real-ui-failure.log`: missing session produced the expected HTTP 404 and
  exit 1 after the real root/Reload checks. Script/regression syntax and diff checks
  also passed. Public previews, learner data and services were untouched.

### Final independent review

Follow-up review through `0b549f3` resolved the cleanup finding. **Standards: zero
documented violations or actionable advisories. Spec: zero open findings; one P2
resolved.** The global-only review also has zero actionable findings. Reports are
retained as `standards-review.md`, `spec-review.md` and `global-review.md` under
`~/.cache/opencode/retro-mobile-37/`.

Browser checks remain simulated/controlled evidence. The earlier owner-confirmed
two-recording iPhone retry stands; the remaining physical-device acceptance stays
under #37/#42. This tooling work does not close those acceptance tickets or claim
live CI execution, physical iOS acceptance or a push.
