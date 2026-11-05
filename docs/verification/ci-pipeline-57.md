# CI correctness review — issue #57

## Scope and baseline

The owner authorized a separate correctness repair for
[issue #57](https://github.com/bearthababe/learnharness/issues/57), to unblock the
docs-only skill transfer in PR #58. The baseline is `a7f5505` on `main`.
Performance proposals from #54 and merge-policy changes are not included.

## Pipeline coverage

`.github/workflows/ci.yml` runs on main pushes, pull requests and manual dispatch:

- Linux quality: dependency install, TypeScript, all unit/integration tests, ESLint.
  A failed test step prevents the following lint step from running.
- Linux mobile browser: the lockfile-installed Puppeteer's supported Chrome,
  harness syntax checks and the standard aggregate browser command. Result
  receipts are retained for every run; failure logs/captures are retained for
  seven days. This is not physical iOS/Safari verification.
- Linux, Windows and Apple Silicon macOS standalone: native renderer tests,
  production build, provider-runtime trace check, standalone packaging and
  Electron-hosted server smoke tests. These do not replace the mobile suite.

The repository API reported main as unprotected and returned no repository
rulesets during this review. Passing checks are therefore an agent/owner merge
gate, not an observed server-enforced gate. No protection settings were changed.

## Diagnosed failures

All 26 hosted unit-test failures reproduced with the developer cache and
`/tmp/opencode` absent in a disposable filesystem namespace: 82 tests, 56 passed,
26 failed. The affected fixtures assumed an existing machine-specific parent
directory. They now create unique directories beneath the OS temporary directory
and retain their existing cleanup and explicit test-root overrides.

The combined handwriting, Notebook and dictation subset passes 229/229 with those
directories absent and the checkout read-only. That also caught an import-order
leak in `notebook-models.test.ts`: model configuration must load only after the
fixture's data-directory environment is established.

A second browser-harness race reproduced in the Notebook menus check: closing
the speech socket precedes completion of asynchronous capture teardown. Starting
the next shortcut then invokes the previous recording-phase handler. Waiting for
the actual idle dictation control preserves all Escape, focus, speech and draft
assertions; the focused browser check then passes.

The hosted card-exit endpoint assertion remains under investigation. The same
Chrome version passes the isolated real-app card checks locally at CPU throttle
rates 1, 4 and 8. That is not a diagnosis or a substitute for hosted proof. The
assertion now includes its sampled geometry in failures without changing its
threshold, sampling or coverage.

## Verification contract

Use [the standard mobile command and aggregate receipt](mobile-browser-checks.md)
for acceptance. A failed receipt stays failed even when a later diagnostic check
passes. Final hosted results and any remaining limitations belong in #57 before
closing the issue; this document alone does not claim the repair is complete.
