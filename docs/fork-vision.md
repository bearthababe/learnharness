# Fork vision — building on LearnHarness

**Status: OWNER APPROVED — 2026-10-29.**

This document consolidates the owner's vision interview and individual agreements. The owner approved the complete document on 2026-10-29. Vision approval, feature selection and implementation approval are separate decisions.

## 1. Purpose and success

**Maximize understanding built per unit of mental effort.**

Learning should demand thought, not administration. Put effort into reasoning, explaining, recalling, applying and experimenting; let the system handle useful context and learning logistics.

> Understand deeply enough to teach it, apply it independently, and retain it over time.

Teaching an idea in one's own words can reveal gaps. It is one way to demonstrate understanding, not a compulsory activity after every step. Immediate clarity, a fluent explanation or a correct guided answer alone does not establish independent application or retention.

The owner uses “obviously true” as shorthand for this broader understanding–application–retention goal. Upstream's teaching theory uses the phrase more specifically for self-evident understanding, with practice developing usable retrieval. Preserve that distinction when interpreting upstream documents.

## 2. Upstream is the baseline

**Owner-approved experience direction:**

> Retain upstream’s adaptive, conversation-led learning, with excellent presentation and tools for reading, experimenting and doing your own work.

The owner likes how upstream works. Build on that experience and tune it through actual learning. Bring useful ambitions from v2_2 into this foundation; its fixed lesson hierarchy, runtime and screen structure are not selected fork requirements.

### Current upstream concepts

Use upstream's meanings as the starting point for domain design:

- **Teaching session:** a resumable conversation that clarifies the goal, probes prerequisite understanding, plans and teaches.
- **Teaching plan:** a revisable, session-scoped dependency map. Its nodes are landmarks along the teaching route.
- **Practice session:** a separate conversation exercising retrieval and application through varied problems and adaptive hints.
- **Knowledge graph:** shared propositions and reasoning chains extracted from teaching and imported notes, with their origins recorded. It represents encountered subject matter, not demonstrated learner mastery.
- **Learner evidence:** answers, reasoning, confidence and assistance/outcomes retained in session records. Reusing that evidence meaningfully across separate sessions is an extension this fork wants to strengthen.

A plan node is not automatically a graph proposition. A visited landmark or encountered proposition does not prove understanding. Upstream has no explicit course → lesson → session hierarchy to preserve or reproduce. These are descriptive distinctions, not a newly approved glossary or data model.

### Keep upstream updates practical

**Owner-agreed direction:** minimize invasive changes to upstream so its updates remain practical to adopt. Prefer extensions through upstream's plugin system as much as possible once it is released.

**Pre-plugin prioritization policy — owner agreed:** favor isolated feature logic with small, explicit integration hooks. Defer deeper core changes unless the owner separately agrees that the learning benefit justifies them. Prioritization should expose core impact, upstream-update burden and likely plugin-migration work, including any parts that may need rewriting.

The inspected upstream direction describes plugins as future functionality; a released supported plugin interface was not established by the research. Specific extension boundaries and any necessary core changes need later design. The preference for plugins does not itself select an API or delivery schedule.

### How this vision governs the fork

This approved vision governs the fork's additions and deliberate differences. Upstream remains the baseline elsewhere. v2_2 and historical upstream documents provide source material and reasoning; their unadopted choices do not become fork requirements automatically.

## 3. Learning from a reference toward a goal

The learner can supply a reference, such as a book, and a goal, such as learning linear Kalman filters. The agent uses the reference for **notation, jargon and required knowledge**, then builds a path from the learner's current understanding toward that goal.

This is the owner's intended meaning of a source-backed, goal-driven **course**. A fixed lesson sequence or book-prescribed teaching order is unnecessary. Detailed domain representation remains open.

The purpose of the reference is useful alignment with the material. A general citation or source-traceability requirement has not been adopted. This is separate from the agreed ability to inspect evidence behind judgments about the learner.

## 4. Teaching and practice

Retain upstream's approach, including these individually reviewed rules:

1. **Find the prerequisite boundary before teaching.** Locate understood and not-yet-understood territory on every relevant prerequisite strand. Use answers, reasoning and confidence; a single miss does not establish a misconception.
2. **Check each reasoning step.** Follow step → check → repair-or-continue, checking understanding before building on the step. Revisit the rhythm later if experience shows a need.
3. **Choose discovery or direct explanation per step.** Favor a learner attempt when they can plausibly reason their way to the idea. Explain directly when appropriate to their current reach, energy or request. Check understanding either way.
4. **Keep ordinary practice mixed.** Retain upstream's interleaving approach. Focused-repetition blocks belong in separate drills.
5. **Give gradual, minimal help in ordinary practice.** Give the smallest useful hint and increase help gradually. A wrong answer prompts feedback and continued work, rather than automatic solution revelation or conclusion. Continue until the learner solves the problem or explicitly asks to end it.

Upstream's learning flow plus the optional drill mode below covers the support direction. The owner considers this sufficient; v2_2's broader support-choice workflow is not carried forward as an additional requirement.

**Owner-pinned agent-autonomy principle:**

> Keep upstream’s teaching approach. Give agents useful context and tools, and freedom to adapt within it. Add restrictions when there is a concrete reason.

This gives agents freedom to select useful explanations, research and tools, and adapt the plan within the teaching approach. Further teaching-policy changes remain proposals for owner review.

**Owner clarification — mental models as scaffolding:** useful mental models belong in general teaching and are especially valuable when a difficulty arises, including during drills. They can scaffold the learner's own work at different scales: from arranging a unit-conversion ratio so unwanted units cancel and the desired unit ends up in the required position, to larger conceptual models. Drills can introduce and help the learner apply these models as well as provide focused repetition.

## 5. Optional drills, delayed review and on-demand checks

### Drills

Drills are a **separate, optional activity outside the main learning flow**. The tutor can prescribe different kinds when it identifies a need; the learner chooses whether to undertake them.

Focused repetition is one drill method. Concrete needs include unit conversions and using useful mental models. Prerequisite chaining is another possible method: trace a difficulty back to understood ground, then build forward. It is optional, can take time, and may combine with rapid problem practice or other methods.

Relevant Ultralearning methods should be investigated when designing drills. The owner's description is not an independently verified attribution of the exact term “prerequisite chaining” to that book. Drill methods and help policies remain later design work.

### Delayed review

Review should revisit **understanding and application as well as factual recall**, using varied, fresh activities appropriate to the capability: explaining, deriving, calculating or applying knowledge in an unfamiliar situation.

Immediate improvement or successful helped practice is distinct from retention demonstrated after a delay. Review scheduling and intervals remain open.

### On-demand checks

The learner can request checks across selected studied topics or subjects to find out what they can independently explain or apply. Results contribute to the same learning history that informs teaching and review.

Test mechanics, feedback timing and any relationship to review scheduling remain later decisions. v2_2's specific test defaults have not been adopted.

## 6. One continuing, evidence-informed learning journey

Side questions, teaching, practice and later study should contribute to a coherent view of what the learner understands and needs next. Returning should preserve useful position, reasoning and unresolved difficulties.

Keep **lasting, inspectable and correctable learning evidence**:

- Preserve original work, reasoning, actual assistance, uncertainty and assessment revisions.
- Distinguish independent success, helped correction and later retention.
- Investigate apparent difficulties, including slips, misunderstandings, ambiguous questions and input-reading errors.
- Let the learner inspect and challenge conclusions about what they know.
- Revise conclusions when new work or a corrected assessment warrants it, while preserving their history.

Preserve upstream's conversational experience. How findings are presented and represented remains later design; this commitment does not select v2_2's separate formal assessment workflow or mastery model.

### Explore and find earlier learning

The owner strongly wants to explore learning evidence alongside connections between ideas, seeing demonstrated understanding and uncertainty to help decide what to explore or revisit.

**This must align with upstream.** Start with its propositions and reasoning chains and preserve the distinction between subject content and learner evidence. Their relationship needs domain alignment before design; no v2_2 concept/objective model or graph layout is selected.

Search should help the learner find earlier explanations, sources, original work and feedback across sessions, and return to the relevant context.

## 7. Presentation, working tools and devices

Excellent presentation and tools belong within the agreed conversation-led experience: readable mathematics, useful diagrams and interactive demonstrations, with room to read, experiment and do independent work. The experience should be calm and coherent enough for real study. Passing engineering checks alone does not establish that quality.

**Typed, spoken, handwritten and mixed work are first-class learning inputs**, including photos and PDFs. Preserve original work, examine reasoning rather than only final answers, and clarify uncertain interpretation before assessment.

Long term, learning should be **seamless and device-optimized**: one continuing journey using whatever device is available, with suitable activities and inputs. A phone may suit spoken explanations or short responses; an iPad may suit written equations and derivations. These are examples, not fixed restrictions.

Native/web delivery, input technologies and synchronization remain open. Specific layouts and refinements should build on the upstream experience the owner already likes.

## 8. Teaching that improves for this learner

Reflection happens **automatically in the background while learning can continue**, using learning conversations and any optional learner feedback. It investigates helpful and problematic behavior across:

- Teaching.
- Assessment.
- Learning activities.
- App friction.

Reflection produces findings and improvement proposals. Evaluate proposed behavior changes against the current approach before a learner-facing trial, using representative cases covering the issue and existing good behavior. Evaluation and the learner's actual experience provide different evidence.

Feedback about the system is distinct from assessment of the learner. Adopting changes is a separate decision under owner control. Reflection triggers, trial mechanics and adoption workflows belong to later scoped design, rather than blocking vision alignment.

v2_2's detailed evaluation, versioning and trial policies remain references for that work. The fork's baseline is upstream's teaching approach plus the explicit agreements here; no competing philosophy-selection system is adopted.

## 9. Ownership and recovery

Keep learning records under the learner's control. Support **complete backup and restoration of learning history and unfinished work**, including original attempts, feedback and corrections.

Storage, backup and synchronization mechanisms remain later decisions alongside the cross-device ambition. v2_2's particular database and runtime choices are not selected for this fork.

## 10. First useful experience and later ambitions

The owner previously confirmed this as sufficient initially, provided it works as a coherent, pleasant learning experience:

**Reference and goal → establish the starting point → explanations and side questions → relevant practice and trustworthy reasoning feedback → return with useful position and evidence retained.**

Scheduled delayed review and full device optimization can follow that initial experience. The other long-term ambitions above do not by themselves become first-release requirements. Feature order and bounded implementation plans still require owner decisions.

### Hydraulics observations and candidate ideas

These remain observations and ideas, not approved feature commitments:

- Dictation is particularly liked.
- Interactive demonstrations are useful, but their size can separate controls from results; the learner wants to see a change and its effect together.
- Unit conversions, relationships between units/work/energy and useful mental models supply concrete material for future drill and review design.
- A mathematical notebook could render spoken equations while preserving mistakes, with calculation as a separate capability.
- Read-aloud and subject/course-related podcast-style audio could support learning while walking.

## 11. Approval and subsequent work

**Owner approved this consolidated vision on 2026-10-29.** Implementation plans still require separate owner approval.

Before defining fork extensions, capture source-backed upstream domain vocabulary, especially the relationship between propositions/chains, learning evidence, drills and review. The accepted [focused-drill feasibility decision](https://github.com/bearthababe/learnharness/issues/8#issuecomment-6500648070) provides the direction for the next bounded design and implementation plan. Broader priorities remain on the [low-impact integration planning map](https://github.com/bearthababe/learnharness/issues/9).

Detailed schemas, assessment rules, extension APIs, review algorithms, trial mechanics, UI designs and delivery architecture remain later design questions. They should be resolved when needed for scoped work, with owner approval, rather than expanded into the vision interview.

## Sources and alignment record

Owner statements in this interview establish the fork agreements. The sources below explain their upstream and v2_2 context; linking a source does not adopt every rule it contains.

### Learning-design reference

- Scott H. Young, [“I Wrote Ultralearning. This is What I’d Change Because of AI”](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/) (April 2026; consulted 2026-10-29). Saved at the owner's request during drill-feasibility planning. In **Principle #4: Drill**, Young discusses isolating or emphasizing components of a complex skill and using AI to generate varied practice of the same underlying skill. **Principle #3: Directness** emphasizes practising the actual target skill; **Principle #8: Intuition** discusses explanations and follow-up questions that expose gaps while preserving the learner's own thinking. This is the author's later commentary, not the book's drill chapter or independent validation of learning outcomes.

### Upstream

- [README at the inspected upstream snapshot](https://github.com/amosblomqvist/learnharness/blob/3dd52110bbcbcba81645453ce0a8fdc230594c47/README.md) and [official site](https://learnharness.ai/): public direction inspected on 2026-10-28.
- [Teaching theory](teaching-methodology.md), [probe doctrine](../src/agent/prompts/prober/10-probe-doctrine.md), [planning](../src/agent/prompts/teacher/10-planning.md), [teaching](../src/agent/prompts/teacher/20-teaching.md) and [practice doctrine](../src/agent/prompts/practice/10-doctrine.md): instructional meanings and strategies, not independent proof of efficacy.
- [Learning-record interpretation guide](../skills/learnharness/SKILL.md), [session contracts](../src/core/contracts/chat.ts), [plan contracts](../src/core/contracts/plan.ts) and [graph contracts](../src/core/contracts/graph.ts): descriptive domain baseline. Read current representations together with the research; historical header comments can describe superseded designs.
- [Maintainer's plugin direction](https://github.com/amosblomqvist/learnharness/issues/197#issuecomment-6441976164): intended extensibility, not a released API established by this investigation.
- [Comparison research](research/learnharness-vs-v2_2.md): implementation evidence, earlier owner clarifications, candidate forks and foundation-selection rationale. Later agreements in this vision supersede its earlier undecided positions for fork planning.

### v2_2 contributions and their disposition

These links require the sibling v2_2 checkout. The substantive fork commitments are retained above.

| Prior direction | Fork disposition |
|---|---|
| Interactive textbook/workbench; conversational interactions | Adapted to upstream's conversation-led baseline, excellent presentation and working tools (§§2, 7). |
| Fixed course backbone, lesson templates and lifecycle | Relaxed to reference-plus-goal learning (§3). |
| Multimodal work, durable evidence and assessment corrections | Retained at the experience level (§§6–7); separate formal-assessment presentation is not selected. |
| Remediation choices and prerequisite additions | Covered by upstream's flow plus separate optional drills (§§4–5). |
| Knowledge Review and mixed tests | Retained as long-term capabilities (§5); old schedules and test policies remain unselected. |
| Teaching Retro, feedback and evaluated improvement | Retained at vision level (§8); detailed trials/versioning/evaluation machinery remains later design. |
| Knowledge exploration, learner-evidence views and search | Retained with explicit upstream domain alignment (§6). |
| Mission tactics and app-owned boundaries | Owner-pinned autonomy principle (§4); specific application boundaries remain design work. |
| Local ownership, backup/recovery and source provenance | Ownership/recovery retained (§9); references serve notation, jargon and required knowledge (§3), without a blanket citation requirement. |
| Broader strategies, presets, architecture and implementation choices | Useful reference material; upstream is the baseline and explicit fork agreements govern additions. |

- [Product vision](../../v2_2/docs/VISION.md) and [decision register](../../v2_2/docs/DECISIONS.md): prior owner directions and later clarifications.
- [Learning architecture](../../v2_2/docs/LEARNING_ARCHITECTURE.md) and [approved review/mixed-test direction](../../v2_2/.scratch/vision-flow-alignment/gap-review-and-mixed-tests-proposal.md): activities, evidence, review and testing distinctions.
- [Evaluation policy](../../v2_2/docs/EVALUATION_OBSERVABILITY.md): measured agent quality and improvement-loop background.
- [Accepted mission-tactics ADR](../../v2_2/docs/adr/0003-tool-supported-agent-improvement.md): supporting agent capability with tools, feedback and proportionate restrictions.
