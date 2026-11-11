# context: Phase 3 core snapshot, caps on verified facts and reports
# origin: #112
@feature:verified-facts-caps
Feature: Core snapshot: verified facts and reports are bounded
  Core keeps the snapshot readable however many reports arrive. A step shows at most 50 verified facts, the latest ones, and says how many it left out. A build reads at most 200 reports of each kind, the latest ones, and says so when it refuses the earlier ones. The facts a step declares are never counted against these bounds.

  @scenario:S1
  Scenario: A step over the cap keeps its latest verified facts
    Given the plan has a step "s1"
    And a decision is declared for step "s1"
    And 60 numbered vitest reports for step "s1"
    When the snapshot is built
    Then step "s1" carries the verified facts of reports 11 to 60, in input order
    And the verified facts of step "s1" come after its declared fact

  @scenario:S2
  Scenario: The facts left out are counted on the step
    Given the plan has a step "s1"
    And 60 numbered vitest reports for step "s1"
    When the snapshot is built
    Then step "s1" counts 10 omitted facts

  @scenario:S3
  Scenario: The cap applies to each step on its own
    Given the plan has steps "s1" and "s2"
    And 60 numbered vitest reports for step "s1"
    And 3 numbered vitest reports for step "s2"
    When the snapshot is built
    Then step "s1" carries the verified facts of reports 11 to 60, in input order
    And step "s1" counts 10 omitted facts
    And step "s2" carries the verified facts of reports 1 to 3, in input order
    And step "s2" counts 0 omitted facts

  @scenario:S4
  Scenario Outline: At the cap nothing is left out, one over drops the earliest
    Given the plan has a step "s1"
    And <reports> numbered vitest reports for step "s1"
    When the snapshot is built
    Then step "s1" carries <carried> verified facts, those of the last <carried> reports
    And step "s1" counts <omitted> omitted facts

    Examples:
      | reports | carried | omitted |
      | 49      | 49      | 0       |
      | 50      | 50      | 0       |
      | 51      | 50      | 1       |

  @scenario:S5
  Scenario Outline: Reports over the build bound are not read
    Given the plan has a step "s1"
    And the first of <total> <kind> reports for step "s1" is malformed and the others are numbered
    When the snapshot is built
    Then the snapshot carries <bound> errors "too many reports, only the last 200 are read" for the <kind> reports
    And the snapshot carries <malformed> errors for a malformed <kind> report
    And no bound error echoes a step or a report text

    Examples:
      | kind     | total | bound | malformed |
      | test     | 200   | 0     | 1         |
      | test     | 201   | 1     | 0         |
      | mutation | 200   | 0     | 1         |
      | mutation | 201   | 1     | 0         |

  @scenario:S6
  Scenario: A snapshot with no reports is unchanged but for the omitted fact count
    Given the plan has steps "s1" and "s2"
    And a decision is declared for step "s1"
    When the snapshot is built
    Then step "s1" keeps its declared fact
    And step "s1" counts 0 omitted facts
    And step "s2" counts 0 omitted facts
    And the snapshot carries no error
