# Focused drills — proposed implementation plan

**Status: OWNER APPROVED — 2026-10-29.** The owner approved the choices and initial prompt wording below, asking to get the feature working before further prompt refinement. The proposal text is retained as the implementation baseline; teaching quality remains subject to the agreed walkthrough.

Specification: [Focused conversation-led drills](https://github.com/bearthababe/learnharness/issues/11), with a local draft in `docs/drill-spec.md`. Inspected checkout: `b577ec5`.

## 1. Proposed user experience

- Add **Drill** beside **Teach / Practice** on the home screen and beside **Teaching / Practice** in the sidebar (placement already approved).
- Use the current practice icon and styling for the new launch controls, with the visible label **Drill**.
- Sidebar launch opens `/chat/new?mode=drill`. The draft heading is **New drill**, description **Describe the skill or difficulty you want to work on.**, and input placeholder **What do you want to drill?**
- Create the saved session only on the first send, as today. Use the same draft handover, model selection and retry behavior.
- Show **Drill** in the conversation header. In saved-session rows, use a visible **Drill** tag in the existing trailing practice-icon position; leave titles user-editable and free of automatic prefixes.
- Drills remain included in the current practice filtering behavior. A separate drill filter can be considered later.
- Reuse existing graph-selection controls where already present in the practice start flow. Selected subject content may accompany the opening message; it is not evidence of learner mastery. Add no graph-to-drill prescription workflow.
- Use the existing practice problem, thinking, discussion, conclusion, reveal and Next interactions.

## 2. Saved representation and creation

Propose the optional field `practiceMode?: "drill"` on the existing chat record and summary. A drill carries `kind: "practice"` and `practiceMode: "drill"`. Absence means ordinary practice when the kind is practice; the default teaching interpretation stays as it is.

- Keep the existing record version and storage location. No migration job or old-app compatibility guard.
- Set the distinction at creation. No switching an existing session between teaching, practice and drill in this first version.
- Extend the existing creation port to `createChat(title, kind?, practiceMode?)`, with the final argument optional and valid only for practice.
- The existing create endpoint accepts the optional field. If supplied with a value other than `"drill"`, or without `kind: "practice"`, return status 400 with `error: "Invalid drill configuration"`. Validate before creating a record. The store also rejects inconsistent combinations before writing.
- Home and draft send the same creation payload for drills. The existing retry identity includes the payload, so changing activity cannot reuse a session created for a different activity.
- Keep the marker outside model/thinking settings, whose writes replace that settings object.
- Pass the saved distinction to the chat view and agent build; carry it through the existing session-summary projection. Future turns always derive the activity from the saved record, not a request's claimed mode.
- Older upstream builds may ignore the new field and run the conversation as ordinary practice. The owner explicitly accepted that limitation for this version. Compatibility with future upstream format changes will be assessed when integrating them.

## 3. Drill instructions and tool reuse

Propose a small drill-specific instruction loader at `src/agent/drill-instructions.ts` and one teaching-policy file at `src/agent/prompts/drill/10-drill.md`.

- The existing practice agent remains the runtime. Add the optional practice mode to agent build options and the instruction-composition call.
- For drills, compose the dedicated drill file followed by the same approved shared voice, accuracy, mental-model and formatting fragments used by practice. Honor existing enabled overrides for those shared fragments.
- Do not compose the ordinary practice base or doctrine into drills: both contain restrictions conflicting with adaptive help or focused repetition. Ordinary practice keeps its existing composition.
- Keep the drill directory outside ordinary practice's automatic fragment discovery. Its policy is code-maintained initially, not registered as a new editable agent in the settings UI.
- Read the drill policy afresh at each agent construction. An instruction change applies from the next tutor response, including for existing drills; historical messages remain unchanged. A response already in flight completes with the instructions it started with.
- Reuse the same practice tools and record shapes. For drills only, adjust descriptive tool wording that requires hiding the target or implies hints must follow an ordered ladder. Execution gates, required fields and result handling stay shared.
- Retain the existing demand categories, outcomes and assistance fields. Treat the assistance rung as a description of the most revealing help actually given, not a mandatory sequence. Record detail in the verdict and conversation; never invent an unassisted success after supplying relevant help.
- Both pre-turn and post-turn context-size estimates must use the drill composition and its effective shared overrides for drills.

### Proposed drill-policy text

The following is candidate wording for owner approval, not an already installed prompt:

> You run a separate, optional drill on the skill or difficulty the learner brings. Build understanding and usable fluency through focused work. Use the learner's stated goal and this conversation as your evidence; graph content describes subject matter, not demonstrated mastery.
>
> Start with a relevant, manageable problem when the request is clear enough. If the target is too unclear to choose useful work, ask a brief clarifying question. Adapt later problems to the learner's reasoning and outcomes. Focused repetition is allowed; vary examples so success is not merely recall of a previous answer. Use meaningful application when it helps check whether the practiced idea is becoming usable.
>
> Give the help that best fits the difficulty: a hint, a short explanation, or a useful mental model. You may introduce a model directly when that is helpful, from arranging a unit ratio to a larger conceptual picture. Then return to the learner's own reasoning and application. There is no required hint ladder. Distinguish a slip, unclear problem, missing prerequisite and misunderstanding rather than assuming every error has the same cause.
>
> Use the existing problem tool for every exercise. Work out and check a complete model solution before posing; it is the prepared solution revealed at conclusion. Choose the existing category that fits the demand: recall brings an idea or procedure to mind; discrimination chooses between confusable alternatives; composition combines steps or ideas. Include graph proposition targets only when known; otherwise omit them. One problem may be active at a time. Posing ends your turn so the learner can work.
>
> Read submissions as reasoning in progress, a question, or a claimed answer according to their content. Respond to the reasoning and give accurate feedback. Do not treat a wrong attempt as permission to reveal the prepared solution or finish the problem. Conclude when the learner solves it or explicitly chooses to end it, using the existing outcome meanings. Credit assistance honestly: success after help is not independent success. The assistance rung describes the most revealing relevant help actually given; it does not prescribe an order. Use the verdict and conversation to explain what support was provided and what the learner then did.
>
> For the assistance field, use the existing descriptions: R0 redirects attention; R1 redescribes the pattern; R2 narrows the candidate class; R3 names the relevant proposition; R4 outlines a move; R5 supplies a worked step. Use null only when no help was given. These are coarse descriptions of assistance, not a mastery score; where an explanation spans categories, record its most revealing relevant part and describe the actual help in words.
>
> Concluding reveals the prepared solution and ends your turn after any useful closing words. Wait for the learner's explicit request or Next action before posing another problem. Answer side questions and explain useful models during the pause without treating those questions as permission to move on. Respect a dismissed problem and the learner's choice of whether to continue.
>
> Use recent work on fresh examples to judge whether further practice would be useful. Suggest wrapping up when the targeted difficulty appears to have eased, and briefly explain the evidence and any uncertainty. The learner decides whether to stop or continue. A suggestion to finish never overrides a request to keep working. Do not impose a fixed number of problems or a mastery threshold, and do not claim lasting retention from immediate performance.
>
> Keep the conversation useful to resume: the target, significant reasoning, assistance, useful models, unresolved difficulties and next step should remain understandable from the record. Earlier session history is evidence of what happened, not a reason to continue using an older teaching policy when current instructions differ.

Common voice, accuracy, thinking-field and formatting guidance follows this policy through the existing shared-fragment mechanism. Preserve the current tool/runtime rules for available file, graph and research tools, including their availability gates.

## 4. Long-conversation summaries

- Pass the saved practice mode through both compaction entry points to the existing summary-prompt builder.
- Retain the current four-section summary format. For drills, add specific instructions within that format to retain: the target and learner preferences; useful mental models and their application; significant errors and corrections; actual assistance versus independent success; outstanding retests or commitments; the current problem and the learner's chosen next step.
- Candidate additional wording: **“This is a focused drill. Preserve its current target and learner preferences, useful mental models and whether the learner applied them, significant errors and corrections, the help actually given, independent successes, unresolved difficulties, outstanding retests or commitments, and the current problem and agreed next step. Keep uncertainty explicit; immediate success is not evidence of delayed retention.”**
- Keep the full transcript on disk under the existing compaction behavior. The model-facing summary is a working context, not a replacement evidence record.
- Keep ordinary teaching/practice summary prompts unchanged when the drill distinction is absent.

## 5. Expected edit footprint and migration exposure

These are shared upstream edits, even where each change is small. The feature is isolated in behavior, not confined to one file.

| Area | Expected files | Change / update burden | Future plugin migration |
|---|---|---|---|
| Saved activity and creation | `src/core/contracts/chat.ts`, `src/core/ports.ts`, `src/store/chats.ts`, `app/api/chats/route.ts` | Add and validate one optional marker; follow upstream record/creation changes | Storage bridge likely adapts; moving records may need a migration |
| Launch and draft | `components/home.tsx`, `components/sidebar.tsx`, `components/new-session.tsx`, `components/start-session.ts`, `app/chat/new/page.tsx` | Add Drill to existing choices and payloads; localized UI/route conflicts | Launch wiring likely replaced by plugin registration |
| Saved labels | `app/chat/[id]/page.tsx`, `components/chat.tsx`, `components/sidebar.tsx` | Carry marker to existing views and display label | Host-view wiring likely replaced or adapted |
| Agent construction and tools | `src/server/chat-handler.ts`, `src/agent/teacher-agent.ts`, `src/agent/tools/practice.ts` | Conditional instructions and descriptive tool wording; follow upstream agent/tool evolution | Host injection likely replaced; tool access depends on supported hooks |
| Drill-owned instructions | new `src/agent/drill-instructions.ts`, new `src/agent/prompts/drill/10-drill.md` | Concentrate fork-specific teaching policy; track any inherited tool contracts | Policy plausibly reusable; loader likely adapts |
| Summaries and estimates | `src/core/compaction.ts`, `src/server/compaction.ts`, `src/server/chat-handler.ts` | Carry mode and preserve drill context; follow summary lifecycle changes | Lifecycle integration likely adapts |

Estimated footprint is about 16 existing production files plus two drill-owned files, before tests. This is a localized change at several shared interfaces, not zero-impact integration. A new native chat kind, new runtime or new general plugin framework is not part of this proposal.

## 6. Verification and delivery

Use the owner-approved automated and learner-walkthrough approach in the specification.

- Add a vertical integration scenario through create, first turn, work, help, conclude, reopen and continue. Use isolated temporary data and a scripted model while exercising actual activity selection and persistence.
- Check launch payloads and labels at existing UI test interfaces. Cover retry identity when changing the selected activity.
- Check that ordinary practice receives its baseline instructions while drills receive focused/adaptive guidance. Keep tests about effective behavior and model-facing inputs rather than exact paragraph snapshots.
- Verify that changing the drill policy is visible to a newly built agent for an existing drill, with earlier transcript records intact.
- Cover summary-prompt context, record preservation, post-summary drill selection and prompt-size accounting using the existing compaction test interfaces. Scripted tests do not prove real summarization quality.
- Check accurate recording of helped versus independent outcomes using the existing practice record/tool shapes.
- Run the relevant tests, repository typecheck and lint; run the repository test suite once after the completed change. Address failures in scope and distinguish pre-existing failures.
- Review the real unit-conversion drill with the owner, including an explanation/model, fresh application, a side question, resume and a wrap-up recommendation. If the summary changes, inspect a representative long-session summary with a real model as part of that review.
- Follow the repository's existing mobile chat-scrolling and preview requirements for the changed chat surfaces. Phone/touch acceptance is distinct from desktop or emulated checks.

Implementation is approved. Read the relevant installed Next.js guides before writing application code. The owner-approved tickets are [Start, use and resume focused drills](https://github.com/bearthababe/learnharness/issues/12) and [Preserve drill context through long conversations](https://github.com/bearthababe/learnharness/issues/13), with the latter blocked by the former.
