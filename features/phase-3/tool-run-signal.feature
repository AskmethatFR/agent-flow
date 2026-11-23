# context: Phase 3 core snapshot, the tool-run signal per step and the unattached facts of the issue
# origin: #112
@feature:tool-run-signal
Feature: Core snapshot: a step says whether it ran a tool, and facts with no step are kept at issue level
  Core marks each step a test or mutation run was given for, whether or not its report yielded a fact, so a step that ran no tool can say so. A run the capture side could not attach arrives unattached: core lists its fact apart from the steps, keeps the latest 50 and counts the rest. Core attaches nothing itself.

  @scenario:S1
  Scenario: A step with a test or mutation run shows it ran a tool
    Given the plan has steps "s1" and "s2"
    And a vitest report for step "s1" with 5 tests of which 3 passed
    And a Stryker mutation report for step "s2" with 4 killed and 1 survived mutants
    When the snapshot is built
    Then step "s1" shows it ran a tool
    And step "s2" shows it ran a tool

  @scenario:S2
  Scenario: A step with no tool run shows it ran none
    Given the plan has steps "s1" and "s2"
    And a vitest report for step "s1" with 5 tests of which 3 passed
    When the snapshot is built
    Then step "s2" shows it ran no tool
    And step "s2" carries no verified fact

  @scenario:S3
  Scenario Outline: A run whose report was refused still counts as a run
    Given the plan has a step "s1"
    And a <kind> report for step "s1" <refusal>
    When the snapshot is built
    Then step "s1" shows it ran a tool
    And step "s1" carries no verified fact
    And the snapshot carries one <kind> report error

    Examples:
      | kind     | refusal                |
      | test     | that is not valid JSON |
      | test     | over the 1 MiB bound   |
      | mutation | that is not valid JSON |
      | mutation | over the 1 MiB bound   |

  @scenario:S4
  Scenario: An unattached fact shows at issue level, not on a step
    Given the plan has a step "s1"
    And an unattached vitest run with 5 tests of which 3 passed
    And an unattached Stryker run with 47 detected and 1 surviving mutants
    When the snapshot is built
    Then the snapshot lists the unattached facts "3 of 5 passed" from "vitest" then "97.91% mutation score, 1 surviving" from "stryker"
    And step "s1" carries no verified fact
    And step "s1" shows it ran no tool

  @scenario:S5
  Scenario Outline: Unattached facts are bounded, the latest kept and the rest counted
    Given the plan has a step "s1"
    And <runs> numbered unattached vitest runs
    When the snapshot is built
    Then the snapshot lists the unattached facts of runs <first> to <runs>, in input order
    And the snapshot counts <omitted> omitted unattached facts

    Examples:
      | runs | first | omitted |
      | 49   | 1     | 0       |
      | 50   | 1     | 0       |
      | 51   | 2     | 1       |
      | 60   | 11    | 10      |

  @scenario:S6
  Scenario: A snapshot with no run and no unattached entry is unchanged but for the defaults
    Given the plan has steps "s1" and "s2"
    And a decision is declared for step "s1"
    When the snapshot is built
    Then step "s1" shows it ran no tool
    And step "s2" shows it ran no tool
    And the snapshot lists no unattached fact
    And the snapshot counts 0 omitted unattached facts
    And step "s1" keeps its declared fact
    And the snapshot carries no error
