# Focused drills — specification draft

**Status: OWNER APPROVED FOR IMPLEMENTATION — 2026-10-29.** The owner approved the detailed plan and initial prompt, with later prompt refinement expected after getting the feature working.

Based on the owner-approved [fork vision](fork-vision.md), [drill-feasibility resolution](https://github.com/bearthababe/learnharness/issues/8#issuecomment-6500648070), and subsequent design conversation on 2026-10-29. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md).

Tracker specification: [Focused conversation-led drills — specification draft](https://github.com/bearthababe/learnharness/issues/11).

## Problem Statement

During study, a specific difficulty can obstruct a larger task: for example, converting units while working through hydraulics. Ordinary practice deliberately mixes targets. The learner wants a separate place to work on a particular difficulty, receive useful scaffolding and apply it repeatedly, while retaining the familiar practice interaction.

The fork must keep upstream updates practical. The first drill version should require small, explicit changes to shared code and expose likely rework when supported plugins arrive.

## Solution

The learner starts a separate drill and describes what they want to practise. It uses the existing one-problem-at-a-time practice flow: the learner submits reasoning, discusses difficulties, concludes a problem with its prepared solution revealed, and chooses when to move to the next problem.

The drill tutor can adapt its help: hints, a direct explanation or a useful mental model, followed by the learner applying the idea. Focused variations can develop understanding and fluency. Unit-ratio cancellation is one example; drills are not limited to unit conversions.

The tutor uses recent work to recommend whether to wrap up or continue and explains its recommendation. The learner decides. Immediate improvement is described as progress in the drill, not proof of lasting mastery.

The conversation and drill identity survive leaving and resuming. Teaching and drills remain separate initially; unified tutor understanding across activities is the long-term direction.

## User Stories

1. As a learner, I want to start a drill myself, so that I can address a difficulty without waiting for a tutor prescription.
2. As a learner, I want to describe what I want to practise in my own words, so that the drill addresses my current need.
3. As a learner, I want drills to be distinguishable from ordinary practice, so that I know which kind of learning activity I am entering or resuming.
4. As a learner, I want focused work on a particular difficulty, so that I can give it attention without repeatedly switching targets.
5. As a learner, I want varied examples of the target skill, so that I practise applying an idea rather than memorizing one answer.
6. As a learner, I want the existing practice interaction, so that I can work with familiar controls.
7. As a learner, I want to submit reasoning as well as answers, so that feedback addresses how I reached my conclusion.
8. As a learner, I want help suited to where I am stuck, so that I can make progress without a rigid hint sequence.
9. As a learner, I want useful mental models when they help, so that I have a way to reason through the difficulty myself.
10. As a learner, I want to apply an explanation or model in further work, so that receiving help leads back to my own thinking.
11. As a learner, I want room for side questions about a problem, so that I can clarify the underlying idea before moving on.
12. As a learner, I want the prepared solution revealed when a problem is concluded, so that I can compare it with my work using the existing practice flow.
13. As a learner, I want to choose when the next problem begins, so that I control the pace.
14. As a learner, I want the tutor to suggest whether more work would be useful, so that I can make an informed decision about finishing.
15. As a learner, I want the final choice to stop or continue, so that the tutor's recommendation does not take over my session.
16. As a learner, I want my work, help received and outcomes retained, so that I can inspect what happened and resume later.
17. As a learner, I want a long drill to keep its purpose and useful learning context, so that conversation summarization does not turn it into ordinary practice or erase important distinctions about my work.
18. As a learner, I want helped and independent success distinguished, so that feedback does not overstate what I demonstrated.
19. As an owner, I want to revise the drill's teaching instructions with the coding agent, so that we can improve the approach through actual use.
20. As an owner, I want ordinary teaching and practice to retain their baseline behavior, so that adding drills does not silently change those experiences.
21. As an owner, I want shared-code changes and likely plugin migration work made explicit, so that I can judge maintenance cost before approving implementation.

## Implementation Decisions

### Accepted direction

- Reuse the existing practice machinery and interaction, with drill-specific instructions and a persisted distinction for drill sessions.
- Offer **Drill** alongside teaching and practice on both the home screen and the sidebar, using the existing start-a-conversation pattern.
- Select drill guidance per session rather than globally replacing ordinary practice instructions.
- Keep the drill teaching guidance easy to identify and revise through the coding agent. The first version does not require an in-app instruction editor.
- Revised drill instructions apply to new and existing drills from the next tutor response. Earlier messages and work remain as recorded.
- Compatibility with an older, unmodified upstream app is outside this first version. The owner accepted that an older app may ignore the drill distinction and treat such a record as ordinary practice; no extra compatibility guard is required.
- Allow adaptive help within drills. Ordinary practice keeps its own interleaving and gradual-help approach.
- Use the existing conversation record to retain work and outcomes. Cross-activity use of drill evidence is deferred.
- Preserve drill identity across reloads and long-conversation summarization, using the context-preservation design in the approved implementation plan.
- Keep feature-specific behavior concentrated, with narrow, explicit connections to shared session creation, persistence and agent instruction composition.
- Review any expansion into deeper core changes separately under the small-hook policy.

The saved representation, creation interface, initial instruction wording and compatibility behavior are approved in the implementation plan linked below.

## Testing Decisions

The owner approved both automated checks and a real learner walkthrough.

### Automated checks

Prefer the existing session-creation and chat-request interfaces, backed by real isolated test storage and a scripted model. Exercise complete observable flows rather than mirroring internal functions or relying on snapshots of instruction wording.

Verify:

- A drill can be created and recognized when reopened.
- The problem, learner reasoning, discussion, conclusion, solution reveal and explicit next-problem flow work through the existing machinery.
- Saved work and outcomes remain inspectable after reload; an active problem can be continued.
- Drill identity and the intended instructions reach the model after resume and after a scripted long-conversation summary.
- The summarizer receives the required drill context, and the persisted full record remains available. A scripted summary verifies wiring, not the quality of a real model's summarization.
- Drill guidance is isolated from ordinary practice and teaching, including older records without the new distinction.
- Changing model settings or saving later turns does not lose the drill distinction.
- Prompt-token accounting includes whichever instructions the session actually receives.

Prior art: the existing practice-flow integration suite, session-kind persistence checks, new-session creation/rendering checks, practice rendering/record tests, and compaction service tests. Use targeted rendering checks for changed entry and identification surfaces alongside the session flow tests.

### Learner walkthrough

Use unit conversions as a concrete acceptance example:

1. Start a drill and work on a conversion.
2. Encounter a genuine difficulty and inspect whether the tutor provides appropriate help.
3. Use a helpful explanation or mental model, such as arranging a conversion ratio to cancel unwanted units.
4. Apply it to fresh examples, observing whether feedback distinguishes helped work from independent success.
5. Ask a side question and continue at the learner's chosen pace.
6. Consider the tutor's recommendation to wrap up, and exercise the choice to continue or stop.
7. Return to the saved conversation and check that it remains useful and recognizable as a drill.

Judge correctness, useful adaptation, clarity, pacing and the quality of the wrap-up recommendation. Automated scripted results do not establish teaching quality. If long-session summarization changes, include representative real-model review of whether important drill context survives.

## Out of Scope

- Automatic tutor prescription or launch from a teaching session.
- Automatic reuse of drill results by teaching, a shared learner-evidence engine or a new mastery model.
- A required manual transfer/recap workflow between drills and teaching.
- A dedicated rapid-answer interface; this remains an option to explore later.
- An in-app drill-instruction editor.
- Delayed-review scheduling or mixed-topic test workflows.
- A general plugin framework or commitment to an unreleased plugin interface.
- Extra record/versioning machinery to prevent older, unmodified upstream apps from treating drill records as ordinary practice.
- Replacement of the conversation runtime, practice tools or broader device experience.

## Further Notes

### Implementation choices resolved in the approved plan

- How saved drills are identified in existing navigation.
- How the persisted drill distinction is represented and validated, including whether an existing session can change activity. Older-upstream compatibility is explicitly outside scope.
- Exact drill instructions, their interaction with shared guidance and practice tool descriptions, and how adaptive assistance is accurately recorded using existing outcome/hint fields.
- What drill context the summary must retain and how that requirement is passed to the summarizer.

The owner approved these choices and implementation. Work is split into [the drill flow](https://github.com/bearthababe/learnharness/issues/12) and [long-conversation continuity](https://github.com/bearthababe/learnharness/issues/13), which depends on the flow.

The [approved implementation plan](drill-implementation-plan.md) records these choices, exact edit areas and the initial instruction wording.

### Upstream impact and plugin migration

The [feasibility impact table](https://github.com/bearthababe/learnharness/issues/8#issuecomment-6500188116) identifies the concrete shared-code areas inspected at checkout `b577ec5`. The implementation plan must give the exact proposed edit footprint against its working checkout.

Session creation/navigation, saved-record integration, instruction injection and summarization connections are expected migration-sensitive areas. Drill guidance is more plausibly reusable. Future supported plugin interfaces must be assessed when available; the existing internal interfaces do not guarantee a drop-in move.

### Learning-design reference

Scott H. Young's [“I Wrote Ultralearning. This is What I’d Change Because of AI”](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/) is a saved reference for varied focused practice, direct application and intuition-building. It informs the discussion; its suggestions are not automatically additional feature requirements.
