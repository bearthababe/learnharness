# Spec: consistent phone learning inputs

Published specification: [GitHub issue #37](https://github.com/bearthababe/learnharness/issues/37).

**Owner-confirmed scope and verification approach: 2026-11-04.**
This specification records the agreed first mobile input update. The owner
authorized implementation of #39–41 on 2026-11-04 and approved the implementation
sequence and real-UI verification boundary. Physical-iPhone acceptance remains #42.

**Later owner revisions (2026-11-04) supersede conflicting details below:**

- Omit the plus/attachment menu for this delivery. Photo upload remains #5;
  file/PDF upload remains #36. An app-image library has no established use case
  for this update. Preserve automatic uploaded-image review, enlargement and
  deliberate Send, including existing session-local canvas snapshots.
- Keep the compact text field, in-field microphone and separate applicable action.
  The former plus sizing/menu stories below are historical, not acceptance gates.
- Constrain the existing Model and Usage panels to fit the phone viewport while
  retaining all their content/options. The owner explicitly approved these fit
  corrections after the real model panel overflowed at 320px.
- Preserve and commit the accepted mobile groundwork as the prerequisite baseline;
  keep the separate iPad prototype and research work outside these commits.
- After review, the owner chose to keep practice/drill thinking inputs visible
  when scrolling collapses the problem statement, just like teaching inputs.
  Retain the mounted draft and recording feedback through collapse/reopen;
  preserve existing practice submission rules and wide-layout presentation.

Decision record: [implementation authorization and attachment scope](https://github.com/bearthababe/learnharness/issues/37#issuecomment-6629353085).
The separately approved Reveal/dictation correction is already implemented.

### Phone supporting panels — owner-selected acceptance correction

**Superseding owner revision (2026-11-04):** after trying the implementation,
the owner rejected the Usage/Model sheets and approved **“Do both”**: restore
Usage's earlier smaller anchored popup and give Model the compact floating-menu
presentation used by the reasoning/thinking-level control. Reuse the inherited
rounded border, card background, padding, shadow and model rows. On phones,
Model opens with search unfocused; an explicit search tap opens the keyboard.
Fit the popup and its scrollable results to the visual viewport, including offset
changes, so search and options remain reachable. Retain outside-tap, trigger and
Escape dismissal, real settings semantics, drafts and reading position. Desktop
search focus remains inherited. Plan retains the full-screen/touch direction.
The sheet description below records the previous selection, superseded for
Usage/Model by this revision. Physical-iPhone acceptance is still required.

**Focused-search refinement — owner approved after the compact trial:** the
compact appearance is good overall, but while phone search is active the card
must attach to the visible area's lower edge above iPhone keyboard/accessory
controls. Cover the composer and model/thinking/Usage controls instead of reserving
space for them. Keep the whole rounded card visible, shrinking its results area
as needed; show search and results, hiding the explanatory footer while searching.
Return to trigger anchoring when search loses focus. A result tap must still
select the intended model without the card moving away between pointerdown and
click. Retain the initial unfocused compact presentation and inherited desktop
behavior. Physical iPhone confirmation of the native-control boundary is required.

**Keyboard-dismiss affordance — owner approved:** show a keyboard-dismiss icon
beside focused phone search. It dismisses the software keyboard and returns
non-input focus to the still-open picker, preserving query/results and expanding
the browsing space as the visual viewport grows. It does not pick a model or
close the menu. Tapping search resumes typing. Use the accessible label “Hide
keyboard” and a 44px target. The owner selected the icon instead of a Done label.

**Coordinated motion and separation — owner approved 2026-11-05:** phone Model,
Thinking and Usage use the existing confirmation dialog's dim/light-blur backdrop.
Keep the lesson at its opening geometry and inactive while the card is open;
outside taps dismiss the card. The model card's geometry, search-row width and
footer reveal follow one visible-viewport update, rather than switching layout
on blur and then resizing again. Read viewport geometry while the card is open
to cover updates between browser notifications. As the keyboard closes, reveal
the anchored browsing position in that same motion. Preserve query/results,
model semantics, drafts and reading position; release the backdrop/background
hold on dismissal and wide-layout transitions. Physical iOS timing must be
confirmed separately from controlled intermediate-frame browser checks.

**Blur-only and opener-linked entrance — owner approved 2026-11-05:** subsequent
physical feedback supersedes the dimming above. Keep the light background blur
without a coloured/dark overlay. The active card's own opener stays sharp and
visible at its original position, with its existing close-toggle meaning. Keep
the surrounding lesson inactive. Outside taps dismiss only after the complete
gesture, so their release cannot activate or reopen a control underneath;
cancelled gestures leave the card open. Model, Thinking and Usage rise from their
own opener into place over the existing 160ms easing/timing, rather than appearing
instantly. Skip this entrance with reduced motion; viewport changes interrupt
entrance motion so keyboard geometry remains coordinated. Preserve search state,
stationary lesson, compact placement and the inherited desktop behavior.

During #42 acceptance, the owner rejected the cluttered floating Usage panel and
the model picker hidden behind the keyboard, and requested touch interaction for
Plan. After comparing the prototype at `prototype/mobile-panel-options` (`8c2b7a9`),
the owner selected and then asked to proceed with:

- **Plan:** an opaque full-screen phone overlay, top-right Close (44×44px), with
  pinch zoom and one-finger pan. Retain the existing fit floor, zoom ceiling,
  buttons and live plan/status content. Future Plan additions are separate work.
- **Usage and Model:** tall bottom sheets over a strongly dimmed lesson, with
  stationary top-right Close controls. Preserve actual information, options and
  model-selection semantics. Search continues to receive focus on opening Model.
- **Keyboard attachment:** Model's lower edge follows the visible viewport's
  bottom, directly above the keyboard; the sheet can use the remaining visible
  height. Search and Close remain visible, with results scrolling internally.
  Follow visual-viewport resize and offset changes rather than relying on
  `innerHeight` or whole-window resize. Dismissal retains draft/reading position.

This bounded phone correction supersedes the existing-panel-presentation
restriction below for these three surfaces. The inherited desktop presentation,
thinking-level menu and backend contracts remain the baseline. Native modal
focus/background containment and the existing one-Escape dismissal rule apply.
Verify visual-only keyboard resize/offsets, list reachability, pinch/pan and modal
cleanup, then return to physical-iPhone acceptance. Canonical observations and
verification: [mobile learning UI record](mobile-learning-ui-verification.md).

## Problem Statement

The learner wants to study on an iPhone while seated and comfortable speaking.
Separate text and dictation rows consume reading space, and different input
arrangements across conversation, teaching checks and practice make the interface
harder to learn. Reading earlier context should not take away the place to answer.
Small or hover-dependent status messages make speech problems hard to understand
on a phone.

The selected mobile prototype demonstrates a preferred compact arrangement but
simulates speech, submission and attachments. Its illustrative panels do not
represent the app's full teaching, practice or model controls. Integration must
retain real capabilities and avoid advertising phone attachments that do not work.

## Solution

Use the owner-selected B input arrangement consistently across phone learning
surfaces: a small leading plus, a growing text field with dictation at its right
edge, and the surface's applicable action beside it. Keep Plan, model/thinking
and usage directly below. Preserve each surface's purpose and existing behavior.

Keep the learner's input available when an already-revealed question collapses
while they read earlier conversation. Show recording, connection and finalization
feedback inside the input, with readable errors above it. Initially the plus menu
contains only **Attach handwriting**, using the existing uploaded-handwriting
capability with automatic arrival updates and review before deliberate Send.

Use the existing real supporting panels for this delivery. Apply the revision
only to the existing phone layout, preserving the separate desktop/iPad work.

## User Stories

1. As a phone learner, I want more room to read the tutor's explanation, so that input controls do not dominate the screen.
2. As a phone learner, I want the same compact input arrangement in ordinary conversation, teaching questions, reading thoughts and practice, so that I do not relearn controls between activities.
3. As a phone learner, I want my answer field to grow for a substantial explanation, so that compactness does not restrict my reasoning.
4. As a phone learner, I want a long draft to scroll inside its field, so that I can edit it while keeping the surrounding interface stable.
5. As a phone learner, I want a microphone available even when I have typed text, so that I can mix typing and speech.
6. As a phone learner, I want separate dictation and submission targets, so that stopping speech does not accidentally send my answer.
7. As a phone learner, I want recognizable small icons with generous touch targets, so that the interface is compact but easy to operate.
8. As a phone learner, I want my existing draft retained while recording feedback occupies the field, so that speaking does not erase typed work.
9. As a phone learner, I want elapsed time and actual input-level feedback while recording, so that I can understand capture activity.
10. As a phone learner, I want Stop to finish the transcript into the intended field, so that I can review and edit my words.
11. As a phone learner, I want Cancel to discard only the current recording, so that my earlier draft remains intact.
12. As a phone learner, I want connection and finalization progress to be visible, so that a delay is not confused with successful recording or a frozen interface.
13. As a phone learner, I want readable speech errors and the appropriate recovery action, so that I do not need a hover tooltip to understand a failure.
14. As a phone learner, I want question options, Other and confidence controls retained where they already exist, so that the compact layout does not remove ways to answer.
15. As a phone learner, I want the answer/thinking field available while I read earlier context, so that I can continue reasoning without repeatedly reopening the question.
16. As a phone learner, I want reading thoughts kept separate from question answers, so that my reasoning is recorded in its intended context.
17. As a phone learner, I want revealing a check to finish my reading-thoughts dictation first, so that those words do not end up in the newly revealed answer field.
18. As a phone learner, I want practice input to look familiar while retaining its existing actions, so that presentation changes do not change how practice works.
19. As a phone learner, I want Attach handwriting to use the working upload/review capability, so that the plus menu offers a real action.
20. As a phone learner, I want uploaded handwriting to appear automatically, so that I do not manually check whether a new image arrived.
21. As a phone learner, I want to enlarge and review uploaded handwriting before sending it, so that I can inspect what the tutor will receive.
22. As a phone learner, I want uploading or previewing handwriting to remain separate from Send, so that the tutor does not receive an unintended answer.
23. As a phone learner, I want Plan, model/thinking and usage directly below my input, so that they remain accessible without adding another primary action row.
24. As a phone learner, I want those controls to open their real existing panels, so that all actual options and information remain available.
25. As a phone learner, I want only the message history and multiline input to scroll while composing, so that the page and header do not move with my gestures.
26. As a phone learner, I want the composer above the software keyboard, safe-area spacing and pinch zoom preserved, so that I can read and enter work comfortably.
27. As a phone learner, I want drafts and reading position preserved when leaving focus or closing a panel, so that ordinary navigation does not lose my work.
28. As a phone learner, I want recording status to remain understandable with reduced motion and assistive technology, so that feedback does not depend only on animation or color.
29. As a learner using several devices, I want this change limited to the phone layout, so that it does not redesign my desktop or iPad workspace.
30. As a phone learner, I want the menu to show only working capabilities, so that photo/PDF options do not promise integrations that are still missing.

## Implementation Decisions

### Scope and presentation

- Integrate the selected B presentation into the real learning UI; retain the prototype as design evidence rather than promoting its simulated business logic.
- Use the inherited phone breakpoint, below 768 CSS pixels. Keep existing wide-layout behavior and the separate iPad notebook work outside this revision.
- Apply the compact treatment to ordinary conversation, question answer/thinking fields, Thinking while reading, and practice answer/thinking input.
- Retain the prototype's selected visible sizing: 18px plus, 20px microphone, minimum 44×44 CSS-pixel action targets, and a 54px empty input shell. Retain bounded multiline growth and internal scrolling, with phone-keyboard geometry verified in the real UI.
- Keep the plus, central field and applicable separate action in one horizontal input row. Preserve actual action meaning: reading thoughts are not a new standalone message submission, and practice retains its existing submission actions.
- Plan, model/thinking and usage belong directly below the input. Open their existing real panels; do not replace options with prototype examples. Preserve existing availability conditions, such as actual plan presence.

### Question and reading behavior

- Question-owned input receives the compact treatment; retain the question's choices, Other and confidence controls where applicable, along with existing answer payloads and eligibility.
- When an already-revealed question collapses while reading earlier context, retain its compact input, dictation and applicable submission action. Collapse the question content and other controls; reopening restores access to them.
- Do not expose a previously unrevealed check through the collapse change.
- Preserve existing primary-input dictation ownership rather than introducing focus-based routing. Before first reveal, reading thoughts own speech; afterward, the question's answer/thinking input owns it. Do not introduce another independent capture session for secondary fields.
- Preserve the approved Reveal correction: finish current speech into reading thoughts before showing the check. Button activation and the dedicated Enter-to-reveal paths must retain that ordering.

### Speech lifecycle

- Reuse the existing speech capture, recognition, input-level signal, deferred transcript buffer and cleanup behavior. Production bars reflect actual level data rather than the prototype's scripted animation.
- Keep connection/permission-pending and finishing status inside the input. Show readable errors immediately above, with the existing Retry or Settings behavior as appropriate. Do not present connecting as confirmed recording.
- During recording, retain the mounted draft while temporarily presenting elapsed time, level feedback, Cancel and Stop inside the field. The plus remains accessible. Keep the grown field's height/control baseline stable and restore draft selection/internal scroll on cancellation.
- Stop finishes recognition and appends once to the owned destination. Cancel discards the current capture buffer, including pending finalization, without erasing earlier typed work. Preserve navigation cleanup.
- Carry forward real submit eligibility and existing finish-before-send paths; do not copy the prototype's blanket disabled-during-recording Send behavior. The generic composer, question forms and practice currently differ: harmonizing those policies is not selected here.
- Keep stopping dictation distinct from stopping tutor generation. Preserve reduced-motion treatment, accessible names and understandable state announcements.

### Existing handwriting capability

- The initial plus menu contains **Attach handwriting** only, using the existing uploaded-handwriting capability and review flow. The label does not authorize a new camera, phone photo picker, general file picker or PDF upload path.
- Preserve original uploaded PNGs, existing session association, pending previews and image enlargement. Upload/review does not start a tutor turn; existing deliberate Send includes pending working according to the current answer contract.
- Reuse the existing upload event subscription and reconnect/background-return refresh. New writing appears automatically; no routine **Check for writing** menu or review control.
- Preserve error recovery separately from routine refresh. Do not invent attachment-selection flags, a new attachment schema or a new transmission policy in this presentation update.
- Further photo/image and PDF phone integration stays in the linked follow-up issues. The handwriting item can be removed later if the owner no longer finds it useful.

### Viewport and integration constraints

- Reuse existing mobile visual-viewport, safe-area, focused-chat scrolling and modal locking behavior. While composing, keep the outer page, header and chat container stationary; retain native history/input scrolling and contain gestures at their edges. Preserve pinch zoom.
- Release focus-specific locking on blur, close or transition to a wide layout while preserving draft/reading position. Existing modal background locks continue until dismissal.
- Prefer small presentation integration points in the existing composer, question/practice/reading fields, dictation, shared-writing review and supporting-control components. Keep existing data/API contracts; no new processing backend or schema change is selected.
- Preserve the Home Screen launch and discoverable Reload preview workflow. Keep the prototype URL stable and its prior source references available. Reload resets unsent local work as already documented; saved history persists.

## Testing Decisions

**Owner-approved main boundary:** exercise the real learning UI in a browser with
controlled speech responses and uploads, checking visible behavior and actual
submitted/persisted results. Follow with separate physical-iPhone acceptance.

Good tests exercise observable learning flows, not component internals, private
state or implementation-shaped snapshots. Reuse the existing mobile browser,
question-reveal and handwriting-submission tests. Use isolated test data and
scripted model responses where submission must be exercised.

- Check ordinary conversation, reading thoughts, free-text questions, selection questions and practice. Preserve each surface's existing actions and payloads.
- At 320/375/430px widths, check compact alignment, nonoverlapping touch targets, long drafts, larger text, keyboard-sized viewports and access to all retained controls.
- Verify question collapse/reopen preserves the input, selections and draft; unrevealed checks remain unrevealed until requested.
- Exercise connection, recording, Stop, finalization, Cancel, late responses, failures, retry/settings and navigation. Verify original draft preservation, correct destination, append-once behavior and existing finish-before-send eligibility.
- Retain the Reveal regression: microphone stops, the check remains closed while waiting, early/late transcript fragments land in reading thoughts, and the newly revealed answer stays separate.
- Upload handwriting from a second client and observe automatic previews without tapping refresh. Verify reconnect and foreground return recover missed arrivals, another session's upload does not populate this one, and arrival does not submit to the tutor.
- Verify handwriting enlargement and deliberate Send through the existing submission path. The menu must not offer unsupported photo/PDF upload actions or routine checking.
- Exercise real Plan / Model / Usage panels with actual content and long labels; preserve options, dismissal and draft state. Any concrete usability conflict must be surfaced for a bounded decision rather than solved by removing controls.
- Verify history/input scrolling internally and at both ends, gestures on the composer/header/backdrop, modal dismissal, focus release and transition to desktop. Distinguish browser touch emulation from physical-device evidence.
- Run typecheck, targeted lint and relevant existing regressions for changed behavior. Verify HTTPS page, manifest, icon and Reload preview responses/behavior on the intended preview.
- On the actual iPhone, verify keyboard clearance, safe areas, rubber-band containment, pinch zoom, VoiceOver, live microphone behavior and a seated learning session with a real tutor response. Do not treat simulated speech or browser geometry as physical iOS acceptance.

## Out of Scope

- Implementation before separate owner authorization.
- Desktop/iPad layout redesign or the separate notebook/context-pane effort.
- New phone camera/photo-library/general-file/PDF upload integrations, extra image formats, HEIC handling or attachment-removal APIs.
- Adding unsupported menu entries, placeholders or a routine manual handwriting refresh control.
- New dictation routing, live transcription, automatic sending, speech replies or harmonizing existing practice/question submission policies.
- Replacing the existing Plan / Model / Usage panels, broader Settings redesign or an app-wide visual rewrite.
- Changing teaching/practice policies, answer types, confidence requirements, session records or data synchronization architecture.
- Native iOS delivery, offline/service-worker caching, walking/headphone operation or other later learning situations.

## Further Notes

- Decision history and implementation evidence: [mobile learning UI plan](mobile-learning-ui-plan.md), Q1–Q7. The owner confirmed the combined scope and asked for this spec while keeping implementation paused.
- Preferred prototype: [B](https://thinkpad.tailfd9bf6.ts.net:8444/prototype/mobile-ui?variant=B). Its speech/send/file selection remain simulated; its full scope and limitations are in the [prototype README](../app/prototype/mobile-ui/README.md).
- Research: [mobile UI guidelines](research/mobile-ui-design-guidelines.md) and [compact voice composer](research/compact-voice-composer-evidence.md). The measured 62px gain at 375×550 is prototype/browser evidence, not a guaranteed saving for every real question state.
- Existing browser verification: `scripts/smoke-mobile-layout.mjs` and `scripts/smoke-question-reveal.mjs`. Existing upload/submission verification: `tests/shared-writing.test.ts`.
- Photo/image integration: [#5](https://github.com/bearthababe/learnharness/issues/5#issuecomment-6627142766). Phone PDF/supplied-material integration: [#36](https://github.com/bearthababe/learnharness/issues/36#issuecomment-6627142724).
- Concurrent, uncommitted work exists in shared UI files. Preserve it and the retained prototype source references when preparing implementation changes. The spec is not approval to overwrite another session's work.
