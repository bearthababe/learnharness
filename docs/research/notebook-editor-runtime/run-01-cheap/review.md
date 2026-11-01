# Correctness review

Reviewed against each learner instruction, original/resulting working, expected
action and unrelated-line checks. This is assistant review, not owner in-app
acceptance. Whitespace-equivalent source was accepted; mathematics was not
algebraically simplified to manufacture matches.

## Frozen cases — 17/17

- Denominator change and undo returned to the original expression.
- Selected sum was wrapped as a whole; the following denominator instruction
  correctly used conversational context.
- Two possible denominators produced a relevant clarification, then the flow
  equation alone changed when identified.
- Previous-line targeting followed the supplied cursor.
- Creation preserved an unfinished right-hand side and continued it only when
  explicitly requested.
- Adding a line preserved both `2 + 2 = 5` and broken fraction source unchanged.
- Correcting the previous edit and undoing that correction retained the prior
  requested result.
- Repeated source on two lines did not cause the earlier equation to change.
- Ambiguous “that” asked what to wrap; the follow-up correctly wrapped the whole
  first line. The question additionally asked where to put it, but did not guess
  or mutate working and the continuation was correct.
- Unit case, unrelated quantities and the intentionally wrong conversion were
  preserved while the requested numeric value changed.

## Added cases — 12/12 after two format retries

- Whole-line copy included both equations. A subsequent equation-two edit
  preserved equation one on the same line; no unnecessary clarification occurred.
- Historical whole-line copy preserved all original source. The first reply used
  `action: insert` rather than the required `action: edit` operations envelope.
  It was rejected without mutation, then corrected on the single allowed retry.
- Copying only equation two from a historical multi-equation line copied only it.
- Ambiguous history selection asked which of pressure/velocity was intended;
  naming velocity produced the correct line without rewriting either saved entry.
- A 100-line notebook retained incorrect and broken source while line fifty was
  edited, a new unfinished last line added, and only that addition undone.
- Retrieval from the eighth of ten entries returned `b=18`; the next turn changed
  only its variable to beta. The first retrieval reply used `action: replace`
  without the operations envelope, was rejected atomically, and succeeded on retry.
- A request for absent pressure history reported the missing entry and asked for
  clarification instead of inventing a line. Its question could more directly ask
  the learner to supply the missing entry, but the response preserved working and
  did not pretend the requested source existed.

## Conclusion

All 29 accepted actions and resulting states satisfy their instructions; no
unrelated line changed. The two initial format failures remain visible evidence,
not first-attempt successes. Keep strict validation and the single format retry.
The small trial supports the selected Cheap/Luna-medium setting for the next
integration slice; it does not establish general reliability or learning benefit.
