# Equation Notebook — iPad presentation adaptation

Status: owner approved and authorized implementation, 2026-11-04. Owner also
requested following the iPad implementation's structure so a common presentation
module can be extracted later.

## Authority and evidence

The owner requested the accepted iPad notebook's overall page design for the
equation Notebook, while retaining its input method and earlier agreed behavior.
On phones the requested trial is Notebook **below Tutor**, with split and
full-page views. This supersedes interpreting the handwriting phone Write/Chat
switch as the intended equation layout.

The iPad implementation session supplied
`/tmp/opencode/notebook-integration/ipad-layout-handoff.md`. Exact application
source: `329677bdcbfd218a0013d745ff21e273d628f567`; later `84132b3`/`8148bb9`
change evidence only. Relevant source is `components/handwriting/notebook.css`,
`notebook.tsx`, `session.tsx`, and their workspace integration in `chat.tsx`.
Read-only captures confirm the actual tablet split and expanded page. Existing
iPad evidence: `/tmp/opencode/issue45-https-verification.json`.

## Proposed experience

1. **Below Tutor on phones and tablets.** Put the complete Tutor region above the
   notebook card. Switch to side-by-side only at **980px available workspace
   width**, as in the iPad implementation; sidebar width counts against that space.
2. **Same frame.** Rounded card, border/shadow, visible 16px gaps on all four sides,
   a stationary card header and independently scrolling contents. Reuse the
   proven inline slot/card sizing so the bottom corners stay within the viewport.
3. **Split and full page.** Card header actions are **Expand**, **Back to split**
   when expanded, and **Close notebook**. Expand covers the session workspace;
   the Tutor remains mounted but hidden/inert. Back restores the split. Close
   returns to Tutor; the existing **Notebook** entry reopens it. Preserve both
   drafts, working, selected line and separate reading positions.
4. **Adjustable divider at every width.** Reuse the 28px grip, pointer capture,
   accessible separator and keyboard arrows/Home. Initial split stays **50/50
   when stacked**, **60/40 Tutor/Notebook when wide**. Allow Tutor shares between
   30% and 65%, with panel interiors scrollable. Do not carry across the
   handwriting-tool-specific 384/406px minimum dimensions. Remember the adjusted
   fraction through Expand/Back/Close/reopen while mounted; reload uses defaults.
5. **Keyboard behavior.** Keep the approved stacked phone allocation: focused
   pane receives two thirds while the software keyboard is open. Restore the
   chosen split when it closes. Starting a divider drag blurs the editor, as in
   the iPad design. Keep the active composer above the keyboard, native inner
   scrolling, contained edge gestures, modal ownership and pinch zoom. Cover the
   previously uncovered 768–979px touch-width range.
6. **Equation controls.** The owner-approved cleanup below supersedes the original
   above-working control strip.
   Preserve the existing mathematical editor and Tutor/Notebook distinction.
   Expanding selects Notebook through its existing settled handoff; Back changes
   only the presentation. Close uses the existing settled return to Tutor.
   View changes never submit or start recording automatically. Stop and Send A
   retain their approved semantics.

## Implementation boundaries

- Adapt presentation in a small Notebook layout module and scoped styles, based
  on the exact iPad source. Keep the existing session/draft/speech modules as the
  owners of content and handoff behavior.
- Keep Tutor and Notebook mounted across split/full/close transitions; do not
  create a second editor instance or replace durable Notebook visibility.
- Reconcile focus-lock ownership in one deliberate integration rather than
  enabling two competing locks. Preserve the ordinary mobile layout when closed.
- Reuse layout behavior selectively; this plan introduces no handwriting canvas,
  stroke storage, new speech provider or model comparison.

## Verification and delivery

Exercise below-Tutor geometry on phone/tablet, the available-width wide transition
with sidebar open/closed, divider pointer/keyboard behavior, Expand/Back/Close,
reading-position retention, independent drafts, reload and the existing combined
Apply/Stop/return/Send flow. Verify keyboard focus and edge gestures in both panes.
Use isolated data and scripted external providers.

Run affected behavioral tests, typecheck/lint and production build/payload smoke;
update review and the single combined verification record. Deploy only after
verification, to the existing Notebook slot 3000/8444 with the existing data/auth
paths and Home Screen identity, then verify actual HTTPS assets and Reload.
Physical-phone and owner-learning acceptance remain the owner's subsequent step.

## Approved card-content cleanup — 2026-11-04

After reviewing the deployed card, the owner accepted the overall layout and
rejected the crowded controls inside it. Owner selected **Implement this cleanup**:

- Header: Notebook title, small Undo and Expand/Back icons, and one **⋯** menu.
- One compact instruction field with microphone and small Apply at its edge;
  retain the accessible input/action names without a repeated visible label.
- Model, History, Start fresh, Usage and Close live in the menu. Keep model
  selection per session with the existing candidates, default and locking rules.
- Equations occupy the remaining working area. Clarifications/errors become a
  compact expandable notice retaining their full details and recovery action.
- Use the existing menu placement and keyboard behavior. Opening/browsing menus
  preserves speech destination; menu Enter/Escape cannot Apply or Send. Editing
  actions use the existing settled handoff. Retain the frame/scroll contract.

Implementation and deployment to the same app are authorized. A later move of
model selection to global Settings was mentioned as a future direction only.

## Approved attachment review and toggle placement — 2026-11-04/05

- Remove inline attachment previews from ordinary chat, question answers/thinking,
  reading-thinking, and practice/drill inputs. Preserve automatic attachment and
  the ordered content sent to Tutor.
- Add **Review attached working** in Notebook ⋯. Show only the current activity's
  drafts, including all question channels, with simple headings. Equations remain
  immutable; earlier prose and the current continuation remain editable and durable.
- Use the existing scrollable menu and Back control, with “No working attached
  yet.” when empty. Browsing only inspects; selecting an explanation field uses
  Tutor's settled handoff. Preserve the original recording's destination and
  forbid implicit Apply/Send/new recording. Review text Enter inserts a newline.
- Put a small accessible Notebook open/close icon in the shared toolbar directly
  below the active Tutor input. Remove the title-bar toggle; card Close stays in ⋯.
- Link portaled review fields explicitly to their workspace for focus, keyboard
  and mobile scroll locking. Keep the visible review above the software keyboard.

Owner separately approved **Keep text editable**, **Current activity**, and this
concrete implementation/verification/deployment plan. Current results are recorded
in [the authoritative verification record](notebook-mobile-verification.md).
