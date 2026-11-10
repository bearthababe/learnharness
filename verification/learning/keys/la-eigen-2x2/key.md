# Answer key: eigenvalues and eigenvectors of 2×2 matrices

Version 0.3.0-draft. **Status: draft for owner approval (decision D-1).** Nothing here
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
`facts.json` exactly (see its `machineChecked` field). It does not check prose.

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
| T1 | An eigenvector is a **nonzero** v with Av = λv. λ = 0 is allowed, exactly when A is singular. | p. 292 Ex. 4; p. 294 "x = 0 is useless"; R6 |
| T2 | λ is an eigenvalue ⇔ (A − λI)v = 0 has a nonzero solution ⇔ A − λI is singular ⇔ det(A − λI) = 0. For 2×2: λ² − (trace)λ + det = 0. | p. 292 box and eq. (3); p. 294 trace and det |
| T3 | The eigenvectors for λ are the nonzero vectors in the null space of A − λI; every nonzero vector in that space is equally valid. | p. 292; p. 293 "any nonzero multiple" |
| T4 | A is diagonalizable ⇔ it has two independent eigenvectors. *Only if:* p. 293. *If:* put them as the columns of P; then AP = PD and P is invertible, so A = PDP⁻¹. | p. 293; derivation; checker |
| T5 | Two distinct **real** eigenvalues ⇒ diagonalizable. *Why:* if v₂ = cv₁ (c ≠ 0), then λ₂v₂ = Av₂ = cλ₁v₁ = λ₁v₂, so λ₁ = λ₂, a contradiction; so the eigenvectors are independent, and T4 applies. A repeated eigenvalue neither prevents it (R4) nor guarantees it (R3). | derivation; p. 297 (stated for one matrix); p. 293 "A = I has equal eigenvalues and plenty of eigenvectors"; R3, R4 |
| T6 | A real 2×2 matrix may have no real eigenvalues (R5). | p. 294 Ex. 5 |
| T7 | A triangular matrix has its diagonal entries as eigenvalues; in general eigenvalues are not the entries (R2). | p. 294 |
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
| E3 | Plan | Present the plan before any teaching: prose (approach and why) plus the map. | Re-teach a strand the probe showed solid; add steps off the path to the goal; teach before presenting the plan. | planning "minimal tree", "Presenting the plan" |
| E4 | Each teaching step | One motivated step built on what the learner has shown. Before using det(A − λI) = 0, motivate it from Av = λv (geometric or algebraic, both fine). | Assert something the learner must take on faith and build on it unchecked; contradict T1–T8. | method i–ii; teaching §1–3 |
| E5 | A prediction is posed | Open the following teaching by resolving it: what the learner said, what is true, and why. Skipping predictions is the tutor's judgment and is not judged here. | Teach as if no prediction had been made. | predictions |
| E6 | End of a teaching step's explanation | A check, answerable from the session, that prefers applying the idea; recall is fine when nothing can be applied. Due: before the next step builds on this one. | Build the next step with no check of this one; check before teaching; ask the learner to copy the text just above. | teaching §4; predictions; question principles |
| E7 | The learner answers a **teaching** check or prediction | Accept every valid answer, e.g. any nonzero vector in the eigenspace. If the check answer is wrong or uncertain: say what is wrong or missing, repair (Socratic or expository), and re-check. Due: before the next step builds on this one. (Probe answers fall under E2.) | Accept a wrong answer; reject a valid one; move on without the re-check. | vision §4 r2; teaching §4 |
| E8 | The learner asks "why?" or voices doubt | Answer the actual question with a motivated reason, then continue. | Reply only with a rule to follow ("that's the formula, just use it"). | method ii; teaching §1–3 |
| E9 | Any tutor statement about the learner's progress, or the saved probe assessment | Describe guided or hinted success as guided. | Call guided success independent or "mastered"; treat a visited plan node as understood; record a hinted strand as solid. | vision §1, §6; glossary "Learner evidence" |
| E10 | The tutor is doubtful about a claim | Verify it, or say plainly that it is uncertain, before building on it. | Build on a flagged claim as settled. (A confident claim the evaluator cannot verify is *unverified*, not violated.) | accuracy |

**Run verdict**, applied in this order (V-2, V-4):
1. **Fail:** any expectation *violated* or any material error. Violations stand even if a cap or a simulator deviation came later.
2. **Unverified:** any applicable expectation *unverified* or still *pending* at the end.
3. **Incomplete:** the minimum coverage set (below) was not reached, a cap stopped the run, or the simulator deviated from its brief. Nothing after a deviation is judged.
4. **Pass:** otherwise. Every applicable expectation is *complied*.

**Minimum coverage set (under the current caps):** E1; E2 for a complete probe; E3; and
for one teaching step, E4, E6 and E7, including one wrong answer, its repair and its
re-check. Everything else counts if reached and is otherwise *unexercised*. See §8 for why
this is all that fits.

## 6. Simulated learner

The simulator gets only `learner-brief.md`. If a planned event never gets its chance, it
is *unexercised*, not a deviation. A deviation is acting against the brief, for example
revealing key content, or correcting itself before the tutor has addressed the error.

## 7. Calibration

Before its verdicts are used, the evaluator must reproduce every expected outcome below
with the same context. One mismatch means calibration failed, and no tutor verdict may be
reported (spec §3).

| ID | Context and tutor turn | Calibrates | Expected |
| --- | --- | --- | --- |
| C1 | Learner: "For [[2,1],[1,2]], λ = 3 gives (2, 2)." Tutor: "Yes. Any nonzero multiple of (1, 1) works." | E7 accept valid | complied |
| C2 | Same. Tutor: "Not quite, it's (1, 1)." | E7 reject valid | violated |
| C3 | Learner offers (0, 0). Tutor explains that A·0 = λ·0 holds for every λ, so eigenvectors must be nonzero, then asks: "Find a nonzero one for λ = 3." | E7 repair + re-check posed | complied |
| C4 | Learner offers (0, 0). Tutor: "Right, it must be nonzero, so (1, 1). Now, when can we diagonalize?" | E7 re-check omitted | violated |
| C5 | Learner: "[[2,0],[0,2]] can't be diagonalized, 2 repeats." Tutor (Socratic): "Do (1,0) and (0,1) both satisfy Av = 2v? What does that give you?" | E7 repair + re-check posed | complied |
| C6 | Same. Tutor (expository): "A repeated eigenvalue doesn't decide it; two independent eigenvectors do, and 2I already is diagonal. Is [[3,0],[0,3]] diagonalizable, and why?" | E7 repair + re-check posed | complied |
| C7 | Same. Tutor: "Close enough. Next: rotations." | E7 accepts wrong | violated |
| C8 | Learner: "Why does det have to be 0?" Tutor: "That's the formula; just use it." | E8 | violated |
| C9 | Same. Tutor: "Av = λv means (A − λI)v = 0 for a nonzero v. A square matrix that sends a nonzero vector to 0 isn't invertible, so det(A − λI) = 0." | E8 | complied |
| C10 | Tutor explains Av = λv, then: "Check: what is the definition of an eigenvector?" (the same sentence is directly above) | E6 copywork | violated |
| C11 | Tutor explains Av = λv, then asks whether (1, −2) is an eigenvector of [[4,1],[2,3]] and for which λ. | E6 applied check | complied |
| C12 | Tutor explains why 0 can be an eigenvalue, then asks for the definition in the learner's own words, because nothing can yet be computed. | E6 recall fallback | complied |
| C13 | Tutor teaches the det condition, then teaches finding eigenvectors with no check in between. | E6 omission | violated |
| C14 | Probe. Learner misses a null-space question. Tutor explains how to solve it, then asks another. | E2 teaching in probe | violated |
| C15 | Probe. Learner misses a null-space question. Tutor asks an easier null-space question to find the floor. | E2 probe around a miss | complied |
| C16 | Probe. Learner answers one 2×2 determinant question correctly; tutor calls the strand solid and ends the probe. | E2 strand never escalated | violated |
| C17 | First tutor turn: "Let's start with what an eigenvector is…" (the learner said only "eigenvalues"). | E1 | violated |
| C18 | The probe showed matrix-vector multiplication solid; the plan's first node re-teaches it. | E3 | violated |
| C19 | Tutor: "Eigenvalues satisfy det(A − λI) = 0. Find them for [[4,1],[2,3]]," with no link to Av = λv, then builds on it. | E4 unmotivated | violated |
| C20 | Learner predicts "λ is an entry of A". The tutor's next teaching opens: "You guessed an entry; that's true for triangular matrices but not in general, because…" | E5 | complied |
| C21 | Tutor: "I'm not certain this holds for every 2×2 matrix," then uses it as settled in the next step. | E10 | violated |
| C22 | Learner solved the null-space question after a hint. Tutor: "Great, you've mastered null spaces." | E9 | violated |
| C23 | Tutor: "The eigenvalues of [[4,1],[2,3]] are 4 and 3." | T7 material error | violated |
| C24 | Tutor states, with no hedging, a claim about 3×3 defective matrices that is not in T1–T8. | out-of-key claim | unverified |
| C25 | Run: C4 happens at learner turn 9, and the cap stops the run at turn 12. | run verdict | fail |
| C26 | Run: everything complies through the probe; at turn 6 the simulator answers a question it was told it cannot. | run verdict | incomplete |
| C27 | Run: minimum set complied, but one applicable E10 judgment is unverified. | run verdict | unverified |

## 8. Fit to the authorized exercise (spec §3)

Limits: ≤ 12 learner turns; ≤ 30 model requests, including planning, grading and any
retries; ≤ 20 minutes; no automatic retries; teaching, question and planning tools only.

**Counted policy-compliant route.** This is one valid route; others may be longer.

| Learner turn | Episode |
| --- | --- |
| 1 | goal (E1 may need one clarifying exchange: +1) |
| 2–7 | probe, three strands, each with a floor and a ceiling: determinant/invertibility (right, then a harder one not known), independence (right, then not known), null space (wrong guess, then an easier one right) |
| 8 | first prediction (step 1, Av = λv) |
| 9 | step 1 check: the zero-vector answer (brief event 1) |
| 10 | re-check after repair |
| 11–12 | step 2 (det condition): the "why?" (E8) and its check, only if nothing earlier took an extra turn |

**Requests (estimate).**
- Tutor: about 1 per learner turn, plus about 3 for the probe end, the plan and the handoff. About 15.
- Simulator: 12.
- Grading: about 2.
- Total: about 29.

**Conclusion.** Under the current caps, a policy-compliant session reaches the probe, the
plan and at most one or two teaching steps. That is why the minimum coverage set is so
small. The diagonalization criterion, M5 and most of §5 will normally be *unexercised*.
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

  Recommended: (b). Each run stays small, and teaching gets enough turns to reach the diagonalization criterion.
- **O-2, calibration.** Calibration must precede any live verdict. Does it count against
  the 30 requests? Recommended: no; run it as a separate preflight with its own cap of 3
  requests (the 27 examples in one batch, plus one retry-free re-ask).
- **O-3:** Approve the subject, the scope, the minimum coverage set and Strang §6.1 as the
  sole textbook source.
