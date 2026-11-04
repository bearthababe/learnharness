# Mobile browser checks

From a checkout with `npm ci` completed and Chrome/Chromium installed:

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
- Without an explicit parent, `TMPDIR` wins, then `/tmp/opencode` when present,
  then the OS temporary directory. Allow space for a full dependency copy plus
  Next's build cache; use a disk-backed parent if temporary storage is small.
- `LH_MOBILE_TEST_PORT`: dedicated localhost port, default `3109`. An occupied
  port fails startup; preview ports `3000`–`3002` are rejected.

The printed artifact directory contains `runner.log`, a nested fixture with
`server.log`, and individual Reveal/layout logs. Input failures also attempt a
screenshot and page-text capture. Failures return a nonzero exit status; success,
failure, SIGINT, SIGTERM and SIGHUP stop owned server/browser processes. Artifacts remain
for inspection. After processes have stopped, the printed run directory can be
deleted and the same command rerun; nothing in it is a prerequisite for later runs.
CI retains failure logs and captures for seven days, excluding fixture sources
and dependencies.

These scripts are excluded from ESLint. When editing them, run `node --check` on
each changed script and execute `npm run test:mobile`. Chromium touch/viewport
emulation is automated regression evidence; physical iPhone keyboard, gestures
and recording acceptance remain separate checks.
