# LearnHarness

Language for the learning experience, grounded in the [upstream learning-record guide](skills/learnharness/SKILL.md), the [session](src/core/contracts/chat.ts), [plan](src/core/contracts/plan.ts) and [graph](src/core/contracts/graph.ts) contracts, and the [approved fork vision](docs/fork-vision.md).

## Language

**Teaching session**:
A resumable conversation that clarifies the learner's goal, probes prerequisite understanding, and plans and teaches toward that goal.

**Teaching plan**:
A revisable, session-scoped map of prerequisite relationships between teaching landmarks. Visiting a landmark describes progress through the conversation, not proof of understanding.

**Practice session**:
A separate conversation exercising retrieval and application through varied problems, learner reasoning and feedback. Ordinary practice mixes targets and provides gradual help.

**Problem**:
An exercise the learner works on within practice or a drill, with discussion and assistance as needed. Its conclusion records the outcome of that attempt.

**Notebook**:
The learner's continuing mathematical working within a teaching or practice session, distinct from the Tutor conversation. It can span multiple questions and topics; snapshots of its working can be shared with the Tutor.

**Notebook line**:
A whole row of the learner's mathematical working, addressed by its displayed line number.

**Numbered expression**:
An individually addressable part of a Notebook line, separated from its neighbors by outer-level relation signs such as =, ≈, ≠, <, >, ≤ or ≥. Expressions are numbered from left to right starting at 1 on each line, including the leftmost expression; fractions, grouped expressions and sums remain together.
_Avoid_: Term, equation when referring to an expression's number.

**Expression number**:
An expression's current left-to-right position within its line. Numbers update after insertion or removal rather than remaining attached to earlier expressions.

**Selected expression**:
The expression the learner has explicitly chosen as the referent for instructions such as “copy this” or “substitute this”.

**Relation chain**:
A sequence of expressions connected by relation signs. An equality chain is a relation chain whose connecting signs are all equals signs.

**Proposition**:
A statement represented in the knowledge graph as subject knowledge. Its presence does not establish that the learner understands it or that the statement is correct.

**Reasoning chain**:
An argument whose premises jointly imply a conclusion. Separate arguments for the same conclusion are separate chains.

**Knowledge graph**:
The shared collection of propositions and reasoning chains encountered in teaching or imported notes, with their sources recorded. It represents subject content rather than demonstrated learner mastery.
_Avoid_: Mastery map.

**Learner evidence**:
Recorded attempts, reasoning, uncertainty, assistance, feedback and outcomes that inform judgments about the learner's understanding. Helped success, independent application and retention after a delay are distinct evidence.

**Drill**:
A separate, optional learning activity targeting a particular difficulty or skill through focused work. It may use repetition, explanations and mental models to scaffold that work.

**Delayed review**:
Revisiting studied material after a delay through recall, explanation, derivation, calculation or application to support and check retention.
