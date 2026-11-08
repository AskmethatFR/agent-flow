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

  # origin: #79
  @scenario:S4
  Scenario Outline: OpenCode refuses to start the rule set when AGENT_FLOW_HOME is unset
    Given OpenCode v2 has AGENT_FLOW_HOME <state>
    When OpenCode v2 starts with the shim
    Then stderr has one line naming "AGENT_FLOW_HOME"
    And the decision-logging rule is not loaded
    And the stderr line does not echo the value of AGENT_FLOW_HOME

    Examples:
      | state                             |
      | unset                             |
      | empty                             |
      | naming another checkout           |
      | naming a path that does not exist |

  # origin: #79
  @scenario:S5
  Scenario Outline: OpenCode starts the rule set when AGENT_FLOW_HOME names this checkout
    Given OpenCode v2 has AGENT_FLOW_HOME naming this checkout <reference>
    When OpenCode v2 starts with the shim
    Then the decision-logging rule is loaded
    And the shim lists each rule file once
    And stderr is empty

    Examples:
      | reference         |
      | exactly           |
      | through a symlink |

  # origin: #89
  @scenario:S6
  Scenario: Roles working in parallel each log under their own step
    Given the steps "s1" of role "dev-b" and "s2" of role "qa" are in progress, "s2" started last
    When the "dev-b" and "qa" agents each log a decision
    Then the decision line of role "dev-b" has step "s1"
    And the decision line of role "qa" has step "s2"

  # origin: #94
  @scenario:S7
  Scenario: A reviewing role logs its verdict with its reason
    Given the step "s2" of role "qa" is in progress
    And the rule asks QA, Security or Dev B for its verdict even without a choice between options
    When the "qa" agent logs its verdict "approve" with the reason "The run respected every rule"
    Then the decision line of role "qa" says the verdict "approve" with the reason "The run respected every rule"
    And the decision line of role "qa" has step "s2"
