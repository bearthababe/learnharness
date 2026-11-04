# Mobile learning UI — accepted direction and integration plan

**2026-11-04 · B accepted as a first prototype iteration; Q1–Q7 and the combined
mobile-input scope confirmed. Owner requested a specification; implementation
remains paused.** See the [mobile input spec](mobile-learning-ui-spec.md).
Published as [spec issue #37](https://github.com/bearthababe/learnharness/issues/37).

## Goal

Make a real seated learning session usable on iPhone, including reading context,
typing, speaking an answer, reviewing working and returning to a saved session.
Start with the Home Screen web app. Follow the [approved fork vision](fork-vision.md):
retain conversation-led learning and reduce the effort of starting and continuing.

Owner constraint: **“Don’t remove stuff and design for something not there.”**
Preserve existing capabilities while improving their phone presentation.

## Accepted design

The owner prefers **B, context-led**, including its tighter spacing, and selected
the combined composer “as a first iteration.” They subsequently called it
“good enough for now.”

```text
[＋] [ expanding draft                         🎙 ] [Send]
       Plan          Model · thinking          Usage
```

- Keep the plus, field and separate Send on one horizontal row. The microphone
  sits inside the field at its right edge and stays available with an existing draft.
- Small visible icons retain 44×44 CSS-pixel action targets. The implemented
  study uses an 18px plus, 20px microphone and 54px empty field.
- The multiline field grows with the answer, then scrolls within a bounded height.
- While recording, preserve the draft and temporarily show elapsed time, audio
  bars, Cancel and Stop inside the field. Keep the attachment plus accessible.
- Stop finalizes and appends the transcript; Cancel discards this recording,
  preserving the existing draft. Keep the grown field's height stable and restore
  draft selection/internal scroll on cancellation.
- Keep Plan, model/thinking and usage directly beneath the combined row.
- Carry forward B's compact context header and contextual supporting panels as
  the preferred presentation direction. Actual production content must fit before
  exact panel layouts can be adopted.

Already approved and implemented in the main phone UI:

- App-wide Home Screen launch and Tools → Reload preview.
- Full-width Sessions navigation with a separate desktop sidebar preference.
- Home / Sessions / Close header; Teaching / Practice / Drill creation row;
  full-width search, inherited filter, readable session list and compact footer.
- Two-row Home toolbar: navigation and node search, then Chains, Import notes
  and graph settings.
- Safe-area handling and contained scrolling; hide Concepts setup on phones
  while retaining pending-image review.

### Latest phone feedback

The owner reported a malformed button arrangement and supplied a screenshot.
A fresh HTTPS browser load showed the intended horizontal composer; after being
asked to use Tools → Reload preview, the owner confirmed **“No it’s fine.”**
No source correction was made for that report. Retained styles were a hypothesis,
not an established cause. This confirms that the reported arrangement is no
longer blocking review; it is not acceptance of every physical iOS interaction.

## Baseline, gap and smallest integration

These references describe the inspected current working tree and inherited
behavior, not a new audit against a pinned external upstream release.

| Area | Existing behavior and source | Gap and proposed integration | Compatibility requirement |
|---|---|---|---|
| Answer composition | [`components/composer.tsx`](../components/composer.tsx) already grows the input; [`components/chat.tsx`](../components/chat.tsx) supplies dictation and submission. The phone correction gives dictation its own row. | Apply B's compact arrangement to real answer entry to recover reading space. | Reuse the existing editor/submission behavior and real attachment review. |
| Speech | [`components/dictation.tsx`](../components/dictation.tsx) owns capture, deferred transcription, level feedback, Stop, Cancel and finalization. | Present its actual state and level signal inside the compact field. | Keep the existing recognition path and ownership/cleanup semantics. |
| Teaching questions | [`components/question-dock.tsx`](../components/question-dock.tsx) can claim the primary dictation target and finish speech before submitting. | Resolve how the compact UI identifies and accompanies that real target. The study renders text excerpts, not these forms. | Preserve question types, answer controls, target routing and finish-before-send. |
| Supporting controls | [`components/model-picker.tsx`](../components/model-picker.tsx), [`components/stats-bar.tsx`](../components/stats-bar.tsx) and [`components/settings/settings-dialog.tsx`](../components/settings/settings-dialog.tsx) provide real controls/content. | Fit real Plan / Model / Usage and supporting tasks to the preferred phone presentation. | Preserve options and capabilities; illustrative prototype content is not a replacement. |
| Phone scrolling | [`components/use-mobile-chat-focus.ts`](../components/use-mobile-chat-focus.ts) and [`components/use-phone-viewport.ts`](../components/use-phone-viewport.ts) handle focus/viewport behavior. | Carry the accepted behavior through the compact integration. | Only chat history and multiline input scroll while focused; outer page/header stay stationary, composer remains above keyboard, pinch zoom remains available. |

Prefer bounded presentation changes and small integration hooks so upstream
updates remain practical. Inspect concurrent changes before editing shared files.

## Proposed next phase

1. **Resolve the real-answer states.** Inspect the actual teaching/question flow
   alongside the preferred composer. Present the remaining differences below to
   the owner, one decision at a time, with baseline behavior and the smallest change.
2. **Approve a mechanical implementation plan.** Name the affected components,
   responsive scope, state presentations and verification cases. Preserve a source
   reference to the accepted prototype before integration begins.
3. **Integrate the real phone learning flow.** Implement the approved presentation
   using existing editor, dictation, question and attachment behavior. Use real
   input-level feedback and real Plan / Model / Usage content.
4. **Verify and learn through use.** Run targeted regressions, then complete a
   seated Hydraulics learning session on the actual iPhone. Use concrete friction
   observed there to scope further Settings, Chains and header/menu refinements.

### Interview outcome and implementation boundary

The presentation questions discussed in Q1–Q7 below have owner decisions:
consistent phone inputs, persistent input during question collapse, safe reveal,
the bounded handwriting menu, speech-state feedback and existing supporting panels.
The owner confirmed the combined scope and requested the detailed implementation
spec. Implementation remains paused.

Carry inherited behavior forward in that spec: preserve each field's dictation
ownership, actual submit eligibility and finish-before-send paths. Do not copy
the simulation's blanket disabled-during-recording Send restriction or silently
harmonize the audited differences between question/practice submission paths.
Use the existing phone breakpoint and keep real panel content/options. New
concrete conflicts found during specification must be surfaced, not guessed.

### Interview baseline checks

The real-input audit before the Q3 correction found these qualifications. They
are baseline observations, not newly selected policies; Q3 records the subsequent
approved reveal change:

- A pending question **replaces** the generic composer. Free-text questions own
  **Your answer**; selection questions own **Your thinking**, alongside options,
  Other where applicable, and confidence where applicable. Dictation follows that
  claim, not whichever text field has keyboard focus
  (`components/question-dock.tsx:347–395`, `components/dictation.tsx:193–232`).
- Collapsing a question hides its form but retains its dictation claim. The current
  separate dictation bar remains accessible. Moving it inside the field therefore
  needs an explicit collapsed-state design (`components/question-dock.tsx:159–173`,
  `components/chat.tsx:2456–2466`).
- Before a teaching check is first revealed, **Thinking while reading** owns
  dictation. After reveal, that field can remain visible but the question owns
  dictation. Direct-button reveal and keyboard reveal currently differ in whether
  they finish speech first (`components/chat.tsx:2242–2275,2393–2427`).
  Provenance checked against local `upstream/main` at
  `8f6fd7cd299e4f6f426d9f2cf333531bf1e1454c` (fetched 2026-10-27): both
  paths are inherited. Upstream commit
  `9007e6eb7a0feb9f349b7e706e4495ce22b3dfb6` introduced finish-before-open
  for the dedicated Enter paths; direct button activation still bypasses it.
  These paths are unchanged through fork HEAD `8695716` and the inspected
  working tree. Today's remote upstream was not queried.
- Finish-before-send is not uniform: the generic composer permits it with an empty
  draft, but a question must already satisfy its submit gate; empty text-only
  questions normally require Stop first. The practice submission path currently
  does not call `finishDictation()` (`components/chat.tsx:762–763`,
  `components/question-dock.tsx:377–395`, `components/practice-dock.tsx:54–78`).
  Any harmonization needs a separately explained correction and owner decision.
- B's plus opens a simulated file picker. The inspected real shared-writing UI
  provides pending-image review and an external upload URL; it has no equivalent
  generic file-picker plus to relocate. Its production action and supported inputs
  need selection (`components/shared-writing.tsx:93–124`).

### Interview decisions

**Q1 — approved:** apply B's compact input treatment to the question's existing
**Your answer** or **Your thinking** field, with in-field dictation and the separate
question-submit action beside it. Retain the question, choices, Other and confidence
where applicable, and preserve existing answer payloads and dictation ownership.
This extends the selected presentation to real teaching questions; it does not
select new submission gates or change which field receives speech.

**Q2 — approved:** when an already-revealed question collapses while the learner
scrolls back through the conversation, keep its compact answer/thinking field,
dictation and submit action visible. Collapse the question content and its other
controls; reopening restores access to choices and confidence. Preserve the draft,
question ownership and existing submit eligibility. This changes the inherited
whole-form collapse presentation. It does not reveal a previously unrevealed check.

**Q3 — approved and implemented, 2026-11-04:** after clarification of the inherited
keyboard/tap difference, the owner approved making the reveal button finish
dictation into **Thinking while reading** before showing the question. The owner
also approved verifying through the real browser button and reading/answer fields
with simulated speech, without submitting an answer.

The pending-reveal button in `components/chat.tsx` now awaits the existing
`finishDictation()` before changing the question's reveal state, retaining the
reading field's dictation claim through finalization. This also covers native
keyboard activation of that button. Reopening an already-revealed collapsed
question keeps its existing button behavior. This is a bounded, explicitly
approved correction to the upstream snapshot described above; broader B
integration remains pending.

[`scripts/smoke-question-reveal.mjs`](../scripts/smoke-question-reveal.mjs) reproduced
the failure before the correction: tapping Reveal did not request finalization.
After the correction it passed against the real HTTPS learning route at a
375×667 touch-emulated viewport: capture tracks stopped, the question stayed
closed while waiting, early and late transcript fragments appended once to
existing reading thoughts, and the revealed answer field remained empty.
API writes were blocked and speech responses were simulated. Typecheck and
`components/chat.tsx` ESLint passed. Actual iPhone microphone acceptance remains
separate from this browser check.

```sh
LH_SMOKE_CHAT_ID=<session-with-waiting-teaching-check> \
LH_SMOKE_URL=https://thinkpad.tailfd9bf6.ts.net:8444 \
node scripts/smoke-question-reveal.mjs
```

**Q4 — owner direction, 2026-11-04:** inspect today's working attachment
capabilities before choosing the first plus-menu scope. The owner wants images
and PDF functionality (possibly through **Attach a file**), but does not assume
the current PDF path works from a phone. Keep the menu extensible as capabilities
are added; expose only usable actions, without unsupported placeholder options.
This is a direction and an investigation request, not approval of upload formats,
menu wording or a new file-handling implementation.

**Q4 follow-up — approved delivery constraint, 2026-11-04:** after the capability
audit, the owner selected only currently working attachment actions for the first
plus menu and explicitly requested ticket tracking for photo/other attachment
integration, including phone PDFs. No unsupported action or nonfunctional
placeholder should be exposed. This does not turn the existing PNG receiver into
a general camera/photo/PDF picker; those missing connections are follow-up work.
The initial menu item is selected in the subsequent decision below.

**Q4 refinement — automatic arrival updates, 2026-11-04:** the owner rejected the
proposed **Check for writing** menu action. New handwriting previews must appear
automatically; users should not manually refresh a list to discover uploads.
Do not include that routine refresh control in the mobile plus menu or review UI.
This supersedes the interview recommendation to expose it as a working action.

The existing implementation already supplies the required mechanism:
- After storing an upload, `src/server/shared-writing.ts` emits `writing-changed`
  with the session ID.
- `useSharedWriting` in `components/shared-writing.tsx` subscribes to that event
  and reloads the pending images for the matching session. It also refreshes on
  mount, return to a visible/focused app, record/turn changes and channel resync.
- `components/server-events.tsx` shares one `EventSource("/api/events")` per
  window and triggers resync callbacks on every connection/reconnection.

Carry this existing event-driven behavior into the mobile presentation. No missing
notification infrastructure was found in the source audit, so no infrastructure
ticket is needed now. Acceptance must check upload arrival from another client,
reconnect and return from background without a refresh tap; preview appearance
must not send the image to the tutor. This inspection did not perform a new
physical-device arrival test. The old Concepts setup UI still contains its manual
control; this round changes the plan, not production UI. An empty or redundant
plus menu is not justified merely to preserve the prototype's placeholder action.

**Q4 menu selection — planning only, 2026-11-04:** the owner selected one initial
plus-menu item: **Attach handwriting**, using the existing uploaded-handwriting
capability. New uploads continue to appear automatically, with review before
deliberate Send; this item does not authorize a new camera, photo/file picker or
PDF upload path. Other plus-menu integrations remain deferred to the linked
follow-ups. The handwriting item may be removed later if it is no longer useful.
The owner explicitly instructed that this decision be recorded in the plan only:
**do not implement anything yet.**

Recorded in suitable existing tickets:
- [#5 — phone photo/image integration](https://github.com/bearthababe/learnharness/issues/5#issuecomment-6627142766):
  picker/camera connection, supported formats, original preservation, pending review
  and explicit Send, error/removal behavior and phone acceptance.
- [#36 — supplied-material integration, phone PDF entry point](https://github.com/bearthababe/learnharness/issues/36#issuecomment-6627142724):
  phone file selection, upload, retained original and conversation handoff to the
  existing PDF reader; distinguish reference material from learner working.

These comments preserve the existing tickets' broader scope and do not grant
implementation approval. No attachment-menu implementation was made in this round.

#### Attachment capability verification, 2026-11-04

| Capability | Verified current state | Consequence for the plus menu |
|---|---|---|
| Reviewed handwriting | Raw PNG upload, up to 25 MiB, persists original bytes; review before explicit Send; real image-reading tool delivers bytes to the model. Existing entry points are Concepts/Shortcut and the development notebook's snapshot. | Reuse this review/submission behavior. A phone picker/camera entry point still needs implementation. |
| Ordinary phone photos | The host image reader recognizes JPEG, PNG, GIF, WebP and BMP, but the upload receiver accepts PNG only. No production chat camera or file picker was found; HEIC is not in the reader's format map. | A working **photo/image** action requires format handling as well as a picker; do not advertise all phone photos as supported yet. |
| PDFs on the host | The tutor can dispatch a PDF-reading job by host file path. Real tools extract/search text and render pages to PNG; the specialist returns a page-cited brief. | PDF processing exists. A phone's local file path does not make the PDF available to the host. |
| PDFs from the web | Researcher can download a PDF, inspect/extract/search text in a temporary per-job directory. That research path has no page-render tool and is distinct from the visual PDF reader. | Existing URL research is not an implemented phone attachment action. |
| Phone PDF attachment | No picker → upload → retained file → tutor handoff path exists. The PNG receiver rejects PDFs. | **Attach file (PDF)** needs that connection before appearing as a usable menu action. |
| Home Import notes | Existing Markdown/text chooser posts text to graph extraction. | It is not a PDF importer or a conversation-attachment flow. |

Sources: `src/server/shared-writing.ts`, `components/shared-writing.tsx`,
`components/notebook-prototype.tsx`, `src/agent/tools/read.ts`,
`src/agent/tools/jobs.ts`, `src/agent/tools/pdf-read.ts`,
`src/agent/subagents/pdf-reader.ts`, `src/agent/subagents/runner.ts`,
`components/minimal-home.tsx`, and `app/api/graph/import/route.ts`.

Verification: **4/4 shared-writing tests and 20/20 PDF tests passed** with isolated
temporary data/auth paths and scripted model responses. PDF parser/text operations
and native page rendering ran for real; HTTP PDF downloads and model decisions
were simulated. This establishes working local processing and PNG submission,
not live-model interpretation quality or physical iPhone file/camera behavior.
Files: `tests/shared-writing.test.ts`, `tests/researcher-pdf.test.ts`,
`tests/pdf-reader.test.ts`, `tests/pdf-native-render.test.ts`.

Design guidance, pending selection: a small plus menu can eventually provide
**Photo/image** and **Attach file** using these existing processing capabilities.
Each action must be delivered end-to-end before exposure; a generic file action
must accurately limit accepted formats. The missing PDF work is file acquisition,
retention and conversation integration, not inventing a PDF reader. The owner
subsequently deferred these missing connections to the follow-ups linked above;
they are not exposed as working actions in the initial menu.

**Q5 — approved presentation scope, 2026-11-04:** use the same compact learning-input
interface across ordinary conversation, teaching-question answers/thinking,
**Thinking while reading**, and practice answers/thinking. The owner explicitly
included reading thoughts and practice to avoid confusing differences between
surfaces. This revision is **phone/mobile-layout only**, carrying forward the
existing phone breakpoint; it is not an app-wide desktop or iPad layout redesign.

Consistency concerns the input presentation and recording controls, not a new
submission policy. Carry forward each surface's actual purpose and actions:
reading thoughts are retained for the check and Reveal opens that check; practice
uses its existing thinking/answer submission. Preserve dictation ownership and
the distinction between reading thoughts and question answers. The previously
audited practice finish-before-submit difference is not silently changed by this
visual decision. Planning only; no implementation is authorized by this answer.

**Q6 — approved:** show dictation connection/finishing status inside the compact
input. Show readable errors immediately above it, with the existing Retry or
Settings action as appropriate. Use this arrangement consistently across the
phone learning-input surfaces, preserving the draft and existing speech behavior.
Plan / Model / Usage remain directly below the input. This replaces reliance on
a truncated error and hover tooltip in the phone presentation.

**Q7 — approved:** Plan / Model / Usage use the existing real panels in the first
mobile input update. Their agreed placement is directly below the compact input.
Check that these panels remain usable on the phone; broader panel and Settings
redesign is deferred. Do not substitute the prototype's illustrative options or
content for real functionality.

**Combined scope confirmed:** the owner answered “Yes, write the spec,” explicitly
keeping implementation paused. They also approved the real learning UI as the
main verification boundary: controlled speech/uploads in browser checks, visible
behavior and saved/submitted results, followed by separate actual-iPhone acceptance.
The [specification](mobile-learning-ui-spec.md) synthesizes Q1–Q7 and these checks.

## Acceptance for the real integration

- Home → Sessions → saved conversation → typed/spoken answer → tutor response
  works with the real teaching/question controls, attachments and history.
- Long answers grow and scroll; control targets remain reachable at 320/375/430px
  widths, with larger text and keyboard-sized viewports.
- Stop appends once; Cancel preserves prior typed work; finalization/cancellation
  races and navigation cannot append into the wrong input or session.
- Deliberate finish-before-send remains correct; recording Stop and tutor-generation
  Stop remain distinct actions.
- Plan / Model / Usage remain directly available below the field, with real content.
- Physical iPhone review covers keyboard clearance, safe areas, history/input edge
  gestures, stationary header/backdrop, focus/modal release, pinch zoom, VoiceOver
  and actual microphone use. Browser emulation is supporting evidence, not iOS proof.
- Check the actual HTTPS page, manifest, icon and Reload preview behavior. Reload
  resets unsent local work; saved learning history persists.

Existing browser regression: [`scripts/smoke-mobile-layout.mjs`](../scripts/smoke-mobile-layout.mjs).
The [prototype README](../app/prototype/mobile-ui/README.md) records additional
state/geometry checks and the measured 62px reading-space gain at 375×550px.

## Preview, evidence and scope boundaries

- [Preferred B preview](https://thinkpad.tailfd9bf6.ts.net:8444/prototype/mobile-ui?variant=B)
  uses LearnHarness's existing slot 1, localhost 3000. Keep this URL stable.
- [Real learning app](https://thinkpad.tailfd9bf6.ts.net:8444/) has its own app-wide
  launcher. Prototype speech/send are simulated; file selection does not upload,
  and contextual examples do not represent complete production functionality.
- **Tools → Reload preview** loads updates and clears prototype drafts, simulated
  answers and local choices. The prototype manifest currently launches A; B is
  selectable in the comparison bar. Changing that launch default is not selected here.
- Home Screen installation: **Safari → Share → Add to Home Screen → Open as Web
  App → Add**. Tailnet access and a running host are required.
- Preserve earlier source refs listed in the prototype README.
- iPad notebook/question-width/context layout belongs to the separate iPad session;
  its screenshot and findings were handed over there, with layout choices still open.
- Walking/headphones, silent public use and phone-plus-paper remain future contexts.
  Native iOS delivery remains undecided.

Supporting records:
[trial history](research/iphone-home-screen-trial.md),
[mobile UI evidence](research/mobile-ui-design-guidelines.md),
[compact-composer evidence](research/compact-voice-composer-evidence.md), and
[prototype source and verification](../app/prototype/mobile-ui/README.md).
