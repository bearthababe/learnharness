# Mobile preview checks

Run against an explicitly selected, running **development preview**:

```sh
LH_SMOKE_URL=http://127.0.0.1:3117/ node scripts/smoke-mobile-preview.mjs
```

`LH_SMOKE_URL` is required: use the root HTTP(S) URL, without a query or fragment.
The command never selects a public slot, starts/stops an app, or creates a session.
Before using a shared preview, check its ownership registry, listeners and
`tailscale serve status`. Prefer a disposable app with isolated data/auth. Warm a
cold Next development app before running the bounded checks.

Optional settings:

- `CHROMIUM_PATH`: Chromium executable; defaults to `/usr/bin/chromium`, matching
  the existing mobile browser smoke command.
- `LH_SMOKE_CHAT_ID`: an existing session ID. Also verifies its actual page and
  linked session-scoped manifest. Omission is reported as a skipped session check.

## What passes

- The root page responds with 200 and identifies Learning Harness / LearnHarness.
- Its linked manifest has `display: standalone`, stable root identity, start URL
  and scope. An optional session has its own stable `/chat/<id>` destination.
- Mobile capability, Apple title/status, viewport and touch-icon metadata agree
  with `app/layout.tsx`. Installed Next emits **`mobile-web-app-capable`**; the
  deprecated Apple capability tag is not required.
- The linked icon returns PNG bytes, has the PNG signature and decodes at the
  advertised 180×180 dimensions. Manifest and Apple icon links agree.
- At 375×667, Chromium enters an unsent Home draft, opens **Sessions → Tools →
  Reload preview**, and observes a fresh 200 document at the same URL, a navigation
  of type `reload`, and an empty draft. Tools is development-only; a production
  build cannot pass this preview check.

The browser is fresh, bypasses service workers/cache, and blocks every non-GET/HEAD
request before dispatch, including API writes and server actions. The command
does not send the draft or use learner credentials. Browser cleanup runs on both
success and failure. It prints individual passes/skips and exits nonzero on failure.

HTTP reads consume response bodies under a 10-second combined headers/body deadline
and a 4 MiB limit. Browser navigation/actions have 15-second deadlines, protocol
calls 20 seconds, launch 30 seconds and cleanup 5 seconds before forced termination.
Long-lived app event streams are not used as a navigation-readiness signal.

## Command regression checks

```sh
node --check scripts/smoke-mobile-preview.mjs
node --import tsx --test tests/mobile-preview-command.test.ts
```

These CLI-boundary tests use disposable loopback HTTP servers: missing destination,
503 response, missing headers, and an unfinished response body. They need neither
Chromium nor a running app. The real-UI command above supplies browser acceptance.

Chromium touch emulation does not establish physical iOS/Home Screen acceptance.
Reload resets unsent work. For a first phone installation, use the intended tested
HTTPS URL in **Safari → Share → Add to Home Screen → Open as Web App → Add**;
subsequent revisions at that destination use **Tools → Reload preview**. Tailnet
access and a running host remain necessary. See the existing
[phone handoff](mobile-input-37-handoff.md) for physical-device acceptance status.
