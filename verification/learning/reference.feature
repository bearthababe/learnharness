Feature: A bounded learning journey through the real application
  Scripted responses verify plumbing, not subject truth or teaching quality.

  @LJ-START
  Scenario: A goal leads to a successfully concluded prerequisite probe
    Given an owned synthetic learning application
    When the learner starts from a synthetic goal
    And the learner answers the prerequisite probe
    Then a successful probe handoff is saved

  @LJ-PROGRESS
  Scenario: A plan and an uncertain answer leave useful retry evidence
    Given a successfully probed synthetic conversation
    When the learner requests the teaching plan
    And the learner studies and expresses uncertainty
    And the learner retries after scripted feedback
    Then the plan and distinct learner attempts are saved

  @LJ-RETURN
  Scenario: Reopening preserves earlier work and permits continuation
    Given a synthetic conversation with a plan and retry evidence
    When the learner closes and reopens the conversation
    Then earlier work and the plan remain accessible
    When the learner continues the conversation
    Then the continuation is saved without losing earlier work
