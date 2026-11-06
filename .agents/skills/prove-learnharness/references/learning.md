# Learning-story verification

The primary surface is the learner web UI. The added verification surface is a
Cucumber CLI, with real handlers, tool execution and JSON storage behind a
scripted faux provider. Existing tests remain in place. No product tool is
patched for these checks; only the copied fixture's chat route injects the model
and a restricted probe/plan tool registry. Its automatic handoff callback does
nothing: successful `probe_done` results are checked, automatic wake is not.

## Exact drives

1. `npm run verify:learning -- list` lists the seven stable story IDs, dependencies,
   expectations and separate availability/verification states.
2. `npm run test:learning` checks report aggregation, resolution, selection,
   refusal and controlled cap boundaries against the approved spec.
3. `CHROMIUM_PATH=/usr/bin/chromium npm run verify:learning -- run` dry-runs
   Cucumber resolution then executes LJ-START, LJ-PROGRESS and LJ-RETURN through
   an owned application, mobile-viewport Chromium, real handlers and saved files.
   No live connection is contacted. Compare before/after records and screenshots,
   successful tool results, distinct attempts and unchanged history after reopen.
4. `npm run verify:learning -- select LJ-REVIEW` must exit nonzero: missing
   verification cannot open a feature implementation gate. Unknown IDs and
   `select LJ-TUTOR` must also refuse. `select LJ-RETURN` resolves and executes
   its dependency scenarios; undefined, pending or failing checks cannot pass.
5. `npm run verify:learning -- run --live` must exit nonzero with status blocked,
   zero model requests and no credential access. The subject/key and calibration
   are not approved, and no permission-enforced live adapter is implemented.

Run folders are printed and retained under `.prove-it/runs/`. `result.json` names
the candidate, dirty application fingerprint, verification fingerprint, approved
spec hash, selected stories, target and outcomes. `coverage.md` shows what is and
is not covered. `instance.json` identifies the owned application/process;
`browser.json` labels Chromium viewport emulation. `cleanup.json` records cleanup.
Confirm the recorded PID/process identity and loopback listener are gone; confirm
screenshots and stored synthetic history remain. Never stop unrelated listeners.

## Meaning of a pass

The workflow slice is goal → successful probe result → validated plan → scripted
teaching → uncertain response → scripted feedback → retry → close/reopen → message
continuation. This is not proof of subject accuracy, appropriate feedback, real
assessment ownership, adaptation to evidence, or cross-process durability.
Availability unknown is not missing capability. Missing automation does not prove
a product gap. Missing, failed, blocked, not-run, incomplete and uncertain outcomes
remain visible; one required non-pass prevents a whole-journey verified result.

The spec's V-1–V-7 and existing architecture contracts are the answer keys, not
the scripted prose. Approved subject keys, evaluator calibration on approved
good/bad/variant examples, a permission-enforced model/tool path and separately
authorized connection are prerequisites for a future live adapter. Generic proof
stays no-live. The 30-request/12-turn/20-minute accounting tests are not evidence
that a real provider path enforces those caps. No credentials are read or copied.

Required device acceptance is selected by affected risk. Record actual native
Electron, emulated, simulated and physical iPhone/iPad Home Screen coverage
separately. A missing runtime blocks only the claim requiring it, not unrelated
verification-harness work. Owner UX/device acceptance is last, followed by merge
approval; full-stop keeps the PR open and unmerged.
