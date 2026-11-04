# Mobile UI studies — throwaway A/B prototype

**Owner-approved scope, 2026-11-03:** compare page-led and context-led phone
layouts through Home → Sessions → conversation, model choices and Settings.
Question: which arrangement makes seated reading, spoken answering and returning
from supporting tasks feel easier? The owner prefers B and requested a spacing
and text-hierarchy refinement after reviewing phone screenshots. Production
integration remains a separate decision.

The [mobile learning UI plan](../../../docs/mobile-learning-ui-plan.md) consolidates
the accepted direction, real-app integration steps and remaining owner decisions.
After the latest phone layout report, a fresh browser load showed the intended
horizontal composer; the owner confirmed “No it’s fine” following the reload
instruction. No source correction was needed for that report; stale styles remain
an unconfirmed explanation. Broader physical iOS acceptance is still pending.

## Open

- [A — Page-led](https://thinkpad.tailfd9bf6.ts.net:8444/prototype/mobile-ui?variant=A)
- [B — Context-led](https://thinkpad.tailfd9bf6.ts.net:8444/prototype/mobile-ui?variant=B)

The bottom comparison bar switches A/B without losing the current screen,
session, draft or reading position. Left/right keys also switch when outside
inputs and dialogs. The selected variant is reflected in the URL.

Uses the existing LearnHarness dev server in preview slot 1 (localhost 3000).
If it needs restarting after identifying the listener, run
`pnpm dev --hostname 127.0.0.1 --port 3000`. Slot 2 belongs to another running app.
The development-only route replaces the shell because whole navigation,
conversation layout and supporting surfaces are the comparison subjects.

For a dedicated iPhone icon: open either link in **Safari → Share → Add to Home
Screen → Open as Web App → Add**, then launch the icon. This prototype has its own
manifest identity, scope, standalone launch and touch-icon endpoint. Its stable
start URL opens A; switch to B within the preview. The existing LearnHarness icon
continues opening the normal app.

**Tools → Reload preview** revalidates the page and resets local drafts, simulated
answers, selected screen and local settings. There is no service worker.

## What to try

1. Open Sessions, search for Hydraulics, and open **Hydraulics 101**.
2. Read the recent history excerpt and type a draft. Start Dictate, then Stop;
   edit the sample transcript appended to the draft.
3. Open the model picker, select a thinking level and return. Compare A's
   full-height task page with B's contextual sheet; B has an Expand button.
4. Open Tools → Settings → Appearance, try larger text, then Back/Close.
5. Switch A/B, revisit Sessions, and check whether orientation and reading space
   feel better. Try typing with the actual phone keyboard open.

Navigation, filters, draft editing, simulated recording/finalization, local Send,
model selection, appearance choices, file selection, panel expansion and reload
are interactive. Recent session text and titles are read from the local app data;
no session/settings mutation is sent. The transcript is an excerpt of text parts,
not a complete reproduction of tool cards, quiz state or interactive artifacts.
Speech uses a clearly labelled fixed sample and never opens the microphone.
Plan, graph, activity and usage content are explicitly illustrative; file picking
does not upload. Graph search and sliders demonstrate control placement only.
Tools exposes current local state, also logged in the browser console.

## Evidence and baseline

The [mobile UI research](../../../docs/research/mobile-ui-design-guidelines.md)
motivates full-width task surfaces, 44×44 CSS-pixel controls, growable list rows,
readable proportional text, explicit dismissal, safe-area spacing and
keyboard-aware geometry. Contextual sheets keep background context visible but
inactive; they are not simultaneous working panes. Long content expands or uses
full-height presentation.

Current inherited behavior and problems are recorded in research §10:
`components/settings/settings-dialog.tsx` has a desktop-style section rail;
`components/model-picker.tsx` / `components/menu-shell.tsx` use anchored menus;
`components/top-bar.tsx` and `components/stats-bar.tsx` supply shared conversation
and composer controls. The prototype tests presentation alternatives to compact
width risks without changing their production implementations. The integration
hook is limited to the development route in `components/sidebar.tsx`.

Both studies carry forward the approved full-width Sessions structure, creation
controls, Teaching / Practice / All filter (Drill is included in Practice), and
two-row Home toolbar. A keeps Plan in upper navigation and uses full-height task
panels. B uses a compact identity header, places Plan beside the answer controls,
and uses expandable short-task sheets. Settings subsections use a Back action;
Close returns to the suspended screen. Drafts and reading position survive
ordinary navigation and variant switches.

## Verification, 2026-11-03

### Combined composer — owner-approved first iteration

After the [compact-composer research](../../../docs/research/compact-voice-composer-evidence.md),
the owner selected candidate 1 and confirmed that Plan / Model / Usage belong
directly below it: “Let’s go with this design as a first iteration.” B now renders
`[+] [draft / microphone] [Send]` above that quiet secondary row.

- The plus is an 18px glyph, the mic 20px, and the action hit regions are 44px.
- The empty field is 54px tall including padding/border. It grows with text up to
  the existing 130px editor budget, reduced for short visual viewports; overflow
  scrolls natively. The placeholder stays on one line at narrow widths.
- Recording temporarily conceals the mounted draft and shows a simulated timer,
  animated bars, Cancel and Stop within the field. Cancel stays inside the field;
  the attachment plus remains accessible. Existing draft value, selection,
  internal scroll and field height survive cancellation. Meter/Cancel/Stop align
  on the lower control baseline for a grown field.
- Stop shows Finishing, then appends the sample once. Cancel also works during
  finalization. Send remains independently placed and retains the study's
  disabled-during-recording/finalization behavior. Navigating away cancels the
  simulation, matching the inherited navigation-cancellation policy.
- Reduced motion disables bar/spinner animations. The elapsed display, Stop
  control and accessible state announcement remain available.
- Speech remains simulated; no microphone or production recognition is opened.

At **375×550 CSS px**, idle composer height changed from **191.2px to 129.2px**;
conversation-history height changed from **247.3px to 309.3px**. That is **62px
recovered**, measured in Chromium, not a physical iPhone result. Longer drafts
consume more space through the approved growing-field behavior.

Original pre-combination source:
`refs/previews/mobile-ui-b-before-combined-composer-20261103`
(`8aa3f301358a6709e5596815c8859ae6638464a4`, a Git tree). Same B URL, manifest,
icon and Reload preview workflow; reload clears local prototype drafts.

TypeScript and targeted ESLint passed. The existing A/B phone walkthrough passed
again, including HTTPS page/manifest/icon, reload, native emulated history
scrolling, input-edge containment and focus-lock release. Additional 320/375/430px
checks covered actual hit-testing during recording/finalizing, compact idle and
bounded text growth, draft/selection/scroll restoration, cancellation before a
pending transcript could append, append-once completion, reduced motion, 350px
keyboard-style layout, and navigation cancellation. Physical iOS acceptance of
this new composer remains pending.

### B density refinement

Owner feedback: “I like b,” followed by “See what you can do” in response to
keeping B's structure and generous hit areas while refining spacing and text
hierarchy. The original source is preserved at
`refs/previews/mobile-ui-b-before-density-20261103`
(`d986480c086253850a94a66ccb910bec1f3c02fe`, a Git tree). The same B URL serves the
refinement; A retains its original dimensions.

The correction reduces accumulated header, search, filter, footer and composer
padding. Default session rows are 64px tall and grow with content; titles are
17px, metadata 13px, filter/context controls 15px and primary answer controls
16px. Reading prose stays 17px, with the existing larger-text option. Buttons
retain 44×44px minimum targets; the input retains two lines and native multiline
scrolling. The comparison bar uses less padding and a larger simulation caption.
Model/settings panels receive the same tighter spacing treatment.

Measured in Chromium at **375×550 CSS px**, approximating a Safari-constrained
content area (not a physical-iPhone measurement):

| Region | Original B | Refined B |
|---|---:|---:|
| Session-list viewport | 145px | 201px |
| Conversation-history viewport | 200px | 247px |
| Composer, idle | 214.5px | 191.2px |
| Session row, default title | 72px | 64px |

The browser walkthrough below was rerun after this CSS-only refinement and passed
at all three widths, including the 350px keyboard-style viewport, larger text,
focus/modal release, emulated scrolling, reload and HTTPS assets. Screenshots
were inspected for both refined Sessions and conversation. Owner evaluation of
the revised spacing on the actual phone remains pending.

### Initial implementation and repeated interaction checks

- TypeScript, targeted ESLint and whitespace checks passed.
- Browser walkthroughs passed at 320, 375 and 430 CSS-pixel widths for both
  variants: Home, Sessions/search, Hydraulics, draft preservation across variant
  switches/panels/navigation, simulated dictation, thinking selection, larger
  text, local Send and reload reset. Checked actual control bounds and 44px targets.
- Reduced 350px viewport checked keyboard-style geometry and visible input.
- Synthetic touch checks verified native scrolling remains available inside
  history and multiline input; gestures at both edges, header and composer are
  contained; two-touch gestures are not cancelled.
- Chromium touch-emulated scrolling moved history while keeping header/page
  stationary. Modal dismissal and desktop transition released owned focus locks.
- HTTPS A/B pages, manifest and icon returned 200; manifest scope/start URL and
  standalone display were checked. No browser page errors or API mutations were
  observed in the walkthrough.

These are browser/emulation checks, not physical iOS acceptance. Actual keyboard,
rubber-band scrolling, safe areas, pinch zoom, VoiceOver and Home Screen launch
still need owner review on the phone. Live dictation is outside this simulation.

Source remains uncommitted while the owner evaluates. Once a decision is made,
capture the variants on a throwaway source ref/branch with the verdict; implement
the approved design separately rather than promoting prototype code directly.
