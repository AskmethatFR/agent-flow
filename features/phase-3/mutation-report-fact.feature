# context: Phase 3 core snapshot, a verified fact parsed from a Stryker mutation report and attached to its step
# origin: #111
@feature:mutation-report-fact
Feature: Core snapshot: a mutation report becomes a verified fact on its step
  Core reads a Stryker mutation report given as text and attaches one verified fact to the step it names, so the panel and the daemon read facts and compute nothing. The fact states the mutation score and never rules on it. A report that cannot be used never throws and never removes another fact.

  @scenario:S1
  Scenario: A Stryker report yields a verified fact on its step
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" with 4 killed and 1 survived mutants
    When the snapshot is built
    Then step "s1" carries one mutation fact from source "stryker"
    And that mutation fact has the origin "verified"

  @scenario:S2
  Scenario: The fact shows the score and the surviving mutants
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" with 8 killed, 1 timed out, 1 survived, 1 not covered and 2 ignored mutants
    When the snapshot is built
    Then the mutation fact of step "s1" is labeled "81.81% mutation score, 2 surviving"

  @scenario:S3
  Scenario: A run with a survivor never reads 100.00
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" with 20001 killed and 1 survived mutants
    When the snapshot is built
    Then the mutation fact of step "s1" is labeled "99.99% mutation score, 1 surviving"
    And that mutation fact never reads "100.00"

  @scenario:S4
  Scenario: Thresholds in the report do not change the fact
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" with 3 killed and 1 survived mutants and the thresholds high 90 and low 80
    When the snapshot is built
    Then the mutation fact of step "s1" is labeled "75.00% mutation score, 1 surviving"
    And that mutation fact carries neither a pass nor a fail word

  @scenario:S5
  Scenario: A report whose step is not in the plan adds an error and no fact
    Given the plan has a step "s1"
    And a Stryker mutation report, the first and only mutation report, for step "s9" with 3 killed and 1 survived mutants
    When the snapshot is built
    Then the snapshot reports mutation report 1 as not a step of plan.json
    And the snapshot errors never echo the step "s9"
    And no step carries a mutation fact

  @scenario:S6
  Scenario: A malformed report adds an error and leaves every other fact in place
    Given the plan has steps "s1" and "s2"
    And a decision is declared for step "s1"
    And a Stryker mutation report for step "s2" with 3 killed and 1 survived mutants
    And a malformed mutation report for step "s1"
    When the snapshot is built
    Then the snapshot carries an error for the malformed mutation report
    And step "s1" keeps its declared fact and carries no mutation fact
    And step "s2" keeps its mutation fact

  @scenario:S7
  Scenario: A report over the size bound is refused whole and yields no fact
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" larger than 1 MiB
    When the snapshot is built
    Then the snapshot carries a size error for the mutation report
    And step "s1" carries no mutation fact

  @scenario:S8
  Scenario: A report with no countable mutant adds an error and no fact
    Given the plan has a step "s1"
    And a Stryker mutation report for step "s1" with only 2 ignored mutants
    When the snapshot is built
    Then the snapshot carries an error for the mutation report with no mutant to score
    And step "s1" carries no mutation fact
