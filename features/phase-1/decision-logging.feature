Feature: Decision logging
  Every role appends its technical choices to decisions.jsonl.

  Scenario: Decisions are logged by every role
    Given an agent makes a technical choice
    Then decisions.jsonl contains a line with step, role, title, why and confidence

  Scenario: A decision is attached to the current step
    Given the step "s4" is in progress
    When the "dev-a" agent logs a decision
    Then the decision line has step "s4" and role "dev-a"

  Scenario: Logged lines respect the frozen contract
    Given an agent has logged several decisions
    When core validates decisions.jsonl
    Then every line is accepted
