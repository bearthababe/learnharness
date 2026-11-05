# iPad handwriting and spoken reasoning: low-friction input to LearnHarness

**Research date:** 2026-11-03. **Status:** owner-approved Concepts PNG transfer trial implemented and verified end to end on the owner's iPad: transfer, legible pending review, explicit submission, and a real tutor reading confirmed correct by the owner.

## 1. Question and bottom line

The learner wants to write equations, derivations and diagrams with a Pencil **while explaining their reasoning to the tutor**. Sending the working should ideally be one button or **Share → LearnHarness**, without saving and finding a file. Speech-to-text inside a notebook is not the requested voice experience.

**Owner clarification:** aim for iPad alone. Investigating a phone or computer alongside is worthwhile if that makes implementation easier; getting something working takes priority. This permits comparison, not selection of a two-device design.

**Owner hardware:** iPad Air and Apple Pencil (2nd generation). Apple's compatibility list pairs that Pencil with Air 4th/5th generation; exact generation and installed iPadOS remain unconfirmed. Pencil Pro squeeze-to-Shortcut is therefore not an available control on the stated Pencil. [H1][S5]

The evidence supports this shortlist:

- **Goodnotes first for page-based derivations:** its documented **Export This Page** avoids finding the page in an export picker. PDF/image export still has format/options and confirmation before the receiving action. It is not an established two-tap workflow. [G1][G2]
- **Concepts first for free-layout diagrams and selected working:** editable strokes, an infinite canvas, explicit selection export and transparent-PNG drag-and-drop suit spatial reasoning. Its normal export route has several choices and an additional preview → Share step. [C1–C3]
- **Freeform is a serious low-setup comparison:** whole-board PDF sharing is comparatively short; selected items can be copied to another app as PNG. Exporting an ever-growing board or all scenes is different from sending only the current working. [A1]
- **Notability deserves a friction trial:** Quick Share bypasses its export-options screen, and the current guide also shows a direct Share button. However, the retrieved documentation does not establish its default output, remembered settings, or an equally short current-page export. Its recording advantage is mostly for later playback, not live tutoring. [N1–N3]
- **MyScript Notes, formerly Nebo, is relevant if recognized/converted math matters.** It also supports free ink and sketches, but documented selected-page export is longer. Recognition is optional and is not required to deliver an image of a derivation. [M1–M3]
- **A Share Sheet Shortcut can receive the exported file and upload it without a file picker.** Apple documents both halves. This removes the save/find/upload detour; it does not remove the notebook's export steps or provide tutor voice. A native Share extension is another established receiver. Safari's outbound Web Share support does **not** make a Home Screen web app an inbound share target. [S1–S4][X1][X2][W1][W2]

**Main bottlenecks:** generating the intended snapshot, delivering it to the intended teaching/practice session, and maintaining spoken interaction while writing. None of the compared notebook exports establishes continuous ink streaming to LearnHarness.

### Owner's first hands-on trial

After this research, the owner tried the installed Goodnotes and Concepts apps on the iPad:

- **Goodnotes:** encountered a payment prompt and declined to pay for a test. Deferred from this trial; this is the owner's experience, not a claim that every Goodnotes installation requires payment for export.
- **Concepts:** sharing worked and felt acceptable for a first trial. The owner estimated roughly three clicks and said it “didn't feel horrible.” The exact route, format, scope and receiving destination were not recorded, so this is a usability observation rather than an end-to-end LearnHarness transfer result or an audited tap count.
- **Next trial candidate at this stage: Concepts.** The owner accepted its observed sharing friction for testing; this did not select a production integration or change the long-term low-friction goal. The subsequent receiving trial is recorded below; simultaneous LearnHarness dictation remains untested.

### Follow-up: first transfer trial decisions

- **Owner scope:** start with getting handwriting into LearnHarness; defer simultaneous voice testing.
- **Formats:** the owner reports JPG, PNG and PDF are all available in Concepts. PNG was proposed as the initial format because the inherited image-reading tool accepts it, then adopted in the approved transfer trial.
- **Review first — owner selected:** sharing must leave the writing available for review and an optional explanation before submission. Uploading alone must not trigger a tutor response.
- **Destination — owner selected:** use one chosen LearnHarness session for this first trial, avoiding a session picker on each share.
- **Connection — owner confirmed:** Tailscale is installed and connected on the iPad to the laptop's tailnet. The laptop's existing mappings include HTTPS 8444 → localhost 3000 and HTTPS 8445 → localhost 3001. At the initial connection check, port 3000 was free and port 3001 belonged to a separate Forma preview. The receiving endpoint had not yet been implemented at that point.

**Implementation approved by the owner:** an Apple Share Sheet Shortcut sends a PNG to a session-specific LearnHarness receiver over the existing Tailscale HTTPS connection. LearnHarness retains the original image and displays it as pending working in that session. The learner can review it, add an explanation, then explicitly send it to the tutor using the existing image-reading capability. Keep transfer/storage/review logic isolated with small session integration hooks. Verify upload, pending-state persistence, explicit submission and tutor access, then perform the physical Concepts → Shortcut → LearnHarness trial.

**Additional owner decisions during implementation:**

- Pending images accompany the next normal Send, including question answers and practice submissions, using the existing explanation field.
- Image submissions wait until the tutor finishes its current response; the mid-response steering system is outside this trial.
- Create a dedicated **Handwriting trial** session rather than using this checkout's test-fixture sessions.

### Implemented trial and handoff

- Session: [Handwriting trial](https://thinkpad.tailfd9bf6.ts.net:8444/chat/chat_mw0da4gc_918ea949).
- Fixed Shortcut upload URL: `https://thinkpad.tailfd9bf6.ts.net:8444/api/chats/chat_mw0da4gc_918ea949/writing`.
- Slot 1, localhost **3000**, serves this checkout. Slot 2 remains the separate Forma preview. Keep slot 1 associated with this app while its Home Screen icon is in use.
- Original PNGs are immutable files under `LH_DATA_DIR/shared-writing/<chatId>/` (default `data/shared-writing/`). Submission is derived from references in the saved message record; refused submissions leave files pending. Uploads accept raw PNG bodies up to 25 MiB, not multipart forms or PDF/JPEG.
- The tutor receives server-resolved file references alongside the submitted explanation/answer and can use its inherited `read` tool. The transcript displays the image alongside that submission. This does not automatically OCR or grade handwriting.
- A session-scoped standalone manifest, Apple metadata and touch icon provide the Home Screen launch. Install once: **Safari → Share → Add to Home Screen → Open as Web App → Add**, then launch the icon.
- **Share from Concepts · setup & tools → Reload preview** performs an ordinary reload. Uploaded images and saved conversation survive; unsent typed text resets. No offline/service-worker cache was added.
- The expanded setup panel gives the Shortcut instructions: **Show in Share Sheet**, input **Images**, **Get Contents of URL**, **POST**, body **File = Shortcut Input**, followed by **Show Result**. No manual file picker is required. An optional laptop-side guided walkthrough is `/tmp/opencode/setup-concepts-writing.sh` (`bash /tmp/opencode/setup-concepts-writing.sh`); it stores no credentials.

**Verification:** typecheck, repository lint, targeted session/question/practice regressions, and scripted server integration passed. The integration test demonstrates upload without starting a turn, byte-preserving reads, pending persistence, explicit image-only Send, saved attachment references, duplicate/cross-session rejection, and the real image-reading tool returning the original bytes to a scripted model. Question-answer and practice projections retain references.

HTTPS page, manifest and PNG icon responses passed. Headless Chromium using a touch viewport verified live upload notification, pending image display and reload persistence, typed-draft reset, focus-lock release on blur/desktop transition, and gesture routing for history/input interiors and boundaries, header/backdrop and pinch zoom. These are emulation checks, **not physical iOS keyboard/gesture acceptance**.

**Physical transfer — owner confirmed:** after the Shortcut setup instructions, the owner reported that the writing arrived in LearnHarness. Asked whether the image was legible, including small symbols, and marked “not sent”, the owner confirmed both. This establishes the first Concepts → Shortcut → LearnHarness transfer/review milestone on the actual iPad; it does not establish tutor interpretation or a measured repeat-use tap count.

**ChatGPT connection:** iPad sign-in failed at `127.0.0.1` because the inherited connector (`electron/chatgpt.cjs`) uses a loopback callback on the laptop hosting LearnHarness. An isolated, network-free invocation confirmed that callback address. The owner chose and completed one-time sign-in from the laptop browser. Server status subsequently confirmed a connected account with no pending login or error. This enabled iPad use of the shared server connection; iPad-only sign-in remains unsupported by this flow.

**Real tutor reading — owner confirmed:** the saved session contains the submitted image reference, a successful `read` tool result carrying image content, and a completed tutor reply. The tutor identified the sideways writing as `F = pA → p = F/A` and `Δp = F₁/A₁ − F₂/A₂`, explicitly noting uncertainty about the small subscripts. The owner confirmed that this matched the writing. This completes the first handwriting-transfer-and-reading trial; it is evidence for this sample, not a general handwriting-recognition or mathematical-assessment quality evaluation.

**Remaining device checks:** verify Home Screen and keyboard behavior and measure repeat-use friction. Simultaneous spoken reasoning remains deferred under the owner's handwriting-first scope.

## 2. Baseline and evidence boundaries

The governing decisions are in [fork vision §§2, 6–7](../fork-vision.md): retain upstream's conversation-led teaching, prefer isolated extensions, preserve original work and reasoning, and clarify uncertain interpretation before assessment. Input technology and native/web delivery remain open.

[GLOSSARY.md](../../GLOSSARY.md) defines a **notebook** as continuing session working, not a separate object per problem. An external app's “notebook,” “board,” or “note” below is that vendor's storage concept; choosing one would not automatically redefine LearnHarness's notebook or learner evidence.

The [prior voice/notebook research](voice-notebook-input-routing.md#owner-steering-after-the-research-question) records separate unsent drafts, ordered working snapshots alongside the learner's explanation, and later alignment with upstream's buffered dictation. Those prototype decisions do not select an iPad handoff architecture. In particular, a notebook-edit command is not evidence of the learner explaining why a step is valid.

Evidence labels used here:

- **Documented:** behavior stated by the vendor in the linked primary source retrieved on the research date.
- **Inference:** a possible composition of documented capabilities, or a comparative judgment; not a shipped LearnHarness feature.
- **Unverified:** exact device behavior, unreported settings persistence, performance, or a missing documentation detail.

During the initial desk research, no app was purchased/downloaded, no account credentials used, and no physical iPad, microphone, Pencil, export payload or tutor-reading trial performed. The subsequent owner-reported sharing trial is recorded above. Source routes are not measured tap counts. Current unversioned Apple guides served iPadOS/iOS 27 content; the owner's installed versions are unknown. App versions and plan entitlements need recording in a later device trial.

## 3. Writing and transfer comparison

| App | Writing fit and fidelity | Relevant outputs | Friction judgment |
|---|---|---|---|
| **Goodnotes** | Page-oriented ink, images, text and lasso manipulation; math conversion is an optional action. Editable PDF retains movable annotations; flattened PDF offers broad viewer compatibility and optional recognized handwriting. [G1–G3] | PDF, Image, `.goodnotes`. The general guide does not identify the image extension. [G1] | Strongest documented direct **current-page** scope among the two apps the owner named. Selection screenshot route has documentation gaps. |
| **Concepts** | Infinite vector/raster-hybrid canvas; editable strokes, selection and precision tools. PNG/flattened PDF preserve brush appearance; vector PDF/SVG simplify it. [C1–C3] | JPG, PNG, PDF (flattened/vector), SVG, DXF, PSD, native `.concept` on iOS. [C1] | Strongest documented **selected-region** handoff; normal export is choice-heavy. Drag/drop may be easier if a receiving surface supports it. |
| **Notability** | Page-based ink and sketches, selection/grouping, optional math conversion to scalable images with editable LaTeX. [N4][N5] | PDF, JPEG, PNG, Note, NTB for Notability Cloud. [N1] | Quick Share is promising for a whole note; current-page scope and defaults remain unverified. |
| **Apple Freeform** | Free-layout board with Pencil drawing, grouped strokes, shapes and handwriting tools. Current guide also documents math-result assistance. [A2] | Board/scenes PDF; selected-item PNG via copy/paste; screenshot PNG. “Send a Copy” instead sends an iCloud link. [A1] | Short whole-board route, but selection/cropping and board growth can dominate the real effort. |
| **Apple Notes** | Handwriting/sketches with lasso editing; math expressions and graphs supported. [A3][A4] | PDF via Markup; Markdown and Pages routes also documented. [A5] | Useful already-installed scratchpad, but no equally clear no-picker selected-ink PDF/image sharing route established. |
| **MyScript Notes / Nebo** | Free ink in notebooks/boards/PDFs, structured documents, math conversion and diagram/sketch content. Math objects in documents can have solving disabled. [M2][M3] | Notebooks/boards: PDF, PNG, SVG, `.nebo`; documents: text, PDF, Word, `.nebo`; annotated PDFs: PDF or `.nebo`. [M1] | Attractive for conversion, not an established advantage for the fewest send actions. |

**Interpretation:** all six can express handwritten mathematical working without the learner typing LaTeX. That is a writing capability, not proof of recognition accuracy or tutor understanding. For this task, preserve the visible attempt before any conversion or solver assistance; distinguish recognized text from original ink and mathematical help from input correction. This follows the fork vision, not a new ban on notebook assistance.

### Goodnotes: exact documented scope routes

From the open document at the intended page: [G1][G2]

1. Tap **Share** in the navigation bar.
2. Tap **Export This Page**.
3. In the export dialog, choose **PDF** or **Image** and relevant export options. For PDF, **Editable** and **Flattened** have different behavior; handwriting recognition is another option.
4. Complete the export, then choose the receiving Share Sheet action. The general guide explicitly names the final **Export** for multi-item export but does not spell out every current-page dialog control; the complete device-level tap sequence remains to be verified.

For an explicitly chosen page rather than the open page: **four-square thumbnails → arrow under that page → Export**. For several pages: **four-square thumbnails → Select → tap each page → Export**, followed by the export settings/confirmation and destination. These extra scope selections count as real work. [G1]

For a small equation/diagram: **Lasso tool → draw a loop → Object Menu → Take Screenshot** is documented. Additional actions may be under **More (…)**. The current guide documents **Share** for image objects, but does not fully document the screenshot preview's onward Share sequence. Therefore “lasso → screenshot → Share → LearnHarness” is a plausible device-trial route, **not a fully verified current recipe or tap count**. Imported PDF content cannot itself be moved by the lasso; a screenshot can capture it. [G3][G4]

**Fidelity:** editable PDF allows images, text boxes, handwriting and highlighting to be selected/moved/resized in another PDF viewer. Flattened PDF can contain a searchable handwriting layer, but copied recognized characters are not the original handwriting. Neither format is a chronological record of erased/revised work. [G2; last sentence is inference from snapshot export]

**Audio:** PDF export explicitly omits recordings. `.goodnotes` retains them for Goodnotes users. Current iOS documentation also permits **Audio sidebar → More (…) → select recording → Export → destination**, exporting the original audio format separately. Thus it is incorrect to say Goodnotes audio can never be exported separately, and equally incorrect to say it accompanies a normal PDF. [G5]

Goodnotes documents continuing its own recording when switching apps on Apple devices. That is not evidence that LearnHarness's microphone remains active, or that two recording apps can run together. Its two current audio articles disagree about recordings through collaboration links; do not rely on a collaboration link for this workflow. [G5–G7]

### Concepts: exact region and selection routes

The current export manual gives this sequence: [C1]

1. Tap the **Export icon** in the status bar.
2. Choose **Format**: e.g. PNG or **PDF, Flattened**.
3. Choose **Region**: **Screenshot** (visible canvas), **Entire Drawing**, **Artboard**, or **PDF Bounds**.
4. Set any background/grid and output-size options required.
5. Tap **Export**.
6. In the generated preview, tap **Share**; choose the destination in the system sharing UI.

The preview is not already a completed transfer: the manual explicitly says leaving it without **Share/Save** or dragging the preview will not export the file. Older indexed guides/tutorials omit this extra step; count it for the current documented route. [C1]

To export **only selected working**, first use **Lasso/Item Picker** to select the strokes, then enter Export. **Selection** becomes the only region option. The PDF-specific guide explicitly supports selection as a single PDF page. This avoids cropping a giant board, but costs the selection gesture and any tool change. [C1][C2]

Concepts has no intrinsic “current notebook page” on its infinite canvas. **Screenshot** means the visible canvas region; **Artboard** is a configured boundary. **Entire Drawing** makes one potentially very large PDF page. **PDF Bounds + Original Pages** can bring all original imported pages into the export, including pages not placed on the canvas. Choose scope deliberately in a later trial. [C1][C2]

Two documented no-file-picker alternatives: [C1]

- **Drag/drop:** once **Settings → Interactions → Drag & drop active selections** is enabled, select with Lasso/Item Picker, hold the selection until it lifts, drag to the other app, and drop. Opening the destination from the Dock adds gestures if it is not already alongside. Exported images are transparent PNGs.
- **Clipboard:** select working → tap the **Paperclip** in the selection popup → open/focus destination → Paste. The destination must accept the supplied image representation; LearnHarness support is not established by the Concepts manual.

**Fidelity:** Concepts explicitly warns that vector PDF does not look exactly like the sketch: variable-width/textured strokes become simplified non-textured paths. PNG is lossless raster; flattened PDF is high-resolution raster preserving appearance. SVG also has brush/mask limitations. For inspecting the learner's actual marks, PNG or flattened PDF is the more defensible initial comparison; vector export is useful when editability is the objective. [C1][C2]

**Entitlements:** the free package includes JPG export. Selection, PDF and advanced outputs require the relevant paid features; current documentation places PDF import/export in Essentials or Everything. No regional purchase price is asserted. [C2][C3]

**Audio:** no audio-recording/export workflow was established in the inspected Concepts manuals. Its pen/export strengths should be evaluated independently of the live tutor voice channel.

### Notability: quick whole-note sharing, unresolved current-page shortcut

Current official routes from an open note: [N1][N2]

- **Options (…) → Quick Share** opens Apple's Share menu. The separate Options guide calls it **Quick Export**.
- **Options (…) → Export Options** opens format choices (**PDF / Note / JPEG / PNG / NTB**) and per-format **More options**. The Options guide also uses the label **Export as**.
- The sharing guide additionally shows **Share icon → Apple's Share menu** directly.

These are genuine shorter entry points, but the guides do not establish the direct route's format/default, whether settings persist, or whether it exports the current page versus the whole note. **Do not recommend “two taps” for sending a derivation from a multi-page note.** A single-note trial could reveal a valuable fast path; it has not been tested here.

The current **Content Manager** guide documents **page menu → Copy**, or **Select → choose pages → Copy → open another note → Paste**. It does not document a selected-page Export command. Copying pages into a temporary note and then exporting is an inferred workaround with extra administration, not a recommendation for this owner's low-friction requirement. [N3]

For selected ink, current docs establish **Select tool → circle ink → tap inside → Copy** and moving/grouping/converting it. They do not establish the exact external image payload or a selection-to-Share-Sheet recipe. An older search-indexed Select Tool guide describes dragging selected ink into another app as an image, but its live URL returned 404; that historical route is **unverified**, not current primary evidence. [N4]

**Audio:** recordings are synchronized to annotations for Note Replay. **Format → PDF → enable Recordings** shares a **ZIP containing the PDF and recordings**, not a PDF with portable embedded audio. **Note** format includes recordings in Notability's own format. No generic external replay of stroke/audio timing is promised by that ZIP documentation. [N6]

### Apple Freeform and Notes: low setup, different export limitations

**Freeform PDF, open board:** **Actions menu → Export as PDF → Board or Scenes if scenes exist → destination → destination-specific completion**. **Board** exports one page; **Scenes** exports one page per saved scene. No current-scene-only command is documented on this page. Creating scenes is extra setup, not a free page-selection step. [A1]

**Freeform selection image:** select and copy the intended items, then paste into another app; Apple explicitly states PNG output. Alternatively take a screenshot and share it from Photos. “Send a Copy” is a separate iCloud-link workflow; it is not the PDF/image payload a file receiver expects. [A1]

Freeform's current handwriting guide includes refinement, shape smoothing and optional math-result assistance. It remains capable of freehand working; do not confuse a cleaned-up or automatically solved result with the original independent attempt. [A2]

**Notes PDF, open note:** **Share → Markup** (possibly **View More** first) → optional markup → **Done** to save the PDF. The official export recipe ends in saving, not a documented direct LearnHarness-target handoff. Do not hide the resulting save/share steps in a claimed low tap count. [A5]

Notes' lasso supports cut/copy/delete/duplicate and **Copy as Text**, but the inspected guide does not establish an equivalent selection → PDF/image Share route. Copy as Text would discard the spatial mathematical working. Notes' PDF export also includes **only the first page of an attached multipage PDF or scan**; this caveat concerns embedded attachments, not a claim that every long handwritten note exports only one page. [A3][A5]

Notes can record audio while taking notes and separately save recordings; the inspected PDF guide does not promise transferring that audio with the PDF. A note's recording/transcript is not a LearnHarness tutor conversation. [A6]

### MyScript Notes / Nebo: conversion-oriented alternative

**Whole notebook or board:** **… → Export → Format → choose PDF/PNG/SVG/.nebo → background options if needed → Export**, then handle the destination. The vendor's guide ends at Export; it does not enumerate the final system-sheet confirmation. [M1]

**Selected notebook pages:** **… on a page thumbnail → Manage pages → tap intended pages → Export icon → Format → PDF/PNG/SVG → combine/background options if needed → Export**, then destination. Opening the thumbnail view, selecting each page, opening Format and choosing the format all add actions. [M1]

**Selected PDF pages:** **… on thumbnail → Manage pages → choose pages → Export icon → include/flatten annotations as needed → Export**, then destination. **Document** export has text/PDF/Word/.nebo formats rather than the notebook's PNG/SVG list. [M1]

Freehand selection is documented through Lasso and **Copy / Copy as…**. A direct selected-region PDF/image Share Sheet route was not established. Math can be written freely in notebooks/boards/PDFs and optionally converted; structured documents use inserted math objects. Solving settings are available in documents. Copying math as LaTeX is useful interoperability, not a substitute for preserving handwritten evidence. [M2][M3]

No recording-to-tutor or portable audio-with-PDF route was established in these MyScript Notes sources. **MyScript Math** is a separate product and is not silently substituted for Notes in this comparison.

## 4. Honest interaction budgets

Start with the intended document open. Counts below are **reconstructed lower-bound budgets**, not observed device results. They include export confirmation and selecting a receiver. They exclude writing time, but do not waive setup/format/page choices:

- **F** = every format-selection tap (including opening a menu); zero only if the correct remembered/default format is verified on-device.
- **R** = every region-selection tap; **O** = options/settings taps; **C** = receiver/session selection, Send/confirmation and permission taps after choosing the receiver.
- Add all scrolling, lasso/drag gestures, page navigation, thumbnail opening and return-to-writing actions. They are not counted as taps or assumed free.
- The hypothetical “LearnHarness” target must first exist. These counts do not show that it currently does.

| Route | Budget through receiver selection, plus completion | What the number does not establish |
|---|---|---|
| Goodnotes current page | **4 + F + O + C**: Share, Export This Page, export confirmation, receiver. At least **5** if choosing format takes one tap. | Dialog reconstruction from [G1][G2]; current controls/options persistence need a device check. |
| Goodnotes chosen pages | **5 + n + F + O + C**: thumbnails, Select, n page taps, Export, export confirmation, receiver. | Selecting a noncurrent page is not the short current-page route. [G1] |
| Concepts visible region/artboard | **4 + F + R + O + C**: Export icon, Export confirmation, preview Share, receiver. At least **6** with one format and one region tap. | Dropdowns can require more than one tap; zoom/framing and artboard setup add effort. [C1] |
| Concepts selected region | **5 + F + O + C**, plus lasso gesture: includes selecting the tool, Export icon, Export, preview Share, receiver. | Region is Selection automatically; selecting the right strokes still takes work. [C1][C2] |
| Freeform whole board/scenes | **3 + B + C**: Actions menu, Export as PDF, receiver; **B = 1** when choosing Board/Scenes. | Scene preparation and actual receiver confirmation remain additional. [A1] |
| MyScript whole board/notebook | **4 + F + O + C**: …, Export entry, Export confirmation, receiver. With Format then format choice, **6 + O + C**. | Destination step is inferred, not enumerated in vendor recipe. [M1] |
| MyScript n notebook pages | **5 + n + F + O + C**, plus opening thumbnails if necessary. For one page and two format taps: **8 + O + C**. | Includes both Export icon and final Export; no one-tap current-page route documented. [M1] |
| Notability Quick Share | **3 + C** for Options, Quick Share, receiver **only if** the existing output and whole-note scope are suitable. Otherwise format/page work is unquantified. | Current-page PDF/image delivery cannot be assigned a trustworthy total from these docs. [N1–N3] |
| Notes PDF | **3** documented taps to Share, Markup, Done, **then additional save/share/destination actions**; View More may add one. | This is not a complete no-picker handoff count. [A5] |

A Shortcut adds its selection from the system sheet and any scrolling/permission prompts; a native extension can add its own Send or destination control. The table already counts selecting a receiver once. It does **not** assume any particular confirmation policy for LearnHarness.

## 5. Receiving without a file picker

### Share Sheet Shortcut: documented building blocks, conditional integration

Apple documents enabling **Show in Share Sheet**, receiving the host app's input, and restricting accepted types to **Images / PDFs / Files**. **Files** includes PDFs, images and ZIPs. The user can select the Shortcut from the source app's system share sheet; no separate file selection is inherent. Shortcuts may require scrolling to reach. [S1][S2]

Apple also documents **Get Contents of URL → POST/PUT/PATCH → Request Body: JSON, Form or File**, with variables supplying the body. Therefore an exported PDF/image can plausibly become the input to an HTTP upload. A raw File body and a Form upload are different API contracts; the receiver and Shortcut must agree on fields, content type and response. [S3; composition is inference]

**Smallest conditional extension:** if the owner accepts app export friction, an export-to-Shortcut upload could provide a picker-free bridge before investing in a native app. That still needs a reachable receiving endpoint, authentication usable from Shortcuts, a selected destination session, and visible success/failure. An authenticated Safari session cannot simply be assumed to authenticate a Shortcut's HTTP request. None of those LearnHarness choices is selected here.

First-run access prompts are real setup cost. Apple documents **Allow Once / Always Allow / Don't Allow**; permission persistence can reduce subsequent prompts. Do not count them as absent until tested. An endpoint failure must not masquerade as “sent” merely because the Shortcut ran. [S4; failure interpretation is inference]

**One-button limit:** a Shortcut starting from a button/Pencil squeeze has no automatic proof of access to the notebook's current page. Apple documents **Settings → Apple Pencil → Squeeze → Shortcut → choose shortcut** for Pencil Pro and separately documents **Receive What's On Screen**. Neither source establishes that Goodnotes or Concepts provides the intended page/selection this way. No official current-page export Shortcut action was established for either app. [S5][S6]

A screenshot-based Shortcut is a possible separate experiment, but its capture action, framing, UI inclusion and payload would need verification. Do not present it as a demonstrated one-button page export. A screenshot can omit offscreen derivation steps even when it sends successfully.

### Native Share extension

Apple's Share extension point explicitly supports posting content to websites/upload services. The host supplies extension items/attachments; supported types can include a PDF. A receiver can use custom UI or the standard compose view with a Post/Send step. This is a documented path to an actual **LearnHarness** sharing destination without a picker. [X1][X2]

It requires native packaging containing the extension, plus receiving/authentication/routing logic. It does not remove Goodnotes/Concepts format or scope choices. Apple's archived guide documents background URLSession transfer and shared-container coordination; the current URLSession reference still documents background uploads. That establishes the mechanism, not a tested build or its delivery latency. [X1–X3]

### Safari Web Share versus Web Share Target

WebKit documents **Web Share Level 2** as sharing files **from a web page to an app**. Receiving files into an installed web app requires the separate **Web Share Target** capability. The WebKit implementation request was still **NEW**, unassigned, when retrieved. Consequently, adding a manifest `share_target` is not an evidence-backed iPad Safari solution. [W1][W2]

This is independent of having a Home Screen icon or standalone display. A Shortcut/native bridge could target a web-backed LearnHarness endpoint without relying on browser-native inbound sharing. That is a conditional architecture option, not selection of one.

## 6. Local integration and simultaneous voice

The coordinating session inspected the following in the working checkout on 2026-11-03, with HEAD `f65d1086d77ce21c862c57412f75a02b000195c3` and existing uncommitted work. These describe the inherited implementation in this checkout, not a fresh audit of upstream's remote branch:

- [`README.md`](../../README.md) describes desktop macOS/Windows/Linux delivery.
- [`src/core/input-events.ts`](../../src/core/input-events.ts), `ChatInput` lines 47–62, carries text/answer/thinking; no user-attachment event was found there.
- [`src/agent/tools/fs-shared.ts`](../../src/agent/tools/fs-shared.ts), lines 5–15, intentionally has the agent locate referenced host files rather than use an attachments system.
- Existing image reading in [`src/agent/tools/read.ts`](../../src/agent/tools/read.ts) and PDF-reading primitives are useful **after** a file reaches the host. They do not establish an iPad receiver.
- [`components/dictation.tsx`](../../components/dictation.tsx) uses microphone capture → AudioWorklet → Deepgram, buffering final segments until Stop. That is not live tutor turn-taking while the learner writes.
- [`app/api/graph/import/route.ts`](../../app/api/graph/import/route.ts), lines 43–59, accepts files but calls `file.text()` and imports subject notes into the knowledge graph. It is **not** an existing PDF/image-to-current-answer receiver. Sending handwritten PDFs there would not implement this workflow.
- [`src/agent/subagents/pdf-reader.ts`](../../src/agent/subagents/pdf-reader.ts) and [`headless.ts`](../../src/agent/subagents/headless.ts) supply PDF reading/rendering machinery; [`src/agent/tools/read.ts`](../../src/agent/tools/read.ts), lines 98–115, returns host image bytes as model-facing images. These are useful primitives, not an established handwriting interpretation quality result.

**Compatibility implication:** the smallest bridge worth considering could deliver original snapshots into agent-accessible host storage and associate them with the ongoing session, reusing existing reading tools. Whether this requires an explicit input-event extension, a file reference or another hook remains a design decision for the coordinator/owner. An upload's completion is also distinct from submitting an answer or requesting feedback.

### Same-iPad listening: plausible, not established by desktop tests

The existing microphone path calls `getUserMedia`, processes PCM through an `AudioWorklet`, and sends it over a Deepgram WebSocket. Final transcript segments accumulate until recording ends; then the target answer/composer receives them (`components/dictation.tsx`, lines 309–314, 376–381, 442–483). This can conceptually capture an explanation while the learner writes without needing the notebook app to record any audio. The user's clarification establishes simultaneous explanation, **not** a requirement for the tutor to interrupt/respond continuously before submission.

Two useful tests are **notebook and LearnHarness visible alongside one another**, and **notebook full-screen with LearnHarness backgrounded**. Neither has been tested on the owner's iPad. Do not infer that Safari always stops microphone capture in the background: WebKit's maintainer explicitly describes ongoing microphone capture as keeping a page active, while interruptions can mute capture and disrupt networking. A historical iOS AudioContext suspension issue was fixed; it is not evidence of a current blanket prohibition. A July 2026 WebKit fix again addresses audio-session lifetime during capture, but a landed WebKit change does not establish which installed Safari release includes it. [V1–V3]

The existing standalone math prototype has an additional **application-level** restriction: [`public/app.js`](conversational-math-prototype/public/app.js), lines 408–415, cancels on `pagehide` and interrupts dictation when `document.hidden`. Using that prototype unchanged in the background would therefore stop capture regardless of the browser's underlying capability. The production dictation file inspected above has no equivalent visibility listener; the two implementations must not be conflated.

**If native audio becomes necessary:** Apple documents background recording using an appropriate audio session and the `audio` background mode. Calls, alarms and other nonmixable audio sessions can still interrupt it. A native companion could own that capture while the notebook is foregrounded; a Share extension alone does not provide a persistent tutor/microphone client. A plain web-view wrapper must also be tested rather than presumed equivalent to native audio capture. [V4][X1]

A notebook recording, its transcript or a ZIP of recordings is an asynchronous artifact, not a substitute for capturing speech into the LearnHarness answer. The initial audio trial should leave the notebook's own recording off and test only LearnHarness capture; this isolates the actual requirement rather than relying on two apps capturing simultaneously.

The aim stays **iPad alone**. A phone/computer companion is a permissible fallback to investigate if it materially reduces first-working-version effort; it introduces its own association problem between the spoken explanation and the iPad snapshot. The owner has not chosen whether the tutor must see every stroke live or whether deliberate snapshots during explanation suffice.

### Smallest extensions and upstream impact

The following are comparisons, not approved implementation plans. Each builds on the existing text/thinking input, host-file reading and dictation described above.

| Candidate | Missing capability addressed | Smallest extension to investigate | Existing behavior / upstream compatibility |
|---|---|---|---|
| External notebook + Shortcut + iPad web client | No picker-free iPad upload into an ongoing session | Narrow snapshot receiver/storage and explicit session association; reuse image/PDF reading and existing dictation, then test alongside-app capture | Primarily additive transfer boundary; answer association/preservation still needs a small explicit integration hook. Export menus remain. |
| Same transfer + LearnHarness on phone/computer | Same-device audio/windowing may block a first trial | Reuse the transfer receiver, keep microphone and conversation on the other device | Avoids solving background iPad audio first; does not remove upload work or prove the iPad-only experience. A server running on the laptop with only an iPad UI is distinct from actively using two devices. |
| Native companion + Share extension | Actual app destination and, if required, native background voice | Native packaging, share receiver and possibly audio capture connected to the existing host/session | More platform/distribution maintenance; core teaching can remain inherited. Still cannot eliminate the notebook's export choices. |
| LearnHarness-owned writing surface | Source-app menus exceed the interaction budget; work and explanation need tighter association | Bounded handwriting/voice trial inside one client; native PencilKit is one documented building block | Gives control of snapshot/send behavior but adds editor, persistence and device work. A broader change than a receiver; not selected merely because external export is inconvenient. |

Apple's PencilKit supplies low-latency Pencil drawing, erasing and selection, with a `PKDrawing` that can be saved and rendered as an image. Thus an owned native writing surface need not mean building an ink engine from scratch. It still needs LearnHarness session integration, layout, storage and distribution; PencilKit is not a JavaScript component for the current Next.js frontend. Browser-canvas alternatives were not evaluated here. [P1][P2]

## 7. Conditional recommendation and decisive checks

**If page-based writing is preferred:** trial Goodnotes' current-page PDF/image export into a picker-free receiver. It has a clear scope command and avoids requiring mathematical recognition. The unresolved export-dialog overhead is smaller and better bounded than inventing a current-page route for every app. [G1][G2]

**If drawing/selection is preferred:** trial Concepts' selected PNG/flattened-PDF export; compare its documented selection drag/drop if an alongside receiving surface is feasible. Concepts is a credible writing-tool choice, but ordinary export is not the shortest route in the table. [C1][C2]

**If minimum setup wins:** include an already-available Freeform board. Its comparatively short PDF path may outweigh page organization or advanced pen features. Include Notability if already used or if a device trial can establish a suitable Quick Share default without continual scope changes. MyScript Notes is most justified by a desire for conversion, not by this handoff-friction evidence. [A1][N1][M1]

**If one button is an absolute ceiling:** none of these sources proves the desired complete external-app workflow. Investigate an automatic capture/source-app action or an app-owned writing surface separately, with owner approval. A native receiver alone cannot erase the source app's export menus.

Before choosing architecture, a small owner-authorized physical-device trial should answer the actual bottlenecks:

1. From pen-down working, send one page and one selected derivation/diagram. Count **all** format/page selections, export confirmations, Share Sheet scrolling, destination prompts and return-to-writing gestures on first use and repeated use.
2. Inspect what arrived: file versus URL, MIME type, page count/order, image dimensions, background/contrast, small subscripts, fractions, matrices, arrowheads and crossed-out work. Verify that both visible ink and intended context survived.
3. Confirm whether repeat exports preserve settings, replace earlier work or create separate snapshots. An overwriting cloud PDF is not automatically a retained history of learner attempts.
4. Pair the artifact with the explanation in the intended session, preserving ordering and distinguishing “attached working” from “submit for feedback.” The routing/default needs the owner's decision, not silent inference from whichever session was last open.
5. Test voice while actively writing, during export, and on return: alongside windows first, then full-screen notebook/background tutor; record iPadOS, Safari versus Home Screen mode, and app versions. Speak identifiable numbered phrases across transitions and check the complete transcript rather than trusting the microphone indicator. Include a longer thinking pause and an interruption/resume. Physical iPad acceptance cannot be replaced by desktop/browser checks.

**Recommended next investigation:** first measure Goodnotes current-page export and Concepts selection drag/drop on the existing Air/Pencil, alongside a LearnHarness dictation trial. These measurements can reject an over-budget workflow before implementing a receiver. If the export route is acceptable, the Shortcut bridge is the smallest implementation candidate; if the strict one-button/Share→target ceiling remains unmet, compare an owned canvas or verified source-app automation before investing in a native receiver. If audio alone blocks progress, the second-device fallback retains the same handwriting transfer work.

**Overall:** the promising first capability is **“send the working directly to the ongoing tutor conversation without file management.”** A Shortcut is a plausible small bridge, Goodnotes/Concepts are strong but different writing candidates, and voice must be evaluated as its own part of the same learning exchange. These findings authorize neither implementation nor a switch away from upstream teaching behavior.

## Sources

Primary sources retrieved on 2026-11-03 unless explicitly described as historical/indexed above. Vendor docs establish described features, not measured usability. Numeric prices are omitted because local price/plan eligibility was not verified.

### Goodnotes

- **[G1] Export documents or pages:** https://support.goodnotes.com/hc/en-us/articles/7353742824975-Export-documents-or-pages
- **[G2] Choose Between Editable and Flattened PDF Export:** https://support.goodnotes.com/hc/en-us/articles/8537070839183-Choose-Between-Editable-and-Flattened-PDF-Export
- **[G3] Select, Move, and Edit Content With the Lasso Tool:** https://support.goodnotes.com/hc/en-us/articles/7353695644175-Select-Move-and-Edit-Content-With-the-Lasso-Tool
- **[G4] Fix the Lasso Tool Showing Only Take Screenshot:** https://support.goodnotes.com/hc/en-us/articles/360001460175-Fix-the-Lasso-Tool-Showing-Only-Take-Screenshot
- **[G5] Can I Share my Audio Recordings?:** https://support.goodnotes.com/hc/en-us/articles/7352729730959-Can-I-Share-my-Audio-Recordings
- **[G6] Audio Transcription FAQs:** https://support.goodnotes.com/hc/en-us/articles/10234247292303-Audio-Transcription-FAQs-in-Goodnotes
- **[G7] Record audio while using other documents or apps:** https://support.goodnotes.com/hc/en-us/articles/7352668634127-Record-audio-while-using-other-documents-or-apps

### Concepts

- **[C1] Export, current manual:** https://concepts.app/en/manual/export — the `/en/ios/manual/export` URL also served this current manual when fetched.
- **[C2] PDF, current manual:** https://concepts.app/en/manual/pdf
- **[C3] The Pro Shop:** https://concepts.app/en/manual/the-pro-shop

### Notability

- **[N1] Sharing Notes (2026-08-21):** https://support.gingerlabs.com/en-us/articles/16300163-sharing-notes
- **[N2] Options menu:** https://support.gingerlabs.com/hc/en-us/articles/5955207226394-Options-menu
- **[N3] Content Manager and Bulk Actions:** https://support.gingerlabs.com/hc/en-us/articles/206059167-Content-Manager-and-Bulk-Actions
- **[N4] Handwriting and Math Conversion (2026-09-15):** https://support.gingerlabs.com/en-us/articles/16300114-handwriting-and-math-conversion
- **[N5] Getting Started with Notability:** https://support.gingerlabs.com/hc/en-us/articles/4867633230234-Getting-Started-with-Notability
- **[N6] Recording and Playing Audio (2026-08-24):** https://support.gingerlabs.com/hc/en-us/articles/206060617-Recording-and-Playing-Audio

### Apple working apps

- **[A1] Send a copy or PDF of a Freeform board on iPad:** https://support.apple.com/guide/ipad/send-a-copy-or-pdf-ipadfde4a50f/ipados
- **[A2] Draw or handwrite on a Freeform board:** https://support.apple.com/guide/ipad/ipadf825a0bd/ipados
- **[A3] Draw with Notes:** https://support.apple.com/en-us/108919
- **[A4] Enter formulas and equations in Notes:** https://support.apple.com/guide/ipad/ipad10f28bec/ipados
- **[A5] Export or print notes on iPad:** https://support.apple.com/guide/ipad/export-or-print-notes-ipad50c393a8/ipados
- **[A6] Record and transcribe audio in Notes:** https://support.apple.com/guide/ipad/ipadd0bde806/ipados

### MyScript Notes

- **[M1] Exporting and sharing your notes:** https://help.myscript.com/notes/export-sync-and-back-up/export-and-share/
- **[M2] Using math equations and formulas:** https://help.myscript.com/notes/create-content/math/
- **[M3] Selecting, copying & pasting your content:** https://help.myscript.com/notes/edit-content/select-copy-and-paste/

### Shortcuts, native sharing and web platform

- **[S1] Launch a shortcut from another app:** https://support.apple.com/guide/shortcuts/run-a-shortcut-from-another-app-apd163eb9f95/ios
- **[S2] Understanding input types:** https://support.apple.com/guide/shortcuts/input-types-apd7644168e1/ios
- **[S3] Request your first API:** https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios
- **[S4] Adjust basic privacy settings:** https://support.apple.com/guide/shortcuts/adjust-privacy-settings-apd961a4fc65/ios
- **[S5] Run shortcuts with Apple Pencil Pro:** https://support.apple.com/guide/shortcuts/run-shortcuts-with-apple-pencil-pro-apdbe445a3a2/ios
- **[S6] Receive onscreen items from other apps:** https://support.apple.com/guide/shortcuts/receive-onscreen-items-apd350ce757a/ios
- **[X1] Apple App Extension Programming Guide: Share (archived, 2017):** https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html
- **[X2] Handling Common Scenarios (archived, 2017):** https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html
- **[X3] URLSession, current API reference:** https://developer.apple.com/documentation/foundation/urlsession
- **[W1] WebKit: New WebKit Features in Safari 15, Web Share Level 2:** https://webkit.org/blog/11989/new-webkit-features-in-safari-15/
- **[W2] WebKit issue 194593, Add support for Web Share Target API:** https://bugs.webkit.org/show_bug.cgi?id=194593

### Hardware, audio and an owned writing surface

- **[H1] Apple Pencil compatibility (published 2026-10-27):** https://support.apple.com/en-us/108937
- **[V1] WebKit issue 204681, maintainer comment 5 (historical lifecycle explanation, not a current device test):** https://bugs.webkit.org/show_bug.cgi?id=204681#c5
- **[V2] WebKit issue 237878, iOS AudioContext background suspension; resolved fixed in 2022:** https://bugs.webkit.org/show_bug.cgi?id=237878
- **[V3] WebKit commit 316394@main, audio-session lifetime during microphone capture (2026-07-02):** https://commits.webkit.org/316394@main
- **[V4] Apple AVAudioSession record category, background recording and interruption behavior:** https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/record — full text retrieved from its Apple documentation JSON endpoint.
- **[P1] Apple PencilKit:** https://developer.apple.com/documentation/pencilkit — full text retrieved from https://developer.apple.com/tutorials/data/documentation/pencilkit.md
- **[P2] Apple PKDrawing, saving drawing data and generating images:** https://developer.apple.com/documentation/pencilkit/pkdrawing-swift.struct
