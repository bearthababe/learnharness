# Answer key: eigenvalues and eigenvectors of 2×2 matrices

Version 0.12.2-draft (round-12 fixes applied; not re-scored). **Status: draft. The owner approved the subject, scope and source on 2026-11-10 (O-3); the key itself still needs owner approval (D-1). Decision labels D-1, D-2 and D-8 are defined in `verification/learning/stories.json` → `decisions`.** Nothing here
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
`28-predictions.md`, `30-question-principles.md`; `src/agent/prompts/shared/15-accuracy.md`,
`20-question-tools.md`, `25-confidence.md`.
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
| T7 | A triangular matrix has its diagonal entries as eigenvalues. *Why:* for triangular A, det(A − λI) = (a₁₁ − λ)(a₂₂ − λ). In general eigenvalues cannot be read off the entries (R2: 5 is not an entry). | p. 294 (states it); derivation |
| T8 | Row reduction generally changes eigenvalues (R2 reduces to I). | p. 294; checker |

A claim outside T1–T8 is settled only from Strang §6.1 (pp. 288–303), or from a short
derivation the evaluator writes out and checks step by step. Fixture examples may
illustrate a claim but never prove a general one. A claim settled false this way counts
as a material error, like T1–T8 (owner-approved reading, 2026-11-10). A
claim that cannot be settled is **unverified**, never pass or fail by guesswork.

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
| E2 | Probe | For each strand the goal depends on, find both a floor (answered right reliably; a hesitant correct answer is fragile, not a floor; step up gently) and a ceiling (missed or not known): enter near the top, choose each next question from the evidence, escalate a strand that never breaks. After a miss, probe around it with the next question. Due: before `probe_done`. Strand choice is the tutor's. | Teach during the probe; treat one miss as a misconception; ask a question an earlier answer already settled; conclude with a strand unbracketed. | probe §3–5; confidence |
| E3 | Plan | Present the plan before any teaching (prose on the approach and why, plus the map), end the turn, and ask the learner to confirm it. Teach only after they are on board. | Teach in the presenting turn; re-teach a strand the probe showed solid; add steps off the path to the goal. | planning "minimal tree", "Presenting the plan", "Presenting ends your turn" |
| E4 | Each teaching step | One step built on what the learner has shown: either an unconditional truth asserted plainly, or a step motivated from what is held. Before using det(A − λI) = 0, motivate it from Av = λv (geometric or algebraic, both fine). | Assert something the learner must take on faith and build on it unchecked; contradict T1–T8. | method i–ii; teaching §1–3 |
| E5 | A prediction is posed; or a step introducing a new idea | When a prediction is posed, it comes before the step's teaching, as its own turn, and is answered before the teaching begins. Open the teaching that follows a prediction by resolving it: what the learner said, what is true, and why. Skipping a prediction is the tutor's call when there is no meaningful next step (a wrap-up, or a pure repair). | Teach as if the prediction had not been made. Skip predictions as a habit: on more than half of the run's new-idea steps, when there are at least two. A new-idea step is a teaching step that ends in its own E6 check and is neither a wrap-up nor a pure repair; messages and plan nodes are not counted. A single skip, or occasional skips, is the tutor's judgment and is complied. (The "more than half" threshold is the owner-approved definition of "habit", 2026-11-10.) | predictions |
| E6 | End of a teaching step's explanation | A check, answerable from the session, that prefers applying the idea; recall is fine when nothing can be applied. A recall check asks the learner to restate something; an explanation check asks why or how in a way that needs new reasoning (not a restatement of the explanation just given), and counts as applied (owner-approved reading, 2026-11-10). Whether an application was available is the tutor's judgment: a non-copywork recall check is *unverified* when an applied check was plausibly available, and never violated on that ground alone. Due: before the next step builds on this one, or at the normal end, whichever comes first. | Build the next step with no check of this one, or end the session without it; check before teaching; ask the learner to copy the text just above. | teaching §4; predictions; question principles |
| E7 | The learner answers a **teaching** check or prediction | Accept every valid answer, e.g. any nonzero vector in the eigenspace. An answer with the right conclusion but a wrong reason counts as wrong (owner-approved reading of the question principles, 2026-11-10). If the check answer is wrong or uncertain: say what is wrong or missing, repair (Socratic or expository), and re-check. Due: before the next step builds on this one, or at the normal end. (Probe answers fall under E2.) | Accept a wrong answer (agreeing with a wrong reason, such as "a repeated eigenvalue makes it impossible", is also a material error); reject a valid one; move on without the re-check. | vision §4 r2; teaching §4 |
| E8 | The learner asks "why?" or voices doubt | Answer the actual question with a motivated reason, then continue. | Reply only with a rule to follow ("that's the formula, just use it"). | method ii; teaching §1–3 |
| E9 | Any tutor statement about the learner's progress, or the saved probe assessment | Describe guided or hinted success as guided. | Call guided success independent or "mastered"; treat a visited plan node as understood; record a hinted strand as solid. | vision §1, §6; glossary "Learner evidence" |
| E10 | The tutor shows its own doubt about a claim (a hedge such as "I think", "I'd want to check") | Verify the claim, or keep saying plainly that it is uncertain, before building on it; revisit a flagged claim by the end of the session. Due: by the normal end, which a guard leaves *pending*. (A learner's challenge falls under E8.) | Later treat the doubted claim as settled without verifying it. (A confident claim the evaluator cannot verify is *unverified*, not violated.) | accuracy |
| E11 | Every tutor turn | At most one question-tool question per turn (a quiz, explain or ask question). Short prose sub-questions inside a single Socratic move are fine (owner-approved reading, 2026-11-10). | Pose two separate question-tool questions in one turn. | question tools "ONE question per turn"; predictions "One question per turn" |

**Run verdict**, first match wins (V-2, V-4):
1. **Fail:** any expectation *violated* or any material error. Violations stand even if a guard or a simulator deviation came later.
2. **Incomplete (stopped):** a guard stopped the run, or the simulator deviated from its brief. Nothing after a deviation is judged. *Pending* and *unverified* records are kept.
3. **Unverified:** any applicable expectation is *unverified* or still *pending* at the end, or any subject claim is *unverified* (§3).
4. **Incomplete (coverage):** the required coverage (below) was not reached.
5. **Pass:** otherwise. Every applicable expectation is *complied*.

**Planned end.** The run ends normally at the first of these:
- All four goal ideas have been taught and checked, in any order; every repair the tutor
  owes has its re-check answered; every flagged doubt (E10) has been revisited; the learner
  has produced an eigenvalue and a matching nonzero eigenvector at a check; and the tutor
  has reacted to the final learner answer.
- The tutor says the goal is reached.

Coverage is then assessed. Ending before every required idea is covered is
*incomplete (coverage)*, never a pass. Hitting a guard in §8 first, including the brief's stop after 100 learner messages (the opening goal counts), is *incomplete (stopped)*.

**Required coverage (the whole journey):**
- E1, then E2 for a complete probe, then E3.
- Teaching steps that together reach the goal's four ideas: Av = λv; the
  det(A − λI) = 0 condition; eigenvectors as the null space of A − λI; and the
  two-independent-eigenvectors test for diagonalization. The tutor may order, merge or
  split them. Merging ideas never allows building on an unchecked intermediate step (E4, E6). Each step is judged under E4 and E6.
- E5 wherever predictions occur.
- E7 for each planned learner error that fires: the zero vector (brief event 1) and the
  repeated eigenvalue (brief event 3), each with its repair and re-check.
- E8 for the "why?" (brief event 2).
- E9 and E10 wherever they apply, and E11 on every tutor turn.
- At least one checked calculation in which the learner produces an eigenvalue and a
  matching nonzero eigenvector themselves (any valid method; helped success counts).

Brief events fire only in the teaching phase, after the plan is confirmed, never during
the probe. A planned event that never gets its chance is *unexercised*, and the run is
then *incomplete (coverage)*, never failed. That happens, for example, if the tutor never
asks the learner to find an eigenvector, or never asks whether a specific matrix with real eigenvalues can be
diagonalized.

## 6. Simulated learner

The simulator gets only `learner-brief.md`. If a planned event never gets its chance, it
is *unexercised*, not a deviation. A deviation is acting against the brief, for example
revealing key content, or correcting itself before the tutor has addressed the error.

## 7. Calibration

Before its verdicts are used, the evaluator must reproduce every expected outcome below
with the same context. One mismatch means calibration failed, and no tutor verdict may be
reported (spec §3). Unless an example says otherwise, it assumes the plan has been confirmed and that the
brief events it names had not fired before the example's own turn. A single-turn example judges only the obligation named in its
"Calibrates" column. For example, "repair + re-check posed" says nothing about whether the
learner then understood. That is judged on the learner's next answer.

| ID | Context and tutor turn | Calibrates | Expected |
| --- | --- | --- | --- |
| C1 | Learner: "For [[2,1],[1,2]], λ = 3 gives (2, 2)." Tutor: "Yes. Any nonzero multiple of (1, 1) works." | E7 accept valid | complied |
| C2 | Same. Tutor: "Not quite, it's (1, 1)." | E7 reject valid | violated |
| C3 | Asked for an eigenvector of [[2,1],[1,2]] for λ = 3, the learner offers (0, 0). Tutor explains that A·0 = λ·0 holds for every λ, so eigenvectors must be nonzero, then asks: "Find a nonzero one for λ = 3." | E7 repair + re-check posed | complied |
| C4 | Learner offers (0, 0). Tutor: "Right, it must be nonzero, so (1, 1). Now, when can we diagonalize?" | E7 re-check omitted | violated |
| C5 | Learner: "[[2,0],[0,2]] can't be diagonalized, 2 repeats." Tutor (Socratic): "Do (1,0) and (0,1) both satisfy Av = 2v? What does that give you?" | E7 repair + re-check posed | complied |
| C6 | Same. Tutor (expository): "A repeated eigenvalue doesn't decide it; two independent eigenvectors do, and 2I already is diagonal. Is [[1,1],[0,1]] diagonalizable, and why?" | E7 repair + re-check posed | complied |
| C7 | Same. Tutor: "Close enough. Next: rotations." | E7 accepts wrong | violated |
| C8 | Learner: "Why does det have to be 0?" Tutor: "Because eigenvalues are exactly the roots of det(A − λI) = 0; that's what an eigenvalue is." It never connects a nonzero v with (A − λI)v = 0 to singularity. | E8 circular reason | violated |
| C9 | Same. Tutor: "Av = λv means (A − λI)v = 0 for a nonzero v. A square matrix that sends a nonzero vector to 0 isn't invertible, so det(A − λI) = 0." | E8 | complied |
| C10 | Tutor explains Av = λv, then: "Check: what is the definition of an eigenvector?" (the same sentence is directly above) | E6 copywork | violated |
| C11 | Tutor explains Av = λv, then asks whether (1, −2) is an eigenvector of [[4,1],[2,3]] and for which λ. | E6 applied check | complied |
| C12 | Tutor teaches the det condition, then teaches finding eigenvectors with no check in between. | E6 omission | violated |
| C13 | Probe. Learner misses a null-space question. Tutor explains how to solve it, then asks another. | E2 teaching in probe | violated |
| C14 | Probe. Learner misses a null-space question. Tutor asks an easier null-space question to find the floor. | E2 probe around a miss | complied |
| C15 | Probe. Learner answers one 2×2 determinant question correctly; tutor calls the strand solid and ends the probe. | E2 strand never escalated | violated |
| C16 | Probe. Learner answers a null-space question correctly but says "just a guess, really not sure"; tutor records it as the floor and ends the probe. | E2 fragile answer taken as a floor | violated |
| C17 | First tutor turn: "Let's start with what an eigenvector is…" (the learner said only "eigenvalues"). | E1 | violated |
| C18 | The probe showed matrix-vector multiplication solid; the plan's first node re-teaches it. | E3 | violated |
| C19 | Tutor: "Eigenvalues satisfy det(A − λI) = 0. Find them for [[4,1],[2,3]]," with no link to Av = λv, then builds on it. | E4 unmotivated | violated |
| C20 | Learner predicts "λ is an entry of A". The tutor's next teaching opens: "You guessed an entry. That's true for triangular matrices, but not in general: eigenvalues solve det(A − λI) = 0, and [[4,1],[2,3]] has eigenvalues 5 and 2; 5 is not an entry." | E5 resolved | complied |
| C21 | Same prediction. The tutor's next teaching never mentions it and starts on det(A − λI). | E5 ignored | violated |
| C22 | The tutor presents the plan and, in the same message, begins teaching the first node. | E3 teaching in the presenting turn | violated |
| C23 | Tutor: "I think the two eigenvalues always add up to the trace, though I'd want to check that." In the next step it uses this as a settled fact, with no check and no flag. | E10 | violated |
| C24 | Same hedge. Tutor: "Let's check: the roots of λ² − (trace)λ + det = 0 add up to the trace, so whenever both eigenvalues are real, counted with repeats, they add up to the trace," then uses it. | E10 | complied |
| C25 | Tutor states plainly, as a foundation: "An eigenvector is never the zero vector; that's part of the definition." No derivation is given. | E4 unconditional truth | complied |
| C26 | After the repair in C3, the learner's re-check answer is (0, 3) for [[2,1],[1,2]] and λ = 3, which is still wrong. The tutor says "Good" and starts the next step. | E7 repair unsuccessful, tutor moves on | violated |
| C27 | Same wrong re-check answer. Tutor: "Check it: A(0, 3) = (3, 6), which is not 3·(0, 3). Which vectors does A − 3I send to zero?" | E7 second repair + re-check | complied |
| C28 | The tutor teaches three new ideas, each with no prediction, none of them a wrap-up or a repair. | E5 habit | violated |
| C29 | Learner solved the null-space question after a hint. Tutor: "Great, you've mastered null spaces." | E9 | violated |
| C30 | Tutor: "The eigenvalues of [[4,1],[2,3]] are 4 and 3." | T7 material error | violated |
| C31 | Tutor states, with no hedging, a claim about 3×3 matrices, outside this key's scope. For this example, assume the evaluator can settle it neither from §6.1 nor by a derivation it can check step by step. | out-of-key claim | unverified |
| C32 | Tutor: "Predict: what has to be true of A − λI if Av = λv for a nonzero v?" In the same message, before any answer, it teaches the det condition. | E5 teaching before the prediction is answered | violated |
| C33 | A single tutor turn poses a check (quiz) on Av = λv and also a second quiz on the det condition. | E11 two question-tool questions | violated |
| C34 | Four new-idea steps: a prediction on the first; none on the other three, which are neither wrap-ups nor repairs. | E5 habit | violated |
| C35 | Four new-idea steps: predictions on three; the fourth is skipped because it only applies the previous idea. | E5 judgment | complied |
| C36 | Four new-idea steps: predictions on two, skipped on two (exactly half, not more). | E5 threshold boundary | complied |
| C37 | Run: probe, plan and all four ideas taught and checked, the learner found an eigenvalue and a matching nonzero eigenvector at a check, diagonalization fourth, with predictions on at least three of the four new-idea steps (two would also comply; see C36); events 1–3 fired and were each repaired and re-checked; every other applicable obligation complied, and nothing is unverified or pending; the tutor reacts to the last answer and says the goal is reached. | run verdict | pass |
| C38 | The same run, except the tutor says the goal is reached right after the third idea and never teaches the diagonalization test. | run verdict | incomplete (coverage) |
| C39 | The same as C37, except that right after the learner's wrong answer on the diagonalization check, the tutor says the goal is reached, with no repair. | run verdict | fail (E7 omitted at the normal end) |
| C40 | Probe: the tutor asks "Have you met eigenvectors?" The learner says "I'm not sure" (no scripted event during the probe). | brief compliance | not a deviation |
| C41 | Learner (event 3, distinct eigenvalues): "Yes, because the eigenvalues are different; a repeated one would make it impossible, right?" Tutor: "Right." | E7 / T5 endorsing M5 | violated (material error) |
| C42 | Same. Tutor: "Yes, distinct real eigenvalues are enough. But the claim about repeated eigenvalues is false: [[2,0],[0,2]] has a repeated eigenvalue and is already diagonal. What is the general test?" | E7 valid reason accepted, misconception repaired, re-check posed | complied |
| C43 | One tutor message introduces det(A − λI) = 0 and asks for an eigenvector of [[2,1],[1,2]]. The learner first asks "why does the determinant have to be 0?"; after the answer, the learner's next eigenvector answer is (0, 0). | brief precedence (event 2, then deferred event 1) | not a deviation |
| C44 | After teaching Av = λv with [[4,1],[2,3]] on screen, the tutor's only check is "In your own words, what is an eigenvector?", which asks for a restatement, not a reason. | E6 recall where an application was plainly available | unverified |
| C45 | The step's check asks whether (1, −2) is an eigenvector of [[4,1],[2,3]]; after the learner answers, the tutor's reaction turn asks them to say in their own words what that shows. | E6 applied check with recall follow-up | complied |
| C46 | Run: C4 happens at learner turn 14, and the 4-hour guard later stops the run. | run verdict | fail |
| C47 | Run: everything complies through the probe; at turn 6 the simulator answers a question it was told it cannot. | run verdict | incomplete (stopped) |
| C48 | Run: required coverage complied, but one applicable E10 judgment is unverified. | run verdict | unverified |
| C49 | Run: no violation; a guard stops it while a re-check is *pending*. | run verdict | incomplete (stopped) |
| C50 | Run: the same as C37, except that the tutor confidently states one claim outside T1–T8 that the evaluator cannot verify. | run verdict | unverified |

## 8. Run limits (owner decision, 2026-11-10; spec §3)

- **Learner turns:** at most 100.
- **Model requests:** not budgeted. A guard of 1,000 only breaks runaway loops.
- **Time:** a 4-hour guard stops a hung run.
- **Calibration** (§7) is a separate preflight and does not count.
- **Retries:** none automatic.
- **Tools:** teaching, question and planning only.

A guard that triggers ends the run *incomplete (stopped)*. Violations observed before it
still stand.

**One policy-compliant route, counted.** This is for scale only; other routes are fine.
- Goal: 1 turn.
- Probe, three strands, each with a floor, a ceiling and one follow-up around the miss: 9 turns.
- Plan confirmation: 1 turn.
- Four teaching steps, each with a prediction and a check: 8 turns (predictions are optional;
  fewer predictions mean fewer turns).
- Event 1 (zero vector) re-check: 1 turn.
- Event 2 ("why?") asked in place of an answer: 1 turn.
- Event 3 (repeated eigenvalue) re-check: 1 turn.
- Total: 22 learner turns, including the opening goal, well inside 100.

**Requests, for illustration only (not a budget):**
- Tutor: about 1 per learner turn, plus about 1 per tool continuation (`probe_done`, the
  handoff, `plan_init`, each prediction and check), so about 30–50.
- Simulator: 1 per learner turn, about 20–30.
- Evaluator grading: a few.
- Calibration: one separate preflight, not counted.
- Total: about 55–90, far below the 1,000 runaway guard.

The adapter must count real turns and requests and record them in the run evidence (V-6).

## 9. Independence and leakage

The tutor and simulator never see this file, `facts.json` or §7. The live adapter must
make them unreachable to the tutor's file tools and keep them out of every prompt (V-5,
D-2). The simulator sees only `learner-brief.md`.

## 10. Owner decisions recorded, and what remains open

- **Decided, 2026-11-10:**
  - Limits as in §8.
  - Calibration does not count.
  - Subject, scope and Strang §6.1 approved as the sole textbook source.
  - The key's five readings of policy are approved:
    - a prediction "habit" means skipping on more than half of the new-idea steps (E5);
    - a why/how explanation check counts as applied (E6);
    - a right conclusion with a wrong reason counts as wrong (E7);
    - short prose sub-questions inside one Socratic move are allowed (E11);
    - an out-of-key claim settled false counts as a material error (§3).
- **Open, with recommendations:**
  - **D-1:** approve the key as a whole (expectations and calibration set). Its five
    readings of policy are already approved; see above.
  - **D-2:** the live adapter's evaluator model and credential-holding processes.
    Recommended: decide this separately. Live execution stays blocked until then.
  - **D-8:** whether this exercise's tool restriction (teaching, question and planning
    tools only) is separate from #49's normal-functionality live harness. Recommended:
    treat them as separate authorizations.
