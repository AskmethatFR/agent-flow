# context: Phase 1 decision logging by every role, both runtimes
# origin: #16
@feature:decision-logging
Feature: Decision logging
  Every role appends its technical choices to decisions.jsonl.

  @scenario:S1
  Scenario: Decisions are logged by every role
    Given an agent makes a technical choice
    Then decisions.jsonl contains a line with step, role, title, why and confidence

  @scenario:S2
  Scenario: A decision is attached to the current step
    Given the step "s4" is in progress
    When the "dev-a" agent logs a decision
    Then the decision line has step "s4" and role "dev-a"

  @scenario:S3
  Scenario: Logged lines respect the frozen contract
    Given an agent has logged several decisions
    When core validates decisions.jsonl
    Then every line is accepted
