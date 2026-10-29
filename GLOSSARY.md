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
