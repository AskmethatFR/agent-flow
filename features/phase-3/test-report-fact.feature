# context: Phase 3 core snapshot, a verified fact parsed from a test report (vitest JSON, cucumber-js JSON) and attached to its step
# origin: #110
@feature:test-report-fact
Feature: Core snapshot: a test report becomes a verified fact on its step
  Core reads a test report given as text and attaches one verified fact to the step it names, so the panel and the daemon read facts and compute nothing. A report that cannot be used never throws and never removes another fact.

  @scenario:S1
  Scenario: A vitest report yields a verified fact on its step
    Given the plan has a step "s1"
    And a vitest report for step "s1" with 5 tests of which 5 passed
    When the snapshot is built
    Then step "s1" carries a verified fact from source "vitest"
    And that verified fact reports the passed and total counts

  @scenario:S2
  Scenario: A cucumber-js JSON report yields a verified fact on its step
    Given the plan has a step "s1"
    And a cucumber-js JSON report for step "s1" with 4 scenarios of which 4 passed
    When the snapshot is built
    Then step "s1" carries a verified fact from source "cucumber-js"
    And that verified fact reports the passed and total counts

  @scenario:S3
  Scenario: The verified fact shows how many tests passed out of how many
    Given the plan has a step "s1"
    And a vitest report for step "s1" with 5 tests of which 3 passed
    When the snapshot is built
    Then the verified fact of step "s1" is labeled "3 of 5 passed"

  @scenario:S4
  Scenario: A report whose step is not in the plan adds an error and no fact
    Given the plan has a step "s1"
    And a vitest report, the first and only test report, for step "s9" with 5 tests of which 5 passed
    When the snapshot is built
    Then the snapshot reports test report 1 as not a step of plan.json
    And no step carries a verified fact

  @scenario:S5
  Scenario: A malformed report adds an error and leaves every other fact in place
    Given the plan has steps "s1" and "s2"
    And a decision is declared for step "s1"
    And a vitest report for step "s2" with 5 tests of which 5 passed
    And a malformed test report for step "s1"
    When the snapshot is built
    Then the snapshot carries an error for the malformed report
    And step "s1" keeps its declared fact and carries no verified fact
    And step "s2" keeps its verified fact

  @scenario:S6
  Scenario: A report over the size bound is refused whole and yields no fact
    Given the plan has a step "s1"
    And a vitest report for step "s1" larger than 1 MiB
    When the snapshot is built
    Then the snapshot carries a size error for the report
    And step "s1" carries no verified fact

  @scenario:S7
  Scenario: A vitest run that failed outside its tests is not shown as all passed
    Given the plan has a step "s1"
    And a vitest report for step "s1" with 5 tests of which 5 passed and 1 failed suite
    When the snapshot is built
    Then the verified fact of step "s1" is labeled "5 of 5 passed, run failed"
