# Ticket #39 — HTTPS launch and reload evidence

Verified 2026-11-04 against `integration/mobile-input-39` at `5aefba9`, using a
disposable chat/store and the actual Next development app. These checks concern
the existing launch/reload paths; changes to those paths require revalidation.

## Preview coordination

- Slot 1 (`3000` / HTTPS `8444`) was serving the notebook integration and was left
  running throughout.
- The owner authorized temporarily pausing the older lesson-navigation preview
  on slot 2 (`3001` / HTTPS `8445`). Its exact command, working directory and
  environment were retained privately for restoration.
- The ticket branch ran on `127.0.0.1:3001`, through the existing tailnet-only
  `https://thinkpad.tailfd9bf6.ts.net:8445` mapping. No Tailscale mappings changed.
- After checking, the ticket server was stopped and the previous slot-2 preview
  restored. HTTPS returned HTTP 200 and its original **Forma — Learning workbench**
  page. **Slot 2 is no longer a preview of this ticket branch.**

## Passed checks

Real HTTPS requests returned **200** for:

- `/`
- `/chat/chat_mw25nuin_69e16cb0` (disposable acceptance fixture)
- `/manifest.webmanifest`
- `/chat/chat_mw25nuin_69e16cb0/manifest.webmanifest`
- `/writing-touch-icon.png` (nonempty PNG response)

Both manifests retained `display: standalone`, stable identity/start URL, and
their existing root/session scopes. Browser checks found the framework-generated
mobile-web-app capability metadata, Apple title/status-bar metadata and touch
icon link.

At a 375×667 touch-emulated viewport, the real **Sessions → Tools → Reload
preview** control performed a new document/network navigation. The deliberately
unsent draft reset. Previously saved conversation content remained visible and
the persisted messages returned by the real API were unchanged. No service worker
or offline caching was added.

## Reproduction artifacts and limits

Local artifacts are under `/home/bjorn/.cache/opencode/issue39/`:
`check-https.mjs`, `seed-preview.ts`, `https-check.log`, `https-server.log`, and
`restored-slot2-headers.txt`. The check used system Chromium through
`puppeteer-core`, real app routes, and an isolated `LH_DATA_DIR`/`LH_AUTH_FILE`.
No learner records or credentials were used.

These are browser and HTTP checks, not physical iPhone acceptance. Physical
keyboard/safe-area/gesture behavior, VoiceOver, actual microphone use and the
seated learning trial remain **#42**. Once an intended app preview is available,
the one-time owner installation step remains **Safari → Share → Add to Home
Screen → Open as Web App → Add**; this temporary slot was not a new installation
destination. Tailnet access and an awake host remain required.
