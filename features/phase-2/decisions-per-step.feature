Feature: Step detail
  Selecting a step shows only what happened during that step.

  Scenario: Decisions are scoped to the selected step
    Given decisions exist for several steps
    When I select the step "Architecture"
    Then only decisions made during "Architecture" are listed

  Scenario: A decision shows its reasoning
    Given a decision with title, why, rejected options and confidence
    When I select its step
    Then the decision shows its title, why, rejected options and confidence

  Scenario: A step without decisions says so
    Given a step with no decision
    When I select it
    Then the step detail states that no decision was logged
