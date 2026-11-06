Feature: Practice, drills and returning to an open problem through the real application
  Scripted responses verify activity mechanics and saved evidence, not hint quality or subject truth.

  @LJ-PRACTICE
  Scenario: A wrong answer gets feedback, the problem stays open, and helped success stays distinct
    Given an owned synthetic practice session
    When the learner asks to practise and a problem is posed
    Then the problem is shown without its committed solution
    When the learner submits incorrect thinking
    Then feedback arrives while the problem stays open and the solution stays hidden
    When the learner submits corrected thinking
    Then the problem concludes as helped success with the committed solution revealed
    And the learner's attempts are saved separately

  @LJ-DRILL
  Scenario: An optional drill keeps its separate identity through help and conclusion
    Given an owned synthetic drill session
    When the learner asks to drill and a problem is posed
    Then the problem is shown without its committed solution
    When the learner submits incorrect thinking
    Then feedback arrives while the problem stays open and the solution stays hidden
    When the learner submits corrected thinking
    Then the problem concludes as helped success with the committed solution revealed
    And the session remains a separate drill

  @LJ-PRACTICE-RESUME
  Scenario: Reopening practice returns to the same open problem and earlier attempt
    Given a practice session with an open problem and an earlier attempt
    When the learner closes and reopens the practice session
    Then the same open problem and earlier attempt remain available
    When the learner submits corrected thinking
    Then the problem concludes as helped success with the committed solution revealed
