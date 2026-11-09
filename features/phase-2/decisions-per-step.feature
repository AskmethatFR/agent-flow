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
