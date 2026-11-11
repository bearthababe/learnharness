# Learning-journey and tutor verification

Status: owner-approved requirements, November 6, 2026. Published locally at the
owner's request. This document does not authorize implementation or execution.

## 1. Starting point

The owner needs to see which learner journeys work, what is missing, and what
evidence supports each claim. Individual engineering checks do not by themselves
establish that a learning workflow works or that its tutor meets expectations.
The missing acceptance contract is a reusable connection between learner stories,
approved expectations, executable checks, and visible outcomes.

Facts checked November 6, 2026, at revision
`6d72ef4c568a4070a158ef8bc4666a7ca538fa33`:

- `package.json:19` defines tests, mobile checks, ticket-workflow checks, linting,
  and type checking. Their presence is not a current passing test result.
- `.agents/skills/prove-learnharness/SKILL.md:8` is an existing permanent verifier
  with affected-flow selection, answer keys, and receipts. Extend it; do not
  create a competing permanent verification skill.
- `docs/verification/mobile-browser-checks.md:15` describes isolated browser
  checks using a faux tutor through the real handler. This provides workflow
  regression evidence, not live subject-accuracy evidence. Its receipt and
  source-identity contract starts at line 48.
- `docs/architecture.md:72` distinguishes successful `probe_done` handoff from
  merely attempting it, and plan visitation from grading. `GLOSSARY.md:48`
  distinguishes learner evidence from subject knowledge and mastery claims.
- `docs/architecture.md:152` documents Electron/server credential ownership.
  Lines 158–164 explain why a fresh data directory is not filesystem or external
  tool isolation. Subscription routes do not fall back to API billing.
- `docs/fork-vision.md:55` describes a source-backed, goal-driven course, not a
  required fixed course/lesson/session hierarchy.

No live tutor evaluation was run during this specification work. Current
whole-app test health, connection readiness, native Electron test configuration,
and physical-device availability were not verified. Do not infer that unavailable
device access means the hardware does not exist, or that an old dependency failure
is a current whole-app failure.

**First implementation task, before code:** re-probe the load-bearing facts,
identify the actual checkout and test environments, and report changed premises.
Set up missing proof environments only within the subsequently authorized work.
Do not use an unrelated running server or the owner's everyday learner profile.

## 2. Goals and non-goals

### Goals

1. Establish reusable, readable Gherkin scenarios executed through Cucumber,
   alongside existing lower-level tests. Connect them to real checks rather than
   a homemade parser or exact transcript comparisons.
2. Maintain a story map spanning: start learning; make progress; return and
   continue; review earlier learning; check understanding on demand; and continue
   toward the goal using learner evidence. Earlier work should remain accessible.
3. Apply the format to one substantial reference journey:
   **goal → prerequisite probing → teaching plan → teaching → incorrect or
   uncertain response → appropriate feedback → retry → close/reopen → continue.**
   Execute supported portions and report missing capabilities honestly; do not
   implement product gaps as part of verification work.
4. Connect each story to stable identifiers, dependencies, relevant tickets,
   approved expectations, executable verification, and evidence. Track product
   availability separately from verification outcomes. Missing capability,
   missing verification, failure, blocked, not run, incomplete, and verified must
   remain distinguishable. Missing automation alone does not prove a product gap.
5. Establish whether the workflow works and whether tutor behavior meets approved
   subject and teaching expectations. Preserve valid alternative conversations.
6. Make verification selective for changed flows, with important residual
   uncertainty handed to the owner for final acceptance rather than repeated
   whole-app walkthroughs on every PR.

### Non-goals

- Prove improved human learning through software checks. A separately authorized
  personal learning/retention pilot is deferred; software acceptance is not an
  efficacy claim.
- Implement missing learning features, introduce a new mastery model, or require
  a fixed course/lesson hierarchy. Visited teaching landmarks are not evidence of
  understanding; session outcomes are not mastery.
- Replace existing lower-level tests, build a large evaluation platform, or fit
  an entire course into a short model run. One bounded exercise does not establish
  statistical robustness.
- Implement the optional visualization in
  [ticket #61](https://github.com/bearthababe/learnharness/issues/61) or in-app
  acceptance guide in
  [ticket #62](https://github.com/bearthababe/learnharness/issues/62). Both are
  deferred references, not prerequisites. Their mockups are illustrative, not
  evidence or an approved reference-course choice.
- Audit the verifier by mutating product code, change production data, copy
  credentials, create a PR, or merge work as part of publishing this spec.

## 3. Constraints

### Acceptance invariants

These identifiers name the confirmed rules to promote during implementation.

| ID | Invariant | Enforcement or detection | Kind |
| --- | --- | --- | --- |
| V-1 | Future stories do not block unrelated work. A story selected for feature implementation has executable verification before feature implementation begins; a pending placeholder is insufficient. | Story selection and implementation entry gate; scenario-resolution check. | Machine plus delivery review |
| V-2 | A partial pass cannot mark an entire intended journey complete. Missing, failed, blocked, not-run, incomplete, and uncertain evidence cannot become a pass. | Scenario aggregation, coverage report, and receipts. | Machine |
| V-3 | Expectations are approved independently of the implementation and are not weakened to make results pass. | Versioned owner-approved sources, keys and rubrics; separate verifier. | Machine/independent verifier; owner approval is human |
| V-4 | Every required tutor expectation passes. A material subject error or required teaching-behavior violation fails the scenario; aggregate scores cannot hide it. Uncertain judgments remain unverified. | Per-expectation tutor verdict and scenario aggregation. | Independent verifier plus machine aggregation |
| V-5 | Data/tool permissions and run caps are enforced, not assumed from an isolated data directory. | Preflight permission checks and runtime admission/accounting. | Machine |
| V-6 | Evidence identifies its candidate, configuration, approved expectations and actual environment without exposing credentials or real learner history. | Receipt validation and source/environment checks. | Machine |
| V-7 | Human acceptance is selective and last, against the otherwise reviewed and verified candidate, before owner-approved merge. | Delivery handoff names important residual uncertainty and affected evidence after changes. | Human constraint |

### Expectations and evaluator independence

The scenario/key author drafts source-backed subject answer keys and tutoring
expectations from existing teaching policy and trusted references. The owner
approves their purpose, sources, provenance and version. The specific subject and
reference-case key are not yet chosen and require approval before the exercise.

A separate verifier evaluates runs against that approved version. Keep grader
keys out of tutor and simulated-learner context, and holdouts out of scenario
development feedback. Historical parity is regression evidence, not subject truth.
Judge the purpose of each turn: a hint, probing question or learner-error response
cannot be assessed solely by checking a final answer.

Before trusting an evaluator, show that it accepts approved good examples and
rejects approved bad examples, including acceptable conversational variation.
Uncertain calibration does not authorize a live accuracy claim or product mutation
testing. The builder judging its own output is not independent verification.

### Actors, permissions and effects

| Actor or process | Allowed role and boundary |
| --- | --- |
| Owner | Approves keys/rubrics, live-run authority, human acceptance and merge; controls evidence sharing/removal. |
| Builder/scenario author | Prepares synthetic cases, drafts expectations and implements the subsequently authorized harness; cannot approve their own keys. |
| Separate verifier/evaluator | Reads approved keys and synthetic evidence; records verdicts without changing expectations or product behavior. |
| Operator/runner | Starts only owned test processes, enforces limits, writes local evidence and stops owned processes. Does not take over other profiles or servers. |
| App server, tutor and tool bridge | Use only approved synthetic resources and permitted teaching tools. Existing credential owners retain credentials; do not copy them into test profiles, browsers or evidence. |
| Evidence custodian | The owner controls retention and publication; the runner has no automatic upload or deletion authority. |

One person can fill multiple roles, but authorship, approval and independent
verification must remain explicit. Identify every runner, server, tutor,
evaluator and tool-bridge process that receives credentials or handles untrusted
input before live execution. New credential access requires owner approval.

The initial live exercise is authorized under the following restrictions, not
as a standing authorization for future PRs:

- Synthetic learner messages and approved fixtures only, using the existing
  normal tutor connection with its configuration recorded.
- Normal teaching, question and planning tools only. No real learning-history
  access, unrelated-local-file access, research/external-action flows, or external
  actions beyond the approved model calls.
- No credential exposure/copying, real sign-in flow, or API-billing fallback.
  Do not infer that the subscription connection has zero cost.
- At most **30 total model requests**, including planning, grading and any retries;
  at most **12 learner turns** and **20 minutes**; **no automatic retries**. These
  are shared limits for the initial exercise, not per-device allowances.
- Prevent dispatch beyond a cap, stop further work at a reached limit, and retain
  partial evidence as **incomplete**, never passed. An execution error is not
  permission to retry or switch providers.

The implementation must show that these limits fit the actual execution path
and that access restrictions are enforceable. A scratch data directory or existing
sensitive-path guard is insufficient. If safe execution cannot be established,
stop and report rather than relax permissions. Generic verification remains
no-live-model by default; future live evaluation needs explicit authorization
until the owner adopts a standing allowance.

Keep synthetic transcripts, screenshots, saved-state checks, metadata and verdicts
in local, git-ignored `.prove-it/runs/` folders. Record the candidate revision and
any dirty-source identity, tutor/evaluator configuration, approved story/key
versions, environment, limits and outcome. Exclude credentials and real learner
history. Preserve evidence and test profiles; no automatic upload or deletion.

### Devices and final human acceptance

Targets are Electron desktop, iPhone Home Screen web app and iPad Home Screen
web app, with separate coverage and results. Native Electron proof requires a
native runtime, not a browser substitute. The desktop OS/runtime configuration
and available physical-device setup still need to be established.

Emulation may satisfy agreed routine checks, but must be named as emulation.
WebKit, a simulator and a physical Home Screen app are not interchangeable
evidence. Unavailable environments are blocked or not run, not failed product
behavior and not a pass.

Do not ask the owner to repeat everything on every PR. Select human checks by
importance and residual uncertainty, especially changed workflows. Explain the
action, expected result and why human/device judgment is needed. There is no
human time or item-count budget. Most unrelated PRs should need no manual device
checks. Perform acceptance last, then ask for merge approval; if the candidate
changes, reassess affected checks. Do not auto-merge.

Replace repetitive manual checks with automation when it genuinely establishes
the same claim. Owner UX judgment and necessary physical-device acceptance remain
human constraints, not automated proof.

### Ordering, stop rules and agent discretion

Create the format, establish approved cases/keys and prerequisites, then exercise
the reference journey and report gaps. For subsequent product stories, establish
executable verification before implementing the feature. Preserve current
lower-level tests and ordinary no-live-model verification; this is an additive
verification lane, not a product or data cutover.

The future entrypoints are story selection, scenario execution, the existing
prover, and the final acceptance handoff. Execution refuses missing approved keys,
missing live authority or unenforceable isolation. The runner owns approved model
dispatch and evidence writes; the owner alone approves publication, deletion and
merge. No new product route, migration or destructive data operation is required.

Stop and ask when expectations, permissions, scope or supported-target policy
need changing. Report missing environments, calibration failure and exhausted
limits rather than silently skipping. A missing product capability is a reported
gap, not authorization to build it.

Left to the implementing agent: step-definition structure, helper organization,
artifact layout and technical adapters within these constraints. Stable story IDs
and the existing receipt convention are approved defaults. Story content must not
depend on the optional visualization or guide interfaces.

**Promote on merge:** in the eventual implementation PR, record V-1 through V-7
in project guidance and record the Gherkin/Cucumber decision as an ADR. Extend the
existing permanent prover rather than introduce another. Publishing this file
does not itself change any skill or delivery policy implementation.

## 4. Proof

**Verifies on:** an identified checkout, synthetic fixture storage, the actual
running learner UI, real handlers and saved records. Use the existing isolated
browser harness for deterministic regression evidence and the explicitly
authorized tutor connection for live tutor evidence. Establish native Electron
and separately identified iPhone/iPad environments before claiming target proof.
Verify fixture seeding, permission boundaries, request accounting and evaluator
calibration before live dispatch. Unavailable prerequisites remain explicit.

| # | Proves | Surface and check | Environment | Pass signal |
| --- | --- | --- | --- | --- |
| 1 | Readable stories have executable verification, V-1. | Inspect story IDs, dependencies, expectation versions and Cucumber step resolution; try a selected story with no executable check. | Catalog and runner. | Required scenarios resolve; missing verification is visible and prevents feature implementation. |
| 2 | Workflow transitions work. | Drive the learner UI through supported reference-journey steps; compare real handler results and saved records with approved expectations. Check successful `probe_done`, not just a call attempt. | Identified app with synthetic fixtures. | Every required transition and saved result matches; gaps remain visible. |
| 3 | Return preserves useful continuity. | Close/reopen and inspect previous work, position, unresolved difficulties and corresponding saved records. | Same identified app/test profile. | Approved continuity expectations pass. Reopen alone makes no cross-process durability claim. |
| 4 | Tutor behavior and subject accuracy meet V-3/V-4. | Calibrate the separate evaluator on approved good/bad cases, then evaluate actual multi-turn outputs against approved turn-purpose keys. | Authorized live exercise and separate verifier. | Calibration succeeds and every required expectation passes; uncertainty is unverified. |
| 5 | Assessment evidence is not confused with mastery. | Exercise an incorrect/uncertain learner response, feedback and retry; inspect actual grading ownership and saved learner evidence. | UI, handler and records. | Correct handling can pass despite learner error; visited position, assisted success and independent performance are not conflated. |
| 6 | Reporting is truthful, V-2/V-6. | Exercise controlled pass, failure, missing-capability, missing-verification, blocked, not-run, uncertain and capped outcomes; inspect the coverage report and receipt. | Runner/report fixtures, without product mutation. | Correct statuses, candidate/key/environment identity and retained partial evidence; no silent skip or false whole-journey pass. |
| 7 | Access and limits hold, V-5. | Check process/tool authority before dispatch; exercise refusal without live permission and boundary accounting at the approved caps using controlled runner inputs. | Isolated harness plus authorized connection only when permitted. | No out-of-scope access, fallback or excess dispatch; unsafe setup blocks; cap termination is incomplete. |
| 8 | Target-specific behavior has accurately scoped evidence. | Exercise selected affected flows in native Electron and separately identified iPhone/iPad environments; record whether each is emulated, simulated or physical. | Established target environments. | Required selected checks pass on their named surface; unavailable targets are never relabeled passed. |

Select required checks explicitly for each delivery's affected scope. All required
checks must pass before merge; a waived, blocked or uncertain check is not a pass.
Future stories outside that scope do not block unrelated work. The first
verification delivery may honestly report product gaps in the reference journey
without fixing them, but cannot claim that journey is complete. Verify the report
and supported portions without redefining missing behavior as success.

The final owner acceptance handoff follows V-7 after machine/independent checks;
it does not count as machine proof. No after-deploy campaign, universal per-PR
device matrix or standing live-evaluation allowance is introduced by this spec.
