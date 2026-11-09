# context: Phase 2 panel step detail, decisions of the selected step
# origin: #20
@feature:decisions-per-step
Feature: Step detail
  Selecting a step shows only what happened during that step.

  @scenario:S1
  Scenario: Decisions are scoped to the selected step
    Given decisions exist for several steps
    When I select the step "Architecture"
    Then only decisions made during "Architecture" are listed

  @scenario:S2
  Scenario: A decision shows its reasoning
    Given a decision with title, why, rejected options and confidence
    When I select its step
    Then the decision shows its title, why, rejected options and confidence

  @scenario:S3
  Scenario: A step without decisions says so
    Given a step with no decision
    When I select it
    Then the step detail states that no decision was logged

  @scenario:S4
  Scenario: A step with more decisions than the cap shows the first ones and how many were left out
    Given a step with more decisions than the cap
    When I select it
    Then the step detail lists exactly the first decisions up to the cap, in file order
    And it shows one marker saying how many decisions were left out

  @scenario:S5
  Scenario: The cap applies to each step on its own
    Given a step with more decisions than the cap
    And another step with fewer decisions than the cap
    When I select the other step
    Then all of its decisions are listed and no marker is shown
