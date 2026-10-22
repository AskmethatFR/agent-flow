Feature: Plan rail with time spent
  The plan rail shows every step with the time spent on it.

  Scenario: Time spent is visible per step
    Given a step started 38 minutes ago and is still in progress
    When I open the panel
    Then the step shows "38 min" and is marked as current

  Scenario: A finished step shows its total duration
    Given a step started at 10:00 and ended at 11:15
    When I open the panel
    Then the step shows "1 h 15 min" and is marked as done

  Scenario: A step not started shows no time
    Given a step with status "todo"
    When I open the panel
    Then the step shows no time spent
