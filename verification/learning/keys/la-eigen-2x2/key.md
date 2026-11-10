# Answer key: eigenvalues and eigenvectors of 2×2 matrices

Version 0.2.0-draft. **Status: draft for owner approval (decision D-1).** Nothing here
authorizes a live run (D-2) or claims tutor accuracy. Story: LJ-TUTOR. Evaluator-only:
never give this file, `facts.json` or the calibration set to the tutor or the simulated
learner (§9).

## 1. Purpose, scope and conventions

A separate evaluator uses this key to judge one bounded live **teaching** session: is the
mathematics right, and does each tutor turn do its job under LearnHarness's own teaching
policy? It is not a curriculum, a mastery model or a measure of human learning.

- **Learner goal (in `learner-brief.md`):** understand what eigenvalues and eigenvectors of
  a 2×2 matrix are, find them, and know how to tell whether a matrix can be diagonalized.
- **In scope:** real 2×2 matrices; Av = λv; the condition det(A − λI) = 0; eigenvectors as
  the null space of A − λI; whether two independent eigenvectors exist.
- **Out of scope:** n×n theory, complex eigenvectors, Jordan form, powers of A, proofs about
  symmetric matrices, numerical methods, and practice-mode hint rules (this is a teaching
  session).
- **Conventions:** scalars, eigenvectors and diagonalization are **over ℝ** unless stated.

## 2. Sources

**Subject truth.** G. Strang, *Introduction to Linear Algebra*, 5th ed., §6.1
"Introduction to Eigenvalues", pp. 288–303. Inspected copy: the author's file
`math.mit.edu/~gs/linearalgebra/ila5/linearalgebra5_6-1.pdf`
(SHA-256 `deff7a03…6c313`). Page references below are to that file. The one claim §6.1
does not state (T4, the "if" direction) is derived in the table, and the checker verifies
it for every fixture. Other textbooks were dropped because their text could not be
inspected.

**Machine check.** `tests/verification/la-eigen-key.test.mjs` checks every number in
`facts.json` exactly (see its `machineChecked` field). It does not check prose.

**Teaching expectations.** Only LearnHarness's own policy, by file:
`docs/fork-vision.md` §4; `src/agent/prompts/prober/10-probe-doctrine.md`;
`src/agent/prompts/teacher/10-planning.md`, `20-teaching.md`, `28-predictions.md`,
`30-question-principles.md`; `src/agent/prompts/shared/15-accuracy.md`. If this key and a
policy file differ, the policy file wins and the key is wrong.

## 3. Subject truths

The tutor contradicting one of these, or endorsing a learner's contradiction of one, is a
**material error**: the run fails (V-4). Wording, notation and examples may vary freely.

| ID | Truth (over ℝ) | Support |
| --- | --- | --- |
| T1 | An eigenvector is a **nonzero** v with Av = λv. λ = 0 is allowed, exactly when A is singular. | p. 292 Ex. 4; p. 295 "x = 0 is useless"; R6 |
| T2 | λ is an eigenvalue ⇔ (A − λI)v = 0 has a nonzero solution ⇔ A − λI is singular ⇔ det(A − λI) = 0. For 2×2: λ² − (trace)λ + det = 0. | p. 292 box and eq. (3); p. 294 trace and det |
| T3 | The eigenvectors for λ are the nonzero vectors in the null space of A − λI; every nonzero vector in that space is equally valid. | p. 292; p. 293 "any nonzero multiple" |
| T4 | A is diagonalizable ⇔ it has two independent eigenvectors. *Only if:* p. 293. *If:* put them as the columns of P; then AP = PD and P is invertible, so A = PDP⁻¹. | p. 293; derivation; checker |
| T5 | Two distinct **real** eigenvalues ⇒ diagonalizable. A repeated eigenvalue neither prevents it (R4) nor guarantees it (R3). | pp. 296–297 "A can be diagonalized since λ1 ≠ λ2"; p. 293 "A = I has equal eigenvalues and plenty of eigenvectors"; R3, R4 |
| T6 | A real 2×2 matrix may have no real eigenvalues (R5). | p. 295 Ex. 5 |
| T7 | A triangular matrix has its diagonal entries as eigenvalues; in general eigenvalues are not the entries (R2). | p. 294 |
| T8 | Row reduction generally changes eigenvalues (R2 reduces to I). | p. 294; checker |

A claim outside T1–T8 that the evaluator cannot settle from `facts.json` or the cited pages
is **unverified** (uncertain), never pass or fail by guesswork.

## 4. Known misconceptions

M1 the zero vector counts · M2 eigenvalues are the entries · M3 mishandling the sign when
using det(A + μI) · M4 every matrix is diagonalizable · M5 a repeated eigenvalue means
not diagonalizable · M6 the eigenvector is unique · M7 eigenvalue 0 is impossible · M8
row-reduce first, then read off eigenvalues. The tutor need not pre-empt these. It must
respond correctly when the learner shows one.

## 5. Expectations and how to judge them

**Judging unit.** Split the transcript into episodes: the probe, the plan, and each
teaching step (prediction, teaching, check, the learner's answer, and the tutor's reaction
up to the next step). Apply **every** expectation whose trigger occurs, so one turn can
be judged under several.

**Outcome per expectation:** *complied*; *violated*, including a required action that is
due and omitted; *not applicable* (trigger absent); *unverified* (the transcript cannot
decide). An obligation is *due* at the point named in its row.

| ID | Trigger | Must | Must not (or omission that violates) | Policy |
| --- | --- | --- | --- | --- |
| E1 | Session start | Make the goal concrete before probing. | Begin teaching before the goal is concrete. | probe §2 |
| E2 | Probe | For each strand the goal needs, choose each next question from the previous answer. For a strand that turns out shaky, establish both a floor (answered right) and a ceiling (missed) before ending the probe. A strand shown solid at a high level needs no lower questions. Equivalent strand choices are fine. | Diagnose a misconception from a single miss; teach during the probe; end the probe with a shaky strand unbracketed. | vision §4 r1; probe §4 |
| E3 | Plan | Present a route from what the probe showed toward the goal, with prose and a map, before teaching. | Re-teach strands the probe showed solid; add steps off the path to the goal. | planning "minimal tree"; "Presenting the plan" |
| E4 | Each teaching step | One motivated step, built on what the learner has shown. Before using det(A − λI) = 0, motivate it from Av = λv (geometric or algebraic, both fine). | Assert something the learner must take on faith and then build on it unchecked; contradict T1–T8. | teaching §1–3; method i/ii; accuracy |
| E5 | End of each teaching step's explanation | A check (not a prediction) that is answerable from the session; it prefers applying the idea; recall only when nothing can be applied. Due before the next step builds on this one. | Build the next step with no check of this one; check before teaching it; ask the learner to copy the text just above. A prediction before teaching is allowed and is not a check. | teaching §4, "How questions arrive"; predictions; question principles |
| E6 | A learner answer (to a check, prediction or probe) | Accept every valid answer, e.g. any nonzero vector in the eigenspace. If wrong or uncertain: say what is wrong or missing, repair (Socratic or expository), and re-check. The re-check is due before the next step builds on this one. | Accept a wrong answer; reject a valid one; move on without the re-check. | vision §4 r2; teaching §4 |
| E7 | The learner asks "why?" or voices doubt | Answer the actual question with a motivated reason, then continue the step. | Reply only with a rule to follow ("that's the formula, just use it"). | method ii; teaching §1–3 |
| E8 | Any tutor statement about the learner's progress, or the saved probe assessment | Describe guided or hinted success as guided. | Call guided success independent or "mastered"; treat a visited plan node as understood; record a strand solid after a hinted answer. | vision §1, §6; glossary "Learner evidence" |
| E9 | The tutor flags its own uncertainty | Do not then build on the flagged claim as settled. | Treat a flagged claim as settled in a later step. | accuracy |

**Run verdict (V-2, V-4).**
- **Fail:** any expectation *violated* or any material error, at any point, including before a cap.
- **Pass:** every expectation in the **minimum coverage set** *complied*, none *violated*, and the simulator stayed within its brief.
- **Incomplete:** the minimum set was not reached, or a cap stopped the run, with no violation so far.
- **Unverified:** anything else. Never reported as pass.

**Minimum coverage set:** E1; E2 for the probe (one shaky strand bracketed); E3; E4 and E5
for three consecutive teaching steps; E6 for at least one wrong answer and its re-check; E7
for the learner's "why?". E8 and E9 are judged wherever they apply. Later steps, such as
the diagonalization criterion, count if reached and are otherwise *unexercised*.

## 6. Simulated learner

The simulator gets only `learner-brief.md`. If a planned event never gets its chance, it
is *unexercised*, not a deviation. If the simulator acts against its brief (for example
it reveals the answer key or corrects itself without being taught), the run is
*incomplete* and the tutor is not judged on what followed.

## 7. Calibration

Before its verdicts are used, the evaluator must reproduce every expected outcome below
with the same transcript context. One mismatch means calibration failed, and no tutor
verdict may be reported (spec §3). Each example states which expectation it calibrates.

| ID | Context and tutor turn | Calibrates | Expected |
| --- | --- | --- | --- |
| C1 | Learner: "For [[2,1],[1,2]], λ = 3 gives (2, 2)." Tutor: "Yes. Any nonzero multiple of (1, 1) works." | E6 accept valid | complied |
| C2 | Same learner turn. Tutor: "Not quite, it's (1, 1)." | E6 reject valid | violated |
| C3 | Learner offers (0, 0). Tutor: "A·0 = 3·0 holds for every λ, so it tells us nothing; eigenvectors must be nonzero." Then, before moving on: "Find a nonzero one for λ = 3." Learner: "(1, 1)." Tutor continues. | E6 repair + re-check | complied |
| C4 | Learner offers (0, 0). Tutor: "Right, it must be nonzero, so (1, 1). Now let's look at when we can diagonalize." | E6 re-check omitted | violated |
| C5 | Learner: "[[2,0],[0,2]] can't be diagonalized, 2 repeats." Tutor: "Do (1,0) and (0,1) both satisfy Av = 2v? What does that give you?" Learner: "Two independent ones, so it can." Tutor: "Exactly. Is [[3,0],[0,3]] diagonalizable?" | E6 Socratic repair | complied |
| C6 | Same learner turn. Tutor: "A repeated eigenvalue doesn't decide it; what decides it is having two independent eigenvectors, and 2I already is diagonal. Is [[3,0],[0,3]] diagonalizable, and why?" | E6 expository repair (check pending, due later) | complied |
| C7 | Same learner turn. Tutor: "Close enough. Next: rotations." | E6 accepts wrong | violated |
| C8 | Learner: "Why does det have to be 0?" Tutor: "That's the formula; just use it." | E7 | violated |
| C9 | Same learner turn. Tutor: "Av = λv means (A − λI)v = 0 for a nonzero v. A matrix that sends a nonzero vector to 0 can't be invertible, and for a square matrix that is det = 0." | E7 | complied |
| C10 | Tutor explains Av = λv, then: "Check: what is the definition of an eigenvector?" (the same sentence is directly above) | E5 copywork | violated |
| C11 | Tutor explains Av = λv, then asks whether (1, −2) is an eigenvector of [[4,1],[2,3]] and for which λ. | E5 applied check | complied |
| C12 | Probe. Learner misses one null-space question. Tutor: "You have the misconception that null spaces are empty," and ends the probe. | E2 single miss; unbracketed | violated |
| C13 | Tutor teaches the det condition, then immediately teaches finding eigenvectors with no check in between. | E5 omission | violated |
| C14 | Learner solved the null-space question after a hint. Tutor: "Great, you've mastered null spaces." | E8 | violated |
| C15 | Tutor: "The eigenvalues of [[4,1],[2,3]] are 4 and 3." | T7 material error | violated |
| C16 | Tutor states, with no hedging, a claim about 3×3 defective matrices that is not in T1–T8. | out-of-key claim | unverified |

## 8. Fit to the authorized exercise (spec §3)

Limits: ≤ 12 learner turns, ≤ 30 model requests (planning, grading and retries
included), ≤ 20 minutes, no retries, teaching/question/planning tools only.

**Counted path to the minimum coverage set** (one valid route; others are fine):

| Learner turns | Episode |
| --- | --- |
| 1 | goal |
| 2–4 | probe: one high-level determinant/invertibility item, then a null-space item missed and an easier one answered (bracketed) |
| 5 | accepts the plan |
| 6–7 | step 1 (Av = λv): prediction, check |
| 8–9 | step 2 (det condition): "why?" (E7), check |
| 10 | step 3 (eigenvectors as null space): check, with the planned wrong answer and its re-check in 11 |
| 12 | spare; step 4 (diagonalization) only if the route is shorter |

**Requests, estimated.** Tutor: about one per learner turn, plus about three for tool
continuations (probe end, plan, handoff), so about 15. Simulator: one per learner turn, so
12. Grading: about 2. Total about 29, right at the cap. A tutor that uses more requests
ends the run *incomplete*, never failed, and violations already observed still stand.
Calibration is a separate step; whether it counts against the 30 is owner question O-1.

## 9. Independence and leakage

The tutor and simulator never see this file, `facts.json` or §7. The live adapter must
make them unreachable to the tutor's file tools and keep them out of every prompt (V-5,
D-2). The simulator sees only `learner-brief.md`.

## 10. Open questions for the owner

- **O-1:** Does evaluator calibration count against the 30-request cap? If it does, the
  run cannot fit. Options: (a) calibration is a separate preflight with its own small cap;
  (b) you play the learner from the brief, which removes the 12 simulator requests;
  (c) raise the cap. Recommended: (a).
- **O-2:** Approve the subject, the scope, the minimum coverage set and Strang §6.1 as
  the sole textbook source.
