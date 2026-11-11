# context: Phase 3 core snapshot, an issue-level verified CI fact keyed by head commit
# origin: #114
@feature:ci-fact
Feature: Core snapshot: the CI status of the head commit becomes an issue-level verified fact
  Core reads the CI status of the issue's head commit given as text and yields one verified fact for the issue, shown apart from the steps: a check covers a commit, not a step. A status that cannot be used never throws and never removes another fact.

  @scenario:S1
  Scenario: A passing CI status yields a verified fact from source "gh" for its head commit
    Given a CI status for head commit "abc123" whose checks all passed
    When the snapshot is built
    Then the snapshot carries a verified CI fact from source "gh" for head commit "abc123" in state "passed"

  @scenario:S2
  Scenario Outline: A failed check makes the state failed, and a running check makes it pending
    Given a CI status for head commit "abc123" with a check <check>
    When the snapshot is built
    Then the verified CI fact for head commit "abc123" is in state "<state>"

    Examples:
      | check                       | state   |
      | that concluded with failure | failed  |
      | that is still running       | pending |

  @scenario:S3
  Scenario: The CI fact is not attached to any step
    Given the plan has a step "s1"
    And a decision is declared for step "s1"
    And a CI status for head commit "abc123" whose checks all passed
    When the snapshot is built
    Then step "s1" carries the same facts as in a snapshot built without the CI status
    And the verified CI fact belongs to no step

  @scenario:S4
  Scenario: No CI status gives no CI fact and no error
    Given the plan has a step "s1"
    And no CI status is given
    When the snapshot is built
    Then the snapshot carries no CI fact
    And the snapshot carries no error

  @scenario:S5
  Scenario: An unusable status adds an error and no fact, and every other fact stays
    Given the plan has a step "s1"
    And a decision is declared for step "s1"
    And a CI status that is not valid JSON
    When the snapshot is built
    Then the snapshot carries one error for the CI status
    And the snapshot carries no CI fact
    And step "s1" keeps its declared fact

  @scenario:S6
  Scenario: A status over the size bound is refused whole and yields no fact
    Given a CI status larger than 1 MiB
    When the snapshot is built
    Then the snapshot carries a size error for the CI status
    And the snapshot carries no CI fact
