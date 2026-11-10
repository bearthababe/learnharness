# Answer key: eigenvalues and eigenvectors of 2×2 matrices

Version 0.1.0-draft. **Status: draft for owner approval (decision D-1).** Nothing here
authorizes a live run (D-2) or claims tutor accuracy. Story: LJ-TUTOR.

## 1. Purpose and scope

This key lets a separate evaluator judge one bounded live tutoring exercise: did the
tutor teach correct mathematics, and did each turn serve its teaching purpose under
LearnHarness's own policy? It is not a curriculum, a mastery model or a measure of
human learning.

- **Learner goal (synthetic):** "I want to understand what eigenvalues and
  eigenvectors of a 2×2 matrix are, find them, and know when a matrix can be
  diagonalized."
- **In scope:** real 2×2 matrices; meaning of Av = λv; characteristic polynomial;
  eigenvectors as null space of A − λI; diagonalizability; one application (A^n).
- **Out of scope:** n×n theory, Jordan form, complex eigenvectors beyond noting they
  exist, proofs about symmetric matrices, numerical methods.

## 2. Sources

Subject truth (every numeric claim is also machine-checked in `facts.json` by
`tests/verification/la-eigen-key.test.mjs`):

- G. Strang, *Introduction to Linear Algebra*, 5th ed., §6.1 (Introduction to
  Eigenvalues) and §6.2 (Diagonalizing a Matrix).
- D. C. Lay, S. R. Lay, J. J. McDonald, *Linear Algebra and Its Applications*, 5th ed.,
  §5.1–5.3 (eigenvectors, characteristic equation, diagonalization).
- S. Axler, *Linear Algebra Done Right*, 3rd ed., ch. 5 (eigenvalues and eigenvectors).

Teaching expectations come only from LearnHarness's approved teaching policy, cited by
file: `docs/fork-vision.md` §4 rules 1–5; `src/agent/prompts/prober/10-probe-doctrine.md`;
`src/agent/prompts/teacher/20-teaching.md`; `src/agent/prompts/teacher/30-question-principles.md`;
`src/agent/prompts/shared/15-accuracy.md`. Where the key paraphrases policy, the policy
file wins.

## 3. Subject truths the tutor must not contradict

Each is a **material error** if the tutor states or endorses its negation. Variants in
wording, notation and order are fine.

| ID | Truth | Checked by |
| --- | --- | --- |
| T1 | An eigenvector is a **nonzero** v with Av = λv; λ may be 0. | definition; R6 |
| T2 | Eigenvalues are the roots of det(A − λI) = 0; for 2×2, λ² − (tr A)λ + det A = 0. | R1–R6 |
| T3 | Eigenvectors for λ are the nonzero vectors in the null space of A − λI; any nonzero multiple is also an eigenvector. | R1, R2 |
| T4 | A is diagonalizable (A = PDP⁻¹, columns of P eigenvectors, D diagonal of eigenvalues in matching order) exactly when it has two linearly independent eigenvectors. | R1–R4, R6 |
| T5 | Distinct eigenvalues guarantee diagonalizability; a repeated eigenvalue does **not** by itself prevent it (R4) nor guarantee it (R3). | R3, R4 |
| T6 | A real 2×2 matrix can have no real eigenvalues (R5). | R5 |
| T7 | Triangular matrices have their diagonal entries as eigenvalues; in general eigenvalues are **not** the entries of A. | R6, R2 |
| T8 | Row reduction generally changes eigenvalues. | (counterexample: R2 reduces to I) |
| T9 | If A = PDP⁻¹ then Aⁿ = PDⁿP⁻¹. | R2 powers |

## 4. Known misconceptions the scenario may surface

M1 zero vector counts as an eigenvector · M2 eigenvalues are the matrix entries ·
M3 sign slip using det(A + λI) · M4 every matrix is diagonalizable · M5 a repeated
eigenvalue means not diagonalizable · M6 an eigenvector is unique · M7 eigenvalue 0 is
impossible · M8 row-reduce first, then read eigenvalues. A tutor is not required to
pre-empt these; it is required to respond correctly when the learner shows one.

## 5. Turn-purpose expectations

Each live tutor turn is labeled by its purpose, then judged against the expectations
for that purpose. **Pass** = every *must* holds. **Fail** = any *must not* occurs or a
T-truth is contradicted. **Uncertain** = the evaluator cannot decide from the
transcript; uncertain is reported as unverified, never pass. Aggregate scores never
offset a fail (V-4).

| Purpose | Must | Must not | Policy source |
| --- | --- | --- | --- |
| E1 Goal clarification | Make the goal concrete before probing. | Start teaching before the goal is clear. | probe doctrine §2 |
| E2 Prerequisite probing | Probe the strands P1–P4 relevant to the goal, choosing each next question from the previous answer; treat a single miss as one data point. | Declare a misconception from one miss; re-probe a strand already shown solid; teach during the probe. | vision §4 rule 1; probe doctrine §4 |
| E3 Plan | Present a route from what the learner holds to the goal that covers the in-scope ideas. | Include out-of-scope topics as required steps. | vision §2 plan |
| E4 Teaching step | One idea per step, built on what the learner has shown; mathematically correct (T1–T9). | Assert a step the learner would have to take on faith without motivating or checking it; contradict any T-truth. | teaching §1–3; accuracy |
| E5 Understanding check | Check after the step's explanation; the check is answerable from the session and tests use, not recitation. | Check before teaching it; ask the learner to copy the sentence above. | teaching §4; question principles |
| E6 Response to a wrong or uncertain answer | Identify what is wrong or missing, repair the step, and re-check before building on it. | Accept a wrong answer as right; mark a correct but differently scaled eigenvector wrong; move on without repair. | vision §4 rule 2; teaching §4 |
| E7 Hint (on request or after a miss) | Give the smallest useful next push. | Give the full worked answer as the first hint when a smaller one would serve. | vision §4 rule 5 |
| E8 Uncertainty | When the tutor is unsure, say so plainly. | State a doubtful claim confidently. | accuracy |

## 6. Synthetic learner script

The simulated learner follows this script, answering the tutor's actual questions in
its own words. It may not see this key beyond its own section. Deviation from the script
invalidates the run (recorded as incomplete), not the tutor.

- **Holds:** P1 matrix-vector multiplication, P2 determinant, P4 independence.
- **Shaky:** P3 null space — first attempt solves (A − λI)v = 0 by guessing; correct
  after one hint.
- **Planned errors (one each, then corrects after appropriate feedback):** M1 offers
  (0, 0) as an eigenvector of R1; M5 says R4 cannot be diagonalized "because 2 repeats".
- **Planned uncertainty:** "I'm not sure why we need det = 0" during the T2 step.
- **Turn budget:** at most 12 learner turns; the run stops as incomplete at any cap.

## 7. Calibration examples

The evaluator must accept every *good* and *variant* example and reject every *bad*
example before its verdicts on the live run are trusted (spec §3).

| ID | Learner turn | Tutor reply | Expected verdict |
| --- | --- | --- | --- |
| C1 good | "For R1, λ = 3 gives v = (2, 2)." | "Yes — (2, 2) works: any nonzero multiple of (1, 1) is an eigenvector for 3." | pass E6 |
| C2 bad | same | "Not quite; the eigenvector is (1, 1)." | fail E6 (rejects a valid scaled answer; T3) |
| C3 good | "(0, 0) works since A·0 = 3·0." | "A·0 = 3·0 is true, but the zero vector satisfies that for every λ, so it tells us nothing. Eigenvectors must be nonzero — can you find a nonzero one?" | pass E6 |
| C4 bad | same | "Right, (0, 0) is an eigenvector." | fail E6, T1 |
| C5 variant | "R4 isn't diagonalizable, 2 repeats." | "Check: does R4 have two independent eigenvectors? Try (1,0) and (0,1)." (Socratic) | pass E6, E7 |
| C6 variant | same | "Repeated eigenvalues don't decide it. R4 = 2I is already diagonal; what decides it is whether there are two independent eigenvectors." (expository) | pass E6 |
| C7 bad | same | "Correct, repeated eigenvalues mean it can't be diagonalized." | fail E6, T5 |
| C8 bad | asks for a hint on finding R2's eigenvalues | Full solution with both eigenpairs and P, D written out. | fail E7 |
| C9 good | asks for a hint on finding R2's eigenvalues | "What has to be true of A − λI for a nonzero v to satisfy (A − λI)v = 0?" | pass E7 |
| C10 bad | (tutor-initiated) | "The eigenvalues of [[4,1],[2,3]] are 4 and 3." | fail E4, T7 |

## 8. Fit to the authorized exercise

Spec §3 limits: ≤30 model requests including planning and grading, ≤12 learner turns,
≤20 minutes, no retries; teaching, question and planning tools only. The script above
needs about 9–11 learner turns. If the tutor's route needs more, the run is incomplete,
not failed. Independent grading uses its own requests within the 30.

## 9. Independence and leakage

The key and `facts.json` must not be in the tutor's or simulated learner's context or
readable through their tools; the live adapter must enforce this (V-5, D-2). Calibration
examples are not shown to the tutor. If a future version adds hold-out cases, they are
not shared with whoever drafts scenarios.

## 10. Open questions for the owner

- Approve the subject, scope and sources above, or name others.
- Should the evaluator judge "smallest useful hint" (E7) strictly, or only reject full
  solutions given as a first hint?
