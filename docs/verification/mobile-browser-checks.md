# Mobile browser checks

Use the aggregate command at UI integration checkpoints and after editing the
browser harness. From a checkout with `npm ci` completed and Chrome/Chromium installed:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:mobile
```

The command runs the existing input, Reveal and mobile-layout suites against a
fresh localhost app. Fixtures and dependencies are copied from this checkout;
each run has its own storage, auth file and build cache. The tutor uses Pi's faux
provider through the real chat handler. Dictation uses real browser audio with
controlled speech responses. No learner data or preview server is needed.

## Paths and diagnostics

- `CHROMIUM_PATH`: executable; defaults to `/usr/bin/chromium`. Logs print its
  path/version and the installed Puppeteer's supported Chrome version. Linux CI
  downloads that exact supported Chrome through the lockfile-installed browser
  installer.
- `LH_MOBILE_TEST_DIR`: artifact **parent** directory. Each invocation creates a
  new `mobile-input-browser-*` child, even when this variable is reused. Existing
  directories are never cleared or reused as fixtures.
- Without an explicit parent, `TMPDIR` wins, then persistent user-cache storage:
  `$XDG_CACHE_HOME/learnharness/mobile-browser` (default `~/.cache/...`) on Linux,
  `~/Library/Caches/learnharness/mobile-browser` on macOS, or
  `%LOCALAPPDATA%/learnharness/mobile-browser` on Windows (default
  `~/AppData/Local/...`). Allow space for a full dependency copy plus Next's build
  cache. An explicit temporary-storage override still needs sufficient capacity.
- `LH_MOBILE_TEST_PORT`: dedicated localhost port, default `3109`. An occupied
  port fails startup; preview ports `3000`–`3002` are rejected.

The printed artifact directory contains `result.json`, `runner.log`, a nested fixture with
`server.log`, and individual Reveal/layout logs. Input failures also attempt a
screenshot and page-text capture. Failures return a nonzero exit status; success,
failure, SIGINT, SIGTERM and SIGHUP stop owned server/browser processes. Artifacts remain
for inspection. After processes have stopped, the printed run directory can be
deleted and the same command rerun; nothing in it is a prerequisite for later runs.
CI retains the result for every run and failure logs/captures for seven days,
excluding fixture sources and dependencies.

## Result receipt

Use the printed `result.json` as the authoritative browser-run record. It is
atomically replaced at each suite boundary and has `schemaVersion: 1`:

- `source`: Git `revision`, checkout `dirty` flag (including untracked files), and
  `sha256` of the copied application/configuration/scripts before fixture route
  substitutions. The fingerprint includes `package-lock.json`; it excludes installed
  dependencies, generated build files, Git metadata and learner data. A copy that
  differs from the starting fingerprint fails before suites can pass. Run from a
  Git checkout; source-identity failures are recorded as failed setup.
- `status`, `startedAt`, `finishedAt`, `error`: aggregate outcome and timing.
- `suites`: ordered `inputs-notebook`, `reveal`, `layout` entries, each with status,
  timestamps and any runner failure. Input/Notebook includes both Notebook browser
  and Notebook layout checks. Detailed assertion output is in the linked logs.
- `artifacts`: absolute paths to the run directory, aggregate log and disposable
  fixture (null until copying and source verification finish).

Statuses are `not-run` (suite only), `running`, `passed`, `failed`, or `interrupted`.
The runner stops on the first failure and preserves earlier passing outcomes.
Exit zero requires all three suites to pass and owned-process cleanup to complete.
SIGINT/SIGTERM/SIGHUP record interruption before cleanup; forced termination such
as SIGKILL can leave `running`, which is incomplete evidence, never a pass.

Run `npm run test:mobile` again for a fresh aggregate receipt. Lower-level scripts
remain diagnostic tools; their separate logs do not turn a failed receipt green.

These scripts are excluded from ESLint. When editing them, run `node --check` on
each changed script and execute `npm run test:mobile`. Chromium touch/viewport
emulation is automated regression evidence; physical iPhone keyboard, gestures
and recording acceptance remain separate checks.
