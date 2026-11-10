# Answer key: eigenvalues and eigenvectors of 2×2 matrices

Version 0.5.1-draft (round-5 council fixes applied; not re-scored). **Status: draft for owner approval (decision D-1).** Nothing here
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
`math.mit.edu/~gs/linearalgebra/ila5/linearalgebra5_6-1.pdf` (SHA-256 `deff7a03…6c313`).
Page numbers below are the printed page numbers, checked page by page. Where §6.1 does not
state a general claim (T4 "if", T5), the table gives a short derivation and the checker
verifies it for every fixture. Other textbooks are not cited because their text was not
inspected.

**Machine check.** `tests/verification/la-eigen-key.test.mjs` checks every number in
`facts.json` exactly. `proseClaims` mirrors, by hand, each numeric claim made in §7 and in
the learner brief. The test checks those mirrored values, not the prose text itself, so a
reviewer must confirm that the two still match.

**Teaching expectations.** Only LearnHarness's own policy, by file:
`docs/fork-vision.md` §4; `src/agent/prompts/prober/10-probe-doctrine.md`;
`src/agent/prompts/teacher/05-method.md`, `10-planning.md`, `20-teaching.md`,
`28-predictions.md`, `30-question-principles.md`; `src/agent/prompts/shared/15-accuracy.md`.
If this key and a policy file differ, the policy file wins and the key is wrong.

## 3. Subject truths

The tutor contradicting one of these, or endorsing a learner's contradiction of one, is a
**material error**: the run fails (V-4). Wording, notation and examples may vary freely.

| ID | Truth (over ℝ) | Support |
| --- | --- | --- |
| T1 | An eigenvector is a **nonzero** v with Av = λv. λ = 0 is allowed, exactly when A is singular. | p. 292 Ex. 4; p. 293 "If A is invertible, zero is not an eigenvalue"; p. 294 "x = 0 is useless"; R6 |
| T2 | λ is an eigenvalue ⇔ (A − λI)v = 0 has a nonzero solution ⇔ A − λI is singular ⇔ det(A − λI) = 0. For 2×2: λ² − (trace)λ + det = 0. | p. 292 box and eq. (3); p. 294 trace and det |
| T3 | The eigenvectors for λ are the nonzero vectors in the null space of A − λI; every nonzero vector in that space is equally valid. | p. 292; p. 293 "any nonzero multiple" |
| T4 | A is diagonalizable ⇔ it has two independent eigenvectors. *Only if:* p. 293. *If:* put them as the columns of P; then AP = PD and P is invertible, so A = PDP⁻¹. | p. 293; derivation; checker |
| T5 | Two distinct **real** eigenvalues ⇒ diagonalizable. *Why:* if v₂ = cv₁ (c ≠ 0), then λ₂v₂ = Av₂ = cλ₁v₁ = λ₁v₂, so λ₁ = λ₂, a contradiction; so the eigenvectors are independent, and T4 applies. A repeated eigenvalue neither prevents it (R4) nor guarantees it (R3). | derivation; p. 297 (stated for one matrix); p. 293 "A = I has equal eigenvalues and plenty of eigenvectors"; R3, R4 |
| T6 | A real 2×2 matrix may have no real eigenvalues (R5). | p. 294 Ex. 5 |
| T7 | A triangular matrix has its diagonal entries as eigenvalues; in general eigenvalues cannot be read off the entries (R2: 5 is not an entry). | p. 294 |
| T8 | Row reduction generally changes eigenvalues (R2 reduces to I). | p. 294; checker |

A claim outside T1–T8 that the evaluator cannot settle from `facts.json` or the cited pages
is **unverified**, never pass or fail by guesswork.

## 4. Known misconceptions

M1 the zero vector counts · M2 eigenvalues are the entries · M3 mishandling the sign when
using det(A + μI) · M4 every matrix is diagonalizable · M5 a repeated eigenvalue means
not diagonalizable · M6 the eigenvector is unique · M7 eigenvalue 0 is impossible · M8
row-reduce first, then read off eigenvalues. The tutor need not pre-empt these. It must
respond correctly when the learner shows one.

## 5. Expectations and how to judge them

**Judging unit.** Split the transcript into episodes: the goal, the probe, the plan, and
each teaching step (optional prediction, teaching, check, the learner's answer, the tutor's
reaction, up to the next step). Apply **every** expectation whose trigger occurs, so one
turn can be judged under several.

**Outcome per expectation:**
- *complied*;
- *violated*, which includes a required action that is due and omitted;
- *pending*, meaning a required action that is not yet due;
- *not applicable*, meaning the trigger is absent;
- *unverified*, meaning the transcript cannot decide.

| ID | Trigger | Must | Must not (or omission that violates) | Policy |
| --- | --- | --- | --- | --- |
| E1 | Session start | Make the goal concrete before probing. | Teach before the goal is concrete. | probe §2 |
| E2 | Probe | For each strand the goal depends on, find both a floor (answered right) and a ceiling (missed or not known): enter near the top, choose each next question from the evidence, escalate a strand that never breaks. After a miss, probe around it with the next question. Due: before `probe_done`. Strand choice is the tutor's. | Teach during the probe; treat one miss as a misconception; ask a question an earlier answer already settled; conclude with a strand unbracketed. | probe §3–5 |
| E3 | Plan | Present the plan before any teaching (prose on the approach and why, plus the map), end the turn, and ask the learner to confirm it. Teach only after they are on board. | Teach in the presenting turn; re-teach a strand the probe showed solid; add steps off the path to the goal. | planning "minimal tree", "Presenting the plan", "Presenting ends your turn" |
| E4 | Each teaching step | One step built on what the learner has shown: either an unconditional truth asserted plainly, or a step motivated from what is held. Before using det(A − λI) = 0, motivate it from Av = λv (geometric or algebraic, both fine). | Assert something the learner must take on faith and build on it unchecked; contradict T1–T8. | method i–ii; teaching §1–3 |
| E5 | A prediction is posed; or a step introducing a new idea | Open the teaching that follows a prediction by resolving it: what the learner said, what is true, and why. Skipping a prediction is the tutor's call when there is no meaningful next step (a wrap-up, or a pure repair). | Teach as if the prediction had not been made. Skip the prediction on every new-idea step when there are two or more of them (a habit). Any mix that includes at least one prediction is complied. | predictions |
| E6 | End of a teaching step's explanation | A check, answerable from the session, that prefers applying the idea; recall is fine when nothing can be applied. Whether an application was available is the tutor's judgment: a non-copywork recall check is *unverified* when an applied check was plausibly available, and never violated on that ground alone. Due: before the next step builds on this one. | Build the next step with no check of this one; check before teaching; ask the learner to copy the text just above. | teaching §4; predictions; question principles |
| E7 | The learner answers a **teaching** check or prediction | Accept every valid answer, e.g. any nonzero vector in the eigenspace. If the check answer is wrong or uncertain: say what is wrong or missing, repair (Socratic or expository), and re-check. Due: before the next step builds on this one. (Probe answers fall under E2.) | Accept a wrong answer; reject a valid one; move on without the re-check. | vision §4 r2; teaching §4 |
| E8 | The learner asks "why?" or voices doubt | Answer the actual question with a motivated reason, then continue. | Reply only with a rule to follow ("that's the formula, just use it"). | method ii; teaching §1–3 |
| E9 | Any tutor statement about the learner's progress, or the saved probe assessment | Describe guided or hinted success as guided. | Call guided success independent or "mastered"; treat a visited plan node as understood; record a hinted strand as solid. | vision §1, §6; glossary "Learner evidence" |
| E10 | The tutor shows its own doubt about a claim (a hedge such as "I think", "I'd want to check") | Verify the claim, or keep saying plainly that it is uncertain, before building on it; revisit a flagged claim by the end of the session. Due: by session end, which a cap leaves *pending*. (A learner's challenge falls under E8.) | Later treat the doubted claim as settled without verifying it. (A confident claim the evaluator cannot verify is *unverified*, not violated.) | accuracy |

**Run verdict**, first match wins (V-2, V-4):
1. **Fail:** any expectation *violated* or any material error. Violations stand even if a cap or a simulator deviation came later.
2. **Incomplete (stopped):** a cap stopped the run, or the simulator deviated from its brief. Nothing after a deviation is judged. *Pending* and *unverified* records are kept.
3. **Unverified:** any applicable expectation is *unverified*, or still *pending* at the end.
4. **Incomplete (coverage):** the minimum coverage set (below) was not reached.
5. **Pass:** otherwise. Every applicable expectation is *complied*.

**Planned end.** The run ends normally after the tutor's reaction to the minimum-set
re-check. Hitting a turn, request or time cap before that is *incomplete (stopped)*.

**Minimum coverage set (under the current caps):** E1; E2 for a complete probe; E3; and
for one teaching step, E4, E6 and E7, including one wrong answer, its repair and its
re-check. Everything else counts if reached and is otherwise *unexercised*. See §8 for why
this is all that fits. The wrong answer comes from brief event 1, which fires the first time the
learner is asked for an eigenvector, whether in the probe, a prediction or a check. If it
fires outside a teaching check, or never fires (for example after a C11-style check), the
minimum set may not be reached. The run is then *incomplete (coverage)*, never failed.

## 6. Simulated learner

The simulator gets only `learner-brief.md`. If a planned event never gets its chance, it
is *unexercised*, not a deviation. A deviation is acting against the brief, for example
revealing key content, or correcting itself before the tutor has addressed the error.

## 7. Calibration

Before its verdicts are used, the evaluator must reproduce every expected outcome below
with the same context. One mismatch means calibration failed, and no tutor verdict may be
reported (spec §3). A single-turn example judges only the obligation named in its
"Calibrates" column. For example, "repair + re-check posed" says nothing about whether the
learner then understood. That is judged on the learner's next answer.

| ID | Context and tutor turn | Calibrates | Expected |
| --- | --- | --- | --- |
| C1 | Learner: "For [[2,1],[1,2]], λ = 3 gives (2, 2)." Tutor: "Yes. Any nonzero multiple of (1, 1) works." | E7 accept valid | complied |
| C2 | Same. Tutor: "Not quite, it's (1, 1)." | E7 reject valid | violated |
| C3 | Learner offers (0, 0). Tutor explains that A·0 = λ·0 holds for every λ, so eigenvectors must be nonzero, then asks: "Find a nonzero one for λ = 3." | E7 repair + re-check posed | complied |
| C4 | Learner offers (0, 0). Tutor: "Right, it must be nonzero, so (1, 1). Now, when can we diagonalize?" | E7 re-check omitted | violated |
| C5 | Learner: "[[2,0],[0,2]] can't be diagonalized, 2 repeats." Tutor (Socratic): "Do (1,0) and (0,1) both satisfy Av = 2v? What does that give you?" | E7 repair + re-check posed | complied |
| C6 | Same. Tutor (expository): "A repeated eigenvalue doesn't decide it; two independent eigenvectors do, and 2I already is diagonal. Is [[1,1],[0,1]] diagonalizable, and why?" | E7 repair + re-check posed | complied |
| C7 | Same. Tutor: "Close enough. Next: rotations." | E7 accepts wrong | violated |
| C8 | Learner: "Why does det have to be 0?" Tutor: "That's the formula; just use it." | E8 | violated |
| C9 | Same. Tutor: "Av = λv means (A − λI)v = 0 for a nonzero v. A square matrix that sends a nonzero vector to 0 isn't invertible, so det(A − λI) = 0." | E8 | complied |
| C10 | Tutor explains Av = λv, then: "Check: what is the definition of an eigenvector?" (the same sentence is directly above) | E6 copywork | violated |
| C11 | Tutor explains Av = λv, then asks whether (1, −2) is an eigenvector of [[4,1],[2,3]] and for which λ. | E6 applied check | complied |
| C12 | Tutor teaches the det condition, then teaches finding eigenvectors with no check in between. | E6 omission | violated |
| C13 | Probe. Learner misses a null-space question. Tutor explains how to solve it, then asks another. | E2 teaching in probe | violated |
| C14 | Probe. Learner misses a null-space question. Tutor asks an easier null-space question to find the floor. | E2 probe around a miss | complied |
| C15 | Probe. Learner answers one 2×2 determinant question correctly; tutor calls the strand solid and ends the probe. | E2 strand never escalated | violated |
| C16 | First tutor turn: "Let's start with what an eigenvector is…" (the learner said only "eigenvalues"). | E1 | violated |
| C17 | The probe showed matrix-vector multiplication solid; the plan's first node re-teaches it. | E3 | violated |
| C18 | Tutor: "Eigenvalues satisfy det(A − λI) = 0. Find them for [[4,1],[2,3]]," with no link to Av = λv, then builds on it. | E4 unmotivated | violated |
| C19 | Learner predicts "λ is an entry of A". The tutor's next teaching opens: "You guessed an entry. That's true for triangular matrices, but not in general: eigenvalues solve det(A − λI) = 0, and [[4,1],[2,3]] has eigenvalues 5 and 2; 5 is not an entry." | E5 resolved | complied |
| C20 | Same prediction. The tutor's next teaching never mentions it and starts on det(A − λI). | E5 ignored | violated |
| C21 | The tutor presents the plan and, in the same message, begins teaching the first node. | E3 teaching in the presenting turn | violated |
| C22 | Tutor: "I think the two eigenvalues always add up to the trace, though I'd want to check that." In the next step it uses this as a settled fact, with no check and no flag. | E10 | violated |
| C23 | Same hedge. Tutor: "Let's check: the roots of λ² − (trace)λ + det = 0 add up to the trace, so whenever both eigenvalues are real, counted with repeats, they add up to the trace," then uses it. (Testing a few matrices would not establish the general claim.) | E10 | complied |
| C24 | Tutor states plainly, as a foundation: "An eigenvector is never the zero vector; that's part of the definition." No derivation is given. | E4 unconditional truth | complied |
| C25 | After the repair in C3, the learner's re-check answer is (0, 3) for [[2,1],[1,2]] and λ = 3, which is still wrong. The tutor says "Good" and starts the next step. | E7 repair unsuccessful, tutor moves on | violated |
| C26 | Same wrong re-check answer. Tutor: "Check it: A(0, 3) = (3, 6), which is not 3·(0, 3). Which vectors does A − 3I send to zero?" | E7 second repair + re-check | complied |
| C27 | The tutor teaches three new ideas, each with no prediction, none of them a wrap-up or a repair. | E5 habit | violated |
| C28 | Learner solved the null-space question after a hint. Tutor: "Great, you've mastered null spaces." | E9 | violated |
| C29 | Tutor: "The eigenvalues of [[4,1],[2,3]] are 4 and 3." | T7 material error | violated |
| C30 | Tutor states, with no hedging, a claim about 3×3 defective matrices that is not in T1–T8. | out-of-key claim | unverified |
| C31 | Run: C4 happens at learner turn 9, and the cap stops the run at turn 12. | run verdict | fail |
| C32 | Run: everything complies through the probe; at turn 6 the simulator answers a question it was told it cannot. | run verdict | incomplete (stopped) |
| C33 | Run: minimum set complied, but one applicable E10 judgment is unverified. | run verdict | unverified |
| C34 | Run: no violation; the cap stops it while a re-check is *pending*. | run verdict | incomplete (stopped) |

## 8. Fit to the authorized exercise (spec §3)

Limits: ≤ 12 learner turns; ≤ 30 model requests, including planning, grading and any
retries; ≤ 20 minutes; no automatic retries; teaching, question and planning tools only.

**Counted policy-compliant route.** This is one valid route; others may be longer.

| Learner turn | Episode |
| --- | --- |
| 1 | goal (a clarifying exchange for E1 costs +1) |
| 2–7 | probe, three strands, each with a floor and a ceiling: determinant/invertibility (right, then a harder one not known), independence (right, then not known), null space (wrong guess, then an easier one right). A strict reading of "probe around a miss" adds one follow-up per ceiling, up to 3 more turns. Those push the teaching step past the cap, and the run ends *incomplete (stopped)*. |
| 8 | confirms the plan (E3) |
| 9 | answers the step-1 prediction (Av = λv) |
| 10 | step-1 check: the zero-vector answer (brief event 1) |
| 11 | re-check after repair, with the tutor's closing reaction |
| 12 | spare, absorbing one extra turn anywhere above; no second step is expected |

**Requests (estimate).**
- Tutor: about 1 per learner turn, plus about 3 tool continuations (the `probe_done` result, the teacher handoff and `plan_init`), plus the closing reaction. About 16.
- Simulator: 12.
- Grading: about 2.
- Total: about 30, at the cap, with **no headroom**. A request cap is likely to stop a real run. These are estimates; the live adapter must count real requests.

**Conclusion.** Under the current caps, a policy-compliant session reaches the probe, the
plan and at most one teaching step. A tutor that probes around every miss reaches no teaching step at all, and the request cap is likely to stop the run either way. That is why
the minimum coverage set is so small. The diagonalization criterion, M5 and most of §5 will normally be *unexercised*.
Covering more takes an owner decision (O-1).

## 9. Independence and leakage

The tutor and simulator never see this file, `facts.json` or §7. The live adapter must
make them unreachable to the tutor's file tools and keep them out of every prompt (V-5,
D-2). The simulator sees only `learner-brief.md`.

## 10. Open questions for the owner

- **O-1, budget.** The current caps fit the probe, the plan and about one teaching step.
  Options:
  - (a) Keep the caps and accept this small coverage.
  - (b) Two bounded exercises: probe plus plan from the goal, then teaching from an approved fixture of a probed session, each within today's caps.
  - (c) Raise the caps for this exercise to about 20 learner turns and 50 requests.

  Recommended: (b). Each run stays small, the request budget gets headroom, and teaching gets enough turns to reach the diagonalization criterion.
- **O-2, calibration.** Calibration must precede any live verdict. Does it count against
  the 30 requests? Recommended: no. Run it as a separate preflight, capped at 1 request
  (every example in one batch, with no retry).
- **O-3:** Approve the subject, the scope, the minimum coverage set and Strang §6.1 as the
  sole textbook source.
