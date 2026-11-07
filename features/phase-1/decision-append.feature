# context: Phase 1 capture, decisions appender on .agent-flow/decisions.jsonl
# origin: #35
@feature:decision-append
Feature: Decision append
  Capture appends a decision to a worktree's decisions.jsonl, attached to the step in progress, never touching anything outside the worktree's .agent-flow directory.

  @scenario:S1
  Scenario: Appending a decision keeps the existing lines
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    When a valid decision is appended
    Then the decisions.jsonl has 4 lines
    And the first 3 lines are byte for byte unchanged

  @scenario:S2
  Scenario: An invalid decision is refused and nothing is written
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    And a decision that fails the decisions contract
    When the decision is appended
    Then the decision is refused with an error
    And the decisions.jsonl is unchanged

  @scenario:S3
  Scenario: No step in progress is refused and nothing is written
    Given a worktree whose plan has no step in progress
    And no step is given for the decision
    When a decision is appended
    Then the decision is refused with a message saying no step is in progress
    And the decisions.jsonl is unchanged

  @scenario:S4
  Scenario Outline: A target outside .agent-flow is refused and nothing is written
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    And the decisions target is redirected outside .agent-flow by "<redirection>"
    When a valid decision is appended
    Then the decision is refused
    And the outside content and the decisions.jsonl are unchanged

    Examples:
      | redirection                                    |
      | a worktree path going through ..               |
      | .agent-flow symlinked to an outside folder     |
      | decisions.jsonl symlinked to an outside file   |

  @scenario:S5
  Scenario: A decision naming the step in progress is appended
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    When a valid decision for step "s1" is appended
    Then the decisions.jsonl has 4 lines

  @scenario:S6
  Scenario: A decision naming another step is refused and nothing is written
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    When a valid decision for step "s2" is appended
    Then the decision is refused with an error on the step field
    And the decisions.jsonl is unchanged

  @scenario:S7
  Scenario: A decision naming a step while none is in progress is refused and nothing is written
    Given a worktree whose plan has no step in progress
    When a valid decision for step "s1" is appended
    Then the decision is refused with an error on the step field
    And the decisions.jsonl is unchanged

  @scenario:S8
  Scenario: A decision without a step is filed under the step in progress
    Given a worktree whose decisions.jsonl has 3 lines
    And the plan has step "s1" in progress
    And no step is given for the decision
    When a decision is appended
    Then the decisions.jsonl has 4 lines
    And the last line is filed under step "s1"
