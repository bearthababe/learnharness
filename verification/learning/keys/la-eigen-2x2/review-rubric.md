# Council rubric for the linear-algebra tutor key

Draft rubric (round 1 may propose changes; it is frozen after round 1). Score each
criterion 0–10 and give an overall score 0–10 that is **not** a plain average: any
blocker caps the overall at 6.

| # | Criterion | What a 10 looks like |
| --- | --- | --- |
| K1 | Subject truth | Every mathematical claim is correct, scoped and machine-checked where numeric; no claim depends on an unstated convention. |
| K2 | Source provenance | Subject claims trace to named trusted references; teaching expectations trace to the cited LearnHarness policy files; nothing is invented or over-attributed. |
| K3 | Evaluability | A separate evaluator can decide pass / fail / uncertain for each expectation from the transcript alone; the boundary between them is clear. |
| K4 | Valid variation | Equivalent answers, methods, orders, notations and Socratic-vs-expository teaching all pass; no exact-transcript oracle. |
| K5 | Teaching-policy fidelity | Expectations judge each turn's purpose (probe, step, check, feedback, hint) per vision §4 and the prompts; they neither add nor drop policy. |
| K6 | Learner-evidence honesty | Single miss ≠ misconception; helped ≠ independent; visited ≠ understood; simulator deviations invalidate the run, not the tutor. |
| K7 | Calibration power | Good, bad and variant examples are realistic, unambiguous and together discriminate a lenient from a strict evaluator. |
| K8 | Fit to the bounded run | Fits ≤12 learner turns, ≤30 requests, ≤20 minutes and allowed tools; caps lead to incomplete, never pass. |
| K9 | Owner-approvability | Short and clear enough that the owner can approve it in one sitting; scope is tight; open questions are explicit. |
| K10 | Independence and leakage | Key, facts and calibration stay out of tutor and simulator context; the protection the live adapter needs is stated. |

**Truthfulness first:** a K1 error or an unsupported attribution (K2) is always a blocker.

## Comparison rounds

From round 2 you receive two versions, **A** and **B**, in random order. Score both on
every criterion, list what is better and worse in each, name any blockers, and vote
**promote B over A**, **promote A over B**, or **no difference**. Prefer the smaller,
clearer version when quality is equal. Do not ask for scope beyond §1 of the key.
